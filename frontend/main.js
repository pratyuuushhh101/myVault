const BASE_URL = "http://127.0.0.1:8000/api";

async function login() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const error = document.getElementById("error");

  const res = await fetch(`${BASE_URL}/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    error.innerText = "Invalid credentials";
    error.classList.remove("hidden");
    return;
  }

  localStorage.setItem("access", data.access);
  localStorage.setItem("refresh", data.refresh);

  window.location.href = "dashboard.html";
}
