-- MyVault: Production PostgreSQL Schema & Constraints

-- 1. Accounts Table with Strict Integrity
CREATE TABLE accounts_account (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL, -- Assuming standard Django User ID
    account_type VARCHAR(10) NOT NULL,
    balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraint: Prevent negative balance at the DB level
    CONSTRAINT balance_non_negative CHECK (balance >= 0)
);

-- Indexing for performance (Owner lookup and active status filtering)
CREATE INDEX idx_accounts_user_id ON accounts_account(user_id);
CREATE INDEX idx_accounts_active ON accounts_account(is_active);


-- 2. Transactions Table (Immutable Ledger)
CREATE TABLE accounts_transaction (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES accounts_account(id) ON DELETE PROTECT,
    receiver_id UUID REFERENCES accounts_account(id) ON DELETE PROTECT,
    amount DECIMAL(15, 2) NOT NULL,
    transaction_type VARCHAR(15) NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraint: Amount must be positive
    CONSTRAINT transaction_amount_positive CHECK (amount > 0)
);

-- Indexing for history lookups (crucial for banking performance)
CREATE INDEX idx_transactions_sender ON accounts_transaction(sender_id);
CREATE INDEX idx_transactions_receiver ON accounts_transaction(receiver_id);
CREATE INDEX idx_transactions_created_at ON accounts_transaction(created_at DESC);


-- 3. Trigger Function: Enforce Ledger Immutability
CREATE OR REPLACE FUNCTION protect_transaction_ledger()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Transaction records are immutable. Operation [%] is forbidden on this table.', TG_OP;
END;
$$ LANGUAGE plpgsql;

-- Apply Immutability Trigger
CREATE TRIGGER tr_prevent_transaction_update_delete
BEFORE UPDATE OR DELETE ON accounts_transaction
FOR EACH ROW EXECUTE FUNCTION protect_transaction_ledger();


-- 4. Trigger Function: Explicit Negative Balance Guard (Redundancy)
CREATE OR REPLACE FUNCTION guard_account_balance()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.balance < 0 THEN
        RAISE EXCEPTION 'Vault Violation: Attempted negative balance [%] on account [%]', NEW.balance, NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply Balance Guard Trigger
CREATE TRIGGER tr_guard_balance_update
BEFORE UPDATE ON accounts_account
FOR EACH ROW EXECUTE FUNCTION guard_account_balance();


-- EXPLANATION: Why Database Constraints are Mandatory
-- 1. Error Defense-in-Depth: Application bugs (e.g., race conditions, logic errors) are common.
--    Database constraints act as the absolute "Final Authority" that prevents invalid data 
--    from ever hitting the disk.
-- 2. Multi-Client Integrity: If data is updated via SQL shell, a data science tool, 
--    or another microservice bypassing the Django backend, the constraints still apply.
-- 3. Performance: PostgreSQL handles CHECK constraints extremely efficiently 
--    during the write process without requiring additional application-level overhead.
-- 4. ACID Compliance: Constraints are the "C" in ACID. They ensure the database 
--    is always in a valid state before and after any transaction.
