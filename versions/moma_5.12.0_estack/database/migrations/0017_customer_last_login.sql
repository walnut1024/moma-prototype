CREATE TABLE customer_last_login (user_id TEXT PRIMARY KEY NOT NULL, logged_at INTEGER NOT NULL);
INSERT INTO customer_last_login(user_id,logged_at) SELECT user_id,MAX(created_at) FROM tenant_login_events GROUP BY user_id;
UPDATE db_state SET schema_version=17 WHERE id=1;
