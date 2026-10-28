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
            <p class="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">Global Liquid Balance</p>
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
             <button onclick="openModal('deposit');" class="w-full btn-ui font-bold py-5 rounded-xl text-xs uppercase tracking-widest hover:opacity-80 transition active:scale-[0.98]">Add Funds</button>
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
