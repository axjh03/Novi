-- Individual web and desktop access share one account and one permanently bound license.
-- Existing team accounts, passwords, licenses, and sessions are preserved.
BEGIN;

ALTER TABLE "AccessAccount" ADD CONSTRAINT "AccessAccount_individual_root"
  CHECK ("role" <> 'INDIVIDUAL' OR "parentId" IS NULL);

CREATE FUNCTION "access_no_individual_children"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "AccessAccount" WHERE "id" = NEW."parentId" AND "role" = 'INDIVIDUAL') THEN
    RAISE EXCEPTION 'Individual accounts cannot have child accounts';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "AccessAccount_no_individual_children" BEFORE INSERT OR UPDATE ON "AccessAccount"
  FOR EACH ROW EXECUTE FUNCTION "access_no_individual_children"();

CREATE FUNCTION "access_individual_license"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "AccessAccount" WHERE "id" = NEW."ownerId" AND "role" = 'INDIVIDUAL')
    AND NEW."accountId" IS DISTINCT FROM NEW."ownerId" THEN
    RAISE EXCEPTION 'An individual license must be bound directly to its owner';
  END IF;
  IF EXISTS (SELECT 1 FROM "AccessAccount" WHERE "id" = NEW."accountId" AND "role" = 'INDIVIDUAL')
    AND NEW."ownerId" IS DISTINCT FROM NEW."accountId" THEN
    RAISE EXCEPTION 'An individual account can only use its own license';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "AccessLicense_individual_owner" BEFORE INSERT OR UPDATE ON "AccessLicense"
  FOR EACH ROW EXECUTE FUNCTION "access_individual_license"();

-- AccessLicense.accountId is already unique: self-binding also enforces one license per individual,
-- including two grants racing in separate transactions. Existing no-transfer rules still apply.
COMMIT;
