/**
 * MyVault | Authentication Console Logic (v2.7)
 * Implements high-fidelity registration and login logic with field validation.
 */

const API_BASE = "http://127.0.0.1:8000/api/v1/accounts/";
const ENDPOINTS = {
    login: `${API_BASE}login/`,
    register: `${API_BASE}register/`,
};

// Default to 'signup' as per the user's provided component design
let currentMode = "signup";

document.addEventListener('DOMContentLoaded', () => {
    console.log("MyVault Auth Console v2.8 initialized.");
    syncUI();
});

/**
 * 🔄 UI ENGINE - TRANSITION BETWEEN MODES
 */
function toggleAuthMode() {
    currentMode = (currentMode === "login") ? "signup" : "login";
    syncUI();
}

function syncUI() {
    const nameRow = document.getElementById("signup-name-row");
    const emailGroup = document.getElementById("email-group");
    const confirmGroup = document.getElementById("confirm-password-group");
    const title = document.getElementById("auth-title");
    const subtitle = document.getElementById("auth-subtitle");
    const mainBtn = document.getElementById("auth-submit-btn");
    const toggleBtn = document.getElementById("toggle-btn");
    const toggleText = document.getElementById("toggle-text");
    const feedback = document.getElementById("auth-feedback");

    // Labels & Icons
    const usernameLabel = document.getElementById("username-label");
    const usernameIcon = document.getElementById("username-icon");
    const usernameInput = document.getElementById("username-field");

    feedback.textContent = "";

    if (currentMode === "signup") {
        nameRow.classList.remove("hidden");
        emailGroup.classList.remove("hidden");
        confirmGroup.classList.remove("hidden");

        title.textContent = "Create Account";
        subtitle.textContent = "Enter your information to create a new account";
        mainBtn.textContent = "Create Account";
        toggleBtn.textContent = "Sign In";
        toggleText.textContent = "Already have an account?";

        usernameLabel.textContent = "Vault Username";
        usernameInput.placeholder = "johndoe123";
        usernameIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />`;
    } else {
        nameRow.classList.add("hidden");
        emailGroup.classList.add("hidden");
        confirmGroup.classList.add("hidden");

        title.textContent = "Secure Vault Access";
        subtitle.textContent = "Verify your credentials to synchronize holdings.";
        mainBtn.textContent = "Authenticate Entry";
        toggleBtn.textContent = "Sign Up";
        toggleText.textContent = "No vault portfolio found?";

        usernameLabel.textContent = "Identity Reference";
        usernameInput.placeholder = "Username or Email";
        usernameIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />`;
    }
}

/**
 * 🧠 AUTH ENGINE - DOMAIN LOGIC
 */
async function handleAuth(e) {
    e.preventDefault();
    console.log(`Starting auth handshake: ${currentMode}`);

    const feedback = document.getElementById("auth-feedback");
    const btn = document.getElementById("auth-submit-btn");
    const confirmInput = document.getElementById("confirm-password-field");

    const formData = new FormData(e.target);
    const body = Object.fromEntries(formData.entries());

    // 🛡️ FRONTEND VALIDATION
    if (currentMode === "signup") {
        if (!body.first_name?.trim()) return showFeedback("First name is required.", "error");
        if (!body.last_name?.trim()) return showFeedback("Last name is required.", "error");
        if (!body.email?.trim()) return showFeedback("Email is required for disbursement alerts.", "error");
        if (!body.username?.trim()) return showFeedback("Vault Username is required.", "error");
        if (body.password.length < 8) return showFeedback("Password must be at least 8 characters.", "error");
        if (body.password !== confirmInput.value) return showFeedback("Passwords don't match.", "error");
    }

    try {
        // 🔒 LOCK INTERFACE & EMIT INDICATOR
        btn.disabled = true;
        btn.classList.add("animate-pulse", "opacity-70");
        const originalText = btn.textContent;
        btn.textContent = "Digitizing Credentials...";
        showFeedback("Provisioning Secure Handshake...", "success");

        const url = (currentMode === "login") ? ENDPOINTS.login : ENDPOINTS.register;

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        console.log("Transmission received. Status:", res.status);
        const data = await res.json();

        if (!res.ok) {
            let errorMsg = data.detail || data.error || (data.username ? data.username[0] : "Access Denied by Core.");
            if (typeof data === 'object') {
                const firstErr = Object.values(data)[0];
                if (Array.isArray(firstErr)) errorMsg = firstErr[0];
            }
            throw new Error(errorMsg);
        }

        // 🏆 SUCCESS
        localStorage.access = data.access;
        localStorage.refresh = data.refresh;
        localStorage.user_display = body.username;

        btn.classList.remove("animate-pulse");
        btn.textContent = "Handshake Verified.";
        showFeedback("Identity Synchronized. Redirecting...", "success");

        setTimeout(() => {
            window.location.href = "dashboard.html";
        }, 1000);

    } catch (err) {
        console.error("Auth Handshake Failed:", err);
        showFeedback(err.message, "error");
        btn.textContent = (currentMode === "login") ? "Authenticate Entry" : "Create Account";
        btn.disabled = false;
        btn.classList.remove("animate-pulse", "opacity-70");
    }
}

function showFeedback(msg, type) {
    const feedback = document.getElementById("auth-feedback");
    feedback.textContent = msg;
    feedback.className = `text-[10px] font-extrabold uppercase tracking-widest text-center py-2 fade-in ${type === 'success' ? 'text-emerald-500' : 'text-red-500'}`;
}

// Global Check
if (localStorage.access) {
    // window.location.href = "dashboard.html"; // Disable auto-redirect for testing this UI
}
