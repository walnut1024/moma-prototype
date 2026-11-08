ALTER TABLE user_traffic_defaults RENAME TO traffic_limit_defaults;
ALTER TABLE traffic_limit_defaults ADD COLUMN model_rpm INTEGER NOT NULL DEFAULT 600 CHECK (typeof(model_rpm)='integer' AND model_rpm BETWEEN 1 AND 9007199254740991);
ALTER TABLE traffic_limit_defaults ADD COLUMN model_tpm INTEGER NOT NULL DEFAULT 30000000 CHECK (typeof(model_tpm)='integer' AND model_tpm BETWEEN 1 AND 9007199254740991);
CREATE TABLE traffic_limit_rules (scope TEXT NOT NULL CHECK (scope IN ('account','model','policy')), object_id TEXT NOT NULL, model_id TEXT NOT NULL DEFAULT '', rpm INTEGER NOT NULL CHECK (typeof(rpm)='integer' AND rpm BETWEEN 1 AND 9007199254740991), tpm INTEGER NOT NULL CHECK (typeof(tpm)='integer' AND tpm BETWEEN 1 AND 9007199254740991), PRIMARY KEY (scope,object_id,model_id), CHECK ((scope='policy')=(model_id<>'')));
UPDATE db_state SET schema_version=10 WHERE id=1;
