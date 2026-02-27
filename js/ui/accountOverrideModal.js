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
    key:                 'isa',
    label:               'ISA',
    icon:                '📈',
    lumpSumField:        'isaLumpSum',
    drawdownField:       'isaCustomDrawdown',
    balanceKey:          'isaBalance',
    contributionField:   'isaContributionOverride',
    contributionKey:     'isaContribution',
    drawdownRateField:   'drawdownRateOverride',
  },
  {
    key:                 'sipp',
    label:               'SIPP',
    icon:                '🏦',
    lumpSumField:        'sippLumpSum',
    drawdownField:       'sippCustomDrawdown',
    balanceKey:          'sippBalance',
    contributionField:   'sippContributionOverride',
    contributionKey:     'sippContribution',
    drawdownRateField:   'drawdownRateOverride',
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

  // Whether this account has the extra ISA/SIPP-specific override columns
  const hasContribCols = Boolean(account.contributionField);

  // Build thead
  const theadHTML = `
    <tr>
      <th class="col-year">Year / Age</th>
      <th>Phase</th>
      <th class="col-num">${account.label} Balance</th>
      ${hasContribCols
        ? `<th title="Override the annual contribution to this account for this year (0 = stop contributions)">Contribution (£/yr)</th>
           <th title="Override the portfolio drawdown rate for this year">Drawdown Rate (%)</th>`
        : ''}
      <th title="Lump sum added to this account this year">Lump Sum In (£)</th>
      <th title="Extra drawdown taken from this account this year">Extra Draw Out (£)</th>
    </tr>
  `;

  // Build tbody rows
  const tbodyHTML = rows.map(row => {
    const override  = ov[row.year] || {};
    const phase = row.phase === 'retire'
      ? '<span class="badge badge-retire">Retire</span>'
      : '<span class="badge badge-accumulate">Accum.</span>';

    const lumpVal     = override[account.lumpSumField]  || '';
    const drawdownVal = override[account.drawdownField] || '';

    let contribVal       = '';
    let drawdownRateVal  = '';
    let extraCols        = '';

    if (hasContribCols) {
      contribVal = override[account.contributionField] != null
                   ? override[account.contributionField]
                   : '';
      drawdownRateVal = override[account.drawdownRateField] != null
                        ? override[account.drawdownRateField]
                        : '';

      // Effective/placeholder contribution for this row
      const defaultContrib = row.phase === 'accumulate'
        ? (row[account.contributionKey] || 0)
        : null;
      const contribPlaceholder = defaultContrib !== null
        ? defaultContrib
        : '—';

      extraCols = `
        <td>
          <input class="override-input contrib-input" type="number"
            data-year="${row.year}" data-field="${account.contributionField}"
            value="${contribVal}" placeholder="${contribPlaceholder}"
            ${row.phase === 'retire' ? 'disabled title="Contributions only apply during accumulation phase"' : ''} />
        </td>
        <td>
          <input class="override-input rate-input" type="number" min="0" max="100" step="0.1"
            data-year="${row.year}" data-field="${account.drawdownRateField}"
            value="${drawdownRateVal}" placeholder="—"
            ${row.phase === 'accumulate' ? 'disabled title="Drawdown rate only applies during retirement"' : ''} />
        </td>
      `;
    }

    const hasOverride = lumpVal || drawdownVal || contribVal !== '' || drawdownRateVal !== '';
    return `
      <tr data-year="${row.year}" class="${hasOverride ? 'has-override' : ''}">
        <td class="col-year">${row.year} / ${row.age}</td>
        <td>${phase}</td>
        <td class="col-num">${formatCurrency(row[account.balanceKey])}</td>
        ${extraCols}
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

  // Description text
  let descHTML = `Set lump sum contributions (<strong>In £</strong>) added to this account or extra
    drawdown (<strong>Out £</strong>) taken from it each year.`;
  if (hasContribCols) {
    descHTML += ` For accumulation years, override the regular <strong>Contribution (£/yr)</strong> (set 0 to
      stop contributions that year). For retirement years, set a <strong>Drawdown Rate (%)</strong> to override
      the portfolio drawdown rate for that year.`;
  }
  descHTML += ' Changes apply immediately to the projection.';

  // Build overlay
  const overlay = document.createElement('div');
  overlay.className = 'acct-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `${account.label} overrides`);
  overlay.innerHTML = `
    <div class="acct-modal${hasContribCols ? ' acct-modal-wide' : ''}">
      <div class="acct-modal-header">
        <div class="acct-modal-title">
          <span class="acct-modal-icon">${account.icon}</span>
          ${account.label} — Contributions &amp; Drawdowns
        </div>
        <button class="acct-modal-close btn btn-sm btn-secondary" aria-label="Close">✕ Close</button>
      </div>
      <p class="acct-modal-desc">${descHTML}</p>
      <div class="acct-modal-scroll">
        <table class="acct-override-table year-table">
          <thead>${theadHTML}</thead>
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
  overlay.querySelectorAll('.override-input:not([disabled])').forEach(input => {
    input.addEventListener('change', () => {
      const year  = parseInt(input.dataset.year, 10);
      const field = input.dataset.field;
      const value = input.value === '' ? null : parseFloat(input.value);
      setOverride(year, { [field]: value });

      // Highlight row if any non-empty override is entered (including 0, which is meaningful)
      const row    = input.closest('tr');
      const inputs = row.querySelectorAll('.override-input:not([disabled])');
      const any    = [...inputs].some(i => i.value !== '');
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
