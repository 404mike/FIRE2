/**
 * outcomeChartView.js — Inflation-adjusted portfolio outcomes chart (P10/P50/P90)
 *
 * Runs the projection engine with three growth-rate scenarios:
 *   P10 (pessimistic)  — configured growth rates − 3 pp
 *   P50 (typical)      — configured growth rates as-is
 *   P90 (optimistic)   — configured growth rates + 3 pp
 *
 * All values are deflated by the user's inflation rate to show real
 * (today's-money) portfolio values.
 */

import { runProjection } from '../engine/projectionEngine.js';

let _outcomeChart = null;

// Growth-rate scenario adjustments (percentage points)
const P10_ADJ = -3;
const P90_ADJ = +3;

function _applyGrowthAdj(config, adj) {
  return {
    ...config,
    isa:          { ...config.isa,          growthRate: Math.max(0, (config.isa.growthRate || 0) + adj) },
    sipp:         { ...config.sipp,         growthRate: Math.max(0, (config.sipp.growthRate || 0) + adj) },
    premiumBonds: { ...config.premiumBonds, prizeRate:  Math.max(0, (config.premiumBonds.prizeRate || 0) + adj) },
    cash:         { ...config.cash,         growthRate: Math.max(0, (config.cash.growthRate || 0) + adj) },
  };
}

/**
 * Render or update the outcome chart.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object}            config  App state
 */
export function renderOutcomeChart(canvas, config) {
  if (typeof Chart === 'undefined' || !canvas) return;

  const inflationRate = (config.inflationRate ?? 2.5) / 100;

  // Run the three scenarios
  const p50Rows = runProjection(config);
  const p10Rows = runProjection(_applyGrowthAdj(config, P10_ADJ));
  const p90Rows = runProjection(_applyGrowthAdj(config, P90_ADJ));

  const labels = p50Rows.map(r => r.year);
  const ageMap  = Object.fromEntries(p50Rows.map(r => [r.year, r.age]));

  // Deflate portfolio values to today's purchasing power
  const deflate = (value, i) => value / Math.pow(1 + inflationRate, i);

  const p50Data = p50Rows.map((r, i) => Math.round(deflate(r.totalNetWorth, i)));
  const p10Data = p10Rows.map((r, i) => Math.round(deflate(r.totalNetWorth, i)));
  const p90Data = p90Rows.map((r, i) => Math.round(deflate(r.totalNetWorth, i)));

  const retirementYear = new Date().getFullYear() + (config.retirementAge - config.currentAge);

  const datasets = [
    // P10 lower bound (no fill)
    {
      label: 'P10 — Pessimistic',
      data: p10Data,
      borderColor: 'rgba(37,99,235,0.4)',
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderDash: [4, 3],
      pointRadius: 0,
      tension: 0.3,
      fill: false,
    },
    // P90 upper bound (fills down to dataset 0 = P10)
    {
      label: 'P90 — Optimistic',
      data: p90Data,
      borderColor: 'rgba(37,99,235,0.4)',
      backgroundColor: 'rgba(37,99,235,0.12)',
      borderWidth: 1,
      borderDash: [4, 3],
      pointRadius: 0,
      tension: 0.3,
      fill: { target: 0, above: 'rgba(37,99,235,0.12)', below: 'transparent' },
    },
    // P50 centre line
    {
      label: 'P50 — Typical',
      data: p50Data,
      borderColor: '#2563eb',
      backgroundColor: 'transparent',
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0.3,
      fill: false,
    },
  ];

  // Inline annotation plugin (retirement year vertical line)
  const annotationPlugin = {
    id: 'fire2OutcomeAnnotations',
    afterDraw(chart) {
      const ctx   = chart.ctx;
      const xAxis = chart.scales.x;
      const yAxis = chart.scales.y;
      if (!xAxis || !yAxis) return;

      const idx = labels.indexOf(retirementYear);
      if (idx === -1) return;
      const x = xAxis.getPixelForValue(idx);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, yAxis.top);
      ctx.lineTo(x, yAxis.bottom);
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#d97706';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🏖 Retire', x, yAxis.top - 4);
      ctx.restore();
    },
  };

  const chartConfig = {
    type: 'line',
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
              const abs = Math.abs(Math.round(val));
              const str = abs.toLocaleString('en-GB');
              return ` ${ctx.dataset.label}: ${val < 0 ? '-' : ''}£${str}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            maxTicksLimit: 10,
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
    plugins: [annotationPlugin],
  };

  if (_outcomeChart) {
    _outcomeChart.data    = chartConfig.data;
    _outcomeChart.options = chartConfig.options;
    _outcomeChart.update('none');
  } else {
    // eslint-disable-next-line no-undef
    _outcomeChart = new Chart(canvas, chartConfig);
  }
}

/**
 * Destroy the outcome chart instance.
 */
export function destroyOutcomeChart() {
  if (_outcomeChart) {
    _outcomeChart.destroy();
    _outcomeChart = null;
  }
}
