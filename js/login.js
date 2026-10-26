// Decorative pulse strip
const pulseBg = document.getElementById("pulse-bg");
for (let i = 0; i < 14; i++) {
  const seg = document.createElement("div");
  seg.className = "seg";
  const dot = document.createElement("div");
  dot.className = "dot";
  const isRetry = Math.random() > 0.85;
  dot.style.background = isRetry ? "var(--amber)" : "var(--green)";
  if (isRetry) dot.classList.add("breathe");
  seg.appendChild(dot);
  if (i < 13) {
    const line = document.createElement("div");
    line.className = "line";
    seg.appendChild(line);
  }
  pulseBg.appendChild(seg);
}

const mrrTicker = document.getElementById("mrr-ticker");
// This is decorative demo data, not live revenue.
mrrTicker.textContent = "DEMO MRR $48,210";

const pwInput = document.getElementById("password");
const pwToggle = document.getElementById("pw-toggle");
pwToggle.addEventListener("click", () => {
  const show = pwInput.type === "password";
  pwInput.type = show ? "text" : "password";
  pwToggle.textContent = show ? "Hide" : "Show";
  pwToggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
});

const form = document.getElementById("login-form");
const submitBtn = document.getElementById("submit-btn");
const message = document.getElementById("login-message");

if (getAuthToken()) {
  window.location.replace("dashboard.html");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";

  if (!form.reportValidity()) return;

  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = pwInput.value;
  if (!email || !password) {
    message.textContent = "Enter your email and password.";
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Verifying';
  submitBtn.classList.remove("failed");

  try {
    const result = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    const token = result.token || result.accessToken;
    const user = result.user;
    if (!token || !user) {
      throw new Error("The server response is missing the login token or user.");
    }

    saveSession(token, user);
    submitBtn.textContent = "✓ Welcome back";
    window.location.href = "dashboard.html";
  } catch (error) {
    submitBtn.classList.add("failed");
    message.textContent = error.message || "Couldn't sign in. Check your details.";
    submitBtn.textContent = "Sign in →";
    submitBtn.disabled = false;
  }
});
