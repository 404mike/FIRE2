/**
 * summaryView.js — Renders key headline metrics above the chart
 *
 * Includes:
 *  - Plan summary tiles (net worth, FI age, guaranteed income, success, etc.)
 *  - Phase timeline bar showing accumulation / bridge / retirement / pension transitions
 *  - Bridge summary card when a bridge period exists
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

  // Retirement + bridge rows (for post-retirement metrics)
  const postRetirementRows = rows.filter(r => r.phase === 'retire' || r.phase === 'bridge');
  const totalRetirementYears = postRetirementRows.length;

  // ── Metric 1: Probability of success ──────────────────────────────────
  // Deterministic model: % of retirement + bridge years where spending is
  // fully covered (no shortfall).
  const fullyFundedYears = postRetirementRows.filter(r => r.shortfall === 0).length;
  const probabilityOfSuccess = totalRetirementYears > 0
    ? Math.round((fullyFundedYears / totalRetirementYears) * 100)
    : 100;

  // ── Metric 2: Worst-year balance ──────────────────────────────────────
  // Minimum net worth (display-mode aware) across all retirement years
  const worstYearBalance = postRetirementRows.length > 0
    ? Math.min(...postRetirementRows.map(r => toDisplayValue(r, 'totalNetWorth', displayMode)))
    : toDisplayValue(retirementRow, 'totalNetWorth', displayMode);

  // ── Metric 3: First shortfall year ────────────────────────────────────
  const firstShortfallRow = postRetirementRows.find(r => r.shortfall > 0);
  const firstShortfallAge  = firstShortfallRow ? firstShortfallRow.age : null;

  // ── FI Age: first retirement year where no spending shortfall exists ──
  const fiRow = postRetirementRows.find(r => r.shortfall === 0);
  const fiAge = fiRow ? fiRow.age : null;

  // ── Monthly target spend (always in today's £ regardless of displayMode) ──
  const monthlyTargetSpend = config.retirementSpending / 12;

  // ── Guaranteed income summary ─────────────────────────────────────────
  const hasDb = config.dbPension.enabled;
  const hasSp = config.statePension.enabled;
  const dbAnnual = hasDb ? config.dbPension.annualIncome : 0;
  const spAnnual = hasSp ? config.statePension.annualIncome : 0;
  const totalGuaranteed = dbAnnual + spAnnual;

  // ── Bridge summary ────────────────────────────────────────────────────
  // Bridge = retirement age → first pension start.  Compute total spending
  // gap that must be funded from portfolio alone (no guaranteed income).
  const bridgeRows = rows.filter(r => r.phase === 'bridge');
  const hasBridge  = bridgeRows.length > 0;
  const bridgeTotalSpending = bridgeRows.reduce((s, r) => s + toDisplayValue(r, 'requiredSpending', displayMode), 0);
  const bridgeFundedByIsa   = bridgeRows.reduce((s, r) => s + toDisplayValue(r, 'isaWithdrawn', displayMode), 0);
  const bridgeFundedBySipp  = bridgeRows.reduce((s, r) => s + toDisplayValue(r, 'sippWithdrawn', displayMode), 0);
  const bridgeFundedByPb    = bridgeRows.reduce((s, r) => s + toDisplayValue(r, 'premiumBondsWithdrawn', displayMode), 0);
  const bridgeFundedByCash  = bridgeRows.reduce((s, r) => s + toDisplayValue(r, 'cashWithdrawn', displayMode), 0);
  const bridgeStartAge = hasBridge ? bridgeRows[0].age : null;
  const bridgeEndAge   = hasBridge ? bridgeRows[bridgeRows.length - 1].age + 1 : null;

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

  // ── Guaranteed income card ─────────────────────────────────────────────
  // Headline shows total; sub-text distinguishes DB start age vs state pension start age
  let guaranteedIncomeCard = '';
  if (hasDb || hasSp) {
    const dbLine  = hasDb ? `DB pension: ${formatCurrency(dbAnnual)}/yr — starts age ${config.dbPension.startAge}` : '';
    const spLine  = hasSp ? `State pension: ${formatCurrency(spAnnual)}/yr — starts age ${config.statePensionAge}` : '';
    const lines   = [dbLine, spLine].filter(Boolean);
    guaranteedIncomeCard = `
      <div class="snapshot-tile tile-positive tile-guaranteed">
        <div class="tile-label">Guaranteed Income</div>
        <div class="tile-value">${formatCurrency(totalGuaranteed)}/yr</div>
        <div class="tile-sub guaranteed-detail">
          ${lines.map(l => `<span>${l}</span>`).join('')}
        </div>
      </div>
    `;
  }

  // ── Bridge summary card ────────────────────────────────────────────────
  let bridgeCard = '';
  if (hasBridge) {
    const bridgeFunds = [
      config.cash.enabled && bridgeFundedByCash > 0 ? `Cash ${formatCurrency(bridgeFundedByCash)}` : '',
      config.premiumBonds.enabled && bridgeFundedByPb > 0 ? `Bonds ${formatCurrency(bridgeFundedByPb)}` : '',
      config.isa.enabled && bridgeFundedByIsa > 0 ? `ISA ${formatCurrency(bridgeFundedByIsa)}` : '',
      config.sipp.enabled && bridgeFundedBySipp > 0 ? `SIPP ${formatCurrency(bridgeFundedBySipp)}` : '',
    ].filter(Boolean).join(', ') || 'portfolio';

    bridgeCard = `
      <div class="snapshot-tile tile-bridge">
        <div class="tile-label">Bridge Period (age ${bridgeStartAge}–${bridgeEndAge})</div>
        <div class="tile-value">${formatCurrency(bridgeTotalSpending)}</div>
        <div class="tile-sub">Portfolio spending before guaranteed income starts. Funded by: ${bridgeFunds}</div>
      </div>
    `;
  }

  // ── Phase timeline bar ─────────────────────────────────────────────────
  const timelineBar = renderTimelineBar(rows, config);

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
      ${guaranteedIncomeCard}
      ${bridgeCard}
      <div class="snapshot-tile ${healthClass}">
        <div class="tile-label">Plan Success <span class="model-badge">Deterministic</span></div>
        <div class="tile-value">${probabilityOfSuccess}%</div>
        <div class="tile-sub">${
          probabilityOfSuccess === 100
            ? `Fully funded to age ${config.endAge} — no shortfall in any year`
            : firstShortfallAge !== null
              ? `First shortfall at age ${firstShortfallAge} (${fullyFundedYears}/${totalRetirementYears} years funded)`
              : 'Spending exceeds income'
        }</div>
      </div>
      <div class="snapshot-tile ${worstYearBalance <= 0 ? 'tile-negative' : ''}">
        <div class="tile-label">Worst-Year Balance ${modeTag}</div>
        <div class="tile-value ${worstYearBalance <= 0 ? 'tile-negative' : ''}">${formatCurrency(worstYearBalance)}</div>
        <div class="tile-sub">Minimum net worth between retirement and age ${config.endAge}</div>
      </div>
      <div class="snapshot-tile ${firstShortfallAge !== null ? 'tile-negative' : ''}">
        <div class="tile-label">First Shortfall</div>
        <div class="tile-value">${firstShortfallAge !== null ? `Age ${firstShortfallAge}` : '—'}</div>
        <div class="tile-sub">${firstShortfallAge !== null ? `First year spending cannot be fully covered at year-end` : 'No shortfall projected'}</div>
      </div>
      <div class="snapshot-tile">
        <div class="tile-label">Final Net Worth (Age ${config.endAge}) ${modeTag}</div>
        <div class="tile-value ${finalNetWorth > 0 ? '' : 'tile-negative'}">${formatCurrency(finalNetWorth)}</div>
        <div class="tile-sub">${finalRow.year}</div>
      </div>
    </div>
    ${allocBars ? `<div class="alloc-section">${allocBars}</div>` : ''}
    ${timelineBar}
  `;
}

/**
 * Render a thin phase-timeline bar showing when each phase begins and when
 * guaranteed income streams start.
 *
 * @param {object[]} rows
 * @param {object}   config
 * @returns {string} HTML string
 */
function renderTimelineBar(rows, config) {
  if (!rows || rows.length === 0) return '';

  const totalYears = rows.length;
  const accumYears  = rows.filter(r => r.phase === 'accumulate').length;
  const bridgeYears = rows.filter(r => r.phase === 'bridge').length;
  const retireYears = rows.filter(r => r.phase === 'retire').length;

  const accumPct  = ((accumYears  / totalYears) * 100).toFixed(1);
  const bridgePct = ((bridgeYears / totalYears) * 100).toFixed(1);
  const retirePct = ((retireYears / totalYears) * 100).toFixed(1);

  const segments = [];
  if (accumYears > 0) {
    segments.push(`<div class="timeline-seg timeline-accum" style="width:${accumPct}%" title="Accumulation: age ${config.currentAge}–${config.retirementAge - 1} (${accumYears} yrs)">
      <span class="timeline-label">Accumulation</span>
    </div>`);
  }
  if (bridgeYears > 0) {
    const bridgeStartAge = rows.find(r => r.phase === 'bridge')?.age ?? config.retirementAge;
    const bridgeEndAge   = bridgeStartAge + bridgeYears;
    segments.push(`<div class="timeline-seg timeline-bridge" style="width:${bridgePct}%" title="Bridge: age ${bridgeStartAge}–${bridgeEndAge - 1} (${bridgeYears} yrs)">
      <span class="timeline-label">Bridge</span>
    </div>`);
  }
  if (retireYears > 0) {
    const retireStartAge = rows.find(r => r.phase === 'retire')?.age ?? config.retirementAge;
    segments.push(`<div class="timeline-seg timeline-retire" style="width:${retirePct}%" title="Retirement: age ${retireStartAge}+ (${retireYears} yrs)">
      <span class="timeline-label">Retirement</span>
    </div>`);
  }

  // Income start markers
  const markers = [];
  if (config.dbPension.enabled) {
    const dbPct = (((config.dbPension.startAge - config.currentAge) / totalYears) * 100).toFixed(1);
    if (parseFloat(dbPct) >= 0 && parseFloat(dbPct) <= 100) {
      markers.push(`<div class="timeline-marker timeline-marker-db" style="left:${dbPct}%" title="DB pension starts age ${config.dbPension.startAge}">
        <span class="timeline-marker-label">DB ${config.dbPension.startAge}</span>
      </div>`);
    }
  }
  if (config.statePension.enabled) {
    const spPct = (((config.statePensionAge - config.currentAge) / totalYears) * 100).toFixed(1);
    if (parseFloat(spPct) >= 0 && parseFloat(spPct) <= 100) {
      markers.push(`<div class="timeline-marker timeline-marker-sp" style="left:${spPct}%" title="State pension starts age ${config.statePensionAge}">
        <span class="timeline-marker-label">SP ${config.statePensionAge}</span>
      </div>`);
    }
  }

  return `
    <div class="phase-timeline" aria-label="Plan phase timeline">
      <div class="timeline-track">
        ${segments.join('')}
        ${markers.join('')}
      </div>
    </div>
  `;
}

