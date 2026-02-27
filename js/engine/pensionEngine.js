/**
 * pensionEngine.js — Determine which pension incomes are active in a given year
 *
 * Pension incomes are fixed annual amounts that begin at a configured age.
 * They are NOT withdrawn from pots — they reduce the spending gap directly.
 */

/**
 * Calculate total pension income active in a given year.
 *
 * @param {object} config   App state / config
 * @param {number} age      Age at start of this modelled year
 * @returns {object} { total, dbIncome, stateIncome, breakdown }
 */
export function getPensionIncome(config, age) {
  let dbIncome = 0;
  let stateIncome = 0;

  // Defined Benefit pension
  if (config.dbPension.enabled && age >= config.dbPension.startAge) {
    dbIncome = config.dbPension.annualIncome;
  }

  // State pension — start age = statePensionAge (configurable)
  if (config.statePension.enabled && age >= config.statePensionAge) {
    stateIncome = config.statePension.annualIncome;
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
