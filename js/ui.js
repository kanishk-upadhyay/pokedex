/**
 * ui.js - Handles UI rendering and interactions
 *
 * Refactored to use small DOM helpers for safer, less verbose DOM creation.
 *
 * Note: This version ensures the Pokémon name's text color remains controlled by CSS
 * (ivory via `.pokemon-name`) while applying a text-shadow (glow) via JavaScript
 * using the primary type color. The JS explicitly does NOT set or modify the `color`
 * style of the name element.
 * 
 * This module is responsible for:
 * - Element initialization and DOM management
 * - Event listener setup and handling
 * - Pokemon data rendering to the UI
 * - UI state management (open/closed, loading states, etc.)
 * - Offline status indicators
 * - Keyboard shortcuts interface
 * - Dynamic content rendering (search suggestions, evolution chains)
 */

import { el, img } from "./dom.js";

class UIController {
  constructor() {
    this.elements = {};
    this.state = {
      isOpen: false,
      showingFront: true,
      spriteMessageTimeout: null,
      lastDisplayedId: null,
    };
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
        { class: "pokemon-details-area" },
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
      frag.appendChild(btn);
    });
    grid.appendChild(frag);

    const handleButtonPress = (e) => {
      const value = e.target?.dataset?.value;
      if (!value || !this.elements.searchInput) return;

      if (/[a-zA-Z]/.test(this.elements.searchInput.value)) {
        this.elements.searchInput.value = "";
      }
      this.elements.searchInput.value += value;
      this.elements.searchInput.focus();
    };

    grid.addEventListener("click", handleButtonPress, { passive: true });
    grid.addEventListener("touchstart", handleButtonPress, { passive: true });
  }

  /**
   * Set up all UI event listeners
   * @param {Object} handlers - Event handler callbacks from controller
   */
  initEventListeners(handlers) {
    const { onTogglePokedex, onNavigate, onSearch, onKeyboardNavigation, onShowShortcuts } =
      handlers;

    if (this.elements.yellowButton) {
      this.elements.yellowButton.addEventListener("click", onTogglePokedex);
    }
    if (this.elements.cameraLens) {
      this.elements.cameraLens.addEventListener("click", onTogglePokedex);
    }

    Object.entries(this.elements.dPad).forEach(([direction, element]) => {
      if (element && direction !== "center") {
        element.addEventListener("click", () => onNavigate(direction));
      }
    });

    if (this.elements.dPad.center) {
      this.elements.dPad.center.addEventListener("click", onSearch);
    }

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
      
      onKeyboardNavigation(ev.key);
    });

    if (this.elements.searchButton) {
      this.elements.searchButton.addEventListener("click", onSearch);
      this.elements.searchButton.addEventListener("touchstart", onSearch, {
        passive: true,
      });
    }

    if (this.elements.searchInput) {
      this.elements.searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") onSearch();
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
      this.elements.searchInput?.focus();
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

  showUIState(message, type = "message") {
    this.state.lastDisplayedId = null;

    if (this.elements.detailsArea) {
      this.elements.detailsArea.innerHTML = message;
    }

    if (type === "loading" && this.elements.mainScreen) {
      this.elements.mainScreen.innerHTML =
        '<div class="loading">Loading...</div>';
    }
  }

  showLoading(message = "Loading...") {
    this.showUIState(message, "loading");
  }

  showError(message, logToConsole = true) {
    this.state.lastDisplayedId = null;
    if (this.elements.detailsArea) this.elements.detailsArea.innerHTML = message;
    
    // Always log to console for debugging
    if (logToConsole) {
      console.error(message);
    }
  }

  showMessage(message) {
    this.showUIState(message, "message");
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

    if (!this.elements.mainScreen || !this.elements.detailsArea) {
      console.error("Main screen or details area not initialized.");
      return;
    }

    if (this.state.lastDisplayedId === pokemon.id) {
      return;
    }

    this.state.lastDisplayedId = pokemon.id;
    console.log("Displaying Pokemon:", pokemon.name, pokemon.id, pokemon.sprites);
    this.elements.mainScreen.innerHTML = "";

    if (pokemon.sprites?.front_default) {
      // Clear screen and show loading indicator
      this.elements.mainScreen.innerHTML = "";
      
      const imageEl = img(pokemon.sprites.front_default, {
        class: "pokemon-image fullscreen",
        alt: pokemon.name || "",
        loading: "eager", // Change to eager for immediate loading
      });

      // Add image to DOM immediately - browser will show it when loaded
      this.elements.mainScreen.appendChild(imageEl);
      
      // Add loading indicator
      const loadingIndicator = el("div", { class: "loading-indicator" }, "Loading...");
      this.elements.mainScreen.appendChild(loadingIndicator);
      
      // Once image loads, hide the loading indicator
      imageEl.onload = () => {
        console.log("Image loaded successfully:", pokemon.name, pokemon.sprites.front_default);
        if (this.state.lastDisplayedId === pokemon.id) {
          loadingIndicator.remove();
        }
      };
      
      imageEl.onerror = (err) => {
        console.error("Image failed to load:", pokemon.name, pokemon.sprites.front_default, err);
        if (this.state.lastDisplayedId === pokemon.id) {
          loadingIndicator.textContent = "Image failed to load";
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

    // Build details using element builders instead of string templates
    const primaryType = this._getPrimaryType(pokemon);

    // The name element should keep its CSS-controlled color (ivory).
    // We DO NOT add the color-<type> class to the name element so JS won't override the color.
    const nameEl = el(
      "h3",
      { class: "pokemon-name" },
      pokemon.name,
      el("span", { class: "pokemon-id" }, ` - ${pokemon.id}`),
    );

    // Apply a type-based text shadow (glow) using CSS variable directly.
    // This approach is much simpler and more efficient than the previous color parsing logic.
    try {
      const cssVarName = `--color-${primaryType}`;
      
      // Use the CSS variable directly - no complex parsing needed
      nameEl.style.textShadow = `0 0 8px var(${cssVarName}, ivory), 
                                   0 0 18px var(${cssVarName}, ivory), 
                                   0 0 30px var(${cssVarName}, ivory)`;
    } catch (err) {
      // On unexpected errors, don't modify nameEl styles so CSS remains authoritative.
      // eslint-disable-next-line no-console
      console.error("Failed to apply type-based text shadow:", err);
    }

    const typeChips = (pokemon.types || []).map((t) =>
      el("span", { class: `type-chip ${t.type.name}` }, t.type.name),
    );
    const typesEl = el("p", { class: "pokemon-types" }, el("strong", {}, "Type: "), ...typeChips);

    const entryEl = el(
      "p",
      { class: `pokemon-entry color-${primaryType}` },
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
        { class: `pokemon-evolutions color-${primaryType}` },
        el("strong", {}, "Evolutions: "),
      );

      evolutionChain.forEach((node, idx) => {
        evolutionsEl.appendChild(node);
        if (idx < evolutionChain.length - 1) {
          evolutionsEl.appendChild(el("span", {}, " → "));
        }
      });

      container.appendChild(evolutionsEl);
    }

    this.elements.detailsArea.innerHTML = "";
    this.elements.detailsArea.appendChild(container);
  }

  /**
   * Handle clicking on a Pokemon sprite to toggle front/back view
   * @private
   */
  _handleSpriteClick(pokemon, img) {
    if (this.state.showingFront) {
      if (pokemon.sprites.back_default) {
        img.src = pokemon.sprites.back_default;
        this.state.showingFront = false;
      } else {
        // Show message that back image is not available
        const messageEl = el("div", { class: "loading" }, "Back image not available");
        this.elements.mainScreen.appendChild(messageEl);
        
        // Clear any existing timeout to prevent conflicts when navigating quickly
        if (this.state.spriteMessageTimeout) {
          clearTimeout(this.state.spriteMessageTimeout);
        }

        this.state.spriteMessageTimeout = setTimeout(() => {
          // Only restore if the same Pokémon is still being displayed
          if (this.state.lastDisplayedId === pokemon.id) {
            messageEl.remove();
          }
        }, 1500);
      }
    } else {
      img.src = pokemon.sprites.front_default;
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

  _getTypeChips(pokemon) {
    return (pokemon.types || [])
      .map(
        (t) => `<span class="type-chip ${t.type.name}">${t.type.name}</span>`,
      )
      .join(" ");
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
    let entry = "No Pokédex entry available.";
    if (pokemon.speciesData?.flavor_text_entries) {
      const english = (pokemon.speciesData.flavor_text_entries || []).find(
        (e) => e.language?.name === "en",
      );
      if (english) entry = english.flavor_text.replace(/\f/g, " ");
    }
    return entry;
  }

  _buildEvolutionChain(pokemon) {
    if (!pokemon.evolutionData) return [];

    const build = (chain, currentName) => {
      const name = chain.species.name;
      const isCurrent =
        String(name).toLowerCase() === String(currentName).toLowerCase();

      const node = el(
        "span",
        { class: isCurrent ? "current-evolution" : "" },
        name,
      );

      const out = [node];

      if (chain.evolves_to && chain.evolves_to.length > 0) {
        out.push(...build(chain.evolves_to[0], currentName));
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
      this.elements.shortcutsOverlay.style.display = 'flex';
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
      this.elements.shortcutsOverlay.style.display = 'none';
      this.elements.shortcutsOverlay.classList.remove('active');
      this.elements.shortcutsOverlay.setAttribute('aria-hidden', 'true');
    }
  }

  renderSuggestions(container, items = [], onSelect, options = {}) {
    if (!container || !Array.isArray(items) || items.length === 0) return null;

    const { max = 10, clearFirst = true } = options;
    if (clearFirst) container.innerHTML = "";

    const listEl = el("ul", {
      class: "suggestions-list",
      role: "listbox",
      tabindex: 0,
      "aria-label": "Search suggestions",
    });

    const rendered = items
      .map(this._normalizeItem.bind(this))
      .filter(Boolean)
      .slice(0, Math.max(0, Number(max) || 10))
      .map((it) => this._createSuggestionItem(it, onSelect));

    if (!rendered.length) return null;

    const frag = document.createDocumentFragment();
    rendered.forEach((r) => frag.appendChild(r));
    listEl.appendChild(frag);
    container.appendChild(listEl);

    listEl.addEventListener("keydown", (ev) => {
      const active = document.activeElement;
      if (!listEl.contains(active)) return;

      if (ev.key === "ArrowDown" || ev.key === "Down") {
        ev.preventDefault();
        const next = active.closest("li")?.nextElementSibling;
        if (next) {
          const btn = next.querySelector("button, [role='option']");
          btn?.focus();
        }
      } else if (ev.key === "ArrowUp" || ev.key === "Up") {
        ev.preventDefault();
        const prev = active.closest("li")?.previousElementSibling;
        if (prev) {
          const btn = prev.querySelector("button, [role='option']");
          btn?.focus();
        }
      }
    });

    return listEl;
  }

  renderPaginatedSuggestions(allItems = [], pageSize = 10) {
    if (!this.elements.detailsArea || !Array.isArray(allItems) || allItems.length === 0) return null;
    
    // Clear existing content
    this.elements.detailsArea.innerHTML = "";
    
    // Create container for suggestions
    const container = el("div", { class: "suggestions-container" });
    
    // Store state for pagination
    const state = {
      allItems,
      pageSize,
      currentPage: 0,
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
      .map((item) => this._createSuggestionItem(item, (selectedItem) => {
        // Handle selection in the original context
        console.log("Selected item:", selectedItem);
      }));

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
          this._handleLoadMore(allItems, pageSize, listEl, loadMoreBtn, state);
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
  
  showErrorMessage(message) {
    this.showError(message, true);
  }
  
  showWarningMessage(message) {
    // Warning messages are shown but not logged to console as errors
    this.state.lastDisplayedId = null;
    if (this.elements.detailsArea) this.elements.detailsArea.innerHTML = message;
    console.warn(message);
  }
  
  showInfoMessage(message) {
    this.state.lastDisplayedId = null;
    if (this.elements.detailsArea) this.elements.detailsArea.innerHTML = message;
  }
  
  _handleLoadMore(allItems, pageSize, listEl, loadMoreBtn, state) {
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
      .map((item) => this._createSuggestionItem(item, (selectedItem) => {
        // Handle selection in the original context
        console.log("Selected item:", selectedItem);
      }));
    
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

  clearSuggestions(container) {
    if (!container) return;
    const lists = Array.from(container.querySelectorAll(".suggestions-list"));
    lists.forEach((l) => l.remove());
  }

  _normalizeItem(item) {
    if (item == null) return null;
    if (typeof item === "string") return { id: undefined, name: item };
    if (typeof item === "object") {
      return { id: item.id, name: String(item.name ?? item.label ?? "") };
    }
    return { id: undefined, name: String(item) };
  }

  _createSuggestionItem(item, onSelect) {
    const label = item.name || "";
    const dataset = {};
    if (item.id !== undefined && item.id !== null) dataset.id = String(item.id);

    const btn = el(
      "button",
      {
        type: "button",
        class: "suggestion-button",
        dataset,
        onClick: (ev) => {
          ev.preventDefault();
          onSelect?.({ id: item.id, name: label });
        },
        onKeydown: (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            onSelect?.({ id: item.id, name: label });
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
