const fs = require("fs");
const path = require("path");
const axios = require("axios");

// Mock axios to return fixture data instead of hitting real websites
jest.mock("axios");

const {
  parseSpojovnaMenu,
  parseZatisiMenu,
  parseRangoliMenu,
  parseVolhaMenu,
} = require("../parsers");

function loadFixture(name) {
  return fs.readFileSync(
    path.join(__dirname, "fixtures", name),
    "utf-8"
  );
}

describe("parseSpojovnaMenu", () => {
  test("extracts menu items with prices from fixture HTML", async () => {
    axios.get.mockResolvedValue({ data: loadFixture("spojovna.html") });

    const result = await parseSpojovnaMenu("https://example.com/menu");

    expect(result.items).toBeDefined();
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();

    result.items.forEach((item) => {
      expect(item.name).toBeDefined();
      expect(item.name.length).toBeGreaterThan(3);
      expect(item.price).toMatch(/\d+ Kč/);
    });
  });

  test("returns error when daily menu container is missing", async () => {
    axios.get.mockResolvedValue({ data: "<html><body><p>No menu here</p></body></html>" });

    const result = await parseSpojovnaMenu("https://example.com/menu");

    expect(result.items).toEqual([]);
    expect(result.error).toContain("Could not find");
  });

  test("returns error on network failure", async () => {
    axios.get.mockRejectedValue(new Error("Network error"));

    const result = await parseSpojovnaMenu("https://example.com/menu");

    expect(result.items).toEqual([]);
    expect(result.error).toContain("Network error");
  });
});

describe("parseZatisiMenu", () => {
  test("extracts menu items with quantities and prices from fixture HTML", async () => {
    axios.get.mockResolvedValue({ data: loadFixture("zatisi.html") });

    const result = await parseZatisiMenu("https://example.com/menu");

    expect(result.items).toBeDefined();
    expect(result.items.length).toBe(2);

    // First item should have quantity prefix
    expect(result.items[0].name).toContain("0,33l");
    expect(result.items[0].price).toContain("65");

    // Second item without quantity
    expect(result.items[1].name).toContain("Hovězí steak");
    expect(result.items[1].price).toContain("285");
  });

  test("returns error when menu container is missing", async () => {
    axios.get.mockResolvedValue({ data: "<html><body></body></html>" });

    const result = await parseZatisiMenu("https://example.com/menu");

    expect(result.items).toEqual([]);
    expect(result.error).toContain("specialni-listek");
  });

  test("deduplicates identical items", async () => {
    const html = `<html><body>
      <section class="specialni-listek">
        <div class="listek-sekce">
          <div class="listek-polozka">
            <div class="listek-text">Soup</div><span>50 Kč</span>
          </div>
          <div class="listek-polozka">
            <div class="listek-text">Soup</div><span>50 Kč</span>
          </div>
        </div>
      </section>
    </body></html>`;
    axios.get.mockResolvedValue({ data: html });

    const result = await parseZatisiMenu("https://example.com/menu");

    expect(result.items.length).toBe(1);
  });
});

describe("parseRangoliMenu", () => {
  test("extracts dish names and buffet price from fixture HTML", async () => {
    axios.get.mockResolvedValue({ data: loadFixture("rangoli.html") });

    const result = await parseRangoliMenu("https://example.com/menu");

    expect(result.items).toBeDefined();
    expect(result.items.length).toBeGreaterThan(1);

    // Last item should be the buffet summary
    const lastItem = result.items[result.items.length - 1];
    expect(lastItem.name).toContain("Buffet");
    expect(lastItem.price).toBe("205 Kč");
    expect(lastItem.description).toBeDefined();
  });

  test("returns fallback buffet item when no dishes found", async () => {
    axios.get.mockResolvedValue({ data: "<html><body><p>205,-</p></body></html>" });

    const result = await parseRangoliMenu("https://example.com/menu");

    expect(result.items.length).toBe(1);
    expect(result.items[0].name).toContain("Buffet");
    expect(result.items[0].description).toContain("webovou stránku");
  });

  test("returns error on network failure", async () => {
    axios.get.mockRejectedValue(new Error("Timeout"));

    const result = await parseRangoliMenu("https://example.com/menu");

    expect(result.items).toEqual([]);
    expect(result.error).toContain("Timeout");
  });
});

describe("parseVolhaMenu", () => {
  beforeEach(() => {
    axios.get.mockClear();
  });

  test("finds PDF link from fixture page", async () => {
    axios.get.mockResolvedValueOnce({ data: loadFixture("volha-page.html") });
    axios.get.mockRejectedValueOnce(new Error("PDF mock"));

    const result = await parseVolhaMenu("https://menzavolha.cz/jidelni-listek/");

    expect(axios.get).toHaveBeenCalledTimes(2);
    const secondCallUrl = axios.get.mock.calls[1][0];
    expect(secondCallUrl).toContain(".pdf");
  });

  test("returns error when no PDF link found", async () => {
    axios.get.mockResolvedValue({ data: "<html><body><p>No PDF here</p></body></html>" });

    const result = await parseVolhaMenu("https://example.com/menu");

    expect(result.items).toEqual([]);
    expect(result.error).toContain("Could not find PDF");
  });
});

describe("parser return shape consistency", () => {
  test("all parsers return { items: [], error } on failure", async () => {
    axios.get.mockRejectedValue(new Error("fail"));

    const parsers = [parseSpojovnaMenu, parseZatisiMenu, parseRangoliMenu, parseVolhaMenu];

    for (const parser of parsers) {
      const result = await parser("https://example.com");
      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("error");
      expect(Array.isArray(result.items)).toBe(true);
      expect(typeof result.error).toBe("string");
    }
  });
});
