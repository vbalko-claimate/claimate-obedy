const express = require("express");
const cors = require("cors");
const path = require("path");
const { execSync } = require("child_process");
const {
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
} = require("./parsers");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const restaurantConfig = {
  volha: {
    name: "Menza Volha",
    url: "https://menzavolha.cz/jidelni-listek/",
    parser: parseVolhaMenu,
    distance: 2,
    transport: "walk",
    area: "Kunratice",
  },
  zatisi: {
    name: "Cafe Zatisi",
    url: "https://restaurantcafe.cz/restaurant-cafe-zatisi/specialni-menu-2/",
    parser: parseZatisiMenu,
    distance: 5,
    transport: "walk",
    area: "Kunratice",
  },
  spojovna: {
    name: "Pivovar Spojovna",
    url: "https://pivovarspojovna.cz/menu/",
    parser: parseSpojovnaMenu,
    distance: 8,
    transport: "walk",
    area: "Kunratice",
  },
  rangoli: {
    name: "Rangoli Kunratice",
    url: "https://www.rangolikunratice.cz/cs/#daily-menu",
    parser: parseRangoliMenu,
    distance: 7,
    transport: "car",
    area: "Kunratice",
  },
  lokal: {
    name: "Lokal U Zavadilu",
    url: "https://lokal-uzavadilu.ambi.cz/cz/menu/?id=10231",
    parser: parseLokalMenu,
    distance: 2,
    transport: "walk",
    area: "Kunratice",
  },
  takurcite: {
    name: "Tak Urcite",
    url: "https://www.takurcite.com/poledni-menu",
    parser: parseTakUrciteMenu,
    distance: 5,
    transport: "car",
    area: "Katerinky",
  },
  dicarlo: {
    name: "Di Carlo",
    url: "https://dicarlo.cz/nase-menu/dnesni-nabidka/",
    parser: parseDiCarloMenu,
    distance: 5,
    transport: "car",
    area: "Seberov",
  },
  chapadlo: {
    name: "Chapadlo",
    url: "https://chapadlo.com/",
    parser: parseChapadloMenu,
    distance: 12,
    transport: "car",
    area: "Nusle",
  },
  michelska: {
    name: "Michelska Pivnice",
    url: "https://www.michelskapivnice.cz/",
    parser: parseMichelskaMenu,
    distance: 10,
    transport: "car",
    area: "Michle",
  },
};

app.get("/api/restaurants", (req, res) => {
  const list = Object.entries(restaurantConfig).map(([id, config]) => ({
    id,
    name: config.name,
    sourceUrl: config.url,
    distance: config.distance,
    transport: config.transport,
    area: config.area,
  }));
  res.json(list);
});

app.get("/api/menu/:restaurant", async (req, res) => {
  const restaurantId = req.params.restaurant;
  const config = restaurantConfig[restaurantId];

  if (!config) {
    return res.status(404).json({ error: "Restaurant not found" });
  }

  const menuResult = await config.parser(config.url);

  res.status(200).json({
    restaurantName: config.name,
    sourceUrl: config.url,
    distance: config.distance,
    transport: config.transport,
    area: config.area,
    items: menuResult.items || [],
    error: menuResult.error || null,
  });
});

app.get("/api/health", async (req, res) => {
  const results = await Promise.all(
    Object.entries(restaurantConfig).map(async ([id, config]) => {
      try {
        const result = await config.parser(config.url);
        const itemCount = (result.items || []).length;
        return {
          id,
          name: config.name,
          status: itemCount > 0 ? "ok" : "empty",
          itemCount,
          error: result.error || null,
        };
      } catch (error) {
        return {
          id,
          name: config.name,
          status: "error",
          itemCount: 0,
          error: error.message,
        };
      }
    })
  );

  const allOk = results.every((r) => r.status === "ok");
  res.status(allOk ? 200 : 503).json({
    status: allOk ? "healthy" : "degraded",
    restaurants: results,
    timestamp: new Date().toISOString(),
  });
});

const GITHUB_REPO_URL = "https://github.com/vbalko-claimate/claimate-obedy";
let dynamicVersion = "0.0.0";
let lastCommitHash = "";
let lastCommitDate = "";

try {
  lastCommitHash = execSync("git rev-parse --short HEAD").toString().trim();
  lastCommitDate = execSync("git log -1 --format=%cd --date=short").toString().trim();
  const commitCount = parseInt(execSync("git rev-list --count HEAD").toString().trim(), 10);
  const commitDateParts = lastCommitDate.split("-");
  const yearLastTwo = commitDateParts[0].substring(2);
  const month = commitDateParts[1];

  let majorVersion = 1;
  try {
    const tagExec = execSync('git describe --tags --abbrev=0 2> /dev/null || echo "v0"').toString().trim();
    const tagMatch = tagExec.match(/^v?(\d+)/);
    if (tagMatch && tagMatch[1]) majorVersion = parseInt(tagMatch[1], 10);
  } catch (tagErr) {}

  dynamicVersion = `${majorVersion}.${yearLastTwo}${month}.${commitCount}-${lastCommitHash}`;
} catch (err) {
  console.error("Failed to generate dynamic version:", err);
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

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.listen(PORT, () => {
  console.log(`Menu API server running on http://localhost:${PORT}`);
});
