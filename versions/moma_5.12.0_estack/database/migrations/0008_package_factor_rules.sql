UPDATE token_package_model_factors SET record_json=json_set(json_remove(record_json,'$.factor'),'$.legacyFactor',json_extract(record_json,'$.factor'),'$.rules',json('[]')) WHERE json_type(record_json,'$.factor') IS NOT NULL;
UPDATE db_state SET schema_version=8 WHERE id=1;
