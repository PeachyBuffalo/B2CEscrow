const express = require("express");
const crypto = require("crypto");
const path = require("path");
require("dotenv").config();
const { v4: uuidv4 } = require("uuid");
const { initDb, query } = require("./db");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

const nowIso = () => new Date().toISOString();

const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

const addAudit = async (dealId, type, payload, actorPartyId = null, txid = null) => {
  const audit = {
    id: uuidv4(),
    deal_id: dealId,
    type,
    actor_party_id: actorPartyId,
    payload_json: payload || {},
    txid,
    created_at: nowIso()
  };
  await query(
    `INSERT INTO audit_events (id, deal_id, type, actor_party_id, payload_json, txid, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      audit.id,
      audit.deal_id,
      audit.type,
      audit.actor_party_id,
      audit.payload_json,
      audit.txid,
      audit.created_at
    ]
  );
  return audit;
};

const getDealOr404 = async (req, res) => {
  const result = await query("SELECT * FROM deals WHERE id = $1", [req.params.id]);
  const deal = result.rows[0];
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return null;
  }
  return deal;
};

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

app.get("/health", asyncHandler(async (req, res) => {
  res.json({ ok: true, time: nowIso() });
}));

// Deal rooms
app.post("/api/deals", asyncHandler(async (req, res) => {
  const id = uuidv4();
  const deal = {
    id,
    status: "draft",
    transaction_type: req.body.transaction_type || "cash_purchase",
    property_address: req.body.property_address || "",
    purchase_price_usd: req.body.purchase_price_usd || null,
    emd_amount_btc: req.body.emd_amount_btc || "",
    emd_amount_usd_at_funding: null,
    deadline_funding: req.body.deadline_funding || null,
    deadline_close: req.body.deadline_close || null,
    state_jurisdiction: req.body.state_jurisdiction || null,
    created_at: nowIso(),
    updated_at: nowIso()
  };
  await query(
    `INSERT INTO deals (
      id, status, transaction_type, property_address, purchase_price_usd, emd_amount_btc,
      emd_amount_usd_at_funding, deadline_funding, deadline_close, state_jurisdiction, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      deal.id,
      deal.status,
      deal.transaction_type,
      deal.property_address,
      deal.purchase_price_usd,
      deal.emd_amount_btc,
      deal.emd_amount_usd_at_funding,
      deal.deadline_funding,
      deal.deadline_close,
      deal.state_jurisdiction,
      deal.created_at,
      deal.updated_at
    ]
  );
  await addAudit(id, "deal.created", { deal });
  res.status(201).json(deal);
}));

app.get("/api/deals", asyncHandler(async (req, res) => {
  const result = await query("SELECT * FROM deals ORDER BY created_at DESC");
  res.json(result.rows);
}));

app.get("/api/deals/:id", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  const parties = await query("SELECT * FROM parties WHERE deal_id = $1", [deal.id]);
  res.json({ ...deal, parties: parties.rows });
}));

app.patch("/api/deals/:id", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  const next = {
    ...deal,
    status: req.body.status || deal.status,
    deadline_funding: req.body.deadline_funding || deal.deadline_funding,
    deadline_close: req.body.deadline_close || deal.deadline_close,
    updated_at: nowIso()
  };
  await query(
    `UPDATE deals SET status = $2, deadline_funding = $3, deadline_close = $4, updated_at = $5
     WHERE id = $1`,
    [deal.id, next.status, next.deadline_funding, next.deadline_close, next.updated_at]
  );
  await addAudit(deal.id, "deal.updated", { before: deal, after: next });
  res.json(next);
}));

// Parties
app.post("/api/deals/:id/parties", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  // Determine signing authority based on role
  const signingRoles = ["buyer", "seller", "title"];
  const party = {
    id: uuidv4(),
    deal_id: deal.id,
    role: req.body.role,
    display_name: req.body.display_name || "",
    email: req.body.email || "",
    phone: req.body.phone || null,
    company_name: req.body.company_name || null,
    license_number: req.body.license_number || null,
    signing_authority: req.body.signing_authority ?? signingRoles.includes(req.body.role),
    wallet_descriptor: req.body.wallet_descriptor || null,
    pubkey: req.body.pubkey || null,
    created_at: nowIso()
  };
  await query(
    `INSERT INTO parties (id, deal_id, role, display_name, email, phone, company_name, license_number, signing_authority, wallet_descriptor, pubkey, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      party.id,
      party.deal_id,
      party.role,
      party.display_name,
      party.email,
      party.phone,
      party.company_name,
      party.license_number,
      party.signing_authority,
      party.wallet_descriptor,
      party.pubkey,
      party.created_at
    ]
  );
  await addAudit(deal.id, "party.invited", { party }, party.id);
  res.status(201).json(party);
}));

app.patch("/api/parties/:id", asyncHandler(async (req, res) => {
  const result = await query("SELECT * FROM parties WHERE id = $1", [req.params.id]);
  const party = result.rows[0];
  if (!party) {
    res.status(404).json({ error: "Party not found" });
    return;
  }
  const next = {
    ...party,
    wallet_descriptor: req.body.wallet_descriptor || party.wallet_descriptor,
    pubkey: req.body.pubkey || party.pubkey
  };
  await query(
    `UPDATE parties SET wallet_descriptor = $2, pubkey = $3 WHERE id = $1`,
    [party.id, next.wallet_descriptor, next.pubkey]
  );
  await addAudit(party.deal_id, "party.updated", { before: party, after: next }, party.id);
  res.json(next);
}));

// POF
app.post("/api/deals/:id/pof/request", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  const request = {
    id: uuidv4(),
    deal_id: deal.id,
    challenge: [
      `DealID:${deal.id}`,
      `Buyer:${req.body.buyer_name || ""}`,
      `Property:${deal.property_address || ""}`,
      `Timestamp:${nowIso()}`,
      `RequestedAmount:${req.body.requested_amount_btc || ""}`
    ].join(" | "),
    requested_amount_btc: req.body.requested_amount_btc || "",
    requested_amount_usd: req.body.requested_amount_usd || null,
    created_at: nowIso()
  };
  await query(
    `INSERT INTO pof_requests (id, deal_id, challenge, requested_amount_btc, requested_amount_usd, created_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      request.id,
      request.deal_id,
      request.challenge,
      request.requested_amount_btc,
      request.requested_amount_usd,
      request.created_at
    ]
  );
  // Transition deal status: draft → pof_pending
  if (deal.status === "draft") {
    await query(`UPDATE deals SET status = $2, updated_at = $3 WHERE id = $1`, [
      deal.id,
      "pof_pending",
      nowIso()
    ]);
  }
  await addAudit(deal.id, "pof.requested", { request });
  res.status(201).json(request);
}));

app.post("/api/deals/:id/pof/attest", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  const attestation = {
    id: uuidv4(),
    deal_id: deal.id,
    party_id: req.body.party_id,
    proof_type: req.body.proof_type,
    address_or_descriptor: req.body.address_or_descriptor,
    signature: req.body.signature,
    verified: false,
    verified_at: null,
    utxos_total_btc: req.body.utxos_total_btc || null,
    packet_pdf_url: "/api/deals/" + deal.id + "/pof/packet?format=pdf",
    packet_json_url: "/api/deals/" + deal.id + "/pof/packet?format=json",
    created_at: nowIso()
  };
  await query(
    `INSERT INTO pof_attestations (
      id, deal_id, party_id, proof_type, address_or_descriptor, signature,
      verified, verified_at, utxos_total_btc, packet_pdf_url, packet_json_url, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      attestation.id,
      attestation.deal_id,
      attestation.party_id,
      attestation.proof_type,
      attestation.address_or_descriptor,
      attestation.signature,
      attestation.verified,
      attestation.verified_at,
      attestation.utxos_total_btc,
      attestation.packet_pdf_url,
      attestation.packet_json_url,
      attestation.created_at
    ]
  );
  await addAudit(deal.id, "pof.attested", { attestation }, attestation.party_id);
  res.status(201).json(attestation);
}));

app.post("/api/deals/:id/pof/verify", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  const result = await query(
    `SELECT * FROM pof_attestations WHERE deal_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [deal.id]
  );
  const attestation = result.rows[0];
  if (!attestation) {
    res.status(404).json({ error: "POF attestation not found" });
    return;
  }
  const verified = { ...attestation, verified: true, verified_at: nowIso() };
  await query(
    `UPDATE pof_attestations SET verified = $2, verified_at = $3 WHERE id = $1`,
    [attestation.id, verified.verified, verified.verified_at]
  );
  // Transition deal status: pof_pending → pof_verified
  if (deal.status === "pof_pending") {
    await query(`UPDATE deals SET status = $2, updated_at = $3 WHERE id = $1`, [
      deal.id,
      "pof_verified",
      nowIso()
    ]);
  }
  await addAudit(deal.id, "pof.verified", { attestation: verified }, verified.party_id);
  res.json(verified);
}));

app.get("/api/deals/:id/pof/packet", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  const attestationResult = await query(
    `SELECT * FROM pof_attestations WHERE deal_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [deal.id]
  );
  const attestation = attestationResult.rows[0];
  if (!attestation) {
    res.status(404).json({ error: "POF attestation not found" });
    return;
  }
  const requestResult = await query(
    `SELECT * FROM pof_requests WHERE deal_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [deal.id]
  );
  const pofRequest = requestResult.rows[0];
  res.json({
    deal_id: deal.id,
    property_address: deal.property_address,
    request: pofRequest || null,
    attestation,
    verification_qr_payload: sha256(attestation.signature || ""),
    generated_at: nowIso()
  });
}));

// Escrow
app.post("/api/deals/:id/escrow/policy", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  const policy = {
    id: uuidv4(),
    deal_id: deal.id,
    policy_type: "wsh_2of3_timelock",
    descriptor: req.body.descriptor || "wsh(multi(2,[buyer],[seller],[title]))",
    refund_timelock: req.body.refund_timelock || null,
    address: req.body.address || "bc1qexampleescrowaddress",
    terms_hash: sha256(JSON.stringify(req.body || {})),
    created_at: nowIso()
  };
  await query(
    `INSERT INTO escrow_policies (
      id, deal_id, policy_type, descriptor, refund_timelock, address, terms_hash, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      policy.id,
      policy.deal_id,
      policy.policy_type,
      policy.descriptor,
      policy.refund_timelock,
      policy.address,
      policy.terms_hash,
      policy.created_at
    ]
  );
  // Transition deal status: pof_verified → escrow_created
  if (deal.status === "pof_verified") {
    await query(`UPDATE deals SET status = $2, updated_at = $3 WHERE id = $1`, [
      deal.id,
      "escrow_created",
      nowIso()
    ]);
  }
  await addAudit(deal.id, "escrow.policy_created", { policy });
  res.status(201).json(policy);
}));

app.get("/api/deals/:id/escrow", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  const result = await query(
    `SELECT * FROM escrow_policies WHERE deal_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [deal.id]
  );
  const policy = result.rows[0];
  if (!policy) {
    res.status(404).json({ error: "Escrow policy not found" });
    return;
  }
  res.json(policy);
}));

app.post("/api/deals/:id/escrow/funding", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  const funding = {
    id: uuidv4(),
    deal_id: deal.id,
    txid: req.body.txid,
    amount_btc: req.body.amount_btc,
    confirmations: req.body.confirmations || 0,
    funded_at: req.body.funded_at || nowIso(),
    receipt_pdf_url: "/api/deals/" + deal.id + "/escrow/receipt",
    created_at: nowIso()
  };
  await query(
    `INSERT INTO escrow_fundings (
      id, deal_id, txid, amount_btc, confirmations, funded_at, receipt_pdf_url, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      funding.id,
      funding.deal_id,
      funding.txid,
      funding.amount_btc,
      funding.confirmations,
      funding.funded_at,
      funding.receipt_pdf_url,
      funding.created_at
    ]
  );
  // Transition deal status: escrow_created → funded
  if (deal.status === "escrow_created") {
    await query(`UPDATE deals SET status = $2, updated_at = $3 WHERE id = $1`, [
      deal.id,
      "funded",
      nowIso()
    ]);
  }
  await addAudit(deal.id, "escrow.funded", { funding }, null, funding.txid);
  res.status(201).json(funding);
}));

app.get("/api/deals/:id/escrow/receipt", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  const fundingResult = await query(
    `SELECT * FROM escrow_fundings WHERE deal_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [deal.id]
  );
  const funding = fundingResult.rows[0];
  if (!funding) {
    res.status(404).json({ error: "Escrow funding not found" });
    return;
  }
  const policyResult = await query(
    `SELECT * FROM escrow_policies WHERE deal_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [deal.id]
  );
  const policy = policyResult.rows[0];
  res.json({
    deal_id: deal.id,
    txid: funding.txid,
    amount_btc: funding.amount_btc,
    address: policy?.address || null,
    confirmations: funding.confirmations,
    funded_at: funding.funded_at,
    generated_at: nowIso()
  });
}));

// PSBT
app.post("/api/deals/:id/psbt", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  const session = {
    id: uuidv4(),
    deal_id: deal.id,
    type: req.body.type,
    psbt_base64: req.body.psbt_base64,
    psbt_hash: sha256(req.body.psbt_base64 || ""),
    status: "draft",
    created_by_party_id: req.body.created_by_party_id,
    created_at: nowIso()
  };
  await query(
    `INSERT INTO psbt_sessions (
      id, deal_id, type, psbt_base64, psbt_hash, status, created_by_party_id, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      session.id,
      session.deal_id,
      session.type,
      session.psbt_base64,
      session.psbt_hash,
      session.status,
      session.created_by_party_id,
      session.created_at
    ]
  );
  // Transition deal status: funded → closing (for release/closing PSBTs)
  if (deal.status === "funded" && (session.type === "release" || session.type === "closing")) {
    await query(`UPDATE deals SET status = $2, updated_at = $3 WHERE id = $1`, [
      deal.id,
      "closing",
      nowIso()
    ]);
  }
  await addAudit(deal.id, "psbt.created", { session }, session.created_by_party_id);
  res.status(201).json(session);
}));

app.post("/api/psbt/:id/request-signature", asyncHandler(async (req, res) => {
  const sessionResult = await query("SELECT * FROM psbt_sessions WHERE id = $1", [
    req.params.id
  ]);
  const session = sessionResult.rows[0];
  if (!session) {
    res.status(404).json({ error: "PSBT session not found" });
    return;
  }
  // Update session status to "signing" if currently "draft"
  if (session.status === "draft") {
    await query(`UPDATE psbt_sessions SET status = $2 WHERE id = $1`, [session.id, "signing"]);
  }
  const signature = {
    id: uuidv4(),
    psbt_session_id: session.id,
    party_id: req.body.party_id,
    status: "requested",
    signed_psbt_base64: null,
    signed_at: null
  };
  await query(
    `INSERT INTO psbt_signatures (
      id, psbt_session_id, party_id, status, signed_psbt_base64, signed_at
    ) VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      signature.id,
      signature.psbt_session_id,
      signature.party_id,
      signature.status,
      signature.signed_psbt_base64,
      signature.signed_at
    ]
  );
  await addAudit(session.deal_id, "psbt.signature_requested", { signature }, signature.party_id);
  res.status(201).json(signature);
}));

app.post("/api/psbt/:id/submit-signature", asyncHandler(async (req, res) => {
  const sessionResult = await query("SELECT * FROM psbt_sessions WHERE id = $1", [
    req.params.id
  ]);
  const session = sessionResult.rows[0];
  if (!session) {
    res.status(404).json({ error: "PSBT session not found" });
    return;
  }
  const signatureResult = await query(
    `SELECT * FROM psbt_signatures WHERE psbt_session_id = $1 AND party_id = $2`,
    [session.id, req.body.party_id]
  );
  const signature = signatureResult.rows[0];
  if (!signature) {
    res.status(404).json({ error: "Signature request not found" });
    return;
  }
  const next = {
    ...signature,
    status: "signed",
    signed_psbt_base64: req.body.signed_psbt_base64,
    signed_at: nowIso()
  };
  await query(
    `UPDATE psbt_signatures SET status = $2, signed_psbt_base64 = $3, signed_at = $4 WHERE id = $1`,
    [signature.id, next.status, next.signed_psbt_base64, next.signed_at]
  );
  await addAudit(session.deal_id, "psbt.signature_submitted", { signature: next }, next.party_id);
  res.json(next);
}));

app.post("/api/psbt/:id/finalize", asyncHandler(async (req, res) => {
  const sessionResult = await query("SELECT * FROM psbt_sessions WHERE id = $1", [
    req.params.id
  ]);
  const session = sessionResult.rows[0];
  if (!session) {
    res.status(404).json({ error: "PSBT session not found" });
    return;
  }
  const next = { ...session, status: "finalized" };
  await query(`UPDATE psbt_sessions SET status = $2 WHERE id = $1`, [
    session.id,
    next.status
  ]);
  // Transition deal status based on PSBT type
  const dealResult = await query("SELECT * FROM deals WHERE id = $1", [session.deal_id]);
  const deal = dealResult.rows[0];
  if (deal && deal.status === "closing") {
    const newStatus = session.type === "refund" ? "cancelled" : "closed";
    await query(`UPDATE deals SET status = $2, updated_at = $3 WHERE id = $1`, [
      deal.id,
      newStatus,
      nowIso()
    ]);
  }
  const txid = req.body.txid || "txid_placeholder";
  await addAudit(session.deal_id, "psbt.finalized", { session: next }, req.body.party_id, txid);
  res.json({ ...next, broadcast_txid: txid });
}));

// Audit
app.get("/api/deals/:id/audit", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  const events = await query(
    "SELECT * FROM audit_events WHERE deal_id = $1 ORDER BY created_at DESC",
    [deal.id]
  );
  res.json(events.rows);
}));

// Contingencies
app.post("/api/deals/:id/contingencies", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  const contingency = {
    id: uuidv4(),
    deal_id: deal.id,
    type: req.body.type,
    status: "pending",
    deadline: req.body.deadline || null,
    satisfied_at: null,
    waived_at: null,
    waived_by_party_id: null,
    notes: req.body.notes || null,
    created_at: nowIso()
  };
  await query(
    `INSERT INTO contingencies (id, deal_id, type, status, deadline, satisfied_at, waived_at, waived_by_party_id, notes, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      contingency.id, contingency.deal_id, contingency.type, contingency.status,
      contingency.deadline, contingency.satisfied_at, contingency.waived_at,
      contingency.waived_by_party_id, contingency.notes, contingency.created_at
    ]
  );
  await addAudit(deal.id, "contingency.added", { contingency });
  res.status(201).json(contingency);
}));

app.get("/api/deals/:id/contingencies", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  const result = await query(
    "SELECT * FROM contingencies WHERE deal_id = $1 ORDER BY deadline ASC NULLS LAST",
    [deal.id]
  );
  res.json(result.rows);
}));

app.patch("/api/contingencies/:id", asyncHandler(async (req, res) => {
  const result = await query("SELECT * FROM contingencies WHERE id = $1", [req.params.id]);
  const contingency = result.rows[0];
  if (!contingency) {
    res.status(404).json({ error: "Contingency not found" });
    return;
  }
  const next = { ...contingency };
  if (req.body.status === "satisfied") {
    next.status = "satisfied";
    next.satisfied_at = nowIso();
  } else if (req.body.status === "waived") {
    next.status = "waived";
    next.waived_at = nowIso();
    next.waived_by_party_id = req.body.waived_by_party_id || null;
  } else if (req.body.status === "failed") {
    next.status = "failed";
  }
  if (req.body.notes) next.notes = req.body.notes;
  if (req.body.deadline) next.deadline = req.body.deadline;

  await query(
    `UPDATE contingencies SET status=$2, satisfied_at=$3, waived_at=$4, waived_by_party_id=$5, notes=$6, deadline=$7 WHERE id=$1`,
    [contingency.id, next.status, next.satisfied_at, next.waived_at, next.waived_by_party_id, next.notes, next.deadline]
  );
  await addAudit(contingency.deal_id, "contingency.updated", { before: contingency, after: next }, next.waived_by_party_id);
  res.json(next);
}));

// Documents
app.post("/api/deals/:id/documents", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  const doc = {
    id: uuidv4(),
    deal_id: deal.id,
    type: req.body.type,
    name: req.body.name,
    uploaded_by_party_id: req.body.uploaded_by_party_id || null,
    file_url: req.body.file_url || null,
    file_hash: req.body.file_hash || null,
    status: "draft",
    requires_signatures: req.body.requires_signatures || false,
    created_at: nowIso()
  };
  await query(
    `INSERT INTO documents (id, deal_id, type, name, uploaded_by_party_id, file_url, file_hash, status, requires_signatures, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [doc.id, doc.deal_id, doc.type, doc.name, doc.uploaded_by_party_id, doc.file_url, doc.file_hash, doc.status, doc.requires_signatures, doc.created_at]
  );
  await addAudit(deal.id, "document.uploaded", { document: doc }, doc.uploaded_by_party_id);
  res.status(201).json(doc);
}));

app.get("/api/deals/:id/documents", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  const result = await query(
    "SELECT * FROM documents WHERE deal_id = $1 ORDER BY created_at DESC",
    [deal.id]
  );
  res.json(result.rows);
}));

app.patch("/api/documents/:id", asyncHandler(async (req, res) => {
  const result = await query("SELECT * FROM documents WHERE id = $1", [req.params.id]);
  const doc = result.rows[0];
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const next = {
    ...doc,
    status: req.body.status || doc.status,
    file_url: req.body.file_url || doc.file_url,
    file_hash: req.body.file_hash || doc.file_hash
  };
  await query(
    `UPDATE documents SET status=$2, file_url=$3, file_hash=$4 WHERE id=$1`,
    [doc.id, next.status, next.file_url, next.file_hash]
  );
  await addAudit(doc.deal_id, "document.updated", { before: doc, after: next });
  res.json(next);
}));

// Funds
app.post("/api/deals/:id/funds", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  const fund = {
    id: uuidv4(),
    deal_id: deal.id,
    type: req.body.type,
    description: req.body.description || null,
    amount_btc: req.body.amount_btc || null,
    amount_usd: req.body.amount_usd || null,
    escrow_policy_id: req.body.escrow_policy_id || null,
    status: "pending",
    funded_txid: null,
    released_txid: null,
    created_at: nowIso()
  };
  await query(
    `INSERT INTO funds (id, deal_id, type, description, amount_btc, amount_usd, escrow_policy_id, status, funded_txid, released_txid, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [fund.id, fund.deal_id, fund.type, fund.description, fund.amount_btc, fund.amount_usd, fund.escrow_policy_id, fund.status, fund.funded_txid, fund.released_txid, fund.created_at]
  );
  await addAudit(deal.id, "fund.added", { fund });
  res.status(201).json(fund);
}));

app.get("/api/deals/:id/funds", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  const result = await query(
    "SELECT * FROM funds WHERE deal_id = $1 ORDER BY created_at ASC",
    [deal.id]
  );
  res.json(result.rows);
}));

app.patch("/api/funds/:id", asyncHandler(async (req, res) => {
  const result = await query("SELECT * FROM funds WHERE id = $1", [req.params.id]);
  const fund = result.rows[0];
  if (!fund) {
    res.status(404).json({ error: "Fund not found" });
    return;
  }
  const next = {
    ...fund,
    status: req.body.status || fund.status,
    funded_txid: req.body.funded_txid || fund.funded_txid,
    released_txid: req.body.released_txid || fund.released_txid
  };
  await query(
    `UPDATE funds SET status=$2, funded_txid=$3, released_txid=$4 WHERE id=$1`,
    [fund.id, next.status, next.funded_txid, next.released_txid]
  );
  await addAudit(fund.deal_id, "fund.updated", { before: fund, after: next }, null, next.funded_txid || next.released_txid);
  res.json(next);
}));

// Disbursements
app.post("/api/deals/:id/disbursements", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  const disbursement = {
    id: uuidv4(),
    deal_id: deal.id,
    payee_name: req.body.payee_name,
    payee_type: req.body.payee_type,
    amount_usd: req.body.amount_usd || null,
    amount_btc: req.body.amount_btc || null,
    description: req.body.description || null,
    btc_address: req.body.btc_address || null,
    status: "pending",
    paid_txid: null,
    paid_at: null,
    created_at: nowIso()
  };
  await query(
    `INSERT INTO disbursements (id, deal_id, payee_name, payee_type, amount_usd, amount_btc, description, btc_address, status, paid_txid, paid_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [disbursement.id, disbursement.deal_id, disbursement.payee_name, disbursement.payee_type, disbursement.amount_usd, disbursement.amount_btc, disbursement.description, disbursement.btc_address, disbursement.status, disbursement.paid_txid, disbursement.paid_at, disbursement.created_at]
  );
  await addAudit(deal.id, "disbursement.added", { disbursement });
  res.status(201).json(disbursement);
}));

app.get("/api/deals/:id/disbursements", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  const result = await query(
    "SELECT * FROM disbursements WHERE deal_id = $1 ORDER BY created_at ASC",
    [deal.id]
  );
  res.json(result.rows);
}));

app.post("/api/disbursements/:id/pay", asyncHandler(async (req, res) => {
  const result = await query("SELECT * FROM disbursements WHERE id = $1", [req.params.id]);
  const disbursement = result.rows[0];
  if (!disbursement) {
    res.status(404).json({ error: "Disbursement not found" });
    return;
  }
  const next = {
    ...disbursement,
    status: "paid",
    paid_txid: req.body.paid_txid || null,
    paid_at: nowIso()
  };
  await query(
    `UPDATE disbursements SET status=$2, paid_txid=$3, paid_at=$4 WHERE id=$1`,
    [disbursement.id, next.status, next.paid_txid, next.paid_at]
  );
  await addAudit(disbursement.deal_id, "disbursement.paid", { disbursement: next }, null, next.paid_txid);
  res.json(next);
}));

// Milestones
app.post("/api/deals/:id/milestones", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  const milestone = {
    id: uuidv4(),
    deal_id: deal.id,
    name: req.body.name,
    description: req.body.description || null,
    due_date: req.body.due_date || null,
    completed_at: null,
    completed_by_party_id: null,
    is_required: req.body.is_required ?? true,
    order_index: req.body.order_index || 0,
    created_at: nowIso()
  };
  await query(
    `INSERT INTO milestones (id, deal_id, name, description, due_date, completed_at, completed_by_party_id, is_required, order_index, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [milestone.id, milestone.deal_id, milestone.name, milestone.description, milestone.due_date, milestone.completed_at, milestone.completed_by_party_id, milestone.is_required, milestone.order_index, milestone.created_at]
  );
  await addAudit(deal.id, "milestone.added", { milestone });
  res.status(201).json(milestone);
}));

app.get("/api/deals/:id/milestones", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  const result = await query(
    "SELECT * FROM milestones WHERE deal_id = $1 ORDER BY order_index ASC",
    [deal.id]
  );
  res.json(result.rows);
}));

app.patch("/api/milestones/:id", asyncHandler(async (req, res) => {
  const result = await query("SELECT * FROM milestones WHERE id = $1", [req.params.id]);
  const milestone = result.rows[0];
  if (!milestone) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }
  const next = { ...milestone };
  if (req.body.completed) {
    next.completed_at = nowIso();
    next.completed_by_party_id = req.body.completed_by_party_id || null;
  }
  if (req.body.due_date) next.due_date = req.body.due_date;
  if (req.body.name) next.name = req.body.name;
  if (req.body.description !== undefined) next.description = req.body.description;

  await query(
    `UPDATE milestones SET completed_at=$2, completed_by_party_id=$3, due_date=$4, name=$5, description=$6 WHERE id=$1`,
    [milestone.id, next.completed_at, next.completed_by_party_id, next.due_date, next.name, next.description]
  );
  await addAudit(milestone.deal_id, "milestone.updated", { before: milestone, after: next }, next.completed_by_party_id);
  res.json(next);
}));

// Create default milestones for a deal
app.post("/api/deals/:id/milestones/defaults", asyncHandler(async (req, res) => {
  const deal = await getDealOr404(req, res);
  if (!deal) return;
  
  const defaultMilestones = [
    { name: "Contract Executed", order_index: 1 },
    { name: "EMD Deposited", order_index: 2 },
    { name: "Inspection Completed", order_index: 3 },
    { name: "Inspection Contingency Resolved", order_index: 4 },
    { name: "Appraisal Ordered", order_index: 5, is_required: deal.transaction_type === "financed" },
    { name: "Appraisal Received", order_index: 6, is_required: deal.transaction_type === "financed" },
    { name: "Loan Approved", order_index: 7, is_required: deal.transaction_type === "financed" },
    { name: "Title Commitment Received", order_index: 8 },
    { name: "Title Cleared", order_index: 9 },
    { name: "Closing Disclosure Sent", order_index: 10 },
    { name: "Final Walkthrough", order_index: 11 },
    { name: "Closing/Funding", order_index: 12 },
    { name: "Recording Complete", order_index: 13 }
  ];

  const milestones = [];
  for (const m of defaultMilestones) {
    const milestone = {
      id: uuidv4(),
      deal_id: deal.id,
      name: m.name,
      description: null,
      due_date: null,
      completed_at: null,
      completed_by_party_id: null,
      is_required: m.is_required ?? true,
      order_index: m.order_index,
      created_at: nowIso()
    };
    await query(
      `INSERT INTO milestones (id, deal_id, name, description, due_date, completed_at, completed_by_party_id, is_required, order_index, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [milestone.id, milestone.deal_id, milestone.name, milestone.description, milestone.due_date, milestone.completed_at, milestone.completed_by_party_id, milestone.is_required, milestone.order_index, milestone.created_at]
    );
    milestones.push(milestone);
  }
  
  await addAudit(deal.id, "milestones.defaults_created", { count: milestones.length });
  res.status(201).json(milestones);
}));

// Global error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

const port = process.env.PORT || 3000;
initDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`MVP server running on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to init database", err);
    process.exit(1);
  });
