const express = require("express");
const cors = require("cors");
const path = require("path");
const { execSync } = require("child_process");
const {
  parseSpojovnaMenu,
  parseVolhaMenu,
  parseZatisiMenu,
  parseRangoliMenu,
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
  },
  zatisi: {
    name: "Café Zátisí",
    url: "https://restaurantcafe.cz/restaurant-cafe-zatisi/specialni-menu-2/",
    parser: parseZatisiMenu,
  },
  spojovna: {
    name: "Pivovar Spojovna",
    url: "https://pivovarspojovna.cz/menu/",
    parser: parseSpojovnaMenu,
  },
  rangoli: {
    name: "Rangoli Kunratice",
    url: "https://www.rangolikunratice.cz/cs/#daily-menu",
    parser: parseRangoliMenu,
  },
};

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

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.listen(PORT, () => {
  console.log(`Menu API server running on http://localhost:${PORT}`);
});
