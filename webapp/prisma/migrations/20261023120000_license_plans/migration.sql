-- License plans: Core, Pro, Ultimate and Lifetime (see src/shared/plans.ts for what each includes).
--
-- Adds a "plan" column to licenses and to purchase requests. Every existing row becomes ULTIMATE,
-- the plan that includes everything, so no current customer loses a feature; the administrator then
-- moves licenses to the plan that was actually bought. The default stays on the column so the
-- previous version of the site, which runs for a few minutes until the new one is deployed, can
-- still issue licenses. The new site always sets the plan itself.
--
-- The two ALTER TABLE statements are what `prisma migrate diff` generates for the schema change.
-- The CHECK constraints are extra (Prisma's schema file cannot express them): the database refuses
-- any other plan value, even from a bug, a script or a manual edit.
--
-- Changing a plan stays allowed: the protection triggers from 20261022120100_access_protection_rules
-- only lock a license's key, owner, assigned account and termination.
--
-- One transaction, so production gets all of it or none of it.
--
-- To undo, if ever needed (this deletes every plan), run in the Supabase SQL editor:
--   ALTER TABLE "LicenseRequest" DROP COLUMN "plan";
--   ALTER TABLE "AccessLicense" DROP COLUMN "plan";
--   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261023120000_license_plans';

BEGIN;

-- AlterTable
ALTER TABLE "AccessLicense" ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'ULTIMATE';

-- AlterTable
ALTER TABLE "LicenseRequest" ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'ULTIMATE';

ALTER TABLE "AccessLicense" ADD CONSTRAINT "AccessLicense_plan_check" CHECK ("plan" IN ('CORE', 'PRO', 'ULTIMATE', 'LIFETIME'));
ALTER TABLE "LicenseRequest" ADD CONSTRAINT "LicenseRequest_plan_check" CHECK ("plan" IN ('CORE', 'PRO', 'ULTIMATE', 'LIFETIME'));

COMMIT;
