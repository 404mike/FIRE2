/**
 * pensionEngine.js — Determine which pension incomes are active in a given year
 *
 * Pension incomes are fixed annual amounts that begin at a configured age.
 * They are NOT withdrawn from pots — they reduce the spending gap directly.
 */

/**
 * Calculate total pension income active in a given year.
 *
 * The state pension nominal value is scaled by a growth factor.  The factor
 * used depends on `config.statePension.growthModel`:
 *
 *   "real"       — grows with inflation (constant real purchasing power).
 *                  nominalPension = base × inflationFactor  (default / Model A)
 *   "tripleLock" — grows by max(inflation, 2.5%) per year compounded.
 *                  nominalPension = base × (1 + max(inflationRate, 2.5%))^years
 *   "custom"     — grows by a user-configured rate per year compounded.
 *                  nominalPension = base × (1 + customGrowthRate)^years
 *
 * The fourth parameter `pensionGrowthFactor` is pre-computed by the projection
 * engine for the active growth model so this function stays a pure mapping.
 * When omitted it falls back to `inflationFactor` (backward-compatible).
 *
 * @param {object} config               App state / config
 * @param {number} age                  Age at start of this modelled year
 * @param {number} [inflationFactor=1]  Cumulative CPI multiplier from base year
 * @param {number|null} [pensionGrowthFactor=null]
 *   Pre-computed growth factor for the state pension.
 *   When null the function falls back to `inflationFactor`.
 * @returns {object} { total, dbIncome, stateIncome, breakdown }
 */
export function getPensionIncome(config, age, inflationFactor = 1, pensionGrowthFactor = null) {
  let dbIncome = 0;
  let stateIncome = 0;

  // Defined Benefit pension — fixed nominal amount, not inflation-adjusted.
  if (config.dbPension.enabled && age >= config.dbPension.startAge) {
    dbIncome = config.dbPension.annualIncome;
  }

  // State pension — scaled to nominal using the configured growth model.
  // When pensionGrowthFactor is not provided the legacy behaviour is preserved
  // (inflate by CPI, i.e. constant real purchasing power).
  if (config.statePension.enabled && age >= config.statePensionAge) {
    const factor = pensionGrowthFactor ?? inflationFactor;
    stateIncome = config.statePension.annualIncome * factor;
  }

  const total = dbIncome + stateIncome;

  return {
    total,
    dbIncome,
    stateIncome,
    breakdown: { db: dbIncome, state: stateIncome },
  };
}

/**
 * Compute the cumulative growth factor for the state pension after `years` years,
 * based on the configured growth model.
 *
 * @param {object} config  App state
 * @param {number} years   Number of years from the base year (0 = base year)
 * @returns {number}       Cumulative growth factor (e.g. 1.05 = 5% total growth)
 */
export function computePensionGrowthFactor(config, years) {
  const inflationRate  = (config.inflationRate ?? 2.5) / 100;
  const growthModel    = config.statePension?.growthModel ?? 'real';

  if (growthModel === 'tripleLock') {
    // Simplified triple lock: annual increase = max(inflation, 2.5%)
    const annualRate = Math.max(inflationRate, 0.025);
    return Math.pow(1 + annualRate, years);
  }

  if (growthModel === 'custom') {
    const customRate = (config.statePension?.customGrowthRate ?? 2.5) / 100;
    return Math.pow(1 + customRate, years);
  }

  // Default: "real" — state pension keeps pace with CPI (constant real value)
  return Math.pow(1 + inflationRate, years);
}

/**
 * Return the first year (calendar) in which a pension becomes active.
 *
 * @param {object} config
 * @param {string} pensionKey  'dbPension' | 'statePension'
 * @returns {number|null}
 */
export function getPensionStartYear(config, pensionKey) {
  const currentYear = new Date().getFullYear();
  if (pensionKey === 'dbPension' && config.dbPension.enabled) {
    return currentYear + (config.dbPension.startAge - config.currentAge);
  }
  if (pensionKey === 'statePension' && config.statePension.enabled) {
    return currentYear + (config.statePensionAge - config.currentAge);
  }
  return null;
}
