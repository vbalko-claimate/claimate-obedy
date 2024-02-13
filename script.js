const restaurantsData = [
    {
        name: "Restaurant Zátiší",
        proxyUrl: 'https://cors-anywhere.herokuapp.com/',
        targetUrl: 'https://restaurantcafe.cz/restaurant-cafe-zatisi/denni-menu-zatisi/'
    }
    // Add more restaurant objects as needed
];

function openMenu(evt, restaurantName) {
    const tabcontents = document.getElementsByClassName("tabcontent");
    for (let i = 0; i < tabcontents.length; i++) {
        tabcontents[i].style.display = "none";
    }
    const tablinks = document.getElementsByClassName("tablinks");
    for (let i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(restaurantName).style.display = "block";
    evt.currentTarget.className += " active";
}

// Modified to accept HTML string for menuItems
function displayMenu(restaurant, menuItemsHtml) {
    const tabsContainer = document.querySelector('.tabs');
    const tabContentsContainer = document.querySelector('.tab-contents');

    // Create tab button
    const tabButton = document.createElement('button');
    tabButton.className = 'tablinks';
    tabButton.textContent = restaurant.name;
    const formattedName = restaurant.name.replace(/\s+/g, '');
    tabButton.onclick = function (evt) { openMenu(evt, formattedName); };
    tabsContainer.appendChild(tabButton);

    // Create tab content
    const tabContent = document.createElement('div');
    tabContent.id = formattedName;
    tabContent.className = 'tabcontent';
    tabContent.innerHTML = `<h3>${restaurant.name}</h3><div class="menu-container">${menuItemsHtml}</div>`;
    tabContentsContainer.appendChild(tabContent);
}

document.addEventListener('DOMContentLoaded', function () {
    restaurantsData.forEach(restaurant => {
        fetchMenu(restaurant);
    });
});

function fetchMenu(restaurant) {
    const apiUrl = `${restaurant.proxyUrl}${restaurant.targetUrl}`;

    fetch(apiUrl)
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.text();
    })
    .then(html => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        // Extract today's menu based on the day of the week
        const todaysMenu = extractTodaysMenu(doc);

        // Display the menu in its tab
        displayMenu(restaurant, todaysMenu);
    })
    .catch(error => {
        console.error('There has been a problem with your fetch operation:', error);
    });

    // Make sure to open the first tab after all menus are attempted to be fetched
    if (restaurantsData.indexOf(restaurant) === 0) {
        setTimeout(() => {
            const firstTab = document.querySelector('.tablinks');
            if (firstTab) {
                firstTab.click();
            }
        }, 100);
    }
}

function extractTodaysMenu(doc) {
    // Your existing logic to extract today's menu from the parsed HTML document
    const days = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];
    const today = new Date();
    const dayName = days[today.getDay()];
    let todaysMenu = "";

    const menuDateHeaders = doc.querySelectorAll('.wpb_text_column .wpb_wrapper h4');
    menuDateHeaders.forEach(header => {
        if (header.textContent.includes(dayName)) {
            let sibling = header.nextElementSibling;
            while (sibling) {
                if (sibling.tagName.toLowerCase() === 'p') {
                    todaysMenu += sibling.outerHTML;
                } else if (sibling.tagName.toLowerCase() === 'h4') {
                    break;
                }
                sibling = sibling.nextElementSibling;
            }
        }
    });

    return todaysMenu !== "" ? `<h4>${dayName}</h4>${todaysMenu}` : '<p>Today\'s menu is not available.</p>';
}
