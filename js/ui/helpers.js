/**
 * helpers.js — Shared UI utility functions
 */

/**
 * Format a number as a UK currency string (£).
 * @param {number} value
 * @returns {string}
 */
export function formatCurrency(value) {
  if (value === undefined || value === null || isNaN(value)) return '—';
  const abs = Math.abs(Math.round(value));
  const formatted = abs.toLocaleString('en-GB');
  return (value < 0 ? '-£' : '£') + formatted;
}

/**
 * Format age as a string.
 * @param {number} age
 * @returns {string}
 */
export function formatAge(age) {
  return `Age ${age}`;
}

/**
 * Return a CSS class based on a numeric value.
 * @param {number} value
 * @returns {string}
 */
export function numClass(value) {
  if (value > 0) return 'num-positive';
  if (value < 0) return 'num-negative';
  return 'num-zero';
}
