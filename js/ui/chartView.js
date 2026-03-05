/**
 * chartView.js — Chart.js integration for projection visualisation
 *
 * Renders a multi-line chart showing:
 * - Total Net Worth
 * - ISA balance
 * - SIPP balance
 * - Premium Bonds balance
 * - Cash balance
 *
 * Vertical annotations mark retirement and pension start years.
 */

let _chart = null;

// Colour palette
const COLOURS = {
  total:        { border: '#2563eb', background: 'rgba(37,99,235,0.08)' },
  isa:          { border: '#16a34a', background: 'rgba(22,163,74,0.08)'  },
  sipp:         { border: '#d97706', background: 'rgba(217,119,6,0.08)'  },
  premiumBonds: { border: '#9333ea', background: 'rgba(147,51,234,0.08)' },
  cash:         { border: '#64748b', background: 'rgba(100,116,139,0.08)'},
};

/**
 * Render or update the chart.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object[]}          rows      Projection rows
 * @param {object}            config    App state
 * @param {object}            visibility  { total, isa, sipp, premiumBonds, cash }
 */
export function renderChart(canvas, rows, config, visibility = {}) {
  // Guard against Chart.js not being loaded
  if (typeof Chart === 'undefined') return;
  const labels  = rows.map(r => r.year);
  const ageMap  = Object.fromEntries(rows.map(r => [r.year, r.age]));
  const defVis  = { total: true, isa: true, sipp: true, premiumBonds: true, cash: false, ...visibility };

  const retirementYear = new Date().getFullYear() + (config.retirementAge - config.currentAge);
  const dbStartYear    = config.dbPension.enabled
    ? new Date().getFullYear() + (config.dbPension.startAge - config.currentAge)
    : null;
  const spStartYear    = config.statePension.enabled
    ? new Date().getFullYear() + (config.statePensionAge - config.currentAge)
    : null;

  const datasets = [
    {
      label: 'Total Net Worth',
      data: rows.map(r => r.totalNetWorth),
      borderColor: COLOURS.total.border,
      backgroundColor: COLOURS.total.background,
      borderWidth: 2.5,
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      hidden: !defVis.total,
    },
    {
      label: 'ISA',
      data: rows.map(r => r.isaBalance),
      borderColor: COLOURS.isa.border,
      backgroundColor: COLOURS.isa.background,
      borderWidth: 1.5,
      fill: false,
      tension: 0.3,
      pointRadius: 0,
      hidden: !defVis.isa,
    },
    {
      label: 'SIPP',
      data: rows.map(r => r.sippBalance),
      borderColor: COLOURS.sipp.border,
      backgroundColor: COLOURS.sipp.background,
      borderWidth: 1.5,
      fill: false,
      tension: 0.3,
      pointRadius: 0,
      hidden: !defVis.sipp,
    },
    {
      label: 'Premium Bonds',
      data: rows.map(r => r.premiumBondsBalance),
      borderColor: COLOURS.premiumBonds.border,
      backgroundColor: COLOURS.premiumBonds.background,
      borderWidth: 1.5,
      fill: false,
      tension: 0.3,
      pointRadius: 0,
      hidden: !defVis.premiumBonds,
    },
    {
      label: 'Cash',
      data: rows.map(r => r.cashBalance),
      borderColor: COLOURS.cash.border,
      backgroundColor: COLOURS.cash.background,
      borderWidth: 1.5,
      fill: false,
      tension: 0.3,
      pointRadius: 0,
      hidden: !defVis.cash,
    },
  ];

  // Vertical annotation lines + phase background shading via inline plugin
  const annotationPlugin = {
    id: 'fire2Annotations',
    beforeDraw(chart) {
      const ctx = chart.ctx;
      const xAxis = chart.scales.x;
      const yAxis = chart.scales.y;
      if (!xAxis || !yAxis) return;

      const getX = year => {
        const idx = labels.indexOf(year);
        return idx === -1 ? null : xAxis.getPixelForValue(idx);
      };

      ctx.save();

      // Phase bands
      const xRetire  = getX(retirementYear);
      const xPension = dbStartYear ? getX(dbStartYear) : (spStartYear ? getX(spStartYear) : null);
      const chartRight = xAxis.right;
      const chartLeft  = xAxis.left;

      if (xRetire !== null) {
        // Accumulation (start → retire): subtle blue tint
        ctx.fillStyle = 'rgba(37,99,235,0.04)';
        ctx.fillRect(chartLeft, yAxis.top, xRetire - chartLeft, yAxis.bottom - yAxis.top);

        // Bridge (retire → pension) or full retirement: amber tint
        const bridgeEnd = xPension !== null ? xPension : chartRight;
        ctx.fillStyle = 'rgba(217,119,6,0.06)';
        ctx.fillRect(xRetire, yAxis.top, bridgeEnd - xRetire, yAxis.bottom - yAxis.top);

        // Pension phase (pension start → end): green tint
        if (xPension !== null) {
          ctx.fillStyle = 'rgba(22,163,74,0.05)';
          ctx.fillRect(xPension, yAxis.top, chartRight - xPension, yAxis.bottom - yAxis.top);
        }
      }

      ctx.restore();
    },
    afterDraw(chart) {
      const ctx = chart.ctx;
      const xAxis = chart.scales.x;
      const yAxis = chart.scales.y;
      if (!xAxis || !yAxis) return;

      const drawLine = (year, colour, label) => {
        const idx = labels.indexOf(year);
        if (idx === -1) return;
        const x = xAxis.getPixelForValue(idx);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, yAxis.top);
        ctx.lineTo(x, yAxis.bottom);
        ctx.strokeStyle = colour;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        // Label
        ctx.fillStyle = colour;
        ctx.font = '10px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, yAxis.top - 4);
        ctx.restore();
      };

      drawLine(retirementYear, '#d97706', '🏖 Retire');
      if (dbStartYear) drawLine(dbStartYear, '#16a34a', '🎖 DB');
      if (spStartYear) drawLine(spStartYear, '#2563eb', '🇬🇧 SP');
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

  if (_chart) {
    _chart.data = chartConfig.data;
    _chart.options = chartConfig.options;
    _chart.update('none');
  } else {
    // eslint-disable-next-line no-undef
    _chart = new Chart(canvas, chartConfig);
  }
}

/**
 * Destroy the chart instance (e.g., when canvas is replaced).
 */
export function destroyChart() {
  if (_chart) {
    _chart.destroy();
    _chart = null;
  }
}

/**
 * Toggle visibility of a dataset by label.
 * @param {string} label
 */
export function toggleDataset(label) {
  if (!_chart) return;
  const ds = _chart.data.datasets.find(d => d.label === label);
  if (!ds) return;
  ds.hidden = !ds.hidden;
  _chart.update();
  return !ds.hidden;
}
