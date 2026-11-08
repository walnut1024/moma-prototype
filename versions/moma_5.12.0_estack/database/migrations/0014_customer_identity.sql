ALTER TABLE market_sessions ADD COLUMN user_id TEXT;
CREATE TABLE customer_credentials (user_id TEXT PRIMARY KEY NOT NULL,salt TEXT NOT NULL,digest TEXT NOT NULL CHECK(length(digest)=64));
CREATE TABLE customer_signup_challenges (username TEXT PRIMARY KEY NOT NULL,challenge_id TEXT NOT NULL,digest TEXT NOT NULL,issued_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
CREATE INDEX customer_signup_expiry ON customer_signup_challenges(expires_at);
UPDATE db_state SET schema_version=14 WHERE id=1;
