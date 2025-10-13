# Pokédex Web Application

![Pokéball](pokeball.svg)

A modern, interactive, and feature-rich Pokédex web application built with vanilla HTML, CSS, and JavaScript. It provides a fast and engaging experience for browsing and searching for your favorite Pokémon, complete with offline capabilities.

**(Optional: Add a screenshot of the application here)**

---

## Key Features

*   **Comprehensive Pokémon Data:** View sprites (front & back), types, abilities, moves, and evolution chains.
*   **Advanced Search:** Instantly find Pokémon by name or Pokédex number with a powerful fuzzy search engine that handles typos and special forms (e.g., "mega charizard").
*   **Interactive UI:** A design inspired by the classic Pokédex, with clickable controls and full keyboard navigation.
*   **Offline First:** Thanks to a Service Worker, the application is fully functional offline, caching all necessary assets and API data.
*   **Performance Optimized:** Smart caching, background preloading of adjacent Pokémon, and a modular architecture ensure a fast and smooth experience.

---

## Tech Stack

*   **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+)
*   **API:** [PokéAPI V2](https://pokeapi.co/)
*   **Offline Storage:** Service Worker API, LocalStorage

---

## Getting Started

### Prerequisites

All you need is a modern web browser that supports ES6 modules and Service Workers (e.g., Chrome, Firefox, Safari, Edge).

### Installation & Running Locally

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/pokedex.git
    cd pokedex
    ```

2.  **Open the application:**
    For the best experience (especially for features like offline caching), it's recommended to run this project using a simple local web server.

    *   **Using Python:**
        ```bash
        python -m http.server
        ```
        Then, open `http://localhost:8000` in your browser.

    *   **Using Node.js (with `live-server`):**
        ```bash
        npm install -g live-server
        live-server
        ```
        This will automatically open the page in your browser.

    You can also open the `index.html` file directly in your browser, but some features may be limited by browser security policies for local files.

---

## How It Works

The application is built with a modular architecture to separate concerns:

*   `controller.js`: The main brain of the application, orchestrating UI, data, and state management.
*   `ui.js`: Handles all DOM manipulation, rendering, and user-facing interactions.
*   `api.js`: Manages all communication with the PokéAPI, including request throttling and caching.
*   `dom.js`: Contains utility functions for creating DOM elements programmatically.

A **Service Worker** (`sw.js`) runs in the background, intercepting network requests to serve cached assets and data when the user is offline, ensuring a seamless experience. Pokémon data is cached using an LRU (Least Recently Used) strategy to manage memory, and the full list of Pokémon names is stored in `localStorage` for quick search access.
