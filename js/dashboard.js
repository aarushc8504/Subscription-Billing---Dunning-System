
const ICONS = {
  play: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#0B1210" stroke-width="2"><path d="M6 4l14 8-14 8V4z" fill="#0B1210"/></svg>`,
  film: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#0B1210" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4"/></svg>`,
  tv: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#0B1210" stroke-width="2"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M8 21h8M12 19v2M7 3l5 3 5-3"/></svg>`,
  clapper: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#0B1210" stroke-width="2"><path d="M3 8l16-3 1 5-16 3z"/><rect x="3" y="10" width="18" height="10" rx="1"/></svg>`,
  star: `<svg viewBox="0 0 24 24" width="18" height="18" fill="#0B1210" stroke="none"><path d="M12 2l2.9 6.3 6.9.7-5.1 4.7 1.5 6.8L12 17l-6.2 3.5 1.5-6.8L2.2 9l6.9-.7z"/></svg>`
};

const ICON_KEYS = Object.keys(ICONS);
const grid = document.getElementById("sub-grid");
const totalEl = document.getElementById("total");
const detailPanel = document.getElementById("detail-panel");
const summaryEl = document.getElementById("subscription-summary");

let subscriptions = [];
let selectedId = null;
let availablePlans = [];
let changingPlan = false;

const statusLabel = status => ({
  active: "Active",
  trialing: "Trialing",
  past_due: "Past due",
  canceled: "Canceled"
}[status] || status || "Unknown");

const money = value =>
  "₹" + (Number(value || 0) / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 2
  });

function formatDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function normalizeSubscription(item) {
  const rawPrice =
    item.priceInPaise ??
    item.plan?.priceInPaise ??
    item.price ??
    item.plan?.price ??
    0;

  const priceInPaise = Number(rawPrice);

  return {
    id: item._id || item.id,
    name: item.name || item.plan?.name || "Subscription",
    plan: item.planName || item.plan?.name || item.plan || "Standard",
    priceInPaise: Number.isFinite(priceInPaise) ? priceInPaise : 0,
    color: item.color || "#3FA66E",
    icon: item.icon || "play",
    status: item.status || "active",
    nextBillingDate:
      item.nextBillingDate ||
      item.nextBillingAt ||
      item.currentPeriodEnd ||
      null,
    currentPeriodStart: item.currentPeriodStart || null,
    billingHistory: Array.isArray(item.billingHistory)
      ? item.billingHistory
      : []
  };
}

function showMessage(text, isError = false) {
  let box = document.getElementById("api-status");

  if (!box) {
    box = document.createElement("p");
    box.id = "api-status";
    box.style.cssText =
      "margin:0 0 18px;padding:12px;border:1px solid rgba(240,237,228,.14);font-size:13px;color:var(--slate);border-radius:4px";

    document.querySelector(".head-row")?.after(box);
  }

  if (!box) return;

  box.textContent = text;
  box.style.color = isError ? "var(--red)" : "var(--slate)";
  box.hidden = !text;
}

function updateSubscriptionSummary() {
  if (!summaryEl) return;

  const activeCount = subscriptions.filter(
    sub => sub.status === "active"
  ).length;

  const trialingCount = subscriptions.filter(
    sub => sub.status === "trialing"
  ).length;

  const upcomingDates = subscriptions
    .filter(
      sub =>
        (sub.status === "active" || sub.status === "trialing") &&
        sub.nextBillingDate
    )
    .map(sub => new Date(sub.nextBillingDate))
    .filter(date => !Number.isNaN(date.getTime()))
    .sort((a, b) => a - b);

  let summary =
    `${activeCount} active subscription${activeCount === 1 ? "" : "s"}`;

  if (trialingCount > 0) {
    summary += ` · ${trialingCount} trialing`;
  }

  if (upcomingDates.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const nextCharge = new Date(upcomingDates[0]);
    nextCharge.setHours(0, 0, 0, 0);

    const daysUntil = Math.round(
      (nextCharge.getTime() - today.getTime()) / 86400000
    );

    if (daysUntil < 0) {
      summary += " · next billing date overdue";
    } else if (daysUntil === 0) {
      summary += " · next charge today";
    } else if (daysUntil === 1) {
      summary += " · next charge tomorrow";
    } else {
      summary += ` · next charge in ${daysUntil} days`;
    }
  } else {
    summary += " · no upcoming billing date";
  }

  summaryEl.textContent = summary;
}

function renderGrid() {
  if (!grid || !totalEl) return;

  grid.innerHTML = "";
  let total = 0;

  subscriptions.forEach(sub => {
    if (sub.status === "active" || sub.status === "trialing") {
      total += sub.priceInPaise;
    }

    const card = document.createElement("div");

    card.className =
      "sub-card" +
      (String(sub.id) === String(selectedId) ? " selected" : "");

    card.dataset.id = sub.id;

    card.innerHTML = `
      <div class="sub-top">
        <div class="sub-icon" style="background:${sub.color}">
          ${ICONS[sub.icon] || ICONS[ICON_KEYS[0]]}
        </div>
        <div>
          <div class="sub-name"></div>
          <div class="sub-plan"></div>
        </div>
      </div>
      <div class="sub-bottom">
        <span class="sub-price mono"></span>
        <span class="status-pill status-${sub.status}">
          ${statusLabel(sub.status)}
        </span>
      </div>
      <div class="sub-mini-strip"></div>
    `;

    card.querySelector(".sub-name").textContent = sub.name;
    card.querySelector(".sub-plan").textContent = sub.plan;
    card.querySelector(".sub-price").textContent =
      `${money(sub.priceInPaise)}/mo`;

    const strip = card.querySelector(".sub-mini-strip");

    for (let i = 0; i < 6; i++) {
      const dot = document.createElement("div");
      dot.className = "mdot";

      dot.style.background =
        sub.status === "past_due" && i === 5
          ? "#E8A33D"
          : sub.status === "canceled" && i >= 4
            ? "#C0432F"
            : "#3FA66E";

      strip.appendChild(dot);
    }

    card.addEventListener("click", () => selectSub(sub.id));
    grid.appendChild(card);
  });

  totalEl.textContent = money(total);
}

/* Fetch and render real invoice history from the backend. */
async function renderHistory(sub) {
  const strip = detailPanel.querySelector("#history-strip");
  const labels = detailPanel.querySelector("#history-labels");
  const historyContainer = detailPanel.querySelector("#invoice-history");

  if (strip) strip.hidden = true;
  if (labels) labels.hidden = true;
  if (!historyContainer) return;

  historyContainer.innerHTML =
    '<p style="color:var(--slate);font-size:13px">Loading invoice history…</p>';

  try {
    const result = await apiRequest(
      `/invoices/subscription/${encodeURIComponent(sub.id)}/history`
    );

    const invoices = Array.isArray(result?.invoices)
      ? result.invoices
      : [];

    historyContainer.innerHTML = "";

    if (!invoices.length) {
      historyContainer.innerHTML =
        '<p style="color:var(--slate);font-size:13px">No invoices have been recorded for this subscription yet.</p>';
      return;
    }

    const heading = document.createElement("p");
    heading.style.cssText =
      "margin:0 0 12px;color:var(--slate);font-size:12px";
    heading.textContent =
      `${invoices.length} invoice${invoices.length === 1 ? "" : "s"} recorded`;

    historyContainer.appendChild(heading);

    invoices.forEach(invoice => {
      const card = document.createElement("div");

      card.style.cssText =
        "display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:start;padding:14px;margin-bottom:10px;border:1px solid rgba(240,237,228,.12);border-radius:6px";

      const details = document.createElement("div");
      const title = document.createElement("div");

      title.style.cssText = "font-weight:600;margin-bottom:6px";
      title.textContent = invoice.description || `${sub.name} invoice`;
      details.appendChild(title);

      const periodStart = formatDate(invoice.billingPeriodStart);
      const periodEnd = formatDate(invoice.billingPeriodEnd);
      const dueDate = formatDate(invoice.dueDate);
      const paidAt = formatDate(invoice.paidAt);
      const failedAt = formatDate(invoice.firstFailedAt);
      const nextRetry = formatDate(invoice.nextRetryAt);

      const meta = document.createElement("div");
      meta.style.cssText =
        "font-size:12px;line-height:1.7;color:var(--slate)";

      const metaLines = [];

      if (periodStart || periodEnd) {
        metaLines.push(
          `Billing period: ${periodStart || "—"} – ${periodEnd || "—"}`
        );
      }

      if (dueDate) metaLines.push(`Due: ${dueDate}`);
      if (paidAt) metaLines.push(`Paid: ${paidAt}`);
      if (failedAt) metaLines.push(`First failed: ${failedAt}`);

      if (Number(invoice.retryCount) > 0) {
        metaLines.push(`Payment retries: ${invoice.retryCount}`);
      }

      if (invoice.dunningStatus && invoice.dunningStatus !== "not_started") {
        metaLines.push(
          `Dunning: ${invoice.dunningStatus.replace(/_/g, " ")}`
        );
      }

      if (nextRetry) metaLines.push(`Next retry: ${nextRetry}`);

      meta.textContent = metaLines.join(" · ") ||
        "Billing dates not available";

      details.appendChild(meta);

      const side = document.createElement("div");
      side.style.cssText = "text-align:right;white-space:nowrap";

      const amount = document.createElement("div");
      amount.style.cssText = "font-weight:600;margin-bottom:7px";
      amount.textContent = money(invoice.amountInPaise);

      const status = document.createElement("span");
      status.style.cssText =
        "display:inline-block;padding:4px 7px;border-radius:4px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;background:rgba(240,237,228,.07);color:var(--slate)";

      status.textContent = String(invoice.status || "unknown")
        .replace(/_/g, " ");

      if (invoice.status === "paid") {
        status.style.color = "var(--green)";
      } else if (
        invoice.status === "past_due" ||
        invoice.status === "open"
      ) {
        status.style.color = "var(--amber)";
      } else if (invoice.status === "void") {
        status.style.color = "var(--red)";
      }

      side.append(amount, status);
      card.append(details, side);
      historyContainer.appendChild(card);
    });
  } catch (error) {
    historyContainer.innerHTML = "";

    const message = document.createElement("p");
    message.style.cssText = "color:var(--red);font-size:13px";
    message.textContent =
      error.message || "Could not load invoice history.";

    historyContainer.appendChild(message);
  }
}

function renderSubscriptionDetails(sub) {
  const formattedDate = formatDate(sub.nextBillingDate);

  let billingDateText;
  let billingDateNote;

  if (sub.status === "canceled") {
    billingDateText = "Subscription canceled";
    billingDateNote =
      "No future billing is expected for this subscription.";
  } else if (sub.status === "past_due" && !formattedDate) {
    billingDateText = "Awaiting payment recovery";
    billingDateNote =
      "No billing date is stored. Check the outstanding invoice and dunning retry schedule.";
  } else if (sub.status === "past_due") {
    billingDateText = formattedDate;
    billingDateNote =
      "Payment is past due. Check the outstanding invoice and retry schedule.";
  } else if (!formattedDate) {
    billingDateText = "Not provided by backend";
    billingDateNote =
      "The subscription API has not supplied a valid billing date.";
  } else {
    billingDateText = formattedDate;
    billingDateNote = "Next scheduled billing date from the backend.";
  }

  detailPanel.innerHTML = `
    <div class="detail-head">
      <h3 id="detail-title"></h3>
      <div class="detail-actions">
        <button class="btn-small" id="upgrade-btn" type="button">
          Change plan
        </button>
        <button class="btn-small danger" id="cancel-btn" type="button">
          Cancel
        </button>
      </div>
    </div>

    <div style="
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
      gap:12px;
      margin:22px 0;
    ">
      <div style="padding:16px;border:1px solid rgba(240,237,228,.12);border-radius:6px">
        <div style="font-size:12px;color:var(--slate);margin-bottom:8px">
          Payment status
        </div>
        <div id="billing-status" style="font-weight:600"></div>
      </div>

      <div style="padding:16px;border:1px solid rgba(240,237,228,.12);border-radius:6px">
        <div style="font-size:12px;color:var(--slate);margin-bottom:8px">
          Monthly price
        </div>
        <div id="billing-price" style="font-weight:600"></div>
      </div>

      <div style="padding:16px;border:1px solid rgba(240,237,228,.12);border-radius:6px">
        <div style="font-size:12px;color:var(--slate);margin-bottom:8px">
          Next billing date
        </div>
        <div id="billing-date" style="font-weight:600"></div>
        <div id="billing-date-note" style="font-size:11px;color:var(--slate);margin-top:6px"></div>
      </div>
    </div>

    <h4 style="margin:24px 0 14px">Billing history</h4>

    <div class="history-strip" id="history-strip" hidden></div>
    <div class="history-labels" id="history-labels" hidden></div>

    <div id="invoice-history" aria-live="polite">
      <p style="color:var(--slate);font-size:13px">Loading invoice history…</p>
    </div>
  `;

  detailPanel.querySelector("#detail-title").textContent =
    `${sub.name} · ${sub.plan}`;

  const statusElement = detailPanel.querySelector("#billing-status");
  statusElement.textContent = statusLabel(sub.status);

  statusElement.style.color =
    sub.status === "active" || sub.status === "trialing"
      ? "var(--green)"
      : sub.status === "past_due"
        ? "var(--amber)"
        : sub.status === "canceled"
          ? "var(--red)"
          : "var(--slate)";

  detailPanel.querySelector("#billing-price").textContent =
    `${money(sub.priceInPaise)}/month`;

  detailPanel.querySelector("#billing-date").textContent = billingDateText;
  detailPanel.querySelector("#billing-date-note").textContent =
    billingDateNote;

  renderHistory(sub);

  const cancelButton = detailPanel.querySelector("#cancel-btn");

  if (sub.status === "canceled") {
    cancelButton.disabled = true;
    cancelButton.textContent = "Canceled";
  }

  cancelButton.addEventListener("click", async () => {
    if (sub.status === "canceled") return;

    if (!window.confirm(`Cancel your ${sub.name} subscription?`)) return;

    cancelButton.disabled = true;
    cancelButton.textContent = "Canceling…";

    try {
      await apiRequest(
        `/subscriptions/${encodeURIComponent(sub.id)}/cancel`,
        {
          method: "PATCH",
          body: JSON.stringify({})
        }
      );

      showMessage("Subscription canceled.");
      await loadSubscriptions();
    } catch (error) {
      showMessage(error.message || "Could not cancel subscription.", true);
      cancelButton.disabled = false;
      cancelButton.textContent = "Cancel";
    }
  });

  const changeButton = detailPanel.querySelector("#upgrade-btn");

  if (sub.status === "canceled" || sub.status === "past_due") {
    changeButton.disabled = true;
    changeButton.title =
      sub.status === "canceled"
        ? "Canceled subscriptions cannot be changed."
        : "Resolve the outstanding payment before changing plans.";
  }

  changeButton.addEventListener("click", () => {
    openPlanChange(sub, changeButton);
  });
}

function selectSub(id) {
  const sub = subscriptions.find(
    item => String(item.id) === String(id)
  );

  if (!sub || !detailPanel) return;

  selectedId = sub.id;
  renderGrid();
  renderSubscriptionDetails(sub);
}

function normalizePlan(item) {
  const name =
    item.planName ||
    item.name ||
    item.label ||
    item.title;

  const rawPrice =
    item.priceInPaise ??
    item.newPriceInPaise ??
    item.price ??
    item.amountInPaise;

  if (!name || rawPrice === undefined || rawPrice === null) {
    return null;
  }

  const priceInPaise = Number(rawPrice);

  if (!Number.isFinite(priceInPaise) || priceInPaise < 0) {
    return null;
  }

  return {
    name: String(name),
    priceInPaise
  };
}

function extractPlans(result) {
  if (Array.isArray(result)) return result;

  return [
    result?.plans,
    result?.availablePlans,
    result?.data?.plans,
    result?.data?.availablePlans
  ].find(Array.isArray) || [];
}

async function openPlanChange(sub, button) {
  if (!sub || changingPlan) return;

  if (sub.status === "canceled" || sub.status === "past_due") {
    showMessage(
      sub.status === "canceled"
        ? "You cannot change the plan of a canceled subscription."
        : "Resolve the outstanding payment before changing plans.",
      true
    );
    return;
  }

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Loading plans…";

  try {
    const result = await apiRequest(
      `/subscriptions/${encodeURIComponent(sub.id)}/plans`
    );

    availablePlans = extractPlans(result)
      .map(normalizePlan)
      .filter(Boolean);

    if (!availablePlans.length) {
      throw new Error("No usable plans were returned by the API.");
    }

    showPlanSelector(sub);
  } catch (error) {
    showMessage(error.message || "Could not load plans.", true);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function showPlanSelector(sub) {
  detailPanel.querySelector("#plan-change-box")?.remove();

  const box = document.createElement("div");
  box.id = "plan-change-box";
  box.style.cssText =
    "margin-top:22px;padding:20px;border:1px solid rgba(240,237,228,.18);border-radius:8px";

  box.innerHTML = `
    <h3 style="margin:0 0 8px">Change subscription plan</h3>
    <p id="current-plan-label" style="margin:0 0 16px;font-size:13px;color:var(--slate)"></p>

    <label for="new-plan-select" style="display:block;margin-bottom:8px;font-size:13px">
      Select a new plan
    </label>

    <select id="new-plan-select" style="width:100%;padding:12px;margin-bottom:14px">
      <option value="">Choose a plan</option>
    </select>

    <p id="plan-change-preview" style="font-size:13px;color:var(--slate);margin:0 0 16px">
      Select a plan to view its monthly price.
    </p>

    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn-small" id="confirm-plan-change" type="button" disabled>
        Confirm change
      </button>
      <button class="btn-small" id="close-plan-change" type="button">
        Close
      </button>
    </div>
  `;

  detailPanel.appendChild(box);

  box.querySelector("#current-plan-label").textContent =
    `Current plan: ${sub.plan} · ${money(sub.priceInPaise)}/mo`;

  const select = box.querySelector("#new-plan-select");
  const preview = box.querySelector("#plan-change-preview");
  const confirmButton = box.querySelector("#confirm-plan-change");

  availablePlans.forEach((plan, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${plan.name} — ${money(plan.priceInPaise)}/mo`;

    if (
      plan.name.toLowerCase() === sub.plan.toLowerCase() &&
      plan.priceInPaise === sub.priceInPaise
    ) {
      option.disabled = true;
    }

    select.appendChild(option);
  });

  select.addEventListener("change", () => {
    const plan = availablePlans[Number(select.value)];

    if (!select.value || !plan) {
      preview.textContent = "Select a plan to view its monthly price.";
      confirmButton.disabled = true;
      return;
    }

    const difference = plan.priceInPaise - sub.priceInPaise;

    if (difference > 0) {
      preview.textContent =
        `New monthly price: ${money(plan.priceInPaise)}. ` +
        `That's ${money(difference)} more per month. Proration is calculated by the backend.`;
    } else if (difference < 0) {
      preview.textContent =
        `New monthly price: ${money(plan.priceInPaise)}. ` +
        `That's ${money(Math.abs(difference))} less per month. Any credit is calculated by the backend.`;
    } else {
      preview.textContent =
        `The monthly price remains ${money(plan.priceInPaise)}.`;
    }

    confirmButton.disabled = false;
  });

  confirmButton.addEventListener("click", async () => {
    const plan = availablePlans[Number(select.value)];

    if (!select.value || !plan || changingPlan) return;

    if (!window.confirm(
      `Change ${sub.name} from ${sub.plan} to ${plan.name}?`
    )) return;

    changingPlan = true;
    confirmButton.disabled = true;
    select.disabled = true;
    confirmButton.textContent = "Updating…";

    try {
      const result = await apiRequest(
        `/subscriptions/${encodeURIComponent(sub.id)}/change-plan`,
        {
          method: "POST",
          body: JSON.stringify({
            planName: plan.name,
            newPlanName: plan.name,
            plan: plan.name,
            priceInPaise: plan.priceInPaise,
            newPriceInPaise: plan.priceInPaise
          })
        }
      );

      showMessage(result?.message || `Plan changed to ${plan.name}.`);
      await loadSubscriptions();
    } catch (error) {
      showMessage(error.message || "Could not change the plan.", true);
      confirmButton.disabled = false;
      select.disabled = false;
      confirmButton.textContent = "Confirm change";
    } finally {
      changingPlan = false;
    }
  });

  box.querySelector("#close-plan-change").addEventListener("click", () => {
    box.remove();
  });

  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function loadSubscriptions() {
  if (!requireAuth()) return;

  try {
    const result = await apiRequest("/subscriptions");

    const items = Array.isArray(result)
      ? result
      : result.subscriptions || result.data?.subscriptions;

    if (!Array.isArray(items)) {
      throw new Error("The API response did not contain subscriptions.");
    }

    subscriptions = items
      .map(normalizeSubscription)
      .filter(item => item.id);

    renderGrid();
    updateSubscriptionSummary();

    if (subscriptions.length > 0) {
      const selected = subscriptions.find(
        item => String(item.id) === String(selectedId)
      ) || subscriptions[0];

      selectSub(selected.id);
      showMessage("Subscriptions loaded from the Ledger API.");
    } else {
      selectedId = null;
      detailPanel.innerHTML =
        '<div class="detail-empty">No subscriptions to display yet.</div>';

      showMessage("No subscriptions found for this account.");
    }
  } catch (error) {
    showMessage(error.message || "Could not load subscriptions.", true);

    if (grid) grid.innerHTML = "";
    if (totalEl) totalEl.textContent = "—";

    if (summaryEl) {
      summaryEl.textContent = "Unable to load subscription summary.";
    }

    if (detailPanel) {
      detailPanel.innerHTML =
        '<div class="detail-empty">Subscription data is unavailable until the backend is running.</div>';
    }
  }
}

function setupLogout() {
  document.querySelectorAll(
    "#logout-link, a[href='index.html']"
  ).forEach(link => {
    if (link.dataset.logoutBound === "true") return;

    link.dataset.logoutBound = "true";

    link.addEventListener("click", event => {
      event.preventDefault();
      logout();
    });
  });
}

const savedUser = getSavedUser();
const avatar = document.getElementById("nav-avatar");

if (avatar && savedUser?.name) {
  avatar.textContent =
    savedUser.name.trim().charAt(0).toUpperCase() || "?";
}

setupLogout();
loadSubscriptions();
