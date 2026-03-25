const axios = require("axios");
const cheerio = require("cheerio");
const pdf = require("pdf-parse");

async function parsePdfMenu(url) {
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data);
    const data = await pdf(buffer);

    const lines = data.text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const items = [];
    const itemRegex =
      /^(?:Menu\s+[A-Z]\d:|Polévka:|Večeře\s*:)\s*(.*?)(?:\s+\(.*\))?$/i;

    const daysCzech = [
      "Neděle",
      "Pondělí",
      "Úterý",
      "Středa",
      "Čtvrtek",
      "Pátek",
      "Sobota",
    ];
    const todayCzech = daysCzech[new Date().getDay()];
    let currentParsingDay = null;

    for (const line of lines) {
      const dayMatch = line.match(
        /^\s*(Pondělí|Úterý|Středa|Čtvrtek|Pátek|Sobota|Neděle)\s*:/i
      );
      if (dayMatch) {
        currentParsingDay = dayMatch[1];
        // The soup is often on the same line as the day header
        // e.g. "Středa:     Polévka:  Vegetariánský boršč"
        const soupMatch = line.match(/Polévka:\s*(.*?)(?:\s+\(.*\))?$/i);
        if (soupMatch && currentParsingDay === todayCzech) {
          const soupName = soupMatch[1].split(" (")[0].trim();
          if (soupName && soupName.length > 2) {
            items.push({ name: `Polévka: ${soupName}`, price: "N/A" });
          }
        }
        continue;
      }

      if (currentParsingDay !== todayCzech) {
        continue;
      }

      const itemMatch = line.match(itemRegex);
      if (itemMatch) {
        let name = itemMatch[1].trim();
        name = name.split(" (")[0].trim();
        const price = "N/A";

        if (name && name.length > 3 && !items.some((item) => item.name === name)) {
          items.push({ name, price });
        }
      }
    }

    return { items };
  } catch (error) {
    console.error("Error parsing PDF:", error);
    return { items: [], error: `Failed to parse PDF menu. ${error.message}` };
  }
}

async function parseSpojovnaMenu(url) {
  try {
    const { data: html } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });
    const $ = cheerio.load(html);

    const items = [];
    const dailyMenuSelector = "#content > div > div > div > div > div.visible";
    const dailyMenuContainer = $(dailyMenuSelector).first();

    if (!dailyMenuContainer || dailyMenuContainer.length === 0) {
      return {
        items: [],
        error: "Could not find the daily menu container element (div.visible).",
      };
    }

    dailyMenuContainer.find("p, div, li, h4, span, td, tr").each((i, el) => {
      let text = $(el).text().replace(/\s\s+/g, " ").trim();

      if (!text.includes("Kč") || text.length < 6 || text.length > 300) {
        return;
      }

      const itemMatch = text.match(
        /^(\d+g\s+)?(.*?)(?:\s*\(.*\))?\s*(\d{2,4})\s*Kč$/i
      );

      if (itemMatch) {
        let name = itemMatch[2].trim();
        const price = itemMatch[3] + " Kč";
        name = name.replace(/[.,\s-]+$/, "").trim();

        if (name.length > 3 && name !== name.toUpperCase()) {
          if (!items.some((item) => item.name === name && item.price === price)) {
            items.push({ name, price });
          }
        }
      }
    });

    if (items.length === 0) {
      return {
        items: [],
        error: "Found daily menu container, but failed to extract items.",
      };
    }

    return { items };
  } catch (error) {
    return {
      error: `Failed to fetch or parse Spojovna menu. ${error.message}`,
      items: [],
    };
  }
}

async function parseVolhaMenu(url) {
  try {
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);

    let pdfUrl = null;
    const targetText = "jídelní lístek zde";

    $("a").each((i, el) => {
      const link = $(el);
      const linkTextContent = link.text().trim().toLowerCase();
      const strongTextContent = link.find("strong").text().trim().toLowerCase();
      const spanTextContent = link.find("span").text().trim().toLowerCase();

      if (
        linkTextContent === targetText ||
        strongTextContent === targetText ||
        spanTextContent === targetText
      ) {
        const href = link.attr("href");
        if (href && href.toLowerCase().includes(".pdf")) {
          pdfUrl = href;
          return false;
        }
      }
    });

    if (pdfUrl) {
      if (!pdfUrl.startsWith("http")) {
        const urlObject = new URL(url);
        pdfUrl = new URL(pdfUrl, urlObject.origin).href;
      }
      const pdfResult = await parsePdfMenu(pdfUrl);
      return { items: pdfResult.items, error: pdfResult.error };
    } else {
      return { items: [], error: "Could not find PDF menu link on Volha page." };
    }
  } catch (error) {
    console.error("Error fetching or searching Volha page:", error);
    return { items: [], error: `Failed to fetch or search Volha page. ${error.message}` };
  }
}

async function parseZatisiMenu(url) {
  try {
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);

    const items = [];
    const addedItems = new Set();

    const menuContainer = $("section.specialni-listek");
    if (menuContainer.length === 0) {
      return {
        items: [],
        error: "Main menu container (section.specialni-listek) not found.",
      };
    }

    menuContainer.find("div.listek-sekce").each((i, sekceEl) => {
      const section = $(sekceEl);

      section.find("div.listek-polozka").each((j, polozkaEl) => {
        const itemElement = $(polozkaEl);

        const textElement = itemElement.find("div.listek-text");
        const priceElement = itemElement
          .children("span:not(.listek-mnozstvi)")
          .first();
        const quantityElement = itemElement.find("span.listek-mnozstvi");

        let itemName = "";
        let itemPrice = "";
        let itemQuantity = "";

        if (quantityElement.length > 0) {
          itemQuantity = quantityElement.text().trim();
        }

        if (textElement.length > 0) {
          itemName = textElement
            .contents()
            .map(function () {
              return $(this).text().trim();
            })
            .get()
            .join(" ")
            .replace(/\s\s+/g, " ")
            .trim();
        }

        if (priceElement.length > 0) {
          itemPrice = priceElement.text().trim();
        }

        let fullName = itemName;
        if (itemQuantity) {
          fullName = `${itemQuantity} ${itemName}`.trim();
        }

        if (fullName && itemPrice) {
          const signature = `${fullName}|${itemPrice}`;
          if (!addedItems.has(signature)) {
            items.push({ name: fullName, price: itemPrice });
            addedItems.add(signature);
          }
        }
      });
    });

    return { items };
  } catch (error) {
    return {
      error: `Failed to parse Zatisi menu. ${error.message}`,
      items: [],
    };
  }
}

async function parseRangoliMenu(url) {
  try {
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);
    const items = [];
    let buffetPrice = null;

    const priceMatch = html.match(/(\d{2,4}),-/);
    if (priceMatch) {
      buffetPrice = `${priceMatch[1]} Kč`;
    }

    const menuSection = $("#daily-menu").length > 0 ? $("#daily-menu") : $("body");

    const skipPatterns = /otevírací doba|pracovní dny|reservation|objednávk|kontakt|adresa|telefon|copyright|^\d+[,.]?-?$/i;

    menuSection.find("p, li, h3, h4, h5, td, span").each((i, el) => {
      const text = $(el).clone().children().remove().end().text().trim();

      if (
        text.length > 3 &&
        text.length < 120 &&
        !skipPatterns.test(text) &&
        !text.includes("buffet") &&
        !text.match(/^\d+,-$/) &&
        !items.some((item) => item.name === text)
      ) {
        if (/^[A-ZÀ-Ž]/.test(text) && /[a-zA-ZÀ-ž]{3,}/.test(text)) {
          items.push({ name: text });
        }
      }
    });

    if (items.length > 0) {
      items.push({
        name: "Denní Buffet / Daily Buffet",
        price: buffetPrice || "N/A",
        description:
          "Výše uvedené položky jsou součástí bufetu. / Above items are part of the buffet.",
      });
    } else {
      items.push({
        name: "Denní Buffet / Daily Buffet",
        price: buffetPrice || "N/A",
        description:
          "Pro aktuální nabídku prosím navštivte webovou stránku restaurace. / For current menu items, please visit the restaurant's website.",
      });
    }

    return { items };
  } catch (error) {
    return {
      error: `Failed to parse Rangoli menu. ${error.message}`,
      items: [],
    };
  }
}

// --- Helper: get today's Czech day name ---
function getTodayCzechDay() {
  const days = ["Neděle", "Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota"];
  return days[new Date().getDay()];
}

// --- Helper: extract items from text blocks with "price Kč" pattern ---
function extractItemsFromText(text) {
  const items = [];
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  for (let i = 0; i < lines.length; i++) {
    const priceMatch = lines[i].match(/^(\d{2,4})\s*(?:Kč|,-)\s*$/);
    if (priceMatch && i > 0) {
      // Previous line is the dish name
      let name = lines[i - 1].replace(/\s*\([\d,.\s]+\)\s*$/, "").replace(/\s*\|[\d,.\s]+\|\s*$/, "").trim();
      if (name.length > 3) {
        items.push({ name, price: `${priceMatch[1]} Kč` });
      }
    } else {
      // Inline price: "Dish name 189 Kč" or "Dish name 189,- Kč"
      const inlineMatch = lines[i].match(/^(.+?)\s+(\d{2,4})\s*(?:Kč|,-\s*Kč|,-)\s*$/);
      if (inlineMatch) {
        let name = inlineMatch[1].replace(/\s*\([\d,.\s]+\)\s*$/, "").replace(/\s*\|[\d,.\s]+\|\s*$/, "").trim();
        if (name.length > 3) {
          items.push({ name, price: `${inlineMatch[2]} Kč` });
        }
      }
    }
  }
  return items;
}

async function parseLokalMenu(url) {
  try {
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);
    const items = [];

    // Page has multiple Lokál branches — find "Lokál U Zavadilů" section
    let targetBox = null;
    $(".boxx.item").each((i, el) => {
      const logo = $(el).find('img[alt*="Zavadil"]');
      if (logo.length > 0) {
        targetBox = $(el);
        return false;
      }
    });

    if (targetBox) {
      targetBox.find("table tr").each((i, tr) => {
        const cells = $(tr).find("td");
        if (cells.length >= 2) {
          const name = $(cells[0]).text().replace(/\u00a0/g, " ").trim();
          const priceText = $(cells[1]).text().replace(/\u00a0/g, " ").trim();
          const priceMatch = priceText.match(/(\d{2,4})\s*Kč/);
          if (name.length > 3 && priceMatch) {
            items.push({ name, price: `${priceMatch[1]} Kč` });
          }
        }
      });
    }

    return { items };
  } catch (error) {
    return { items: [], error: `Failed to parse Lokál menu. ${error.message}` };
  }
}

async function parseTakUrciteMenu(url) {
  try {
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);
    const items = [];
    const todayLower = getTodayCzechDay().toLowerCase();

    // Menu is structured with h3 day headers followed by items with prices
    let inToday = false;
    const allText = $("body").text();
    const lines = allText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

    for (const line of lines) {
      const dayMatch = line.match(/^(pondělí|úterý|středa|čtvrtek|pátek|sobota|neděle)/i);
      if (dayMatch) {
        inToday = dayMatch[1].toLowerCase() === todayLower;
        continue;
      }
      if (!inToday) continue;

      const priceMatch = line.match(/^(\d{2,4})\s*Kč\s*$/);
      if (priceMatch && items.length > 0) {
        // Assign price to last item if it has no price
        const last = items[items.length - 1];
        if (last.price === "N/A") {
          last.price = `${priceMatch[1]} Kč`;
        }
        continue;
      }

      const inlineMatch = line.match(/^(.+?)\s+(\d{2,4})\s*Kč\s*$/);
      if (inlineMatch) {
        const name = inlineMatch[1].replace(/\s*\([\d,.\s]+\)\s*$/, "").trim();
        if (name.length > 3) {
          items.push({ name, price: `${inlineMatch[2]} Kč` });
        }
        continue;
      }

      // Line without price — could be a dish name, price on next line
      if (line.length > 3 && line.length < 150 && !/^\d+$/.test(line) && !/^(pondělí|úterý|středa|čtvrtek|pátek|sobota|neděle)/i.test(line)) {
        const name = line.replace(/\s*\([\d,.\s]+\)\s*$/, "").trim();
        if (name.length > 3) {
          items.push({ name, price: "N/A" });
        }
      }
    }

    // Remove items without prices that weren't matched
    const finalItems = items.filter((it) => it.price !== "N/A" || items.length <= 2);
    return { items: finalItems.length > 0 ? finalItems : items };
  } catch (error) {
    return { items: [], error: `Failed to parse Tak Určitě menu. ${error.message}` };
  }
}

async function parseKolkovnaMenu(url) {
  try {
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);
    const items = [];
    const today = new Date();
    const dayNum = today.getDate();
    const monthNum = today.getMonth() + 1;

    // Kolkovna has tabs per day, content contains date like "25.03.2026"
    const todayStr = `${dayNum}.`;
    const todayStrFull = `${String(dayNum).padStart(2, "0")}.${String(monthNum).padStart(2, "0")}`;

    const allText = $("body").text();
    const lines = allText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

    let inToday = false;
    for (const line of lines) {
      // Check for day header containing today's date
      if (line.includes(todayStrFull) || line.match(new RegExp(`${getTodayCzechDay()}`, "i"))) {
        if (line.includes(todayStrFull)) inToday = true;
        continue;
      }
      // Next day header stops today's section
      if (inToday && /^(pondělí|úterý|středa|čtvrtek|pátek|sobota|neděle)\s/i.test(line)) {
        break;
      }
      if (!inToday) continue;

      // Extract items: "Dish description 150g |1,3,7| 199 CZK"
      const match = line.match(/^(.+?)\s+(\d{2,4})\s*(?:CZK|Kč)\s*$/i);
      if (match) {
        const name = match[1].replace(/\s*\|[\d,.\s]+\|\s*$/, "").replace(/\s*\d+\s*g\s*$/, "").trim();
        if (name.length > 3) {
          items.push({ name, price: `${match[2]} Kč` });
        }
      }
    }

    return { items };
  } catch (error) {
    return { items: [], error: `Failed to parse Kolkovna menu. ${error.message}` };
  }
}

async function parseVeMlyneMenu(url) {
  try {
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);
    const items = [];
    const todayLower = getTodayCzechDay().toLowerCase();

    const allText = $("body").text();
    const lines = allText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

    let inToday = false;
    for (const line of lines) {
      const dayMatch = line.match(/^(pondělí|úterý|středa|čtvrtek|pátek|sobota|neděle)\s/i);
      if (dayMatch) {
        inToday = dayMatch[1].toLowerCase() === todayLower;
        continue;
      }
      if (!inToday) continue;

      // Price pattern: "199,-" or "49,-"
      const match = line.match(/^(.+?)\s+(\d{2,4}),-\s*$/);
      if (match) {
        const name = match[1].replace(/\s*\([\d,.\s]+\)\s*$/, "").trim();
        if (name.length > 3) {
          items.push({ name, price: `${match[2]} Kč` });
        }
        continue;
      }

      // Standalone price on next line
      const priceOnly = line.match(/^(\d{2,4}),-\s*$/);
      if (priceOnly && items.length > 0 && items[items.length - 1].price === "N/A") {
        items[items.length - 1].price = `${priceOnly[1]} Kč`;
        continue;
      }

      // Dish name without price
      if (line.length > 3 && line.length < 150 && !/^\d/.test(line) && !/^(polévka|hlavní|dezert|salát)/i.test(line)) {
        items.push({ name: line.replace(/\s*\([\d,.\s]+\)\s*$/, "").trim(), price: "N/A" });
      }
    }

    return { items: items.filter((it) => it.price !== "N/A") };
  } catch (error) {
    return { items: [], error: `Failed to parse Ve Mlýně menu. ${error.message}` };
  }
}

async function parseDiCarloMenu(url) {
  try {
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);
    const items = [];

    // Di Carlo: price is in a <span> sibling, name is first child text of parent
    $("span").each((i, el) => {
      const text = $(el).text().trim();
      const priceMatch = text.match(/^(\d{2,4})\s*Kč$/);
      if (priceMatch) {
        const parent = $(el).parent();
        const children = parent.children();
        const name = $(children.first()).text().replace(/\u00a0/g, " ").trim();
        if (name.length > 3 && !/^\d/.test(name)) {
          items.push({ name, price: `${priceMatch[1]} Kč` });
        }
      }
    });

    return { items };
  } catch (error) {
    return { items: [], error: `Failed to parse Di Carlo menu. ${error.message}` };
  }
}

async function parseXlRestaurantMenu(url) {
  try {
    const { data: html } = await axios.get(url);
    const items = [];

    // XL Restaurant uses Next.js with JSON in __NEXT_DATA__ script
    const jsonMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[1]);
      const menu = data?.props?.pageProps?.menu || [];

      // Find "Polední nabídka" category
      const categories = data?.props?.pageProps?.categories || [];
      const lunchCat = categories.find((c) => /polední/i.test(c.name));

      const lunchItems = lunchCat
        ? menu.filter((item) => item.category === lunchCat._id)
        : menu.filter((item) => /polední/i.test(item.categoryName || ""));

      // If we found lunch items specifically, use those; otherwise grab soups + first items
      const targetItems = lunchItems.length > 0 ? lunchItems : menu.slice(0, 10);

      targetItems.forEach((item) => {
        if (item.name && item.price) {
          items.push({
            name: item.name,
            price: `${Math.round(item.price / 100)} Kč`,
            description: item.description || undefined,
          });
        }
      });
    }

    // Fallback: parse HTML text
    if (items.length === 0) {
      const $ = cheerio.load(html);
      const allText = $("body").text();
      items.push(...extractItemsFromText(allText));
    }

    return { items };
  } catch (error) {
    return { items: [], error: `Failed to parse XL Restaurant menu. ${error.message}` };
  }
}

async function parseChapadloMenu(url) {
  try {
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);
    const items = [];

    // Chapadlo concatenates everything — split on price pattern to extract items
    const allText = $("body").text().replace(/\u00a0/g, " ");

    // Find today's menu section — starts with today's date pattern
    const today = new Date();
    const dayNum = today.getDate();
    const monthNum = today.getMonth() + 1;
    const todayPattern = `${dayNum}.${monthNum}.`;
    const todayLower = getTodayCzechDay().toLowerCase();

    // Extract section between today's date and the next section
    const todayIdx = allText.toLowerCase().indexOf(todayLower);
    if (todayIdx === -1) return { items };

    let section = allText.substring(todayIdx, todayIdx + 2000);
    // Cut at next day or non-menu section
    const nextDayMatch = section.match(/(pondělí|úterý|středa|čtvrtek|pátek|sobota|neděle)\s+\d+\.\d+\.\d{4}/gi);
    if (nextDayMatch && nextDayMatch.length > 1) {
      const secondIdx = section.indexOf(nextDayMatch[1]);
      if (secondIdx > 0) section = section.substring(0, secondIdx);
    }

    // Extract all "name...(\d) XX Kč" patterns from concatenated text
    const regex = /([A-ZÀ-Ž][^()]*?)(?:\s*\([^)]*\))?\s*(\d{2,4})\s*Kč/g;
    let match;
    while ((match = regex.exec(section)) !== null) {
      let name = match[1].trim().replace(/^\d+\.\s*/, "");
      if (name.length > 5 && name.length < 150 && !items.some((it) => it.name === name)) {
        items.push({ name, price: `${match[2]} Kč` });
      }
    }

    return { items };
  } catch (error) {
    return { items: [], error: `Failed to parse Chapadlo menu. ${error.message}` };
  }
}

async function parseMichelskaMenu(url) {
  try {
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);
    const items = [];

    // Michelská Pivnice: date header then items with "XXX,- Kč" prices
    const allText = $("body").text();
    const lines = allText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

    const today = new Date();
    const dayNum = today.getDate();
    const monthNum = today.getMonth() + 1;
    const todayStr = `${dayNum}. ${String(monthNum).padStart(2, "0")}`;
    const todayStr2 = `${dayNum}.${String(monthNum).padStart(2, "0")}`;
    const todayLower = getTodayCzechDay().toLowerCase();

    let inToday = false;
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.includes(todayLower) || line.includes(todayStr) || line.includes(todayStr2)) {
        inToday = true;
        continue;
      }
      // Stop at next day or section
      if (inToday && /^(pondělí|úterý|středa|čtvrtek|pátek|sobota|neděle)\s/i.test(line)) {
        break;
      }
      if (inToday && /jídelní lístek|stálá nabídka|nápojový/i.test(line)) {
        break;
      }
      if (!inToday) continue;

      // Price: "209,- Kč" or "59,- Kč"
      const match = line.match(/^(.+?)\s+(\d{2,4}),-\s*(?:Kč)?\s*$/);
      if (match) {
        const name = match[1].replace(/\s*\([\d,.\s]+\)\s*$/, "").trim();
        if (name.length > 3 && !items.some((it) => it.name === name)) {
          items.push({ name, price: `${match[2]} Kč` });
        }
      }
    }

    return { items };
  } catch (error) {
    return { items: [], error: `Failed to parse Michelská Pivnice menu. ${error.message}` };
  }
}

module.exports = {
  parsePdfMenu,
  parseSpojovnaMenu,
  parseVolhaMenu,
  parseZatisiMenu,
  parseRangoliMenu,
  parseLokalMenu,
  parseTakUrciteMenu,
  parseKolkovnaMenu,
  parseVeMlyneMenu,
  parseDiCarloMenu,
  parseXlRestaurantMenu,
  parseChapadloMenu,
  parseMichelskaMenu,
};
