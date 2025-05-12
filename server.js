const express = require("express");
const axios = require("axios"); // For fetching HTML
const cheerio = require("cheerio"); // For parsing HTML
const pdf = require("pdf-parse"); // For parsing PDF
const fetch = require("node-fetch"); // For fetching PDF buffer
const cors = require("cors"); // To allow frontend requests
const puppeteer = require("puppeteer"); // Add Puppeteer
const path = require("path"); // To serve static files like index.html

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
    console.log("\nDEBUG - PDF Parser: Raw text lines (first 20):\n");
    console.log(lines.slice(0, 20).join("\n"));
    console.log("\nDEBUG - PDF Parser: End of raw text sample\n");
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
    console.log("DEBUG - PDF Parser: Applying Volha-specific parsing logic...");
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
    console.log(
      `DEBUG - PDF Parser: Today is ${todayCzech} (Index: ${todayIndex})`
    );

    let currentParsingDay = null; // Track which day's menu we are currently reading
    // --- End Get Today ---

    for (const line of lines) {
      // --- Check for Day Header ---
      const dayMatch = line.match(
        /^\s*(Pondělí|Úterý|Středa|Čtvrtek|Pátek|Sobota|Neděle)\s*:/i
      );
      if (dayMatch) {
        currentParsingDay = dayMatch[1]; // Update the current day section
        console.log(
          `DEBUG - PDF Parser: Switched to parsing day: ${currentParsingDay}`
        );
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
          console.log(
            `DEBUG - PDF Parser: Found item: Name="${name}", Price="${price}"`
          );
          // Avoid duplicates if the same item appears (e.g., Menu A8 and A7)
          if (!items.some((item) => item.name === name)) {
            items.push({ name, price });
          }
        }
      }
    }
    console.log(
      `DEBUG - PDF Parser: Finished Volha-specific parsing. Found ${items.length} items.`
    );
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
    console.log(`Launching Puppeteer for: ${url}`);
    browser = await puppeteer.launch({
      headless: true, // Run in the background
      args: ["--no-sandbox", "--disable-setuid-sandbox"] // Common args for compatibility
    //   executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined, // Use env var or let Puppeteer find default
    });
    const page = await browser.newPage();

    // --- Set a common User-Agent ---
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );
    // --- End User-Agent ---

    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 }); // Wait for network activity to cease, timeout 30s

    // --- Wait explicitly for the user-provided container selector ---
    console.log(
      "Waiting for daily menu container element (#content > ... > div.visible)..."
    );
    const dailyMenuSelector = "#content > div > div > div > div > div.visible";
    try {
      // Wait for the container itself to appear
      await page.waitForSelector(dailyMenuSelector, { timeout: 20000 });
      console.log("Daily menu container found!");
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

    console.log(
      "Getting HTML content using page.evaluate after waiting for container..."
    );
    const bodyHtml = await page.evaluate(() => document.body.innerHTML);

    // --- Remove Iframe Check ---
    // console.log("\nDEBUG - Spojovna: Checking for iframes in the loaded body...");
    // ... (iframe check code removed)
    // console.log("\nDEBUG - Spojovna: End of iframe check\n");
    // --- End Iframe Check ---

    console.log("Closing Puppeteer.");
    await browser.close();
    browser = null;

    // --- Restore parsing logic, use the specific selector ---
    console.log("Parsing dynamic HTML with Cheerio...");
    const $ = cheerio.load(bodyHtml);

    const items = [];
    let dailyMenuFound = false; // Keep this, though technically selector should guarantee it

    // --- Use ONLY the user-provided selector ---
    const dailyMenuContainer = $(dailyMenuSelector).first(); // Directly use the selector

    if (!dailyMenuContainer || dailyMenuContainer.length === 0) {
      // This block should ideally not be reached if waitForSelector succeeded, but good failsafe
      console.warn(
        "WARN - Spojovna: waitForSelector succeeded, but Cheerio failed to find the container. Returning empty menu."
      );
      return {
        items: [],
        error:
          "Failed to re-select the daily menu container in Cheerio after waiting.",
      };
    }

    // --- Parse Items ONLY within the Daily Menu Container ---
    console.log(
      `DEBUG - Spojovna: Parsing items within the identified Daily Menu container (Selector: ${dailyMenuSelector})...`
    );

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
            console.log(
              `DEBUG - Spojovna (Daily): ==> Pushing item: Name="${name}", Price="${price}"`
            );
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

    console.log(`FINAL - Parsed ${items.length} daily items from Spojovna.`);
    // Use dailyMenuFound flag or items.length to check if parsing was successful within the container
    if (!dailyMenuFound || items.length === 0) {
      console.warn(
        "WARN - Spojovna: Found daily menu container but extracted 0 items. Check parsing logic/selectors inside the container."
      );
      return {
        items: [],
        error: "Found daily menu container, but failed to extract items.",
      };
    }
    return { items };
  } catch (error) {
    console.error("Error during Puppeteer/Spojovna parsing:", error);
    if (browser) {
      console.log("Closing Puppeteer due to error.");
      await browser.close(); // Ensure browser is closed on error
    }
    return {
      error: `Failed to fetch or parse Spojovna menu using Puppeteer. ${error.message}`,
      sourceUrl: url, // Keep source URL on error
      items: [],
    };
  } // No finally needed as browser is closed in catch and after successful try
}

// --- Helper function to find and parse Volha menu (PDF focus) ---
async function parseVolhaMenu(url) {
  try {
    console.log(`Fetching Volha page HTML from: ${url}`);
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);
    console.log(
      "Volha HTML received, searching for PDF link by specific text..."
    );

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
          console.log(`Found PDF link by text "${targetText}": ${pdfUrl}`);
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
    console.log(`Fetching HTML from: ${url}`);
    const { data: zatisiHtml } = await axios.get(url);
    const $ = cheerio.load(zatisiHtml);

    const items = [];
    // More targeted approach: Look for main content areas first
    const contentSelectors = [
      "section.specialni-listek", // **** PRIORITIZE THIS SELECTOR ****
      ".specialni-listek",
      "article.type-page .entry-content", // Common WordPress structure
      ".content-area article",
      'main[role="main"]',
      "#main-content",
      ".main-content",
      ".page-content",
      "article",
      "section.menu-section", // If there's a specific section
      'div[class*="content"]',
      'div[id*="content"]',
    ];

    let menuContentFound = false;

    for (const selector of contentSelectors) {
      const mainContent = $(selector);
      if (mainContent.length > 0) {
        mainContent
          .find("p, div, li, h3, h4, .menu-item, .dish")
          .each((i, el) => {
            // Get text from the element itself and immediate children spans/divs to catch name/price split across elements
            let elementText = $(el)
              .clone()
              .children()
              .remove()
              .end()
              .text()
              .trim(); // Text of the element itself
            let childrenText = $(el)
              .children("span, div")
              .map((_, child) => $(child).text().trim())
              .get()
              .join(" ");
            let text = (elementText + " " + childrenText)
              .replace(/\s\s+/g, " ")
              .trim();

            // Skip if the text is clearly just a section title (e.g., all uppercase, short)
            if (
              text.length < 80 &&
              text === text.toUpperCase() &&
              !text.includes("Kč")
            ) {
              return; // Continue to next element
            }

            // Regex to find item name and price (e.g., "Item Name... 123 Kč")
            // It tries to capture text before the price, skipping over potential allergen info in parentheses.
            const priceMatch = text.match(
              /^(.*?)(?:\s\(.*\))?\s*(\d{2,4}(?:[.,]\d{2})?)\s*(?:Kč|,-)/i
            );

            if (priceMatch) {
              let name = priceMatch[1].trim(); // Group 1 is the name
              const priceValue = priceMatch[2].replace(",", "."); // Group 2 is the price number
              const price = priceValue + (text.includes(",-") ? ",-" : " Kč"); // Reconstruct price with correct suffix

              // Clean up name: remove trailing dots, commas, or common prefixes like "-"
              name = name.replace(/[.,\s-]+$/, "").trim();
              // If name is very short, it might be a category, try to get text from children
              if (name.length < 5 && $(el).children().length > 0) {
                name = $(el)
                  .children()
                  .first()
                  .text()
                  .trim()
                  .replace(/[.,\s-]+$/, "")
                  .trim();
              }

              if (
                name.length > 2 &&
                name.toLowerCase() !== "menu" &&
                !/denní menu|special|nabídka/i.test(name) &&
                !items.some(
                  (item) => item.name === name && item.price === price
                )
              ) {
                items.push({ name, price });
                menuContentFound = true;
              }
            } else if (text.includes("Kč") || text.includes(",-")) {
              // Fallback for lines that might just contain price or oddly formatted items
              const priceOnlyMatch = text.match(
                /(\d{2,4}(?:[.,]\d{2})?)\s*(?:Kč|,-)/i
              );
              if (priceOnlyMatch) {
                const matchedPriceString = priceOnlyMatch[0];
                const priceValue = priceOnlyMatch[1].replace(",", ".");
                const price =
                  priceValue +
                  (matchedPriceString.includes(",-") ? ",-" : " Kč");
                let name = text
                  .replace(matchedPriceString, "")
                  .trim()
                  .replace(/[.,\s-]+$/, "")
                  .trim();
                if (
                  name.length > 2 &&
                  name.toLowerCase() !== "menu" &&
                  !/denní menu|special|nabídka/i.test(name) &&
                  !items.some(
                    (item) => item.name === name && item.price === price
                  )
                ) {
                  items.push({ name, price });
                  menuContentFound = true;
                }
              }
            }
          });
        if (menuContentFound) break; // Stop if items are found in this content area
      }
    }

    if (items.length === 0) {
      console.log(
        "No menu items found for Zatisi after targeted content search."
      );
      return {
        error: "Could not find menu items. Please check the website directly.",
        sourceUrl: url,
      };
    }
    return { items };
  } catch (error) {
    console.error("Error parsing Zatisi HTML:", error);
    return {
      error: `Failed to parse Zatisi menu. ${error.message}`,
      sourceUrl: url,
    };
  }
}

// --- API Endpoint ---
app.get("/api/menu/:restaurant", async (req, res) => {
  const restaurant = req.params.restaurant;
  let menuResult; // Renamed from menuData to avoid confusion before adding metadata

  console.log(`Received request for restaurant: ${restaurant}`);

  switch (restaurant) {
    case "volha":
      // --- Use the new parser for Volha, pointing to the correct page ---
      const volhaUrl = "https://menzavolha.cz/jidelni-listek/"; // Corrected URL
      menuResult = await parseVolhaMenu(volhaUrl);
      menuResult.restaurantName = "Menza Volha";
      menuResult.sourceUrl = menuResult.foundPdfUrl || volhaUrl; // Use PDF url if found
      // --- Remove hardcoded data ---
      // menuResult = {
      //   restaurantName: "Menza Volha",
      //   sourceUrl: "https://menzavolha.cz/",
      //   items: [
      //     { name: "Polévka zeleninová s kuskusem", price: "35 Kč" },
      //     { name: "Vepřové výpečky, houskový knedlík, zelí", price: "129 Kč" },
      //     { name: "Kuřecí řízek, brambory, okurka", price: "139 Kč" },
      //     {
      //       name: "Vegetariánské rizoto se zeleninou a sýrem",
      //       price: "119 Kč",
      //     },
      //     { name: "Těstovinový salát s kuřecím masem", price: "125 Kč" },
      //   ],
      // };
      break;

    case "zatisi":
      const zatisiUrl =
        "https://restaurantcafe.cz/restaurant-cafe-zatisi/specialni-menu/";
      menuResult = await parseZatisiMenu(zatisiUrl);
      menuResult.restaurantName = "Café Zátisí"; // Add metadata after parsing
      menuResult.sourceUrl = zatisiUrl;
      break;

    case "spojovna":
      const spojovnaUrl = "https://pivovarspojovna.cz/menu/";
      menuResult = await parseSpojovnaMenu(spojovnaUrl);
      menuResult.restaurantName = "Pivovar Spojovna"; // Add metadata after parsing
      menuResult.sourceUrl = spojovnaUrl;
      break;

    default:
      return res.status(404).json({ error: "Restaurant not found" });
  }

  // Send response - Ensure consistent structure even if items array is empty
  if (menuResult.error && !menuResult.items) {
    // If error and no items (e.g., PDF error)
    res.status(200).json({
      restaurantName: menuResult.restaurantName || restaurant, // Use provided name or fallback
      sourceUrl: menuResult.sourceUrl || "#", // Use provided URL or fallback
      items: [],
      error: menuResult.error,
    });
  } else {
    // Includes cases where items might be empty due to parsing logic (like Spojovna daily not found)
    res.status(200).json({
      restaurantName: menuResult.restaurantName || restaurant,
      sourceUrl: menuResult.sourceUrl || "#",
      items: menuResult.items || [], // Ensure items is always an array
      error: menuResult.error || null, // Include error if present (e.g., Spojovna daily not found)
    });
  }
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
