# Real Estate Transaction Enhancements

This document outlines the changes needed to handle all variations of real estate transactions beyond the current MVP.

## Current MVP Gaps Analysis

### 1. Transaction Types (Missing)

The MVP assumes a simple cash purchase. Real estate transactions vary significantly:

| Type | Description | Additional Requirements |
|------|-------------|------------------------|
| **Cash Purchase** | Current MVP scope | Basic flow works |
| **Financed Purchase** | Buyer has mortgage | Lender party, loan contingency, appraisal |
| **Short Sale** | Seller owes more than value | Bank approval, extended timelines |
| **REO/Bank-Owned** | Bank is seller | Corporate signing, as-is terms |
| **1031 Exchange** | Tax-deferred exchange | Qualified intermediary, strict timelines |
| **New Construction** | Builder as seller | Draw schedules, completion milestones |
| **Investor/Flip** | Quick close, assignment | Assignment clauses, double closing |

**Recommendation**: Add `transaction_type` field to DealRoom.

---

### 2. Additional Party Roles (Missing)

Current roles: `buyer | seller | title`

Real transactions involve:

| Role | Responsibilities | Signing Authority |
|------|------------------|-------------------|
| `buyer` | Signs purchase, funds EMD | PSBT signer |
| `seller` | Signs purchase, receives funds | PSBT signer |
| `title` | Coordinates, holds 3rd key | PSBT finalizer |
| `buyer_agent` | Represents buyer | Advisory only |
| `seller_agent` | Represents seller | Advisory only |
| `lender` | Provides financing | Approval authority |
| `attorney` | Legal review (some states) | May sign on behalf |
| `appraiser` | Property valuation | Report submission |
| `inspector` | Property inspection | Report submission |
| `hoa` | HOA document provider | Document submission |
| `surveyor` | Property survey | Document submission |

**Recommendation**: Expand `role` enum and add `signing_authority` boolean.

---

### 3. Contingencies & Milestones (Missing)

Real estate contracts have contingencies that must be satisfied or waived:

```
Contingency {
  id: uuid
  deal_id: uuid
  type: inspection | appraisal | financing | title | sale_of_home | hoa_review
  status: pending | satisfied | waived | failed
  deadline: timestamp
  satisfied_at: timestamp (nullable)
  waived_at: timestamp (nullable)
  waived_by_party_id: uuid (nullable)
  notes: text
  created_at: timestamp
}
```

**Common contingency types**:
- **Inspection**: Buyer can back out if issues found (typically 7-14 days)
- **Appraisal**: Property must appraise at purchase price (for financed deals)
- **Financing**: Buyer must secure loan approval (21-30 days)
- **Title**: Clear title must be obtainable
- **Sale of Home**: Buyer must sell existing home first
- **HOA Review**: Buyer reviews HOA docs (3-7 days)

---

### 4. Document Management (Missing)

Real estate transactions require numerous documents:

```
Document {
  id: uuid
  deal_id: uuid
  type: purchase_agreement | amendment | addendum | disclosure | 
        inspection_report | appraisal | title_commitment | survey |
        hoa_docs | closing_disclosure | deed | pof_packet | receipt
  name: string
  uploaded_by_party_id: uuid
  file_url: string
  file_hash: string (SHA-256 for integrity)
  status: draft | pending_signature | signed | recorded
  requires_signatures: boolean
  created_at: timestamp
}

DocumentSignature {
  id: uuid
  document_id: uuid
  party_id: uuid
  status: pending | signed | declined
  signed_at: timestamp (nullable)
  signature_hash: string (nullable)
}
```

---

### 5. Contract & Amendments (Missing)

Purchase agreements change during negotiation:

```
Contract {
  id: uuid
  deal_id: uuid
  version: integer
  purchase_price_usd: numeric
  emd_amount_usd: numeric
  emd_amount_btc: string
  closing_date: timestamp
  possession_date: timestamp
  terms_json: jsonb (flexible terms storage)
  status: draft | pending | executed | terminated
  created_at: timestamp
}

Amendment {
  id: uuid
  deal_id: uuid
  contract_id: uuid
  amendment_number: integer
  description: text
  changes_json: jsonb
  status: proposed | accepted | rejected
  proposed_by_party_id: uuid
  accepted_at: timestamp (nullable)
  created_at: timestamp
}
```

---

### 6. Multiple Fund Types (Missing)

Beyond EMD, transactions may involve:

```
Fund {
  id: uuid
  deal_id: uuid
  type: emd | option_fee | additional_deposit | repair_credit | closing_funds
  amount_btc: string
  amount_usd: numeric
  escrow_policy_id: uuid (nullable, links to escrow address)
  status: pending | funded | released | refunded
  funded_txid: string (nullable)
  released_txid: string (nullable)
  created_at: timestamp
}
```

| Fund Type | Purpose | Typical Amount |
|-----------|---------|----------------|
| EMD | Good faith deposit | 1-3% of price |
| Option Fee | Right to terminate (TX) | $100-500 |
| Additional Deposit | Strengthen offer | Varies |
| Repair Credit | Seller credit for repairs | Negotiated |
| Closing Funds | Balance due at closing | Price - EMD - Loan |

---

### 7. Disbursement & Settlement (Missing)

At closing, funds are distributed to multiple parties:

```
Disbursement {
  id: uuid
  deal_id: uuid
  payee_name: string
  payee_type: seller | buyer_agent | seller_agent | lender | title | 
              hoa | tax_authority | contractor | other
  amount_usd: numeric
  amount_btc: string (nullable)
  description: text
  btc_address: string (nullable)
  status: pending | paid
  paid_txid: string (nullable)
  paid_at: timestamp (nullable)
  created_at: timestamp
}
```

**Typical disbursements**:
- Seller proceeds
- Buyer/seller agent commissions (2.5-3% each)
- Existing mortgage payoff
- Property taxes (prorated)
- HOA dues (prorated)
- Title insurance premium
- Recording fees
- Transfer taxes

---

### 8. Property Details (Enhanced)

Current: Just `property_address`

Needed for title work and compliance:

```
Property {
  id: uuid
  deal_id: uuid
  address_street: string
  address_city: string
  address_state: string
  address_zip: string
  county: string
  legal_description: text
  parcel_number: string (APN/Tax ID)
  property_type: single_family | condo | townhouse | multi_family | land | commercial
  year_built: integer (nullable)
  lot_size_sqft: numeric (nullable)
  living_area_sqft: numeric (nullable)
  hoa_name: string (nullable)
  hoa_monthly_fee: numeric (nullable)
  created_at: timestamp
}
```

---

### 9. Milestones & Checklist (Missing)

Track deal progress with configurable milestones:

```
Milestone {
  id: uuid
  deal_id: uuid
  name: string
  description: text
  due_date: timestamp (nullable)
  completed_at: timestamp (nullable)
  completed_by_party_id: uuid (nullable)
  is_required: boolean
  order_index: integer
  created_at: timestamp
}
```

**Standard milestones**:
1. Contract executed
2. EMD deposited
3. Inspection completed
4. Inspection contingency resolved
5. Appraisal ordered
6. Appraisal received
7. Loan approved
8. Title commitment received
9. Title cleared
10. Closing disclosure sent
11. Final walkthrough
12. Closing/funding
13. Recording complete

---

### 10. Notifications & Communication (Missing)

```
Notification {
  id: uuid
  deal_id: uuid
  party_id: uuid
  type: deadline_reminder | signature_required | document_uploaded |
        status_change | contingency_deadline | message
  title: string
  message: text
  read_at: timestamp (nullable)
  created_at: timestamp
}

Message {
  id: uuid
  deal_id: uuid
  from_party_id: uuid
  message: text
  attachments: jsonb (nullable)
  created_at: timestamp
}
```

---

## Recommended Schema Changes

### Phase 1: Core Enhancements (High Priority)

```sql
-- Add transaction type to deals
ALTER TABLE deals ADD COLUMN transaction_type text DEFAULT 'cash_purchase';
-- Values: cash_purchase, financed, short_sale, reo, exchange_1031, new_construction

-- Expand party roles
-- Current: buyer, seller, title
-- Add: buyer_agent, seller_agent, lender, attorney, appraiser, inspector
ALTER TABLE parties ADD COLUMN signing_authority boolean DEFAULT false;
ALTER TABLE parties ADD COLUMN company_name text;
ALTER TABLE parties ADD COLUMN phone text;
ALTER TABLE parties ADD COLUMN license_number text;

-- Add contingencies
CREATE TABLE contingencies (
  id uuid PRIMARY KEY,
  deal_id uuid REFERENCES deals(id) ON DELETE CASCADE,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  deadline timestamptz,
  satisfied_at timestamptz,
  waived_at timestamptz,
  waived_by_party_id uuid REFERENCES parties(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL
);

-- Add documents
CREATE TABLE documents (
  id uuid PRIMARY KEY,
  deal_id uuid REFERENCES deals(id) ON DELETE CASCADE,
  type text NOT NULL,
  name text NOT NULL,
  uploaded_by_party_id uuid REFERENCES parties(id) ON DELETE SET NULL,
  file_url text,
  file_hash text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL
);
```

### Phase 2: Financial Enhancements

```sql
-- Multiple fund types
CREATE TABLE funds (
  id uuid PRIMARY KEY,
  deal_id uuid REFERENCES deals(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount_btc text,
  amount_usd numeric,
  escrow_policy_id uuid REFERENCES escrow_policies(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  funded_txid text,
  released_txid text,
  created_at timestamptz NOT NULL
);

-- Disbursements
CREATE TABLE disbursements (
  id uuid PRIMARY KEY,
  deal_id uuid REFERENCES deals(id) ON DELETE CASCADE,
  payee_name text NOT NULL,
  payee_type text NOT NULL,
  amount_usd numeric,
  amount_btc text,
  description text,
  btc_address text,
  status text NOT NULL DEFAULT 'pending',
  paid_txid text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL
);
```

### Phase 3: Property & Contract Details

```sql
-- Enhanced property info
CREATE TABLE properties (
  id uuid PRIMARY KEY,
  deal_id uuid REFERENCES deals(id) ON DELETE CASCADE,
  address_street text NOT NULL,
  address_city text NOT NULL,
  address_state text NOT NULL,
  address_zip text NOT NULL,
  county text,
  legal_description text,
  parcel_number text,
  property_type text,
  year_built integer,
  lot_size_sqft numeric,
  living_area_sqft numeric,
  hoa_name text,
  hoa_monthly_fee numeric,
  created_at timestamptz NOT NULL
);

-- Contract versioning
CREATE TABLE contracts (
  id uuid PRIMARY KEY,
  deal_id uuid REFERENCES deals(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  purchase_price_usd numeric,
  closing_date timestamptz,
  possession_date timestamptz,
  terms_json jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL
);

-- Amendments
CREATE TABLE amendments (
  id uuid PRIMARY KEY,
  deal_id uuid REFERENCES deals(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES contracts(id) ON DELETE CASCADE,
  amendment_number integer NOT NULL,
  description text,
  changes_json jsonb,
  status text NOT NULL DEFAULT 'proposed',
  proposed_by_party_id uuid REFERENCES parties(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL
);
```

---

## New API Endpoints Needed

### Contingencies
- `POST /api/deals/:id/contingencies` - Add contingency
- `GET /api/deals/:id/contingencies` - List contingencies
- `PATCH /api/contingencies/:id` - Update (satisfy/waive)

### Documents
- `POST /api/deals/:id/documents` - Upload document
- `GET /api/deals/:id/documents` - List documents
- `GET /api/documents/:id` - Download document
- `POST /api/documents/:id/sign` - Sign document

### Funds
- `POST /api/deals/:id/funds` - Add fund requirement
- `GET /api/deals/:id/funds` - List all funds
- `PATCH /api/funds/:id` - Update fund status

### Disbursements
- `POST /api/deals/:id/disbursements` - Add disbursement
- `GET /api/deals/:id/disbursements` - List disbursements (settlement statement)
- `POST /api/disbursements/:id/pay` - Record payment

### Contracts
- `POST /api/deals/:id/contracts` - Create contract version
- `GET /api/deals/:id/contracts` - List contract versions
- `POST /api/deals/:id/amendments` - Propose amendment
- `PATCH /api/amendments/:id` - Accept/reject amendment

---

## State-Specific Considerations

| State Type | Closing Entity | Special Requirements |
|------------|---------------|---------------------|
| **Title States** (CA, TX, FL, etc.) | Title Company | Standard flow |
| **Attorney States** (NY, MA, GA, etc.) | Attorney | Attorney must review/close |
| **Escrow States** (WA, OR) | Escrow Company | Similar to title |

**Recommendation**: Add `state_jurisdiction` to deals and conditionally require attorney party in attorney states.

---

## Summary: Implementation Priority

### Must Have (Phase 1)
1. Transaction type field
2. Extended party roles
3. Contingencies table + API
4. Basic document management

### Should Have (Phase 2)
5. Multiple fund types
6. Disbursement tracking
7. Contract versioning

### Nice to Have (Phase 3)
8. Enhanced property details
9. Milestone checklists
10. In-app messaging
11. Notification system

---

## Bitcoin-Specific Considerations

For Bitcoin-native real estate:

1. **Multi-fund escrow**: Each fund type may need separate multisig address
2. **Timelock variations**: Different refund conditions per fund type
3. **Atomic swaps**: For simultaneous closings (1031, contingent sales)
4. **Fee handling**: Who pays mining fees for each transaction
5. **Price volatility**: Lock-in mechanisms or real-time conversion
