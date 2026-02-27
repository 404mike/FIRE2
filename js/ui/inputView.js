/**
 * inputView.js — Renders and manages the sidebar input form
 *
 * Reads from store, writes back via setState.
 * No calculation logic here.
 */

import { getState, setState } from '../state/store.js';

/**
 * Render the full input sidebar into `container`.
 * @param {HTMLElement} container
 */
export function renderInputView(container) {
  container.innerHTML = buildSidebarHTML(getState());
  attachEventListeners(container);
}

// ── HTML builders ─────────────────────────────────────────────────────────

function buildSidebarHTML(s) {
  return `
    <!-- Profile Section -->
    <div>
      <div class="section-header" data-section="profile">
        <span>👤 Profile</span>
        <span class="toggle-icon">▾</span>
      </div>
      <div class="section-body" data-body="profile">
        <div class="field-row">
          <div class="field">
            <label>Current Age</label>
            <input type="number" id="currentAge" value="${s.currentAge}" min="18" max="80" />
          </div>
          <div class="field">
            <label>Retirement Age</label>
            <input type="number" id="retirementAge" value="${s.retirementAge}" min="40" max="90" />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>End Age (model to)</label>
            <input type="number" id="endAge" value="${s.endAge}" min="70" max="120" />
          </div>
          <div class="field">
            <label>State Pension Age</label>
            <input type="number" id="statePensionAge" value="${s.statePensionAge}" min="60" max="75" />
          </div>
        </div>
        <div class="field">
          <label>Retirement Spending (£/yr)</label>
          <input type="number" id="retirementSpending" value="${s.retirementSpending}" min="0" step="500" />
        </div>
        <div class="field">
          <label>Default Drawdown Rate (%/yr)</label>
          <input type="number" id="drawdownRate" value="${s.drawdown.rate ?? s.drawdown.phase1Rate ?? 4}" min="0" max="20" step="0.1" />
        </div>
      </div>
    </div>

    <!-- ISA Section -->
    <div>
      <div class="section-header" data-section="isa">
        <span>📈 ISA (Stocks &amp; Shares)</span>
        <span class="toggle-icon">▾</span>
      </div>
      <div class="section-body" data-body="isa">
        <div class="toggle-field">
          <label for="isaEnabled">Enabled</label>
          <label class="switch"><input type="checkbox" id="isaEnabled" ${s.isa.enabled ? 'checked' : ''} /><span class="slider"></span></label>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Starting Balance (£)</label>
            <input type="number" id="isaBalance" value="${s.isa.balance}" min="0" step="1000" />
          </div>
          <div class="field">
            <label>Growth Rate (%/yr)</label>
            <input type="number" id="isaGrowthRate" value="${s.isa.growthRate}" min="0" max="20" step="0.1" />
          </div>
        </div>
        <div class="field">
          <label>Annual Contribution (£/yr)</label>
          <input type="number" id="isaAnnualContribution" value="${s.isa.annualContribution}" min="0" step="500" />
        </div>
        <div class="field">
          <label>Stop Contributions at Age (blank = never)</label>
          <input type="number" id="isaStopContributionAge" value="${s.isa.stopContributionAge ?? ''}" min="18" max="100" placeholder="Never" />
        </div>
      </div>
    </div>

    <!-- SIPP Section -->
    <div>
      <div class="section-header" data-section="sipp">
        <span>🏦 SIPP (Pension Pot)</span>
        <span class="toggle-icon">▾</span>
      </div>
      <div class="section-body" data-body="sipp">
        <div class="toggle-field">
          <label for="sippEnabled">Enabled</label>
          <label class="switch"><input type="checkbox" id="sippEnabled" ${s.sipp.enabled ? 'checked' : ''} /><span class="slider"></span></label>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Starting Balance (£)</label>
            <input type="number" id="sippBalance" value="${s.sipp.balance}" min="0" step="1000" />
          </div>
          <div class="field">
            <label>Growth Rate (%/yr)</label>
            <input type="number" id="sippGrowthRate" value="${s.sipp.growthRate}" min="0" max="20" step="0.1" />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Annual Contribution (£/yr)</label>
            <input type="number" id="sippAnnualContribution" value="${s.sipp.annualContribution}" min="0" step="500" />
          </div>
          <div class="field">
            <label>Access Age (NMPA)</label>
            <input type="number" id="sippAccessAge" value="${s.sipp.accessAge}" min="50" max="70" />
          </div>
        </div>
        <div class="field">
          <label>Stop Contributions at Age (blank = never)</label>
          <input type="number" id="sippStopContributionAge" value="${s.sipp.stopContributionAge ?? ''}" min="18" max="100" placeholder="Never" />
        </div>
      </div>
    </div>

    <!-- Premium Bonds Section -->
    <div>
      <div class="section-header" data-section="pb">
        <span>🏆 Premium Bonds</span>
        <span class="toggle-icon">▾</span>
      </div>
      <div class="section-body" data-body="pb">
        <div class="toggle-field">
          <label for="pbEnabled">Enabled</label>
          <label class="switch"><input type="checkbox" id="pbEnabled" ${s.premiumBonds.enabled ? 'checked' : ''} /><span class="slider"></span></label>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Balance (£)</label>
            <input type="number" id="pbBalance" value="${s.premiumBonds.balance}" min="0" step="1000" />
          </div>
          <div class="field">
            <label>Prize Rate (%/yr)</label>
            <input type="number" id="pbPrizeRate" value="${s.premiumBonds.prizeRate}" min="0" max="10" step="0.1" />
          </div>
        </div>
        <div class="field">
          <label>Drawdown Start Age (blank = retirement age)</label>
          <input type="number" id="pbDrawdownStartAge" value="${s.premiumBonds.drawdownStartAge ?? ''}" min="40" max="90" placeholder="Same as retirement age" />
        </div>
      </div>
    </div>

    <!-- Cash Section -->
    <div>
      <div class="section-header" data-section="cash">
        <span>💵 Cash Buffer</span>
        <span class="toggle-icon">▾</span>
      </div>
      <div class="section-body" data-body="cash">
        <div class="toggle-field">
          <label for="cashEnabled">Enabled</label>
          <label class="switch"><input type="checkbox" id="cashEnabled" ${s.cash.enabled ? 'checked' : ''} /><span class="slider"></span></label>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Balance (£)</label>
            <input type="number" id="cashBalance" value="${s.cash.balance}" min="0" step="1000" />
          </div>
          <div class="field">
            <label>Growth Rate (%/yr)</label>
            <input type="number" id="cashGrowthRate" value="${s.cash.growthRate}" min="0" max="10" step="0.1" />
          </div>
        </div>
        <div class="field">
          <label>Annual Contribution (£/yr)</label>
          <input type="number" id="cashAnnualContribution" value="${s.cash.annualContribution}" min="0" step="500" />
        </div>
        <div class="field">
          <label>Stop Contributions at Age (blank = never)</label>
          <input type="number" id="cashStopContributionAge" value="${s.cash.stopContributionAge ?? ''}" min="18" max="100" placeholder="Never" />
        </div>
      </div>
    </div>

    <!-- DB Pension Section -->
    <div>
      <div class="section-header" data-section="db">
        <span>🎖️ Defined Benefit Pension</span>
        <span class="toggle-icon">▾</span>
      </div>
      <div class="section-body" data-body="db">
        <div class="toggle-field">
          <label for="dbEnabled">Enabled</label>
          <label class="switch"><input type="checkbox" id="dbEnabled" ${s.dbPension.enabled ? 'checked' : ''} /><span class="slider"></span></label>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Annual Income (£/yr)</label>
            <input type="number" id="dbAnnualIncome" value="${s.dbPension.annualIncome}" min="0" step="500" />
          </div>
          <div class="field">
            <label>Start Age</label>
            <input type="number" id="dbStartAge" value="${s.dbPension.startAge}" min="55" max="85" />
          </div>
        </div>
      </div>
    </div>

    <!-- State Pension Section -->
    <div>
      <div class="section-header" data-section="sp">
        <span>🇬🇧 State Pension</span>
        <span class="toggle-icon">▾</span>
      </div>
      <div class="section-body" data-body="sp">
        <div class="toggle-field">
          <label for="spEnabled">Enabled</label>
          <label class="switch"><input type="checkbox" id="spEnabled" ${s.statePension.enabled ? 'checked' : ''} /><span class="slider"></span></label>
        </div>
        <div class="field">
          <label>Annual Income (£/yr)</label>
          <input type="number" id="spAnnualIncome" value="${s.statePension.annualIncome}" min="0" step="500" />
        </div>
        <div class="field" style="font-size:0.78rem;color:var(--text-muted);padding:0.25rem 0;">
          Start age determined by State Pension Age (set in Profile): <strong>${s.statePensionAge}</strong>
        </div>
      </div>
    </div>

    <!-- Withdrawal Order -->
    <div>
      <div class="section-header" data-section="order">
        <span>⚖️ Withdrawal Order</span>
        <span class="toggle-icon">▾</span>
      </div>
      <div class="section-body" data-body="order">
        <p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.5rem;">
          Drag to reorder. Funds drawn in this order during retirement.
        </p>
        ${buildWithdrawalOrderHTML(s.withdrawalOrder)}
      </div>
    </div>
  `;
}

function buildWithdrawalOrderHTML(order) {
  const labels = {
    premiumBonds: '🏆 Premium Bonds',
    isa:          '📈 ISA',
    sipp:         '🏦 SIPP',
    cash:         '💵 Cash',
  };
  const items = order.map((key, i) => `
    <li class="order-item" draggable="true" data-key="${key}" data-idx="${i}">
      <span class="drag-handle">⠿</span>
      <span>${labels[key] || key}</span>
      <span style="margin-left:auto;font-size:0.7rem;color:var(--text-muted);">${i + 1}</span>
    </li>
  `).join('');
  return `<ol class="order-list" id="withdrawalOrderList">${items}</ol>`;
}

// ── Event listeners ───────────────────────────────────────────────────────

function attachEventListeners(container) {
  // Section collapse/expand
  container.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', () => {
      const key = header.dataset.section;
      const body = container.querySelector(`[data-body="${key}"]`);
      header.classList.toggle('collapsed');
      body.classList.toggle('collapsed');
    });
  });

  // Profile
  bindNumber(container, 'currentAge',        v => setState({ currentAge: v }));
  bindNumber(container, 'retirementAge',     v => setState({ retirementAge: v }));
  bindNumber(container, 'endAge',            v => setState({ endAge: v }));
  bindNumber(container, 'statePensionAge',   v => setState({ statePensionAge: v }));
  bindNumber(container, 'retirementSpending',v => setState({ retirementSpending: v }));
  bindNumber(container, 'drawdownRate',      v => setState({ drawdown: { rate: v } }));

  // ISA
  bindCheckbox(container, 'isaEnabled',          v => setState({ isa: { enabled: v } }));
  bindNumber(container,   'isaBalance',           v => setState({ isa: { balance: v } }));
  bindNumber(container,   'isaGrowthRate',        v => setState({ isa: { growthRate: v } }));
  bindNumber(container,   'isaAnnualContribution',v => setState({ isa: { annualContribution: v } }));
  bindNullableNumber(container, 'isaStopContributionAge', v => setState({ isa: { stopContributionAge: v } }));

  // SIPP
  bindCheckbox(container, 'sippEnabled',           v => setState({ sipp: { enabled: v } }));
  bindNumber(container,   'sippBalance',            v => setState({ sipp: { balance: v } }));
  bindNumber(container,   'sippGrowthRate',         v => setState({ sipp: { growthRate: v } }));
  bindNumber(container,   'sippAnnualContribution', v => setState({ sipp: { annualContribution: v } }));
  bindNumber(container,   'sippAccessAge',          v => setState({ sipp: { accessAge: v } }));
  bindNullableNumber(container, 'sippStopContributionAge', v => setState({ sipp: { stopContributionAge: v } }));

  // Premium Bonds
  bindCheckbox(container, 'pbEnabled',          v => setState({ premiumBonds: { enabled: v } }));
  bindNumber(container,   'pbBalance',          v => setState({ premiumBonds: { balance: v } }));
  bindNumber(container,   'pbPrizeRate',        v => setState({ premiumBonds: { prizeRate: v } }));
  const pbDrawdownEl = container.querySelector('#pbDrawdownStartAge');
  if (pbDrawdownEl) {
    pbDrawdownEl.addEventListener('change', () => {
      const raw = pbDrawdownEl.value.trim();
      setState({ premiumBonds: { drawdownStartAge: raw === '' ? null : Number(raw) } });
    });
  }

  // Cash
  bindCheckbox(container, 'cashEnabled',           v => setState({ cash: { enabled: v } }));
  bindNumber(container,   'cashBalance',            v => setState({ cash: { balance: v } }));
  bindNumber(container,   'cashGrowthRate',         v => setState({ cash: { growthRate: v } }));
  bindNumber(container,   'cashAnnualContribution', v => setState({ cash: { annualContribution: v } }));
  bindNullableNumber(container, 'cashStopContributionAge', v => setState({ cash: { stopContributionAge: v } }));

  // DB Pension
  bindCheckbox(container, 'dbEnabled',     v => setState({ dbPension: { enabled: v } }));
  bindNumber(container,   'dbAnnualIncome',v => setState({ dbPension: { annualIncome: v } }));
  bindNumber(container,   'dbStartAge',   v => setState({ dbPension: { startAge: v } }));

  // State Pension
  bindCheckbox(container, 'spEnabled',     v => setState({ statePension: { enabled: v } }));
  bindNumber(container,   'spAnnualIncome',v => setState({ statePension: { annualIncome: v } }));

  // Withdrawal order drag-and-drop
  initWithdrawalOrderDrag(container);
}

function bindNumber(container, id, fn) {
  const el = container.querySelector(`#${id}`);
  if (!el) return;
  el.addEventListener('change', () => {
    const v = parseFloat(el.value);
    if (!isNaN(v)) fn(v);
  });
}

function bindNullableNumber(container, id, fn) {
  const el = container.querySelector(`#${id}`);
  if (!el) return;
  el.addEventListener('change', () => {
    const raw = el.value.trim();
    if (raw === '') { fn(null); return; }
    const parsed = Number(raw);
    fn(isNaN(parsed) ? null : parsed);
  });
}

function bindCheckbox(container, id, fn) {
  const el = container.querySelector(`#${id}`);
  if (!el) return;
  el.addEventListener('change', () => fn(el.checked));
}

function initWithdrawalOrderDrag(container) {
  const list = container.querySelector('#withdrawalOrderList');
  if (!list) return;

  let dragSrc = null;

  list.querySelectorAll('.order-item').forEach(item => {
    item.addEventListener('dragstart', e => {
      dragSrc = item;
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    item.addEventListener('drop', e => {
      e.preventDefault();
      if (dragSrc === item) return;
      // Re-order
      const items = [...list.querySelectorAll('.order-item')];
      const from = items.indexOf(dragSrc);
      const to   = items.indexOf(item);
      const order = items.map(i => i.dataset.key);
      order.splice(from, 1);
      order.splice(to, 0, dragSrc.dataset.key);
      setState({ withdrawalOrder: order });
    });
  });
}
