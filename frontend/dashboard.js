/**
 * MyVault | Core Banking Dashboard Logic (v3.1 - Input Mutex)
 */

const API_BASE = "http://localhost:8000/api/v1/accounts/";
const ENDPOINTS = {
  accounts: `${API_BASE}accounts/`,
  transactions: `${API_BASE}transactions/history/`,
  loans: `${API_BASE}loans/`,
  deposit: `${API_BASE}transactions/deposit/`,
  withdraw: `${API_BASE}transactions/withdraw/`,
  transfer: `${API_BASE}transactions/transfer/`,
  setPin: `${API_BASE}set-pin/`
};

let currentAccounts = [];
let cachedTransactions = [];
let currentLoans = [];
let idIsMasked = true;
let activeModalType = null;
let atmStep = "idle";
let atmPinDigits = "";
let atmAmountDigits = "";
let atmAmount = 0;
let atmAccountId = "";
let atmNotice = "";
let atmAttempts = 0;
let atmLockUntil = 0;
let atmSessionTimer = null;
let atmLockTimer = null;
let atmLastTransaction = null;
let atmBeepContext = null;
const updatingAccountIds = new Set();
const ledgerFilters = { date: 'recent', type: 'all', volume: 'default' };

/**
 * 🛰️ UTILS
 */
function getTxMetadata(tx) {
  const myAccountIds = currentAccounts.map(a => a.id);
  let isPos = tx.transaction_type === "DEPOSIT";
  let isInternal = false;
  let isOutbound = tx.transaction_type === "WITHDRAWAL";

  if (tx.transaction_type === "TRANSFER") {
    const iAmSender = myAccountIds.includes(tx.sender_account);
    const iAmReceiver = myAccountIds.includes(tx.receiver_account);
    if (iAmSender && iAmReceiver) isInternal = true;
    else if (iAmSender) isOutbound = true;
    else if (iAmReceiver) isPos = true;
  }

  let colorClass = isPos ? 'text-emerald-500' : (isOutbound ? 'text-red-500' : 'text-blue-500');
  let sign = isPos ? '+' : (isOutbound ? '-' : '⇄');
  return { isPos, isOutbound, isInternal, colorClass, sign };
}

/**
 * 🛠️ API CORE
 */
async function coreFetch(url, options = {}) {
  const access = localStorage.access;
  if (!access) { logout(); return; }
  const headers = { 'Authorization': `Bearer ${access}`, 'Content-Type': 'application/json', ...options.headers };
  try {
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) { logout(); throw new Error("Unauthorized"); }
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    return data;
  } catch (err) { throw err; }
}

/**
 * 🔄 LIFECYCLE
 */
document.addEventListener('DOMContentLoaded', async () => {
  const userDisp = document.getElementById('user-display');

  // Only sync core banking data if on a page with a summary bar/dashboard context
  if (document.getElementById('summary-bar') || document.getElementById('accounts-grid')) {
    await syncDashboard();
  }

  initializeLedgerFilters();

  if (userDisp) {
    userDisp.textContent = localStorage.user_display || "Authorized User";
  }
});

async function syncDashboard() {
  try {
    const [accounts, transactions, loans] = await Promise.all([
      coreFetch(ENDPOINTS.accounts),
      coreFetch(ENDPOINTS.transactions),
      coreFetch(ENDPOINTS.loans)
    ]);

    currentAccounts = accounts;
    cachedTransactions = transactions;
    currentLoans = loans;
    renderSummaryBar();
    renderAccounts();
    renderTransactions();
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

function renderSummaryBar() {
  const bar = document.getElementById('summary-bar');
  if (!bar) return;
  const totalAssets = currentAccounts.reduce((s, a) => s + parseFloat(a.balance), 0);
  const totalDebt = (currentLoans || []).reduce((s, l) => s + parseFloat(l.remaining_amount), 0);

  const fmt = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v);

  bar.innerHTML = `
      <div class="card p-6 border-none bg-blue-600/5 hover:bg-blue-600/10 transition-colors">
          <p class="text-[10px] font-black uppercase tracking-widest opacity-30 mb-1">Liquid Assets</p>
          <p class="text-xl font-extrabold tracking-tight">${fmt(totalAssets)}</p>
      </div>
      <div class="card p-6 border-none bg-red-600/5 hover:bg-red-600/10 transition-colors">
          <p class="text-[10px] font-black uppercase tracking-widest opacity-30 mb-1">Debt Exposure</p>
          <p class="text-xl font-extrabold tracking-tight text-red-500">${fmt(totalDebt)}</p>
      </div>
  `;
}

/**
 * 🏢 RENDERERS
 */
function renderAccounts() {
  const grid = document.getElementById('accounts-grid');
  grid.innerHTML = '';
  currentAccounts.forEach(acc => {
    const card = document.createElement('div');
    const isUpdating = updatingAccountIds.has(String(acc.id));
    card.className = `card p-8 group ${isUpdating ? 'cursor-wait' : 'cursor-pointer active:scale-[0.99]'} transition-all`;
    if (!isUpdating) card.onclick = () => openVaultDrawer(acc.id);
    card.innerHTML = `
            <div class="flex justify-between items-start mb-10">
                <div class="bg-blue-600/10 dark:bg-blue-600 text-blue-600 dark:text-white px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-widest">${acc.account_type}</div>
                <div class="text-[10px] font-bold text-blue-600 uppercase">${isUpdating ? 'Updating...' : 'Audit →'}</div>
            </div>
            <div class="space-y-1">
                <p class="text-[10px] font-bold opacity-30 uppercase tracking-widest">Available Balance</p>
                <h4 class="text-3xl font-extrabold tracking-tight">${isUpdating ? '<span class="inline-block animate-pulse">Updating...</span>' : `₹${parseFloat(acc.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}</h4>
            </div>
        `;
    grid.appendChild(card);
  });
}

function setAccountLoading(accountIds, isLoading) {
  accountIds.forEach(accountId => {
    const normalizedId = String(accountId);
    if (isLoading) updatingAccountIds.add(normalizedId);
    else updatingAccountIds.delete(normalizedId);
  });
  renderAccounts();
}

function getAffectedAccountIds(transactionType, body) {
  if (transactionType === 'deposit' || transactionType === 'withdraw') {
    return [body.account_id];
  }
  if (transactionType === 'transfer') {
    return [body.sender_id, body.receiver_id];
  }
  return [];
}

function renderTransactions() {
  const table = document.getElementById('transactions-table');
  if (!table) return;
  table.innerHTML = '';
  const typeFilter = document.getElementById('ledger-type-filter');
  if (typeFilter) {
    const selectedType = ledgerFilters.type;
    const types = [...new Set(cachedTransactions.map(tx => tx.transaction_type).filter(Boolean))].sort();
    typeFilter.innerHTML = '<option value="all">All types</option>' + types.map(type =>
      `<option value="${escapeHtml(type)}">${escapeHtml(type.replaceAll('_', ' '))}</option>`
    ).join('');
    typeFilter.value = types.includes(selectedType) ? selectedType : 'all';
    ledgerFilters.type = typeFilter.value;
  }

  let transactions = [...cachedTransactions];
  if (ledgerFilters.type !== 'all') {
    transactions = transactions.filter(tx => tx.transaction_type === ledgerFilters.type);
  }
  if (ledgerFilters.date === 'recent') {
    transactions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else if (ledgerFilters.date === 'oldest') {
    transactions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }
  if (ledgerFilters.volume === 'smallest') {
    transactions.sort((a, b) => Math.abs(Number(a.amount)) - Math.abs(Number(b.amount)));
  } else if (ledgerFilters.volume === 'largest') {
    transactions.sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)));
  }

  if (!transactions.length) {
    table.innerHTML = '<tr><td colspan="3" class="px-6 py-10 text-center opacity-50">No transactions match these filters.</td></tr>';
    return;
  }
  transactions.forEach(tx => {
    const { colorClass, sign } = getTxMetadata(tx);
    const row = document.createElement('tr');
    row.className = "hover-row transition-all";
    row.onclick = () => openAuditDrawer(tx.id);

    row.innerHTML = `
            <td class="px-6 py-4 text-[11px] font-bold uppercase tracking-tighter">${new Date(tx.created_at).toLocaleDateString()}</td>
            <td class="px-6 py-4 font-bold text-xs capitalize opacity-80">${tx.transaction_type}</td>
            <td class="px-6 py-4 text-right font-mono text-sm font-bold ${colorClass}">
                ${sign}₹${parseFloat(Math.abs(tx.amount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </td>
        `;
    table.appendChild(row);
  });
}

function initializeLedgerFilters() {
  const controls = [
    ['ledger-date-order', 'date'],
    ['ledger-type-filter', 'type'],
    ['ledger-volume-order', 'volume']
  ];
  controls.forEach(([id, filter]) => {
    const control = document.getElementById(id);
    if (!control) return;
    control.value = ledgerFilters[filter];
    control.addEventListener('change', () => {
      ledgerFilters[filter] = control.value;
      renderTransactions();
    });
  });
  renderTransactions();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

/**
 * 🏦 DRAWER ENGINE
 */
function openVaultDrawer(accountId) {
  const acc = currentAccounts.find(a => a.id === accountId);
  if (!acc) return;
  const overlay = document.getElementById('drawer-overlay');
  closeAllDrawers();
  document.body.classList.add('drawer-left-active');
  overlay.classList.remove('hidden');
  setTimeout(() => overlay.classList.add('opacity-100'), 10);
  renderDrawerContent(acc);
}

function renderDrawerContent(acc) {
  const content = document.getElementById('drawer-content');
  const maskedID = `${acc.id.slice(0, 8)} •••• •••• ${acc.id.slice(-8)}`;
  const actualID = acc.id;

  content.innerHTML = `
        <div class="space-y-4">
            <h3 class="text-4xl font-extrabold tracking-tight">₹${parseFloat(acc.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h3>
            <p class="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">Liquid Balance</p>
        </div>
        <div class="space-y-6">
            <div class="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800">
                <div class="flex justify-between items-center mb-4">
                    <p class="text-[10px] font-bold opacity-30 uppercase tracking-widest">Vault Secure UUID</p>
                    <button onclick="toggleIDMasking('${acc.id}')" class="text-blue-600 hover:text-blue-700 transition">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${idIsMasked ? 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' : 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18'}"/></svg>
                    </button>
                </div>
                <div class="flex items-center justify-between gap-3 bg-white dark:bg-black p-3 rounded-xl border border-slate-100 dark:border-white/5">
                    <code class="text-xs font-mono opacity-80 break-all select-all">${idIsMasked ? maskedID : actualID}</code>
                    <button onclick="navigator.clipboard.writeText('${actualID}'); alert('ID Copied')" class="text-blue-600 font-bold text-[10px] uppercase pl-2">COPY</button>
                </div>
            </div>
            <div class="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
                <p class="text-[10px] font-bold opacity-30 uppercase tracking-widest mb-1">Account Type</p>
                <p class="text-sm font-bold capitalize">${acc.account_type}</p>
            </div>
        </div>
        <div class="space-y-4 pt-10">
             <button onclick="openModal('transfer');" class="w-full bg-blue-600 text-white font-bold py-5 rounded-xl text-xs uppercase tracking-widest hover:bg-blue-700 transition active:scale-[0.98]">Transfer Funds</button>
             <button onclick="openATM();" class="w-full btn-ui font-bold py-5 rounded-xl text-xs uppercase tracking-widest hover:opacity-80 transition active:scale-[0.98]">Add Funds</button>
             <a href="account.html?id=${actualID}" class="w-full btn-ui flex items-center justify-center font-bold py-5 rounded-xl text-xs uppercase tracking-widest hover:opacity-80 transition active:scale-[0.98]">View Full Statement</a>
        </div>
  `;
}

function toggleIDMasking(id) { idIsMasked = !idIsMasked; const acc = currentAccounts.find(a => a.id === id); if (acc) renderDrawerContent(acc); }

function openAuditDrawer(txId) {
  const tx = cachedTransactions.find(t => t.id === txId);
  if (!tx) return;
  const overlay = document.getElementById('drawer-overlay');
  const content = document.getElementById('audit-content');
  const { colorClass, sign } = getTxMetadata(tx);

  closeAllDrawers();
  document.body.classList.add('drawer-right-active');
  overlay.classList.remove('hidden');
  setTimeout(() => overlay.classList.add('opacity-100'), 10);

  content.innerHTML = `
        <div class="space-y-4">
             <div class="text-4xl font-extrabold tracking-tight ${colorClass}">
                ${sign}₹${parseFloat(Math.abs(tx.amount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
             </div>
             <p class="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">Transaction Intensity</p>
        </div>
        <div class="space-y-6">
            <div class="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
                <p class="text-[10px] font-bold opacity-30 uppercase tracking-widest mb-2">Immutable ID</p>
                <code class="text-xs font-mono opacity-80 break-all select-all">${tx.id}</code>
            </div>

            ${tx.sender_account ? `
            <div class="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
                <p class="text-[10px] font-bold opacity-30 uppercase tracking-widest mb-2">Sender Vault</p>
                <div class="flex items-center justify-between gap-3">
                    <code class="text-[10px] font-mono break-all opacity-50">${tx.sender_account}</code>
                    <button onclick="navigator.clipboard.writeText('${tx.sender_account}'); alert('ID Copied')" class="text-blue-600 font-bold text-[10px]">COPY</button>
                </div>
            </div>
            ` : ''}

            ${tx.receiver_account ? `
            <div class="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
                <p class="text-[10px] font-bold opacity-30 uppercase tracking-widest mb-2">Receiver Vault</p>
                <div class="flex items-center justify-between gap-3">
                    <code class="text-[10px] font-mono break-all opacity-50">${tx.receiver_account}</code>
                    <button onclick="navigator.clipboard.writeText('${tx.receiver_account}'); alert('ID Copied')" class="text-blue-600 font-bold text-[10px]">COPY</button>
                </div>
            </div>
            ` : ''}

            <div class="flex flex-col gap-4">
                <div class="flex justify-between items-center py-5 border-b border-white/5">
                    <span class="text-xs font-bold opacity-40 uppercase">Operation</span>
                    <span class="text-xs font-extrabold capitalize">${tx.transaction_type}</span>
                </div>
                <div class="flex justify-between items-center py-5 border-b border-white/5">
                    <span class="text-xs font-bold opacity-40 uppercase">Timestamp</span>
                    <span class="text-xs font-extrabold">${new Date(tx.created_at).toLocaleString()}</span>
                </div>
            </div>
        </div>
        <div class="pt-6">
             <button onclick="closeAllDrawers()" class="w-full btn-ui opacity-50 font-bold py-5 rounded-xl text-[10px] uppercase tracking-widest hover:opacity-100 transition">Terminate Audit</button>
        </div>
    `;
}

function closeAllDrawers() {
  const overlay = document.getElementById('drawer-overlay');
  document.body.classList.remove('drawer-left-active', 'drawer-right-active');
  overlay.classList.remove('opacity-100');
  setTimeout(() => { if (!document.body.classList.contains('drawer-left-active') && !document.body.classList.contains('drawer-right-active')) overlay.classList.add('hidden'); }, 300);
}

/**
 * ATM top-up flow. One cabinet stays mounted; only its screen content changes.
 */
const ATM_MAX_RUPEES = 50_000;
const ATM_KEY_LAYOUT = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', 'Enter'];

function openATM() {
  if (!currentAccounts.length) {
    showATMError('No active vault is available for a top-up.');
    return;
  }
  const modal = document.getElementById('atm-modal');
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('atm-open');
  atmStep = 'amount';
  atmPinDigits = '';
  atmAmountDigits = '';
  atmAmount = 0;
  atmAccountId = String(currentAccounts[0].id);
  atmNotice = '';
  atmLastTransaction = null;
  document.querySelector('.atm-cabinet')?.classList.remove('has-receipt');
  document.querySelector('.atm-cabinet')?.classList.add('has-card');
  document.getElementById('atm-paper-receipt').textContent = '';
  renderATM();
  resetATMTimeout();
}

function closeATM() {
  if (atmStep === 'processing') return;
  const modal = document.getElementById('atm-modal');
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('atm-open');
  clearTimeout(atmSessionTimer);
  clearInterval(atmLockTimer);
}

function closeATMFromBackdrop(event) {
  if (event.target.id === 'atm-modal') closeATM();
}

function resetATMTimeout() {
  clearTimeout(atmSessionTimer);
  if (!document.getElementById('atm-modal')?.classList.contains('is-open')) return;
  atmSessionTimer = setTimeout(() => {
    if (atmStep === 'processing') {
      resetATMTimeout();
      return;
    }
    atmStep = 'idle';
    atmPinDigits = '';
    atmAmountDigits = '';
    atmAmount = 0;
    atmNotice = 'Session timed out. Tap to begin again.';
    renderATM();
  }, 30_000);
}

function startATM() {
  playATMBeep();
  if (atmLockUntil > Date.now()) {
    atmStep = 'amount';
    atmNotice = '';
  } else {
    if (atmLockUntil && atmLockUntil <= Date.now()) {
      atmAttempts = 0;
      atmLockUntil = 0;
    }
    atmStep = 'amount';
    atmPinDigits = '';
    atmAmountDigits = '';
    atmAmount = 0;
    atmNotice = '';
  }
  document.querySelector('.atm-cabinet')?.classList.add('has-card');
  renderATM();
  resetATMTimeout();
}

function renderATM() {
  const screen = document.getElementById('atm-screen');
  const keypad = document.getElementById('atm-keypad');
  if (!screen || !keypad) return;
  const account = currentAccounts.find(item => String(item.id) === String(atmAccountId)) || currentAccounts[0];
  const balance = Number(account?.balance) || 0;
  const money = value => formatINR(value);
  const notice = atmNotice ? `<div class="atm-notice ${atmStep === 'done' && atmLastTransaction?.ok ? 'is-good' : ''}">${escapeHtml(atmNotice)}</div>` : '';
  const option = (label, action, extra = '') => `<button type="button" class="atm-screen-option ${extra}" data-atm-action="${action}">${label}</button>`;
  let screenContent = '';

  if (atmStep === 'idle') {
    screenContent = `<div class="atm-screen-kicker">MYVAULT CASH SERVICES</div><div class="atm-screen-title">Welcome</div><p class="atm-screen-copy">Securely add funds to your vault.</p>${notice}${option('Insert card  ·  Tap to begin', 'start', 'atm-option-primary')}<div class="atm-screen-foot">Please keep your PIN private</div>`;
  } else if (atmStep === 'pin') {
    const locked = atmLockUntil > Date.now();
    const seconds = Math.max(1, Math.ceil((atmLockUntil - Date.now()) / 1000));
    screenContent = `<div class="atm-screen-kicker">STEP 2 OF 3</div><div class="atm-screen-title">Enter your PIN</div><p class="atm-screen-copy">Use the keypad to enter 4 digits.</p><div class="atm-pin-dots" aria-label="${atmPinDigits.length} of 4 PIN digits entered">${[0,1,2,3].map(i => `<span>${i < atmPinDigits.length ? '●' : '_'}</span>`).join('')}</div>${locked ? `<div class="atm-notice">ATM locked · try again in ${seconds}s</div>` : notice}<div class="atm-screen-foot">Attempts remaining: ${Math.max(0, 3 - atmAttempts)}</div>`;
    if (locked) {
      clearInterval(atmLockTimer);
      atmLockTimer = setInterval(() => {
        if (atmStep !== 'pin') { clearInterval(atmLockTimer); return; }
        if (atmLockUntil <= Date.now()) {
          clearInterval(atmLockTimer);
          atmAttempts = 0;
          atmNotice = 'Lock cleared. Enter your PIN to continue.';
        }
        renderATM();
      }, 1000);
    }
  } else if (atmStep === 'amount') {
    const selectedAmount = atmAmount || Number(atmAmountDigits) || 0;
    screenContent = `<div class="atm-screen-kicker">STEP 1 OF 3 · ${escapeHtml(account?.account_type || 'VAULT')}</div><div class="atm-screen-title">Choose amount</div><p class="atm-screen-copy">Select a preset or enter rupees.</p><div class="atm-quick-amounts">${[500, 1000, 2000, 5000].map(value => `<button type="button" data-atm-amount="${value}" class="${selectedAmount === value ? 'selected' : ''}">₹${value.toLocaleString('en-IN')}</button>`).join('')}</div><div class="atm-amount-display">₹ <strong>${selectedAmount ? selectedAmount.toLocaleString('en-IN') : '—'}</strong></div><div class="atm-account-select"><label for="atm-account">Credit to</label><select id="atm-account">${currentAccounts.map(item => `<option value="${escapeHtml(item.id)}" ${String(item.id) === String(account?.id) ? 'selected' : ''}>${escapeHtml(item.account_type)} · ${money(item.balance)}</option>`).join('')}</select></div>${option('Continue to PIN', 'amount-next', 'atm-option-primary')}${notice}<div class="atm-screen-foot">Custom amount · max ${money(ATM_MAX_RUPEES)} · keypad Enter to continue</div>`;
  } else if (atmStep === 'confirm') {
    screenContent = `<div class="atm-screen-kicker">STEP 3 OF 3 · CONFIRM</div><div class="atm-screen-title">Top up ${money(atmAmount)}?</div><p class="atm-screen-copy">${escapeHtml(account?.account_type || 'Vault')} balance will update after approval.</p><div class="atm-balance-preview"><span>Current balance</span><strong>${money(balance)}</strong><span>New balance</span><strong>${money(balance + atmAmount)}</strong></div>${notice}<div class="atm-action-row">${option('Cancel', 'back-amount', 'atm-option-muted')}${option('Confirm', 'confirm', 'atm-option-primary')}</div><div class="atm-screen-foot">Choose Confirm or Cancel</div>`;
  } else if (atmStep === 'processing') {
    screenContent = `<div class="atm-screen-kicker">SECURE TRANSACTION</div><div class="atm-processing-spinner"></div><div class="atm-screen-title">Please wait…</div><p class="atm-screen-copy">Contacting your vault securely.</p><div class="atm-screen-foot">Do not remove your card</div>`;
  } else {
    const result = atmLastTransaction || { ok: false, message: 'Transaction could not be completed.' };
    screenContent = result.ok
      ? `<div class="atm-result-icon">✓</div><div class="atm-screen-title">Top-up complete</div><p class="atm-screen-copy">Your new balance is ${money(result.balance)}.</p><div class="atm-receipt"><div class="receipt-brand">MYVAULT · RECEIPT</div><div class="receipt-rule"></div><div>TRANSACTION <span>${escapeHtml(result.id || 'PENDING')}</span></div><div>TIME <span>${escapeHtml(result.time || new Date().toLocaleString())}</span></div><div>AMOUNT <span>${money(result.amount)}</span></div><div>NEW BALANCE <span>${money(result.balance)}</span></div><div class="receipt-rule"></div><small>Thank you for banking with MyVault</small></div>${option('New top-up', 'restart')}${option('Finish', 'close', 'atm-option-muted')}`
      : `<div class="atm-result-icon is-error">!</div><div class="atm-screen-title">Unable to top up</div><p class="atm-screen-copy">${escapeHtml(result.message)}</p>${option('Try again', 'back-amount')}${option('Finish', 'close', 'atm-option-muted')}`;
  }

  screen.innerHTML = screenContent;
  const paper = document.getElementById('atm-paper-receipt');
  const cabinet = document.querySelector('.atm-cabinet');
  if (atmStep === 'done' && atmLastTransaction?.ok) {
    const receipt = atmLastTransaction;
    paper.innerHTML = `<strong>MYVAULT ATM RECEIPT</strong><span>TXN  ${escapeHtml(receipt.id || 'CONFIRMED')}</span><span>TIME ${escapeHtml(receipt.time || '')}</span><span>TOP UP  ${formatINR(receipt.amount)}</span><span>BALANCE ${formatINR(receipt.balance)}</span><small>Thank you</small>`;
    cabinet?.classList.add('has-receipt');
  } else {
    paper.textContent = '';
    cabinet?.classList.remove('has-receipt');
  }
  keypad.innerHTML = ATM_KEY_LAYOUT.map(key => `<button type="button" class="atm-key ${key === 'Clear' ? 'atm-key-clear' : ''} ${key === 'Enter' ? 'atm-key-enter' : ''}" data-atm-key="${key}" aria-label="${key}">${key === 'Clear' ? 'CLEAR' : key === 'Enter' ? 'ENTER' : key}</button>`).join('');
  document.getElementById('atm-side-left').innerHTML = Array.from({ length: 4 }, (_, i) => `<button type="button" data-atm-side="left" data-atm-index="${i}" aria-label="Screen option"></button>`).join('');
  document.getElementById('atm-side-right').innerHTML = Array.from({ length: 4 }, (_, i) => `<button type="button" data-atm-side="right" data-atm-index="${i}" aria-label="Screen option"></button>`).join('');
  screen.querySelectorAll('[data-atm-action]').forEach(button => button.addEventListener('click', () => handleATMScreenAction(button.dataset.atmAction)));
  screen.querySelectorAll('[data-atm-amount]').forEach(button => button.addEventListener('click', () => {
    atmAmount = Number(button.dataset.atmAmount);
    atmAmountDigits = String(atmAmount);
    atmNotice = '';
    playATMBeep(); renderATM(); resetATMTimeout();
  }));
  document.getElementById('atm-account')?.addEventListener('change', event => {
    atmAccountId = event.target.value; playATMBeep(); renderATM(); resetATMTimeout();
  });
  document.querySelectorAll('.atm-side-left button, .atm-side-right button').forEach(button => button.addEventListener('click', () => {
    const options = [...screen.querySelectorAll('[data-atm-action]')];
    const sideOffset = button.dataset.atmSide === 'right' ? 1 : 0;
    const target = options[sideOffset + Number(button.dataset.atmIndex)];
    if (target) target.click();
    else if (atmStep === 'amount' && button.dataset.atmSide === 'right') {
      const quick = [...screen.querySelectorAll('[data-atm-amount]')][Number(button.dataset.atmIndex)];
      quick?.click();
    }
  }));
  keypad.querySelectorAll('[data-atm-key]').forEach(button => button.addEventListener('click', () => handleATMKey(button.dataset.atmKey)));
}

function handleATMScreenAction(action) {
  if (action === 'start') return startATM();
  if (action === 'amount-next') return handleATMKey('Enter');
  if (action === 'confirm') return processATMTopUp();
  if (action === 'cancel' || action === 'close') return closeATM();
  if (action === 'restart') return openATM();
  if (action === 'back-amount') {
    atmStep = 'amount'; atmNotice = ''; atmLastTransaction = null; renderATM(); resetATMTimeout();
  }
}

function handleATMKey(key) {
  if (!document.getElementById('atm-modal')?.classList.contains('is-open')) return;
  playATMBeep();
  if (atmStep === 'idle') return startATM();
  if (atmStep === 'pin') {
    if (atmLockUntil > Date.now()) return;
    if (key === 'Clear') atmPinDigits = '';
    else if (key === 'Enter') {
      if (atmPinDigits.length === 4) { atmStep = 'confirm'; atmNotice = ''; }
      else atmNotice = 'Enter all 4 PIN digits.';
    } else if (/^\d$/.test(key) && atmPinDigits.length < 4) atmPinDigits += key;
  } else if (atmStep === 'amount') {
    if (key === 'Clear') { atmAmountDigits = ''; atmAmount = 0; }
    else if (key === 'Enter') {
      const value = Number(atmAmountDigits);
      if (!Number.isSafeInteger(value) || value <= 0) atmNotice = 'Enter a positive whole rupee amount.';
      else if (value > ATM_MAX_RUPEES) { atmLastTransaction = { ok: false, message: `ATM limit exceeded. Maximum is ${formatINR(ATM_MAX_RUPEES)}.` }; atmStep = 'done'; }
      else { atmAmount = value; atmNotice = ''; atmPinDigits = ''; atmStep = 'pin'; }
    } else if (/^\d$/.test(key) && atmAmountDigits.length < 10) {
      atmAmountDigits += key; atmAmount = Number(atmAmountDigits); atmNotice = '';
    }
  } else if (atmStep === 'confirm') {
    if (key === 'Clear') { atmStep = 'amount'; atmNotice = ''; }
    else if (key === 'Enter') return processATMTopUp();
  }
  renderATM();
  resetATMTimeout();
}

async function processATMTopUp() {
  if (atmStep !== 'confirm') return;
  const account = currentAccounts.find(item => String(item.id) === String(atmAccountId));
  if (!account || !Number.isSafeInteger(atmAmount) || atmAmount <= 0) {
    atmLastTransaction = { ok: false, message: 'Choose a valid amount and vault.' };
    atmStep = 'done'; renderATM(); return;
  }
  if (atmAmount > ATM_MAX_RUPEES) {
    atmLastTransaction = { ok: false, message: `ATM limit exceeded. Maximum is ${formatINR(ATM_MAX_RUPEES)}.` };
    atmStep = 'done'; renderATM(); return;
  }
  atmStep = 'processing';
  atmNotice = '';
  renderATM();
  resetATMTimeout();
  await new Promise(resolve => setTimeout(resolve, 1200));
  try {
    const tx = await coreFetch(ENDPOINTS.deposit, {
      method: 'POST',
      body: JSON.stringify({ account_id: account.id, amount: atmAmount, pin: atmPinDigits })
    });
    const refreshed = await syncDashboard();
    const updatedAccount = currentAccounts.find(item => String(item.id) === String(account.id));
    atmLastTransaction = {
      ok: true,
      id: tx?.id || 'CONFIRMED',
      time: tx?.created_at ? new Date(tx.created_at).toLocaleString() : new Date().toLocaleString(),
      amount: atmAmount,
      balance: Number(updatedAccount?.balance ?? Number(account.balance) + atmAmount)
    };
    if (!refreshed) atmLastTransaction.message = 'Top-up completed; balance refresh is unavailable.';
    atmAttempts = 0;
    atmStep = 'done';
  } catch (error) {
    const message = error.message || 'Transaction failed. Please try again.';
    const isWrongPin = /invalid transaction pin|security mismatch|incorrect.*pin/i.test(message);
    if (isWrongPin) {
      atmAttempts += 1;
      atmPinDigits = '';
      atmNotice = atmAttempts >= 3
        ? 'Too many incorrect PINs. ATM locked for 30 seconds.'
        : `Incorrect PIN. ${3 - atmAttempts} attempt${3 - atmAttempts === 1 ? '' : 's'} remaining.`;
      if (atmAttempts >= 3) atmLockUntil = Date.now() + 30_000;
      atmStep = 'pin';
    } else {
      let friendly = message;
      try {
        const parsed = JSON.parse(message);
        friendly = Object.values(parsed).flat().join(' · ');
      } catch (_) { }
      atmLastTransaction = { ok: false, message: friendly };
      atmStep = 'done';
    }
  }
  renderATM();
  resetATMTimeout();
}

function playATMBeep() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    atmBeepContext ||= new AudioContextClass();
    if (atmBeepContext.state === 'suspended') atmBeepContext.resume();
    const oscillator = atmBeepContext.createOscillator();
    const gain = atmBeepContext.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, atmBeepContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.045, atmBeepContext.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, atmBeepContext.currentTime + 0.075);
    oscillator.connect(gain); gain.connect(atmBeepContext.destination);
    oscillator.start(); oscillator.stop(atmBeepContext.currentTime + 0.08);
  } catch (_) { /* Audio is optional when the browser blocks playback. */ }
}

function showATMError(message) {
  atmStep = 'done';
  atmLastTransaction = { ok: false, message };
  const modal = document.getElementById('atm-modal');
  modal?.classList.add('is-open');
  modal?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('atm-open');
  renderATM();
}

document.addEventListener('keydown', event => {
  if (!document.getElementById('atm-modal')?.classList.contains('is-open')) return;
  if (/^\d$/.test(event.key) || ['Enter', 'Backspace', 'Escape', 'c', 'C'].includes(event.key)) {
    event.preventDefault();
    if (event.key === 'Escape') closeATM();
    else handleATMKey(event.key === 'Backspace' || event.key.toLowerCase() === 'c' ? 'Clear' : event.key);
  }
});

/**
 * 🧠 MODAL ENGINE
 */
function openModal(type) {
  activeModalType = type;
  const cont = document.getElementById('modal-container');
  const fields = document.getElementById('modal-fields');
  const title = document.getElementById('modal-title');
  const feedback = document.getElementById('modal-feedback');
  const submitBtn = document.getElementById('modal-btn');

  // RESET UI STATE
  feedback.innerHTML = '';
  submitBtn.disabled = false;
  submitBtn.textContent = "Confirm Operation";
  cont.classList.remove('hidden');

  if (type === 'new-vault') {
    title.textContent = "Vault Provisioning";
    fields.innerHTML = `
            <div class="space-y-4">
                <div class="input-group">
                    <label class="block text-[10px] font-bold opacity-40 uppercase mb-2">Vault Archetype</label>
                    <select name="account_type" class="w-full p-4 card font-bold text-xs outline-none">
                        <option value="SAVINGS">SAVINGS</option>
                        <option value="CURRENT">CURRENT</option>
                    </select>
                </div>
            </div>
        `;
  } else if (type === 'transfer') {
    title.textContent = "External Transmit";
    fields.innerHTML = `
            <div class="space-y-4">
                <select name="sender_id" class="w-full p-4 card font-bold text-xs">
                    ${currentAccounts.map(a => `<option value="${a.id}">${a.account_type} - Available: ${formatINR(a.balance)}</option>`).join('')}
                </select>
                <p class="available-balance" data-balance-for="sender_id">Available balance: ${formatINR(currentAccounts[0]?.balance)}</p>
                <input name="receiver_id" placeholder="Receiver UUID" class="w-full p-4 card text-xs font-mono" required>
                <input name="amount" type="number" min="1" step="1" inputmode="numeric" placeholder="Volume (₹, whole rupees)" class="w-full p-4 card font-bold" required>
                <input type="password" name="pin" maxlength="4" placeholder="•••• PIN" required 
                       class="w-full p-4 card text-center tracking-[1em] font-mono" style="-webkit-text-security: disc;">
            </div>
        `;
  } else if (type === 'deposit') {
    title.textContent = "Liquidity Injection";
    fields.innerHTML = `
            <div class="space-y-4">
                <select name="account_id" class="w-full p-4 card font-bold text-xs">
                    ${currentAccounts.map(a => `<option value="${a.id}">${a.account_type} - Available: ${formatINR(a.balance)}</option>`).join('')}
                </select>
                <p class="available-balance" data-balance-for="account_id">Available balance: ${formatINR(currentAccounts[0]?.balance)}</p>
                <input name="amount" type="number" min="1" step="1" inputmode="numeric" placeholder="Amount (₹, whole rupees)" class="w-full p-4 card font-bold" required>
                <input type="password" name="pin" maxlength="4" placeholder="•••• PIN" required 
                       class="w-full p-4 card text-center tracking-[1em] font-mono" style="-webkit-text-security: disc;">
            </div>
        `;
  } else if (type === 'withdraw') {
    title.textContent = "Vault Liquidation";
    fields.innerHTML = `
            <div class="space-y-4">
                <select name="account_id" class="w-full p-4 card font-bold text-xs">
                    ${currentAccounts.map(a => `<option value="${a.id}">${a.account_type} - Available: ${formatINR(a.balance)}</option>`).join('')}
                </select>
                <p class="available-balance" data-balance-for="account_id">Available balance: ${formatINR(currentAccounts[0]?.balance)}</p>
                <input name="amount" type="number" min="1" step="1" inputmode="numeric" placeholder="Volume (₹, whole rupees)" class="w-full p-4 card font-bold" required>
                <input type="password" name="pin" maxlength="4" placeholder="•••• PIN" required 
                       class="w-full p-4 card text-center tracking-[1em] font-mono" style="-webkit-text-security: disc;">
            </div>
        `;
  } else if (type === 'set-pin') {
    title.textContent = "Security Console";
    fields.innerHTML = `
            <div class="space-y-4">
                <p class="text-[10px] font-bold opacity-40 uppercase text-center pb-2">Initialize or Rotate Security PIN</p>
                <input type="password" name="pin" maxlength="4" placeholder="•••• NEW PIN" required 
                       class="w-full p-4 card text-center tracking-[1em] font-mono" style="-webkit-text-security: disc;">
            </div>
        `;
  }
  updateModalAvailableBalance();
}

function closeModal() { document.getElementById('modal-container').classList.add('hidden'); activeModalType = null; }

async function handleFormSubmit(e) {
  e.preventDefault();
  const feedback = document.getElementById('modal-feedback');
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;

  const body = Object.fromEntries(new FormData(e.target).entries());
  const transactionType = activeModalType;
  const amount = Number(body.amount);
  if (['transfer', 'deposit', 'withdraw'].includes(transactionType) && (!Number.isSafeInteger(amount) || amount <= 0)) {
    document.getElementById('modal-feedback').innerHTML = '<p class="text-red-500 font-bold text-[10px] uppercase text-center py-2">Enter a positive whole number of rupees.</p>';
    return;
  }
  if (transactionType === 'transfer' || transactionType === 'withdraw') {
    const accountId = transactionType === 'transfer' ? body.sender_id : body.account_id;
    const account = currentAccounts.find(item => String(item.id) === String(accountId));
    if (account && amount > Number(account.balance)) {
      document.getElementById('modal-feedback').innerHTML = '<p class="text-red-500 font-bold text-[10px] uppercase text-center py-2">Amount exceeds the selected vault’s available balance.</p>';
      return;
    }
  }
  if (body.amount !== undefined) body.amount = amount;
  const affectedAccountIds = getAffectedAccountIds(transactionType, body);

  try {
    // ATOMIC LOCK: Disable button immediately
    submitBtn.disabled = true;
    submitBtn.textContent = "Processing...";
    setAccountLoading(affectedAccountIds, true);

    let endpoint = (transactionType === 'transfer') ? ENDPOINTS.transfer
      : (transactionType === 'withdraw') ? ENDPOINTS.withdraw
        : (transactionType === 'deposit') ? ENDPOINTS.deposit
          : (transactionType === 'set-pin') ? ENDPOINTS.setPin
            : ENDPOINTS.accounts;
    await coreFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });

    const successMsg = (transactionType === 'set-pin') ? "Security Synchronized." : "Operation Confirmed.";
    feedback.innerHTML = `<p class="text-emerald-500 font-bold text-[10px] uppercase text-center py-2">${successMsg}</p>`;

    submitBtn.textContent = successMsg;
    const dashboardSynced = await syncDashboard();
    if (!dashboardSynced) {
      throw new Error("Transaction completed, but the updated vault balance could not be loaded.");
    }
    setAccountLoading(affectedAccountIds, false);
    closeModal();

  } catch (err) {
    setAccountLoading(affectedAccountIds, false);
    // RESET LOCK: Re-enable on failure
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;

    let msg = err.message;
    try { const p = JSON.parse(err.message); msg = Object.values(p).flat().join(", "); } catch (e) { }
    feedback.innerHTML = `<p class="text-red-500 font-bold text-[10px] uppercase text-center py-2">${msg}</p>`;
  }
}

function formatINR(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function updateModalAvailableBalance() {
  document.querySelectorAll('[data-balance-for]').forEach(label => {
    const select = document.querySelector(`[name="${label.dataset.balanceFor}"]`);
    const account = currentAccounts.find(item => String(item.id) === String(select?.value));
    label.textContent = account ? `Available balance: ${formatINR(account.balance)}` : '';
    if (select && !select.dataset.balanceListener) {
      select.addEventListener('change', updateModalAvailableBalance);
      select.dataset.balanceListener = 'true';
    }
  });
}

function logout() { localStorage.clear(); window.location.href = "index.html"; }
