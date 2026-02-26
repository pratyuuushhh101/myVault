const BASE_URL = "http://127.0.0.1:8000/api";
const params = new URLSearchParams(window.location.search);
const accountId = params.get("id");

document.getElementById("accountId").innerText = accountId;

async function loadBalance() {
  const token = localStorage.getItem("access");
  if (!token) return forceLogout();

  const res = await fetch(`${BASE_URL}/accounts/${accountId}/balance/`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) return forceLogout();

  const data = await res.json();
  document.getElementById("balance").innerText = `Balance: ₹ ${data.balance}`;
}

async function action(payload) {
  const token = localStorage.getItem("access");
  if (!token) return forceLogout();

  const res = await fetch(`${BASE_URL}/transactions/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    document.getElementById("error").innerText = data.error || "Transaction failed";
    document.getElementById("success").innerText = "";
    return;
  }

  document.getElementById("error").innerText = "";
  document.getElementById("success").innerText = "Transaction successful";
  loadBalance();
}

function deposit() {
  const amount = document.getElementById("amount").value;
  action({ transaction_type: "DEPOSIT", amount, receiver_id: accountId });
}

function withdraw() {
  const amount = document.getElementById("amount").value;
  action({ transaction_type: "WITHDRAWAL", amount, sender_id: accountId });
}

function transfer() {
  const amount = document.getElementById("amount").value;
  const receiver = document.getElementById("receiver").value;
  action({
    transaction_type: "TRANSFER",
    amount,
    sender_id: accountId,
    receiver_id: receiver,
  });
}

function goBack() {
  window.location.href = "dashboard.html";
}

function forceLogout() {
  localStorage.clear();
  window.location.href = "index.html";
}

loadBalance();