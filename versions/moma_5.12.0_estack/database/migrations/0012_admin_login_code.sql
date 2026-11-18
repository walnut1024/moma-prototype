ALTER TABLE admin_accounts ADD COLUMN login_code TEXT;
CREATE UNIQUE INDEX admin_accounts_login_code ON admin_accounts(login_code);
UPDATE db_state SET schema_version=12 WHERE id=1;
