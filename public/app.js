const API_BASE_URL = "/api/menu";

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

function displayMenu(contentDiv, menuData, restaurantId) {
  const name = menuData.restaurantName || restaurantNames[restaurantId] || restaurantId;
  contentDiv.innerHTML = `<h2>${name}</h2>`;

  if (menuData.items && menuData.items.length > 0) {
    let menuHtml = '<ul class="menu-list">';
    menuData.items.forEach((item) => {
      menuHtml += '<li class="menu-item">';
      menuHtml += `<strong>${item.name || "Unnamed Item"}</strong>`;
      if (item.price && item.price !== "N/A") {
        menuHtml += ` <span class="price">(${item.price})</span>`;
      }
      if (item.description) {
        const cleaned = item.description.replace(/\s\s+/g, " ").trim();
        if (cleaned) {
          menuHtml += `<br><em class="description">${cleaned}</em>`;
        }
      }
      menuHtml += "</li>";
    });
    menuHtml += "</ul>";
    contentDiv.innerHTML += menuHtml;
  } else {
    contentDiv.innerHTML += "<p>Menu not available or empty today.</p>";
  }

  if (loadedMenus[restaurantId] && loadedMenus[restaurantId].date) {
    const updateDate = new Date(loadedMenus[restaurantId].date);
    const formattedDate = updateDate.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    contentDiv.innerHTML += `<p class="last-updated">Last updated: ${formattedDate}</p>`;
  }

  if (menuData.sourceUrl) {
    contentDiv.innerHTML += `<a href="${menuData.sourceUrl}" target="_blank" rel="noopener noreferrer" class="source-link">View Original Source</a>`;
  }
}

function displayError(contentDiv, restaurantId, errorMessage) {
  const name = restaurantNames[restaurantId] || restaurantId;
  const sourceUrl = restaurantSourceUrls[restaurantId];

  contentDiv.innerHTML = `<h2>${name}</h2>`;
  contentDiv.innerHTML += `
    <div class="error-message">
      Menu dnes nedostupne / Menu unavailable today.<br>
      <small>${errorMessage}</small>
    </div>`;

  if (sourceUrl) {
    contentDiv.innerHTML += `<a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" class="source-link">Zobrazit menu na webu restaurace</a>`;
  }
}

async function loadMenu(restaurantId) {
  const contentDiv = document.getElementById(restaurantId);
  if (!contentDiv) return;

  const todayString = new Date().toDateString();

  if (loadedMenus[restaurantId] && loadedMenus[restaurantId].date === todayString) {
    displayMenu(contentDiv, loadedMenus[restaurantId].data, restaurantId);
    return;
  }

  contentDiv.innerHTML =
    '<div class="loading"><div class="loader-spinner"></div><div>Loading Menu...</div></div>';

  try {
    const response = await fetch(`${API_BASE_URL}/${restaurantId}`);

    if (!response.ok) {
      let errorText = `Error fetching menu: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorText = errorData.error || errorText;
      } catch (e) {
        /* response not JSON */
      }
      throw new Error(errorText);
    }

    const menuData = await response.json();

    if (menuData.error && (!menuData.items || menuData.items.length === 0)) {
      throw new Error(menuData.error);
    }

    loadedMenus[restaurantId] = { date: todayString, data: menuData };
    displayMenu(contentDiv, menuData, restaurantId);
  } catch (error) {
    displayError(contentDiv, restaurantId, error.message);
  }
}

function openTab(evt, tabName) {
  const tabcontent = document.getElementsByClassName("tab-content");
  for (let i = 0; i < tabcontent.length; i++) {
    tabcontent[i].style.display = "none";
  }
  const tablinks = document.getElementsByClassName("tab-button");
  for (let i = 0; i < tablinks.length; i++) {
    tablinks[i].className = tablinks[i].className.replace(" active", "");
  }
  document.getElementById(tabName).style.display = "block";
  evt.currentTarget.className += " active";
  loadMenu(tabName);
}

// Theme
const themeToggle = document.getElementById("theme-toggle");
const currentTheme = localStorage.getItem("theme");

function setTheme(theme) {
  if (theme === "dark") {
    document.body.classList.add("dark-theme");
    themeToggle.checked = true;
    localStorage.setItem("theme", "dark");
  } else {
    document.body.classList.remove("dark-theme");
    themeToggle.checked = false;
    localStorage.setItem("theme", "light");
  }
}

if (currentTheme) {
  setTheme(currentTheme);
} else {
  setTheme("dark");
}

themeToggle.addEventListener("change", () => {
  setTheme(themeToggle.checked ? "dark" : "light");
});

// App Info
async function loadAppInfo() {
  try {
    const response = await fetch("/api/app-info");
    if (!response.ok) throw new Error("Failed to fetch app info");
    const appInfo = await response.json();

    const appInfoElement = document.querySelector(".app-info");
    if (appInfoElement) {
      appInfoElement.innerHTML = `
        Version ${appInfo.version} |
        <span title="Last commit on ${appInfo.lastCommit.date}">
          Commit <a href="${appInfo.lastCommit.url}" target="_blank" rel="noopener noreferrer">
          ${appInfo.lastCommit.hash}
          </a>
        </span>
      `;
    }
  } catch (error) {
    console.error("Error loading app info:", error);
  }
}

// Init
document.addEventListener("DOMContentLoaded", () => {
  const firstActiveButton = document.querySelector(".tab-button.active");
  if (firstActiveButton) {
    const initialTabName = firstActiveButton.getAttribute("data-tab");
    if (initialTabName) {
      loadMenu(initialTabName);
    }
  }
  loadAppInfo();
});
