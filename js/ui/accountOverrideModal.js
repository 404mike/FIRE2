/**
 * accountOverrideModal.js — Per-account lump sum & extra drawdown override modal
 *
 * Opens a modal showing a year-by-year table for a single account (ISA, SIPP,
 * Premium Bonds, or Cash) where the user can set lump sum contributions (In)
 * and extra drawdown overrides (Out) for each year.
 */

import { formatCurrency } from './helpers.js';
import { setOverride } from '../state/store.js';

export const ACCOUNT_DEFS = [
  {
    key:           'isa',
    label:         'ISA',
    icon:          '📈',
    lumpSumField:  'isaLumpSum',
    drawdownField: 'isaCustomDrawdown',
    balanceKey:    'isaBalance',
  },
  {
    key:           'sipp',
    label:         'SIPP',
    icon:          '🏦',
    lumpSumField:  'sippLumpSum',
    drawdownField: 'sippCustomDrawdown',
    balanceKey:    'sippBalance',
  },
  {
    key:           'premiumBonds',
    label:         'Premium Bonds',
    icon:          '🏆',
    lumpSumField:  'premiumBondLumpSum',
    drawdownField: 'premiumBondsCustomDrawdown',
    balanceKey:    'premiumBondsBalance',
  },
  {
    key:           'cash',
    label:         'Cash',
    icon:          '💵',
    lumpSumField:  'cashLumpSum',
    drawdownField: 'cashCustomDrawdown',
    balanceKey:    'cashBalance',
  },
];

let _activeModal = null;

/**
 * Open the override modal for a specific account.
 *
 * @param {string}   accountKey  One of: 'isa' | 'sipp' | 'premiumBonds' | 'cash'
 * @param {object[]} rows        Projection rows from runProjection()
 * @param {object}   config      App state (used for overrides)
 */
export function openAccountOverrideModal(accountKey, rows, config) {
  // Close any existing modal first
  _closeActiveModal();

  const account = ACCOUNT_DEFS.find(a => a.key === accountKey);
  if (!account) return;

  const ov = config.overrides || {};

  // Build tbody rows
  const tbodyHTML = rows.map(row => {
    const override = ov[row.year] || {};
    const phase = row.phase === 'retire'
      ? '<span class="badge badge-retire">Retire</span>'
      : '<span class="badge badge-accumulate">Accum.</span>';
    const lumpVal     = override[account.lumpSumField]  || '';
    const drawdownVal = override[account.drawdownField] || '';
    const hasOverride = lumpVal || drawdownVal;
    return `
      <tr data-year="${row.year}" class="${hasOverride ? 'has-override' : ''}">
        <td class="col-year">${row.year} / ${row.age}</td>
        <td>${phase}</td>
        <td class="col-num">${formatCurrency(row[account.balanceKey])}</td>
        <td>
          <input class="override-input" type="number"
            data-year="${row.year}" data-field="${account.lumpSumField}"
            value="${lumpVal}" placeholder="0" />
        </td>
        <td>
          <input class="override-input" type="number"
            data-year="${row.year}" data-field="${account.drawdownField}"
            value="${drawdownVal}" placeholder="0" />
        </td>
      </tr>
    `;
  }).join('');

  // Build overlay
  const overlay = document.createElement('div');
  overlay.className = 'acct-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `${account.label} overrides`);
  overlay.innerHTML = `
    <div class="acct-modal">
      <div class="acct-modal-header">
        <div class="acct-modal-title">
          <span class="acct-modal-icon">${account.icon}</span>
          ${account.label} — Contributions &amp; Drawdowns
        </div>
        <button class="acct-modal-close btn btn-sm btn-secondary" aria-label="Close">✕ Close</button>
      </div>
      <p class="acct-modal-desc">
        Set lump sum contributions (<strong>In £</strong>) added to this account or extra
        drawdown (<strong>Out £</strong>) taken from it each year.
        Changes apply immediately to the projection.
      </p>
      <div class="acct-modal-scroll">
        <table class="acct-override-table year-table">
          <thead>
            <tr>
              <th class="col-year">Year / Age</th>
              <th>Phase</th>
              <th class="col-num">${account.label} Balance</th>
              <th title="Lump sum added to this account this year">Lump Sum In (£)</th>
              <th title="Extra drawdown taken from this account this year">Extra Draw Out (£)</th>
            </tr>
          </thead>
          <tbody>${tbodyHTML}</tbody>
        </table>
      </div>
    </div>
  `;

  // Close on backdrop click
  overlay.addEventListener('click', e => {
    if (e.target === overlay) _closeActiveModal();
  });

  // Close button
  overlay.querySelector('.acct-modal-close').addEventListener('click', _closeActiveModal);

  // Override input listeners
  overlay.querySelectorAll('.override-input').forEach(input => {
    input.addEventListener('change', () => {
      const year  = parseInt(input.dataset.year, 10);
      const field = input.dataset.field;
      const value = input.value === '' ? 0 : parseFloat(input.value);
      setOverride(year, { [field]: value });

      // Highlight row if any override is set
      const row    = input.closest('tr');
      const inputs = row.querySelectorAll('.override-input');
      const any    = [...inputs].some(i => i.value !== '' && parseFloat(i.value) !== 0);
      row.classList.toggle('has-override', any);
    });
  });

  document.body.appendChild(overlay);
  _activeModal = overlay;

  // Trap Escape key
  document.addEventListener('keydown', _handleEsc);

  // Focus the close button for accessibility
  overlay.querySelector('.acct-modal-close').focus();
}

function _closeActiveModal() {
  if (_activeModal) {
    _activeModal.remove();
    _activeModal = null;
    document.removeEventListener('keydown', _handleEsc);
  }
}

function _handleEsc(e) {
  if (e.key === 'Escape') _closeActiveModal();
}
