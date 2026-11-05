CREATE TABLE IF NOT EXISTS model_template_records(id TEXT PRIMARY KEY NOT NULL,material_id TEXT NOT NULL REFERENCES materials(id),record_json TEXT NOT NULL CHECK(json_valid(record_json)),removed_at INTEGER);
UPDATE db_state SET schema_version=3 WHERE id=1;

DROP INDEX offers_standard;
CREATE UNIQUE INDEX offers_standard ON offers(service_id, mode_epoch) WHERE mode='standard' AND retired_at IS NULL;
DROP INDEX offers_provider;
CREATE UNIQUE INDEX offers_provider ON offers(service_id, mode_epoch, supplier_id) WHERE mode='provider' AND retired_at IS NULL;

CREATE TABLE model_price_records(id TEXT PRIMARY KEY NOT NULL,record_collection TEXT NOT NULL,record_json TEXT NOT NULL CHECK(json_valid(record_json)));
