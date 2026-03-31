const API_TRANS = "http://localhost:8000/api/v1/accounts/transactions/";
const urlParams = new URLSearchParams(window.location.search);
const accountId = urlParams.get('id');

document.addEventListener('DOMContentLoaded', async () => {
  const historyEl = document.getElementById('history-list');
  const access = localStorage.getItem('access');
  const senderSelect = document.getElementById('sender_id');

  if (!access) {
    window.location.href = "index.html";
    return;
  }

  if (!accountId) {
    window.location.href = "dashboard.html";
    return;
  }

  if (senderSelect) senderSelect.value = `ID: ...${accountId.slice(-8)}`;

  try {
    const response = await fetch(`${API_TRANS}history/`, {
      headers: { 'Authorization': `Bearer ${access}` }
    });

    if (response.status === 401) {
      localStorage.clear();
      window.location.href = "index.html";
      return;
    }

    const allTransactions = await response.json();
    const transactions = allTransactions.filter(tx => tx.sender_account === accountId || tx.receiver_account === accountId);

    historyEl.innerHTML = '';

    if (transactions.length === 0) {
      historyEl.innerHTML = '<div class="card p-10 text-center w-full border-dashed border-2 flex flex-col items-center justify-center space-y-4"><p class="text-slate-400 font-bold uppercase tracking-widest text-xs">No transaction history found for this vault.</p></div>';
      return;
    }

    transactions.forEach(tx => {
      const isOutgoing = tx.sender_account === accountId;
      const row = document.createElement('div');
      row.className = "card bg-white flex justify-between items-center p-4 rounded-xl border border-slate-100 hover:border-slate-300 transition-all shadow-sm";

      row.innerHTML = `
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-lg ${isOutgoing ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'} flex items-center justify-center font-bold">
                        ${isOutgoing ? '↓' : '↑'}
                    </div>
                    <div>
                        <div class="text-sm font-bold text-slate-800 capitalize leading-none mb-1">${tx.transaction_type}</div>
                        <div class="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">${new Date(tx.created_at).toLocaleString()}</div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="${isOutgoing ? 'text-red-600' : 'text-emerald-600'} font-bold text-base font-mono">
                        ${isOutgoing ? '-' : '+'}₹${parseFloat(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                    <div class="text-[10px] text-slate-400 font-medium">${tx.description || 'Verified System Tx'}</div>
                </div>
            `;
      historyEl.appendChild(row);
    });

  } catch (err) {
    historyEl.innerHTML = '<div class="card p-10 text-center w-full border-red-100 bg-red-50"><p class="text-red-600 font-bold uppercase tracking-widest text-xs">Synchronization Failure: Connection refused.</p></div>';
  }
});

async function initiateTransfer() {
  const access = localStorage.getItem('access');
  const receiver = document.getElementById('receiver_id').value;
  const amount = document.getElementById('amount').value;
  const desc = document.getElementById('description').value;
  const btn = document.getElementById('transfer-btn');
  const feedback = document.getElementById('transfer-feedback');

  if (!receiver || !amount) {
    feedback.innerHTML = '<p class="text-red-600 text-sm font-semibold py-2">Incomplete transfer data.</p>';
    return;
  }

  btn.disabled = true;
  btn.textContent = "Processing Core Transaction...";
  feedback.innerHTML = '<p class="text-blue-600 text-sm font-semibold py-2 animate-pulse">Syncing with atomic ledger...</p>';

  try {
    const response = await fetch(`${API_TRANS}transfer/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${access}`
      },
      body: JSON.stringify({
        sender_id: accountId,
        receiver_id: receiver,
        amount: amount,
        description: desc
      })
    });

    const data = await response.json();

    if (response.ok) {
      feedback.innerHTML = '<p class="text-emerald-600 text-sm font-semibold py-2">Transfer Successful. Account Updated.</p>';
      setTimeout(() => window.location.reload(), 1500);
    } else {
      btn.disabled = false;
      btn.textContent = "Execute Transfer";
      feedback.innerHTML = `<p class="text-red-600 text-sm font-semibold py-2">Error: ${data.error || 'Transaction denied.'}</p>`;
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Execute Transfer";
    feedback.innerHTML = '<p class="text-red-600 text-sm font-semibold py-2 text-center">System Engine unreachable.</p>';
  }
}