ALTER TABLE market_sessions ADD COLUMN member_id TEXT;
UPDATE db_state SET schema_version=13 WHERE id=1;
