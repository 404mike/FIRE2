/**
 * projectionEngine.js — Core yearly projection engine
 *
 * Pure function. Takes full config (state) and returns an array of yearly
 * snapshots from currentAge to endAge. No side effects.
 *
 * Each row:
 * {
 *   year, age,
 *   phase,               // 'accumulate' | 'retire'
 *   isaBalance, sippBalance, premiumBondsBalance, cashBalance,
 *   totalNetWorth,
 *   isaContribution, sippContribution,
 *   isaWithdrawn, sippWithdrawn, premiumBondsWithdrawn, cashWithdrawn,
 *   totalWithdrawn,
 *   dbIncome, stateIncome, totalPensionIncome,
 *   totalIncome,
 *   requiredSpending,
 *   spendingCovered,
 *   shortfall,
 *   note,
 * }
 */

import { getPensionIncome } from './pensionEngine.js';
import { executeWithdrawal } from './withdrawalStrategy.js';
import { projectYear } from './projectionUtils.js';

/**
 * Run the full projection from currentAge to endAge.
 *
 * @param {object} config  Full app state
 * @returns {object[]}     Array of yearly projection rows
 */
export function runProjection(config) {
  const currentYear = new Date().getFullYear();
  const rows = [];

  // Initialise pot balances
  let balances = {
    isa:          config.isa.enabled          ? config.isa.balance          : 0,
    sipp:         config.sipp.enabled         ? config.sipp.balance         : 0,
    premiumBonds: config.premiumBonds.enabled ? config.premiumBonds.balance : 0,
    cash:         config.cash.enabled         ? config.cash.balance         : 0,
  };

  const numYears = config.endAge - config.currentAge;
  const sippAccessAge = config.sipp.accessAge || 57;

  for (let i = 0; i <= numYears; i++) {
    const age  = config.currentAge + i;
    const year = currentYear + i;
    const isRetired = age >= config.retirementAge;
    const phase = isRetired ? 'retire' : 'accumulate';

    // Cumulative inflation factor from the base year
    const inflationRate   = (config.inflationRate ?? 2.5) / 100;
    const inflationFactor = Math.pow(1 + inflationRate, i);

    // ── Step 1: Apply growth to each pot ──────────────────────────────────
    // Capture the pre-growth portfolio total first so that rate-based drawdown
    // is calculated from the opening balance (not the post-growth balance).
    // This enforces the invariant:
    //   net change = openingBalance × (growthRate − drawdownRate)
    const preGrowthPortfolio =
      (config.isa.enabled          ? balances.isa          : 0) +
      (config.sipp.enabled         ? balances.sipp         : 0) +
      (config.premiumBonds.enabled ? balances.premiumBonds : 0) +
      (config.cash.enabled         ? balances.cash         : 0);

    // Growth is applied unconditionally (independent of contribution status),
    // so balances continue to compound even after contributions have stopped.
    if (config.isa.enabled) {
      balances.isa = projectYear(balances.isa, (config.isa.growthRate ?? 0) / 100);
    }
    if (config.sipp.enabled) {
      balances.sipp = projectYear(balances.sipp, (config.sipp.growthRate ?? 0) / 100);
    }
    if (config.premiumBonds.enabled) {
      balances.premiumBonds = projectYear(balances.premiumBonds, (config.premiumBonds.prizeRate ?? 0) / 100);
      // Premium Bonds are capped at £50,000; any excess flows into cash
      const PB_CAP = 50000;
      if (balances.premiumBonds > PB_CAP) {
        const excess = balances.premiumBonds - PB_CAP;
        balances.premiumBonds = PB_CAP;
        if (config.cash.enabled) {
          balances.cash += excess;
        }
      }
    }
    if (config.cash.enabled) {
      balances.cash = projectYear(balances.cash, (config.cash.growthRate ?? 0) / 100);
    }

    // ── Step 2: Apply regular contributions (pre-retirement only) ─────────
    let isaContribution  = 0;
    let sippContribution = 0;

    // Resolve year overrides early so they can be used in contribution logic
    const override = config.overrides[year] || {};

    if (!isRetired) {
      if (config.isa.enabled) {
        const isaStop = config.isa.stopContributionAge;
        const hasIsaContribOverride = override.isaContributionOverride != null;
        if (hasIsaContribOverride) {
          isaContribution = override.isaContributionOverride;
          balances.isa += isaContribution;
        } else if (!isaStop || age < isaStop) {
          isaContribution = config.isa.annualContribution;
          balances.isa += isaContribution;
        }
      }
      if (config.sipp.enabled) {
        const sippStop = config.sipp.stopContributionAge;
        const hasSippContribOverride = override.sippContributionOverride != null;
        if (hasSippContribOverride) {
          sippContribution = override.sippContributionOverride;
          balances.sipp += sippContribution;
        } else if (!sippStop || age < sippStop) {
          sippContribution = config.sipp.annualContribution;
          balances.sipp += sippContribution;
        }
      }
      if (config.cash.enabled) {
        const cashStop = config.cash.stopContributionAge;
        if (!cashStop || age < cashStop) {
          balances.cash += config.cash.annualContribution;
        }
      }
    }

    // ── Step 3: Apply year overrides / lump sums ──────────────────────────
    if (override.isaLumpSum)          { balances.isa          += override.isaLumpSum;          isaContribution  += override.isaLumpSum; }
    if (override.sippLumpSum)         { balances.sipp         += override.sippLumpSum;         sippContribution += override.sippLumpSum; }
    if (override.premiumBondLumpSum)  { balances.premiumBonds += override.premiumBondLumpSum; }
    if (override.cashLumpSum)         { balances.cash         += override.cashLumpSum; }

    // ── Step 4: Retirement withdrawals ────────────────────────────────────
    let isaWithdrawn          = 0;
    let sippWithdrawn         = 0;
    let premiumBondsWithdrawn = 0;
    let cashWithdrawn         = 0;
    let shortfall             = 0;
    let spendingCovered       = 0;
    let requiredSpending      = 0;

    const { total: pensionIncome, dbIncome, stateIncome } = getPensionIncome(config, age);

    if (isRetired) {
      // Determine drawdown rate (default from sidebar, overridable per year)
      let drawdownRate = (config.drawdown.rate ?? config.drawdown.phase1Rate ?? 4) / 100;

      // Per-year drawdown rate override (overrides main rate for this year)
      if (override.drawdownRateOverride != null && override.drawdownRateOverride !== 0) {
        drawdownRate = override.drawdownRateOverride / 100;
      }

      // Required spending: inflation-adjusted from today's money
      requiredSpending = config.retirementSpending * inflationFactor;

      // SIPP access constraint
      const sippAccessAge = config.sipp.accessAge || 57;
      const sippAccessAllowed = config.sipp.enabled && age >= sippAccessAge;

      // ISA drawdown constraint
      const isaDrawdownAge = config.isa.drawdownStartAge != null
        ? config.isa.drawdownStartAge
        : config.retirementAge;
      const isaDrawdownAllowed = config.isa.enabled && age >= isaDrawdownAge;

      // Premium Bonds drawdown constraint
      const pbDrawdownAge = config.premiumBonds.drawdownStartAge !== null
        ? config.premiumBonds.drawdownStartAge
        : config.retirementAge;
      const premiumBondsDrawdownAllowed = config.premiumBonds.enabled && age >= pbDrawdownAge;

      // Spending gap after pension income
      const spendingGap = Math.max(0, requiredSpending - pensionIncome);

      // Rate-based drawdown: always withdraw at least drawdownRate × portfolio,
      // calculated from the pre-growth (opening) balance so that when
      // growthRate > drawdownRate the portfolio grows at the net rate.
      const rateDrawdown = preGrowthPortfolio * drawdownRate;

      // Effective withdrawal target: whichever is larger
      const gap = Math.max(spendingGap, rateDrawdown);

      if (gap > 0) {
        const result = executeWithdrawal(
          balances,
          gap,
          config.withdrawalOrder,
          { isaDrawdownAllowed, sippAccessAllowed, premiumBondsDrawdownAllowed }
        );
        balances             = result.balances;
        isaWithdrawn          = result.withdrawn.isa;
        sippWithdrawn         = result.withdrawn.sipp;
        premiumBondsWithdrawn = result.withdrawn.premiumBonds;
        cashWithdrawn         = result.withdrawn.cash;
        // Shortfall is spending-based: did total income cover spending?
        const totalIncomeSoFar = pensionIncome
          + result.withdrawn.isa + result.withdrawn.sipp
          + result.withdrawn.premiumBonds + result.withdrawn.cash;
        shortfall = Math.max(0, requiredSpending - totalIncomeSoFar);
      }

      spendingCovered = requiredSpending - shortfall;
    }

    // ── Per-pot custom drawdown overrides (additional voluntary withdrawals) ──
    // Applied in both accumulation and retirement phases so manual overrides
    // always affect balances regardless of phase.
    const applyCustomDrawdown = (balance, amount) => {
      const take = Math.min(Math.max(0, balance), amount || 0);
      return take;
    };

    if (override.isaCustomDrawdown) {
      const take = applyCustomDrawdown(balances.isa, override.isaCustomDrawdown);
      balances.isa -= take;
      isaWithdrawn += take;
    }
    if (override.sippCustomDrawdown && config.sipp.enabled && age >= sippAccessAge) {
      const take = applyCustomDrawdown(balances.sipp, override.sippCustomDrawdown);
      balances.sipp -= take;
      sippWithdrawn += take;
    }
    if (override.premiumBondsCustomDrawdown && config.premiumBonds.enabled) {
      const take = applyCustomDrawdown(balances.premiumBonds, override.premiumBondsCustomDrawdown);
      balances.premiumBonds -= take;
      premiumBondsWithdrawn += take;
    }
    if (override.cashCustomDrawdown && config.cash.enabled) {
      const take = applyCustomDrawdown(balances.cash, override.cashCustomDrawdown);
      balances.cash -= take;
      cashWithdrawn += take;
    }

    const totalWithdrawn =
      isaWithdrawn + sippWithdrawn + premiumBondsWithdrawn + cashWithdrawn;

    const totalIncome = pensionIncome + totalWithdrawn;

    const totalNetWorth = Math.max(0,
      balances.isa + balances.sipp + balances.premiumBonds + balances.cash
    );

    rows.push({
      year,
      age,
      phase,
      isaBalance:          Math.round(balances.isa),
      sippBalance:         Math.round(balances.sipp),
      premiumBondsBalance: Math.round(balances.premiumBonds),
      cashBalance:         Math.round(balances.cash),
      totalNetWorth:       Math.round(totalNetWorth),
      realTotalNetWorth:   Math.round(totalNetWorth / inflationFactor),
      inflationFactor:     Math.round(inflationFactor * 10000) / 10000,
      isaContribution:     Math.round(isaContribution),
      sippContribution:    Math.round(sippContribution),
      isaWithdrawn:        Math.round(isaWithdrawn),
      sippWithdrawn:       Math.round(sippWithdrawn),
      premiumBondsWithdrawn: Math.round(premiumBondsWithdrawn),
      cashWithdrawn:       Math.round(cashWithdrawn),
      totalWithdrawn:      Math.round(totalWithdrawn),
      dbIncome:            Math.round(dbIncome),
      stateIncome:         Math.round(stateIncome),
      totalPensionIncome:  Math.round(pensionIncome),
      totalIncome:         Math.round(totalIncome),
      requiredSpending:    Math.round(requiredSpending),
      spendingCovered:     Math.round(spendingCovered),
      shortfall:           Math.round(shortfall),
      note:                override.note || '',
    });
  }

  return rows;
}
