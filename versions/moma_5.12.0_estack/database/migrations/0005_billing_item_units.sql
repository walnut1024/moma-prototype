UPDATE billing_items SET record_json=json_set(record_json,'$.unitId',unit_id) WHERE json_type(record_json,'$.unitId') IS NULL;
DROP INDEX billing_items_unit;
ALTER TABLE billing_items DROP COLUMN unit_id;
UPDATE db_state SET schema_version=5 WHERE id=1;
