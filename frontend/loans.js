/**
 * MyVault | Loan Management System (v1.1)
 */

const API_BASE = "http://localhost:8000/api/v1/accounts/";
const ENDPOINTS = {
    accounts: `${API_BASE}accounts/`,
    loans: `${API_BASE}loans/`,
    createLoan: `${API_BASE}loans/create/`,
    repayLoan: `${API_BASE}loans/repay/`
};

let currentLoans = [];
let currentAccounts = [];
let activeModalType = null;

/**
 * 🛰️ UTILS
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

function formatCurrency(val) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val);
}

/**
 * 🔄 LIFECYCLE
 */
document.addEventListener('DOMContentLoaded', async () => {
    await syncLoans();
    document.getElementById('user-display').textContent = localStorage.user_display || "Authorized User";
});

async function syncLoans() {
    try {
        currentLoans = await coreFetch(ENDPOINTS.loans);
        currentAccounts = await coreFetch(ENDPOINTS.accounts);
        renderLoans();
        renderSummary();
    } catch (err) { console.error("Sync Error:", err); }
}

/**
 * 🏢 RENDERERS
 */
function renderSummary() {
    const grid = document.getElementById('loan-summary-grid');
    const totalDebt = currentLoans.reduce((sum, l) => sum + parseFloat(l.remaining_amount), 0);
    const activeCount = currentLoans.filter(l => l.status === 'ACTIVE').length;
    const totalRepaid = currentLoans.reduce((sum, l) => sum + (parseFloat(l.amount) - parseFloat(l.remaining_amount)), 0);

    grid.innerHTML = `
        <div class="card p-8 border-none bg-blue-600 text-white shadow-xl shadow-blue-600/20 transition-transform hover:scale-[1.02]">
            <p class="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">Total Outstanding</p>
            <h4 class="text-3xl font-extrabold tracking-tighter">₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(totalDebt)}</h4>
        </div>
        <div class="card p-8 border-none bg-white dark:bg-[#0A0A0A] shadow-sm border border-slate-100 dark:border-white/5 transition-transform hover:scale-[1.02]">
            <p class="text-[10px] font-black opacity-40 uppercase tracking-widest mb-1">Active Leverage</p>
            <h4 class="text-3xl font-extrabold tracking-tighter">${activeCount} <span class="text-sm opacity-40 font-medium">Loans</span></h4>
        </div>
        <div class="card p-8 border-none bg-white dark:bg-[#0A0A0A] shadow-sm border border-slate-100 dark:border-white/5 transition-transform hover:scale-[1.02]">
            <p class="text-[10px] font-black opacity-40 uppercase tracking-widest mb-1">Repaid Principal</p>
            <h4 class="text-3xl font-extrabold tracking-tighter text-emerald-600">₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(totalRepaid)}</h4>
        </div>
    `;
}

function renderLoans() {
    const table = document.getElementById('loans-table');
    table.innerHTML = '';

    if (currentLoans.length === 0) {
        table.innerHTML = `<tr><td colspan="6" class="px-6 py-16 text-center opacity-40 italic font-medium">No institutional debt records found. Apply for liquidity below.</td></tr>`;
        return;
    }

    currentLoans.forEach(loan => {
        const statusColor = loan.status === 'ACTIVE' ? 'text-amber-500 bg-amber-500/10' : 'text-emerald-500 bg-emerald-500/10';
        const row = document.createElement('tr');
        row.className = "hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer group";
        row.onclick = (e) => {
            // Only trigger drawer if we didn't click the settling button
            if (!e.target.closest('button')) openLoanDrawer(loan.id);
        };

        row.innerHTML = `
            <td class="px-6 py-6">
                <div class="flex flex-col">
                    <span class="text-xs font-bold opacity-100 text-slate-800 dark:text-slate-100">${loan.id.slice(0, 8)}...</span>
                    <span class="text-[10px] opacity-50 font-bold tracking-wide">Applied on ${new Date(loan.created_at).toLocaleDateString()}</span>
                </div>
            </td>
            <td class="px-6 py-6 font-black text-[10px] tracking-widest text-slate-500 uppercase group-hover:text-blue-600 transition-colors">${loan.loan_type}</td>
            <td class="px-6 py-6 font-bold text-xs text-slate-700 dark:text-slate-200">${formatCurrency(loan.amount)}</td>
            <td class="px-6 py-6 font-black text-xs text-blue-600">${formatCurrency(loan.remaining_amount)}</td>
            <td class="px-6 py-6">
                <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${statusColor}">${loan.status}</span>
            </td>
            <td class="px-6 py-6 text-right">
                ${loan.status === 'ACTIVE' ? `
                    <button onclick="openLoanModal('repay', '${loan.id}')" class="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-md shadow-blue-600/10 active:scale-95 transition-all">Settle Debt</button>
                ` : '<span class="text-[9px] font-black opacity-30 uppercase tracking-widest">Closed</span>'}
            </td>
        `;
        table.appendChild(row);
    });
}

/**
 * 🏢 DRAWER ENGINE
 */
function openLoanDrawer(loanId) {
    const loan = currentLoans.find(l => l.id === loanId);
    if (!loan) return;
    const overlay = document.getElementById('drawer-overlay');
    document.body.classList.add('drawer-left-active');
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('opacity-100'), 10);
    renderLoanDrawerContent(loan);
}

function renderLoanDrawerContent(loan) {
    const content = document.getElementById('drawer-content');

    content.innerHTML = `
        <div class="space-y-4">
             <h3 class="text-4xl font-extrabold tracking-tight">${formatCurrency(loan.remaining_amount)}</h3>
        </div>
        <div class="space-y-6">
            <div class="p-6 rounded-2xl bg-slate-50 dark:bg-white/5 border border-black/5 dark:border-white/5 shadow-sm">
                <p class="text-[10px] font-bold opacity-30 uppercase tracking-widest mb-4">Loan Secure UUID</p>
                <div class="flex items-center justify-between gap-3 bg-white dark:bg-black p-3 rounded-xl border border-black/5 dark:border-white/5">
                    <code class="text-xs font-mono opacity-80 break-all select-all">${loan.id}</code>
                    <button onclick="navigator.clipboard.writeText('${loan.id}'); alert('Loan ID Copied')" class="text-blue-600 font-bold text-[10px] uppercase pl-2">COPY</button>
                </div>
            </div>
            
            <div class="space-y-4">
                <div class="flex justify-between items-center py-4 border-b border-black/5 dark:border-white/5">
                    <span class="text-[10px] font-black opacity-30 uppercase tracking-widest">Type</span>
                    <span class="text-xs font-bold uppercase tracking-widest opacity-80">${loan.loan_type}</span>
                </div>
                <div class="flex justify-between items-center py-4 border-b border-black/5 dark:border-white/5">
                    <span class="text-[10px] font-black opacity-30 uppercase tracking-widest">Principal</span>
                    <span class="text-xs font-bold opacity-80">${formatCurrency(loan.amount)}</span>
                </div>
                <div class="flex justify-between items-center py-4 border-b border-black/5 dark:border-white/5">
                    <span class="text-[10px] font-black opacity-30 uppercase tracking-widest">App Timestamp</span>
                    <span class="text-xs font-bold opacity-80">${new Date(loan.created_at).toLocaleString()}</span>
                </div>
            </div>
        </div>
        <div class="pt-6">
             ${loan.status === 'ACTIVE' ? `
                 <button onclick="closeLoanDrawer(); openLoanModal('repay', '${loan.id}')" class="w-full bg-blue-600 text-white font-bold py-5 rounded-2xl text-[10px] uppercase tracking-widest hover:opacity-90 shadow-xl shadow-blue-600/20 active:scale-[0.98] transition-all">Settle Debt Portfolio</button>
             ` : '<div class="text-center p-4 rounded-xl border-2 border-dashed border-emerald-500/20 text-emerald-500 text-[10px] font-black uppercase tracking-widest">Leverage Cleared</div>'}
        </div>
    `;
}

function closeLoanDrawer() {
    const overlay = document.getElementById('drawer-overlay');
    document.body.classList.remove('drawer-left-active');
    overlay.classList.remove('opacity-100');
    setTimeout(() => { if (!document.body.classList.contains('drawer-left-active')) overlay.classList.add('hidden'); }, 300);
}

/**
 * 🧠 MODAL ENGINE
 */
function openLoanModal(type, loanId = null) {
    activeModalType = type;
    const cont = document.getElementById('loan-modal');
    const fields = document.getElementById('modal-fields');
    const title = document.getElementById('modal-title');
    const feedback = document.getElementById('modal-feedback');
    const submitBtn = document.getElementById('loan-submit-btn');

    feedback.innerHTML = '';
    cont.classList.replace('hidden', 'flex');

    if (type === 'apply') {
        title.textContent = "Provision Loan";
        submitBtn.textContent = "Confirm Obligation";
        fields.innerHTML = `
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2">
                        <label class="text-[10px] font-black opacity-30 uppercase tracking-widest px-1">Disbursement Vault</label>
                        <select name="account_id" class="w-full p-4 bg-slate-50 dark:bg-white/5 rounded-2xl font-bold text-xs outline-none border border-black/5 dark:border-white/5">
                            ${currentAccounts.map(a => `<option value="${a.id}">${a.account_type} (${formatCurrency(a.balance)})</option>`).join('')}
                        </select>
                    </div>
                    <div class="space-y-2">
                        <label class="text-[10px] font-black opacity-30 uppercase tracking-widest px-1">Debt Archetype</label>
                        <select name="loan_type" class="w-full p-4 bg-slate-50 dark:bg-white/5 rounded-2xl font-bold text-xs outline-none border border-black/5 dark:border-white/5">
                            <option value="PERSONAL">PERSONAL</option>
                            <option value="HOME">HOME</option>
                            <option value="EDUCATION">EDUCATION</option>
                        </select>
                    </div>
                </div>
                <div class="space-y-2">
                    <label class="text-[10px] font-black opacity-30 uppercase tracking-widest px-1">Principal Capital (₹)</label>
                    <input name="amount" type="number" step="100" placeholder="Min. 100.00" class="w-full p-5 bg-slate-50 dark:bg-white/5 rounded-2xl font-bold text-sm outline-none border border-black/5 dark:border-white/5" required>
                </div>
                <div class="space-y-2">
                    <label class="text-[10px] font-black opacity-30 uppercase tracking-widest px-1">Security PIN Confirmation</label>
                    <input type="password" name="pin" maxlength="4" placeholder="•••• PIN" required 
                           class="w-full p-5 bg-slate-50 dark:bg-white/5 rounded-2xl text-center tracking-[1em] font-mono border border-black/5 dark:border-white/5" style="-webkit-text-security: disc;">
                </div>
            </div>
        `;
    } else if (type === 'repay') {
        title.textContent = "Settle Debt";
        submitBtn.textContent = "Execute Settlement";
        fields.innerHTML = `
            <div class="space-y-4">
                <input type="hidden" name="loan_id" value="${loanId}">
                <div class="space-y-2">
                    <label class="text-[10px] font-black opacity-30 uppercase tracking-widest px-1">Settlement Source Vault</label>
                    <select name="account_id" class="w-full p-4 bg-slate-50 dark:bg-white/5 rounded-2xl font-bold text-xs outline-none border border-black/5 dark:border-white/5">
                        ${currentAccounts.map(a => `<option value="${a.id}">${a.account_type} (${formatCurrency(a.balance)})</option>`).join('')}
                    </select>
                </div>
                <div class="space-y-2">
                    <label class="text-[10px] font-black opacity-30 uppercase tracking-widest px-1">Settlement Volume (₹)</label>
                    <input name="amount" type="number" step="0.01" placeholder="Repayment Volume" class="w-full p-5 bg-slate-50 dark:bg-white/5 rounded-2xl font-bold text-sm outline-none border border-black/5 dark:border-white/5" required>
                </div>
                <div class="space-y-2">
                    <label class="text-[10px] font-black opacity-30 uppercase tracking-widest px-1">Security PIN Confirmation</label>
                    <input type="password" name="pin" maxlength="4" placeholder="•••• PIN" required 
                           class="w-full p-5 bg-slate-50 dark:bg-white/5 rounded-2xl text-center tracking-[1em] font-mono border border-black/5 dark:border-white/5" style="-webkit-text-security: disc;">
                </div>
            </div>
        `;
    }
}

function closeLoanModal() { document.getElementById('loan-modal').classList.replace('flex', 'hidden'); activeModalType = null; }

/**
 * 🛠️ ERROR PARSER
 */
function parseApiError(err) {
    try {
        const p = JSON.parse(err.message);
        if (p.error) return p.error;
        if (Array.isArray(p)) return p.flat().join(", ");
        if (typeof p === 'object') {
            return Object.values(p).flat().join(", ");
        }
        return err.message;
    } catch (e) {
        // Fallback: Clean up raw string if it failed to parse but has brackets
        let msg = err.message || "Unknown error occurred.";
        msg = msg.replace(/[\[\]']/g, ""); // Strip brackets/quotes from raw backend strings
        return msg;
    }
}

async function handleLoanSubmit(e) {
    e.preventDefault();
    const feedback = document.getElementById('modal-feedback');
    const submitBtn = document.getElementById('loan-submit-btn');
    const originalText = submitBtn.textContent;

    const data = new FormData(e.target);
    const body = Object.fromEntries(data.entries());

    try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="flex items-center justify-center gap-2">
        <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        Synchronizing...
    </span>`;

        let url = activeModalType === 'apply' ? ENDPOINTS.createLoan : ENDPOINTS.repayLoan;
        await coreFetch(url, { method: 'POST', body: JSON.stringify(body) });

        const successMsg = activeModalType === 'apply' ? "Loan Provisioned" : "Settlement Succeeded";
        feedback.innerHTML = `
        <div class="flex items-center justify-center gap-2 p-3 rounded-xl bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-[0.2em] animate-in fade-in zoom-in duration-300">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
            ${successMsg}
        </div>`;
        submitBtn.textContent = "Authorized";

        setTimeout(async () => {
            closeLoanModal();
            await syncLoans();
        }, 1500);

    } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;

        const msg = parseApiError(err);
        feedback.innerHTML = `
        <div class="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 animate-in slide-in-from-bottom-2 duration-300">
            <svg class="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            <div class="flex flex-col">
                <span class="text-[10px] font-black uppercase tracking-widest opacity-60 mb-0.5">Execution Error</span>
                <span class="text-[11px] font-bold leading-tight tracking-tight">${msg}</span>
            </div>
        </div>`;
    }
}

function logout() { localStorage.clear(); window.location.href = "index.html"; }
