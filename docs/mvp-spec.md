# Real Estate Bitcoin Escrow MVP (Best UX for Title Companies)

This document defines the MVP product spec, data model, API endpoints, and the signing flow for a real-estate workflow app that uses Bitcoin primitives under the hood while preserving a familiar, non-crypto title-company experience.

## Product goals

- Familiar deal-room workflow with clear roles and receipts.
- Non-custodial: the app never touches private keys.
- Verifiable: every approval, signature, and on-chain event is auditable.

## Core actors and permissions

- **Buyer**: create deal room, generate POF, fund EMD, sign PSBTs.
- **Seller**: verify POF, approve escrow terms, sign PSBTs.
- **Title/Escrow**: holds third key, verifies POF + funding, coordinates signing, finalizes and broadcasts.

## MVP screens (UX-first)

1. **Create Deal Room**
   - Guided form: property details, parties, purchase price, EMD amount, deadlines.
   - Party invite workflow with role-based access.
2. **Proof of Funds (POF) Request + Verify**
   - Human-readable challenge text and QR.
   - Wallet type selection (BIP-322, legacy signmessage, or UTXO proof).
   - POF packet export: PDF + JSON with verification QR.
3. **Create EMD Escrow Address + Terms**
   - 2-of-3 multisig policy summary and refund timelock date.
   - Exportable escrow summary for the closing file.
4. **Funding Monitor + Receipt**
   - Real-time confirmations and txid receipt.
   - Receipt PDF with txid, amount, address, confirmations.
5. **Close / Cancel (PSBT Signing Ceremony)**
   - Guided flow for release/refund PSBTs.
   - Signature status per party and finalization by Title.

## Data model (minimum viable)

### DealRoom

- `id` (uuid)
- `status` (draft | pof_pending | pof_verified | escrow_created | funded | closing | closed | cancelled)
- `transaction_type` (cash_purchase | financed | short_sale | reo | exchange_1031 | new_construction)
- `property_address` (string)
- `purchase_price_usd` (number)
- `emd_amount_btc` (string)
- `emd_amount_usd_at_funding` (number, nullable)
- `deadline_funding` (timestamp)
- `deadline_close` (timestamp)
- `state_jurisdiction` (string, nullable) - for state-specific requirements
- `created_at`, `updated_at`

### Party

- `id` (uuid)
- `deal_id` (uuid)
- `role` (buyer | seller | title | buyer_agent | seller_agent | lender | attorney | appraiser | inspector)
- `display_name` (string)
- `email` (string)
- `phone` (string, optional)
- `company_name` (string, optional)
- `license_number` (string, optional)
- `signing_authority` (boolean) - whether party can sign PSBTs
- `wallet_descriptor` (string, optional)
- `pubkey` (string, optional)
- `created_at`

### PofRequest

- `id` (uuid)
- `deal_id` (uuid)
- `challenge` (string)
- `requested_amount_btc` (string)
- `requested_amount_usd` (number)
- `created_at`

### PofAttestation

- `id` (uuid)
- `deal_id` (uuid)
- `party_id` (uuid)
- `proof_type` (bip322 | legacy | utxo)
- `address_or_descriptor` (string)
- `signature` (string)
- `verified` (boolean)
- `verified_at` (timestamp, nullable)
- `utxos_total_btc` (string, nullable)
- `packet_pdf_url` (string)
- `packet_json_url` (string)
- `created_at`

### EscrowPolicy

- `id` (uuid)
- `deal_id` (uuid)
- `policy_type` (wsh_2of3_timelock)
- `descriptor` (string)
- `refund_timelock` (timestamp)
- `address` (string)
- `terms_hash` (string)
- `created_at`

### EscrowFunding

- `id` (uuid)
- `deal_id` (uuid)
- `txid` (string)
- `amount_btc` (string)
- `confirmations` (number)
- `funded_at` (timestamp, nullable)
- `receipt_pdf_url` (string)
- `created_at`

### PsbtSession

- `id` (uuid)
- `deal_id` (uuid)
- `type` (release | refund | closing)
- `psbt_base64` (string)
- `psbt_hash` (string)
- `status` (draft | signing | finalized | broadcast)
- `created_by_party_id` (uuid)
- `created_at`

### PsbtSignature

- `id` (uuid)
- `psbt_session_id` (uuid)
- `party_id` (uuid)
- `status` (requested | signed | declined)
- `signed_psbt_base64` (string, nullable)
- `signed_at` (timestamp, nullable)

### AuditEvent

- `id` (uuid)
- `deal_id` (uuid)
- `type` (string)
- `actor_party_id` (uuid, nullable)
- `payload_json` (string)
- `txid` (string, nullable)
- `created_at`

### Contingency

- `id` (uuid)
- `deal_id` (uuid)
- `type` (inspection | appraisal | financing | title | sale_of_home | hoa_review)
- `status` (pending | satisfied | waived | failed)
- `deadline` (timestamp, nullable)
- `satisfied_at` (timestamp, nullable)
- `waived_at` (timestamp, nullable)
- `waived_by_party_id` (uuid, nullable)
- `notes` (string, nullable)
- `created_at`

### Document

- `id` (uuid)
- `deal_id` (uuid)
- `type` (purchase_agreement | amendment | disclosure | inspection_report | appraisal | title_commitment | survey | hoa_docs | closing_disclosure | deed)
- `name` (string)
- `uploaded_by_party_id` (uuid, nullable)
- `file_url` (string, nullable)
- `file_hash` (string, nullable) - SHA-256 for integrity
- `status` (draft | pending_signature | signed | recorded)
- `requires_signatures` (boolean)
- `created_at`

### Fund

- `id` (uuid)
- `deal_id` (uuid)
- `type` (emd | option_fee | additional_deposit | repair_credit | closing_funds)
- `description` (string, nullable)
- `amount_btc` (string, nullable)
- `amount_usd` (number, nullable)
- `escrow_policy_id` (uuid, nullable)
- `status` (pending | funded | released | refunded)
- `funded_txid` (string, nullable)
- `released_txid` (string, nullable)
- `created_at`

### Disbursement

- `id` (uuid)
- `deal_id` (uuid)
- `payee_name` (string)
- `payee_type` (seller | buyer_agent | seller_agent | lender | title | hoa | tax_authority | other)
- `amount_usd` (number, nullable)
- `amount_btc` (string, nullable)
- `description` (string, nullable)
- `btc_address` (string, nullable)
- `status` (pending | paid)
- `paid_txid` (string, nullable)
- `paid_at` (timestamp, nullable)
- `created_at`

### Milestone

- `id` (uuid)
- `deal_id` (uuid)
- `name` (string)
- `description` (string, nullable)
- `due_date` (timestamp, nullable)
- `completed_at` (timestamp, nullable)
- `completed_by_party_id` (uuid, nullable)
- `is_required` (boolean)
- `order_index` (integer)
- `created_at`

## API endpoints (MVP)

### Deal rooms

- `POST /api/deals` create deal room
- `GET /api/deals/:id` read deal room + parties
- `PATCH /api/deals/:id` update status, deadlines

### Parties

- `POST /api/deals/:id/parties` invite party
- `PATCH /api/parties/:id` update wallet descriptor / pubkey

### POF

- `POST /api/deals/:id/pof/request` create challenge string
- `POST /api/deals/:id/pof/attest` submit signature + metadata
- `POST /api/deals/:id/pof/verify` verify signature + UTXOs
- `GET /api/deals/:id/pof/packet` download PDF + JSON

### Escrow

- `POST /api/deals/:id/escrow/policy` create escrow policy
- `GET /api/deals/:id/escrow` get address + terms
- `POST /api/deals/:id/escrow/funding` record funding txid
- `GET /api/deals/:id/escrow/receipt` download receipt PDF

### PSBT

- `POST /api/deals/:id/psbt` create PSBT (release/refund/closing)
- `POST /api/psbt/:id/request-signature` request signature from party
- `POST /api/psbt/:id/submit-signature` submit signed PSBT
- `POST /api/psbt/:id/finalize` finalize + broadcast (title only)

### Audit

- `GET /api/deals/:id/audit` list immutable events

### Contingencies

- `POST /api/deals/:id/contingencies` add contingency
- `GET /api/deals/:id/contingencies` list contingencies
- `PATCH /api/contingencies/:id` update (satisfy/waive/fail)

### Documents

- `POST /api/deals/:id/documents` upload document metadata
- `GET /api/deals/:id/documents` list documents
- `PATCH /api/documents/:id` update document status

### Funds

- `POST /api/deals/:id/funds` add fund requirement
- `GET /api/deals/:id/funds` list all funds
- `PATCH /api/funds/:id` update fund status (funded/released)

### Disbursements

- `POST /api/deals/:id/disbursements` add disbursement line item
- `GET /api/deals/:id/disbursements` list disbursements (settlement statement)
- `POST /api/disbursements/:id/pay` record payment

### Milestones

- `POST /api/deals/:id/milestones` add milestone
- `GET /api/deals/:id/milestones` list milestones
- `PATCH /api/milestones/:id` update/complete milestone
- `POST /api/deals/:id/milestones/defaults` create default milestones for transaction type

## Signing flow (title-company friendly)

1. **Title creates PSBT** for release/refund/closing.
2. **System requests signatures** from required parties.
3. **Parties sign** in their wallets and upload PSBT via QR/file.
4. **Title finalizes** and broadcasts (or uses a configured node).
5. **Audit log** records signatures, timestamps, and txids.

## POF verification paths

- **Primary**: BIP-322 generic signmessage with address/script proof.
- **Fallback**: legacy signmessage (if wallet lacks BIP-322).
- **UTXO proof**: explicit UTXO signing or ownership proof.

## Compliance and security posture

- Non-custodial: no private keys stored or transmitted.
- Use descriptors/policies internally for deterministic verification.
- Infrastructure: own Bitcoin Core + indexer (Esplora or equivalent).
- Immutable audit log with signed event hashes and optional anchoring.

## MVP artifacts

- POF packet PDF + verification QR.
- EMD receipt PDF with txid and confirmations.
- Closing memo with PSBT hashes and signer timestamps.
