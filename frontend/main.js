const API_BASE = "http://localhost:8000/api/v1/accounts";

// Global function to show messages
function showMessage(msg, isError = false) {
  const errorEl = document.getElementById('error');
  if (!errorEl) return;
  errorEl.textContent = msg;
  errorEl.className = isError ? "text-red-400 text-sm italic py-2" : "text-green-400 text-sm italic py-2";
  errorEl.classList.remove('hidden');
}

async function login() {
  const user = document.getElementById('username').value;
  const pass = document.getElementById('password').value;
  const btn = document.querySelector('button');

  if (!user || !pass) {
    showMessage("Please fill all fields", true);
    return;
  }

  btn.disabled = true;
  btn.textContent = "Authenticating...";

  try {
    const response = await fetch(`${API_BASE}/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass })
    });

    const data = await response.json();

    if (response.ok) {
      localStorage.setItem('access', data.access);
      localStorage.setItem('refresh', data.refresh);
      window.location.href = "dashboard.html";
    } else {
      showMessage(data.detail || "Login failed. Please check credentials.", true);
    }
  } catch (err) {
    showMessage("Connection error. Is the backend running?", true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign In Securely";
  }
}

// Redirect if already logged in
if (localStorage.getItem('access') && window.location.pathname.endsWith('index.html')) {
  window.location.href = "dashboard.html";
}
