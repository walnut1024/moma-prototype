CREATE TABLE token_package_records (collection TEXT NOT NULL CHECK (collection IN ('tokenPackages','tokenPackageTypes')), id TEXT NOT NULL, workspace_revision INTEGER NOT NULL UNIQUE CHECK (workspace_revision > 0), record_json TEXT NOT NULL CHECK (json_valid(record_json)), PRIMARY KEY (collection,id));
UPDATE db_state SET schema_version=6 WHERE id=1;
