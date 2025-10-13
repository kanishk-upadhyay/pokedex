# Pokedex Web Application

A modern, interactive web-based Pokedex built with HTML, CSS, and vanilla JavaScript. Browse, search, and view details about your favorite Pokémon with enhanced performance and offline capabilities!

## Features

*   **Browse Pokémon:** Navigate through Pokémon using ID numbers with the D-pad controls or your keyboard.
*   **Search:** Find Pokémon quickly by name or National Pokédex number using the search bar.
*   **Detailed View:** See Pokémon sprites (front and back), types, moves, abilities, and a short description.
*   **Evolution Chain:** View the Pokémon's evolution line (if available).
*   **Caching:** Uses sophisticated local caching to speed up loading times for previously viewed Pokémon.
*   **Responsive Design:** Adapts to different screen sizes (basic responsiveness).
*   **Offline Support:** Comprehensive offline capabilities using service workers to cache static assets, API responses, and images.
*   **Fuzzy Search:** Enhanced search with multiple matching strategies including substring, startsWith, and fuzzy character matching.
*   **Keyboard Shortcuts:** Full keyboard navigation with '?' for help overlay showing all available shortcuts.
*   **Performance Optimized:** Improved loading with background preloading, request queuing, and progressive data loading.
*   **Modular Architecture:** Clean, maintainable code structure with separation of concerns (UI, API, Controller, DOM).

## Tech Stack

*   **HTML5:** Structure of the application.
*   **CSS3:** Styling and layout, including animations and CSS variables for theme management.
*   **Vanilla JavaScript (ES6+):** Application logic, API interaction, DOM manipulation.
*   **Service Workers:** Offline capabilities and intelligent caching strategies.
*   **[PokéAPI](https://pokeapi.co/):** Source for all Pokémon data.
*   **Modular JavaScript:** ES6 modules for better code organization and maintainability.

## Setup & Usage

1.  **Clone the repository (optional):**
    ```bash
    git clone https://github.com/kanishk-upadhyay/pokedex
    cd pokedex
    ```
2.  **Open the application:**
    Simply open the `index.html` file in your web browser.

    *Note: Due to browser security restrictions regarding local file access (CORS), some features like background preloading might work best when served from a simple local web server.* You can use tools like Python's `http.server` or Node.js's `live-server`:

    *   **Using Python:**
        ```bash
        python -m http.server
        # Then navigate to http://localhost:8000 in your browser
        ```
    *   **Using Node.js (requires `live-server` installed globally):**
        ```bash
        npm install -g live-server
        live-server
        # It should automatically open the page in your browser
        ```

## How it Works

The application fetches Pokémon data from the [PokéAPI](https://pokeapi.co/). It maintains a sophisticated local cache to avoid redundant API calls and implements rate limiting to be respectful to the API. 

The application uses a modular architecture with four main JavaScript modules:
- `controller.js`: Orchestrates the application flow and manages state
- `ui.js`: Handles all user interface rendering and interactions
- `api.js`: Manages API communication and caching with rate limiting
- `dom.js`: Provides safe and efficient DOM creation utilities

Service workers provide offline capabilities by caching static assets, API responses, and Pokémon sprites. The application progressively loads the complete Pokémon database on first use and stores it in localStorage for subsequent quick access.

User interactions trigger API requests or cache lookups, and the fetched data is dynamically displayed on the page by manipulating the DOM. Background preloading efficiently fetches adjacent Pokémon data for faster navigation.
