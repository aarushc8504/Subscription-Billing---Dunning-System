const nameInput = document.getElementById("name");
const emailInput = document.getElementById("email");
const phoneInput = document.getElementById("phone");
const displayName = document.getElementById("display-name");
const displayEmail = document.getElementById("display-email");
const avatarBig = document.getElementById("avatar-big");
const form = document.getElementById("profile-form");
const saveStatus = document.getElementById("save-status");
const saveButton = document.getElementById("save-btn");

function updateAvatarInitial() {
  avatarBig.textContent = nameInput.value.trim().charAt(0).toUpperCase() || "?";
}
function renderProfile(user) {
  if (!user) return;
  nameInput.value = user.name || "";
  emailInput.value = user.email || "";
  phoneInput.value = user.phone || "";
  displayName.textContent = user.name || "Account";
  displayEmail.textContent = user.email || "";
  updateAvatarInitial();
}
function setStatus(text, isError = false) {
  saveStatus.textContent = text;
  saveStatus.style.color = isError ? "var(--red)" : "var(--green)";
  saveStatus.classList.add("show");
}

async function loadProfile() {
  if (!requireAuth()) return;
  try {
    const result = await apiRequest("/profile");
    const user = result.user || result;
    renderProfile(user);
    localStorage.setItem("ledger_user", JSON.stringify(user));
  } catch (error) {
    // Display cached account details if available, but do not claim they were freshly loaded.
    const cachedUser = getSavedUser();
    if (cachedUser) renderProfile(cachedUser);
    setStatus(error.message, true);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveStatus.textContent = "";
  if (!form.reportValidity()) return;
  const profile = {
    name: nameInput.value.trim(),
    email: emailInput.value.trim().toLowerCase(),
    phone: phoneInput.value.trim(),
  };
  if (profile.name.length < 2) { setStatus("Name must contain at least 2 characters.", true); return; }
  if (!profile.email) { setStatus("Enter a valid email address.", true); return; }

  saveButton.disabled = true;
  saveButton.textContent = "Saving…";
  try {
    const result = await apiRequest("/profile", { method: "PATCH", body: JSON.stringify(profile) });
    const user = result.user || result;
    renderProfile({ ...profile, ...user });
    localStorage.setItem("ledger_user", JSON.stringify({ ...profile, ...user }));
    setStatus("Saved ✓");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save changes";
  }
});

nameInput.addEventListener("input", updateAvatarInitial);
document.getElementById("logout-link")?.addEventListener("click", (event) => { event.preventDefault(); logout(); });
loadProfile();
