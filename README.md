# Prague Daily Menu Scraper

This project provides a simple web application to display the daily lunch menus for selected Prague restaurants:

- Menza Volha
- Café Zátisí
- Pivovar Spojovna
- Rangoli Kunratice

It scrapes the menus from their respective websites and presents them in a unified interface.

## Features

- Fetches daily menus for the listed restaurants.
- Handles different data sources (PDF for Volha, static HTML for Zátisí and Spojovna, hardcoded menu for Rangoli).
- Provides a clean web interface with light and dark theme options (toggleable and persistent via localStorage).
- Includes basic SEO optimizations.

## Prerequisites

- [Node.js](https://nodejs.org/) (which includes npm)

## Installation

1.  Clone this repository or download the source code.
2.  Navigate to the project directory in your terminal.
3.  Install the dependencies:
    ```bash
    npm install
    ```

## Running the Application

1.  Start the backend server:
    ```bash
    node server.js
    ```
    The server will typically run on `http://localhost:3000`.

2.  Open `http://localhost:3000` in your browser.

## Notes

- Web scraping can be fragile. If the restaurant websites change their structure, the scrapers may need updating.
- Menu parsing (especially from PDFs like Volha's) relies on specific text patterns and might need adjustments if the menu format changes significantly.
