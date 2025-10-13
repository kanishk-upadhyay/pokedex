# Pokédex Web Application

![Pokéball](pokeball.svg)

A modern, interactive, and feature-rich Pokédex web application built with vanilla HTML, CSS, and JavaScript. It provides a fast and engaging experience for browsing and searching for your favorite Pokémon, complete with offline capabilities.

Screenshot: [Pokédex](pokedex.png)
---

## Key Features

*   **Comprehensive Pokémon Data:** View sprites (front & back), types, abilities, moves, and evolution chains for over 1,000 Pokémon species.
*   **Advanced Fuzzy Search:** Instantly find Pokémon by name or Pokédex number with powerful typo-tolerant search that handles special forms (e.g., "mega charizard" for "charizard-mega").
*   **Interactive UI with Multiple Navigation Options:**
    *   D-pad controls for sequential browsing
    *   Full keyboard navigation with '?' for shortcuts
    *   Number pad for direct ID entry
    *   Clickable search suggestions with dynamic sizing
*   **Enhanced Visual Design:**
    *   Pokémon names styled with primary type color as text fill and secondary type color as text stroke for dual-type Pokémon
    *   Responsive grid layout for search suggestions
    *   Dynamic glass-like effects and animations
*   **Offline First Architecture:** Fully functional offline experience using Service Worker technology to cache assets, API data, and images.
*   **Performance Optimized:**
    *   Smart LRU caching system for efficient memory management
    *   Background preloading of adjacent Pokémon for faster navigation
    *   Progressive data loading for quick initial load times
    *   Request queuing to respect API rate limits
*   **Evolution Chain Visualization:** View complete evolution lines with clear visual indicators.
*   **Sprite Interaction:** Click Pokémon sprites to toggle between front and back views with appropriate error handling.

---

## Tech Stack

*   **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+)
*   **Build System:** ES6 Modules for modular architecture
*   **API:** [PokéAPI V2](https://pokeapi.co/)
*   **Offline Storage:** Service Worker API, LocalStorage
*   **Algorithms:** Levenshtein distance for fuzzy search, LRU cache implementation

---

## Architecture

The application follows a modular architecture with clear separation of concerns:

*   **`controller.js`:** Main application orchestrator, manages state and coordinates between modules
*   **`ui.js`:** Handles all DOM manipulation, rendering, and user interactions
*   **`api.js`:** Manages API communication, caching, and rate limiting
*   **`dom.js`:** Safe and efficient DOM creation utilities
*   **`sw.js`:** Service worker for offline capabilities and caching

---

## Getting Started

### Prerequisites

All you need is a modern web browser that supports ES6 modules and Service Workers (e.g., Chrome, Firefox, Safari, Zen).

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

## Performance & Offline Capabilities

The application is built with performance and offline functionality as core priorities:

*   **Service Worker:** Caches static assets and API responses for offline use
*   **Smart Caching:** LRU cache with TTL expiration for efficient memory usage
*   **Progressive Loading:** Loads Pokémon database in chunks to prevent UI blocking
*   **Background Preloading:** Fetches adjacent Pokémon data for instant navigation
*   **Request Queuing:** Prevents API rate limit issues during heavy usage
