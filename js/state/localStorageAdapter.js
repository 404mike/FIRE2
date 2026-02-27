/**
 * localStorageAdapter.js — Persist state to localStorage
 */

import { getState, loadState, subscribe } from './store.js';

const STORAGE_KEY = 'fire2_state';

/**
 * Save current state to localStorage.
 */
export function saveToLocalStorage() {
  try {
    const state = getState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save to localStorage:', e);
  }
}

/**
 * Load state from localStorage. Returns true if state was loaded.
 * @returns {boolean}
 */
export function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version === undefined) return false;
    loadState(parsed);
    return true;
  } catch (e) {
    console.warn('Could not load from localStorage:', e);
    return false;
  }
}

/**
 * Initialise auto-save. Subscribes to store and persists on every change.
 */
export function initAutoSave() {
  subscribe(saveToLocalStorage);
}
