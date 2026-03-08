/**
 * tableView.js — Renders the yearly projection table with editable overrides
 */

import { formatCurrency, toDisplayValue } from './helpers.js';
import { setOverride } from '../state/store.js';
import { ACCOUNT_DEFS } from './accountOverrideModal.js';

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

  const displayMode = config.displayMode || 'real';
  const isReal = displayMode === 'real';
  const unitLabel = isReal ? "Today's £" : 'Nominal £';

  const retirementYear = new Date().getFullYear() + (config.retirementAge - config.currentAge);
  const dbStartYear    = config.dbPension.enabled
    ? new Date().getFullYear() + (config.dbPension.startAge - config.currentAge)
    : -1;
  const spStartYear    = config.statePension.enabled
    ? new Date().getFullYear() + (config.statePensionAge - config.currentAge)
    : -1;

  const ov = config.overrides || {};

  // Helper: get display value for a field in a row
  const d = (row, field) => toDisplayValue(row, field, displayMode);

  const thead = `
    <thead>
      <tr class="thead-group">
        <th colspan="2"></th>
        <th colspan="5" class="group-header">Balances (${unitLabel})</th>
        <th colspan="2" class="group-header">Pension Income</th>
        <th colspan="4" class="group-header">Drawdown per Account</th>
        <th colspan="2" class="group-header">Totals</th>
        <th class="group-header">Excess</th>
        <th class="group-header">Shortfall</th>
        <th class="group-header group-override">Note</th>
      </tr>
      <tr>
        <th>Year / Age</th>
        <th>Phase</th>
        <th>ISA</th>
        <th>SIPP</th>
        <th>Bonds</th>
        <th>Cash</th>
        <th>Net Worth</th>
        <th>DB Income</th>
        <th>SP Income</th>
        <th>ISA Drawn</th>
        <th>SIPP Drawn</th>
        <th>Bonds Drawn</th>
        <th>Cash Drawn</th>
        <th>Total Withdrawn</th>
        <th>Total Income</th>
        <th>Excess Income</th>
        <th>Shortfall</th>
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

    const dbIncome    = d(row, 'dbIncome');
    const stateIncome = d(row, 'stateIncome');
    const isaW        = d(row, 'isaWithdrawn');
    const sippW       = d(row, 'sippWithdrawn');
    const pbW         = d(row, 'premiumBondsWithdrawn');
    const cashW       = d(row, 'cashWithdrawn');
    const totalW      = d(row, 'totalWithdrawn');
    const totalInc    = d(row, 'totalIncome');
    const shortfall   = d(row, 'shortfall');
    // excessIncome is not inflation-sensitive (it's the nominal excess flag)
    const excess      = row.excessIncome;

    return `
      <tr class="${rowClass}" data-year="${row.year}">
        <td>${row.year} / ${row.age} ${overrideIndicator}</td>
        <td>${phase}</td>
        <td>${formatCurrency(d(row, 'isaBalance'))}</td>
        <td>${formatCurrency(d(row, 'sippBalance'))}</td>
        <td>${formatCurrency(d(row, 'premiumBondsBalance'))}</td>
        <td>${formatCurrency(d(row, 'cashBalance'))}</td>
        <td><strong>${formatCurrency(d(row, 'totalNetWorth'))}</strong></td>
        <td class="${dbIncome > 0 ? 'num-positive' : 'num-zero'}">${dbIncome > 0 ? formatCurrency(dbIncome) : '—'}</td>
        <td class="${stateIncome > 0 ? 'num-positive' : 'num-zero'}">${stateIncome > 0 ? formatCurrency(stateIncome) : '—'}</td>
        <td class="${isaW > 0 ? 'num-negative' : 'num-zero'}">${isaW > 0 ? formatCurrency(isaW) : '—'}</td>
        <td class="${sippW > 0 ? 'num-negative' : 'num-zero'}">${sippW > 0 ? formatCurrency(sippW) : '—'}</td>
        <td class="${pbW > 0 ? 'num-negative' : 'num-zero'}">${pbW > 0 ? formatCurrency(pbW) : '—'}</td>
        <td class="${cashW > 0 ? 'num-negative' : 'num-zero'}">${cashW > 0 ? formatCurrency(cashW) : '—'}</td>
        <td class="${totalW > 0 ? 'num-negative' : 'num-zero'}">${totalW > 0 ? formatCurrency(totalW) : '—'}</td>
        <td class="${totalInc > 0 ? 'num-positive' : 'num-zero'}">${totalInc > 0 ? formatCurrency(totalInc) : '—'}</td>
        <td class="${excess > 0 ? 'num-warning' : 'num-zero'}">${excess > 0 ? formatCurrency(excess) : '—'}</td>
        <td class="${shortfall > 0 ? 'num-negative' : 'num-zero'}">${shortfall > 0 ? formatCurrency(shortfall) : '—'}</td>
        <td><input class="note-input" type="text" data-year="${row.year}" data-field="note" value="${override.note || ''}" placeholder="Note…" /></td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="table-scroll">
      <table class="year-table">
        ${thead}
        <tbody>${tbodyRows}</tbody>
      </table>
    </div>
  `;

  // Note input listeners
  container.querySelectorAll('.note-input').forEach(input => {
    input.addEventListener('change', () => {
      const year  = parseInt(input.dataset.year, 10);
      const field = input.dataset.field;
      setOverride(year, { [field]: input.value });
    });
  });
}
