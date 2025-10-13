/**
 * controller.js - Main application controller that coordinates between UI, API and data
 */

import { UIController } from "./ui.js";
import { PokemonAPI, Cache, StorageHelper, SEARCH_DEBOUNCE_MS as SEARCH_DEBOUNCE_MS_FROM_API, PRELOAD_MAX_ADJACENT, NAME_LIST_KEY, NAME_LIST_TS_KEY, NAME_LIST_TTL } from "./api.js";

const SEARCH_DEBOUNCE_MS = SEARCH_DEBOUNCE_MS_FROM_API;
const PRELOAD_MAX = PRELOAD_MAX_ADJACENT;

/**
 * Main controller class for the Pokédex application
 * 
 * This class orchestrates the entire application flow, handling:
 * - User interactions (navigation, search, keyboard input)
 * - API communication through PokemonAPI
 * - State management (pokemon cache, list, current view)
 * - UI updates through UIController
 * - Offline functionality via service worker
 * 
 * The controller follows a modular architecture where responsibilities are
 * separated into distinct modules (UI, API, DOM), with this class serving
 * as the central coordination point.
 */
class PokedexController {
  constructor() {
    this.config = {
      app: { defaultId: 1, maxPreloadPokemon: PRELOAD_MAX },
      storage: {
        nameListKey: NAME_LIST_KEY,
        nameListTsKey: NAME_LIST_TS_KEY,
        nameListTTL: NAME_LIST_TTL,
      },
    };

    this.ui = new UIController();
    this.state = {
      currentId: this.config.app.defaultId,
      pokemonCache: new Cache(),
      pokemonList: [],
      pokemonNameMap: new Map(),
      totalPokemon: 0,
      isNavigating: false,
      searchTimeout: null,
      searchAbortController: null,
    };

    this.api = new PokemonAPI({ cache: this.state.pokemonCache });
    this.init();
  }

  /**
   * Initialize the application
   */
  async init() {
    window.addEventListener("load", async () => {
      this.ui.setupBlueButtonGrid();
      this.ui.initPokedexState();

      // Set up event handlers (search is debounced)
      this.ui.initEventListeners({
        onTogglePokedex: () => this.togglePokedex(),
        onNavigate: (direction) => this.navigatePokemon(direction),
        onSearch: () => this.scheduleSearch(),
        onKeyboardNavigation: (key) => this.handleKeyNavigation(key),
        onShowShortcuts: () => this.ui.showShortcuts(),
      });

      // Register service worker (best-effort)
      this.registerServiceWorker();

      // Load pokemon list for search functionality
      await this.loadPokemonList();
    });
  }

  /**
   * Register service worker for offline capability
   */
  registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Silent failure - service worker is optional
      });
    }

    // Add offline detection
    this.setupOfflineDetection();
  }

  /**
   * Setup offline detection and user feedback
   */
  setupOfflineDetection() {
    const updateOnlineStatus = () => {
      if (navigator.onLine) {
        this.ui.clearOfflineMessage();
      } else {
        this.ui.showOfflineMessage();
      }
    };

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    // Check initial state
    updateOnlineStatus();
  }

  /**
   * Handle keyboard navigation
   */
  handleKeyNavigation(key) {
    if (!this.ui.isPokedexOpen()) return;

    // Don't handle arrow keys when search input is focused (for text editing)
    if (this.ui.searchInput && document.activeElement === this.ui.searchInput) {
      if (key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight") {
        return; // Let the browser handle arrow keys for text cursor movement
      }
    }

    // Handle special keys first
    if (key === "?") {
      this.ui.showShortcuts();
      return;
    }
    
    if (key === "Escape") {
      this.ui.hideShortcuts();
      return;
    }

    const keyMap = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      Enter: "search",
    };

    const action = keyMap[key];
    if (!action) return;

    if (action === "search") {
      this.scheduleSearch();
    } else {
      this.navigatePokemon(action);
    }
  }

  /**
   * Toggle the Pokédex open/closed state
   */
  togglePokedex() {
    const isNowOpen = this.ui.togglePokedex();

    if (isNowOpen) {
      this.ui.searchInput?.focus();

      if (this.state.pokemonList.length > 0) {
        this.loadStarterPokemon();
      }
    }
  }

  /**
   * Navigate to adjacent Pokémon using the D-pad
   */
  async navigatePokemon(direction) {
    if (this.state.isNavigating) return;
    this.state.isNavigating = true;

    const currentIndex = this.state.pokemonList.findIndex(
      (p) => p.id === this.state.currentId,
    );

    if (currentIndex === -1) {
      this.state.isNavigating = false;
      return;
    }

    let nextIndex;
    switch (direction) {
      case "up":
        nextIndex = Math.max(0, currentIndex - 10);
        break;
      case "down":
        nextIndex = Math.min(
          this.state.pokemonList.length - 1,
          currentIndex + 10,
        );
        break;
      case "left":
        nextIndex = Math.max(0, currentIndex - 1);
        break;
      case "right":
        nextIndex = Math.min(
          this.state.pokemonList.length - 1,
          currentIndex + 1,
        );
        break;
      default:
        nextIndex = currentIndex;
    }

    if (nextIndex !== currentIndex) {
      const nextPokemon = this.state.pokemonList[nextIndex];
      try {
        await this.fetchPokemonById(nextPokemon.id);
      } catch (err) {
        this.ui.showError("Navigation failed. Try another direction.");
      }
    }

    this.state.isNavigating = false;
  }

  loadStarterPokemon() {
    // Load a random starter Pokémon including popular choices
    const starterIds = [1, 2, 3,   // Bulbasaur family
                       4, 5, 6,   // Charmander family  
                       7, 8, 9,   // Squirtle family
                       25, 26,    // Pikachu, Raichu
                       129, 130,  // Magikarp, Gyarados
                       150, 151]; // Mewtwo, Mew
                       
    // Only choose from starters that exist in the list
    const availableStarters = this.state.pokemonList
      .filter(p => starterIds.includes(p.id));
    
    let pokemonToLoad;
    
    if (availableStarters.length > 0) {
      // Pick a random starter from our enhanced list
      const randomStarter = availableStarters[Math.floor(Math.random() * availableStarters.length)];
      pokemonToLoad = randomStarter;
    } else {
      // Fallback to any random Pokémon if starters aren't available
      const randomIndex = Math.floor(
        Math.random() * this.state.pokemonList.length,
      );
      pokemonToLoad = this.state.pokemonList[randomIndex];
    }
    
    this.fetchPokemonById(pokemonToLoad.id).catch((err) => {
      if (err?.name !== "AbortError") {
        this.ui.showWarningMessage("Failed to load starter Pokémon");
        console.error("Failed to fetch starter Pokémon:", err);
      }
    });
  }

  async loadPokemonList() {
    const { key, tsKey, ttl } = this.config.storage;

    const countData = await this.api.getPokemonList(1);
    const apiCount = countData.count;
    const persisted = StorageHelper.loadFromStorage(key, ttl);

    if (persisted?.length === apiCount) {
      this.state.pokemonList = persisted;
      this.state.pokemonNameMap = new Map(
        persisted.map((p) => [p.name.toLowerCase(), p.id]),
      );
      this.state.totalPokemon = apiCount;
      return;
    }

    // Use progressive loading
    await this.progressivelyLoadPokemonList();
  }

  async progressivelyLoadPokemonList() {
    const { key } = this.config.storage;
    const PAGE_SIZE = 200; // Smaller page size for progressive loading
    
    console.log("Loading Pokédex database (this may take a moment)...");

    try {
      // Use temporary variables to avoid partial state updates
      const tempList = [];
      const tempNameMap = new Map();
      let url = `pokemon?limit=${PAGE_SIZE}&offset=0`;
      let hasMore = true;

      while (hasMore) {
        const data = await this.api.fetchData(url);
        
        // Process this page of data
        for (const result of data.results) {
          const id = parseInt(result.url.split("/").slice(-2, -1)[0], 10);
          if (!isNaN(id)) {
            const pokemon = { name: result.name, id };
            tempList.push(pokemon);
            tempNameMap.set(result.name.toLowerCase(), id);
          }
        }
        
        // Yield control back to the browser periodically
        if (data.results.length > 0) {
          await this.yieldToMain();
        }
        
        if (data.next) {
          url = data.next;
        } else {
          hasMore = false;
        }
      }
      
      // Only update state if all data was loaded successfully
      this.state.pokemonList = tempList;
      this.state.pokemonNameMap = tempNameMap;
      this.state.totalPokemon = tempList.length;
      StorageHelper.saveToStorage(key, tempList);
      console.log("Pokédex database loaded successfully!");
    } catch (err) {
      if (err?.name !== "AbortError") {
        this.ui.showError("Error loading Pokédex database. Try refreshing.");
        console.error("Error loading pokemon list progressively:", err);
      }
      // State remains unchanged if error occurs during loading
    }
    // After loading the list, if the pokedex is open, load a starter Pokemon
    if (this.ui.isPokedexOpen() && this.state.pokemonList.length > 0) {
      this.loadStarterPokemon();
    }
  }
  
  // Helper function to yield control back to the main thread
  yieldToMain() {
    return new Promise(resolve => {
      setTimeout(resolve, 0);
    });
  }

  async fetchPokemonById(id, options = {}) {
    try {
      this.ui.showLoading("Loading...");
      const pokemon = await this.getPokemonData(id, options);
      this.state.currentId = pokemon.id;
      this.ui.setSearchValue(pokemon.name);
      await this.ui.displayPokemon(pokemon);
      this.preloadAdjacentPokemon(id);
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      this.ui.showError(`Error loading Pokemon #${id}.`);
      this.ui.clearMainScreen();
      throw err;
    }
  }

  async getPokemonData(idOrName, options = {}) {
    const isNumber =
      typeof idOrName === "number" || /^\d+$/.test(String(idOrName));
    const key = isNumber ? Number(idOrName) : `name_${idOrName.toLowerCase()}`;

    const cached = this.state.pokemonCache.get(key);
    if (cached) {
      if (!isNumber) this.state.currentId = cached.id;
      return cached;
    }

    try {
      const data = await this.api.getPokemon(idOrName, options);
      if (data.species?.url) {
        data.speciesData = await this.api.fetchData(data.species.url, options);
        if (data.speciesData?.evolution_chain?.url) {
          data.evolutionData = await this.api.fetchData(
            data.speciesData.evolution_chain.url,
            options,
          );
        }
      }

      this.state.pokemonCache.set(data.id, data);
      this.state.pokemonCache.set(`name_${data.name.toLowerCase()}`, data);
      this.state.pokemonNameMap.set(data.name.toLowerCase(), data.id);
      return data;
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      console.error(`Error fetching Pokemon data for ${idOrName}:`, err);
      throw err;
    }
  }

  scheduleSearch() {
    if (this.state.searchAbortController)
      this.state.searchAbortController.abort();
    if (this.state.searchTimeout) clearTimeout(this.state.searchTimeout);

    const ac = new AbortController();
    this.state.searchAbortController = ac;
    this.state.searchTimeout = setTimeout(() => {
      this._performSearch({ signal: ac.signal }).finally(() => {
        this.state.searchTimeout = null;
        this.state.searchAbortController = null;
      });
    }, SEARCH_DEBOUNCE_MS);
  }

  async _performSearch(options = {}) {
    const raw = this.ui.getSearchValue();
    if (!raw) {
      this.ui.showMessage("Enter a Pokémon name or number.");
      return;
    }

    const query = raw.toLowerCase();
    this.ui.showLoading("Searching...");

    if (/^\d+$/.test(query)) {
      const id = parseInt(query, 10);
      if (id >= 1 && id <= this.state.totalPokemon) {
        await this.fetchPokemonById(id, options);
      } else {
        this.ui.showError(`Pokémon #${id} out of range.`);
        this.ui.clearMainScreen();
      }
      return;
    }

    const exactMatch = this.state.pokemonNameMap.get(query);
    if (exactMatch) {
      await this.fetchPokemonById(exactMatch, options);
      return;
    }

    // Implement progressive search with virtual scrolling
    await this.renderSearchSuggestions(query);
  }

  async renderSearchSuggestions(query) {
    const exactMatch = this.state.pokemonNameMap.get(query);
    if (exactMatch) {
      await this.fetchPokemonById(exactMatch);
      return;
    }

    // Implement fuzzy search with multiple matching strategies
    const allMatches = this._fuzzySearch(query);
    
    // If there's only one match, show its details directly
    if (allMatches.length === 1) {
      const singleMatchId = this.state.pokemonNameMap.get(allMatches[0]);
      if (singleMatchId) {
        await this.fetchPokemonById(singleMatchId);
        return;
      }
    }

    if (allMatches.length > 0) {
      // Use virtual scrolling to render only visible items
      this.ui.renderPaginatedSuggestions(allMatches, 10); // Show 10 at a time
      this.ui.clearMainScreen();
    } else {
      this.ui.showError("Pokémon not found. Check spelling.");
      this.ui.clearMainScreen();
    }
  }
  
  /**
   * Performs fuzzy search with multiple matching strategies
   * @param {string} query - The search query
   * @returns {Array<string>} - Array of matching Pokémon names
   */
  _fuzzySearch(query) {
    const allNames = Array.from(this.state.pokemonNameMap.keys());
    
    // First, try exact substring matches (for performance)
    let exactMatches = allNames.filter(name => name.includes(query));
    
    if (exactMatches.length > 0) {
      return exactMatches.slice(0, 100); // Limit to 100 matches
    }
    
    // If no exact matches, try more fuzzy approaches
    // 1. StartsWith matches
    let startsWithMatches = allNames.filter(name => name.startsWith(query));
    
    if (startsWithMatches.length > 0) {
      return startsWithMatches.slice(0, 100);
    }
    
    // 2. Fuzzy character matching (allowing for typos, but simple approach)
    // For example: "pikcu" could match "pikachu" 
    let fuzzyMatches = [];
    
    // Simple fuzzy search by checking if all characters in query appear in order
    for (const name of allNames) {
      if (this._isFuzzyMatch(query, name)) {
        fuzzyMatches.push(name);
        if (fuzzyMatches.length >= 100) break; // Limit results
      }
    }
    
    // Sort results by length (shorter matches first) to show more relevant results
    fuzzyMatches.sort((a, b) => a.length - b.length);
    
    return fuzzyMatches.slice(0, 100);
  }
  
  /**
   * Simple fuzzy matching algorithm
   * Checks if query characters appear in the target in the same order
   * @param {string} query - Query string
   * @param {string} target - Target string to match against
   * @returns {boolean} - Whether it's a fuzzy match
   */
  _isFuzzyMatch(query, target) {
    if (!query || !target) return false;
    
    query = query.toLowerCase();
    target = target.toLowerCase();
    
    let queryIndex = 0;
    let targetIndex = 0;
    
    while (queryIndex < query.length && targetIndex < target.length) {
      if (query[queryIndex] === target[targetIndex]) {
        queryIndex++;
      }
      targetIndex++;
    }
    
    return queryIndex === query.length;
  }

  preloadAdjacentPokemon(currentId) {
    if (!window?.requestIdleCallback) {
      // Fallback to setTimeout if requestIdleCallback is not available
      setTimeout(() => this._preloadAdjacent(currentId), 300);
      return;
    }
    
    // Use requestIdleCallback to avoid blocking the main thread
    window.requestIdleCallback(() => {
      this._preloadAdjacent(currentId);
    }, { timeout: 2000 });
  }
  
  async _preloadAdjacent(currentId) {
    const currentIndex = this.state.pokemonList.findIndex(p => p.id === currentId);
    if (currentIndex === -1) return;

    // Only preload the most likely navigation targets
    const preloadIndices = [
      Math.max(0, currentIndex - 1),  // Previous
      Math.min(this.state.pokemonList.length - 1, currentIndex + 1),  // Next
      Math.max(0, currentIndex - 10), // Up (if applicable) 
      Math.min(this.state.pokemonList.length - 1, currentIndex + 10)  // Down (if applicable)
    ];
    
    // Remove duplicates and get unique IDs to preload
    const preloadIds = [...new Set(preloadIndices.map(i => this.state.pokemonList[i].id))]
      .filter(id => !this.state.pokemonCache.get(id))
      .slice(0, this.config.app.maxPreloadPokemon); // Limit number to preload

    if (preloadIds.length > 0) {
      // Use Promise.allSettled to continue preloading even if some fail
      await Promise.allSettled(
        preloadIds.map(id => this.getPokemonData(id).catch(() => {}))
      );
    }
  }
}

export { PokedexController };
