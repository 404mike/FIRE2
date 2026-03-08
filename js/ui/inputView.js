/**
 * inputView.js — Renders and manages the sidebar input form
 *
 * Reads from store, writes back via setState.
 * No calculation logic here.
 */

import { getState, setState } from '../state/store.js';
import { openAccountOverrideModal } from './accountOverrideModal.js';
import { runProjection } from '../engine/projectionEngine.js';

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
          <label>Inflation Rate (%/yr)</label>
          <input type="number" id="inflationRate" value="${s.inflationRate ?? 2.5}" min="0" max="15" step="0.1" />
        </div>
        <div class="field">
          <label>Default Drawdown Rate (%/yr)</label>
          <input type="number" id="drawdownRate" value="${s.drawdown.rate ?? s.drawdown.phase1Rate ?? 4}" min="0" max="20" step="0.1" />
        </div>
        <div class="field">
          <label>Maximum Annual Income (£, blank = no limit)</label>
          <input type="number" id="maxIncome" value="${s.maxIncome ?? ''}" min="0" step="1000" placeholder="No limit" />
        </div>
        <div class="field">
          <label>Display Mode</label>
          <select id="displayMode">
            <option value="real"    ${(s.displayMode || 'real') === 'real'    ? 'selected' : ''}>Real (today's £, inflation-adjusted)</option>
            <option value="nominal" ${(s.displayMode || 'real') === 'nominal' ? 'selected' : ''}>Nominal (future £s)</option>
          </select>
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
        <div class="field">
          <label>Drawdown Start Age (blank = retirement age)</label>
          <input type="number" id="isaDrawdownStartAge" value="${s.isa.drawdownStartAge ?? ''}" min="18" max="100" placeholder="Same as retirement age" />
        </div>
        <button class="btn btn-sm btn-secondary btn-full acct-override-btn" data-account="isa"
                title="Edit lump sum &amp; extra drawdown overrides for ISA">
          ⚙ ISA Overrides…
        </button>
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
        </div>
        <div class="field">
          <label>Stop Contributions at Age (blank = never)</label>
          <input type="number" id="sippStopContributionAge" value="${s.sipp.stopContributionAge ?? ''}" min="18" max="100" placeholder="Never" />
        </div>
        <div class="field">
          <label>Drawdown Start Age (blank = NMPA / access age)</label>
          <input type="number" id="sippDrawdownStartAge" value="${s.sipp.drawdownStartAge ?? ''}" min="18" max="100" placeholder="Same as access age (${s.sipp.accessAge ?? 57})" />
        </div>
        <button class="btn btn-sm btn-secondary btn-full acct-override-btn" data-account="sipp"
                title="Edit lump sum &amp; extra drawdown overrides for SIPP">
          ⚙ SIPP Overrides…
        </button>
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
        <div class="toggle-field">
          <label for="pbCompoundMode">Compound prizes (Mode B)</label>
          <label class="switch"><input type="checkbox" id="pbCompoundMode" ${s.premiumBonds.compoundMode ? 'checked' : ''} /><span class="slider"></span></label>
        </div>
        <div class="field" style="font-size:0.78rem;color:var(--text-muted);padding:0.25rem 0;">
          ${s.premiumBonds.compoundMode
            ? 'Mode B: prizes compound inside the account (balance grows up to £50k cap).'
            : 'Mode A: prizes paid out to Cash each year (balance stays flat).'}
        </div>
        <button class="btn btn-sm btn-secondary btn-full acct-override-btn" data-account="premiumBonds"
                title="Edit lump sum &amp; extra drawdown overrides for Premium Bonds">
          ⚙ Premium Bonds Overrides…
        </button>
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
        <div class="field">
          <label>Drawdown Start Age (blank = retirement age)</label>
          <input type="number" id="cashDrawdownStartAge" value="${s.cash.drawdownStartAge ?? ''}" min="18" max="100" placeholder="Same as retirement age" />
        </div>
        <button class="btn btn-sm btn-secondary btn-full acct-override-btn" data-account="cash"
                title="Edit lump sum &amp; extra drawdown overrides for Cash">
          ⚙ Cash Overrides…
        </button>
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
        <div class="field">
          <label>Growth Model</label>
          <select id="spGrowthModel">
            <option value="real"        ${(s.statePension.growthModel || 'real') === 'real'        ? 'selected' : ''}>Real (constant purchasing power)</option>
            <option value="tripleLock"  ${(s.statePension.growthModel || 'real') === 'tripleLock'  ? 'selected' : ''}>Triple Lock (max of inflation, 2.5%)</option>
            <option value="custom"      ${(s.statePension.growthModel || 'real') === 'custom'      ? 'selected' : ''}>Custom growth rate</option>
          </select>
        </div>
        <div class="field" id="spCustomRateField" style="${(s.statePension.growthModel || 'real') === 'custom' ? '' : 'display:none'}">
          <label>Custom Growth Rate (%/yr)</label>
          <input type="number" id="spCustomGrowthRate" value="${s.statePension.customGrowthRate ?? 2.5}" min="0" max="15" step="0.1" />
        </div>
        <div class="field" style="font-size:0.78rem;color:var(--text-muted);padding:0.25rem 0;">
          Start age determined by State Pension Age (set in Profile): <strong data-sp-age-hint>${s.statePensionAge}</strong>
        </div>
      </div>
    </div>

  `;
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

  // Account override buttons
  container.querySelectorAll('.acct-override-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const config = getState();
      openAccountOverrideModal(btn.dataset.account, runProjection(config), config);
    });
  });

  // Profile
  bindNumber(container, 'currentAge',        v => setState({ currentAge: v }));
  bindNumber(container, 'retirementAge',     v => setState({ retirementAge: v }));
  bindNumber(container, 'endAge',            v => setState({ endAge: v }));
  bindNumber(container, 'statePensionAge',   v => setState({ statePensionAge: v }));
  bindNumber(container, 'retirementSpending',v => setState({ retirementSpending: v }));
  bindNumber(container, 'inflationRate',     v => setState({ inflationRate: v }));
  bindNumber(container, 'drawdownRate',      v => setState({ drawdown: { rate: v } }));
  bindNullableNumber(container, 'maxIncome', v => setState({ maxIncome: v }));
  bindSelect(container, 'displayMode',       v => setState({ displayMode: v }));

  // ISA
  bindCheckbox(container, 'isaEnabled',          v => setState({ isa: { enabled: v } }));
  bindNumber(container,   'isaBalance',           v => setState({ isa: { balance: v } }));
  bindNumber(container,   'isaGrowthRate',        v => setState({ isa: { growthRate: v } }));
  bindNumber(container,   'isaAnnualContribution',v => setState({ isa: { annualContribution: v } }));
  bindNullableNumber(container, 'isaStopContributionAge', v => setState({ isa: { stopContributionAge: v } }));
  bindNullableNumber(container, 'isaDrawdownStartAge',    v => setState({ isa: { drawdownStartAge: v } }));

  // SIPP
  bindCheckbox(container, 'sippEnabled',           v => setState({ sipp: { enabled: v } }));
  bindNumber(container,   'sippBalance',            v => setState({ sipp: { balance: v } }));
  bindNumber(container,   'sippGrowthRate',         v => setState({ sipp: { growthRate: v } }));
  bindNumber(container,   'sippAnnualContribution', v => setState({ sipp: { annualContribution: v } }));
  bindNullableNumber(container, 'sippStopContributionAge', v => setState({ sipp: { stopContributionAge: v } }));
  bindNullableNumber(container, 'sippDrawdownStartAge',    v => setState({ sipp: { drawdownStartAge: v } }));

  // Premium Bonds
  bindCheckbox(container, 'pbEnabled',          v => setState({ premiumBonds: { enabled: v } }));
  bindNumber(container,   'pbBalance',          v => setState({ premiumBonds: { balance: v } }));
  bindNumber(container,   'pbPrizeRate',        v => setState({ premiumBonds: { prizeRate: v } }));
  bindCheckbox(container, 'pbCompoundMode',     v => setState({ premiumBonds: { compoundMode: v } }));
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
  bindNullableNumber(container, 'cashDrawdownStartAge',    v => setState({ cash: { drawdownStartAge: v } }));

  // DB Pension
  bindCheckbox(container, 'dbEnabled',     v => setState({ dbPension: { enabled: v } }));
  bindNumber(container,   'dbAnnualIncome',v => setState({ dbPension: { annualIncome: v } }));
  bindNumber(container,   'dbStartAge',   v => setState({ dbPension: { startAge: v } }));

  // State Pension
  bindCheckbox(container, 'spEnabled',          v => setState({ statePension: { enabled: v } }));
  bindNumber(container,   'spAnnualIncome',     v => setState({ statePension: { annualIncome: v } }));
  bindSelect(container,   'spGrowthModel',      v => {
    setState({ statePension: { growthModel: v } });
    const customField = container.querySelector('#spCustomRateField');
    if (customField) customField.style.display = v === 'custom' ? '' : 'none';
  });
  bindNumber(container,   'spCustomGrowthRate', v => setState({ statePension: { customGrowthRate: v } }));
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

function bindSelect(container, id, fn) {
  const el = container.querySelector(`#${id}`);
  if (!el) return;
  el.addEventListener('change', () => fn(el.value));
}
