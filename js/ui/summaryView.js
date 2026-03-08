/**
 * summaryView.js — Renders key headline metrics above the chart
 */

import { formatCurrency, toDisplayValue } from './helpers.js';

/**
 * Render summary tiles into `container`.
 *
 * @param {HTMLElement} container
 * @param {object[]}    rows       Projection rows
 * @param {object}      config     App state
 */
export function renderSummaryView(container, rows, config) {
  if (!rows || rows.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No projection data.</p></div>';
    return;
  }

  const displayMode = config.displayMode || 'real';

  // Net worth at retirement
  const retirementRow = rows.find(r => r.age === config.retirementAge) || rows[0];

  // Final row
  const finalRow = rows[rows.length - 1];

  // Retirement rows only (for retirement-phase metrics)
  const retirementRows = rows.filter(r => r.phase === 'retire');
  const totalRetirementYears = retirementRows.length;

  // ── Metric 1: Probability of success ──────────────────────────────────
  // % of retirement years where spending is fully covered (no shortfall)
  const fullyFundedYears = retirementRows.filter(r => r.shortfall === 0).length;
  const probabilityOfSuccess = totalRetirementYears > 0
    ? Math.round((fullyFundedYears / totalRetirementYears) * 100)
    : 100;

  // ── Metric 2: Worst-year balance ──────────────────────────────────────
  // Minimum net worth (display-mode aware) across all retirement years
  const worstYearBalance = retirementRows.length > 0
    ? Math.min(...retirementRows.map(r => toDisplayValue(r, 'totalNetWorth', displayMode)))
    : toDisplayValue(retirementRow, 'totalNetWorth', displayMode);

  // ── Metric 3: First shortfall year ────────────────────────────────────
  const firstShortfallRow = retirementRows.find(r => r.shortfall > 0);
  const firstShortfallAge  = firstShortfallRow ? firstShortfallRow.age : null;

  // ── FI Age: first retirement year where no spending shortfall exists ──
  const fiRow = retirementRows.find(r => r.shortfall === 0);
  const fiAge = fiRow ? fiRow.age : null;

  // ── Monthly target spend (always in today's £ regardless of displayMode) ──
  const monthlyTargetSpend = config.retirementSpending / 12;

  // ── Guaranteed income summary ─────────────────────────────────────────
  const hasDb = config.dbPension.enabled;
  const hasSp = config.statePension.enabled;
  const dbAnnual = hasDb ? config.dbPension.annualIncome : 0;
  const spAnnual = hasSp ? config.statePension.annualIncome : 0;
  const totalGuaranteed = dbAnnual + spAnnual;
  // Earliest age at which ANY guaranteed income begins
  const guaranteedStartAge = hasDb && hasSp
    ? Math.min(config.dbPension.startAge, config.statePensionAge)
    : hasDb ? config.dbPension.startAge
    : hasSp ? config.statePensionAge
    : null;

  // Asset allocation at retirement (or current age if already retired) — display-mode aware
  const allocRow = retirementRow;
  const allocIsa   = toDisplayValue(allocRow, 'isaBalance', displayMode);
  const allocSipp  = toDisplayValue(allocRow, 'sippBalance', displayMode);
  const allocPb    = toDisplayValue(allocRow, 'premiumBondsBalance', displayMode);
  const allocCash  = toDisplayValue(allocRow, 'cashBalance', displayMode);
  const totalAlloc = allocIsa + allocSipp + allocPb + allocCash;

  // Net worth shown in display mode
  const retirementNetWorth = toDisplayValue(retirementRow, 'totalNetWorth', displayMode);
  const finalNetWorth      = toDisplayValue(finalRow, 'totalNetWorth', displayMode);

  // Health class driven by probability of success
  let healthClass;
  if (probabilityOfSuccess === 100) {
    healthClass = 'tile-positive';
  } else if (probabilityOfSuccess >= 80) {
    healthClass = 'tile-warning';
  } else {
    healthClass = 'tile-negative';
  }

  // Safe spending estimate from 4% rule at retirement (display-mode aware)
  const safeSpending4pct = retirementNetWorth * 0.04;

  // Allocation bars (only show enabled accounts)
  const allocItems = [
    { label: 'ISA',     value: allocIsa,   color: '#2563eb', enabled: config.isa.enabled },
    { label: 'SIPP',    value: allocSipp,  color: '#d97706', enabled: config.sipp.enabled },
    { label: 'Bonds',   value: allocPb,    color: '#9333ea', enabled: config.premiumBonds.enabled },
    { label: 'Cash',    value: allocCash,  color: '#64748b', enabled: config.cash.enabled },
  ].filter(a => a.enabled && a.value > 0);

  const allocBars = totalAlloc > 0 && allocItems.length > 0
    ? `<div class="alloc-bar">
        ${allocItems.map(a => `
          <div class="alloc-segment" style="width:${((a.value / totalAlloc) * 100).toFixed(1)}%;background:${a.color}"
               title="${a.label}: ${formatCurrency(a.value)} (${((a.value / totalAlloc) * 100).toFixed(0)}%)"></div>
        `).join('')}
      </div>
      <div class="alloc-legend">
        ${allocItems.map(a => `
          <span class="alloc-key">
            <span class="alloc-dot" style="background:${a.color}"></span>
            ${a.label} ${((a.value / totalAlloc) * 100).toFixed(0)}%
          </span>
        `).join('')}
      </div>`
    : '';

  const modeTag = displayMode === 'real' ? "<span class=\"mode-badge mode-real\">Real</span>" : "<span class=\"mode-badge mode-nominal\">Nominal</span>";

  // Guaranteed income description with start ages
  let guaranteedIncomeDetail = '';
  if (hasDb || hasSp) {
    const parts = [];
    if (hasDb) parts.push(`DB ${formatCurrency(dbAnnual)}/yr from age ${config.dbPension.startAge}`);
    if (hasSp) parts.push(`State Pension ${formatCurrency(spAnnual)}/yr from age ${config.statePensionAge}`);
    guaranteedIncomeDetail = parts.join(' + ');
  }

  container.innerHTML = `
    <div class="snapshot-grid">
      <div class="snapshot-tile snapshot-primary">
        <div class="tile-label">Net Worth at Retirement ${modeTag}</div>
        <div class="tile-value">${formatCurrency(retirementNetWorth)}</div>
        <div class="tile-sub">At age ${config.retirementAge}</div>
      </div>
      <div class="snapshot-tile">
        <div class="tile-label">FI Age</div>
        <div class="tile-value">${fiAge !== null ? fiAge : '—'}</div>
        <div class="tile-sub">${fiAge !== null ? `Financially independent at ${fiAge}` : 'Spending exceeds income'}</div>
      </div>
      <div class="snapshot-tile">
        <div class="tile-label">Target Monthly Spend (today's £)</div>
        <div class="tile-value">${formatCurrency(monthlyTargetSpend)}</div>
        <div class="tile-sub">Retirement spending target</div>
      </div>
      <div class="snapshot-tile">
        <div class="tile-label">4% Safe Spending ${modeTag}</div>
        <div class="tile-value">${formatCurrency(safeSpending4pct)}</div>
        <div class="tile-sub">Sustainable annual draw</div>
      </div>
      ${(hasDb || hasSp) ? `
      <div class="snapshot-tile tile-positive">
        <div class="tile-label">Guaranteed Income${guaranteedStartAge !== null ? ` (from age ${guaranteedStartAge})` : ''}</div>
        <div class="tile-value">${formatCurrency(totalGuaranteed)}/yr</div>
        <div class="tile-sub" title="${guaranteedIncomeDetail}">${guaranteedIncomeDetail}</div>
      </div>
      ` : ''}
      <div class="snapshot-tile ${healthClass}">
        <div class="tile-label">Probability of Success</div>
        <div class="tile-value">${probabilityOfSuccess}%</div>
        <div class="tile-sub">${probabilityOfSuccess === 100 ? `Fully funded to age ${config.endAge}` : firstShortfallAge !== null ? `First shortfall at age ${firstShortfallAge}` : 'Spending exceeds income'}</div>
      </div>
      <div class="snapshot-tile ${worstYearBalance <= 0 ? 'tile-negative' : ''}">
        <div class="tile-label">Worst-Year Balance ${modeTag}</div>
        <div class="tile-value ${worstYearBalance <= 0 ? 'tile-negative' : ''}">${formatCurrency(worstYearBalance)}</div>
        <div class="tile-sub">Lowest net worth in retirement</div>
      </div>
      <div class="snapshot-tile ${firstShortfallAge !== null ? 'tile-negative' : ''}">
        <div class="tile-label">First Shortfall</div>
        <div class="tile-value">${firstShortfallAge !== null ? `Age ${firstShortfallAge}` : '—'}</div>
        <div class="tile-sub">${firstShortfallAge !== null ? `Spending gap first appears at age ${firstShortfallAge}` : 'No shortfall projected'}</div>
      </div>
      <div class="snapshot-tile">
        <div class="tile-label">Final Net Worth (Age ${config.endAge}) ${modeTag}</div>
        <div class="tile-value ${finalNetWorth > 0 ? '' : 'tile-negative'}">${formatCurrency(finalNetWorth)}</div>
        <div class="tile-sub">${finalRow.year}</div>
      </div>
    </div>
    ${allocBars ? `<div class="alloc-section">${allocBars}</div>` : ''}
  `;
}

