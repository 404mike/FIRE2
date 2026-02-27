/**
 * tableView.js — Renders the yearly projection table with editable overrides
 */

import { formatCurrency } from './helpers.js';
import { setOverride } from '../state/store.js';

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

  const thead = `
    <thead>
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
        <th>Withdrawn £</th>
        <th>Shortfall £</th>
        <th>ISA Lump</th>
        <th>SIPP Lump</th>
        <th>Bonds Lump</th>
        <th>Cash Lump</th>
        <th>ISA Draw</th>
        <th>SIPP Draw</th>
        <th>Bonds Draw</th>
        <th>Cash Draw</th>
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

    return `
      <tr class="${rowClass}" data-year="${row.year}">
        <td>${row.year} / ${row.age}</td>
        <td>${phase}</td>
        <td>${formatCurrency(row.isaBalance)}</td>
        <td>${formatCurrency(row.sippBalance)}</td>
        <td>${formatCurrency(row.premiumBondsBalance)}</td>
        <td>${formatCurrency(row.cashBalance)}</td>
        <td><strong>${formatCurrency(row.totalNetWorth)}</strong></td>
        <td class="${row.dbIncome > 0 ? 'num-positive' : 'num-zero'}">${row.dbIncome > 0 ? formatCurrency(row.dbIncome) : '—'}</td>
        <td class="${row.stateIncome > 0 ? 'num-positive' : 'num-zero'}">${row.stateIncome > 0 ? formatCurrency(row.stateIncome) : '—'}</td>
        <td class="${row.totalWithdrawn > 0 ? 'num-negative' : 'num-zero'}">${row.totalWithdrawn > 0 ? formatCurrency(row.totalWithdrawn) : '—'}</td>
        <td class="${row.shortfall > 0 ? 'num-negative' : 'num-zero'}">${row.shortfall > 0 ? formatCurrency(row.shortfall) : '—'}</td>
        <td><input class="override-input" type="number" data-year="${row.year}" data-field="isaLumpSum" value="${override.isaLumpSum || ''}" placeholder="0" /></td>
        <td><input class="override-input" type="number" data-year="${row.year}" data-field="sippLumpSum" value="${override.sippLumpSum || ''}" placeholder="0" /></td>
        <td><input class="override-input" type="number" data-year="${row.year}" data-field="premiumBondLumpSum" value="${override.premiumBondLumpSum || ''}" placeholder="0" /></td>
        <td><input class="override-input" type="number" data-year="${row.year}" data-field="cashLumpSum" value="${override.cashLumpSum || ''}" placeholder="0" /></td>
        <td><input class="override-input" type="number" data-year="${row.year}" data-field="isaCustomDrawdown" value="${override.isaCustomDrawdown || ''}" placeholder="0" /></td>
        <td><input class="override-input" type="number" data-year="${row.year}" data-field="sippCustomDrawdown" value="${override.sippCustomDrawdown || ''}" placeholder="0" /></td>
        <td><input class="override-input" type="number" data-year="${row.year}" data-field="premiumBondsCustomDrawdown" value="${override.premiumBondsCustomDrawdown || ''}" placeholder="0" /></td>
        <td><input class="override-input" type="number" data-year="${row.year}" data-field="cashCustomDrawdown" value="${override.cashCustomDrawdown || ''}" placeholder="0" /></td>
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

  // Attach override input listeners
  container.querySelectorAll('.override-input, .note-input').forEach(input => {
    input.addEventListener('change', () => {
      const year  = parseInt(input.dataset.year, 10);
      const field = input.dataset.field;
      const value = input.type === 'number'
        ? (input.value === '' ? 0 : parseFloat(input.value))
        : input.value;
      setOverride(year, { [field]: value });
    });
  });
}
