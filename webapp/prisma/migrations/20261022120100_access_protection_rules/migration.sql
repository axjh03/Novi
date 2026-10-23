-- Protection rules for accounts and licenses, rewritten for PostgreSQL from the original SQLite
-- migration. Prisma's schema file cannot express them, so they live only here.
--
-- They are a backstop under the checks in src/lib/access.ts. The app itself never makes these
-- changes; the database refuses them even if a bug, a script or a manual edit in the Supabase
-- dashboard tries. They only add checks: no existing row is read, changed or removed.
--
-- One transaction, so production gets all four rules or none of them.
--
-- To undo, if ever needed, run in the Supabase SQL editor:
--   DROP TRIGGER "AccessAccount_no_move" ON "AccessAccount";
--   DROP TRIGGER "AccessLicense_no_delete" ON "AccessLicense";
--   DROP TRIGGER "AccessLicense_no_transfer" ON "AccessLicense";
--   DROP FUNCTION "access_reject_change"();
--   DROP INDEX "AccessAccount_single_admin";
--   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261022120100_access_protection_rules';

BEGIN;

-- 1. Only one administrator account can ever exist, including a deleted one.
CREATE UNIQUE INDEX "AccessAccount_single_admin" ON "AccessAccount" ("role") WHERE "role" = 'ADMIN';

-- Shared by the three triggers below: refuses the change with the message given as the trigger's argument.
CREATE FUNCTION "access_reject_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%', TG_ARGV[0];
END;
$$;

-- 2. A license keeps its key and owner forever. Once assigned to a desktop account it stays with that
--    account, and a terminated license never becomes active again. Still allowed: assigning an
--    unassigned license, renewing it (a new expiresAt), and terminating it.
CREATE TRIGGER "AccessLicense_no_transfer" BEFORE UPDATE ON "AccessLicense" FOR EACH ROW
WHEN (NEW."key" <> OLD."key" OR NEW."ownerId" <> OLD."ownerId"
  OR (OLD."accountId" IS NOT NULL AND NEW."accountId" IS DISTINCT FROM OLD."accountId")
  OR (OLD."status" = 'TERMINATED' AND NEW."status" <> 'TERMINATED'))
EXECUTE FUNCTION "access_reject_change"('License identity and assigned account are permanent');

-- 3. Licenses are terminated, never deleted, so who held which license is never lost.
CREATE TRIGGER "AccessLicense_no_delete" BEFORE DELETE ON "AccessLicense" FOR EACH ROW
EXECUTE FUNCTION "access_reject_change"('Licenses must be terminated, never deleted');

-- 4. An account's role and its place in the hierarchy never change.
CREATE TRIGGER "AccessAccount_no_move" BEFORE UPDATE ON "AccessAccount" FOR EACH ROW
WHEN (NEW."role" <> OLD."role" OR NEW."parentId" IS DISTINCT FROM OLD."parentId")
EXECUTE FUNCTION "access_reject_change"('Account role and hierarchy are permanent');

COMMIT;
