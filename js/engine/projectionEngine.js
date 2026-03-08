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

import { getPensionIncome, computePensionGrowthFactor } from './pensionEngine.js';
import { executeWithdrawal } from './withdrawalStrategy.js';
import { projectYear, getIsaDrawdownAllowed, getSippDrawdownAllowed, getCashDrawdownAllowed } from './projectionUtils.js';
import { validateYearInvariants } from './invariants.js';

/**
 * Run the full projection from currentAge to endAge.
 *
 * @param {object} config  Full app state
 * @param {object} [opts]
 * @param {boolean} [opts.debug=false]  When true, each row includes a `_debug` payload
 *   with per-account ledger data and invariant-pass confirmation.
 * @returns {object[]}     Array of yearly projection rows
 */
export function runProjection(config, { debug = false } = {}) {
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

  for (let i = 0; i <= numYears; i++) {
    const age  = config.currentAge + i;
    const year = currentYear + i;
    const isRetired = age >= config.retirementAge;
    const phase = isRetired ? 'retire' : 'accumulate';

    // Cumulative inflation factor from the base year
    const inflationRate   = (config.inflationRate ?? 2.5) / 100;
    const inflationFactor = Math.pow(1 + inflationRate, i);

    // Pension-specific growth factor based on configured state pension model.
    // May differ from inflationFactor when growthModel is 'tripleLock' or 'custom'.
    const pensionGrowthFactor = computePensionGrowthFactor(config, i);

    // Per-account ledger tracking (used for invariant validation and debug output)
    const openingBals = { ...balances };
    const growthAmt   = { isa: 0, sipp: 0, premiumBonds: 0, cash: 0 };
    const inflowsLed  = { isa: 0, sipp: 0, premiumBonds: 0, cash: 0 };
    const outflowsLed = { isa: 0, sipp: 0, premiumBonds: 0, cash: 0 };
    const xfersIn     = { isa: 0, sipp: 0, premiumBonds: 0, cash: 0 };
    const xfersOut    = { isa: 0, sipp: 0, premiumBonds: 0, cash: 0 };

    // Capture the pre-contribution portfolio total so that rate-based drawdown
    // is calculated from the true opening balance (not post-contribution/growth).
    // This enforces the invariant:
    //   net change = openingBalance × (growthRate − drawdownRate)
    const preGrowthPortfolio =
      (config.isa.enabled          ? balances.isa          : 0) +
      (config.sipp.enabled         ? balances.sipp         : 0) +
      (config.premiumBonds.enabled ? balances.premiumBonds : 0) +
      (config.cash.enabled         ? balances.cash         : 0);

    // ── Step 1: Apply regular contributions (pre-retirement only) ─────────
    // Contributions are applied before growth so that money invested this year
    // earns a full year of returns (opening → contributions → growth).
    let isaContribution          = 0;
    let sippContribution         = 0;
    let premiumBondsContribution = 0;
    let cashContribution         = 0;

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
        inflowsLed.isa += isaContribution;
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
        inflowsLed.sipp += sippContribution;
      }
      if (config.cash.enabled) {
        const cashStop = config.cash.stopContributionAge;
        const hasCashContribOverride = override.cashContributionOverride != null;
        if (hasCashContribOverride) {
          cashContribution = override.cashContributionOverride;
          balances.cash += cashContribution;
        } else if (!cashStop || age < cashStop) {
          cashContribution = config.cash.annualContribution;
          balances.cash += cashContribution;
        }
        inflowsLed.cash += cashContribution;
      }
    }

    // ── Step 2: Apply growth to each pot (post-contribution balance) ──────
    // Growth is applied after contributions so that money invested this year
    // earns returns immediately (contributions → growth ordering).
    // Growth continues unconditionally in retirement (compounding on the balance).
    if (config.isa.enabled) {
      const prev = balances.isa;
      balances.isa = projectYear(balances.isa, (config.isa.growthRate ?? 0) / 100);
      growthAmt.isa = balances.isa - prev;
    }
    if (config.sipp.enabled) {
      const prev = balances.sipp;
      balances.sipp = projectYear(balances.sipp, (config.sipp.growthRate ?? 0) / 100);
      growthAmt.sipp = balances.sipp - prev;
    }
    if (config.premiumBonds.enabled) {
      const prev      = balances.premiumBonds;
      const grownBal  = projectYear(balances.premiumBonds, (config.premiumBonds.prizeRate ?? 0) / 100);
      const prize     = grownBal - prev;
      growthAmt.premiumBonds = prize;

      if (config.premiumBonds.compoundMode) {
        // Mode B: prize compounds inside the PB account (balance grows)
        balances.premiumBonds = grownBal;
        // PB cap is enforced in Step 3b (after all inflows including lump sums)
      } else {
        // Mode A: prize paid out — PB balance stays flat, prize transferred to cash
        balances.premiumBonds = prev;      // balance unchanged
        xfersOut.premiumBonds += prize;    // prize leaves PB account
        if (config.cash.enabled) {
          balances.cash += prize;          // prize enters cash account
          xfersIn.cash  += prize;
        }
        // If cash is disabled the prize is disbursed outside the model (no-op)
      }
    }
    if (config.cash.enabled) {
      const prev = balances.cash;
      balances.cash = projectYear(balances.cash, (config.cash.growthRate ?? 0) / 100);
      growthAmt.cash = balances.cash - prev;
    }

    // ── Step 3: Apply year overrides / lump sums ──────────────────────────
    if (override.isaLumpSum)          { balances.isa          += override.isaLumpSum;          isaContribution  += override.isaLumpSum;  inflowsLed.isa          += override.isaLumpSum; }
    if (override.sippLumpSum)         { balances.sipp         += override.sippLumpSum;         sippContribution += override.sippLumpSum; inflowsLed.sipp         += override.sippLumpSum; }
    if (override.premiumBondLumpSum)  { balances.premiumBonds += override.premiumBondLumpSum;  premiumBondsContribution += override.premiumBondLumpSum; inflowsLed.premiumBonds += override.premiumBondLumpSum; }
    if (override.cashLumpSum)         { balances.cash         += override.cashLumpSum;          cashContribution += override.cashLumpSum; inflowsLed.cash         += override.cashLumpSum; }

    // ── Step 3b: Premium Bonds cap enforcement (after all inflows) ─────────
    // The £50,000 cap must be applied after every inflow (growth AND lump sums)
    // so that an override that pushes PB above the cap is correctly handled.
    const PB_CAP = 50000;
    if (config.premiumBonds.enabled && balances.premiumBonds > PB_CAP) {
      const excess = balances.premiumBonds - PB_CAP;
      balances.premiumBonds = PB_CAP;
      xfersOut.premiumBonds += excess;
      if (config.cash.enabled) {
        balances.cash += excess;
        xfersIn.cash  += excess;
      }
    }

    // ── Step 4: Retirement withdrawals ────────────────────────────────────
    let isaWithdrawn          = 0;
    let sippWithdrawn         = 0;
    let premiumBondsWithdrawn = 0;
    let cashWithdrawn         = 0;
    let shortfall             = 0;
    let spendingCovered       = 0;
    let requiredSpending      = 0;

    const { total: pensionIncome, dbIncome, stateIncome } = getPensionIncome(config, age, inflationFactor, pensionGrowthFactor);

    // Per-account drawdown eligibility is computed outside the retirement gate so
    // that accounts with an explicit drawdown start age earlier than retirementAge
    // can begin drawing independently (e.g. SIPP accessible at NMPA 57 while the
    // user is still working until 65).
    const sippAccessAllowed = getSippDrawdownAllowed(config, age);
    const isaDrawdownAllowed = getIsaDrawdownAllowed(config, age);
    const pbDrawdownAge = config.premiumBonds.drawdownStartAge !== null
      ? config.premiumBonds.drawdownStartAge
      : config.retirementAge;
    const premiumBondsDrawdownAllowed = config.premiumBonds.enabled && age >= pbDrawdownAge;
    const cashDrawdownAllowed = getCashDrawdownAllowed(config, age);

    // Drawdown fires from retirementAge, or earlier when any account has reached
    // its individual drawdown start date.
    const inDrawdownPhase = isRetired || sippAccessAllowed || isaDrawdownAllowed || premiumBondsDrawdownAllowed || cashDrawdownAllowed;

    if (inDrawdownPhase) {
      // Determine drawdown rate (default from sidebar, overridable per year)
      let drawdownRate = (config.drawdown.rate ?? config.drawdown.phase1Rate ?? 4) / 100;

      // Per-year drawdown rate override (overrides main rate for this year)
      if (override.drawdownRateOverride != null && override.drawdownRateOverride !== 0) {
        drawdownRate = override.drawdownRateOverride / 100;
      }

      // Required spending only applies from retirement age; pre-retirement drawdown
      // (e.g. SIPP before retirementAge) is driven by the drawdown rate only.
      requiredSpending = isRetired ? config.retirementSpending * inflationFactor : 0;

      // Spending gap after pension income
      const spendingGap = Math.max(0, requiredSpending - pensionIncome);

      // Rate-based drawdown: withdraw exactly drawdownRate × portfolio,
      // calculated from the pre-growth (opening) balance so that when
      // growthRate > drawdownRate the portfolio grows at the net rate.
      const rateDrawdown = preGrowthPortfolio * drawdownRate;

      // Exactly one withdrawal strategy is active at a time:
      //   • drawdownRate > 0 → percentage drawdown drives the withdrawal
      //   • drawdownRate = 0 → spending gap drives the withdrawal
      // Using both simultaneously would cause a double-withdrawal bug where
      // the spending amount silently overrides the configured rate, draining
      // the portfolio far faster than expected.
      const gap = drawdownRate > 0 ? rateDrawdown : spendingGap;

      // ── Step 4a: Account-specific drawdown rate overrides ─────────────────
      // These draw a specific percentage from a single account BEFORE the main
      // portfolio-level withdrawal. The account is then excluded from the main
      // withdrawal so it is not drawn twice, and the main gap is reduced by
      // the amount already withdrawn here.
      if (override.sippDrawdownRateOverride != null && sippAccessAllowed) {
        const rate = override.sippDrawdownRateOverride / 100;
        const take = Math.min(Math.max(0, balances.sipp), balances.sipp * rate);
        balances.sipp -= take;
        sippWithdrawn += take;
        outflowsLed.sipp += take;
      }
      if (override.isaDrawdownRateOverride != null && isaDrawdownAllowed) {
        const rate = override.isaDrawdownRateOverride / 100;
        const take = Math.min(Math.max(0, balances.isa), balances.isa * rate);
        balances.isa -= take;
        isaWithdrawn += take;
        outflowsLed.isa += take;
      }
      if (override.cashDrawdownRateOverride != null && cashDrawdownAllowed) {
        const rate = override.cashDrawdownRateOverride / 100;
        const take = Math.min(Math.max(0, balances.cash), balances.cash * rate);
        balances.cash -= take;
        cashWithdrawn += take;
        outflowsLed.cash += take;
      }

      // Reduce the main gap by what was already drawn via account-specific rates,
      // and exclude those accounts from the main withdrawal order.
      const accountSpecificDrawn = sippWithdrawn + isaWithdrawn + cashWithdrawn;
      const adjustedGap = Math.max(0, gap - accountSpecificDrawn);
      const effectiveWithdrawalOrder = config.withdrawalOrder.filter(pot => {
        if (pot === 'sipp' && override.sippDrawdownRateOverride != null && sippAccessAllowed) return false;
        if (pot === 'isa'  && override.isaDrawdownRateOverride  != null && isaDrawdownAllowed)  return false;
        if (pot === 'cash' && override.cashDrawdownRateOverride != null && cashDrawdownAllowed) return false;
        return true;
      });

      if (adjustedGap > 0) {
        const result = executeWithdrawal(
          balances,
          adjustedGap,
          effectiveWithdrawalOrder,
          { isaDrawdownAllowed, sippAccessAllowed, premiumBondsDrawdownAllowed, cashDrawdownAllowed }
        );
        balances              = result.balances;
        isaWithdrawn          += result.withdrawn.isa;
        sippWithdrawn         += result.withdrawn.sipp;
        premiumBondsWithdrawn += result.withdrawn.premiumBonds;
        cashWithdrawn         += result.withdrawn.cash;
        outflowsLed.isa          += result.withdrawn.isa;
        outflowsLed.sipp         += result.withdrawn.sipp;
        outflowsLed.premiumBonds += result.withdrawn.premiumBonds;
        outflowsLed.cash         += result.withdrawn.cash;
      }

      // Shortfall is spending-based: did total income (pension + all withdrawals) cover spending?
      const totalIncomeSoFar = pensionIncome
        + isaWithdrawn + sippWithdrawn + premiumBondsWithdrawn + cashWithdrawn;
      shortfall = Math.max(0, requiredSpending - totalIncomeSoFar);

      spendingCovered = requiredSpending - shortfall;
    }

    // ── Per-pot custom drawdown overrides (additional voluntary withdrawals) ──
    // Applied in both accumulation and retirement phases so manual overrides
    // always affect balances regardless of phase.
    const applyCustomDrawdown = (balance, amount) => {
      const take = Math.min(Math.max(0, balance), amount || 0);
      return take;
    };

    if (override.isaCustomDrawdown && isaDrawdownAllowed) {
      const take = applyCustomDrawdown(balances.isa, override.isaCustomDrawdown);
      balances.isa -= take;
      isaWithdrawn += take;
      outflowsLed.isa += take;
    }
    if (override.sippCustomDrawdown && sippAccessAllowed) {
      const take = applyCustomDrawdown(balances.sipp, override.sippCustomDrawdown);
      balances.sipp -= take;
      sippWithdrawn += take;
      outflowsLed.sipp += take;
    }
    if (override.premiumBondsCustomDrawdown && config.premiumBonds.enabled) {
      const take = applyCustomDrawdown(balances.premiumBonds, override.premiumBondsCustomDrawdown);
      balances.premiumBonds -= take;
      premiumBondsWithdrawn += take;
      outflowsLed.premiumBonds += take;
    }
    if (override.cashCustomDrawdown && config.cash.enabled) {
      const take = applyCustomDrawdown(balances.cash, override.cashCustomDrawdown);
      balances.cash -= take;
      cashWithdrawn += take;
      outflowsLed.cash += take;
    }

    // Recalculate shortfall/spendingCovered after custom drawdowns so that
    // extra voluntary withdrawals are counted against spending need.
    if (inDrawdownPhase) {
      const totalIncomeFinal = pensionIncome
        + isaWithdrawn + sippWithdrawn + premiumBondsWithdrawn + cashWithdrawn;
      shortfall       = Math.max(0, requiredSpending - totalIncomeFinal);
      spendingCovered = requiredSpending - shortfall;
    }

    const totalWithdrawn =
      isaWithdrawn + sippWithdrawn + premiumBondsWithdrawn + cashWithdrawn;

    const totalIncome = pensionIncome + totalWithdrawn;

    const totalNetWorth = Math.max(0,
      balances.isa + balances.sipp + balances.premiumBonds + balances.cash
    );

    const maxIncome = config.maxIncome ?? null;
    const excessIncome = (maxIncome !== null && totalIncome > maxIncome)
      ? Math.round(totalIncome - maxIncome)
      : 0;

    // ── Invariant validation ───────────────────────────────────────────────
    // Build per-account ledger and validate hard invariants. Throws if any
    // invariant is violated, making the year/account immediately identifiable.
    const accounts = {
      isa: {
        opening: openingBals.isa, growth: growthAmt.isa,
        inflows: inflowsLed.isa,  outflows: outflowsLed.isa,
        transfersIn: xfersIn.isa, transfersOut: xfersOut.isa,
        closing: balances.isa,    reportedWithdrawn: isaWithdrawn,
      },
      sipp: {
        opening: openingBals.sipp, growth: growthAmt.sipp,
        inflows: inflowsLed.sipp,  outflows: outflowsLed.sipp,
        transfersIn: xfersIn.sipp, transfersOut: xfersOut.sipp,
        closing: balances.sipp,    reportedWithdrawn: sippWithdrawn,
      },
      premiumBonds: {
        opening: openingBals.premiumBonds, growth: growthAmt.premiumBonds,
        inflows: inflowsLed.premiumBonds,  outflows: outflowsLed.premiumBonds,
        transfersIn: xfersIn.premiumBonds, transfersOut: xfersOut.premiumBonds,
        closing: balances.premiumBonds,    reportedWithdrawn: premiumBondsWithdrawn,
      },
      cash: {
        opening: openingBals.cash, growth: growthAmt.cash,
        inflows: inflowsLed.cash,  outflows: outflowsLed.cash,
        transfersIn: xfersIn.cash, transfersOut: xfersOut.cash,
        closing: balances.cash,    reportedWithdrawn: cashWithdrawn,
      },
    };

    validateYearInvariants({
      accounts,
      netWorth: totalNetWorth,
      income: pensionIncome,
      spendNeed: requiredSpending,
      shortfall,
      year,
      age,
    });

    const surplus = Math.max(0, totalIncome - requiredSpending);
    const totalContributions =
      isaContribution + sippContribution + premiumBondsContribution + cashContribution;

    const row = {
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
      // Pre-computed real (inflation-adjusted) values — divide nominal by inflationFactor.
      // Used by UI when displayMode === 'real'.
      realIsaBalance:           Math.round(balances.isa / inflationFactor),
      realSippBalance:          Math.round(balances.sipp / inflationFactor),
      realPremiumBondsBalance:  Math.round(balances.premiumBonds / inflationFactor),
      realCashBalance:          Math.round(balances.cash / inflationFactor),
      realIsaWithdrawn:         Math.round(isaWithdrawn / inflationFactor),
      realSippWithdrawn:        Math.round(sippWithdrawn / inflationFactor),
      realPremiumBondsWithdrawn:Math.round(premiumBondsWithdrawn / inflationFactor),
      realCashWithdrawn:        Math.round(cashWithdrawn / inflationFactor),
      realTotalWithdrawn:       Math.round(totalWithdrawn / inflationFactor),
      realDbIncome:             Math.round(dbIncome / inflationFactor),
      realStateIncome:          Math.round(stateIncome / inflationFactor),
      realTotalPensionIncome:   Math.round(pensionIncome / inflationFactor),
      realTotalIncome:          Math.round(totalIncome / inflationFactor),
      realRequiredSpending:     Math.round(requiredSpending / inflationFactor),
      realSpendingCovered:      Math.round(spendingCovered / inflationFactor),
      realShortfall:            Math.round(shortfall / inflationFactor),
      realSurplus:              Math.round(surplus / inflationFactor),
      realTotalContributions:   Math.round(totalContributions / inflationFactor),
      isaContribution:     Math.round(isaContribution),
      sippContribution:    Math.round(sippContribution),
      premiumBondsContribution: Math.round(premiumBondsContribution),
      cashContribution:    Math.round(cashContribution),
      totalContributions:  Math.round(totalContributions),
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
      surplus:             Math.round(surplus),
      excessIncome,
      note:                override.note || '',
    };

    if (debug) {
      row._debug = {
        accounts,
        invariantsPassed: true,

        isaOpening:            Math.round(openingBals.isa),
        isaGrowth:             Math.round(growthAmt.isa * 100) / 100,
        isaInflows:            Math.round(inflowsLed.isa),
        isaOutflows:           Math.round(outflowsLed.isa),
        isaWithdrawn:          Math.round(isaWithdrawn),
        isaBalance:            Math.round(balances.isa),

        sippOpening:           Math.round(openingBals.sipp),
        sippGrowth:            Math.round(growthAmt.sipp * 100) / 100,
        sippInflows:           Math.round(inflowsLed.sipp),
        sippOutflows:          Math.round(outflowsLed.sipp),
        sippWithdrawn:         Math.round(sippWithdrawn),
        sippBalance:           Math.round(balances.sipp),

        premiumBondsOpening:   Math.round(openingBals.premiumBonds),
        premiumBondsGrowth:    Math.round(growthAmt.premiumBonds * 100) / 100,
        premiumBondsInflows:   Math.round(inflowsLed.premiumBonds),
        premiumBondsOutflows:  Math.round(outflowsLed.premiumBonds),
        premiumBondsWithdrawn: Math.round(premiumBondsWithdrawn),
        premiumBondsBalance:   Math.round(balances.premiumBonds),

        cashOpening:           Math.round(openingBals.cash),
        cashGrowth:            Math.round(growthAmt.cash * 100) / 100,
        cashInflows:           Math.round(inflowsLed.cash),
        cashOutflows:          Math.round(outflowsLed.cash),
        cashWithdrawn:         Math.round(cashWithdrawn),
        cashBalance:           Math.round(balances.cash),

        dbIncome:              Math.round(dbIncome),
        stateIncome:           Math.round(stateIncome),
        totalPensionIncome:    Math.round(pensionIncome),
      };
    }

    rows.push(row);
  }

  return rows;
}
