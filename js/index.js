/**
 * index.js - Main entry point for the Pokédex application
 *
 * This file serves as the application entry point, importing the
 * controller module and initializing the application when the DOM
 * is fully loaded.
 */

import { PokedexController } from "./controller.js";

// Initialize the application when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  // Create a new instance of the Pokédex controller
  const pokedex = new PokedexController();
});

// Export components for potential reuse in other parts of the application
export { PokedexController };
