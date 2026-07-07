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
      pokemonNames: [],
      totalPokemon: 0,
      isNavigating: false,
      initialShown: false,
      searchTimeout: null,
      searchAbortController: null,
    };

    this.api = new PokemonAPI();
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
    if (this.ui.elements.searchInput && document.activeElement === this.ui.elements.searchInput) {
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

    if (isNowOpen && !this.state.initialShown) {
      // Show a Pokémon immediately on first open. This no longer waits for the
      // full name list to finish loading (the list is only needed for search).
      this.loadInitialPokemon();
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

  loadInitialPokemon() {
    this.state.initialShown = true;

    // Restore the last Pokémon the user viewed, if any; otherwise a starter.
    let lastId = NaN;
    try { lastId = parseInt(localStorage.getItem("pokedex_last_id"), 10); } catch (e) {}

    if (Number.isInteger(lastId) && lastId > 0) {
      this.fetchPokemonById(lastId).catch((err) => {
        if (err?.name !== "AbortError") this.loadStarterPokemon();
      });
    } else {
      this.loadStarterPokemon();
    }
  }

  loadStarterPokemon() {
    this.state.initialShown = true;

    // Popular starters. These are constant ids, so we can fetch one immediately
    // without waiting for the full name list to load.
    const starterIds = [1, 2, 3,   // Bulbasaur family
                       4, 5, 6,   // Charmander family
                       7, 8, 9,   // Squirtle family
                       25, 26,    // Pikachu, Raichu
                       129, 130,  // Magikarp, Gyarados
                       150, 151]; // Mewtwo, Mew

    const id = starterIds[Math.floor(Math.random() * starterIds.length)];

    this.fetchPokemonById(id).catch((err) => {
      if (err?.name !== "AbortError") {
        this.ui.showWarningMessage("Failed to load starter Pokémon");
        console.error("Failed to fetch starter Pokémon:", err);
      }
    });
  }

  async loadPokemonList() {
    const { nameListKey: key, nameListTTL: ttl } = this.config.storage;

    const countData = await this.api.getPokemonList(1);
    const apiCount = countData.count;
    const persisted = StorageHelper.loadFromStorage(key, ttl);

    if (persisted?.length === apiCount) {
      this.state.pokemonList = persisted;
      this.state.pokemonNameMap = new Map(
        persisted.map((p) => [p.name.toLowerCase(), p.id]),
      );
      this.state.pokemonNames = Array.from(this.state.pokemonNameMap.keys());
      this.state.totalPokemon = apiCount;
      return;
    }

    // Use progressive loading
    await this.progressivelyLoadPokemonList();
  }

  async progressivelyLoadPokemonList() {
    const { nameListKey: key } = this.config.storage;
    const PAGE_SIZE = 200; // Smaller page size for progressive loading
    

    try {
      // Use temporary variables to avoid partial state updates
      const tempList = [];
      const tempNameMap = new Map();

      // Fetch the first page to learn the total count, then request the
      // remaining pages concurrently instead of walking `next` one at a time.
      const firstPage = await this.api.fetchData(
        `pokemon?limit=${PAGE_SIZE}&offset=0`,
      );
      const total = firstPage.count;

      const restRequests = [];
      for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) {
        restRequests.push(
          this.api.fetchData(`pokemon?limit=${PAGE_SIZE}&offset=${offset}`),
        );
      }
      const restPages = await Promise.all(restRequests);

      // Iterate pages in offset order so the list stays sorted by id
      for (const page of [firstPage, ...restPages]) {
        for (const result of page.results) {
          const id = parseInt(result.url.split("/").slice(-2, -1)[0], 10);
          if (!isNaN(id)) {
            tempList.push({ name: result.name, id });
            tempNameMap.set(result.name.toLowerCase(), id);
          }
        }
      }

      // Only update state if all data was loaded successfully
      this.state.pokemonList = tempList;
      this.state.pokemonNameMap = tempNameMap;
      this.state.pokemonNames = Array.from(tempNameMap.keys());
      this.state.totalPokemon = tempList.length;
      StorageHelper.saveToStorage(key, tempList);
    } catch (err) {
      if (err?.name !== "AbortError") {
        this.ui.showError("Error loading Pokédex database. Try refreshing.");
        console.error("Error loading pokemon list progressively:", err);
      }
      // State remains unchanged if error occurs during loading
    }
    // If the pokedex was opened while the list was still loading and nothing
    // has been shown yet, load a starter now.
    if (this.ui.isPokedexOpen() && !this.state.initialShown) {
      this.loadInitialPokemon();
    }
  }
  

  async fetchPokemonById(id, options = {}) {
    try {
      this.ui.showLoading("Loading...");
      // Render the sprite and core details from a single request first...
      const base = await this.getPokemonBase(id, options);
      this.state.currentId = base.id;
      this.ui.setSearchValue(base.name);
      await this.ui.displayPokemon(base);
      try { localStorage.setItem("pokedex_last_id", String(base.id)); } catch (e) {}

      // ...then fetch species + evolution and patch the details panel in,
      // as long as the user has not navigated away in the meantime.
      if (!base.speciesData) {
        this.enrichPokemon(base, options)
          .then((full) => {
            if (this.state.currentId === full.id) {
              this.ui.updatePokemonDetails(full);
            }
          })
          .catch((err) => {
            if (err?.name !== "AbortError") {
              console.error("Failed to load Pokemon details:", err);
              base.speciesLoadFailed = true;
              if (this.state.currentId === base.id) {
                this.ui.updatePokemonDetails(base);
              }
            }
          });
      }

      this.preloadAdjacentPokemon(id);
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      this.ui.showError(`Error loading Pokemon #${id}.`);
      this.ui.clearMainScreen();
      throw err;
    }
  }

  async getPokemonData(idOrName, options = {}) {
    const base = await this.getPokemonBase(idOrName, options);
    if (base && !base.speciesData) await this.enrichPokemon(base, options);
    return base;
  }

  /**
   * Fetch the core Pokemon record (sprite, types, abilities, moves) - a single
   * API call. Enough to render the sprite and primary details immediately.
   */
  async getPokemonBase(idOrName, options = {}) {
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
      const nameLower = data.name.toLowerCase();
      this.state.pokemonCache.set(data.id, data);
      this.state.pokemonCache.set(`name_${nameLower}`, data);
      if (!this.state.pokemonNameMap.has(nameLower)) {
        this.state.pokemonNames.push(nameLower);
      }
      this.state.pokemonNameMap.set(nameLower, data.id);
      return data;
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      console.error(`Error fetching Pokemon data for ${idOrName}:`, err);
      throw err;
    }
  }

  /**
   * Fetch the secondary data (species flavor text and evolution chain) and
   * attach it to an already-fetched base record. Mutates the cached object in
   * place, so the cache entry becomes the enriched version.
   */
  async enrichPokemon(data, options = {}) {
    if (!data || data.speciesData || !data.species?.url) return data;
    data.speciesData = await this.api.fetchData(data.species.url, options);
    if (data.speciesData?.evolution_chain?.url) {
      data.evolutionData = await this.api.fetchData(
        data.speciesData.evolution_chain.url,
        options,
      );
    }
    return data;
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
   * @param {string} query - The search query
   * @returns {Array<string>} - Array of matching Pokémon names
   */
  _fuzzySearch(query) {
    const allNames = this.state.pokemonNames;
    
    // Normalize query by replacing hyphens with spaces and trimming
    const normalizedQuery = query.replace(/[-_]/g, ' ').trim();
    const queryTokens = normalizedQuery.toLowerCase().split(/\s+/).filter(token => token.length > 0);
    
    // 1. Exact substring matches (for performance)
    let exactMatches = allNames.filter(name => name.includes(query));
    if (exactMatches.length > 0) {
      return exactMatches.slice(0, 100);
    }
    
    // 2. StartsWith matches
    let startsWithMatches = allNames.filter(name => name.startsWith(query));
    if (startsWithMatches.length > 0) {
      return startsWithMatches.slice(0, 100);
    }
    
    // 3. Multi-token matching for special forms (e.g. "mega charizard" matches "charizard-mega")
    let tokenMatches = [];
    for (const name of allNames) {
      const normalizedName = name.replace(/[-_]/g, ' ');
      const nameTokens = normalizedName.toLowerCase().split(/\s+/);
      
      // Check if all query tokens are present in name tokens (in any order)
      if (queryTokens.every(queryToken => 
        nameTokens.some(nameToken => 
          nameToken.startsWith(queryToken) || this._computeLevenshtein(queryToken, nameToken, 1) <= 1
        )
      )) {
        tokenMatches.push(name);
        if (tokenMatches.length >= 100) break;
      }
    }
    
    if (tokenMatches.length > 0) {
      return tokenMatches.slice(0, 100);
    }
    
    // 4. Fuzzy character matching with Levenshtein distance for typos
    let fuzzyMatches = [];
    for (const name of allNames) {
      if (this._isFuzzyMatch(query, name) || this._hasTypoMatch(query, name)) {
        fuzzyMatches.push(name);
        if (fuzzyMatches.length >= 100) break;
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
  
  /**
   * Check for typo tolerance using Levenshtein distance
   * @param {string} query - Query string
   * @param {string} target - Target string to match against
   * @returns {boolean} - Whether it's a typo-tolerant match
   */
  _hasTypoMatch(query, target) {
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    
    // For short queries, be more restrictive
    if (q.length <= 2) return false;
    
    // Try different substrings of the target to find a close match
    for (let i = 0; i <= t.length - q.length; i++) {
      const substr = t.substring(i, i + q.length);
      if (this._computeLevenshtein(q, substr, 1) <= 1) {
        return true;
      }
    }
    
    // Also check if the full query is close to a prefix of the target
    if (t.length >= q.length) {
      const prefix = t.substring(0, q.length);
      if (this._computeLevenshtein(q, prefix, 1) <= 1) {
        return true;
      }
    }
    
    // Check the reverse case too (target in query)
    if (q.length >= t.length) {
      const prefix = q.substring(0, t.length);
      if (this._computeLevenshtein(t, prefix, 1) <= 1) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Compute Levenshtein distance between two strings.
   *
   * Uses two rolling rows instead of a full matrix (O(min(m, n)) space) and,
   * when a threshold is given, bails out early once every value in the current
   * row exceeds it. Callers that only care whether the distance is within a
   * small bound (e.g. <= 1) should pass that bound as the threshold.
   * @param {string} s1 - First string
   * @param {string} s2 - Second string
   * @param {number} [threshold=Infinity] - Stop early once the distance is known
   *   to exceed this; returns threshold + 1 in that case.
   * @returns {number} - The edit distance (or threshold + 1 if it exceeds threshold)
   */
  _computeLevenshtein(s1, s2, threshold = Infinity) {
    const m = s1.length;
    const n = s2.length;

    if (m === 0) return n;
    if (n === 0) return m;

    // Keep s1 the shorter string so a row stays as small as possible
    if (m > n) return this._computeLevenshtein(s2, s1, threshold);

    let prevRow = new Array(n + 1);
    let currRow = new Array(n + 1);
    for (let j = 0; j <= n; j++) prevRow[j] = j;

    for (let i = 1; i <= m; i++) {
      currRow[0] = i;
      let minInRow = i;

      for (let j = 1; j <= n; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        currRow[j] = Math.min(
          prevRow[j] + 1,        // deletion
          currRow[j - 1] + 1,    // insertion
          prevRow[j - 1] + cost  // substitution
        );
        if (currRow[j] < minInRow) minInRow = currRow[j];
      }

      // The row minimum never decreases as i grows, so once it passes the
      // threshold the final distance cannot come back under it.
      if (minInRow > threshold) return threshold + 1;

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
      // Preload data and warm the sprite image so navigation shows it instantly.
      // Promise.allSettled keeps going even if some requests fail.
      await Promise.allSettled(
        preloadIds.map((id) =>
          this.getPokemonData(id)
            .then((data) => {
              const front = data?.sprites?.front_default;
              if (front) {
                const warm = new Image();
                warm.src = this.ui._spriteUrl(front);
              }
            })
            .catch(() => {})
        )
      );
    }
  }
}

export { PokedexController };
