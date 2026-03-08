/**
 * tableView.js — Renders the yearly projection table with editable overrides
 *
 * Left columns (Year/Age, Phase) are pinned (CSS sticky) so they remain
 * visible during horizontal scroll.  A single "Surplus / Deficit" column
 * replaces the previous separate Surplus and Shortfall columns:
 *   positive = surplus (income > spending)
 *   negative = deficit (spending > income)
 */

import { formatCurrency, toDisplayValue } from './helpers.js';
import { setOverride } from '../state/store.js';
import { ACCOUNT_DEFS } from './accountOverrideModal.js';
import { calcAutoFillDrawdown } from '../engine/autoFillDrawdown.js';

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
        <th colspan="2" class="col-pin"></th>
        <th colspan="5" class="group-header">Balances (${unitLabel})</th>
        <th colspan="2" class="group-header">Contributions / Growth</th>
        <th colspan="3" class="group-header">Guaranteed Income</th>
        <th colspan="2" class="group-header">Spending / Gap</th>
        <th colspan="4" class="group-header">Portfolio Withdrawals</th>
        <th colspan="3" class="group-header">Totals</th>
        <th class="group-header">Surplus / Deficit</th>
        <th class="group-header group-override">Note</th>
        <th class="group-header group-override">Actions</th>
      </tr>
      <tr>
        <th class="col-pin">Year / Age</th>
        <th class="col-pin">Phase</th>
        <th>ISA</th>
        <th>SIPP</th>
        <th>Bonds</th>
        <th>Cash</th>
        <th>Net Worth</th>
        <th>Contributions</th>
        <th>Growth</th>
        <th>DB Income</th>
        <th>SP Income</th>
        <th>Total Guaranteed</th>
        <th title="Annual spending target (inflation-adjusted)">Req. Spending</th>
        <th title="Gap to Portfolio = Required Spending − Guaranteed Income">Gap to Portfolio</th>
        <th>ISA Drawn</th>
        <th>SIPP Drawn</th>
        <th>Bonds Drawn</th>
        <th>Cash Drawn</th>
        <th>Portfolio Drawn</th>
        <th>Total Income</th>
        <th>Excess Income</th>
        <th>Surplus / Deficit</th>
        <th>Note</th>
        <th>Actions</th>
      </tr>
    </thead>
  `;

  const tbodyRows = rows.map(row => {
    const isRetireStart = row.year === retirementYear;
    const isDbStart     = row.year === dbStartYear;
    const isSpStart     = row.year === spStartYear;
    let rowClass = '';
    if (isRetireStart) rowClass = 'retirement-start';
    else if (row.phase === 'bridge') rowClass = 'bridge-phase';
    else if (isDbStart || isSpStart) rowClass = 'pension-start';

    const phaseLabel = {
      accumulate: '<span class="badge badge-accumulate">Accum.</span>',
      bridge:     '<span class="badge badge-bridge">Bridge</span>',
      retire:     '<span class="badge badge-retire">Retire</span>',
    }[row.phase] ?? row.phase;

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

    // Track whether auto-fill drawdown overrides are currently set for this year
    const hasAutoFillOverride = override.isaCustomDrawdown != null || override.sippCustomDrawdown != null;

    const dbIncome        = d(row, 'dbIncome');
    const stateIncome     = d(row, 'stateIncome');
    const totalGuaranteed = d(row, 'totalPensionIncome');
    const reqSpending     = d(row, 'requiredSpending');
    const gapToPortfolio  = Math.max(0, reqSpending - totalGuaranteed);
    const contribs        = d(row, 'totalContributions');
    const growth          = d(row, 'totalGrowth');
    const isaW            = d(row, 'isaWithdrawn');
    const sippW           = d(row, 'sippWithdrawn');
    const pbW             = d(row, 'premiumBondsWithdrawn');
    const cashW           = d(row, 'cashWithdrawn');
    const totalW          = d(row, 'totalWithdrawn');
    const totalInc        = d(row, 'totalIncome');
    const surplusDeficit  = d(row, 'surplusDeficit');
    // excessIncome is not inflation-sensitive (it's the nominal excess flag)
    const excess          = row.excessIncome;

    // Surplus/deficit: positive = surplus (green), negative = deficit (red), 0 = muted
    const sdClass = surplusDeficit > 0 ? 'num-positive' : surplusDeficit < 0 ? 'num-negative' : 'num-zero';
    const sdDisplay = surplusDeficit !== 0 ? formatCurrency(surplusDeficit) : '—';

    return `
      <tr class="${rowClass}" data-year="${row.year}">
        <td class="col-pin">${row.year} / ${row.age} ${overrideIndicator}</td>
        <td class="col-pin">${phaseLabel}</td>
        <td>${formatCurrency(d(row, 'isaBalance'))}</td>
        <td>${formatCurrency(d(row, 'sippBalance'))}</td>
        <td>${formatCurrency(d(row, 'premiumBondsBalance'))}</td>
        <td>${formatCurrency(d(row, 'cashBalance'))}</td>
        <td><strong>${formatCurrency(d(row, 'totalNetWorth'))}</strong></td>
        <td class="col-contributions ${contribs > 0 ? '' : 'num-zero'}">${contribs > 0 ? formatCurrency(contribs) : '—'}</td>
        <td class="col-growth ${growth > 0 ? '' : 'num-zero'}">${growth > 0 ? formatCurrency(growth) : '—'}</td>
        <td class="col-guaranteed ${dbIncome > 0 ? '' : 'num-zero'}">${dbIncome > 0 ? formatCurrency(dbIncome) : '—'}</td>
        <td class="col-guaranteed ${stateIncome > 0 ? '' : 'num-zero'}">${stateIncome > 0 ? formatCurrency(stateIncome) : '—'}</td>
        <td class="col-guaranteed ${totalGuaranteed > 0 ? '' : 'num-zero'}">${totalGuaranteed > 0 ? formatCurrency(totalGuaranteed) : '—'}</td>
        <td class="col-spending ${reqSpending > 0 ? '' : 'num-zero'}">${reqSpending > 0 ? formatCurrency(reqSpending) : '—'}</td>
        <td class="col-gap ${gapToPortfolio > 0 ? '' : 'num-zero'}">${gapToPortfolio > 0 ? formatCurrency(gapToPortfolio) : '—'}</td>
        <td class="col-withdrawal ${isaW > 0 ? '' : 'num-zero'}">${isaW > 0 ? formatCurrency(isaW) : '—'}</td>
        <td class="col-withdrawal ${sippW > 0 ? '' : 'num-zero'}">${sippW > 0 ? formatCurrency(sippW) : '—'}</td>
        <td class="col-withdrawal ${pbW > 0 ? '' : 'num-zero'}">${pbW > 0 ? formatCurrency(pbW) : '—'}</td>
        <td class="col-withdrawal ${cashW > 0 ? '' : 'num-zero'}">${cashW > 0 ? formatCurrency(cashW) : '—'}</td>
        <td class="col-withdrawal ${totalW > 0 ? '' : 'num-zero'}">${totalW > 0 ? formatCurrency(totalW) : '—'}</td>
        <td class="${totalInc > 0 ? 'num-positive' : 'num-zero'}">${totalInc > 0 ? formatCurrency(totalInc) : '—'}</td>
        <td class="${excess > 0 ? 'num-warning' : 'num-zero'}">${excess > 0 ? formatCurrency(excess) : '—'}</td>
        <td class="${sdClass}">${sdDisplay}</td>
        <td><input class="note-input" type="text" data-year="${row.year}" data-field="note" value="${override.note || ''}" placeholder="Note…" /></td>
        <td class="col-actions">
          <button class="btn btn-primary btn-sm autofill-btn" data-year="${row.year}" title="Calculate ISA &amp; SIPP draws to meet required spending">⚡ Auto-fill</button>${hasAutoFillOverride ? `\n          <button class="btn btn-secondary btn-sm clear-autofill-btn" data-year="${row.year}" title="Clear auto-fill drawdown overrides">✕ Clear</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="table-toolbar">
      <button class="btn btn-secondary btn-sm" id="exportCsvBtn">⬇ Export CSV</button>
    </div>
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

  // Auto-fill drawdown button listeners
  container.querySelectorAll('.autofill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const year = parseInt(btn.dataset.year, 10);
      const row  = rows.find(r => r.year === year);
      if (!row) return;
      const { isaExtraDraw, sippExtraDraw } = calcAutoFillDrawdown(row, config);
      setOverride(year, {
        isaCustomDrawdown:  isaExtraDraw  > 0 ? isaExtraDraw  : null,
        sippCustomDrawdown: sippExtraDraw > 0 ? sippExtraDraw : null,
        // Preserve any user-written note; only supply a default when none exists.
        note: config.overrides?.[year]?.note || 'Auto-fill drawdown',
      });
      _showToast('Drawdown auto-filled for this year');
    });
  });

  // Clear auto-fill override button listeners
  container.querySelectorAll('.clear-autofill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const year = parseInt(btn.dataset.year, 10);
      setOverride(year, { isaCustomDrawdown: null, sippCustomDrawdown: null });
      _showToast('Drawdown override cleared');
    });
  });

  // CSV export
  const exportBtn = container.querySelector('#exportCsvBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => exportToCsv(rows, config, displayMode));
  }
}

/**
 * Export projection rows to a CSV file and trigger browser download.
 *
 * The CSV includes:
 *  - An assumptions header block (inflation, display mode, drawdown settings)
 *  - All year-table columns
 *
 * @param {object[]} rows
 * @param {object}   config
 * @param {string}   displayMode  'real' | 'nominal'
 */
function exportToCsv(rows, config, displayMode) {
  const isReal = displayMode === 'real';
  const d = (row, field) => toDisplayValue(row, field, displayMode);

  // Assumptions block
  const assumptions = [
    ['# FIRE2 Projection Export'],
    ['# Generated', new Date().toISOString()],
    ['# Display mode', displayMode],
    ['# Inflation rate (%)', config.inflationRate ?? 2.5],
    ['# Retirement age', config.retirementAge],
    ['# End age', config.endAge],
    ['# Retirement spending (today\'s £)', config.retirementSpending],
    ['# Drawdown rate (%)', config.drawdown?.rate ?? 0],
    ['# Max income ceiling (£)', config.maxIncome ?? 'none'],
    ['# DB pension enabled', config.dbPension.enabled],
    config.dbPension.enabled ? ['# DB pension annual income (£)', config.dbPension.annualIncome] : null,
    config.dbPension.enabled ? ['# DB pension start age', config.dbPension.startAge] : null,
    ['# State pension enabled', config.statePension.enabled],
    config.statePension.enabled ? ['# State pension annual income (£)', config.statePension.annualIncome] : null,
    config.statePension.enabled ? ['# State pension start age', config.statePensionAge] : null,
    config.statePension.enabled ? ['# State pension growth model', config.statePension.growthModel ?? 'real'] : null,
    ['#'],
  ].filter(Boolean).map(row => row.map(v => `"${v}"`).join(',')).join('\n');

  // Column headers
  const unit = isReal ? "today's £" : 'nominal £';
  const headers = [
    'Year', 'Age', 'Phase',
    `ISA Balance (${unit})`, `SIPP Balance (${unit})`, `Bonds Balance (${unit})`, `Cash Balance (${unit})`, `Net Worth (${unit})`,
    `ISA Contributions (${unit})`, `SIPP Contributions (${unit})`, `Bonds Contributions (${unit})`, `Cash Contributions (${unit})`, `Total Contributions (${unit})`,
    `Growth (${unit})`,
    `DB Income (${unit})`, `SP Income (${unit})`, `Total Guaranteed Income (${unit})`,
    `Required Spending (${unit})`, `Gap to Portfolio (${unit})`,
    `ISA Drawn (${unit})`, `SIPP Drawn (${unit})`, `Bonds Drawn (${unit})`, `Cash Drawn (${unit})`, `Portfolio Drawn (${unit})`,
    `Total Income (${unit})`, 'Excess Income (£)',
    `Surplus/Deficit (${unit})`,
    'Note',
  ];

  const dataRows = rows.map(row => {
    const reqSpending    = d(row, 'requiredSpending');
    const totalGuaranteed = d(row, 'totalPensionIncome');
    const gapToPortfolio = Math.max(0, reqSpending - totalGuaranteed);
    return [
      row.year, row.age, row.phase,
      d(row, 'isaBalance'), d(row, 'sippBalance'), d(row, 'premiumBondsBalance'), d(row, 'cashBalance'), d(row, 'totalNetWorth'),
      d(row, 'isaContribution'), d(row, 'sippContribution'), d(row, 'premiumBondsContribution'), d(row, 'cashContribution'), d(row, 'totalContributions'),
      d(row, 'totalGrowth'),
      d(row, 'dbIncome'), d(row, 'stateIncome'), totalGuaranteed,
      reqSpending, gapToPortfolio,
      d(row, 'isaWithdrawn'), d(row, 'sippWithdrawn'), d(row, 'premiumBondsWithdrawn'), d(row, 'cashWithdrawn'), d(row, 'totalWithdrawn'),
      d(row, 'totalIncome'), row.excessIncome,
      d(row, 'surplusDeficit'),
      `"${(row.note || '').replace(/"/g, '""')}"`,
    ].join(',');
  });

  const csv = [assumptions, headers.join(','), ...dataRows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `fire2-projection-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Show a brief toast notification at the bottom of the viewport.
 * Requires a `#toastContainer` element to be present in the HTML.
 * Falls back silently if the element is not found in the DOM.
 * @param {string} message
 * @param {number} [duration=3000]
 */
function _showToast(message, duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}
