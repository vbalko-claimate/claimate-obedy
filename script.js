const restaurantsData = [
    {
        name: "Restaurant Zátiší",
        proxyUrl: 'https://corsproxy.io/?',//'https://cors-anywhere.herokuapp.com/',
        targetUrl: encodeURIComponent('https://restaurantcafe.cz/restaurant-cafe-zatisi/denni-menu-zatisi/'),
        extractFunction: "extractTodaysMenuZatisi"
    },
    {
        name: "Spojovna",
        proxyUrl: 'https://corsproxy.io/?',//'https://cors-anywhere.herokuapp.com/',
        targetUrl: encodeURIComponent('https://pivovarspojovna.cz/menu/'),
        extractFunction: "extractTodaySpojovna"
    }, 
    {
        name: "Rangoli",
        proxyUrl: 'https://corsproxy.io/?',//'https://cors-anywhere.herokuapp.com/',
        targetUrl: encodeURIComponent('https://www.rangolikunratice.cz/cs/'),
        extractFunction: "extractTodayRangoli"
    },       
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
    let fetchCounter = 0; // Initialize counter

    restaurantsData.forEach(restaurant => {
        fetchMenu(restaurant, () => {
            // Increment counter within the callback
            fetchCounter++;
            // Check if all menus have been fetched
            if (fetchCounter === restaurantsData.length) {
                // Open the first tab only after all menus have been attempted to be fetched
                const firstTab = document.querySelector('.tablinks');
                if (firstTab) {
                    firstTab.click();
                }
            }
        });
    });
});

function fetchMenu(restaurant, callback) {
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

        // Extract and display today's menu
        const todaysMenu = extractors[restaurant.extractFunction](doc);
        displayMenu(restaurant, todaysMenu);
    })
    .catch(error => {
        console.error('There has been a problem with your fetch operation:', error);
    })
    .finally(() => {
        // Call the callback function regardless of the result
        callback();
    });
}

const extractors = {
    extractTodaysMenuZatisi: function(doc) {
        // Your existing logic to extract today's menu from the parsed HTML document
        const days = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];
        const today = new Date();
        const dayName = days[today.getDay()];
        let todaysMenu = "";
    
        const menuDateHeaders = doc.querySelectorAll('.wpb_text_column .wpb_wrapper h4');
        //regular menu
        menuDateHeaders.forEach(header => {
            //regular menu
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
            if (header.outerHTML.includes('<!--more-->') && header.nextElementSibling.tagName.toLowerCase() === 'p') {
                let sibling = header.nextElementSibling;
                while(sibling) {
                    if (sibling.tagName.toLowerCase() === 'p') {
                        todaysMenu += sibling.outerHTML;
                    } else {
                        break;
                    }
                    sibling = sibling.nextElementSibling;                
                }
            }
        });
    
        return todaysMenu !== "" ? `<h4>${dayName}</h4>${todaysMenu}` : '<p>Today\'s menu is not available.</p>';
    },
    extractTodaySpojovna: function(doc) {
        let todaysMenu = "";

        const menuDateHeaders = doc.querySelectorAll('#content > div > div > div > div > div.visible');

        menuDateHeaders.forEach(header => {
            todaysMenu += header.firstChild.nextElementSibling.outerHTML;
            const rows = header.querySelectorAll('tr');
            rows.forEach(row => {
                todaysMenu += `<p> ${row.innerText}</p>`;
            })
            todaysMenu += "";
        });

        return todaysMenu !== "" ? todaysMenu : '<p>Today\'s menu is not available.</p>';
    },
    extractTodayRangoli: function(doc) {
        let todaysMenu = "";

        const menuDateHeaders = doc.querySelectorAll('#daily-menu');

        menuDateHeaders.forEach(header => {
            todaysMenu += header.firstChild.nextElementSibling.outerHTML;
            const rows = header.querySelectorAll('p');
            rows.forEach(row => {
                todaysMenu += `<p> ${row.innerText}</p>`;
            })
            todaysMenu += "";
        });

        return todaysMenu !== "" ? todaysMenu : '<p>Today\'s menu is not available.</p>';
    }
}


