const API_BASE_URL = "/api/menu";

const loadedMenus = {};
let restaurants = [];
let currentFilter = localStorage.getItem("filter") || "all";

// --- Fetch restaurant list from API ---

async function loadRestaurants() {
  try {
    const response = await fetch("/api/restaurants");
    restaurants = await response.json();
    renderGrid();
    loadAllMenus();
  } catch (e) {
    document.getElementById("restaurants-grid").innerHTML =
      '<div class="error-message">Failed to load restaurant list.</div>';
  }
}

// --- Render ---

function renderGrid() {
  const grid = document.getElementById("restaurants-grid");
  const filtered = restaurants.filter((r) => {
    if (currentFilter === "all") return true;
    return r.transport === currentFilter;
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<p style="padding:30px;text-align:center;">No restaurants match this filter.</p>';
    return;
  }

  // Sort: walk first, then by distance
  filtered.sort((a, b) => {
    if (a.transport !== b.transport) return a.transport === "walk" ? -1 : 1;
    return a.distance - b.distance;
  });

  grid.innerHTML = filtered
    .map((r) => {
      const transportIcon = r.transport === "walk" ? "&#128694;" : "&#128663;";
      return `
        <div class="restaurant-card menu-panel" id="card-${r.id}" data-transport="${r.transport}">
          <div class="card-header">
            <h2>${r.name}</h2>
            <span class="distance-badge ${r.transport}" title="${r.distance} min ${r.transport === 'walk' ? 'walking' : 'by car'}">
              ${transportIcon} ${r.distance} min
            </span>
          </div>
          <div class="card-area">${r.area}</div>
          <div class="card-body" id="menu-${r.id}">
            <div class="loading" role="status"><div class="loader-spinner"></div><div>Loading...</div></div>
          </div>
        </div>`;
    })
    .join("");
}

// --- Menu Display ---

function buildMenuHtml(menuData, restaurantId) {
  let html = "";

  if (menuData.items && menuData.items.length > 0) {
    html += '<ul class="menu-list">';
    let mainSectionStarted = false;
    menuData.items.forEach((item) => {
      const rawName = item.name || "Unnamed Item";
      const hasSoupKeyword = /^Pol[eé]vka[\s:]/i.test(rawName);
      const looksLikeSoup = !mainSectionStarted && /^0,[0-9]+l\s/i.test(rawName);
      const isSoup = hasSoupKeyword || looksLikeSoup;
      const displayName = hasSoupKeyword ? rawName.replace(/^Pol[eé]vka\s*:?\s*/i, "") : rawName;

      if (!isSoup && !mainSectionStarted) {
        mainSectionStarted = true;
        html += '<li class="menu-list-section-label" aria-hidden="true">Main courses</li>';
      }

      const itemClass = isSoup ? "menu-item menu-item--soup" : "menu-item menu-item--main";
      html += `<li class="${itemClass}"><div class="menu-item-info">`;

      if (isSoup) {
        html += '<span class="menu-item-type-label">Soup</span>';
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
    html += '<p class="empty-menu">No menu available today.</p>';
  }

  if (menuData.sourceUrl) {
    html += `<a href="${menuData.sourceUrl}" target="_blank" rel="noopener noreferrer" class="source-link">View original</a>`;
  }

  return html;
}

function humanizeError(rawError) {
  if (/timeout|ETIMEDOUT/i.test(rawError)) return "Restaurant website not responding.";
  if (/503|502|504/i.test(rawError)) return "Menu temporarily unavailable.";
  if (/network|ENOTFOUND|fetch/i.test(rawError)) return "Could not reach the server.";
  if (/Could not find/i.test(rawError)) return "Menu not found on restaurant website.";
  return "Menu unavailable right now.";
}

function buildErrorHtml(restaurantId, errorMessage) {
  const r = restaurants.find((r) => r.id === restaurantId);
  const sourceUrl = r ? r.sourceUrl : "#";

  let html = `<div class="error-message">${humanizeError(errorMessage)}`;
  html += `<br><button class="retry-btn" onclick="retryLoad('${restaurantId}')">Try again</button>`;
  html += `</div>`;
  html += `<a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" class="source-link">Visit restaurant website</a>`;
  return html;
}

// --- Load menus ---

async function loadMenu(restaurantId) {
  const menuDiv = document.getElementById(`menu-${restaurantId}`);
  if (!menuDiv) return;

  const todayString = new Date().toDateString();

  if (loadedMenus[restaurantId] && loadedMenus[restaurantId].date === todayString) {
    menuDiv.innerHTML = buildMenuHtml(loadedMenus[restaurantId].data, restaurantId);
    return;
  }

  menuDiv.innerHTML = '<div class="loading" role="status"><div class="loader-spinner"></div><div>Loading...</div></div>';

  try {
    const response = await fetch(`${API_BASE_URL}/${restaurantId}`);
    if (!response.ok) {
      let errorText = `${response.status}`;
      try { const d = await response.json(); errorText = d.error || errorText; } catch (e) {}
      throw new Error(errorText);
    }

    const menuData = await response.json();
    if (menuData.error && (!menuData.items || menuData.items.length === 0)) {
      throw new Error(menuData.error);
    }

    loadedMenus[restaurantId] = { date: todayString, data: menuData };
    menuDiv.innerHTML = buildMenuHtml(menuData, restaurantId);
  } catch (error) {
    menuDiv.innerHTML = buildErrorHtml(restaurantId, error.message);
  }
}

function retryLoad(restaurantId) {
  delete loadedMenus[restaurantId];
  loadMenu(restaurantId);
}

function loadAllMenus() {
  restaurants.forEach((r) => loadMenu(r.id));
}

// --- Filters ---

function setFilter(filter) {
  currentFilter = filter;
  localStorage.setItem("filter", filter);

  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === filter);
  });

  renderGrid();
  // Re-render menus from cache (no re-fetch)
  restaurants.forEach((r) => {
    const menuDiv = document.getElementById(`menu-${r.id}`);
    if (menuDiv && loadedMenus[r.id]) {
      menuDiv.innerHTML = buildMenuHtml(loadedMenus[r.id].data, r.id);
    }
  });
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
    el.textContent = new Date().toLocaleDateString("en-US", {
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
      el.innerHTML = `v${appInfo.version} | <a href="${appInfo.lastCommit.url}" target="_blank" rel="noopener noreferrer">${appInfo.lastCommit.hash}</a>`;
    }
  } catch (e) {}
}

// --- Init ---

document.addEventListener("DOMContentLoaded", () => {
  setHeaderDate();
  initTheme();

  // Bind filters
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => setFilter(btn.dataset.filter));
  });
  // Set initial active filter
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === currentFilter);
  });

  loadRestaurants();
  loadAppInfo();
});
