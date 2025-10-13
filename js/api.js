/**
 * api.js - Consolidated API, caching, and configuration module
 *
 * This module consolidates:
 * - API interactions and request queueing
 * - LRU cache implementation with expiration
 * - Storage helpers for localStorage
 * - Configuration constants
 */

// Configuration Constants
export const API_BASE_URL = "https://pokeapi.co/api/v2";
export const MIN_REQUEST_INTERVAL = 50;
export const SEARCH_DEBOUNCE_MS = 250;
export const PRELOAD_MAX_ADJACENT = 3;
export const CACHE_EXPIRATION = 7 * 24 * 60 * 60 * 1000; // 7 days
export const CACHE_MAX_SIZE = 300;
export const NAME_LIST_KEY = "pokedex_name_list_v1";
export const NAME_LIST_TS_KEY = "pokedex_name_list_ts_v1";
export const NAME_LIST_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Enhanced LRU cache implementation with expiration
 */
export class Cache {
  constructor(maxSize = CACHE_MAX_SIZE, expiry = CACHE_EXPIRATION) {
    this.maxSize = maxSize;
    this.expiry = expiry;
    this.cache = new Map();
  }

  set(key, value) {
    // Clean expired entries if needed
    if (this.cache.size >= this.maxSize) {
      this._cleanupExpired();
    }
    
    // Remove oldest entry if at max size
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value;
  }
  
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() - entry.timestamp > this.expiry) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }
  
  _cleanupExpired() {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.expiry) {
        this.cache.delete(key);
      }
    }
  }
  
  clear() {
    this.cache.clear();
  }
  
  get size() {
    return this.cache.size;
  }
}

/**
 * Helper for localStorage interactions with TTL support
 */
export class StorageHelper {
  static saveToStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      localStorage.setItem(`${key}_ts`, String(Date.now()));
    } catch (err) {
      // Silent fail for localStorage issues
    }
  }

  static loadFromStorage(key, ttl) {
    try {
      const raw = localStorage.getItem(key);
      const tsRaw = localStorage.getItem(`${key}_ts`);

      if (!raw || !tsRaw) return null;

      const timestamp = parseInt(tsRaw, 10);
      if (isNaN(timestamp) || Date.now() - timestamp > ttl) {
        return null;
      }

      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }
}

/**
 * Simple request throttle to space API calls and avoid rate limiting
 */
export class RequestQueue {
  constructor(minInterval = MIN_REQUEST_INTERVAL) {
    this.minInterval = minInterval;
    this.lastRequestTime = 0;
  }

  async enqueue(url, options = {}) {
    const now = Date.now();
    const delay = Math.max(0, this.lastRequestTime + this.minInterval - now);
    
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.lastRequestTime = Date.now();
      return await response.json();
    } catch (err) {
      throw err;
    }
  }
}

/**
 * Pokemon API service class
 * 
 * This class handles all API interactions with PokéAPI, including:
 * - Managing API requests with rate limiting
 * - Caching API responses to reduce network calls
 * - Providing a clean interface for data retrieval
 * - Handling different API endpoints (pokemon, species, evolution)
 * 
 * The class is designed to be instantiated with optional configuration
 * for caching and rate limiting parameters.
 */
export class PokemonAPI {
  constructor(options = {}) {
    const {
      cache = null,
      minRequestInterval = MIN_REQUEST_INTERVAL,
    } = options;
    this.baseUrl = API_BASE_URL;
    this.requestQueue = new RequestQueue(minRequestInterval);
    this.cache = cache;
  }

  async fetchData(endpoint, options = {}) {
    const url =
      endpoint && endpoint.startsWith && endpoint.startsWith("http")
        ? endpoint
        : `${API_BASE_URL}/${String(endpoint).replace(/^\//, "")}`;

    try {
      return await this.requestQueue.enqueue(url, options);
    } catch (error) {
      console.error(`API call failed for ${url}:`, error);
      throw error;
    }
  }

  async getPokemon(idOrName, options = {}) {
    return await this.fetchData(`pokemon/${idOrName}`, options);
  }

  async getSpecies(urlOrId, options = {}) {
    const endpoint =
      typeof urlOrId === "string" && urlOrId.startsWith("http")
        ? urlOrId
        : `pokemon-species/${urlOrId}`;
    return this.fetchData(endpoint, options);
  }

  async getEvolutionChain(urlOrId, options = {}) {
    const endpoint =
      typeof urlOrId === "string" && urlOrId.startsWith("http")
        ? urlOrId
        : `evolution-chain/${urlOrId}`;
    return this.fetchData(endpoint, options);
  }

  async getPokemonList(limit = 100, offset = 0, options = {}) {
    return this.fetchData(`pokemon?limit=${limit}&offset=${offset}`, options);
  }
}

/**
 * Performance monitoring utilities
 */
export class PerformanceLogger {
  static measureFunction(fn, name) {
    return async (...args) => {
      const start = performance.now();
      try {
        const result = await fn.apply(this, args);
        const end = performance.now();
        console.debug(`${name} took ${end - start} milliseconds`);
        return result;
      } catch (error) {
        const end = performance.now();
        console.error(`${name} failed after ${end - start} milliseconds:`, error);
        throw error;
      }
    };
  }

  static measureCachePerformance(cache, operation) {
    const start = performance.now();
    const result = operation();
    const end = performance.now();
    console.debug(`Cache operation took ${end - start} milliseconds`);
    return result;
  }
}
