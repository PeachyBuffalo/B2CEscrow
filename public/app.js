// State
let currentDeal = null;
let deals = [];

// API Helper
const api = async (path, options = {}) => {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
};

// Toast Notifications
const toast = (message, type = "info") => {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
};

// Navigation
const showView = (viewName) => {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  
  const view = document.getElementById(`view-${viewName}`);
  if (view) view.classList.add("active");
  
  const btn = document.querySelector(`.nav-btn[data-view="${viewName}"]`);
  if (btn) btn.classList.add("active");
};

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

// Format Helpers
const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const formatCurrency = (amount) => {
  if (!amount) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amount);
};

const formatStatus = (status) => {
  return status?.replace(/_/g, " ") || "-";
};

// Load Deals
const loadDeals = async () => {
  try {
    deals = await api("/api/deals");
    renderDealsTable();
  } catch (error) {
    toast(error.message, "error");
  }
};

const renderDealsTable = () => {
  const tbody = document.getElementById("deals-tbody");
  const noDeals = document.getElementById("no-deals");
  const filter = document.getElementById("status-filter").value;
  
  const filtered = filter ? deals.filter(d => d.status === filter) : deals;
  
  if (filtered.length === 0) {
    tbody.innerHTML = "";
    noDeals.classList.remove("hidden");
    return;
  }
  
  noDeals.classList.add("hidden");
  tbody.innerHTML = filtered.map(deal => `
    <tr>
      <td>
        <strong>${deal.property_address || "No address"}</strong>
        <div style="font-size: 12px; color: var(--gray-500);">${deal.id.slice(0, 8)}...</div>
      </td>
      <td><span class="status-badge ${deal.status}">${formatStatus(deal.status)}</span></td>
      <td>${formatCurrency(deal.purchase_price_usd)}</td>
      <td>${deal.emd_amount_btc || "-"}</td>
      <td>${formatDate(deal.deadline_funding)}</td>
      <td>
        <button class="btn-small btn-primary" onclick="openDeal('${deal.id}')">View</button>
      </td>
    </tr>
  `).join("");
};

document.getElementById("status-filter").addEventListener("change", renderDealsTable);
document.getElementById("refresh-deals").addEventListener("click", loadDeals);

// Create Deal
document.getElementById("deal-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData.entries());
    const deal = await api("/api/deals", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    toast("Deal room created successfully", "success");
    e.target.reset();
    await loadDeals();
    openDeal(deal.id);
  } catch (error) {
    toast(error.message, "error");
  }
});

// Open Deal Detail
const openDeal = async (dealId) => {
  try {
    currentDeal = await api(`/api/deals/${dealId}`);
    renderDealDetail();
    showView("deal-detail");
  } catch (error) {
    toast(error.message, "error");
  }
};

window.openDeal = openDeal;

document.getElementById("back-to-deals").addEventListener("click", () => {
  showView("deals");
  loadDeals();
});

// Render Deal Detail
const renderDealDetail = async () => {
  if (!currentDeal) return;
  
  // Header
  document.getElementById("detail-property-address").textContent = currentDeal.property_address || "No address";
  const statusBadge = document.getElementById("detail-status");
  statusBadge.textContent = formatStatus(currentDeal.status);
  statusBadge.className = `status-badge ${currentDeal.status}`;
  
  // Info
  document.getElementById("detail-id").textContent = currentDeal.id;
  document.getElementById("detail-price").textContent = formatCurrency(currentDeal.purchase_price_usd);
  document.getElementById("detail-emd").textContent = currentDeal.emd_amount_btc ? `${currentDeal.emd_amount_btc} BTC` : "-";
  document.getElementById("detail-funding-deadline").textContent = formatDate(currentDeal.deadline_funding);
  document.getElementById("detail-close-deadline").textContent = formatDate(currentDeal.deadline_close);
  document.getElementById("detail-created").textContent = formatDate(currentDeal.created_at);
  
  // Workflow Progress
  updateWorkflowProgress(currentDeal.status);
  
  // Parties
  renderParties();
  
  // Party selects
  updatePartySelects();
  
  // Load additional data
  await Promise.all([
    loadPofData(),
    loadEscrowData(),
    loadPsbtData(),
    loadAuditData()
  ]);
};

// Workflow Progress
const WORKFLOW_STEPS = ["draft", "pof_pending", "pof_verified", "escrow_created", "funded", "closing", "closed"];

const updateWorkflowProgress = (currentStatus) => {
  const currentIndex = WORKFLOW_STEPS.indexOf(currentStatus);
  const isCancelled = currentStatus === "cancelled";
  
  document.querySelectorAll(".progress-step").forEach((step, i) => {
    const stepStatus = step.dataset.step;
    const stepIndex = WORKFLOW_STEPS.indexOf(stepStatus);
    
    step.classList.remove("completed", "current");
    
    if (isCancelled) {
      if (stepStatus === "closed") {
        step.querySelector("span").textContent = "Cancelled";
        step.classList.add("current");
      }
    } else if (stepIndex < currentIndex) {
      step.classList.add("completed");
    } else if (stepIndex === currentIndex) {
      step.classList.add("current");
    }
  });
  
  document.querySelectorAll(".progress-connector").forEach((conn, i) => {
    conn.classList.remove("completed");
    if (i < currentIndex && !isCancelled) {
      conn.classList.add("completed");
    }
  });
};

// Parties
const renderParties = () => {
  const list = document.getElementById("parties-list");
  const parties = currentDeal.parties || [];
  
  if (parties.length === 0) {
    list.innerHTML = '<p style="color: var(--gray-500); font-size: 14px;">No parties added yet.</p>';
    return;
  }
  
  list.innerHTML = parties.map(p => `
    <div class="party-item">
      <div class="party-avatar">${(p.display_name || "?")[0].toUpperCase()}</div>
      <div class="party-info">
        <div class="party-name">${p.display_name || "Unknown"}</div>
        <div class="party-email">${p.email || "-"}</div>
      </div>
      <span class="party-role">${p.role}</span>
    </div>
  `).join("");
};

const updatePartySelects = () => {
  const parties = currentDeal.parties || [];
  const options = parties.map(p => `<option value="${p.id}">${p.display_name} (${p.role})</option>`).join("");
  
  document.getElementById("pof-party-select").innerHTML = `<option value="">Select Party</option>${options}`;
  document.getElementById("psbt-party-select").innerHTML = `<option value="">Created By</option>${options}`;
};

// Add Party
document.getElementById("add-party-btn").addEventListener("click", () => {
  document.getElementById("party-form").classList.remove("hidden");
});

document.getElementById("cancel-party").addEventListener("click", () => {
  document.getElementById("party-form").classList.add("hidden");
  document.getElementById("party-form").reset();
});

document.getElementById("party-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(e.target).entries());
    await api(`/api/deals/${currentDeal.id}/parties`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    toast("Party added successfully", "success");
    e.target.reset();
    e.target.classList.add("hidden");
    currentDeal = await api(`/api/deals/${currentDeal.id}`);
    renderParties();
    updatePartySelects();
    loadAuditData();
  } catch (error) {
    toast(error.message, "error");
  }
});

// POF
const loadPofData = async () => {
  const statusBadge = document.getElementById("pof-status");
  const pofInfo = document.getElementById("pof-info");
  const requestForm = document.getElementById("pof-request-form");
  const attestForm = document.getElementById("pof-attest-form");
  const verifySection = document.getElementById("pof-verify-section");
  
  try {
    const packet = await api(`/api/deals/${currentDeal.id}/pof/packet`);
    
    pofInfo.classList.remove("hidden");
    document.getElementById("pof-challenge").textContent = packet.request?.challenge || "-";
    document.getElementById("pof-verified").textContent = packet.attestation?.verified ? "Yes" : "No";
    
    if (packet.attestation?.verified) {
      statusBadge.textContent = "Verified";
      statusBadge.className = "mini-badge active";
      requestForm.classList.add("hidden");
      attestForm.classList.add("hidden");
      verifySection.classList.remove("hidden");
      document.getElementById("verify-pof-btn").classList.add("hidden");
    } else if (packet.attestation) {
      statusBadge.textContent = "Pending Verification";
      statusBadge.className = "mini-badge pending";
      requestForm.classList.add("hidden");
      attestForm.classList.add("hidden");
      verifySection.classList.remove("hidden");
      document.getElementById("verify-pof-btn").classList.remove("hidden");
    } else {
      statusBadge.textContent = "Requested";
      statusBadge.className = "mini-badge pending";
      requestForm.classList.add("hidden");
      attestForm.classList.remove("hidden");
      verifySection.classList.add("hidden");
    }
  } catch {
    statusBadge.textContent = "Not Started";
    statusBadge.className = "mini-badge";
    pofInfo.classList.add("hidden");
    requestForm.classList.remove("hidden");
    attestForm.classList.add("hidden");
    verifySection.classList.add("hidden");
  }
};

document.getElementById("pof-request-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(e.target).entries());
    await api(`/api/deals/${currentDeal.id}/pof/request`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    toast("POF request created", "success");
    e.target.reset();
    currentDeal = await api(`/api/deals/${currentDeal.id}`);
    renderDealDetail();
  } catch (error) {
    toast(error.message, "error");
  }
});

document.getElementById("pof-attest-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(e.target).entries());
    await api(`/api/deals/${currentDeal.id}/pof/attest`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    toast("POF attestation submitted", "success");
    e.target.reset();
    loadPofData();
    loadAuditData();
  } catch (error) {
    toast(error.message, "error");
  }
});

document.getElementById("verify-pof-btn").addEventListener("click", async () => {
  try {
    await api(`/api/deals/${currentDeal.id}/pof/verify`, { method: "POST" });
    toast("POF verified successfully", "success");
    currentDeal = await api(`/api/deals/${currentDeal.id}`);
    renderDealDetail();
  } catch (error) {
    toast(error.message, "error");
  }
});

document.getElementById("download-pof-btn").addEventListener("click", async () => {
  try {
    const packet = await api(`/api/deals/${currentDeal.id}/pof/packet`);
    showModal("POF Packet", `<pre style="white-space: pre-wrap; font-size: 12px;">${JSON.stringify(packet, null, 2)}</pre>`);
  } catch (error) {
    toast(error.message, "error");
  }
});

// Escrow
const loadEscrowData = async () => {
  const statusBadge = document.getElementById("escrow-status");
  const escrowInfo = document.getElementById("escrow-info");
  const policyForm = document.getElementById("escrow-policy-form");
  const fundingSection = document.getElementById("escrow-funding-section");
  const fundingInfo = document.getElementById("funding-info");
  
  try {
    const policy = await api(`/api/deals/${currentDeal.id}/escrow`);
    
    escrowInfo.classList.remove("hidden");
    document.getElementById("escrow-address").textContent = policy.address || "-";
    document.getElementById("escrow-policy-type").textContent = policy.policy_type || "-";
    document.getElementById("escrow-descriptor").textContent = policy.descriptor || "-";
    
    policyForm.classList.add("hidden");
    
    // Check for funding
    try {
      const receipt = await api(`/api/deals/${currentDeal.id}/escrow/receipt`);
      statusBadge.textContent = "Funded";
      statusBadge.className = "mini-badge active";
      fundingSection.classList.add("hidden");
      fundingInfo.classList.remove("hidden");
      document.getElementById("funding-txid").textContent = receipt.txid || "-";
      document.getElementById("funding-amount").textContent = receipt.amount_btc ? `${receipt.amount_btc} BTC` : "-";
      document.getElementById("funding-confirmations").textContent = receipt.confirmations ?? "-";
    } catch {
      statusBadge.textContent = "Awaiting Funding";
      statusBadge.className = "mini-badge pending";
      fundingSection.classList.remove("hidden");
      fundingInfo.classList.add("hidden");
    }
  } catch {
    statusBadge.textContent = "Not Created";
    statusBadge.className = "mini-badge";
    escrowInfo.classList.add("hidden");
    policyForm.classList.remove("hidden");
    fundingSection.classList.add("hidden");
    fundingInfo.classList.add("hidden");
  }
};

document.getElementById("escrow-policy-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(e.target).entries());
    await api(`/api/deals/${currentDeal.id}/escrow/policy`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    toast("Escrow policy created", "success");
    e.target.reset();
    currentDeal = await api(`/api/deals/${currentDeal.id}`);
    renderDealDetail();
  } catch (error) {
    toast(error.message, "error");
  }
});

document.getElementById("funding-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(e.target).entries());
    await api(`/api/deals/${currentDeal.id}/escrow/funding`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    toast("Funding recorded", "success");
    e.target.reset();
    currentDeal = await api(`/api/deals/${currentDeal.id}`);
    renderDealDetail();
  } catch (error) {
    toast(error.message, "error");
  }
});

document.getElementById("download-receipt-btn").addEventListener("click", async () => {
  try {
    const receipt = await api(`/api/deals/${currentDeal.id}/escrow/receipt`);
    showModal("Escrow Receipt", `<pre style="white-space: pre-wrap; font-size: 12px;">${JSON.stringify(receipt, null, 2)}</pre>`);
  } catch (error) {
    toast(error.message, "error");
  }
});

// PSBT
const loadPsbtData = async () => {
  const statusBadge = document.getElementById("psbt-status");
  const psbtList = document.getElementById("psbt-list");
  
  // For now, show based on deal status
  if (["closing", "closed", "cancelled"].includes(currentDeal.status)) {
    statusBadge.textContent = currentDeal.status === "closed" ? "Completed" : 
                              currentDeal.status === "cancelled" ? "Refunded" : "In Progress";
    statusBadge.className = `mini-badge ${currentDeal.status === "closing" ? "pending" : "active"}`;
  } else if (currentDeal.status === "funded") {
    statusBadge.textContent = "Ready";
    statusBadge.className = "mini-badge";
  } else {
    statusBadge.textContent = "Not Available";
    statusBadge.className = "mini-badge";
  }
  
  psbtList.innerHTML = "";
};

document.getElementById("psbt-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(e.target).entries());
    const session = await api(`/api/deals/${currentDeal.id}/psbt`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    toast("PSBT created", "success");
    e.target.reset();
    currentDeal = await api(`/api/deals/${currentDeal.id}`);
    renderDealDetail();
    
    // Show PSBT details
    showModal("PSBT Created", `
      <p><strong>Session ID:</strong> ${session.id}</p>
      <p><strong>Type:</strong> ${session.type}</p>
      <p><strong>Status:</strong> ${session.status}</p>
      <p><strong>Hash:</strong> <code>${session.psbt_hash}</code></p>
      <div class="mt-4">
        <button class="btn-primary" onclick="requestSignatures('${session.id}')">Request Signatures</button>
      </div>
    `);
  } catch (error) {
    toast(error.message, "error");
  }
});

window.requestSignatures = async (sessionId) => {
  const parties = currentDeal.parties || [];
  for (const party of parties) {
    try {
      await api(`/api/psbt/${sessionId}/request-signature`, {
        method: "POST",
        body: JSON.stringify({ party_id: party.id })
      });
    } catch (e) {
      console.error(e);
    }
  }
  toast("Signature requests sent to all parties", "success");
  closeModal();
  loadAuditData();
};

window.finalizePsbt = async (sessionId) => {
  try {
    const result = await api(`/api/psbt/${sessionId}/finalize`, {
      method: "POST",
      body: JSON.stringify({ party_id: currentDeal.parties?.[0]?.id })
    });
    toast("PSBT finalized and broadcast", "success");
    currentDeal = await api(`/api/deals/${currentDeal.id}`);
    renderDealDetail();
  } catch (error) {
    toast(error.message, "error");
  }
};

// Audit
const loadAuditData = async () => {
  try {
    const events = await api(`/api/deals/${currentDeal.id}/audit`);
    const list = document.getElementById("audit-list");
    
    if (events.length === 0) {
      list.innerHTML = '<p style="color: var(--gray-500); font-size: 14px;">No events yet.</p>';
      return;
    }
    
    list.innerHTML = events.map(e => `
      <div class="audit-item">
        <div class="audit-dot"></div>
        <div class="audit-content">
          <div class="audit-type">${e.type.replace(/\./g, " ").replace(/\b\w/g, l => l.toUpperCase())}</div>
          <div class="audit-time">${formatDate(e.created_at)}</div>
        </div>
      </div>
    `).join("");
  } catch (error) {
    console.error("Failed to load audit:", error);
  }
};

// Modal
const showModal = (title, content) => {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = content;
  document.getElementById("modal-overlay").classList.remove("hidden");
};

const closeModal = () => {
  document.getElementById("modal-overlay").classList.add("hidden");
};

window.closeModal = closeModal;

document.querySelector(".modal-close").addEventListener("click", closeModal);
document.getElementById("modal-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeModal();
});

// Initialize
loadDeals();
