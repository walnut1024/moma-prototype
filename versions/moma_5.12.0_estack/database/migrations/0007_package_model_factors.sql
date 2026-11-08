CREATE TABLE token_package_model_factors (id TEXT PRIMARY KEY NOT NULL REFERENCES materials(id), workspace_revision INTEGER NOT NULL UNIQUE CHECK (workspace_revision > 0), record_json TEXT NOT NULL CHECK (json_valid(record_json)));
UPDATE db_state SET schema_version=7 WHERE id=1;
