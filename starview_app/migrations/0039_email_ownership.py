# Generated with makemigrations --empty; PostgreSQL guards span two third-party models.
from django.db import migrations


FORWARD = r"""
-- The build fails on ambiguous legacy data; never guess which account owns it.
-- Lock both tables before checking so existing writers cannot invalidate the check.
LOCK TABLE auth_user, account_emailaddress IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
    IF EXISTS (
        SELECT lower(btrim(email)) FROM (
            SELECT id AS user_id, email FROM auth_user WHERE btrim(email) <> ''
            UNION ALL SELECT user_id, email FROM account_emailaddress
        ) owners GROUP BY lower(btrim(email)) HAVING count(DISTINCT user_id) > 1
    ) OR EXISTS (
        SELECT user_id FROM account_emailaddress
        GROUP BY user_id, lower(btrim(email)) HAVING count(*) > 1
    ) OR EXISTS (SELECT 1 FROM account_emailaddress WHERE btrim(email) = '') THEN
        RAISE EXCEPTION 'Email ownership conflicts must be resolved before migration. Run check_email_ownership; no accounts have been merged or deleted.';
    END IF;
END $$;

CREATE UNIQUE INDEX starview_user_email_ci_unique ON auth_user (lower(btrim(email))) WHERE btrim(email) <> '';
CREATE UNIQUE INDEX starview_address_email_ci_unique ON account_emailaddress (lower(btrim(email)));

CREATE FUNCTION starview_guard_email_owner() RETURNS trigger LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    normalized text := lower(btrim(NEW.email));
    owner_id integer;
BEGIN
    IF TG_TABLE_NAME = 'auth_user' THEN
        owner_id := NEW.id;
        IF normalized = '' THEN RETURN NEW; END IF;
    ELSE
        owner_id := NEW.user_id;
        IF normalized = '' THEN
            RAISE EXCEPTION 'An email address is required' USING ERRCODE = '23514', CONSTRAINT = 'starview_email_required';
        END IF;
    END IF;
    -- Cross-table checks need fresh statement snapshots after the lock wait.
    -- Django's configured PostgreSQL isolation is READ COMMITTED.
    IF current_setting('transaction_isolation') NOT IN ('read committed', 'read uncommitted') THEN
        RAISE EXCEPTION 'Email ownership writes require READ COMMITTED isolation';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('starview.email:' || normalized, 0));
    IF EXISTS (SELECT 1 FROM auth_user WHERE lower(btrim(email)) = normalized AND id <> owner_id)
       OR EXISTS (SELECT 1 FROM account_emailaddress WHERE lower(btrim(email)) = normalized AND user_id <> owner_id) THEN
        RAISE EXCEPTION 'Email is already owned by another account'
            USING ERRCODE = '23505', CONSTRAINT = 'starview_email_owner_unique';
    END IF;
    NEW.email := normalized;
    RETURN NEW;
END $$;

CREATE TRIGGER starview_user_email_owner BEFORE INSERT OR UPDATE OF email ON auth_user
FOR EACH ROW EXECUTE FUNCTION starview_guard_email_owner();
CREATE TRIGGER starview_address_email_owner BEFORE INSERT OR UPDATE OF email, user_id ON account_emailaddress
FOR EACH ROW EXECUTE FUNCTION starview_guard_email_owner();
"""

REVERSE = """
DROP TRIGGER starview_address_email_owner ON account_emailaddress;
DROP TRIGGER starview_user_email_owner ON auth_user;
DROP FUNCTION starview_guard_email_owner();
DROP INDEX starview_address_email_ci_unique;
DROP INDEX starview_user_email_ci_unique;
"""


class Migration(migrations.Migration):
    dependencies = [
        ('starview_app', '0038_welcome_email_receipt'),
        ('auth', '0012_alter_user_first_name_max_length'),
        ('account', '0009_emailaddress_unique_primary_email'),
    ]
    operations = [migrations.RunSQL(FORWARD, REVERSE)]
