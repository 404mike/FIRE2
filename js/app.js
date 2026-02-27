/**
 * app.js — Main application entry point
 *
 * Orchestrates:
 * 1. State loading (URL > localStorage > defaults)
 * 2. Auto-save
 * 3. Input view (sidebar)
 * 4. Projection engine
 * 5. Summary, chart, and table views
 * 6. Share URL copy button
 * 7. Re-render on state change
 */

import { getState, subscribe }            from './state/store.js';
import { loadFromLocalStorage, initAutoSave } from './state/localStorageAdapter.js';
import { loadFromUrl, getShareUrl }        from './state/shareUrlAdapter.js';
import { runProjection }                   from './engine/projectionEngine.js';
import { renderInputView }                 from './ui/inputView.js';
import { renderSummaryView }               from './ui/summaryView.js';
import { renderChart, destroyChart, toggleDataset } from './ui/chartView.js';
import { renderTableView }                 from './ui/tableView.js';

// ── DOM refs ──────────────────────────────────────────────────────────────

const sidebarEl    = document.getElementById('sidebar');
const summaryEl    = document.getElementById('summary');
const chartCanvas  = document.getElementById('mainChart');
const legendEl     = document.getElementById('chartLegend');
const tableEl      = document.getElementById('tableContainer');
const shareBtnEl   = document.getElementById('shareBtn');
const toastEl      = document.getElementById('toastContainer');

// Active tab
let _activeTab = 'chart';

// Visibility state for chart datasets
const _visibility = { total: true, isa: true, sipp: true, premiumBonds: true, cash: false };

// Debounce flag for rendering
let _renderScheduled = false;

// ── Initialise ────────────────────────────────────────────────────────────

(function init() {
  // Load state: URL first, then localStorage, then defaults stay
  const fromUrl = loadFromUrl();
  if (!fromUrl) loadFromLocalStorage();

  // Start auto-save
  initAutoSave();

  // Render sidebar once
  renderInputView(sidebarEl);

  // Subscribe to state changes → re-render everything except sidebar inputs
  subscribe(onStateChange);

  // Initial render
  onStateChange();

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${_activeTab}`));
    });
  });

  // Share button
  if (shareBtnEl) {
    shareBtnEl.addEventListener('click', () => {
      const url = getShareUrl();
      navigator.clipboard.writeText(url)
        .then(() => showToast('Share link copied to clipboard!'))
        .catch(() => {
          // Fallback: show in prompt
          window.prompt('Copy this link:', url);
        });
    });
  }
})();

// ── State change handler ──────────────────────────────────────────────────

function onStateChange() {
  // Debounce rapid successive changes (e.g., dragging a slider)
  if (_renderScheduled) return;
  _renderScheduled = true;
  requestAnimationFrame(() => {
    _renderScheduled = false;
    _render();
  });
}

function _render() {
  const config = getState();
  const rows   = runProjection(config);

  // Summary tiles
  renderSummaryView(summaryEl, rows, config);

  // Chart
  if (chartCanvas) {
    if (typeof Chart !== 'undefined') {
      renderChart(chartCanvas, rows, config, _visibility);
      renderLegend(legendEl);
    } else {
      // Chart.js not loaded (e.g. network blocked) - show fallback message
      const wrapper = chartCanvas.parentElement;
      if (wrapper && !wrapper.querySelector('.chart-fallback')) {
        const msg = document.createElement('p');
        msg.className = 'chart-fallback';
        msg.style.cssText = 'text-align:center;padding:2rem;color:var(--text-muted);font-size:0.85rem;';
        msg.textContent = 'Chart requires internet connection to load Chart.js library.';
        wrapper.appendChild(msg);
      }
    }
  }

  // Table
  if (_activeTab === 'table' || tableEl) {
    renderTableView(tableEl, rows, config);
  }

  // Re-render sidebar only when needed (input view subscribes to DOM events directly)
  // We do NOT re-render sidebar on every state change to avoid losing focus.
  // Instead we patch specific inputs that might have changed due to inter-field dependencies.
  _patchSidebarDependentFields(config);
}

// ── Sidebar patch (state → DOM, avoid full re-render) ────────────────────

function _patchSidebarDependentFields(config) {
  // Update the state pension age display text in the sidebar
  const spAgeHint = sidebarEl.querySelector('[data-sp-age-hint]');
  if (spAgeHint) spAgeHint.textContent = config.statePensionAge;
}

// ── Legend ────────────────────────────────────────────────────────────────

const LEGEND_ITEMS = [
  { key: 'total',        label: 'Total Net Worth', color: '#2563eb' },
  { key: 'isa',          label: 'ISA',             color: '#16a34a' },
  { key: 'sipp',         label: 'SIPP',            color: '#d97706' },
  { key: 'premiumBonds', label: 'Premium Bonds',   color: '#9333ea' },
  { key: 'cash',         label: 'Cash',            color: '#64748b' },
];

function renderLegend(el) {
  if (!el) return;
  el.innerHTML = LEGEND_ITEMS.map(item => `
    <div class="legend-item ${_visibility[item.key] ? '' : 'inactive'}" data-key="${item.key}">
      <div class="legend-dot" style="background:${item.color}"></div>
      <span>${item.label}</span>
    </div>
  `).join('');

  el.querySelectorAll('.legend-item').forEach(li => {
    li.addEventListener('click', () => {
      const key = li.dataset.key;
      // Map key to chart dataset label
      const labelMap = {
        total:        'Total Net Worth',
        isa:          'ISA',
        sipp:         'SIPP',
        premiumBonds: 'Premium Bonds',
        cash:         'Cash',
      };
      const visible = toggleDataset(labelMap[key]);
      _visibility[key] = visible !== undefined ? visible : !_visibility[key];
      li.classList.toggle('inactive', !_visibility[key]);
    });
  });
}

// ── Toast ─────────────────────────────────────────────────────────────────

function showToast(message, duration = 3000) {
  if (!toastEl) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toastEl.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}
