const API_BASE_URL = "/api/menu";
const RESTAURANT_IDS = ["volha", "zatisi", "spojovna", "rangoli"];

const loadedMenus = {};

const restaurantSourceUrls = {
  volha: "https://menzavolha.cz/jidelni-listek/",
  zatisi: "https://restaurantcafe.cz/restaurant-cafe-zatisi/specialni-menu-2/",
  spojovna: "https://pivovarspojovna.cz/menu/",
  rangoli: "https://www.rangolikunratice.cz/cs/#daily-menu",
};

const restaurantNames = {
  volha: "Menza Volha",
  zatisi: "Cafe Zatisi",
  spojovna: "Pivovar Spojovna",
  rangoli: "Rangoli Kunratice",
};

// --- Menu Display ---

function buildMenuHtml(menuData, restaurantId) {
  const name = menuData.restaurantName || restaurantNames[restaurantId] || restaurantId;
  let html = `<h2>${name}</h2>`;

  if (menuData.items && menuData.items.length > 0) {
    html += '<ul class="menu-list">';
    let mainSectionStarted = false;
    menuData.items.forEach((item) => {
      const rawName = item.name || "Unnamed Item";
      const hasSoupKeyword = /^Pol[eé]vka[\s:]/i.test(rawName);
      // Spojovna: soup is first item, starts with volume like "0,3l"
      const looksLikeSoup = !mainSectionStarted && /^0,[0-9]+l\s/i.test(rawName);
      const isSoup = hasSoupKeyword || looksLikeSoup;
      const displayName = hasSoupKeyword ? rawName.replace(/^Pol[eé]vka\s*:?\s*/i, "") : rawName;

      if (!isSoup && !mainSectionStarted) {
        mainSectionStarted = true;
        html += '<li class="menu-list-section-label" aria-hidden="true">Hlavni jidla</li>';
      }

      const itemClass = isSoup ? "menu-item menu-item--soup" : "menu-item menu-item--main";
      html += `<li class="${itemClass}"><div class="menu-item-info">`;

      if (isSoup) {
        html += '<span class="menu-item-type-label">Polevka</span>';
      }

      html += `<span class="menu-item-name">${displayName}</span>`;

      if (item.description) {
        const cleaned = item.description.replace(/\s\s+/g, " ").trim();
        if (cleaned) {
          html += `<span class="menu-item-desc">${cleaned}</span>`;
        }
      }
      html += "</div>";
      if (item.price && item.price !== "N/A") {
        html += `<span class="price">${item.price}</span>`;
      }
      html += "</li>";
    });
    html += "</ul>";
  } else {
    html += "<p>Menu not available or empty today.</p>";
  }

  if (loadedMenus[restaurantId]) {
    const now = new Date();
    const time = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    html += `<p class="last-updated">Loaded today at ${time}</p>`;
  }

  if (menuData.sourceUrl) {
    html += `<a href="${menuData.sourceUrl}" target="_blank" rel="noopener noreferrer" class="source-link">View Original</a>`;
  }

  return html;
}

function humanizeError(rawError) {
  if (/timeout|ETIMEDOUT/i.test(rawError)) return "The restaurant's website is not responding. Try again in a few minutes.";
  if (/503|502|504/i.test(rawError)) return "The restaurant's menu is temporarily unavailable.";
  if (/network|ENOTFOUND|fetch/i.test(rawError)) return "Could not reach the server. Check your connection.";
  if (/Could not find/i.test(rawError)) return "Menu could not be found on the restaurant's website today.";
  return "Menu unavailable right now. Try again later.";
}

function buildErrorHtml(restaurantId, errorMessage) {
  const name = restaurantNames[restaurantId] || restaurantId;
  const sourceUrl = restaurantSourceUrls[restaurantId];

  let html = `<h2>${name}</h2>`;
  html += `<div class="error-message">`;
  html += humanizeError(errorMessage);
  html += `<br><button class="retry-btn" onclick="retryLoad('${restaurantId}')">Try again</button>`;
  html += `</div>`;

  if (sourceUrl) {
    html += `<a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" class="source-link">View restaurant website</a>`;
  }

  return html;
}

function getContentDivs(restaurantId) {
  const divs = [];
  const tabDiv = document.getElementById(restaurantId);
  if (tabDiv) divs.push(tabDiv);
  const cardDiv = document.getElementById(`card-${restaurantId}`);
  if (cardDiv) divs.push(cardDiv);
  return divs;
}

async function loadMenu(restaurantId) {
  const divs = getContentDivs(restaurantId);
  if (divs.length === 0) return;

  const todayString = new Date().toDateString();

  if (loadedMenus[restaurantId] && loadedMenus[restaurantId].date === todayString) {
    const html = buildMenuHtml(loadedMenus[restaurantId].data, restaurantId);
    divs.forEach((d) => (d.innerHTML = html));
    return;
  }

  divs.forEach((d) => {
    d.innerHTML = '<div class="loading" role="status"><div class="loader-spinner"></div><div>Loading...</div></div>';
  });

  try {
    const response = await fetch(`${API_BASE_URL}/${restaurantId}`);

    if (!response.ok) {
      let errorText = `${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorText = errorData.error || errorText;
      } catch (e) { /* not JSON */ }
      throw new Error(errorText);
    }

    const menuData = await response.json();

    if (menuData.error && (!menuData.items || menuData.items.length === 0)) {
      throw new Error(menuData.error);
    }

    loadedMenus[restaurantId] = { date: todayString, data: menuData };
    const html = buildMenuHtml(menuData, restaurantId);
    divs.forEach((d) => (d.innerHTML = html));
  } catch (error) {
    const html = buildErrorHtml(restaurantId, error.message);
    divs.forEach((d) => (d.innerHTML = html));
  }
}

function retryLoad(restaurantId) {
  delete loadedMenus[restaurantId];
  loadMenu(restaurantId);
}

function loadAllMenus() {
  RESTAURANT_IDS.forEach((id) => loadMenu(id));
}

// --- View Toggle (Tabs / Cards) ---

let currentView = localStorage.getItem("viewMode") || "cards";

function setView(mode) {
  currentView = mode;
  localStorage.setItem("viewMode", mode);

  const tabView = document.getElementById("tab-view");
  const cardView = document.getElementById("card-view");

  if (mode === "tabs") {
    tabView.style.display = "";
    cardView.className = "cards-container";
  } else {
    tabView.style.display = "none";
    cardView.className = "cards-container active";
  }

  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === mode);
  });
}

// --- Tab Navigation ---

function openTab(tabName) {
  const tabs = document.querySelectorAll(".tab-content");
  tabs.forEach((t) => t.classList.remove("active"));

  const buttons = document.querySelectorAll(".tab-button");
  buttons.forEach((b) => {
    b.classList.remove("active");
    b.setAttribute("aria-selected", "false");
  });

  const target = document.getElementById(tabName);
  if (target) target.classList.add("active");

  const activeBtn = document.querySelector(`.tab-button[data-tab="${tabName}"]`);
  if (activeBtn) {
    activeBtn.classList.add("active");
    activeBtn.setAttribute("aria-selected", "true");
  }

  loadMenu(tabName);
}

function handleTabKeyboard(e) {
  const buttons = Array.from(document.querySelectorAll(".tab-button"));
  const currentIndex = buttons.indexOf(e.target);
  let newIndex;

  if (e.key === "ArrowRight") {
    newIndex = (currentIndex + 1) % buttons.length;
  } else if (e.key === "ArrowLeft") {
    newIndex = (currentIndex - 1 + buttons.length) % buttons.length;
  } else {
    return;
  }

  e.preventDefault();
  buttons[newIndex].focus();
  openTab(buttons[newIndex].dataset.tab);
}

// --- Theme ---

const themeToggle = document.getElementById("theme-toggle");
const themeLabel = document.getElementById("theme-label");

function setTheme(theme) {
  if (theme === "dark") {
    document.body.classList.add("dark-theme");
    themeToggle.checked = true;
    themeLabel.textContent = "Light";
    localStorage.setItem("theme", "dark");
  } else {
    document.body.classList.remove("dark-theme");
    themeToggle.checked = false;
    themeLabel.textContent = "Dark";
    localStorage.setItem("theme", "light");
  }
}

function initTheme() {
  const saved = localStorage.getItem("theme");
  if (saved) {
    setTheme(saved);
  } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    setTheme("dark");
  } else {
    setTheme("light");
  }
}

themeToggle.addEventListener("change", () => {
  setTheme(themeToggle.checked ? "dark" : "light");
});

// --- Header Date ---

function setHeaderDate() {
  const el = document.getElementById("header-date");
  if (el) {
    const now = new Date();
    el.textContent = now.toLocaleDateString("en-US", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
}

// --- App Info ---

async function loadAppInfo() {
  try {
    const response = await fetch("/api/app-info");
    if (!response.ok) return;
    const appInfo = await response.json();

    const el = document.querySelector(".app-info");
    if (el) {
      el.innerHTML = `v${appInfo.version} | <a href="${appInfo.lastCommit.url}" target="_blank" rel="noopener noreferrer" title="Last commit: ${appInfo.lastCommit.date}">${appInfo.lastCommit.hash}</a>`;
    }
  } catch (e) { /* silent */ }
}

// --- Init ---

document.addEventListener("DOMContentLoaded", () => {
  setHeaderDate();
  initTheme();
  setView(currentView);

  // Bind tab clicks + keyboard
  document.querySelectorAll(".tab-button").forEach((btn) => {
    btn.addEventListener("click", () => openTab(btn.dataset.tab));
    btn.addEventListener("keydown", handleTabKeyboard);
  });

  // Bind view switcher
  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  // Load all menus (both views share data via loadedMenus cache)
  loadAllMenus();

  loadAppInfo();
});
