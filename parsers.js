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

module.exports = {
  parsePdfMenu,
  parseSpojovnaMenu,
  parseVolhaMenu,
  parseZatisiMenu,
  parseRangoliMenu,
};
