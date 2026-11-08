ALTER TABLE customer_signup_challenges ADD COLUMN purpose TEXT NOT NULL DEFAULT 'signup';
CREATE INDEX market_sessions_user ON market_sessions(user_id);
CREATE TABLE customer_invitations (membership_id TEXT PRIMARY KEY NOT NULL, token_hash TEXT NOT NULL UNIQUE, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX customer_invitations_expiry ON customer_invitations(expires_at);
UPDATE db_state SET schema_version=15 WHERE id=1;
