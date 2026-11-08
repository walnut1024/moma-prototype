CREATE TABLE IF NOT EXISTS user_traffic_defaults (id INTEGER PRIMARY KEY CHECK (id=1), rpm INTEGER NOT NULL CHECK (typeof(rpm)='integer' AND rpm BETWEEN 1 AND 9007199254740991), tpm INTEGER NOT NULL CHECK (typeof(tpm)='integer' AND tpm BETWEEN 1 AND 9007199254740991), revision INTEGER NOT NULL DEFAULT 1 CHECK (revision>0));
INSERT INTO user_traffic_defaults(id,rpm,tpm) VALUES(1,60,3000000) ON CONFLICT(id) DO NOTHING;
UPDATE db_state SET schema_version=9 WHERE id=1;
