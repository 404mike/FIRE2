/**
 * tableView.js — Renders the yearly projection table with editable overrides
 */

import { formatCurrency } from './helpers.js';
import { setOverride } from '../state/store.js';
import { openAccountOverrideModal, ACCOUNT_DEFS } from './accountOverrideModal.js';

/**
 * Render the year-by-year projection table.
 *
 * @param {HTMLElement} container
 * @param {object[]}    rows
 * @param {object}      config    App state
 */
export function renderTableView(container, rows, config) {
  if (!rows || rows.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No data.</p></div>';
    return;
  }

  const retirementYear = new Date().getFullYear() + (config.retirementAge - config.currentAge);
  const dbStartYear    = config.dbPension.enabled
    ? new Date().getFullYear() + (config.dbPension.startAge - config.currentAge)
    : -1;
  const spStartYear    = config.statePension.enabled
    ? new Date().getFullYear() + (config.statePensionAge - config.currentAge)
    : -1;

  const ov = config.overrides || {};

  // Build account override buttons toolbar
  const accountButtons = ACCOUNT_DEFS.map(a => {
    const hasOverrides = Object.values(ov).some(yr =>
      (yr[a.lumpSumField]  && yr[a.lumpSumField]  !== 0) ||
      (yr[a.drawdownField] && yr[a.drawdownField] !== 0) ||
      (a.contributionField && yr[a.contributionField] != null) ||
      (a.drawdownRateField && yr[a.drawdownRateField] != null && yr[a.drawdownRateField] !== 0)
    );
    return `
      <button class="btn btn-sm btn-secondary acct-override-btn ${hasOverrides ? 'has-overrides' : ''}"
              data-account="${a.key}"
              title="Edit lump sum &amp; extra drawdown overrides for ${a.label}">
        ${a.icon} ${a.label}${hasOverrides ? ' <span class="override-dot" title="Has overrides">●</span>' : ''}
      </button>
    `;
  }).join('');

  const thead = `
    <thead>
      <tr class="thead-group">
        <th colspan="2"></th>
        <th colspan="5" class="group-header">Balances</th>
        <th colspan="2" class="group-header">Pension Income</th>
        <th colspan="4" class="group-header">Drawdown per Account</th>
        <th colspan="2" class="group-header">Totals</th>
        <th class="group-header">Shortfall</th>
        <th class="group-header group-override">Note</th>
      </tr>
      <tr>
        <th>Year / Age</th>
        <th>Phase</th>
        <th>ISA £</th>
        <th>SIPP £</th>
        <th>Bonds £</th>
        <th>Cash £</th>
        <th>Net Worth £</th>
        <th>DB Income £</th>
        <th>SP Income £</th>
        <th>ISA Drawn £</th>
        <th>SIPP Drawn £</th>
        <th>Bonds Drawn £</th>
        <th>Cash Drawn £</th>
        <th>Total Withdrawn £</th>
        <th>Total Income £</th>
        <th>Shortfall £</th>
        <th>Note</th>
      </tr>
    </thead>
  `;

  const tbodyRows = rows.map(row => {
    const isRetireStart = row.year === retirementYear;
    const isDbStart     = row.year === dbStartYear;
    const isSpStart     = row.year === spStartYear;
    let rowClass = '';
    if (isRetireStart) rowClass = 'retirement-start';
    else if (isDbStart || isSpStart) rowClass = 'pension-start';

    const phase = row.phase === 'retire'
      ? '<span class="badge badge-retire">Retire</span>'
      : '<span class="badge badge-accumulate">Accum.</span>';

    const override = ov[row.year] || {};

    // Show a dot indicator if any account overrides exist for this year
    const yearHasOverride = ACCOUNT_DEFS.some(a =>
      (override[a.lumpSumField]  && override[a.lumpSumField]  !== 0) ||
      (override[a.drawdownField] && override[a.drawdownField] !== 0) ||
      (a.contributionField && override[a.contributionField] != null) ||
      (a.drawdownRateField && override[a.drawdownRateField] != null && override[a.drawdownRateField] !== 0)
    );
    const overrideIndicator = yearHasOverride
      ? '<span class="row-override-dot" title="Has account overrides this year">●</span>'
      : '';

    return `
      <tr class="${rowClass}" data-year="${row.year}">
        <td>${row.year} / ${row.age} ${overrideIndicator}</td>
        <td>${phase}</td>
        <td>${formatCurrency(row.isaBalance)}</td>
        <td>${formatCurrency(row.sippBalance)}</td>
        <td>${formatCurrency(row.premiumBondsBalance)}</td>
        <td>${formatCurrency(row.cashBalance)}</td>
        <td><strong>${formatCurrency(row.totalNetWorth)}</strong></td>
        <td class="${row.dbIncome > 0 ? 'num-positive' : 'num-zero'}">${row.dbIncome > 0 ? formatCurrency(row.dbIncome) : '—'}</td>
        <td class="${row.stateIncome > 0 ? 'num-positive' : 'num-zero'}">${row.stateIncome > 0 ? formatCurrency(row.stateIncome) : '—'}</td>
        <td class="${row.isaWithdrawn > 0 ? 'num-negative' : 'num-zero'}">${row.isaWithdrawn > 0 ? formatCurrency(row.isaWithdrawn) : '—'}</td>
        <td class="${row.sippWithdrawn > 0 ? 'num-negative' : 'num-zero'}">${row.sippWithdrawn > 0 ? formatCurrency(row.sippWithdrawn) : '—'}</td>
        <td class="${row.premiumBondsWithdrawn > 0 ? 'num-negative' : 'num-zero'}">${row.premiumBondsWithdrawn > 0 ? formatCurrency(row.premiumBondsWithdrawn) : '—'}</td>
        <td class="${row.cashWithdrawn > 0 ? 'num-negative' : 'num-zero'}">${row.cashWithdrawn > 0 ? formatCurrency(row.cashWithdrawn) : '—'}</td>
        <td class="${row.totalWithdrawn > 0 ? 'num-negative' : 'num-zero'}">${row.totalWithdrawn > 0 ? formatCurrency(row.totalWithdrawn) : '—'}</td>
        <td class="${row.totalIncome > 0 ? 'num-positive' : 'num-zero'}">${row.totalIncome > 0 ? formatCurrency(row.totalIncome) : '—'}</td>
        <td class="${row.shortfall > 0 ? 'num-negative' : 'num-zero'}">${row.shortfall > 0 ? formatCurrency(row.shortfall) : '—'}</td>
        <td><input class="note-input" type="text" data-year="${row.year}" data-field="note" value="${override.note || ''}" placeholder="Note…" /></td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="table-toolbar">
      <span class="table-toolbar-label">Account Overrides:</span>
      ${accountButtons}
    </div>
    <div class="table-scroll">
      <table class="year-table">
        ${thead}
        <tbody>${tbodyRows}</tbody>
      </table>
    </div>
  `;

  // Account override buttons → open modal
  container.querySelectorAll('.acct-override-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openAccountOverrideModal(btn.dataset.account, rows, config);
    });
  });

  // Note input listeners
  container.querySelectorAll('.note-input').forEach(input => {
    input.addEventListener('change', () => {
      const year  = parseInt(input.dataset.year, 10);
      const field = input.dataset.field;
      setOverride(year, { [field]: input.value });
    });
  });
}
