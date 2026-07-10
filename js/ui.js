/**
 * ui.js - Handles UI rendering and interactions
 *
 * Refactored to use small DOM helpers for safer, less verbose DOM creation.
 *
 * Note: the Pokémon name is colored in JS from the primary type (text fill, plus a
 * secondary-type stroke for dual-type Pokémon); see _renderDetails.
 *
 * This module is responsible for:
 * - Element initialization and DOM management
 * - Event listener setup and handling
 * - Pokemon data rendering to the UI
 * - UI state management (open/closed, loading states, etc.)
 * - Offline status indicators
 * - Keyboard shortcuts interface
 * - Dynamic content rendering (search suggestions, evolution chains)
 * - Enhanced search suggestion functionality with clickable buttons and dynamic sizing
 * - Improved sprite click handling with better error message management
 * - Smart search bar clearing when user clicks on it with a Pokémon displayed
 * - Number button handling that preserves multi-digit input for Pokémon IDs
 */

import { el, img } from "./dom.js";
import { spriteUrl } from "./api.js";

class UIController {
  constructor() {
    this.elements = {};
    this.state = {
      isOpen: false,
      showingFront: true,
      spriteMessageTimeout: null,
      spriteMessageElement: null,
      lastDisplayedId: null,
    };
    this.programmaticallyFocused = false;
    this.initElements();
  }

  /**
   * Initialize UI element references
   */
  initElements() {
    this.elements = {
      pokedex: document.querySelector(".pokedex"),
      yellowButton: document.querySelector(".yellow-button"),
      cameraLens: document.querySelector(".camera-lens"),
      mainScreen: document.querySelector(".main-screen"),
      dPad: {
        up: document.querySelector(".d-pad-up"),
        down: document.querySelector(".d-pad-down"),
        left: document.querySelector(".d-pad-left"),
        right: document.querySelector(".d-pad-right"),
        center: document.querySelector(".d-pad-center"),
      },
    };

    // Setup secondary screen elements if they exist
    const secondary = document.querySelector(".secondary-screen");
    if (secondary) {
      const searchInput = el("input", {
        type: "text",
        class: "pokemon-search-input",
        placeholder: "Search Pokémon",
      });
      const searchButton = el(
        "button",
        { type: "button", class: "pokemon-search-button" },
        "Search",
      );
      const searchArea = el(
        "div",
        { class: "pokemon-search-area" },
        searchInput,
        searchButton,
      );

      const detailsArea = el(
        "div",
        {
          class: "pokemon-details-area",
          role: "status",
          "aria-live": "polite",
        },
        "Loading Pokédex...",
      );

      secondary.appendChild(searchArea);
      secondary.appendChild(detailsArea);
    }

    this.elements.searchInput = document.querySelector(".pokemon-search-input");
    this.elements.searchButton = document.querySelector(
      ".pokemon-search-button",
    );
    this.elements.detailsArea = document.querySelector(".pokemon-details-area");
    this.elements.blueButtonGrid = document.querySelector(".blue-button-grid");
    this.elements.shortcutsOverlay = document.querySelector(".shortcuts-overlay");
    this.elements.closeShortcuts = document.querySelector(".shortcuts-close");
  }

  /**
   * Setup the blue button grid
   */
  setupBlueButtonGrid() {
    const grid = this.elements.blueButtonGrid;
    if (!grid) return;

    grid.innerHTML = "";
    const frag = document.createDocumentFragment();

    [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].forEach((n) => {
      const btn = document.createElement("button");
      btn.className = "blue-button";
      btn.dataset.value = String(n);
      btn.setAttribute("aria-label", `Enter ${n}`);

      const handleButtonInput = (e) => {
        e.preventDefault();
        
        if (!this.elements.searchInput) return;

        // If search input contains letters, clear it first
        if (/[a-zA-Z]/.test(this.elements.searchInput.value)) {
          this.elements.searchInput.value = "";
        }
        
        // Add the number to the search input
        this.elements.searchInput.value += String(n);
        
        // Set the flag to indicate this focus is programmatically triggered
        this.programmaticallyFocused = true;
        this.elements.searchInput.focus();
      };
      
      // Use only click event - it handles both mouse clicks and touch interactions properly
      // On touch devices, the click event fires after touchend, and modern browsers
      // handle the 300ms delay and duplicates properly
      btn.addEventListener("click", handleButtonInput);
      
      frag.appendChild(btn);
    });
    grid.appendChild(frag);
  }

  /**
   * Set up all UI event listeners
   * @param {Object} handlers - Event handler callbacks from controller
   */
  /**
   * Wire an element so it activates on click AND on Enter/Space, so the custom
   * role="button" divs (D-pad, camera lens, yellow button) are keyboard-operable.
   */
  _onActivate(element, handler) {
    if (!element) return;
    element.addEventListener("click", handler);
    element.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        e.stopPropagation();
        handler(e);
      }
    });
  }

  initEventListeners(handlers) {
    const { onTogglePokedex, onNavigate, onSearch, onKeyboardNavigation, onShowShortcuts, onSelectPokemon } =
      handlers;
    this._onSelectPokemon = onSelectPokemon;

    this._onActivate(this.elements.yellowButton, onTogglePokedex);
    this._onActivate(this.elements.cameraLens, onTogglePokedex);

    Object.entries(this.elements.dPad).forEach(([direction, element]) => {
      if (element && direction !== "center") {
        this._onActivate(element, () => onNavigate(direction));
      }
    });

    this._onActivate(this.elements.dPad.center, onSearch);

    document.addEventListener("keydown", (ev) => {
      // Handle shortcuts overlay
      if (ev.key === '?') {
        ev.preventDefault();
        if (!this.elements.shortcutsOverlay?.classList.contains('active')) {
          onShowShortcuts();
        }
        return;
      }
      
      if (ev.key === 'Escape') {
        if (this.elements.shortcutsOverlay?.classList.contains('active')) {
          this.hideShortcuts();
          return;
        }
      }

      // Space: open the Pokédex when closed, flip the sprite when open. Skip when
      // a button or input already owns Space (there it activates that element or
      // types a space).
      if (ev.key === ' ' || ev.key === 'Spacebar') {
        const a = document.activeElement;
        const owned =
          a &&
          (a.tagName === 'BUTTON' ||
            a.tagName === 'INPUT' ||
            a.getAttribute?.('role') === 'button');
        if (!owned) {
          ev.preventDefault();
          if (this.isPokedexOpen()) {
            this.toggleSprite();
          } else {
            onTogglePokedex();
          }
          return;
        }
      }

      onKeyboardNavigation(ev.key);
    });

    if (this.elements.searchButton) {
      this.elements.searchButton.addEventListener("click", onSearch);
    }

    if (this.elements.searchInput) {
      this.elements.searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") onSearch();
      });
      
      // Clear search bar when user manually clicks on it with Pokémon displayed
      this.elements.searchInput.addEventListener("focus", (e) => {
        // When user manually focuses with Pokémon displayed, clear the content immediately
        if (!this.programmaticallyFocused && this.state.lastDisplayedId) {
          e.target.value = '';  // Clear the search bar immediately on focus
        }
        // Reset the programmatic flag after the event cycle
        setTimeout(() => {
          this.programmaticallyFocused = false;
        }, 10);
      });
    }
    
    // Set up shortcuts modal close button
    if (this.elements.closeShortcuts) {
      this.elements.closeShortcuts.addEventListener("click", () => {
        this.hideShortcuts();
      });
    }
    
    // Set up click outside to close shortcuts
    if (this.elements.shortcutsOverlay) {
      this.elements.shortcutsOverlay.addEventListener("click", (e) => {
        if (e.target === this.elements.shortcutsOverlay) {
          this.hideShortcuts();
        }
      });
    }
  }

  /**
   * Toggle the pokedex open/closed state
   * @returns {boolean} - The new state (true = open)
   */
  togglePokedex() {
    if (!this.elements.pokedex) {
      console.error("Pokedex element not initialized");
      return this.state.isOpen;
    }

    if (this.isPokedexClosed()) {
      this.elements.pokedex.classList.remove("closed");
      this.elements.pokedex.classList.add("open");
      this.state.isOpen = true;
      // Don't automatically focus the search bar - let user do it manually
      // This allows the existing Pokémon name to remain until user explicitly focuses to type
    } else {
      this.elements.pokedex.classList.remove("open");
      this.elements.pokedex.classList.add("closed");
      this.state.isOpen = false;
    }

    return this.state.isOpen;
  }

  isPokedexOpen() {
    return this.elements.pokedex.classList.contains("open");
  }

  isPokedexClosed() {
    return this.elements.pokedex.classList.contains("closed");
  }

  initPokedexState() {
    if (
      !this.elements.pokedex.classList.contains("open") &&
      !this.elements.pokedex.classList.contains("closed")
    ) {
      this.elements.pokedex.classList.add("closed");
      this.state.isOpen = false;
    }
  }

  // Remove any message-kind class so the details area is neutral again.
  _clearMessageState() {
    this.elements.detailsArea?.classList.remove(
      "details-error",
      "details-notice",
      "details-info",
      "details-loading",
    );
  }

  // Show a status message with a semantic kind. Colour + icon come from CSS;
  // the text stays plain (textContent) so it is XSS-safe and readable by AT.
  //   error   -> system failure (red)
  //   notice  -> user-input issue, e.g. not found / out of range (amber)
  //   info    -> prompt / neutral guidance (cyan)
  //   loading -> in progress (green)
  _setDetailsMessage(message, kind) {
    this.state.lastDisplayedId = null;
    const area = this.elements.detailsArea;
    if (!area) return;
    this._clearMessageState();
    if (kind) area.classList.add(`details-${kind}`);
    area.textContent = message;
  }

  showLoading(message = "Loading...") {
    this._setDetailsMessage(message, "loading");
    if (this.elements.mainScreen) {
      this.elements.mainScreen.innerHTML =
        '<div class="loading">Loading...</div>';
    }
  }

  showError(message, logToConsole = true) {
    this._setDetailsMessage(message, "error");
    if (logToConsole) {
      console.error(message);
    }
  }

  // User-input issues (typo, out-of-range) — a gentle amber notice, not an error.
  showNotice(message) {
    this._setDetailsMessage(message, "notice");
  }

  showMessage(message) {
    this._setDetailsMessage(message, "info");
  }

  clearMainScreen() {
    this.state.lastDisplayedId = null;
    if (this.elements.mainScreen) {
      this.elements.mainScreen.innerHTML = "";
    }
  }

  getSearchValue() {
    return this.elements.searchInput
      ? this.elements.searchInput.value.trim()
      : "";
  }

  setSearchValue(value) {
    if (this.elements.searchInput) {
      this.elements.searchInput.value = value;
    }
  }

  /**
   * Show offline message to user
   */
  showOfflineMessage() {
    if (!this.elements.offlineIndicator) {
      this.elements.offlineIndicator = el(
        "div",
        {
          class: "offline-indicator",
          style: {
            position: "fixed",
            top: "10px",
            right: "10px",
            background: "#ff4444",
            color: "white",
            padding: "8px 12px",
            borderRadius: "4px",
            fontSize: "0.8em",
            zIndex: "1000",
          },
        },
        "Offline - Using cached data",
      );
      document.body.appendChild(this.elements.offlineIndicator);
    }
  }

  /**
   * Clear offline message
   */
  clearOfflineMessage() {
    if (this.elements.offlineIndicator) {
      this.elements.offlineIndicator.remove();
      this.elements.offlineIndicator = null;
    }
  }

  /**
   * Display Pokemon data in the UI
   * @param {Object} pokemon - Pokemon data object
   */
  async displayPokemon(pokemon) {
    clearTimeout(this.state.spriteMessageTimeout);
    this.state.spriteMessageTimeout = null;
    this.state.spriteMessageElement = null;

    if (!this.elements.mainScreen || !this.elements.detailsArea) {
      console.error("Main screen or details area not initialized.");
      return;
    }

    if (this.state.lastDisplayedId === pokemon.id) {
      return;
    }

    this.state.lastDisplayedId = pokemon.id;
    this.elements.mainScreen.innerHTML = "";

    if (pokemon.sprites?.front_default) {
      const imageEl = img(spriteUrl(pokemon.sprites.front_default), {
        class: "pokemon-image fullscreen",
        alt: pokemon.name || "",
        loading: "eager",
        decoding: "async",
      });

      // Shimmer skeleton shown until the sprite paints
      const skeleton = el("div", { class: "sprite-skeleton" });
      this.elements.mainScreen.appendChild(skeleton);
      this.elements.mainScreen.appendChild(imageEl);

      imageEl.onload = () => {
        if (this.state.lastDisplayedId === pokemon.id) skeleton.remove();
      };

      imageEl.onerror = (err) => {
        console.error("Image failed to load:", pokemon.name, spriteUrl(pokemon.sprites.front_default), err);
        if (this.state.lastDisplayedId === pokemon.id) {
          skeleton.classList.add("failed");
          skeleton.textContent = "Sprite unavailable";
        }
      };

      this.state.showingFront = true;
      imageEl.addEventListener("click", () =>
        this._handleSpriteClick(pokemon, imageEl),
      );
    } else {
      this.elements.mainScreen.appendChild(
        el("div", { class: "loading" }, "Image not available"),
      );
    }

    this._renderDetails(pokemon);
  }

  /**
   * Rebuild only the text details panel (name, types, entry, abilities,
   * moves, evolutions). Used for the initial render and to patch in species
   * and evolution data once it arrives, without touching the sprite.
   */
  updatePokemonDetails(pokemon) {
    if (!this.elements.detailsArea) return;
    this._renderDetails(pokemon);
  }

  _renderDetails(pokemon) {
    // Build details using element builders instead of string templates
    const primaryType = this._getPrimaryType(pokemon);

    // The name element has a glass-like background that may be modified by JS.
    // The text color will be set by JS based on the primary type.
    // Link the name out to its PokémonDB page. PokémonDB keys URLs by base
    // species (e.g. Mega Charizard X lives on /pokedex/charizard), so use the
    // species name rather than the form name to avoid 404s.
    const speciesName = pokemon.species?.name || pokemon.name;
    const nameEl = el(
      "h3",
      { class: "pokemon-name" },
      el(
        "a",
        {
          class: "pokemon-name-link",
          href: `https://pokemondb.net/pokedex/${encodeURIComponent(speciesName)}`,
          target: "_blank",
          rel: "noopener noreferrer",
          title: `View ${pokemon.name} on PokémonDB`,
        },
        pokemon.name,
      ),
      el("span", { class: "pokemon-id" }, ` - ${pokemon.id}`),
    );

    // Colour the name with the primary type. For dual-type Pokémon, add a hard
    // (non-blurred) offset shadow in the secondary type colour: an 8-bit style
    // double-tone that reads as two types and stays legible.
    if (nameEl && nameEl.style) {
      const primaryColor = this._typeColor(primaryType);
      nameEl.style.color = primaryColor;
      nameEl.style.webkitTextFillColor = primaryColor;
      nameEl.style.webkitTextStroke = "none";

      const secondaryType = pokemon?.types?.[1]?.type?.name;
      nameEl.style.textShadow = secondaryType
        ? `1px 1px 0 var(--color-${secondaryType}, #333), 3px 3px 3px rgba(0, 0, 0, 0.6)`
        : "none";
    }

    const typeChips = (pokemon.types || []).map((t) =>
      el("span", { class: `type-chip ${t.type.name}` }, t.type.name),
    );
    const typesEl = el("p", { class: "pokemon-types" }, el("strong", {}, "Type: "), ...typeChips);

    const entryEl = el(
      "p",
      { class: "pokemon-entry" },
      this._getPokedexEntry(pokemon),
    );

    const abilitiesEl = el(
      "p",
      { class: "pokemon-abilities" },
      el("strong", {}, "Abilities: "),
      this._getAbilitiesString(pokemon),
    );

    const movesEl = el(
      "p",
      { class: "pokemon-moves" },
      el("strong", {}, "Moves: "),
      this._getMovesString(pokemon),
    );
    const container = el(
      "div",
      {},
      nameEl,
      typesEl,
      entryEl,
      abilitiesEl,
      movesEl,
    );

    const evolutionChain = this._buildEvolutionChain(pokemon);
    if (evolutionChain.length > 1) {
      const evolutionsEl = el(
        "p",
        { class: "pokemon-evolutions" },  // Remove the color class from parent
        el("strong", {}, "Evolutions: "),
      );

      evolutionChain.forEach((node) => evolutionsEl.appendChild(node));

      container.appendChild(evolutionsEl);
    }

    this._clearMessageState();
    this.elements.detailsArea.innerHTML = "";
    this.elements.detailsArea.appendChild(container);
  }

  // Flip the current sprite between front and back (keyboard entry point;
  // reuses the sprite's own click handler, which has the current Pokémon).
  toggleSprite() {
    const img = this.elements.mainScreen?.querySelector(".pokemon-image");
    if (img) img.click();
  }

  /**
   * Handle clicking on a Pokemon sprite to toggle front/back view
   * @private
   */
  _handleSpriteClick(pokemon, img) {
    // Clear any existing timeout and message elements to prevent conflicts
    if (this.state.spriteMessageTimeout) {
      clearTimeout(this.state.spriteMessageTimeout);
      this.state.spriteMessageTimeout = null;
    }
    
    // Remove the previous "image not available" message, if any
    if (this.state.spriteMessageElement) {
      this.state.spriteMessageElement.remove();
      this.state.spriteMessageElement = null;
    }
    
    if (this.state.showingFront) {
      if (pokemon.sprites.back_default) {
        img.src = spriteUrl(pokemon.sprites.back_default);
        this.state.showingFront = false;
      } else {
        // Show message that back image is not available
        const messageEl = el("div", { class: "loading" }, "Back image not available");
        this.elements.mainScreen.appendChild(messageEl);
        this.state.spriteMessageElement = messageEl;

        this.state.spriteMessageTimeout = setTimeout(() => {
          // Only restore if the same Pokémon is still being displayed
          if (this.state.lastDisplayedId === pokemon.id && this.state.spriteMessageElement) {
            this.state.spriteMessageElement.remove();
            this.state.spriteMessageElement = null;
          }
        }, 1500);
      }
    } else {
      img.src = spriteUrl(pokemon.sprites.front_default);
      this.state.showingFront = true;
    }
  }

  _getPrimaryType(pokemon) {
    return (
      (pokemon.types &&
        pokemon.types[0] &&
        pokemon.types[0].type &&
        pokemon.types[0].type.name) ||
      "normal"
    );
  }

  // CSS custom-property colour for a type, with an ivory fallback.
  _typeColor(type) {
    return `var(--color-${type}, ivory)`;
  }

  _getMovesString(pokemon) {
    return (pokemon.moves || [])
      .slice(0, 4)
      .map((m) => m.move.name)
      .join(", ");
  }

  _getAbilitiesString(pokemon) {
    return (pokemon.abilities || []).map((a) => a.ability.name).join(", ");
  }

  _getPokedexEntry(pokemon) {
    if (pokemon.speciesData?.flavor_text_entries) {
      const english = (pokemon.speciesData.flavor_text_entries || []).find(
        (e) => e.language?.name === "en",
      );
      if (english) return english.flavor_text.replace(/\f/g, " ");
      return "No Pokédex entry available.";
    }
    // Species data has not been fetched yet (progressive render). Show a
    // loading state rather than the "unavailable" fallback, unless the fetch
    // actually failed.
    return pokemon.speciesLoadFailed
      ? "No Pokédex entry available."
      : "Loading entry…";
  }

  _buildEvolutionChain(pokemon) {
    if (!pokemon.evolutionData) return [];

    const build = (chain, currentName) => {
      const name = chain.species.name;
      const isCurrent =
        String(name).toLowerCase() === String(currentName).toLowerCase();

      // For the current evolution, apply primary type color
      let elementClass = "";
      let elementStyle = {};
      if (isCurrent) {
        elementClass = "current-evolution";
        // Get primary type from the pokemon object
        const primaryType = this._getPrimaryType(pokemon);
        elementStyle = { 
          color: this._typeColor(primaryType),
          fontWeight: 'bold'
        };
      }

      const node = el(
        "button",
        {
          type: "button",
          class: `evolution-node ${elementClass}`,
          style: elementStyle,
          onClick: () => this._onSelectPokemon?.(name),
          "aria-label": `View ${name}`,
        },
        name,
      );

      const out = [node];

      const nexts = chain.evolves_to || [];
      if (nexts.length === 1) {
        out.push(el("span", { class: "evolution-arrow", "aria-hidden": "true" }, " → "));
        out.push(...build(nexts[0], currentName));
      } else if (nexts.length > 1) {
        // Branched evolutions (e.g. Eevee): arrow into the group, then each
        // branch separated by "/".
        out.push(el("span", { class: "evolution-arrow", "aria-hidden": "true" }, " → "));
        nexts.forEach((branch, i) => {
          if (i > 0) out.push(el("span", { class: "evolution-separator", "aria-hidden": "true" }, " / "));
          out.push(...build(branch, currentName));
        });
      }

      return out;
    };

    return build(pokemon.evolutionData.chain, pokemon.name);
  }



  /**
   * Show keyboard shortcuts help overlay
   */
  showShortcuts() {
    if (this.elements.shortcutsOverlay) {
      this.elements.shortcutsOverlay.classList.add('active');
      this.elements.shortcutsOverlay.setAttribute('aria-hidden', 'false');
      this.elements.shortcutsOverlay.focus();
    }
  }

  /**
   * Hide keyboard shortcuts help overlay
   */
  hideShortcuts() {
    if (this.elements.shortcutsOverlay) {
      this.elements.shortcutsOverlay.classList.remove('active');
      this.elements.shortcutsOverlay.setAttribute('aria-hidden', 'true');
    }
  }

  /**
   * Renders paginated search suggestions with dynamic sizing and click handling
   * Creates a responsive grid layout for suggestions on larger screens
   * @param {Array} allItems - Array of suggestion items to render
   * @param {number} pageSize - Number of items to show initially
   * @param {Function} onSelect - Callback function when a suggestion is clicked
   * @returns {Element|null} - The container element or null if no items
   */
  renderPaginatedSuggestions(allItems = [], pageSize = 10, onSelect) {
    if (!this.elements.detailsArea || !Array.isArray(allItems) || allItems.length === 0) return null;
    
    // Clear existing content
    this._clearMessageState();
    this.elements.detailsArea.innerHTML = "";
    
    // Create container for suggestions
    const container = el("div", { class: "suggestions-container" });
    
    // Store state for pagination
    const state = {
      allItems,
      pageSize,
      loadedCount: 0
    };
    
    // Initial display of first page
    const initialItems = allItems.slice(0, pageSize);
    const listEl = el("ul", {
      class: "suggestions-list",
      role: "listbox",
      "aria-label": "Search suggestions",
    });

    const rendered = initialItems
      .map(this._normalizeItem.bind(this))
      .filter(Boolean)
      .map((item) => this._createSuggestionItem(item, onSelect));

    if (rendered.length) {
      const frag = document.createDocumentFragment();
      rendered.forEach(r => frag.appendChild(r));
      listEl.appendChild(frag);
      state.loadedCount = initialItems.length;
    }
    
    // Add "Load More" button if there are more items
    if (allItems.length > pageSize) {
      const loadMoreBtn = el("button", {
        class: "load-more-button",
        type: "button",
        dataset: { page: "0" },
        onClick: (ev) => {
          ev.preventDefault();
          this._handleLoadMore(allItems, pageSize, listEl, loadMoreBtn, state, onSelect);
        }
      }, `Load more (${allItems.length - pageSize} remaining)`);
      
      container.appendChild(listEl);
      container.appendChild(loadMoreBtn);
    } else {
      container.appendChild(listEl);
    }
    
    this.elements.detailsArea.appendChild(container);
    return container;
  }
  
  _handleLoadMore(allItems, pageSize, listEl, loadMoreBtn, state, onSelect) {
    // Disable button during loading to prevent duplicate clicks
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = 'Loading...';
    
    // Calculate what to load
    const startIndex = state.loadedCount; // Use loadedCount instead of page-based calculation
    const endIndex = Math.min(startIndex + pageSize, allItems.length);
    const itemsToLoad = allItems.slice(startIndex, endIndex);
    
    if (itemsToLoad.length === 0) {
      loadMoreBtn.remove(); // Remove button if no more items
      return;
    }
    
    const rendered = itemsToLoad
      .map(this._normalizeItem.bind(this))
      .filter(Boolean)
      .map((item) => this._createSuggestionItem(item, onSelect));
    
    if (rendered.length) {
      const frag = document.createDocumentFragment();
      rendered.forEach(r => frag.appendChild(r));
      listEl.appendChild(frag);
      
      // Update loaded count
      state.loadedCount = endIndex;
    }
    
    // Update or remove the "Load More" button
    const remaining = allItems.length - endIndex;
    if (remaining <= 0) {
      loadMoreBtn.remove(); // Remove button when no more items
    } else {
      loadMoreBtn.textContent = `Load more (${remaining} remaining)`;
      loadMoreBtn.disabled = false; // Re-enable button
    }
  }

  _normalizeItem(item) {
    if (item == null) return null;
    if (typeof item === "object") return { name: String(item.name ?? item.label ?? "") };
    return { name: String(item) };
  }

  _createSuggestionItem(item, onSelect) {
    const label = item.name || "";
    const btn = el(
      "button",
      {
        type: "button",
        class: "suggestion-button",
        onClick: (ev) => {
          ev.preventDefault();
          onSelect?.({ name: label });
        },
        onKeydown: (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            onSelect?.({ name: label });
          }
        },
        "aria-label": label,
      },
      label,
    );

    return el("li", { role: "option", class: "suggestion-item" }, btn);
  }
}

export { UIController };
