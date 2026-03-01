/**
 * store.js — Central state management
 *
 * Single source of truth for all app configuration.
 * All mutations go through setState(). Subscribers are notified on change.
 */

// ── Default state ───────────────────────────────────────────────────────────

export const DEFAULT_STATE = {
  version: 1,

  // Personal timeline
  currentAge: 40,
  retirementAge: 58,
  endAge: 100,

  // Spending
  retirementSpending: 35000,
  inflationRate: 2.5,

  // UK State Pension Age
  statePensionAge: 67,

  // Investment pots
  isa: {
    enabled: true,
    balance: 75000,
    growthRate: 5,
    annualContribution: 10000,
    stopContributionAge: null,
    // Age from which drawdown begins (null = same as retirement)
    drawdownStartAge: null,
  },

  sipp: {
    enabled: true,
    balance: 45000,
    growthRate: 5,
    annualContribution: 5000,
    stopContributionAge: null,
    // Minimum legal access age (UK NMPA 2028) — used as fallback when drawdownStartAge is null
    accessAge: 57,
    // Age from which drawdown begins (null = same as accessAge / NMPA)
    drawdownStartAge: null,
  },

  premiumBonds: {
    enabled: true,
    balance: 50000,
    prizeRate: 3,
    // Age from which drawdown begins (null = same as retirement)
    drawdownStartAge: null,
  },

  cash: {
    enabled: false,
    balance: 10000,
    growthRate: 2,
    annualContribution: 0,
    stopContributionAge: null,
    // Age from which drawdown begins (null = same as retirement)
    drawdownStartAge: null,
  },

  // Pension income streams
  dbPension: {
    enabled: true,
    annualIncome: 12000,
    startAge: 65,
  },

  statePension: {
    enabled: true,
    annualIncome: 11000,
    // startAge derived from statePensionAge above
  },

  // Drawdown
  drawdown: {
    // Default drawdown rate applied to all retirement years
    rate: 4,
  },

  // Withdrawal order (array of pot keys in priority order)
  withdrawalOrder: ['premiumBonds', 'isa', 'sipp', 'cash'],

  // Maximum annual income threshold (null = disabled). Years where totalIncome
  // exceeds this value will be flagged with excessIncome in projection rows.
  maxIncome: null,

  // Year overrides keyed by calendar year
  overrides: {},
};

// ── Store factory ───────────────────────────────────────────────────────────

let _state = structuredClone(DEFAULT_STATE);
const _subscribers = [];

/**
 * Return a deep clone of the current state (immutable outside store).
 */
export function getState() {
  return structuredClone(_state);
}

/**
 * Merge a partial update into state and notify subscribers.
 * @param {Partial<typeof DEFAULT_STATE>} partial
 */
export function setState(partial) {
  // Deep merge top-level objects
  for (const [key, value] of Object.entries(partial)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && typeof _state[key] === 'object') {
      _state[key] = { ..._state[key], ...value };
    } else {
      _state[key] = value;
    }
  }
  _notify();
}

/**
 * Replace entire state (e.g., when loading from URL/localStorage).
 * Missing top-level object fields are filled in from DEFAULT_STATE so that
 * accounts always have their required properties (e.g. growthRate) even when
 * loading older saved states that pre-date those fields.
 * @param {typeof DEFAULT_STATE} newState
 */
export function loadState(newState) {
  // Deep-merge each top-level object key with its default so new fields are
  // populated even for states saved before those fields existed.
  const merged = { ...DEFAULT_STATE };
  for (const [key, value] of Object.entries(newState)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)
        && merged[key] !== null && typeof merged[key] === 'object') {
      merged[key] = { ...merged[key], ...value };
    } else {
      merged[key] = value;
    }
  }
  _state = structuredClone(merged);
  _notify();
}

/**
 * Subscribe to state changes.
 * @param {() => void} fn
 * @returns {() => void} unsubscribe function
 */
export function subscribe(fn) {
  _subscribers.push(fn);
  return () => {
    const idx = _subscribers.indexOf(fn);
    if (idx !== -1) _subscribers.splice(idx, 1);
  };
}

function _notify() {
  for (const fn of _subscribers) {
    try { fn(); } catch (e) { console.error('Store subscriber error:', e); }
  }
}

/**
 * Set or clear a year override entry.
 * @param {number} year  calendar year
 * @param {object} data  override fields (null to clear)
 */
export function setOverride(year, data) {
  const state = getState();
  if (data === null) {
    delete state.overrides[year];
  } else {
    state.overrides[year] = { ...(state.overrides[year] || {}), ...data };
  }
  _state.overrides = state.overrides;
  _notify();
}
