/**
 * controller.js - Main application controller that coordinates between UI, API and data
 */

import { UIController } from "./ui.js";
import { PokemonAPI, Cache, StorageHelper, spriteUrl, SEARCH_DEBOUNCE_MS, PRELOAD_MAX_ADJACENT, NAME_LIST_KEY, NAME_LIST_TTL } from "./api.js";
import { fuzzySearch, tokenizeNames } from "./search.js";

const DEFAULT_POKEMON_ID = 1;

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
    this.ui = new UIController();
    this.state = {
      currentId: DEFAULT_POKEMON_ID,
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
        onSelectPokemon: (name) => this.selectPokemonByName(name),
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

    // Wrap around the ends: past the last Pokémon loops to the first and
    // vice-versa. Up/Down jump by 10, Left/Right by 1; modulo keeps the index
    // in range for any step (the total count is just the list length).
    const len = this.state.pokemonList.length;
    const step = { up: -10, down: 10, left: -1, right: 1 }[direction] ?? 0;
    const nextIndex = (((currentIndex + step) % len) + len) % len;

    if (nextIndex !== currentIndex) {
      const nextPokemon = this.state.pokemonList[nextIndex];
      try {
        await this.fetchPokemonById(nextPokemon.id, { keepScreen: true });
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
    lastId = parseInt(StorageHelper.loadRaw("pokedex_last_id"), 10);

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
        this.ui.showNotice("Failed to load starter Pokémon");
        console.error("Failed to fetch starter Pokémon:", err);
      }
    });
  }

  async loadPokemonList() {
    const key = NAME_LIST_KEY;
    const ttl = NAME_LIST_TTL;

    // 1. Use the cached list immediately if we have one: instant, and works
    //    offline (localStorage never hits the network).
    const persisted = StorageHelper.loadFromStorage(key, ttl);
    if (persisted?.length) {
      this.state.pokemonList = persisted;
      this.state.pokemonNameMap = new Map(
        persisted.map((p) => [p.name.toLowerCase(), p.id]),
      );
      this.state.pokemonNames = Array.from(this.state.pokemonNameMap.keys());
      this.state.totalPokemon = persisted.length;

      // 2. Best-effort background refresh: only rebuild if the species count
      //    actually changed. Offline / API down keeps the cached list.
      this.api
        .getPokemonList(1)
        .then((data) => {
          if (data?.count && data.count !== persisted.length) {
            return this.progressivelyLoadPokemonList();
          }
        })
        .catch(() => {});
      return;
    }

    // 3. No cache yet: needs a connection the first time. Guard so an offline
    //    first load fails softly instead of rejecting.
    try {
      await this.progressivelyLoadPokemonList();
    } catch (err) {
      if (err?.name !== "AbortError") {
        console.error("Could not load the Pokédex list:", err);
      }
    }
  }

  async progressivelyLoadPokemonList() {
    const key = NAME_LIST_KEY;
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
      this.ui.showLoading("Loading...", { keepScreen: !!options.keepScreen });
      // Render the sprite and core details from a single request first...
      const base = await this.getPokemonBase(id, options);
      this.state.currentId = base.id;
      this.ui.setSearchValue(base.name);
      await this.ui.displayPokemon(base);
      StorageHelper.saveRaw("pokedex_last_id", base.id);

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
    // Resolve a name to its id via the name map so the cache is keyed only by
    // id (one entry per Pokémon instead of two, restoring full capacity).
    const id = isNumber
      ? Number(idOrName)
      : this.state.pokemonNameMap.get(String(idOrName).toLowerCase());

    if (id) {
      const cached = this.state.pokemonCache.get(id);
      if (cached) {
        if (!isNumber) this.state.currentId = cached.id;
        return cached;
      }
    }

    try {
      const data = await this.api.getPokemon(idOrName, options);
      const nameLower = data.name.toLowerCase();
      this.state.pokemonCache.set(data.id, data);
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

  selectPokemonByName(name) {
    const id = this.state.pokemonNameMap.get(String(name).toLowerCase());
    if (!id) return;
    this.ui.setSearchValue(name);
    this.fetchPokemonById(id, { keepScreen: true }).catch((err) => {
      if (err?.name !== "AbortError") {
        this.ui.showError(`Error loading ${name}.`);
      }
    });
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
    // Keep the current sprite on screen while searching.
    this.ui.showLoading("Searching...", { keepScreen: true });

    if (/^\d+$/.test(query)) {
      const id = parseInt(query, 10);
      if (id >= 1 && id <= this.state.totalPokemon) {
        await this.fetchPokemonById(id, { ...options, keepScreen: true });
      } else {
        this.ui.showNotice(`Pokémon #${id} out of range.`);
      }
      return;
    }

    const exactMatch = this.state.pokemonNameMap.get(query);
    if (exactMatch) {
      await this.fetchPokemonById(exactMatch, { ...options, keepScreen: true });
      return;
    }

    // Implement progressive search with virtual scrolling
    await this.renderSearchSuggestions(query);
  }

  async renderSearchSuggestions(query) {
    // _performSearch already handled the exact-match case before calling this.
    // Implement fuzzy search with multiple matching strategies
    const allMatches = this._fuzzySearch(query);
    
    // If there's only one match, show its details directly
    if (allMatches.length === 1) {
      const singleMatchId = this.state.pokemonNameMap.get(allMatches[0]);
      if (singleMatchId) {
        await this.fetchPokemonById(singleMatchId, { keepScreen: true });
        return;
      }
    }

    if (allMatches.length > 0) {
      // Use virtual scrolling to render only visible items
      this.ui.renderPaginatedSuggestions(allMatches, 10, (selectedItem) => {
        this.selectPokemonByName(selectedItem.name);
      }); // Show 10 at a time with selection callback
    } else {
      this.ui.showNotice("Pokémon not found. Check spelling.");
    }
  }
  
  // Fuzzy-search the name list. The algorithm lives in search.js; this binds it
  // to app state and the memoized token index.
  _fuzzySearch(query) {
    return fuzzySearch(this.state.pokemonNames, query, this._getNameTokens());
  }

  // Tokenized names aligned with state.pokemonNames, rebuilt only when the list
  // changes so search does not re-tokenize ~1300 names on every keystroke.
  _getNameTokens() {
    const allNames = this.state.pokemonNames;
    if (this._nameTokensFor !== allNames || this._nameTokens?.length !== allNames.length) {
      this._nameTokens = tokenizeNames(allNames);
      this._nameTokensFor = allNames;
    }
    return this._nameTokens;
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
      .slice(0, PRELOAD_MAX_ADJACENT); // Limit number to preload

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
                warm.src = spriteUrl(front);
              }
            })
            .catch(() => {})
        )
      );
    }
  }
}

export { PokedexController };
