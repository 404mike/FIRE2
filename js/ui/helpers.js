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

/**
 * Select the display value from a projection row based on displayMode.
 *
 * When `displayMode` is "real", returns the pre-computed real (inflation-adjusted)
 * field if one exists (e.g. "realIsaBalance" for "isaBalance"), otherwise divides
 * the nominal value by inflationFactor.
 *
 * When `displayMode` is "nominal" (or any other value), the nominal value is
 * returned unchanged.
 *
 * @param {object} row          Projection row
 * @param {string} field        Nominal field name (e.g. "isaBalance")
 * @param {string} displayMode  "real" | "nominal"
 * @returns {number}
 */
export function toDisplayValue(row, field, displayMode) {
  if (displayMode !== 'real') return row[field];
  // Prefer the pre-computed real field if the engine has already provided it
  const realField = 'real' + field.charAt(0).toUpperCase() + field.slice(1);
  if (realField in row) return row[realField];
  // Fallback: divide by inflationFactor
  return row.inflationFactor ? row[field] / row.inflationFactor : row[field];
}
