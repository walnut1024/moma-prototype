CREATE TABLE IF NOT EXISTS new_model_services (id TEXT PRIMARY KEY NOT NULL, call_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK (revision > 0), record_json TEXT NOT NULL CHECK (json_valid(record_json)), created_at INTEGER NOT NULL, deleted_at INTEGER, imported INTEGER NOT NULL CHECK (imported IN (0,1)));
CREATE UNIQUE INDEX IF NOT EXISTS new_model_services_call_id ON new_model_services(call_id) WHERE deleted_at IS NULL;
UPDATE db_state SET schema_version=18 WHERE id=1 AND schema_version=17;
