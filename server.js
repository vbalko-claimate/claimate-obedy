const express = require("express");
const axios = require("axios"); // For fetching HTML
const cheerio = require("cheerio"); // For parsing HTML
const pdf = require("pdf-parse"); // For parsing PDF
const fetch = require("node-fetch"); // For fetching PDF buffer
const cors = require("cors"); // To allow frontend requests
const puppeteer = require("puppeteer"); // Add Puppeteer
const path = require("path"); // To serve static files like index.html
const { execSync } = require("child_process"); // To execute Git commands

const app = express();
const PORT = process.env.PORT || 3000; // Use environment port or 3000

// Enable CORS for all origins (for development)
// For production, configure specific origins: app.use(cors({ origin: 'YOUR_FRONTEND_URL' }));
app.use(cors());

// --- Helper function to fetch and parse PDF ---
async function parsePdfMenu(url) {
  try {
    console.log(`Fetching PDF from: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.statusText}`);
    }
    const buffer = await response.buffer();
    console.log("PDF buffer received, parsing...");
    const data = await pdf(buffer);
    console.log("PDF parsed successfully.");

    // Improved PDF parsing logic
    const lines = data.text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // --- Add PDF Text Logging ---
    // console.log("\nDEBUG - PDF Parser: Raw text lines (first 20):\n");
    // console.log(lines.slice(0, 20).join("\n"));
    // console.log("\nDEBUG - PDF Parser: End of raw text sample\n");
    // --- End Logging ---

    const items = [];
    // --- Remove previous parsing logic based on finding price ---
    // let currentItem = null;
    // for (const line of lines) {
    //   const priceMatch = line.match(/(\d+)\s*(?:Kč|,-)/);
    //   if (priceMatch) { ... }
    // }
    // if (currentItem) { items.push(currentItem); }
    // --- End Remove ---

    // --- New Parsing Logic for Volha PDF (No Prices) ---
    // console.log("DEBUG - PDF Parser: Applying Volha-specific parsing logic...");
    const itemRegex =
      /^(?:Menu\s+[A-Z]\d:|Polévka:|Večeře\s*:)\s*(.*?)(?:\s+\(.*\))?$/i;

    // --- Get today's day in Czech ---
    const daysCzech = [
      "Neděle",
      "Pondělí",
      "Úterý",
      "Středa",
      "Čtvrtek",
      "Pátek",
      "Sobota",
    ];
    const todayIndex = new Date().getDay(); // 0 = Sunday, 1 = Monday, ...
    const todayCzech = daysCzech[todayIndex];
    // console.log(
    //   `DEBUG - PDF Parser: Today is ${todayCzech} (Index: ${todayIndex})`
    // );

    let currentParsingDay = null; // Track which day's menu we are currently reading
    // --- End Get Today ---

    for (const line of lines) {
      // --- Check for Day Header ---
      const dayMatch = line.match(
        /^\s*(Pondělí|Úterý|Středa|Čtvrtek|Pátek|Sobota|Neděle)\s*:/i
      );
      if (dayMatch) {
        currentParsingDay = dayMatch[1]; // Update the current day section
        // console.log(
        //   `DEBUG - PDF Parser: Switched to parsing day: ${currentParsingDay}`
        // );
        continue; // Move to the next line after finding a day header
      }
      // --- End Check Day Header ---

      // Only proceed if we are in the correct day's section
      if (currentParsingDay !== todayCzech) {
        continue; // Skip lines if they don't belong to today's menu
      }

      // --- Parse Item (only if today is the current section) ---
      const itemMatch = line.match(itemRegex);
      if (itemMatch) {
        let name = itemMatch[1].trim(); // Group 1 is the item name/description
        // Clean up potential trailing ingredients/allergens if regex didn't catch them
        name = name.split(" (")[0].trim();
        const price = "N/A"; // Price is not available in this PDF text

        // Basic validation
        if (name && name.length > 3) {
          // console.log(
          //   `DEBUG - PDF Parser: Found item: Name="${name}", Price="${price}"`
          // );
          // Avoid duplicates if the same item appears (e.g., Menu A8 and A7)
          if (!items.some((item) => item.name === name)) {
            items.push({ name, price });
          }
        }
      }
    }
    // console.log(
    //   `DEBUG - PDF Parser: Finished Volha-specific parsing. Found ${items.length} items.`
    // );
    // --- End New Parsing Logic ---

    return { items };
  } catch (error) {
    console.error("Error parsing PDF:", error);
    return { error: `Failed to parse PDF menu. ${error.message}` };
  }
}

// --- Helper function to fetch and parse HTML (example for Spojovna) ---
async function parseSpojovnaMenu(url) {
  let browser = null; // Define browser outside try block for finally clause
  try {
    // console.log(`Launching Puppeteer for: ${url}`);
    browser = await puppeteer.launch({
      headless: true, // Run in the background
      args: ["--no-sandbox", "--disable-setuid-sandbox"], // Common args for compatibility
      //   executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined, // Use env var or let Puppeteer find default
    });
    const page = await browser.newPage();

    // --- Set a common User-Agent ---
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );
    // --- End User-Agent ---

    // console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 }); // Wait for network activity to cease, timeout 30s

    // --- Wait explicitly for the user-provided container selector ---
    // console.log(
    //   "Waiting for daily menu container element (#content > ... > div.visible)..."
    // );
    const dailyMenuSelector = "#content > div > div > div > div > div.visible";
    try {
      // Wait for the container itself to appear
      await page.waitForSelector(dailyMenuSelector, { timeout: 20000 });
      // console.log("Daily menu container found!");
    } catch (e) {
      console.error(`Error waiting for selector: ${dailyMenuSelector}`, e);
      await browser.close();
      return {
        error:
          "Could not find the specific daily menu container element (div.visible) on the page.",
        sourceUrl: url,
        items: [],
      };
    }
    // --- End Wait ---

    // console.log(
    //   "Getting HTML content using page.evaluate after waiting for container..."
    // );
    const bodyHtml = await page.evaluate(() => document.body.innerHTML);

    // --- Remove Iframe Check ---
    // console.log("\nDEBUG - Spojovna: Checking for iframes in the loaded body...");
    // ... (iframe check code removed)
    // console.log("\nDEBUG - Spojovna: End of iframe check\n");
    // --- End Iframe Check ---

    // console.log("Closing Puppeteer.");
    await browser.close();
    browser = null;

    // --- Restore parsing logic, use the specific selector ---
    // console.log("Parsing dynamic HTML with Cheerio...");
    const $ = cheerio.load(bodyHtml);

    const items = [];
    let dailyMenuFound = false; // Keep this, though technically selector should guarantee it

    // --- Use ONLY the user-provided selector ---
    const dailyMenuContainer = $(dailyMenuSelector).first(); // Directly use the selector

    if (!dailyMenuContainer || dailyMenuContainer.length === 0) {
      // This block should ideally not be reached if waitForSelector succeeded, but good failsafe
      // console.warn(
      //   "WARN - Spojovna: waitForSelector succeeded, but Cheerio failed to find the container. Returning empty menu."
      // );
      return {
        items: [],
        error:
          "Failed to re-select the daily menu container in Cheerio after waiting.",
      };
    }

    // --- Parse Items ONLY within the Daily Menu Container ---
    // console.log(
    //   `DEBUG - Spojovna: Parsing items within the identified Daily Menu container (Selector: ${dailyMenuSelector})...`
    // );

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
          if (
            !items.some((item) => item.name === name && item.price === price)
          ) {
            // console.log(
            //   `DEBUG - Spojovna (Daily): ==> Pushing item: Name="${name}", Price="${price}"`
            // );
            items.push({ name, price });
            dailyMenuFound = true; // Set flag when an item is found
          } else {
            // console.log(`DEBUG - Spojovna (Daily): Skipping duplicate item: Name="${name}", Price="${price}"`); // Optional
          }
        } else {
          // console.log(`DEBUG - Spojovna (Daily): Skipping potential header/short name: "${name}"`); // Optional
        }
      } else if (text.includes("Kč")) {
        // console.log(`DEBUG - Spojovna (Daily): Text contains price but didn't match regex: "${text.substring(0,150)}..."`); // Optional
      }
    });

    // console.log(`FINAL - Parsed ${items.length} daily items from Spojovna.`);
    // Use dailyMenuFound flag or items.length to check if parsing was successful within the container
    if (!dailyMenuFound || items.length === 0) {
      // console.warn(
      //   "WARN - Spojovna: Found daily menu container but extracted 0 items. Check parsing logic/selectors inside the container."
      // );
      return {
        items: [],
        error: "Found daily menu container, but failed to extract items.",
      };
    }
    return { items };
  } catch (error) {
    console.error("Error during Puppeteer/Spojovna parsing:", error);
    if (browser) {
      // console.log("Closing Puppeteer due to error.");
      await browser.close(); // Ensure browser is closed on error
    }
    return {
      error: `Failed to fetch or parse Spojovna menu using Puppeteer. ${error.message}`,
      sourceUrl: url, // Keep source URL on error
      items: [],
    };
  } // No finally needed as browser is closed in catch and after successful try
}

// --- New Helper function to fetch and parse Spojovna Menu using Axios ---
async function parseSpojovnaMenuAxios(url) {
  try {
    // console.log(`Fetching Spojovna HTML with Axios from: ${url}`);
    const { data: html } = await axios.get(url, {
      headers: {
        // Set a common User-Agent, similar to Puppeteer version
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });
    const $ = cheerio.load(html);
    // console.log("Spojovna HTML received via Axios, parsing with Cheerio...");

    const items = [];
    let dailyMenuFound = false;

    // Use the same specific selector as the Puppeteer version
    const dailyMenuSelector = "#content > div > div > div > div > div.visible";
    const dailyMenuContainer = $(dailyMenuSelector).first();

    if (!dailyMenuContainer || dailyMenuContainer.length === 0) {
      // console.warn(
      //   "WARN - Spojovna (Axios): Could not find the daily menu container (div.visible)."
      // );
      return {
        items: [],
        error:
          "Could not find the specific daily menu container element (div.visible) on the page using Axios.",
        sourceUrl: url,
      };
    }

    // console.log(
    //   `DEBUG - Spojovna (Axios): Parsing items within the identified Daily Menu container (Selector: ${dailyMenuSelector})...`
    // );

    dailyMenuContainer.find("p, div, li, h4, span, td, tr").each((i, el) => {
      let text = $(el).text().replace(/\s\s+/g, " ").trim();

      // Same filtering as Puppeteer version
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
          if (
            !items.some((item) => item.name === name && item.price === price)
          ) {
            // console.log(
            //   `DEBUG - Spojovna (Axios): ==> Pushing item: Name="${name}", Price="${price}"`
            // );
            items.push({ name, price });
            dailyMenuFound = true;
          }
        }
      }
    });

    // console.log(`FINAL - Parsed ${items.length} daily items from Spojovna (Axios).`);

    if (!dailyMenuFound || items.length === 0) {
      // console.warn(
      //   "WARN - Spojovna (Axios): Found daily menu container but extracted 0 items."
      // );
      return {
        items: [],
        error:
          "Found daily menu container with Axios, but failed to extract items.",
        sourceUrl: url,
      };
    }

    return { items };
  } catch (error) {
    // console.error("Error during Axios/Spojovna parsing:", error);
    return {
      error: `Failed to fetch or parse Spojovna menu using Axios. ${error.message}`,
      sourceUrl: url,
      items: [],
    };
  }
}

// --- Helper function to find and parse Volha menu (PDF focus) ---
async function parseVolhaMenu(url) {
  try {
    console.log(`Fetching Volha page HTML from: ${url}`);
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);
    // console.log(
    //   "Volha HTML received, searching for PDF link by specific text..."
    // );

    let pdfUrl = null;

    // --- Find <a> tag with specific text "Jídelní lístek zde" ---
    $("a").each((i, el) => {
      const link = $(el);
      // Check link text itself, or text of strong/span children
      const linkTextContent = (link.text() || " ").trim().toLowerCase();
      const strongTextContent = (link.find("strong").text() || " ")
        .trim()
        .toLowerCase();
      const spanTextContent = (link.find("span").text() || " ")
        .trim()
        .toLowerCase();

      const targetText = "jídelní lístek zde";

      if (
        linkTextContent === targetText ||
        strongTextContent === targetText ||
        spanTextContent === targetText
      ) {
        const href = link.attr("href");
        if (href && href.toLowerCase().includes(".pdf")) {
          pdfUrl = href;
          // console.log(`Found PDF link by text "${targetText}": ${pdfUrl}`);
          return false; // Stop iterating once found
        }
      }
    });
    // --- End specific text search ---

    if (pdfUrl) {
      // Check if pdfUrl was successfully found
      // Ensure the URL is absolute
      if (!pdfUrl.startsWith("http")) {
        const urlObject = new URL(url); // Use the base page URL
        pdfUrl = new URL(pdfUrl, urlObject.origin).href;
      }

      console.log(`Found potential Volha PDF menu link: ${pdfUrl}`);
      // Now call the existing PDF parser
      const pdfResult = await parsePdfMenu(pdfUrl);
      return { items: pdfResult.items, error: pdfResult.error }; // Pass items and error
    } else {
      console.log("Could not find a likely PDF menu link on the Volha page.");
      return { error: "Could not find PDF menu link on Volha page." };
    }
  } catch (error) {
    console.error("Error fetching or searching Volha page:", error);
    return { error: `Failed to fetch or search Volha page. ${error.message}` };
  }
}

// --- Helper function to fetch and parse HTML (example for Zatisi) ---
async function parseZatisiMenu(url) {
  try {
    // console.log(`Fetching Zatisi HTML (new parser - v2) from: ${url}`);
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);

    const items = [];
    const addedItems = new Set(); // For de-duplication

    // Target the main menu section first
    const menuContainer = $("section.specialni-listek");
    if (menuContainer.length === 0) {
      // console.warn("Zatisi (new parser v2): section.specialni-listek not found.");
      return {
        items: [],
        error: "Main menu container (section.specialni-listek) not found.",
      };
    }

    menuContainer.find("div.listek-sekce").each((i, sekceEl) => {
      const section = $(sekceEl);
      // const categoryTitleElement = section.find('h2'); // Category title, if needed in future
      // if (categoryTitleElement.length > 0) {
      //   console.log("Category:", categoryTitleElement.text().trim());
      // }

      section.find("div.listek-polozka").each((j, polozkaEl) => {
        const itemElement = $(polozkaEl);

        const textElement = itemElement.find("div.listek-text");
        // Price is a direct child span of listek-polozka, not listek-mnozstvi
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
          // Get all text from children, including <strong> and <i>
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

        // Basic validation and de-duplication
        if (fullName && itemPrice) {
          const signature = `${fullName}|${itemPrice}`;
          if (!addedItems.has(signature)) {
            items.push({ name: fullName, price: itemPrice });
            addedItems.add(signature);
            // console.log(`Zatisi (new parser v2) - Added: ${fullName} | ${itemPrice}`);
          }
        }
      });
    });

    if (items.length === 0) {
      // console.log("Zatisi (new parser v2): No menu items extracted after parsing.");
    }

    return { items };
  } catch (error) {
    // console.error("Error in new parseZatisiMenu (v2):", error);
    return {
      error: `Failed to parse Zatisi menu (new parser v2). ${error.message}`,
      sourceUrl: url,
      items: [],
    };
  }
}

// --- Helper function to parse Rangoli Kunratice menu ---
async function parseRangoliMenu(url) {
  try {
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);
    const items = [];
    let buffetPrice = "205 Kč"; // Default price

    // Try to find the price dynamically
    const priceElement = $('*:contains("205,-")').last(); // Find element with price text
    if (priceElement.length > 0) {
      const priceText = priceElement.text();
      const priceMatch = priceText.match(/(\d+),-/);
      if (priceMatch && priceMatch[1]) {
        buffetPrice = `${priceMatch[1]} Kč`;
      }
    }

    // Items are listed after a date string in the web search result.
    // Using "14/05/2025" as the marker from the provided web search data.
    // This date seems like a placeholder on their site.
    const dateMarkerText = "14/05/2025";
    let menuItemsSection = $("body"); // Search in the whole body by default

    // Try to narrow down the search area if possible, e.g., if there's an id="daily-menu"
    if ($("#daily-menu").length > 0) {
      menuItemsSection = $("#daily-menu");
    }

    const potentialItemElements = [];
    let dateMarkerFound = false;

    menuItemsSection
      .find("p, div, span, li, td, h1, h2, h3, h4, h5, h6")
      .each((i, el) => {
        const element = $(el);
        // Remove children text to get mostly direct text of the element
        const elementText = element
          .clone()
          .children()
          .remove()
          .end()
          .text()
          .trim();

        if (elementText.includes(dateMarkerText)) {
          dateMarkerFound = true;
          return; // Don't add the date itself as an item, continue to find items after it
        }

        if (
          dateMarkerFound &&
          elementText.length > 3 &&
          elementText.length < 100
        ) {
          // Heuristic: if we found the date, subsequent non-empty text elements could be items
          // Avoid adding script/style content or very long paragraphs not typical for menu items
          if (
            element.prop("tagName") !== "SCRIPT" &&
            element.prop("tagName") !== "STYLE"
          ) {
            // Basic check to avoid adding empty strings or already added items
            if (
              elementText &&
              !items.some((item) => item.name === elementText)
            ) {
              // Further filter common non-item phrases if necessary
              if (
                !elementText.toLowerCase().includes("otevírací doba") &&
                !elementText.toLowerCase().includes("pracovní dny") &&
                !elementText.match(/^\d+,?-?$/) && // Avoid pure numbers/prices as item names
                elementText !== buffetPrice
              ) {
                potentialItemElements.push(elementText);
              }
            }
          }
        }
      });

    // Filter using known dish names from search result as a sanity check or primary source
    const knownDishNames = [
      "Kerla Chicken Curry",
      "Butter Garlic Chicken",
      "Rajma Masala",
      "Makhani Pasta",
      "Gobhi Matar",
      "Steak House Fries",
      "Veg Handi",
      "Steamed Rice",
      "Papadam (Teňoučké křupavé placky papadum)",
      "Naan bread (Naan chleba)",
      "Raita (Rajta- indický jogurtový salát)",
      "Indian Dessert (Indický dezert)",
    ];

    // Populate items primarily from known list found in the search results,
    // as the date marker might be unreliable or structure too varied.
    knownDishNames.forEach((dishName) => {
      // Check if this dish name was found textually on the page (even if not through strict iteration logic)
      if (html.includes(dishName)) {
        items.push({ name: dishName }); // No individual price for buffet items
      }
    });

    if (items.length > 0) {
      items.push({
        name: "Denní Buffet / Daily Buffet",
        price: buffetPrice,
        description:
          "Výše uvedené položky jsou součástí bufetu. / Above items are part of the buffet.",
      });
    } else {
      // Fallback if specific items not found but we know it's a buffet page
      // console.log("Could not find specific Rangoli menu items, adding general buffet info.");
      items.push({
        name: "Denní Buffet / Daily Buffet",
        price: buffetPrice,
        description:
          "Pro aktuální nabídku prosím navštivte webovou stránku restaurace. / For current menu items, please visit the restaurant's website.",
      });
    }

    return { items };
  } catch (error) {
    // console.error("Error parsing Rangoli menu:", error);
    return {
      error: `Failed to parse Rangoli menu. ${error.message}`,
      sourceUrl: url,
    };
  }
}

// --- Restaurant Configuration ---
const restaurantConfig = {
  volha: {
    name: "Menza Volha",
    url: "https://menzavolha.cz/jidelni-listek/",
    parser: parseVolhaMenu,
  },
  zatisi: {
    name: "Café Zátisí",
    url: "https://restaurantcafe.cz/restaurant-cafe-zatisi/specialni-menu/",
    parser: parseZatisiMenu,
  },
  spojovna: {
    name: "Pivovar Spojovna",
    url: "https://pivovarspojovna.cz/menu/",
    parser: parseSpojovnaMenuAxios, // Using the Axios version
    // originalPuppeteerParser: parseSpojovnaMenu, // Keep if needed for quick switch
  },
  rangoli: {
    name: "Rangoli Kunratice",
    url: "https://www.rangolikunratice.cz/cs/#daily-menu",
    parser: parseRangoliMenu,
  },
};

// --- API Endpoint ---
app.get("/api/menu/:restaurant", async (req, res) => {
  const restaurantId = req.params.restaurant;
  let menuResult;

  // console.log(`Received request for restaurant: ${restaurantId}`);

  const config = restaurantConfig[restaurantId];

  if (config) {
    menuResult = await config.parser(config.url);
    menuResult.restaurantName = config.name;
    menuResult.sourceUrl = config.url;
  } else {
    return res.status(404).json({ error: "Restaurant not found" });
  }

  // Send response - Ensure consistent structure even if items array is empty
  if (
    menuResult.error &&
    (!menuResult.items || menuResult.items.length === 0)
  ) {
    // Check items too
    // If error and no items (e.g., PDF error, or parser returns error with empty items)
    res.status(200).json({
      restaurantName: menuResult.restaurantName || restaurantId, // Use provided name or fallback
      sourceUrl: menuResult.sourceUrl || "#", // Use provided URL or fallback
      items: [],
      error: menuResult.error,
    });
  } else {
    // Includes cases where items might be empty due to parsing logic (like Spojovna daily not found)
    res.status(200).json({
      restaurantName: menuResult.restaurantName || restaurantId,
      sourceUrl: menuResult.sourceUrl || "#",
      items: menuResult.items || [], // Ensure items is always an array
      error: menuResult.error || null, // Include error if present
    });
  }
});

// --- App Info (Version and GitHub link) ---
const GITHUB_REPO_URL = "https://github.com/vbalko-claimate/claimate-obedy";

// Generate a dynamic version based on git history
let dynamicVersion = "0.0.0";
let lastCommitHash = "";
let lastCommitDate = "";

try {
  // Get the short commit hash
  lastCommitHash = execSync("git rev-parse --short HEAD").toString().trim();

  // Get the commit date formatted as YYYY-MM-DD
  lastCommitDate = execSync("git log -1 --format=%cd --date=short")
    .toString()
    .trim();

  // Count total number of commits for patch version
  const commitCount = parseInt(
    execSync("git rev-list --count HEAD").toString().trim(),
    10
  );

  // Extract year and month from the commit date (for minor version)
  const commitDateParts = lastCommitDate.split("-");
  const yearLastTwo = commitDateParts[0].substring(2); // Last two digits of year
  const month = commitDateParts[1];

  // Try to get the most recent tag for major version, defaulting to 0 if none exist
  let majorVersion = 1; // Default major version
  try {
    // Try to get the most recent tag that looks like v1.2.3 or 1.2.3
    const tagExec = execSync(
      'git describe --tags --abbrev=0 2> /dev/null || echo "v0"'
    )
      .toString()
      .trim();
    // Extract the number after 'v' if it exists
    const tagMatch = tagExec.match(/^v?(\d+)/);
    if (tagMatch && tagMatch[1]) {
      majorVersion = parseInt(tagMatch[1], 10);
    }
  } catch (tagErr) {
    // If no tags or error, keep default major version
  }

  // Format as MAJOR.YYMM.COMMITS-HASH
  dynamicVersion = `${majorVersion}.${yearLastTwo}${month}.${commitCount}-${lastCommitHash}`;
} catch (err) {
  console.error("Failed to generate dynamic version:", err);
  // Fallback to static version if git commands fail
  dynamicVersion = "1.0.0-unknown";
  lastCommitHash = "unknown";
  lastCommitDate = "unknown";
}

app.get("/api/app-info", (req, res) => {
  res.json({
    version: dynamicVersion,
    githubRepoUrl: GITHUB_REPO_URL,
    lastCommit: {
      hash: lastCommitHash,
      date: lastCommitDate,
      url: `${GITHUB_REPO_URL}/commit/${lastCommitHash}`,
    },
  });
});

// --- Route to serve the frontend index.html ---
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
// --- End Frontend Route ---

// Start the server
app.listen(PORT, () => {
  console.log(`Menu API server running on http://localhost:${PORT}`);
});
