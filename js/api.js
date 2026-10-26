
const API_BASE_URL = "http://localhost:5000/api";

function getAuthToken() {
    return localStorage.getItem("ledger_token");
}

function getSavedUser() {
    try {
        return JSON.parse(localStorage.getItem("ledger_user") || "null");
    } catch {
        return null;
    }
}

function saveSession(token, user) {
    localStorage.setItem("ledger_token", token);
    localStorage.setItem("ledger_user", JSON.stringify(user));
}

function clearSession() {
    localStorage.removeItem("ledger_token");
    localStorage.removeItem("ledger_user");
}

function logout() {
    clearSession();
    window.location.replace("login.html");
}

function requireAuth() {
    if (!getAuthToken()) {
        window.location.replace("login.html");
        return false;
    }

    return true;
}

async function apiRequest(path, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    const token = getAuthToken();

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    let response;

    try {
        response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            headers
        });
    } catch {
        throw new Error(
            "Can't reach the Ledger server. Start the backend and try again."
        );
    }

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
        ? await response.json().catch(() => ({}))
        : {};

    if (!response.ok) {
        const isAuthRequest =
            path === "/auth/login" ||
            path === "/auth/register";

        if (response.status === 401 && !isAuthRequest && token) {
            clearSession();
            window.location.replace("login.html");
        }

        throw new Error(
            payload.message ||
            payload.error ||
            `Request failed (${response.status}).`
        );
    }

    return payload;
}
