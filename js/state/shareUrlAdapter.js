/**
 * shareUrlAdapter.js — Encode/decode state in URL query parameter
 *
 * Uses base64-encoded JSON stored in the `?s=` query param.
 */

import { getState, loadState } from './store.js';

const PARAM = 's';

/**
 * Encode current state into a shareable URL string.
 * @returns {string} Full URL with ?s= parameter
 */
export function getShareUrl() {
  const state = getState();
  const json = JSON.stringify(state);
  // btoa with unicode support
  const encoded = btoa(unescape(encodeURIComponent(json)));
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set(PARAM, encoded);
  return url.toString();
}

/**
 * Attempt to load state from URL. Returns true if loaded.
 * @returns {boolean}
 */
export function loadFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get(PARAM);
    if (!encoded) return false;
    const json = decodeURIComponent(escape(atob(encoded)));
    const parsed = JSON.parse(json);
    if (!parsed || parsed.version === undefined) return false;
    loadState(parsed);
    // Clean the URL so refreshing doesn't re-apply the param
    const clean = new URL(window.location.href);
    clean.searchParams.delete(PARAM);
    window.history.replaceState({}, '', clean.toString());
    return true;
  } catch (e) {
    console.warn('Could not load state from URL:', e);
    return false;
  }
}
