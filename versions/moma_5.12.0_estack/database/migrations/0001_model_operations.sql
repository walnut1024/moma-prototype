CREATE TABLE db_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version INTEGER NOT NULL,
  commit_seq INTEGER NOT NULL DEFAULT 0 CHECK (commit_seq >= 0)
);
INSERT INTO db_state VALUES (1, 1, 0);

CREATE TABLE seed_runs (
  id TEXT PRIMARY KEY NOT NULL,
  content_hash TEXT NOT NULL,
  imported_at INTEGER NOT NULL,
  manifest_json TEXT NOT NULL CHECK (json_valid(manifest_json))
);

CREATE TABLE admin_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)
);

CREATE TABLE admin_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  actor_id TEXT NOT NULL REFERENCES admin_accounts(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  CHECK (expires_at > created_at)
);
CREATE INDEX sessions_actor ON admin_sessions(actor_id, expires_at);

CREATE TABLE materials (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  model_type TEXT NOT NULL,
  maker TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  usage_unit TEXT,
  profile_json TEXT NOT NULL CHECK (json_valid(profile_json)),
  capabilities_json TEXT NOT NULL CHECK (json_valid(capabilities_json)),
  origin TEXT NOT NULL CHECK (origin IN ('seed','user','imported')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX materials_list ON materials(deleted_at, model_type, updated_at DESC, id);

CREATE TABLE suppliers (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  profile_json TEXT NOT NULL CHECK (json_valid(profile_json)),
  builtin INTEGER NOT NULL DEFAULT 0 CHECK (builtin IN (0,1)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  origin TEXT NOT NULL CHECK (origin IN ('seed','user','imported')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE supplier_models (
  id TEXT PRIMARY KEY NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  material_id TEXT NOT NULL REFERENCES materials(id),
  declaration_json TEXT NOT NULL CHECK (json_valid(declaration_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  removed_at INTEGER,
  UNIQUE (id, material_id, supplier_id),
  UNIQUE (supplier_id, material_id)
);
CREATE INDEX supplier_models_material ON supplier_models(material_id, removed_at, supplier_id);

CREATE TABLE credentials (
  id TEXT PRIMARY KEY NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  name TEXT NOT NULL,
  masked_value TEXT NOT NULL,
  fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
  version INTEGER NOT NULL CHECK (version > 0),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  UNIQUE (id, supplier_id)
);
CREATE INDEX credentials_fingerprint ON credentials(supplier_id, fingerprint);

CREATE TABLE key_groups (
  id TEXT PRIMARY KEY NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  name TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at INTEGER,
  UNIQUE (id, supplier_id)
);
CREATE TABLE key_group_members (
  group_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  credential_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  PRIMARY KEY (group_id, credential_id),
  FOREIGN KEY (group_id, supplier_id) REFERENCES key_groups(id, supplier_id),
  FOREIGN KEY (credential_id, supplier_id) REFERENCES credentials(id, supplier_id)
);
CREATE INDEX group_members_credential ON key_group_members(credential_id);

CREATE TABLE channels (
  id TEXT PRIMARY KEY NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL,
  base_url TEXT NOT NULL,
  connection_json TEXT NOT NULL CHECK (json_valid(connection_json)),
  credential_mode TEXT NOT NULL CHECK (credential_mode IN ('none','direct','default','group','pool')),
  credential_id TEXT,
  key_group_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  config_epoch INTEGER NOT NULL DEFAULT 1 CHECK (config_epoch > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE (id, supplier_id),
  UNIQUE (supplier_id, code),
  FOREIGN KEY (credential_id, supplier_id) REFERENCES credentials(id, supplier_id),
  FOREIGN KEY (key_group_id, supplier_id) REFERENCES key_groups(id, supplier_id),
  CHECK (
    (credential_mode IN ('direct','default') AND credential_id IS NOT NULL AND key_group_id IS NULL)
    OR (credential_mode = 'group' AND key_group_id IS NOT NULL AND credential_id IS NULL)
    OR (credential_mode IN ('none','pool') AND credential_id IS NULL AND key_group_id IS NULL)
  )
);
CREATE INDEX channels_supplier ON channels(supplier_id, deleted_at, updated_at DESC, id);
CREATE INDEX channels_group ON channels(key_group_id);

CREATE TABLE channel_keys (
  channel_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  credential_id TEXT NOT NULL,
  priority INTEGER NOT NULL CHECK (priority BETWEEN 1 AND 100),
  position INTEGER NOT NULL CHECK (position >= 0),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  PRIMARY KEY (channel_id, credential_id),
  FOREIGN KEY (channel_id, supplier_id) REFERENCES channels(id, supplier_id),
  FOREIGN KEY (credential_id, supplier_id) REFERENCES credentials(id, supplier_id)
);
CREATE INDEX channel_keys_credential ON channel_keys(credential_id);

CREATE TABLE channel_models (
  id TEXT PRIMARY KEY NOT NULL,
  channel_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  supplier_model_id TEXT NOT NULL,
  material_id TEXT NOT NULL,
  upstream_model_id TEXT NOT NULL,
  mapping_json TEXT NOT NULL CHECK (json_valid(mapping_json)),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  config_epoch INTEGER NOT NULL DEFAULT 1 CHECK (config_epoch > 0),
  active_purchase_price_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  removed_at INTEGER,
  UNIQUE (id, material_id, supplier_id),
  UNIQUE (channel_id, supplier_model_id),
  FOREIGN KEY (channel_id, supplier_id) REFERENCES channels(id, supplier_id),
  FOREIGN KEY (supplier_model_id, material_id, supplier_id)
    REFERENCES supplier_models(id, material_id, supplier_id),
  FOREIGN KEY (active_purchase_price_id, id) REFERENCES price_versions(id, channel_model_id)
);
CREATE INDEX mappings_material ON channel_models(material_id, removed_at, supplier_id, id);
CREATE INDEX mappings_supplier_model ON channel_models(supplier_model_id, removed_at);

CREATE TABLE services (
  id TEXT PRIMARY KEY NOT NULL,
  material_id TEXT NOT NULL UNIQUE REFERENCES materials(id),
  code TEXT NOT NULL UNIQUE,
  mode TEXT CHECK (mode IN ('standard','provider')),
  mode_epoch INTEGER NOT NULL DEFAULT 1 CHECK (mode_epoch > 0),
  listing_status TEXT NOT NULL DEFAULT 'unlisted' CHECK (listing_status IN ('unlisted','listed','withdrawn')),
  calls_enabled INTEGER NOT NULL DEFAULT 0 CHECK (calls_enabled IN (0,1)),
  market_visible INTEGER NOT NULL DEFAULT 1 CHECK (market_visible IN (0,1)),
  stop_reason TEXT,
  scope_json TEXT NOT NULL CHECK (json_valid(scope_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE (id, material_id),
  CHECK (calls_enabled = 0 OR listing_status = 'listed')
);
CREATE INDEX services_list ON services(deleted_at, listing_status, updated_at DESC, id);

CREATE TABLE offers (
  id TEXT PRIMARY KEY NOT NULL,
  service_id TEXT NOT NULL,
  material_id TEXT NOT NULL,
  mode_epoch INTEGER NOT NULL CHECK (mode_epoch > 0),
  mode TEXT NOT NULL CHECK (mode IN ('standard','provider')),
  supplier_id TEXT REFERENCES suppliers(id),
  call_id TEXT NOT NULL,
  market_visible INTEGER NOT NULL DEFAULT 1 CHECK (market_visible IN (0,1)),
  calls_enabled INTEGER NOT NULL DEFAULT 0 CHECK (calls_enabled IN (0,1)),
  active_sale_price_id TEXT,
  active_route_id TEXT,
  active_publication_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL,
  retired_at INTEGER,
  UNIQUE (id, material_id),
  FOREIGN KEY (service_id, material_id) REFERENCES services(id, material_id),
  FOREIGN KEY (active_sale_price_id, id) REFERENCES price_versions(id, offer_id),
  FOREIGN KEY (active_route_id, id) REFERENCES route_versions(id, offer_id),
  FOREIGN KEY (active_publication_id, id) REFERENCES publications(id, offer_id),
  CHECK ((mode = 'standard' AND supplier_id IS NULL) OR (mode = 'provider' AND supplier_id IS NOT NULL))
);
CREATE UNIQUE INDEX offers_call_current ON offers(call_id) WHERE retired_at IS NULL;
CREATE UNIQUE INDEX offers_standard ON offers(service_id, mode_epoch) WHERE mode = 'standard';
CREATE UNIQUE INDEX offers_provider ON offers(service_id, mode_epoch, supplier_id) WHERE mode = 'provider';

CREATE TABLE offer_channels (
  offer_id TEXT NOT NULL,
  channel_model_id TEXT NOT NULL,
  material_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  removed_at INTEGER,
  PRIMARY KEY (offer_id, channel_model_id),
  FOREIGN KEY (offer_id, material_id) REFERENCES offers(id, material_id),
  FOREIGN KEY (channel_model_id, material_id, supplier_id)
    REFERENCES channel_models(id, material_id, supplier_id)
);
CREATE INDEX offer_channels_mapping ON offer_channels(channel_model_id, removed_at);

CREATE TABLE billing_units (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL,
  dimension TEXT NOT NULL,
  builtin INTEGER NOT NULL CHECK (builtin IN (0,1)),
  enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at INTEGER
);
CREATE TABLE currencies (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE CHECK (length(code) = 3 AND code = upper(code)),
  name TEXT NOT NULL,
  name_en TEXT NOT NULL,
  builtin INTEGER NOT NULL CHECK (builtin IN (0,1)),
  enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at INTEGER
);
CREATE TABLE billing_items (
  id TEXT PRIMARY KEY NOT NULL,
  unit_id TEXT NOT NULL REFERENCES billing_units(id),
  name TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description TEXT NOT NULL,
  builtin INTEGER NOT NULL CHECK (builtin IN (0,1)),
  enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at INTEGER
);
CREATE INDEX billing_items_unit ON billing_items(unit_id);

CREATE TABLE price_versions (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('purchase','sale')),
  channel_model_id TEXT REFERENCES channel_models(id),
  offer_id TEXT REFERENCES offers(id),
  version INTEGER NOT NULL CHECK (version > 0),
  source_json TEXT NOT NULL CHECK (json_valid(source_json)),
  created_at INTEGER NOT NULL,
  actor_id TEXT NOT NULL REFERENCES admin_accounts(id),
  UNIQUE (id, channel_model_id),
  UNIQUE (id, offer_id),
  UNIQUE (channel_model_id, version),
  UNIQUE (offer_id, version),
  CHECK ((kind = 'purchase' AND channel_model_id IS NOT NULL AND offer_id IS NULL)
    OR (kind = 'sale' AND offer_id IS NOT NULL AND channel_model_id IS NULL))
);
CREATE TABLE price_items (
  id TEXT PRIMARY KEY NOT NULL,
  price_version_id TEXT NOT NULL REFERENCES price_versions(id),
  billing_item_id TEXT NOT NULL REFERENCES billing_items(id),
  unit_id TEXT NOT NULL REFERENCES billing_units(id),
  currency_id TEXT NOT NULL REFERENCES currencies(id),
  amount_micros INTEGER NOT NULL CHECK (typeof(amount_micros) = 'integer' AND amount_micros >= 0),
  unit_quantity INTEGER NOT NULL CHECK (unit_quantity > 0),
  condition_json TEXT NOT NULL CHECK (json_valid(condition_json)),
  condition_hash TEXT NOT NULL,
  labels_json TEXT NOT NULL CHECK (json_valid(labels_json)),
  position INTEGER NOT NULL CHECK (position >= 0),
  UNIQUE (price_version_id, billing_item_id, unit_id, currency_id, condition_hash)
);
CREATE INDEX price_items_version ON price_items(price_version_id, position);
CREATE INDEX price_items_dictionary ON price_items(billing_item_id);
CREATE INDEX price_items_unit ON price_items(unit_id);
CREATE INDEX price_items_currency ON price_items(currency_id);

CREATE TABLE route_versions (
  id TEXT PRIMARY KEY NOT NULL,
  offer_id TEXT NOT NULL REFERENCES offers(id),
  version INTEGER NOT NULL CHECK (version > 0),
  strategy TEXT NOT NULL,
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  created_at INTEGER NOT NULL,
  actor_id TEXT NOT NULL REFERENCES admin_accounts(id),
  UNIQUE (id, offer_id),
  UNIQUE (offer_id, version)
);
CREATE TABLE route_members (
  route_version_id TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  channel_model_id TEXT NOT NULL,
  weight INTEGER NOT NULL CHECK (weight >= 0),
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (route_version_id, channel_model_id),
  FOREIGN KEY (route_version_id, offer_id) REFERENCES route_versions(id, offer_id),
  FOREIGN KEY (offer_id, channel_model_id) REFERENCES offer_channels(offer_id, channel_model_id)
);
CREATE INDEX route_members_mapping ON route_members(channel_model_id);

CREATE TABLE publications (
  id TEXT PRIMARY KEY NOT NULL,
  offer_id TEXT NOT NULL REFERENCES offers(id),
  mode_epoch INTEGER NOT NULL CHECK (mode_epoch > 0),
  sale_price_id TEXT NOT NULL,
  route_version_id TEXT NOT NULL,
  material_revision INTEGER NOT NULL CHECK (material_revision > 0),
  material_snapshot_json TEXT NOT NULL CHECK (json_valid(material_snapshot_json)),
  dependencies_json TEXT NOT NULL CHECK (json_valid(dependencies_json)),
  evidence_job_id TEXT REFERENCES simulation_jobs(id),
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  actor_id TEXT NOT NULL REFERENCES admin_accounts(id),
  UNIQUE (id, offer_id),
  FOREIGN KEY (sale_price_id, offer_id) REFERENCES price_versions(id, offer_id),
  FOREIGN KEY (route_version_id, offer_id) REFERENCES route_versions(id, offer_id)
);
CREATE INDEX publications_offer ON publications(offer_id, created_at DESC, id);

CREATE TABLE simulation_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('discover','connection','health','candidate','platform_trial')),
  actor_id TEXT NOT NULL REFERENCES admin_accounts(id),
  material_id TEXT REFERENCES materials(id),
  channel_id TEXT REFERENCES channels(id),
  offer_id TEXT REFERENCES offers(id),
  scenario_id TEXT NOT NULL,
  scenario_version TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  cancelled_at INTEGER,
  CHECK (expires_at > created_at)
);
CREATE INDEX jobs_channel ON simulation_jobs(channel_id, created_at DESC, id);
CREATE INDEX jobs_offer ON simulation_jobs(offer_id, created_at DESC, id);
CREATE TABLE simulation_items (
  id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL REFERENCES simulation_jobs(id),
  channel_model_id TEXT REFERENCES channel_models(id),
  credential_id TEXT REFERENCES credentials(id),
  item_key TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  finish_at INTEGER NOT NULL,
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  UNIQUE (job_id, item_key),
  CHECK (finish_at >= start_at)
);
CREATE INDEX simulation_items_job ON simulation_items(job_id, finish_at, id);

CREATE TABLE onboarding_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  service_id TEXT REFERENCES services(id),
  channel_model_id TEXT REFERENCES channel_models(id),
  goal TEXT NOT NULL CHECK (goal IN ('first_publish','reserve','attach')),
  status TEXT NOT NULL CHECK (status IN ('active','completed','cancelled')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX tasks_service ON onboarding_tasks(service_id, status, updated_at DESC);

CREATE TABLE operations (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT NOT NULL REFERENCES admin_accounts(id),
  session_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  command TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  expected_commit_seq INTEGER NOT NULL,
  http_status INTEGER NOT NULL,
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  created_at INTEGER NOT NULL,
  UNIQUE (actor_id, idempotency_key),
  UNIQUE (expected_commit_seq)
);

CREATE TRIGGER operation_guard BEFORE INSERT ON operations
BEGIN
  SELECT CASE WHEN NEW.expected_commit_seq != (SELECT commit_seq FROM db_state WHERE id = 1)
    THEN RAISE(ABORT, 'commit_conflict') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM admin_accounts a JOIN admin_sessions s ON s.actor_id = a.id
    WHERE a.id = NEW.actor_id AND a.enabled = 1 AND s.id = NEW.session_id
      AND s.revoked_at IS NULL
      AND s.expires_at > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  ) THEN RAISE(ABORT, 'session_invalid') END;
END;
CREATE TRIGGER operation_advance AFTER INSERT ON operations
BEGIN
  UPDATE db_state SET commit_seq = commit_seq + 1 WHERE id = 1;
END;

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  operation_id TEXT NOT NULL REFERENCES operations(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  diff_json TEXT NOT NULL CHECK (json_valid(diff_json)),
  created_at INTEGER NOT NULL
);
CREATE INDEX audit_entity ON audit_events(entity_type, entity_id, created_at DESC, id);
CREATE INDEX audit_operation ON audit_events(operation_id);
CREATE TABLE audit_models (
  audit_id TEXT NOT NULL REFERENCES audit_events(id),
  material_id TEXT NOT NULL REFERENCES materials(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (audit_id, material_id)
);
CREATE INDEX audit_model_history ON audit_models(material_id, created_at DESC, audit_id);
