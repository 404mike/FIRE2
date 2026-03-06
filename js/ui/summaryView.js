/**
 * summaryView.js — Renders key headline metrics above the chart
 */

import { formatCurrency } from './helpers.js';

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

  // Net worth at retirement
  const retirementRow = rows.find(r => r.age === config.retirementAge) || rows[0];

  // Final row
  const finalRow = rows[rows.length - 1];

  // Sustainability: does portfolio survive to end age?
  const exhausted = rows.find(r => r.totalNetWorth <= 0 && r.age > config.retirementAge);
  const isSustainable = !exhausted;

  // Years of shortfall
  const shortfallYears = rows.filter(r => r.shortfall > 0).length;

  // FI Age: first retirement year where no spending shortfall exists
  const retirementRows = rows.filter(r => r.phase === 'retire');
  const fiRow = retirementRows.find(r => r.shortfall === 0);
  const fiAge = fiRow ? fiRow.age : null;

  // Monthly retirement income estimate
  const monthlyIncome = config.retirementSpending / 12;

  // Asset allocation at retirement (or current age if already retired)
  const allocRow = retirementRow;
  const totalAlloc = (allocRow.isaBalance || 0) + (allocRow.sippBalance || 0) +
                     (allocRow.premiumBondsBalance || 0) + (allocRow.cashBalance || 0);

  // Portfolio Health indicator
  let healthEmoji, healthLabel, healthClass;
  if (isSustainable && shortfallYears === 0) {
    healthEmoji = '🟢'; healthLabel = 'Healthy'; healthClass = 'tile-positive';
  } else if (isSustainable && shortfallYears <= 3) {
    healthEmoji = '🟡'; healthLabel = 'Marginal'; healthClass = 'tile-warning';
  } else {
    healthEmoji = '🔴'; healthLabel = 'At Risk'; healthClass = 'tile-negative';
  }

  // Safe spending estimate from 4% rule at retirement
  const safeSpending4pct = retirementRow.totalNetWorth * 0.04;

  // Allocation bars (only show enabled accounts)
  const allocItems = [
    { label: 'ISA',     value: allocRow.isaBalance,           color: '#2563eb', enabled: config.isa.enabled },
    { label: 'SIPP',    value: allocRow.sippBalance,          color: '#d97706', enabled: config.sipp.enabled },
    { label: 'Bonds',   value: allocRow.premiumBondsBalance,  color: '#9333ea', enabled: config.premiumBonds.enabled },
    { label: 'Cash',    value: allocRow.cashBalance,          color: '#64748b', enabled: config.cash.enabled },
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

  container.innerHTML = `
    <div class="snapshot-grid">
      <div class="snapshot-tile snapshot-primary">
        <div class="tile-label">Net Worth at Retirement</div>
        <div class="tile-value">${formatCurrency(retirementRow.totalNetWorth)}</div>
        <div class="tile-sub">At age ${config.retirementAge}</div>
      </div>
      <div class="snapshot-tile">
        <div class="tile-label">FI Age</div>
        <div class="tile-value">${fiAge !== null ? fiAge : '—'}</div>
        <div class="tile-sub">${fiAge !== null ? `Financially independent at ${fiAge}` : 'Spending exceeds income'}</div>
      </div>
      <div class="snapshot-tile">
        <div class="tile-label">Monthly Income</div>
        <div class="tile-value">${formatCurrency(monthlyIncome)}</div>
        <div class="tile-sub">Target retirement spend</div>
      </div>
      <div class="snapshot-tile">
        <div class="tile-label">4% Safe Spending</div>
        <div class="tile-value">${formatCurrency(safeSpending4pct)}</div>
        <div class="tile-sub">Sustainable annual draw</div>
      </div>
      <div class="snapshot-tile ${healthClass}">
        <div class="tile-label">Portfolio Health</div>
        <div class="tile-value">${healthEmoji} ${healthLabel}</div>
        <div class="tile-sub">${isSustainable ? `Lasts to age ${config.endAge}` : `Exhausted at age ${exhausted.age}`}${shortfallYears > 0 ? ` · ${shortfallYears} yr${shortfallYears > 1 ? 's' : ''} short` : ''}</div>
      </div>
      <div class="snapshot-tile">
        <div class="tile-label">Final Net Worth (Age ${config.endAge})</div>
        <div class="tile-value ${finalRow.totalNetWorth > 0 ? '' : 'tile-negative'}">${formatCurrency(finalRow.totalNetWorth)}</div>
        <div class="tile-sub">${finalRow.year}</div>
      </div>
    </div>
    ${allocBars ? `<div class="alloc-section">${allocBars}</div>` : ''}
  `;
}
