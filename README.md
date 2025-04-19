# Pokedex Web Application

A simple, interactive web-based Pokedex built with HTML, CSS, and vanilla JavaScript. Browse, search, and view details about your favorite Pokémon!

## Features

*   **Browse Pokémon:** Navigate through Pokémon using ID numbers with the D-pad controls or your keyboard.
*   **Search:** Find Pokémon quickly by name or National Pokédex number using the search bar.
*   **Detailed View:** See Pokémon sprites (front and back), types, abilities, and a short description.
*   **Evolution Chain:** View the Pokémon's evolution line (if available).
*   **Caching:** Uses local caching to speed up loading times for previously viewed Pokémon.
*   **Responsive Design:** Adapts to different screen sizes (basic responsiveness).
*   **Background Loading:** Preloads Pokémon data in the background for faster access.

## Tech Stack

*   **HTML5:** Structure of the application.
*   **CSS3:** Styling and layout, including animations.
*   **Vanilla JavaScript (ES6+):** Application logic, API interaction, DOM manipulation.
*   **[PokéAPI](https://pokeapi.co/):** Source for all Pokémon data.

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

The application fetches Pokémon data from the [PokéAPI](https://pokeapi.co/). It maintains a local cache to avoid redundant API calls. User interactions trigger API requests or cache lookups, and the fetched data is dynamically displayed on the page by manipulating the DOM. Background preloading fetches the list of all Pokémon names and IDs incrementally to speed up searches.