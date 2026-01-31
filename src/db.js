const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const query = (text, params) => pool.query(text, params);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForDb = async () => {
  const attempts = Number(process.env.DB_RETRY_ATTEMPTS || 12);
  const delayMs = Number(process.env.DB_RETRY_DELAY_MS || 500);
  let lastError;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await query("SELECT 1");
      return;
    } catch (error) {
      lastError = error;
      await sleep(delayMs);
    }
  }
  throw lastError;
};

const initDb = async () => {
  await waitForDb();
  await query(`
    CREATE TABLE IF NOT EXISTS deals (
      id uuid PRIMARY KEY,
      status text NOT NULL,
      transaction_type text NOT NULL DEFAULT 'cash_purchase',
      property_address text NOT NULL,
      purchase_price_usd numeric,
      emd_amount_btc text,
      emd_amount_usd_at_funding numeric,
      deadline_funding timestamptz,
      deadline_close timestamptz,
      state_jurisdiction text,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    );

    CREATE TABLE IF NOT EXISTS parties (
      id uuid PRIMARY KEY,
      deal_id uuid REFERENCES deals(id) ON DELETE CASCADE,
      role text NOT NULL,
      display_name text NOT NULL,
      email text NOT NULL,
      phone text,
      company_name text,
      license_number text,
      signing_authority boolean NOT NULL DEFAULT false,
      wallet_descriptor text,
      pubkey text,
      created_at timestamptz NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pof_requests (
      id uuid PRIMARY KEY,
      deal_id uuid REFERENCES deals(id) ON DELETE CASCADE,
      challenge text NOT NULL,
      requested_amount_btc text,
      requested_amount_usd numeric,
      created_at timestamptz NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pof_attestations (
      id uuid PRIMARY KEY,
      deal_id uuid REFERENCES deals(id) ON DELETE CASCADE,
      party_id uuid REFERENCES parties(id) ON DELETE SET NULL,
      proof_type text NOT NULL,
      address_or_descriptor text,
      signature text,
      verified boolean NOT NULL,
      verified_at timestamptz,
      utxos_total_btc text,
      packet_pdf_url text,
      packet_json_url text,
      created_at timestamptz NOT NULL
    );

    CREATE TABLE IF NOT EXISTS escrow_policies (
      id uuid PRIMARY KEY,
      deal_id uuid REFERENCES deals(id) ON DELETE CASCADE,
      policy_type text NOT NULL,
      descriptor text,
      refund_timelock timestamptz,
      address text,
      terms_hash text,
      created_at timestamptz NOT NULL
    );

    CREATE TABLE IF NOT EXISTS escrow_fundings (
      id uuid PRIMARY KEY,
      deal_id uuid REFERENCES deals(id) ON DELETE CASCADE,
      txid text,
      amount_btc text,
      confirmations int NOT NULL,
      funded_at timestamptz,
      receipt_pdf_url text,
      created_at timestamptz NOT NULL
    );

    CREATE TABLE IF NOT EXISTS psbt_sessions (
      id uuid PRIMARY KEY,
      deal_id uuid REFERENCES deals(id) ON DELETE CASCADE,
      type text NOT NULL,
      psbt_base64 text,
      psbt_hash text,
      status text NOT NULL,
      created_by_party_id uuid REFERENCES parties(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL
    );

    CREATE TABLE IF NOT EXISTS psbt_signatures (
      id uuid PRIMARY KEY,
      psbt_session_id uuid REFERENCES psbt_sessions(id) ON DELETE CASCADE,
      party_id uuid REFERENCES parties(id) ON DELETE SET NULL,
      status text NOT NULL,
      signed_psbt_base64 text,
      signed_at timestamptz
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id uuid PRIMARY KEY,
      deal_id uuid REFERENCES deals(id) ON DELETE CASCADE,
      type text NOT NULL,
      actor_party_id uuid REFERENCES parties(id) ON DELETE SET NULL,
      payload_json jsonb NOT NULL,
      txid text,
      created_at timestamptz NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contingencies (
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

    CREATE TABLE IF NOT EXISTS documents (
      id uuid PRIMARY KEY,
      deal_id uuid REFERENCES deals(id) ON DELETE CASCADE,
      type text NOT NULL,
      name text NOT NULL,
      uploaded_by_party_id uuid REFERENCES parties(id) ON DELETE SET NULL,
      file_url text,
      file_hash text,
      status text NOT NULL DEFAULT 'draft',
      requires_signatures boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_signatures (
      id uuid PRIMARY KEY,
      document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
      party_id uuid REFERENCES parties(id) ON DELETE SET NULL,
      status text NOT NULL DEFAULT 'pending',
      signed_at timestamptz,
      signature_hash text,
      created_at timestamptz NOT NULL
    );

    CREATE TABLE IF NOT EXISTS funds (
      id uuid PRIMARY KEY,
      deal_id uuid REFERENCES deals(id) ON DELETE CASCADE,
      type text NOT NULL,
      description text,
      amount_btc text,
      amount_usd numeric,
      escrow_policy_id uuid REFERENCES escrow_policies(id) ON DELETE SET NULL,
      status text NOT NULL DEFAULT 'pending',
      funded_txid text,
      released_txid text,
      created_at timestamptz NOT NULL
    );

    CREATE TABLE IF NOT EXISTS disbursements (
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

    CREATE TABLE IF NOT EXISTS milestones (
      id uuid PRIMARY KEY,
      deal_id uuid REFERENCES deals(id) ON DELETE CASCADE,
      name text NOT NULL,
      description text,
      due_date timestamptz,
      completed_at timestamptz,
      completed_by_party_id uuid REFERENCES parties(id) ON DELETE SET NULL,
      is_required boolean NOT NULL DEFAULT true,
      order_index integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_parties_deal_id ON parties(deal_id);
    CREATE INDEX IF NOT EXISTS idx_contingencies_deal_id ON contingencies(deal_id);
    CREATE INDEX IF NOT EXISTS idx_documents_deal_id ON documents(deal_id);
    CREATE INDEX IF NOT EXISTS idx_funds_deal_id ON funds(deal_id);
    CREATE INDEX IF NOT EXISTS idx_disbursements_deal_id ON disbursements(deal_id);
    CREATE INDEX IF NOT EXISTS idx_milestones_deal_id ON milestones(deal_id);
    CREATE INDEX IF NOT EXISTS idx_pof_requests_deal_id ON pof_requests(deal_id);
    CREATE INDEX IF NOT EXISTS idx_pof_attestations_deal_id ON pof_attestations(deal_id);
    CREATE INDEX IF NOT EXISTS idx_escrow_policies_deal_id ON escrow_policies(deal_id);
    CREATE INDEX IF NOT EXISTS idx_escrow_fundings_deal_id ON escrow_fundings(deal_id);
    CREATE INDEX IF NOT EXISTS idx_psbt_sessions_deal_id ON psbt_sessions(deal_id);
    CREATE INDEX IF NOT EXISTS idx_audit_events_deal_id ON audit_events(deal_id);
  `);
};

module.exports = {
  pool,
  query,
  initDb
};
