/**
 * accountOverrideModal.js — Per-account lump sum & extra drawdown override modal
 *
 * Opens a modal showing a year-by-year table for a single account (ISA, SIPP,
 * Premium Bonds, or Cash) where the user can set lump sum contributions (In)
 * and extra drawdown overrides (Out) for each year.
 */

import { formatCurrency } from './helpers.js';
import { setOverride, subscribe, getState } from '../state/store.js';
import { runProjection } from '../engine/projectionEngine.js';
import { getIsaDrawdownAllowed, getSippDrawdownAllowed } from '../engine/projectionUtils.js';

export const ACCOUNT_DEFS = [
  {
    key:                 'isa',
    label:               'ISA',
    icon:                '📈',
    lumpSumField:        'isaLumpSum',
    drawdownField:       'isaCustomDrawdown',
    balanceKey:          'isaBalance',
    withdrawnKey:        'isaWithdrawn',
    contributionField:   'isaContributionOverride',
    contributionKey:     'isaContribution',
    drawdownRateField:   'isaDrawdownRateOverride',
    drawdownAllowedFn:   (config, age) => getIsaDrawdownAllowed(config, age),
  },
  {
    key:                 'sipp',
    label:               'SIPP',
    icon:                '🏦',
    lumpSumField:        'sippLumpSum',
    drawdownField:       'sippCustomDrawdown',
    balanceKey:          'sippBalance',
    withdrawnKey:        'sippWithdrawn',
    contributionField:   'sippContributionOverride',
    contributionKey:     'sippContribution',
    drawdownRateField:   'sippDrawdownRateOverride',
    drawdownAllowedFn:   (config, age) => getSippDrawdownAllowed(config, age),
  },
  {
    key:           'premiumBonds',
    label:         'Premium Bonds',
    icon:          '🏆',
    lumpSumField:  'premiumBondLumpSum',
    drawdownField: 'premiumBondsCustomDrawdown',
    balanceKey:    'premiumBondsBalance',
    withdrawnKey:  'premiumBondsWithdrawn',
  },
  {
    key:           'cash',
    label:         'Cash',
    icon:          '💵',
    lumpSumField:  'cashLumpSum',
    drawdownField: 'cashCustomDrawdown',
    balanceKey:    'cashBalance',
    withdrawnKey:  'cashWithdrawn',
  },
];

let _activeModal = null;
let _unsubscribeModal = null;

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
           <th title="Override the portfolio drawdown rate for this year">Drawdown Rate (%)</th>
           <th class="col-num" title="Annual drawdown amount based on the rate and current balance">Drawdown (£/yr)</th>`
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

      // Drawdown rate input is disabled unless the account is accessible at this age
      const drawdownAllowed = account.drawdownAllowedFn
        ? account.drawdownAllowedFn(config, row.age)
        : row.phase === 'retire';
      const rateDisabledAttr = !drawdownAllowed
        ? 'disabled title="Drawdown rate only applies once this account is accessible"'
        : '';

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
            value="${drawdownRateVal}" placeholder="0"
            ${rateDisabledAttr} />
        </td>
        <td class="col-num drawdown-amount-cell">${(() => {
          if (!drawdownAllowed) return '—';
          if (drawdownRateVal === '') return '—';
          return formatCurrency(row[account.withdrawnKey] || 0);
        })()}</td>
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
    drawdown (<strong>Out £</strong>) taken from it each year. Changes update the balance for that year and all subsequent years.`;
  if (hasContribCols) {
    descHTML += ` For accumulation years, override the regular <strong>Contribution (£/yr)</strong> (set 0 to
      stop contributions that year). For retirement years, set a <strong>Drawdown Rate (%)</strong> to draw
      that percentage specifically from this account each year (independent of the global drawdown rate and
      withdrawal order).`;
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
      ${hasContribCols ? `
      <div class="acct-modal-rate-setter">
        <label class="rate-setter-label" for="rate-setter-input">Set drawdown rate for all retirement years:</label>
        <input id="rate-setter-input" class="rate-setter-input" type="number" min="0" max="100" step="0.1"
          placeholder="0" />
        <span class="rate-setter-unit">%</span>
        <button class="btn btn-sm btn-primary rate-setter-apply">Apply to all</button>
        <button class="btn btn-sm btn-secondary rate-setter-clear">Clear all</button>
      </div>` : ''}
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

  // Override input listeners — use 'input' for real-time updates as the user types
  overlay.querySelectorAll('.override-input:not([disabled])').forEach(input => {
    input.addEventListener('input', () => {
      const year  = parseInt(input.dataset.year, 10);
      const field = input.dataset.field;
      const value = input.value === '' ? null : parseFloat(input.value);

      // Skip update while user is mid-typing an incomplete number (e.g. "-" or "1.")
      if (input.value !== '' && isNaN(value)) return;

      setOverride(year, { [field]: value });

      // Highlight row if any non-empty override is entered (including 0, which is meaningful)
      const row    = input.closest('tr');
      const inputs = row.querySelectorAll('.override-input:not([disabled])');
      const any    = [...inputs].some(i => i.value !== '');
      row.classList.toggle('has-override', any);
    });
  });

  // Apply / Clear drawdown rate for all retirement years
  if (hasContribCols) {
    const rateSetterInput = overlay.querySelector('.rate-setter-input');

    overlay.querySelector('.rate-setter-apply').addEventListener('click', () => {
      if (rateSetterInput.value === '') return;
      const val = parseFloat(rateSetterInput.value);
      if (isNaN(val)) return;

      const tbody = overlay.querySelector('tbody');
      rows.forEach(row => {
        const allowed = account.drawdownAllowedFn
          ? account.drawdownAllowedFn(config, row.age)
          : row.phase === 'retire';
        if (!allowed) return;
        setOverride(row.year, { [account.drawdownRateField]: val });
        const tr = tbody?.querySelector(`tr[data-year="${row.year}"]`);
        if (!tr) return;
        const rateInput = tr.querySelector('.rate-input');
        if (rateInput) rateInput.value = val ?? '';
        const inputs = tr.querySelectorAll('.override-input:not([disabled])');
        tr.classList.toggle('has-override', [...inputs].some(i => i.value !== ''));
      });
    });

    overlay.querySelector('.rate-setter-clear').addEventListener('click', () => {
      rateSetterInput.value = '';
      const tbody = overlay.querySelector('tbody');
      rows.forEach(row => {
        const allowed = account.drawdownAllowedFn
          ? account.drawdownAllowedFn(config, row.age)
          : row.phase === 'retire';
        if (!allowed) return;
        setOverride(row.year, { [account.drawdownRateField]: null });
        const tr = tbody?.querySelector(`tr[data-year="${row.year}"]`);
        if (!tr) return;
        const rateInput = tr.querySelector('.rate-input');
        if (rateInput) rateInput.value = '';
        const inputs = tr.querySelectorAll('.override-input:not([disabled])');
        tr.classList.toggle('has-override', [...inputs].some(i => i.value !== ''));
      });
    });
  }

  // Subscribe to state changes so the balance column stays up-to-date
  // while the modal is open and the user makes changes.
  // Debounce via requestAnimationFrame (consistent with app.js) to avoid
  // running the projection on every keystroke.
  let _balanceUpdateScheduled = false;
  _unsubscribeModal = subscribe(() => {
    if (_balanceUpdateScheduled) return;
    _balanceUpdateScheduled = true;
    requestAnimationFrame(() => {
      _balanceUpdateScheduled = false;
      const newConfig = getState();
      const newRows   = runProjection(newConfig);
      const tbody = overlay.querySelector('tbody');
      if (!tbody) return;
      newRows.forEach(row => {
        const tr = tbody.querySelector(`tr[data-year="${row.year}"]`);
        if (!tr) return;
        const balanceCell = tr.querySelector('.col-num');
        if (balanceCell) balanceCell.textContent = formatCurrency(row[account.balanceKey]);
        if (account.drawdownRateField) {
          const drawdownAmountCell = tr.querySelector('.drawdown-amount-cell');
          const drawdownAllowed = account.drawdownAllowedFn
            ? account.drawdownAllowedFn(newConfig, row.age)
            : row.phase === 'retire';
          if (drawdownAmountCell && drawdownAllowed) {
            const yearOverride = newConfig.overrides?.[row.year] || {};
            const rateOverride = yearOverride[account.drawdownRateField];
            if (rateOverride != null && rateOverride !== 0) {
              drawdownAmountCell.textContent = formatCurrency(row[account.withdrawnKey] || 0);
            } else {
              drawdownAmountCell.textContent = '—';
            }
          }
        }
      });
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
  if (_unsubscribeModal) {
    _unsubscribeModal();
    _unsubscribeModal = null;
  }
}

function _handleEsc(e) {
  if (e.key === 'Escape') _closeActiveModal();
}

/**
 * Return the effective drawdown rate (as a percentage, e.g. 4) for a year,
 * applying the per-year override when present and non-zero.
 */
function _effectiveDrawdownRate(rateOverride, config) {
  return (rateOverride != null && rateOverride !== 0)
    ? rateOverride
    : (config.drawdown.rate ?? config.drawdown.phase1Rate ?? 4);
}
