const BASE_URL = "http://127.0.0.1:8000/api";

async function loadAccounts() {
  const token = localStorage.getItem("access");
  if (!token) return forceLogout();

  const res = await fetch(`${BASE_URL}/accounts/`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) return forceLogout();

  const data = await res.json();
  const container = document.getElementById("accounts");

  container.innerHTML = data.map(acc => `
  <div onclick="openAccount('${acc.id}')"
    class="bg-gray-800 p-5 rounded-xl shadow-md hover:shadow-lg hover:bg-gray-700 transition
           w-full max-w-sm mx-auto cursor-pointer border border-gray-700">
    
    <div class="flex justify-between items-center mb-2">
      <span class="text-xs uppercase tracking-wider text-gray-400">${acc.account_type}</span>
      <span class="text-green-400 font-semibold">Active</span>
    </div>

    <p class="text-2xl font-bold mb-1">₹ ${acc.balance}</p>

    <p class="text-xs text-gray-500 break-all">
      ${acc.id}
    </p>
  </div>
`).join("");
}

function openAccount(id) {
  window.location.href = `account.html?id=${id}`;
}

function logout() {
  localStorage.clear();
  window.location.href = "index.html";
}

function forceLogout() {
  logout();
}

loadAccounts();

  function openCreateAccount() {
    document.getElementById("createModal").classList.remove("hidden");
  }

  function closeCreateAccount() {
    document.getElementById("createModal").classList.add("hidden");
    document.getElementById("createError").classList.add("hidden");
  }

  async function createAccount() {
    const token = localStorage.getItem("access");
    const type = document.getElementById("accountType").value;
    const error = document.getElementById("createError");

    if (!type) {
      error.innerText = "Select account type";
      error.classList.remove("hidden");
      return;
    }

    const res = await fetch(`${BASE_URL}/accounts/create/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ account_type: type }),
    });

    const data = await res.json();

    if (res.status === 401) {
      localStorage.clear();
      window.location.href = "index.html";
      return;
    }

    if (!res.ok) {
      error.innerText = data.account_type?.[0] || "Could not create account";
      error.classList.remove("hidden");
      return;
    }

    closeCreateAccount();
    loadAccounts(); // refresh UI
  }