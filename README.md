# Prague Daily Menu Scraper 

This project provides a simple web application to display the daily lunch menus for selected Prague restaurants:

- Menza Volha
- Café Zátisí
- Pivovar Spojovna

It scrapes the menus from their respective websites and presents them in a unified interface.

## Features

- Fetches daily menus for the listed restaurants.
- Handles different data sources (PDF for Volha, dynamic HTML for Spojovna, static HTML for Zátisí).
- Uses Puppeteer for scraping JavaScript-rendered content (Spojovna).
- Provides a clean web interface with light and dark theme options (toggleable and persistent via localStorage).
- Includes basic SEO optimizations.

## Prerequisites

- [Node.js](https://nodejs.org/) (which includes npm)

## Installation

1.  Clone this repository or download the source code.
2.  Navigate to the project directory (`menu-app-backend`) in your terminal.
3.  Install the dependencies:
    ```bash
    npm install
    ```

## Running the Application

1.  Make sure you are in the project directory (`menu-app-backend`).
2.  Start the backend server:
    ```bash
    node server.js
    ```
    The server will typically run on `http://localhost:3000`.

## Accessing the Frontend

1.  Once the backend server is running, simply open the `index.html` file directly in your web browser.
    - You can usually do this by double-clicking the file or using `File -> Open File...` in your browser.

The frontend will automatically fetch menu data from the running backend server (assuming it's running on `http://localhost:3000`).

## Notes

- Web scraping can be fragile. If the restaurant websites change their structure, the scrapers (especially for Volha and Spojovna) may need updating.
- The Spojovna scraper uses Puppeteer, which involves running a headless browser instance. This is necessary for that site but can be resource-intensive and slower than direct HTML/PDF fetching.
- Menu parsing (especially from PDFs like Volha's) relies on specific text patterns and might need adjustments if the menu format changes significantly.
test change
test fix for real-time deployment streaming
