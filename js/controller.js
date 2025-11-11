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
 * - Advanced search with typo tolerance and special form matching (e.g. "mega charizard" for "charizard-mega")
 * - Clickable search suggestions that load Pokémon details and update search bar
 * - Enhanced sprite interaction with improved error handling
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
      pokemonNameArray: [], // Cached array of pokemon names for search performance
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
      // Don't automatically focus the search bar - let user do it manually
      // This allows the existing Pokémon name to remain until user explicitly focuses to type

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
      this.state.pokemonNameArray = Array.from(this.state.pokemonNameMap.keys());
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
      this.state.pokemonNameArray = Array.from(tempNameMap.keys());
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
      this.ui.renderPaginatedSuggestions(allMatches, 10, (selectedItem) => {
        // When a suggestion is clicked, load that Pokémon
        const selectedId = this.state.pokemonNameMap.get(selectedItem.name);
        if (selectedId) {
          this.fetchPokemonById(selectedId).catch((err) => {
            if (err?.name !== "AbortError") {
              this.ui.showError(`Error loading Pokemon: ${selectedItem.name}`);
              console.error("Error loading selected Pokémon:", err);
            }
          });
          // Update search bar with the selected Pokémon's name
          this.ui.setSearchValue(selectedItem.name);
        }
      }); // Show 10 at a time with selection callback
      this.ui.clearMainScreen();
    } else {
      this.ui.showError("Pokémon not found. Check spelling.");
      this.ui.clearMainScreen();
    }
  }
  
  /**
   * Performs advanced fuzzy search with multiple matching strategies including:
   * - Exact substring matching
   * - StartsWith matching  
   * - Multi-token matching for special forms (e.g. "mega charizard" matches "charizard-mega")
   * - Fuzzy character matching with Levenshtein distance for typo tolerance
   * Optimized to use cached name array and single-pass filtering
   * @param {string} query - The search query
   * @returns {Array<string>} - Array of matching Pokémon names
   */
  _fuzzySearch(query) {
    const allNames = this.state.pokemonNameArray;
    if (!allNames || allNames.length === 0) {
      return [];
    }
    
    // Normalize query by replacing hyphens with spaces and trimming
    const normalizedQuery = query.replace(/[-_]/g, ' ').trim();
    const queryTokens = normalizedQuery.toLowerCase().split(/\s+/).filter(token => token.length > 0);
    
    // Use a single pass through all names, scoring each match type
    const matches = [];
    
    for (const name of allNames) {
      let matchType = null;
      
      // 1. Exact substring match (highest priority)
      if (name.includes(query)) {
        matchType = { priority: 1, name };
      }
      // 2. StartsWith match
      else if (name.startsWith(query)) {
        matchType = { priority: 2, name };
      }
      // 3. Multi-token matching for special forms
      else {
        const normalizedName = name.replace(/[-_]/g, ' ');
        const nameTokens = normalizedName.toLowerCase().split(/\s+/);
        
        // Check if all query tokens are present in name tokens (in any order)
        if (queryTokens.every(queryToken => 
          nameTokens.some(nameToken => 
            nameToken.startsWith(queryToken) || this._computeLevenshtein(queryToken, nameToken, 1) <= 1
          )
        )) {
          matchType = { priority: 3, name };
        }
        // 4. Fuzzy character matching with Levenshtein distance
        else if (this._isFuzzyMatch(query, name) || this._hasTypoMatch(query, name)) {
          matchType = { priority: 4, name };
        }
      }
      
      if (matchType) {
        matches.push(matchType);
        // Early exit if we have enough high-quality matches
        if (matches.length >= 100 && matchType.priority <= 2) break;
      }
    }
    
    // Sort by priority first, then by name length (shorter names first for relevance)
    matches.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.name.length - b.name.length;
    });
    
    return matches.slice(0, 100).map(m => m.name);
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
  
  /**
   * Check for typo tolerance using Levenshtein distance with early termination
   * @param {string} query - Query string
   * @param {string} target - Target string to match against
   * @returns {boolean} - Whether it's a typo-tolerant match
   */
  _hasTypoMatch(query, target) {
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    
    // For short queries, be more restrictive
    if (q.length <= 2) return false;
    
    const threshold = 1;
    
    // Try different substrings of the target to find a close match
    // Optimize by checking fewer positions
    const step = Math.max(1, Math.floor(q.length / 3)); // Skip some positions for performance
    for (let i = 0; i <= t.length - q.length; i += step) {
      const substr = t.substring(i, i + q.length);
      if (this._computeLevenshtein(q, substr, threshold) <= threshold) {
        return true;
      }
    }
    // Check the last position if we skipped it
    if ((t.length - q.length) % step !== 0 && t.length >= q.length) {
      const i = t.length - q.length;
      const substr = t.substring(i, i + q.length);
      if (this._computeLevenshtein(q, substr, threshold) <= threshold) {
        return true;
      }
    }
    
    // Also check if the full query is close to a prefix of the target
    if (t.length >= q.length) {
      const prefix = t.substring(0, q.length);
      if (this._computeLevenshtein(q, prefix, threshold) <= threshold) {
        return true;
      }
    }
    
    // Check the reverse case too (target in query)
    if (q.length >= t.length) {
      const prefix = q.substring(0, t.length);
      if (this._computeLevenshtein(t, prefix, threshold) <= threshold) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Compute Levenshtein distance between two strings with early termination
   * Uses space-optimized algorithm with only two rows and threshold-based early exit
   * @param {string} s1 - First string
   * @param {string} s2 - Second string
   * @param {number} threshold - Maximum distance to compute (defaults to Infinity)
   * @returns {number} - The edit distance (returns threshold + 1 if exceeded)
   */
  _computeLevenshtein(s1, s2, threshold = Infinity) {
    const m = s1.length;
    const n = s2.length;
    
    if (m === 0) return n;
    if (n === 0) return m;
    
    // Swap strings if needed so s1 is always shorter or equal
    if (m > n) {
      return this._computeLevenshtein(s2, s1, threshold);
    }
    
    // Use only two rows instead of full matrix (space optimization)
    let prevRow = new Array(n + 1);
    let currRow = new Array(n + 1);
    
    // Initialize first row
    for (let j = 0; j <= n; j++) {
      prevRow[j] = j;
    }
    
    // Fill the rows
    for (let i = 1; i <= m; i++) {
      currRow[0] = i;
      let minInRow = i; // Track minimum value in current row for early termination
      
      for (let j = 1; j <= n; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        currRow[j] = Math.min(
          prevRow[j] + 1,        // deletion
          currRow[j - 1] + 1,    // insertion
          prevRow[j - 1] + cost  // substitution
        );
        minInRow = Math.min(minInRow, currRow[j]);
      }
      
      // Early termination: if minimum value in current row exceeds threshold, stop
      if (minInRow > threshold) {
        return threshold + 1;
      }
      
      // Swap rows for next iteration
      [prevRow, currRow] = [currRow, prevRow];
    }
    
    return prevRow[n];
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
