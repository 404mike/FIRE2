/**
 * incomeChartView.js — Stacked bar chart: income sources vs required spending
 *
 * Shows per-year (retirement only) breakdown of income:
 *   ISA drawdown | SIPP drawdown | PB drawdown | Cash drawdown | DB pension | State pension
 * Overlaid with a line for required spending.
 * When config.displayMode === 'real', all values are in today's purchasing power.
 */

import { toDisplayValue } from './helpers.js';

let _incomeChart = null;

// Consistent colour palette (matches chartView + summaryView)
const COLOURS = {
  isa:          'rgba(37,99,235,0.8)',    // blue
  sipp:         'rgba(217,119,6,0.8)',   // amber
  premiumBonds: 'rgba(147,51,234,0.8)',  // purple
  cash:         'rgba(100,116,139,0.8)', // slate
  dbPension:    'rgba(22,163,74,0.8)',   // green
  statePension: 'rgba(20,184,166,0.8)',  // teal
  spending:     '#dc2626',               // red line
};

/**
 * Render or update the income vs spending chart.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object[]}          rows    Projection rows (all years)
 * @param {object}            config  App state
 */
export function renderIncomeChart(canvas, rows, config) {
  if (typeof Chart === 'undefined' || !canvas || !rows || rows.length === 0) return;

  // Only show retirement years (phase === 'retire')
  const retRows = rows.filter(r => r.phase === 'retire');
  if (retRows.length === 0) return;

  const displayMode = config.displayMode || 'real';
  const isReal = displayMode === 'real';

  const labels = retRows.map(r => r.year);
  const ageMap = Object.fromEntries(retRows.map(r => [r.year, r.age]));

  const datasets = [
    {
      label: 'ISA',
      data: retRows.map(r => Math.round(toDisplayValue(r, 'isaWithdrawn', displayMode) || 0)),
      backgroundColor: COLOURS.isa,
      stack: 'income',
      order: 2,
    },
    {
      label: 'SIPP',
      data: retRows.map(r => Math.round(toDisplayValue(r, 'sippWithdrawn', displayMode) || 0)),
      backgroundColor: COLOURS.sipp,
      stack: 'income',
      order: 2,
    },
    {
      label: 'Premium Bonds',
      data: retRows.map(r => Math.round(toDisplayValue(r, 'premiumBondsWithdrawn', displayMode) || 0)),
      backgroundColor: COLOURS.premiumBonds,
      stack: 'income',
      order: 2,
    },
    {
      label: 'Cash',
      data: retRows.map(r => Math.round(toDisplayValue(r, 'cashWithdrawn', displayMode) || 0)),
      backgroundColor: COLOURS.cash,
      stack: 'income',
      order: 2,
    },
    {
      label: 'DB Pension',
      data: retRows.map(r => Math.round(toDisplayValue(r, 'dbIncome', displayMode) || 0)),
      backgroundColor: COLOURS.dbPension,
      stack: 'income',
      order: 2,
    },
    {
      label: 'State Pension',
      data: retRows.map(r => Math.round(toDisplayValue(r, 'stateIncome', displayMode) || 0)),
      backgroundColor: COLOURS.statePension,
      stack: 'income',
      order: 2,
    },
    // Required spending line
    {
      label: 'Required Spending',
      type: 'line',
      data: retRows.map(r => Math.round(toDisplayValue(r, 'requiredSpending', displayMode) || 0)),
      borderColor: COLOURS.spending,
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [5, 3],
      pointRadius: 0,
      tension: 0.2,
      stack: undefined,
      order: 1,
    },
  ].filter(ds => ds.data.some(v => v > 0));

  const chartConfig = {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title(items) {
              const year = labels[items[0].dataIndex];
              const age  = ageMap[year];
              return age !== undefined ? `${year} (age ${age})` : `${year}`;
            },
            label(ctx) {
              const val = ctx.parsed.y;
              if (val === 0) return null;
              const abs = Math.abs(Math.round(val));
              const str = abs.toLocaleString('en-GB');
              return ` ${ctx.dataset.label}: ${val < 0 ? '-' : ''}£${str}`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: {
            maxTicksLimit: 12,
            font: { size: 10 },
            color: '#6b7280',
            callback(val) {
              const year = labels[val];
              const age  = ageMap[year];
              return age !== undefined ? [String(year), `(age ${age})`] : String(year);
            },
          },
          grid: { color: '#f0f2f5' },
        },
        y: {
          stacked: true,
          title: {
            display: true,
            text: isReal ? "Today's £ (real terms)" : 'Nominal £',
            font: { size: 10 },
            color: '#6b7280',
          },
          ticks: {
            font: { size: 10 },
            color: '#6b7280',
            callback(val) {
              if (val >= 1_000_000) return `£${(val / 1_000_000).toFixed(1)}m`;
              if (val >= 1_000)     return `£${(val / 1_000).toFixed(0)}k`;
              return `£${val}`;
            },
          },
          grid: { color: '#f0f2f5' },
        },
      },
    },
  };

  if (_incomeChart) {
    _incomeChart.data    = chartConfig.data;
    _incomeChart.options = chartConfig.options;
    _incomeChart.update('none');
  } else {
    // eslint-disable-next-line no-undef
    _incomeChart = new Chart(canvas, chartConfig);
  }
}

/**
 * Render the income chart legend into `el`.
 * @param {HTMLElement} el
 */
export function renderIncomeLegend(el) {
  if (!el) return;
  const items = [
    { label: 'ISA Drawdown',       color: COLOURS.isa },
    { label: 'SIPP Drawdown',      color: COLOURS.sipp },
    { label: 'Premium Bonds',      color: COLOURS.premiumBonds },
    { label: 'Cash',               color: COLOURS.cash },
    { label: 'DB Pension',         color: COLOURS.dbPension },
    { label: 'State Pension',      color: COLOURS.statePension },
    { label: 'Required Spending',  color: COLOURS.spending, dashed: true },
  ];
  el.innerHTML = items.map(item => `
    <div class="legend-item" style="cursor:default">
      <div class="legend-dot${item.dashed ? ' legend-dot-dashed' : ''}" style="background:${item.color}"></div>
      <span>${item.label}</span>
    </div>
  `).join('');
}

/**
 * Destroy the income chart instance.
 */
export function destroyIncomeChart() {
  if (_incomeChart) {
    _incomeChart.destroy();
    _incomeChart = null;
  }
}
