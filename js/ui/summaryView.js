/**
 * summaryView.js — Renders key headline metrics above the chart
 */

import { formatCurrency, formatAge } from './helpers.js';

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

  // Peak net worth
  const peak = rows.reduce((max, r) => r.totalNetWorth > max.totalNetWorth ? r : max, rows[0]);

  // Net worth at retirement
  const retirementRow = rows.find(r => r.age === config.retirementAge) || rows[0];

  // Final row
  const finalRow = rows[rows.length - 1];

  // Sustainability: does portfolio survive to end age?
  const exhausted = rows.find(r => r.totalNetWorth <= 0 && r.age > config.retirementAge);
  const isSustainable = !exhausted;

  // Years of shortfall
  const shortfallYears = rows.filter(r => r.shortfall > 0).length;

  // Total pension income projected
  const totalPensionIncome = rows
    .filter(r => r.phase === 'retire')
    .reduce((sum, r) => sum + r.totalPensionIncome, 0);

  const sustainClass = isSustainable ? 'tile-positive' : 'tile-negative';
  const sustainLabel = isSustainable
    ? `Portfolio lasts to age ${config.endAge}`
    : `Exhausted at age ${exhausted.age}`;

  container.innerHTML = `
    <div class="summary-grid">
      <div class="summary-tile">
        <div class="tile-label">Net Worth at Retirement</div>
        <div class="tile-value">${formatCurrency(retirementRow.totalNetWorth)}</div>
        <div class="tile-sub">At age ${config.retirementAge}</div>
      </div>
      <div class="summary-tile">
        <div class="tile-label">Peak Net Worth</div>
        <div class="tile-value">${formatCurrency(peak.totalNetWorth)}</div>
        <div class="tile-sub">Age ${peak.age} (${peak.year})</div>
      </div>
      <div class="summary-tile ${sustainClass}">
        <div class="tile-label">Portfolio Sustainability</div>
        <div class="tile-value">${isSustainable ? '✓ Sustainable' : '✗ Shortfall'}</div>
        <div class="tile-sub">${sustainLabel}</div>
      </div>
      <div class="summary-tile">
        <div class="tile-label">Final Net Worth (Age ${config.endAge})</div>
        <div class="tile-value ${finalRow.totalNetWorth > 0 ? '' : 'tile-negative'}">${formatCurrency(finalRow.totalNetWorth)}</div>
        <div class="tile-sub">${finalRow.year}</div>
      </div>
      <div class="summary-tile">
        <div class="tile-label">Total Pension Income</div>
        <div class="tile-value">${formatCurrency(totalPensionIncome)}</div>
        <div class="tile-sub">Across retirement</div>
      </div>
      <div class="summary-tile ${shortfallYears > 0 ? 'tile-negative' : 'tile-positive'}">
        <div class="tile-label">Years with Spending Shortfall</div>
        <div class="tile-value">${shortfallYears}</div>
        <div class="tile-sub">${shortfallYears === 0 ? 'Fully funded' : `${shortfallYears} year${shortfallYears > 1 ? 's' : ''} underfunded`}</div>
      </div>
    </div>
  `;
}
