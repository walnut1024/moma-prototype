// Tests that start with the latest isolated database reconstruct earlier offer columns before migrating.
export const resetMarketSchemaFixture = db => [
  'DROP TABLE market_calls',
  'DROP TABLE market_orders',
  'DROP TABLE market_sessions',
  'DROP INDEX offers_provider',
  'ALTER TABLE offers DROP COLUMN channel_model_id',
  'ALTER TABLE offers DROP COLUMN listing_stage',
  'ALTER TABLE offers DROP COLUMN gray_tenants_json',
  "CREATE UNIQUE INDEX offers_provider ON offers(service_id,mode_epoch,supplier_id) WHERE mode='provider' AND retired_at IS NULL",
].map(sql=>db.prepare(sql));
