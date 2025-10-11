document.addEventListener("DOMContentLoaded", () => {
  /**
   * PokedexController - manages UI, fetching, caching, and persistence.
   * This version normalizes all name-based keys to lowercase so name searches work reliably.
   */
  class PokedexController {
    constructor() {
      this.config = {
        api: {
          baseUrl: "https://pokeapi.co/api/v2",
          minRequestInterval: 50, // polite default
        },
        app: {
          defaultId: 1,
          maxPreloadPokemon: 20,
        },
        cache: {
          expiration: 7 * 24 * 60 * 60 * 1000,
          maxSize: 300,
        },
        storage: {
          nameListKey: "pokedex_name_list_v1",
          nameListTsKey: "pokedex_name_list_ts_v1",
          nameListTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
        },
      };

      this.state = {
        currentId: this.config.app.defaultId,
        pokemonCache: new Cache(
          this.config.cache.maxSize,
          this.config.cache.expiration,
        ),
        pokemonList: [],
        pokemonNameMap: new Map(), // keys will be lowercase
        totalPokemon: 0,
        uiState: {
          showingFront: true,
        },
        lastDisplayedId: null,
      };

      this.requestQueue = new RequestQueue(this.config.api.minRequestInterval);
      this.debounceTimeout = null;

      this.init();
    }

    async init() {
      window.addEventListener("load", async () => {
        this.initElements();
        this.setupBlueButtonGrid();
        this.initEventListeners();
        this.initPokedexState();

        // Register service worker (best-effort)
        if ("serviceWorker" in navigator) {
          navigator.serviceWorker.register("./sw.js").catch((err) => {
            console.warn("Service Worker registration failed:", err);
          });
        }

        // Load (or restore) pokemon list — ensures name search works
        await this.loadPokemonList();
      });
    }

    initElements() {
      this.ui = {
        pokedex: document.querySelector(".pokedex"),
        yellowButton: document.querySelector(".yellow-button"),
        cameraLens: document.querySelector(".camera-lens"),
        mainScreen: document.querySelector(".main-screen"),
        detailsArea: null,
        searchInput: null,
        searchButton: null,
        autocompleteList: null,
        autocompleteList: null,
        blueButtonGrid: document.querySelector(".blue-button-grid"),
        dPad: {
          up: document.querySelector(".d-pad-up"),
          down: document.querySelector(".d-pad-down"),
          left: document.querySelector(".d-pad-left"),
          right: document.querySelector(".d-pad-right"),
          center: document.querySelector(".d-pad-center"),
        },
      };

      console.log("ui.pokedex initialized:", this.ui.pokedex);

      const secondary = document.querySelector(".secondary-screen");
      if (secondary) {
        secondary.innerHTML = `
          <div class="pokemon-search-area">
            <input type="text" class="pokemon-search-input" placeholder="Search Pokémon">
            <button class="pokemon-search-button">Search</button>
          </div>
          <style>
            @font-face {
              font-family: "Digital";
              src: url("./fonts/Digital-Regular.woff2") format("woff2"),
                   url("./fonts/Digital-Regular.woff") format("woff");
              font-display: swap;
            }
          </style>
          <div class="pokemon-details-area">Loading Pokédex...</div>
        `;
      }

      this.ui.searchInput = document.querySelector(".pokemon-search-input");
      this.ui.searchButton = document.querySelector(".pokemon-search-button");
      this.ui.detailsArea = document.querySelector(".pokemon-details-area");

      this.ui.autocompleteList = document.querySelector(".autocomplete-list");
    }

    setupBlueButtonGrid() {
      const grid = document.querySelector(".blue-button-grid");
      if (!grid) return;
      grid.innerHTML = "";
      const frag = document.createDocumentFragment();
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].forEach((n) => {
        const btn = document.createElement("button");
        btn.className = "blue-button";
        btn.dataset.value = String(n);
        frag.appendChild(btn);
      });
      grid.appendChild(frag);

      // Delegated handler
      grid.addEventListener(
        "click",
        (e) => {
          const value = e.target?.dataset?.value;
          if (!value || !this.ui.searchInput) return;
          // If input has letters, reset before appending digits
          if (/[a-zA-Z]/.test(this.ui.searchInput.value))
            this.ui.searchInput.value = "";
          this.ui.searchInput.value += value;
          this.ui.searchInput.focus();
        },
        { passive: true },
      );

      grid.addEventListener(
        "touchstart",
        (e) => {
          const value = e.target?.dataset?.value;
          if (!value || !this.ui.searchInput) return;
          if (/[a-zA-Z]/.test(this.ui.searchInput.value))
            this.ui.searchInput.value = "";
          this.ui.searchInput.value += value;
          this.ui.searchInput.focus();
        },
        { passive: true },
      );
    }

    initEventListeners() {
      console.log("Setting up event listener for yellow button.");
      this.ui.yellowButton?.addEventListener("click", () => {
        console.log("Yellow button clicked. Toggling Pokédex.");
        this.togglePokedex();
      });

      console.log("Setting up event listener for camera lens.");
      this.ui.cameraLens?.addEventListener("click", () => {
        console.log("Camera lens clicked. Toggling Pokédex.");
        this.togglePokedex();
      });

      ["up", "down", "left", "right"].forEach((dir) => {
        this.ui.dPad[dir]?.addEventListener("click", () =>
          this.navigatePokemon(dir),
        );
      });
      this.ui.dPad.center?.addEventListener("click", () => {
        if (this.isPokedexOpen()) this.searchPokemon();
      });

      document.addEventListener("keydown", (ev) => {
        if (!this.isPokedexOpen()) return;
        const map = {
          ArrowUp: "up",
          ArrowDown: "down",
          ArrowLeft: "left",
          ArrowRight: "right",
          Enter: "search",
        };
        const action = map[ev.key];
        if (!action) return;
        if (action === "search") this.searchPokemon();
        else this.navigatePokemon(action);
      });

      this.ui.searchButton?.addEventListener("click", () =>
        this.searchPokemon(),
      );
      this.ui.searchButton?.addEventListener(
        "touchstart",
        () => this.searchPokemon(),
        { passive: true },
      );

      // Debounced input for name searches
      this.ui.searchInput?.addEventListener("input", () => {
        clearTimeout(this.debounceTimeout);
        const value = this.ui.searchInput.value.trim();
        const isNumeric = /^[0-9]+$/.test(value);
        if (value.length === 0) {
          this.showMessage("Enter a Pokémon name or number.");
          this.clearMainScreen();
          return;
        }
        if (!isNumeric) {
          this.debounceTimeout = setTimeout(() => {
            const latest = this.ui.searchInput.value.trim();
            if (latest.length > 0 && !/^[0-9]+$/.test(latest))
              this.searchPokemon();
          }, 150);
        }
      });

      this.ui.searchInput?.addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.searchPokemon();
      });

      // Reset helpers
      const resetFlag = () => {};
      this.ui.searchInput?.addEventListener("click", resetFlag);
      this.ui.searchInput?.addEventListener("touchstart", resetFlag, {
        passive: true,
      });
    }

    initPokedexState() {
      if (
        !this.ui.pokedex.classList.contains("open") &&
        !this.ui.pokedex.classList.contains("closed")
      ) {
        this.ui.pokedex.classList.add("closed");
      }
    }

    togglePokedex() {
      if (!this.ui.pokedex) {
        console.error("ui.pokedex is not initialized or missing in the DOM.");
        return;
      }

      if (this.isPokedexClosed()) {
        this.ui.pokedex.classList.remove("closed");
        this.ui.pokedex.classList.add("open");
        console.log("Pokédex opened.");
        if (this.state.pokemonList.length > 0) {
          const randomIndex = Math.floor(
            Math.random() * this.state.pokemonList.length,
          );
          const randomPokemon = this.state.pokemonList[randomIndex];
          this.fetchPokemonById(randomPokemon.id).catch((err) => {
            console.error("Failed to fetch random Pokémon:", err);
          });
        } else {
          console.warn("Pokémon list is empty. Cannot fetch random Pokémon.");
        }
      } else {
        this.ui.pokedex.classList.remove("open");
        this.ui.pokedex.classList.add("closed");
        console.log("Pokédex closed.");
      }
    }

    isPokedexOpen() {
      return this.ui.pokedex.classList.contains("open");
    }
    isPokedexClosed() {
      return this.ui.pokedex.classList.contains("closed");
    }

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
          console.error("Navigation failed:", err);
          this.showError("Navigation failed. Try another direction.");
        }
      }

      this.state.isNavigating = false;
    }

    /**
     * loadPokemonList tries localStorage (TTL) first; if not present, fetch the entire list,
     * persist the list (name + id) and populate the in-memory structures. Names are stored lowercased.
     */
    async loadPokemonList() {
      const sk = this.config.storage.nameListKey;
      const stk = this.config.storage.nameListTsKey;
      const ttl = this.config.storage.nameListTTL;

      this.showLoading("Loading Pokédex database...");

      try {
        const countData = await this.requestQueue.enqueue(
          `${this.config.api.baseUrl}/pokemon?limit=1`,
        );
        const apiCount = countData.count;

        const raw = localStorage.getItem(sk);
        const tsRaw = localStorage.getItem(stk);
        const ts = tsRaw ? parseInt(tsRaw, 10) : 0;
        if (raw && ts && Date.now() - ts < ttl) {
          const persisted = JSON.parse(raw);
          if (persisted.length === apiCount) {
            this.state.pokemonList = persisted;
            this.state.pokemonNameMap = new Map(
              persisted.map((p) => [String(p.name).toLowerCase(), p.id]),
            );
            this.state.totalPokemon = apiCount; // Set totalPokemon only when using cache
            this.showMessage("Pokédex loaded from local cache.");
            return;
          }
        }
      } catch (err) {
        console.warn("Failed to load from cache, will fetch from API.", err);
      }

      // If we reach here, we fetch from API
      try {
        this.state.pokemonList = [];
        this.state.pokemonNameMap = new Map();
        this.state.totalPokemon = 0; // Reset totalPokemon before fetching
        let url = `${this.config.api.baseUrl}/pokemon?limit=100`;

        while (url) {
          const data = await this.requestQueue.enqueue(url);
          data.results.forEach((r) => {
            const parts = r.url.split("/");
            const id = parseInt(parts[parts.length - 2], 10);
            if (!isNaN(id)) {
              const name = r.name;
              this.state.pokemonList.push({ name, id });
              this.state.pokemonNameMap.set(String(name).toLowerCase(), id);
            }
          });
          url = data.next;
        }

        this.state.totalPokemon = this.state.pokemonList.length;

        localStorage.setItem(sk, JSON.stringify(this.state.pokemonList));
        localStorage.setItem(stk, String(Date.now()));

        this.showMessage("Pokédex database ready.");
      } catch (err) {
        console.error("Error loading pokemon list from API:", err);
        this.showError("Error loading Pokédex database. Try refreshing.");
      }
    }

    async fetchPokemonById(id) {
      try {
        this.showLoading("Loading...");
        const pokemon = await this.getPokemonData(id);
        this.state.currentId = pokemon.id;
        if (this.ui.searchInput) this.ui.searchInput.value = pokemon.name;
        await this.displayPokemon(pokemon);
        this.preloadAdjacentPokemon(id);
      } catch (err) {
        console.error("Error fetching pokemon", err);
        this.showError(`Error loading Pokemon #${id}.`);
        this.clearMainScreen();
        throw err;
      }
    }

    /**
     * getPokemonData accepts number or name. When name is used, it is normalized to lowercase
     * for caching and for storage in the name cache.
     */
    async getPokemonData(idOrName) {
      const isNumber =
        typeof idOrName === "number" || /^[0-9]+$/.test(String(idOrName));
      const key = isNumber
        ? Number(idOrName)
        : `name_${String(idOrName).toLowerCase()}`;

      const cached = this.state.pokemonCache.get(key);
      if (cached) {
        if (!isNumber && typeof idOrName === "string")
          this.state.currentId = cached.id;
        return cached;
      }

      const url = `${this.config.api.baseUrl}/pokemon/${idOrName}`;
      try {
        const data = await this.requestQueue.enqueue(url);

        // species (cached separately)
        if (data.species?.url) {
          const speciesId = data.species.url.split("/").slice(-2, -1)[0];
          const speciesKey = `species_${speciesId}`;
          let species = this.state.pokemonCache.get(speciesKey);
          if (!species) {
            species = await this.requestQueue.enqueue(data.species.url);
            this.state.pokemonCache.set(speciesKey, species);
          }
          data.speciesData = species;
        }

        // evolution chain
        if (data.speciesData?.evolution_chain?.url) {
          const chainId = data.speciesData.evolution_chain.url
            .split("/")
            .slice(-2, -1)[0];
          const evoKey = `evolution_${chainId}`;
          let evo = this.state.pokemonCache.get(evoKey);
          if (!evo) {
            evo = await this.requestQueue.enqueue(
              data.speciesData.evolution_chain.url,
            );
            this.state.pokemonCache.set(evoKey, evo);
          }
          data.evolutionData = evo;
        }

        // cache both by numeric id and by normalized name (if searched by name)
        this.state.pokemonCache.set(data.id, data);
        const nameKey = `name_${String(data.name).toLowerCase()}`;
        this.state.pokemonCache.set(nameKey, data);

        // Ensure the name map contains a normalized key
        if (data.name)
          this.state.pokemonNameMap.set(
            String(data.name).toLowerCase(),
            data.id,
          );

        return data;
      } catch (err) {
        console.error("getPokemonData error:", err);
        throw err;
      }
    }

    async batchFetchPokemon(ids) {
      const promises = ids.map((id) => this.getPokemonData(id));
      return Promise.allSettled(promises);
    }

    async searchPokemon() {
      if (!this.ui.searchInput) return;
      const raw = this.ui.searchInput.value.trim();
      if (!raw) {
        this.showMessage("Enter a Pokémon name or number.");
        return;
      }

      const query = raw.toLowerCase();
      this.showLoading("Searching...");

      // numeric?
      if (/^[0-9]+$/.test(query)) {
        const id = parseInt(query, 10);
        if (id >= 1 && id <= this.state.totalPokemon) {
          await this.fetchPokemonById(id);
        } else {
          this.showError(`Pokémon #${id} out of range.`);
          this.clearMainScreen();
        }
        return;
      }

      // prioritize exact match first
      const exactMatch = this.state.pokemonNameMap.get(query);
      if (exactMatch) {
        await this.fetchPokemonById(exactMatch);
        return;
      }

      // fuzzy name search for partial matches
      const suggestions = Array.from(this.state.pokemonNameMap.keys())
        .filter((name) => name.includes(query))
        .slice(0, 10); // Limit to 10 suggestions

      if (suggestions.length > 0) {
        this.ui.detailsArea.innerHTML = `
              <p>Suggestions:</p>
              <ul>${suggestions.map((name) => `<li>${name}</li>`).join("")}</ul>
            `;
        this.clearMainScreen();
      } else {
        this.showError("Pokémon not found. Check spelling.");
        this.clearMainScreen();
      }
    }
    async displayPokemon(pokemon) {
      console.log("Displaying Pokémon details:", pokemon);
      if (!this.ui.mainScreen || !this.ui.detailsArea) {
        console.error("Main screen or details area not initialized.");
        return;
      }
      if (this.state.lastDisplayedId === pokemon.id) {
        console.log("Pokémon already displayed:", pokemon.id);
        return;
      }
      this.state.lastDisplayedId = pokemon.id;

      // image
      const img = document.createElement("img");
      img.className = "pokemon-image fullscreen";
      img.alt = pokemon.name || "";
      img.src = pokemon.sprites?.front_default || "placeholder.png";
      this.ui.mainScreen.innerHTML = "";
      this.ui.mainScreen.appendChild(img);

      if (pokemon.sprites?.back_default) {
        this.state.uiState.showingFront = true;
        img.onclick = () => {
          img.src = this.state.uiState.showingFront
            ? pokemon.sprites.back_default
            : pokemon.sprites.front_default || "placeholder.png";
          this.state.uiState.showingFront = !this.state.uiState.showingFront;
        };
      } else {
        console.warn(`Back sprite not available for ${pokemon.name}.`);
        img.onclick = null;
      }

      const primaryType =
        (pokemon.types &&
          pokemon.types[0] &&
          pokemon.types[0].type &&
          pokemon.types[0].type.name) ||
        "normal";
      console.log("Primary type:", primaryType);
      const typeLabels = (pokemon.types || [])
        .map(
          (t) => `<span class="type-chip ${t.type.name}">${t.type.name}</span>`,
        )
        .join(" ");
      const moves = (pokemon.moves || [])
        .slice(0, 4)
        .map((m) => m.move.name)
        .join(", ");
      const abilities = (pokemon.abilities || [])
        .map((a) => a.ability.name)
        .join(", ");

      let pokedexEntry = "No Pokédex entry available.";
      if (pokemon.speciesData?.flavor_text_entries) {
        const english = (pokemon.speciesData.flavor_text_entries || []).find(
          (e) => e.language?.name === "en",
        );
        if (english) pokedexEntry = english.flavor_text.replace(/\f/g, " ");
      }

      let html = `
        <h3 class="pokemon-name color-${primaryType}">${pokemon.name} <span class="pokemon-id"> - ${pokemon.id}</span></h3>
        <p class="pokemon-types">Type: ${typeLabels}</p>
        <p class="pokemon-entry color-${primaryType}">${pokedexEntry}</p>
        <p class="pokemon-abilities">Abilities: ${abilities}</p>
        <p class="pokemon-moves">Moves: ${moves}</p>
      `;

      if (pokemon.evolutionData) {
        const ev = this.getEvolutionChain(
          pokemon.evolutionData.chain,
          pokemon.name,
        );
        if (ev.length > 1)
          html += `<p class="pokemon-evolutions color-${primaryType}">Evolutions: ${ev.join(" → ")}</p>`;
      }

      this.ui.detailsArea.innerHTML = html;
    }

    getEvolutionChain(chain, currentName) {
      const fmt = (n) =>
        String(n).toLowerCase() === String(currentName).toLowerCase()
          ? `<span class="current-evolution">${n}</span>`
          : n;
      const out = [fmt(chain.species.name)];
      if (chain.evolves_to && chain.evolves_to.length > 0) {
        out.push(...this.getEvolutionChain(chain.evolves_to[0], currentName));
      }
      return out;
    }

    preloadAdjacentPokemon(currentId) {
      setTimeout(async () => {
        const currentIndex = this.state.pokemonList.findIndex(
          (p) => p.id === currentId,
        );
        if (currentIndex === -1) return;

        const potentialIndices = [
          currentIndex + 1,
          currentIndex - 1,
          currentIndex + 10,
          currentIndex - 10,
        ];

        const idsToPreload = potentialIndices
          .filter(
            (index) => index >= 0 && index < this.state.pokemonList.length,
          )
          .map((index) => this.state.pokemonList[index].id)
          .filter((id) => !this.state.pokemonCache.get(id));

        const limited = idsToPreload.slice(
          0,
          this.config.app.maxPreloadPokemon,
        );
        if (limited.length) {
          await Promise.allSettled(
            limited.map((id) => this.getPokemonData(id)),
          );
        }
      }, 0);
    }

    // UI helpers
    showLoading(msg) {
      this.state.lastDisplayedId = null;
      if (this.ui.detailsArea) this.ui.detailsArea.innerHTML = msg;
      if (this.ui.mainScreen)
        this.ui.mainScreen.innerHTML = '<div class="loading">Loading...</div>';
    }
    showMessage(msg) {
      this.state.lastDisplayedId = null;
      if (this.ui.detailsArea) this.ui.detailsArea.innerHTML = msg;
    }
    showError(msg) {
      this.state.lastDisplayedId = null;
      if (this.ui.detailsArea) this.ui.detailsArea.innerHTML = msg;
    }
    clearMainScreen() {
      this.state.lastDisplayedId = null;
      if (this.ui.mainScreen) this.ui.mainScreen.innerHTML = "";
    }
  }

  // Simple in-memory LRU-ish cache with expiry
  class Cache {
    constructor(maxSize = 200, expiry = 7 * 24 * 60 * 60 * 1000) {
      this.maxSize = maxSize;
      this.expiry = expiry;
      this.map = new Map();
      this.lru = [];
    }
    set(key, value) {
      this.map.set(key, { value, ts: Date.now() });
      const i = this.lru.indexOf(key);
      if (i > -1) this.lru.splice(i, 1);
      this.lru.push(key);
      while (this.map.size > this.maxSize) {
        const oldest = this.lru.shift();
        if (oldest !== undefined) this.map.delete(oldest);
      }
    }
    get(key) {
      const entry = this.map.get(key);
      if (!entry) return null;
      if (Date.now() - entry.ts > this.expiry) {
        this.map.delete(key);
        const i = this.lru.indexOf(key);
        if (i > -1) this.lru.splice(i, 1);
        return null;
      }
      const i = this.lru.indexOf(key);
      if (i > -1) this.lru.splice(i, 1);
      this.lru.push(key);
      return entry.value;
    }
  }

  // Simple request queue to space API calls
  class RequestQueue {
    constructor(minInterval = 100) {
      this.queue = [];
      this.processing = false;
      this.last = 0;
      this.minInterval = minInterval;
    }
    enqueue(url) {
      return new Promise((resolve, reject) => {
        this.queue.push({ url, resolve, reject });
        if (!this.processing) this._process();
      });
    }
    async _process() {
      if (this.queue.length === 0) {
        this.processing = false;
        return;
      }
      this.processing = true;
      const item = this.queue.shift();
      const now = Date.now();
      const wait = Math.max(0, this.last + this.minInterval - now);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        const resp = await fetch(item.url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        item.resolve(data);
      } catch (err) {
        item.reject(err);
      } finally {
        this.last = Date.now();
        setTimeout(() => this._process(), 0);
      }
    }
  }

  // Start the app
  new PokedexController();
});
