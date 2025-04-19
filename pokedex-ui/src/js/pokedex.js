document.addEventListener('DOMContentLoaded', () => {
    /**
     * PokedexController - Manages the entire Pokédex application
     */
    class PokedexController {
        constructor() {
            // Combined configuration object for all settings
            this.config = {
                // API settings
                api: {
                    baseUrl: 'https://pokeapi.co/api/v2',
                    batchSize: 100,
                    minRequestInterval: 50 // Reduced for faster requests, adjust as needed
                },
                // Application settings
                app: {
                    defaultId: 1,
                    maxPreloadPokemon: 10 // Increased preloading
                },
                // Cache settings
                cache: {
                    expiration: 7 * 24 * 60 * 60 * 1000,
                    maxSize: 300 // Increased cache size
                }
            };
            // Application state (simplified)
            this.state = {
                currentId: this.config.app.defaultId,
                isNavigating: false,
                pokemonCache: new Cache(this.config.cache.maxSize, this.config.cache.expiration), // Optimized cache
                pokemonList: [],
                pokemonNameMap: new Map(), // Add Map for fast name lookup
                cacheQueue: [],
                totalPokemon: 1025,
                uiState: {
                    showingFront: true,
                    lastInputWasButton: false
                }
            };

            // API request queue
            this.requestQueue = new RequestQueue(this.config.api.minRequestInterval); // Optimized request queue

            // Add this to your constructor
            this.debounceTimeout = null;

            this.init();
        }

        /**
         * Initialize the application
         */
        async init() {
            this.initElements();
            this.initEventListeners();
            this.initPokedexState();
            await this.loadPokemonList();
        }

        /**
         * Initialize UI elements and references
         */
        initElements() {
            // Main UI elements
            this.ui = {
                yellowButton: document.querySelector('.yellow-button'),
                cameraLens: document.querySelector('.camera-lens'),
                pokedex: document.querySelector('.pokedex'),
                mainScreen: document.querySelector('.main-screen'),
                dPad: {
                    up: document.querySelector('.d-pad-up'),
                    down: document.querySelector('.d-pad-down'),
                    left: document.querySelector('.d-pad-left'),
                    right: document.querySelector('.d-pad-right'),
                    center: document.querySelector('.d-pad-center')
                }
            };

            // Setup secondary screen
            const secondaryScreen = document.querySelector('.secondary-screen');
            if (secondaryScreen) {
                secondaryScreen.innerHTML = `
                    <div class="pokemon-search-area">
                        <input type="text" class="pokemon-search-input" placeholder="Search Pokémon">
                        <button class="pokemon-search-button">Search</button>
                    </div>
                    <div class="pokemon-details-area">
                        Loading Pokédex data... <br> Please wait while we prepare the database.
                    </div>
                `;
            }

            // Setup blue button grid
            this.setupBlueButtonGrid();

            // Get additional elements after creation
            this.ui.searchInput = document.querySelector('.pokemon-search-input');
            this.ui.searchButton = document.querySelector('.pokemon-search-button');
            this.ui.detailsArea = document.querySelector('.pokemon-details-area');
            this.ui.blueButtons = document.querySelectorAll('.blue-button');
        }

        /**
         * Set up the blue button grid UI
         */
        setupBlueButtonGrid() {
            const grid = document.querySelector('.blue-button-grid');
            if (!grid) return;
            
            grid.innerHTML = '';
            
            // First row: digits 1-5
            for (let i = 1; i <= 5; i++) {
                const button = document.createElement('button');
                button.className = 'blue-button';
                button.dataset.value = i;
                grid.appendChild(button);
            }
            
            // Second row: digits 6-9, then 0
            const secondRowNumbers = [6, 7, 8, 9, 0];
            secondRowNumbers.forEach(num => {
                const button = document.createElement('button');
                button.className = 'blue-button';
                button.dataset.value = num;
                grid.appendChild(button);
            });
        }

        /**
         * Initialize all event listeners
         */
        initEventListeners() {
            // Main buttons
            this.ui.yellowButton?.addEventListener('click', () => this.togglePokedex());
            this.ui.cameraLens?.addEventListener('click', () => this.togglePokedex());

            // D-pad controls
            const { dPad } = this.ui;
            const directions = ['up', 'down', 'left', 'right'];

            directions.forEach(dir => {
                dPad[dir]?.addEventListener('click', () => this.navigatePokemon(dir));
                dPad[dir]?.addEventListener('touchstart', () => this.navigatePokemon(dir), { passive: true });
            });

            // Center button for search
            dPad.center?.addEventListener('click', () => {
                if (this.isPokedexOpen()) this.searchPokemon();
            });
            dPad.center?.addEventListener('touchstart', () => {
                if (this.isPokedexOpen()) this.searchPokemon();
            }, { passive: true });

            // Keyboard navigation
            document.addEventListener('keydown', (event) => {
                if (!this.isPokedexOpen()) return;

                const keyMap = {
                    'ArrowUp': 'up',
                    'ArrowDown': 'down',
                    'ArrowLeft': 'left',
                    'ArrowRight': 'right',
                    'Enter': 'search'
                };

                const action = keyMap[event.key];
                if (!action) return;

                if (action === 'search') {
                    this.searchPokemon();
                } else {
                    this.navigatePokemon(action);
                }
            });

            // Search functionality
            this.ui.searchButton?.addEventListener('click', () => this.searchPokemon());
            this.ui.searchButton?.addEventListener('touchstart', () => this.searchPokemon(), { passive: true });

            // Replace direct search calls with:
            this.ui.searchInput?.addEventListener('input', () => {
                clearTimeout(this.debounceTimeout);
                this.debounceTimeout = setTimeout(() => {
                    this.searchPokemon();
                }, 300);
            });

            this.ui.searchInput?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.searchPokemon();
            });

            // Blue button input handlers
            this.ui.blueButtons?.forEach(button => {
                button.addEventListener('click', (e) => {
                    if (!this.ui.searchInput) return;

                    // Check if search input contains any letters
                    const hasLetters = /[a-zA-Z]/.test(this.ui.searchInput.value);

                    // Clear input if it contains letters
                    if (hasLetters) {
                        this.ui.searchInput.value = '';
                    }

                    this.ui.searchInput.value += e.target.dataset.value;
                    this.ui.searchInput.focus();
                });
                button.addEventListener('touchstart', (e) => {
                    if (!this.ui.searchInput) return;

                    // Check if search input contains any letters
                    const hasLetters = /[a-zA-Z]/.test(this.ui.searchInput.value);

                    // Clear input if it contains letters
                    if (hasLetters) {
                        this.ui.searchInput.value = '';
                    }

                    this.ui.searchInput.value += e.target.dataset.value;
                    this.ui.searchInput.focus();
                }, { passive: true });
            });

            // Reset the button flag when interacting with search input
            this.ui.searchInput?.addEventListener('input', () => {
                this.state.uiState.lastInputWasButton = false;
            });

            // Reset the button flag when clicking d-pad or search button
            [
                this.ui.dPad.up,
                this.ui.dPad.down,
                this.ui.dPad.left,
                this.ui.dPad.right,
                this.ui.dPad.center,
                this.ui.searchButton
            ].forEach(element => {
                element?.addEventListener('click', () => {
                    this.state.uiState.lastInputWasButton = false;
                });
                element?.addEventListener('touchstart', () => {
                    this.state.uiState.lastInputWasButton = false;
                }, { passive: true });
            });

            // Reset the button flag when clicking search input
            this.ui.searchInput?.addEventListener('click', () => {
                this.state.uiState.lastInputWasButton = false;
            });
            this.ui.searchInput?.addEventListener('touchstart', () => {
                this.state.uiState.lastInputWasButton = false;
            }, { passive: true });
        }

        /**
         * Initialize the Pokédex's default state
         */
        initPokedexState() {
            if (!this.ui.pokedex.classList.contains('closed') && !this.ui.pokedex.classList.contains('open')) {
                this.ui.pokedex.classList.add('closed');
            }
        }

        /**
         * Toggle the Pokédex open/closed state
         */
        togglePokedex() {
            if (this.isPokedexClosed()) {
                // Open pokedex
                this.ui.pokedex.classList.remove('closed');
                this.ui.pokedex.classList.add('open');

                // Load random Pokemon between 1 and 200
                if (this.state.pokemonList.length > 0) {
                    this.state.currentId = Math.floor(Math.random() * Math.min(200, this.state.totalPokemon)) + 1;
                    this.fetchPokemonById(this.state.currentId);
                }
            } else {
                this.ui.pokedex.classList.remove('open');
                this.ui.pokedex.classList.add('closed');
            }
        }

        /**
         * Check if the Pokédex is open/closed
         */
        isPokedexOpen() {
            return this.ui.pokedex.classList.contains('open');
        }

        isPokedexClosed() {
            return this.ui.pokedex.classList.contains('closed');
        }

        /**
         * Navigate through Pokémon based on direction
         */
        async navigatePokemon(direction) {
            if (this.state.isNavigating) return;

            this.state.isNavigating = true;
            const previousId = this.state.currentId;

            try {
                // Update ID based on direction
                switch (direction) {
                    case 'up': this.state.currentId += 10; break;
                    case 'right': this.state.currentId += 1; break;
                    case 'down': this.state.currentId = Math.max(1, this.state.currentId - 10); break;
                    case 'left': this.state.currentId = Math.max(1, this.state.currentId - 1); break;
                }

                // Keep ID within bounds
                this.state.currentId = Math.max(1, Math.min(this.state.currentId, this.state.totalPokemon));

                // Fetch the Pokemon
                await this.fetchPokemonById(this.state.currentId);
            } catch (error) {
                console.error('Navigation failed:', error);
                this.state.currentId = previousId;
                this.showError(`Navigation failed. Try another direction.`);
            } finally {
                this.state.isNavigating = false;
            }
        }

        /**
         * Load the Pokemon list on startup
         */
        async loadPokemonList() {
            try {
                this.showLoading('Loading Pokédex database...');

                // Get total count and initial batches in parallel
                const [countData, initialBatch] = await Promise.all([
                    this.requestQueue.enqueue(`${this.config.api.baseUrl}/pokemon?limit=1`),
                    this.requestQueue.enqueue(`${this.config.api.baseUrl}/pokemon?offset=0&limit=${this.config.api.batchSize}`)
                ]);

                this.state.totalPokemon = countData.count;

                // Populate both list and map
                initialBatch.results.forEach(pokemon => {
                    const urlParts = pokemon.url.split('/');
                    const id = parseInt(urlParts[urlParts.length - 2]);
                    const name = pokemon.name;
                    this.state.pokemonList.push({ name, id });
                    this.state.pokemonNameMap.set(name, id); // Populate map
                });

                this.showMessage('Welcome to Pokédex! <br> Search pokémons via name or number or use D-pad to navigate.');

                // Preload more data in background
                this.preloadAdditionalData();
            } catch (error) {
                console.error('Error loading Pokemon list:', error);
                this.showError('Error loading Pokédex database. Please refresh the page.');
            }
        }

        /**
         * Preload additional data in the background
         */
        async preloadAdditionalData() {
            const preloadBatches = async (offset) => {
                if (offset >= this.state.totalPokemon) {
                    console.log('Finished preloading Pokemon list.'); // Log completion
                    return;
                }

                try {
                    const data = await this.requestQueue.enqueue(
                        `${this.config.api.baseUrl}/pokemon?offset=${offset}&limit=${this.config.api.batchSize}`
                    );

                    // Process and add to the list and map
                    data.results.forEach(pokemon => {
                        const urlParts = pokemon.url.split('/');
                        const id = parseInt(urlParts[urlParts.length - 2]);
                        const name = pokemon.name;
                        // Avoid duplicates if API behaves unexpectedly
                        if (!this.state.pokemonNameMap.has(name)) {
                            this.state.pokemonList.push({ name, id });
                            this.state.pokemonNameMap.set(name, id); // Populate map
                        }
                    });

                    // Schedule the next batch with a delay
                    setTimeout(() => preloadBatches(offset + this.config.api.batchSize), 200); // Reduced delay
                } catch (error) {
                    console.error(`Error preloading batch at offset ${offset}:`, error);
                    // Non-critical error, continue with next batch after a longer delay
                    setTimeout(() => preloadBatches(offset + this.config.api.batchSize), 1000); // Longer delay on error
                }
            };

            // Start preloading from the next batch
            preloadBatches(this.config.api.batchSize);
        }

        /**
         * Fetch Pokémon by ID
         */
        async fetchPokemonById(id) {
            try {
                this.showLoading('Loading...');

                // Get Pokemon data (from cache or API)
                const pokemon = await this.getPokemonData(id);

                // Update current ID and search input
                this.state.currentId = pokemon.id;
                if (this.ui.searchInput) {
                    this.ui.searchInput.value = pokemon.name;
                }

                // Display the Pokémon
                await this.displayPokemon(pokemon);

                // Preload adjacent Pokémon
                this.preloadAdjacentPokemon(id);
            } catch (error) {
                console.error('Error fetching Pokemon:', error);
                this.showError(`Error loading Pokemon #${id}. Try another number.`);
                this.clearMainScreen();
                throw error;
            }
        }

        /**
         * Get Pokémon data (from cache or API) by ID or Name
         */
        async getPokemonData(idOrName) { // Accept both ID and Name
            // Use ID for cache key if it's a number, otherwise use the name
            const cacheKey = typeof idOrName === 'number' ? idOrName : `name_${idOrName}`;

            // Check cache first
            const cachedPokemon = this.state.pokemonCache.get(cacheKey);
            if (cachedPokemon) {
                // Ensure the ID is correctly set in the state if fetched by name
                if (typeof idOrName === 'string') {
                    this.state.currentId = cachedPokemon.id;
                }
                return cachedPokemon;
            }

            // If not cached, fetch from API using ID or Name
            const fetchUrl = `${this.config.api.baseUrl}/pokemon/${idOrName}`;

            try {
                // Fetch basic Pokemon data
                const pokemon = await this.requestQueue.enqueue(fetchUrl);
                const actualId = pokemon.id; // Get the ID from the response

                // Fetch species data using the actual ID
                const speciesData = await this.requestQueue.enqueue(`${this.config.api.baseUrl}/pokemon-species/${actualId}`);

                // Attach species data
                pokemon.speciesData = speciesData;

                // Fetch evolution chain only if needed and not already cached
                if (speciesData.evolution_chain?.url) {
                    const evolutionChainId = speciesData.evolution_chain.url.split('/').slice(-2, -1)[0];
                    const evolutionCacheKey = `evolution_${evolutionChainId}`;
                    const cachedEvolution = this.state.pokemonCache.get(evolutionCacheKey);

                    if (cachedEvolution) {
                        pokemon.evolutionData = cachedEvolution;
                    } else {
                        const evolutionData = await this.requestQueue.enqueue(speciesData.evolution_chain.url);
                        pokemon.evolutionData = evolutionData;
                        this.state.pokemonCache.set(evolutionCacheKey, evolutionData);
                    }
                }

                // Cache the complete data using the original cacheKey (ID or name_Name)
                // Also cache it by ID if it was fetched by name, for consistency
                this.state.pokemonCache.set(cacheKey, pokemon);
                if (typeof idOrName === 'string') {
                    this.state.pokemonCache.set(actualId, pokemon);
                }

                return pokemon;
            } catch (error) {
                console.error(`Error fetching Pokemon "${idOrName}":`, error);
                throw error; // Re-throw to be handled by the caller (searchPokemon or fetchPokemonById)
            }
        }

        /**
         * Batch fetch Pokémon data by IDs
         */
        async batchFetchPokemon(ids) {
            // Request multiple Pokemon in parallel with limits
            const promises = ids.map(id => this.getPokemonData(id));
            return Promise.allSettled(promises);
        }

        /**
         * Search for a Pokémon by name or ID
         */
        async searchPokemon() {
            if (!this.ui.searchInput) return;

            const query = this.ui.searchInput.value.toLowerCase().trim();
            if (!query) {
                this.showMessage('Please enter a pokemon\'s name or number!');
                return;
            }

            this.showLoading('Searching...');

            try {
                // If query is a number, search by ID
                if (!isNaN(query)) {
                    const id = parseInt(query);
                    if (id >= 1 && id <= this.state.totalPokemon) {
                        await this.fetchPokemonById(id);
                    } else {
                        this.showError(`Pokémon #${id} is out of range (1-${this.state.totalPokemon}).`);
                        this.clearMainScreen();
                    }
                    return; // Exit after handling numeric search
                }

                // Search by name using the map first
                const foundId = this.state.pokemonNameMap.get(query);
                if (foundId) {
                    await this.fetchPokemonById(foundId);
                } else {
                    // If not in the map, try a direct API call as a fallback
                    // This handles cases where the name exists but hasn't been preloaded yet
                    console.warn(`Pokemon "${query}" not found in preloaded map. Trying direct API call.`);
                    try {
                        // Use getPokemonData directly to leverage caching for the name endpoint result
                        const pokemon = await this.getPokemonData(query); // Pass name directly
                        this.state.currentId = pokemon.id;
                        // Update search input to reflect the official name (in case of slight variations)
                        if (this.ui.searchInput) {
                            this.ui.searchInput.value = pokemon.name;
                        }
                        await this.displayPokemon(pokemon);
                        // Add the newly found pokemon to the map/list for future searches
                        if (!this.state.pokemonNameMap.has(pokemon.name)) {
                             this.state.pokemonList.push({ name: pokemon.name, id: pokemon.id });
                             this.state.pokemonNameMap.set(pokemon.name, pokemon.id);
                        }
                    } catch (error) {
                        // Only show not found if both map lookup and direct call fail
                        this.showError('Pokémon not found. Check the spelling or number.');
                        this.clearMainScreen();
                    }
                }
            } catch (error) {
                // Catch errors from fetchPokemonById or other unexpected issues
                console.error('Error during search:', error);
                this.showError('An error occurred during search.');
                this.clearMainScreen();
            }
        }

        /**
         * Display Pokémon data
         */
        async displayPokemon(pokemon) {
            if (!this.ui.mainScreen || !this.ui.detailsArea) return;

            // Display Pokemon image
            this.ui.mainScreen.innerHTML = `
                <img src="${pokemon.sprites.front_default || 'placeholder.png'}" 
                     alt="${pokemon.name}" class="pokemon-image fullscreen">
            `;

            // Setup sprite toggling
            const pokemonImage = this.ui.mainScreen.querySelector('.pokemon-image');
            if (pokemonImage && pokemon.sprites.back_default) {
                this.state.uiState.showingFront = true;

                // Toggle sprites on click
                pokemonImage.addEventListener('click', () => {
                    if (this.state.uiState.showingFront) {
                        pokemonImage.src = pokemon.sprites.back_default;
                    } else {
                        pokemonImage.src = pokemon.sprites.front_default || 'placeholder.png';
                    }
                    this.state.uiState.showingFront = !this.state.uiState.showingFront;
                });
                pokemonImage.addEventListener('touchstart', () => {
                    if (this.state.uiState.showingFront) {
                        pokemonImage.src = pokemon.sprites.back_default;
                    } else {
                        pokemonImage.src = pokemon.sprites.front_default || 'placeholder.png';
                    }
                    this.state.uiState.showingFront = !this.state.uiState.showingFront;
                }, { passive: true });
            }

            // Get primary type and create labels
            const primaryType = pokemon.types[0].type.name;
            const typeLabels = pokemon.types.map(t =>
                `<span class="type-chip ${t.type.name}">${t.type.name}</span>`
            ).join(' ');

            // Extract data for display
            const moves = pokemon.moves.slice(0, 4).map(m => m.move.name).join(', ');
            const abilities = pokemon.abilities.map(a => a.ability.name).join(', ');

            // Get Pokédex entry if available
            let pokedexEntry = 'No Pokédex entry available.';
            if (pokemon.speciesData && pokemon.speciesData.flavor_text_entries) {
                const englishEntries = pokemon.speciesData.flavor_text_entries.filter(
                    entry => entry.language.name === 'en'
                );

                if (englishEntries.length > 0) {
                    pokedexEntry = englishEntries[0].flavor_text.replace(/\f/g, ' ');
                }
            }

            // Display Pokemon details
            this.ui.detailsArea.innerHTML = `
                <h3 class="pokemon-name color-${primaryType}">${pokemon.name} <span class="pokemon-id"> - ${pokemon.id}</span></h3>
                <p class="pokemon-types">Type: ${typeLabels}</p>
                <p class="pokemon-entry color-${primaryType}">${pokedexEntry}</p>
                <p class="pokemon-abilities">Abilities: ${abilities}</p>
                <p class="pokemon-moves">Moves: ${moves}</p>
            `;

            // Add evolution chain if available
            if (pokemon.evolutionData) {
                const evolutions = this.getEvolutionChain(pokemon.evolutionData.chain, pokemon.name);

                if (evolutions.length > 1) {
                    this.ui.detailsArea.innerHTML += `
                        <p class="pokemon-evolutions color-${primaryType}">Evolutions: ${evolutions.join(' → ')}</p>
                    `;
                }
            }
        }

        /**
         * Get evolution chain from data
         */
        getEvolutionChain(chain, currentPokemonName) {
            // Format the current evolution name with highlighting
            const formatEvolutionName = (name) => {
                if (name.toLowerCase() === currentPokemonName.toLowerCase()) {
                    return `<span class="current-evolution">${name}</span>`;
                }
                return name;
            };
            
            const evolutions = [formatEvolutionName(chain.species.name)];

            if (chain.evolves_to && chain.evolves_to.length > 0) {
                evolutions.push(...this.getEvolutionChain(chain.evolves_to[0], currentPokemonName));
            }

            return evolutions;
        }

        /**
         * Preload adjacent Pokémon data
         */
        preloadAdjacentPokemon(currentId) {
            setTimeout(() => {
                // Prioritize immediate navigation targets
                const idsToPreload = [
                    currentId + 1,   // right
                    currentId - 1,   // left
                    currentId + 10,  // up
                    currentId - 10   // down
                ].filter(id => id > 0 && id <= this.state.totalPokemon);

                // Only preload what we need
                const limit = Math.min(idsToPreload.length, this.config.app.maxPreloadPokemon);

                for (let i = 0; i < limit; i++) {
                    const id = idsToPreload[i];
                    // Skip if already cached
                    if (this.state.pokemonCache.get(id)) continue;

                    // Add small delay between preloads
                    setTimeout(() => {
                        this.getPokemonData(id).catch(() => {
                            // Silently handle preloading errors
                        });
                    }, i * 100); // Reduced delay
                }
            }, 200); // Reduced delay
        }

        // ----- UI Helper Methods -----

        showLoading(message) {
            this.ui.detailsArea.innerHTML = message;
            this.ui.mainScreen.innerHTML = '<div class="loading">Loading...</div>';
        }

        showMessage(message) {
            this.ui.detailsArea.innerHTML = message;
        }

        showError(message) {
            this.ui.detailsArea.innerHTML = message;
        }

        clearMainScreen() {
            this.ui.mainScreen.innerHTML = '';
        }
    }

    // Add enhanced caching mechanism
    class Cache {
        constructor(maxSize = 200, expiryTime = 7 * 24 * 60 * 60 * 1000) {
            this.maxSize = maxSize;
            this.expiryTime = expiryTime;
            this.cache = new Map();
            this.lruQueue = [];
        }

        set(key, value) {
            const entry = { value, timestamp: Date.now() };
            this.cache.set(key, entry);
            this.updateLRU(key);
            this.prune();
        }

        get(key) {
            const entry = this.cache.get(key);
            if (!entry) return null;
            if (this.isExpired(entry)) {
                this.cache.delete(key);
                return null;
            }
            this.updateLRU(key);
            return entry.value;
        }

        isExpired(entry) {
            return Date.now() - entry.timestamp > this.expiryTime;
        }

        updateLRU(key) {
            const index = this.lruQueue.indexOf(key);
            if (index > -1) this.lruQueue.splice(index, 1);
            this.lruQueue.push(key);
        }

        prune() {
            while (this.cache.size > this.maxSize) {
                const oldest = this.lruQueue.shift();
                this.cache.delete(oldest);
            }
        }
    }

    // Add request queue for API rate limiting
    class RequestQueue {
        constructor(minInterval = 100) {
            this.queue = [];
            this.processing = false;
            this.lastRequest = 0;
            this.minInterval = minInterval;
        }

        async enqueue(url) {
            return new Promise((resolve, reject) => {
                this.queue.push({ url, resolve, reject });
                if (!this.processing) this.process();
            });
        }

        async process() {
            if (this.queue.length === 0) {
                this.processing = false;
                return;
            }

            this.processing = true;
            const request = this.queue.shift();
            const now = Date.now();
            const wait = Math.max(0, this.lastRequest + this.minInterval - now);

            if (wait > 0) await new Promise(r => setTimeout(r, wait));

            try {
                const response = await fetch(request.url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                request.resolve(data);
            } catch (error) {
                request.reject(error);
            } finally {
                this.lastRequest = Date.now();
                setTimeout(() => this.process(), 0);
            }
        }
    }

    // Initialize the Pokedex application
    const pokedex = new PokedexController();
});