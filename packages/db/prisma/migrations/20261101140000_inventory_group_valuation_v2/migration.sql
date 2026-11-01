BEGIN;

-- Capture one complete starting state without waiting indefinitely for writers.
-- Restore the caller's timeout after the initial locks have been acquired.
DO $migration_lock$
DECLARE previous_lock_timeout TEXT := current_setting('lock_timeout');
BEGIN
  PERFORM set_config('lock_timeout', '500ms', true);
  LOCK TABLE "pos_stores", "pos_product_stock_groups", "pos_products" IN SHARE ROW EXCLUSIVE MODE;
  PERFORM set_config('lock_timeout', previous_lock_timeout, true);
END
$migration_lock$;

-- Keep the previous ledger and triggers active for the old application during
-- rollout or rollback. Its per-variant history is not used by the new report.

CREATE TABLE "pos_inventory_valuation_v2_baselines" (
  "storeId" TEXT PRIMARY KEY REFERENCES "pos_stores"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "capturedAt" TIMESTAMPTZ(6) NOT NULL
);

-- A visible observation in a later transaction proves an earlier transaction
-- committed before the observation; a trigger's own timestamp cannot do that.
CREATE TABLE "pos_inventory_valuation_v2_transactions" (
  "storeId" TEXT NOT NULL REFERENCES "pos_stores"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "transactionKey" UUID NOT NULL,
  "transactionId" BIGINT NOT NULL,
  "capturedAt" TIMESTAMPTZ(6) NOT NULL,
  "observedAt" TIMESTAMPTZ(6),
  PRIMARY KEY ("storeId", "transactionKey")
);
CREATE INDEX "pos_inventory_v2_unobserved_idx" ON "pos_inventory_valuation_v2_transactions" ("storeId", "transactionId") WHERE "observedAt" IS NULL;

CREATE TABLE "pos_inventory_valuation_v2_events" (
  "id" BIGSERIAL PRIMARY KEY,
  "storeId" TEXT NOT NULL REFERENCES "pos_stores"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "entityType" TEXT NOT NULL CHECK ("entityType" IN ('PRODUCT', 'GROUP')),
  "entityId" TEXT NOT NULL,
  "occurredAt" TIMESTAMPTZ(6) NOT NULL,
  "snapshot" JSONB
);
CREATE INDEX "pos_inventory_v2_event_lookup_idx"
  ON "pos_inventory_valuation_v2_events" ("storeId", "entityType", "entityId", "occurredAt" DESC, "id" DESC);

-- PostgreSQL XIDs may be reused after a logical restore. Assign a fresh random
-- identity once per database transaction; SET LOCAL prevents reuse by a pooled
-- connection on its next transaction. Keep the XID only for diagnostics.
CREATE FUNCTION pos_inventory_valuation_v2_tx_key() RETURNS UUID LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  current_xid TEXT := txid_current()::text;
  saved_xid TEXT := current_setting('pos.inventory_valuation_xid', true);
  saved_key TEXT := current_setting('pos.inventory_valuation_key', true);
BEGIN
  IF saved_xid IS DISTINCT FROM current_xid OR saved_key IS NULL OR saved_key = '' THEN
    saved_key := pg_catalog.gen_random_uuid()::text;
    PERFORM set_config('pos.inventory_valuation_xid', current_xid, true);
    PERFORM set_config('pos.inventory_valuation_key', saved_key, true);
  END IF;
  RETURN saved_key::uuid;
END;
$$;

INSERT INTO "pos_inventory_valuation_v2_baselines" ("storeId", "capturedAt")
SELECT s."id", t.captured FROM "pos_stores" s CROSS JOIN (SELECT clock_timestamp() AS captured) t;

INSERT INTO "pos_inventory_valuation_v2_transactions" ("storeId", "transactionKey", "transactionId", "capturedAt")
SELECT "storeId", pos_inventory_valuation_v2_tx_key(), txid_current(), "capturedAt" FROM "pos_inventory_valuation_v2_baselines";

INSERT INTO "pos_inventory_valuation_v2_events" ("storeId", "entityType", "entityId", "occurredAt", "snapshot")
SELECT p."storeId", 'PRODUCT', p."id", b."capturedAt", jsonb_build_object(
  'name', p."name", 'sku', p."sku", 'barcode', p."barcode", 'categoryId', p."categoryId",
  'stock', p."stock", 'price', p."price", 'isActive', p."isActive", 'stockGroupId', p."stockGroupId",
  'unit', p."unit", 'unitMultiplierToBase', p."unitMultiplierToBase")
FROM "pos_products" p JOIN "pos_inventory_valuation_v2_baselines" b ON b."storeId" = p."storeId";

INSERT INTO "pos_inventory_valuation_v2_events" ("storeId", "entityType", "entityId", "occurredAt", "snapshot")
SELECT g."storeId", 'GROUP', g."id", b."capturedAt", jsonb_build_object('baseUnit', g."baseUnit", 'baseStock', g."baseStock")
FROM "pos_product_stock_groups" g JOIN "pos_inventory_valuation_v2_baselines" b ON b."storeId" = g."storeId";

CREATE FUNCTION pos_initialize_inventory_valuation_v2() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE captured TIMESTAMPTZ := clock_timestamp();
BEGIN
  INSERT INTO "pos_inventory_valuation_v2_baselines" ("storeId", "capturedAt") VALUES (NEW."id", captured);
  INSERT INTO "pos_inventory_valuation_v2_transactions" ("storeId", "transactionKey", "transactionId", "capturedAt")
  VALUES (NEW."id", pos_inventory_valuation_v2_tx_key(), txid_current(), captured);
  RETURN NEW;
END;
$$;

CREATE TRIGGER "pos_stores_inventory_valuation_v2"
AFTER INSERT ON "pos_stores" FOR EACH ROW EXECUTE FUNCTION pos_initialize_inventory_valuation_v2();

-- Reads of the report remain read-only. A later valuation write observes only
-- transactions already visible to it, skipping locked observation rows to
-- avoid introducing lock-order dependencies with product and group writes.
CREATE FUNCTION pos_observe_inventory_valuation_v2(_store_id TEXT) RETURNS void LANGUAGE plpgsql AS $$
DECLARE own_key UUID := pos_inventory_valuation_v2_tx_key();
BEGIN
  WITH candidates AS (
    SELECT "storeId", "transactionKey" FROM "pos_inventory_valuation_v2_transactions"
    WHERE "storeId" = _store_id AND "observedAt" IS NULL AND "transactionKey" <> own_key
    ORDER BY "transactionId", "transactionKey" FOR UPDATE SKIP LOCKED LIMIT 1000
  )
  UPDATE "pos_inventory_valuation_v2_transactions" t SET "observedAt" = clock_timestamp()
  FROM candidates c WHERE t."storeId" = c."storeId" AND t."transactionKey" = c."transactionKey";
END;
$$;

-- Each entity gets an independent post-image. Deferred triggers keep all state
-- changes from one transaction together and avoid cross-row valuation locks.
CREATE FUNCTION pos_record_inventory_valuation_v2() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  event_time TEXT;
  entity_type TEXT;
  event_state JSONB;
BEGIN
  IF TG_TABLE_NAME = 'pos_products' THEN
    entity_type := 'PRODUCT';
    IF TG_OP = 'UPDATE' AND ROW(OLD."storeId", OLD."name", OLD."sku", OLD."barcode", OLD."categoryId", OLD."stock", OLD."price", OLD."isActive", OLD."stockGroupId", OLD."unit", OLD."unitMultiplierToBase")
      IS NOT DISTINCT FROM ROW(NEW."storeId", NEW."name", NEW."sku", NEW."barcode", NEW."categoryId", NEW."stock", NEW."price", NEW."isActive", NEW."stockGroupId", NEW."unit", NEW."unitMultiplierToBase") THEN RETURN NULL; END IF;
    IF TG_OP <> 'DELETE' THEN
      event_state := jsonb_build_object('name', NEW."name", 'sku', NEW."sku", 'barcode', NEW."barcode", 'categoryId', NEW."categoryId",
        'stock', NEW."stock", 'price', NEW."price", 'isActive', NEW."isActive", 'stockGroupId', NEW."stockGroupId",
        'unit', NEW."unit", 'unitMultiplierToBase', NEW."unitMultiplierToBase");
    END IF;
  ELSE
    entity_type := 'GROUP';
    IF TG_OP = 'UPDATE' AND ROW(OLD."storeId", OLD."baseUnit", OLD."baseStock") IS NOT DISTINCT FROM ROW(NEW."storeId", NEW."baseUnit", NEW."baseStock") THEN RETURN NULL; END IF;
    IF TG_OP <> 'DELETE' THEN event_state := jsonb_build_object('baseUnit', NEW."baseUnit", 'baseStock', NEW."baseStock"); END IF;
  END IF;

  event_time := current_setting('pos.inventory_valuation_time', true);
  IF event_time IS NULL OR event_time = '' THEN
    event_time := clock_timestamp()::text;
    PERFORM set_config('pos.inventory_valuation_time', event_time, true);
  END IF;

  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD."storeId" IS DISTINCT FROM NEW."storeId") THEN
    PERFORM pos_observe_inventory_valuation_v2(OLD."storeId");
    INSERT INTO "pos_inventory_valuation_v2_transactions" ("storeId", "transactionKey", "transactionId", "capturedAt")
    SELECT OLD."storeId", pos_inventory_valuation_v2_tx_key(), txid_current(), event_time::timestamptz WHERE EXISTS (SELECT 1 FROM "pos_stores" s WHERE s."id" = OLD."storeId")
    ON CONFLICT ("storeId", "transactionKey") DO UPDATE
      SET "observedAt" = NULL,
          "capturedAt" = LEAST("pos_inventory_valuation_v2_transactions"."capturedAt", EXCLUDED."capturedAt");
    INSERT INTO "pos_inventory_valuation_v2_events" ("storeId", "entityType", "entityId", "occurredAt", "snapshot")
    SELECT OLD."storeId", entity_type, OLD."id", event_time::timestamptz, NULL
    WHERE EXISTS (SELECT 1 FROM "pos_stores" s WHERE s."id" = OLD."storeId");
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM pos_observe_inventory_valuation_v2(NEW."storeId");
    INSERT INTO "pos_inventory_valuation_v2_transactions" ("storeId", "transactionKey", "transactionId", "capturedAt")
    SELECT NEW."storeId", pos_inventory_valuation_v2_tx_key(), txid_current(), event_time::timestamptz WHERE EXISTS (SELECT 1 FROM "pos_stores" s WHERE s."id" = NEW."storeId")
    ON CONFLICT ("storeId", "transactionKey") DO UPDATE
      SET "observedAt" = NULL,
          "capturedAt" = LEAST("pos_inventory_valuation_v2_transactions"."capturedAt", EXCLUDED."capturedAt");
    INSERT INTO "pos_inventory_valuation_v2_events" ("storeId", "entityType", "entityId", "occurredAt", "snapshot")
    SELECT NEW."storeId", entity_type, NEW."id", event_time::timestamptz, event_state
    WHERE EXISTS (SELECT 1 FROM "pos_stores" s WHERE s."id" = NEW."storeId");
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "pos_products_inventory_valuation_v2"
AFTER INSERT OR UPDATE OR DELETE ON "pos_products" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION pos_record_inventory_valuation_v2();
CREATE CONSTRAINT TRIGGER "pos_groups_inventory_valuation_v2"
AFTER INSERT OR UPDATE OR DELETE ON "pos_product_stock_groups" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION pos_record_inventory_valuation_v2();

CREATE FUNCTION pos_inventory_valuation_state(_store_id TEXT, _cutoff TIMESTAMPTZ, _search TEXT, _category TEXT)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  WITH events AS (
    SELECT DISTINCT ON (e."entityType", e."entityId") e."entityType", e."entityId", e."snapshot"
    FROM "pos_inventory_valuation_v2_events" e
    WHERE _cutoff IS NOT NULL AND e."storeId" = _store_id AND e."occurredAt" < _cutoff
    ORDER BY e."entityType", e."entityId", e."occurredAt" DESC, e."id" DESC
  ), products AS (
    SELECT p."id", p."name", p."sku", p."barcode", p."categoryId", p."stock"::numeric AS stock,
      p."price", p."isActive", p."stockGroupId", p."unit", p."unitMultiplierToBase"::numeric AS multiplier
    FROM "pos_products" p WHERE _cutoff IS NULL AND p."storeId" = _store_id
    UNION ALL
    SELECT e."entityId", e."snapshot"->>'name', e."snapshot"->>'sku', e."snapshot"->>'barcode', e."snapshot"->>'categoryId',
      (e."snapshot"->>'stock')::numeric, (e."snapshot"->>'price')::numeric, (e."snapshot"->>'isActive')::boolean,
      e."snapshot"->>'stockGroupId', e."snapshot"->>'unit', (e."snapshot"->>'unitMultiplierToBase')::numeric
    FROM events e WHERE e."entityType" = 'PRODUCT' AND e."snapshot" IS NOT NULL
  ), groups AS (
    SELECT g."id", g."baseUnit", g."baseStock"::numeric AS stock
    FROM "pos_product_stock_groups" g WHERE _cutoff IS NULL AND g."storeId" = _store_id
    UNION ALL
    SELECT e."entityId", e."snapshot"->>'baseUnit', (e."snapshot"->>'baseStock')::numeric
    FROM events e WHERE e."entityType" = 'GROUP' AND e."snapshot" IS NOT NULL
  ), filtered AS (
    SELECT * FROM products p WHERE p."isActive"
      AND (NULLIF(_search, '') IS NULL OR p."name" ILIKE '%' || _search || '%' OR p."sku" ILIKE '%' || _search || '%' OR p."barcode" ILIKE '%' || _search || '%')
      AND (NULLIF(_category, '') IS NULL OR p."categoryId" = _category)
  ), group_values AS (
    SELECT selected."stockGroupId", g."id" AS group_id, g.stock,
      COUNT(p."id") FILTER (WHERE p."isActive" AND p.multiplier = 1 AND lower(btrim(p."unit")) = lower(btrim(g."baseUnit"))) AS base_count,
      MAX(p."price") FILTER (WHERE p."isActive" AND p.multiplier = 1 AND lower(btrim(p."unit")) = lower(btrim(g."baseUnit"))) AS base_price
    FROM (SELECT DISTINCT "stockGroupId" FROM filtered WHERE "stockGroupId" IS NOT NULL) selected
    LEFT JOIN groups g ON g."id" = selected."stockGroupId"
    LEFT JOIN products p ON p."stockGroupId" = selected."stockGroupId"
    GROUP BY selected."stockGroupId", g."id", g.stock
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM group_values WHERE group_id IS NULL OR stock::text IN ('NaN', 'Infinity', '-Infinity')
      OR (stock > 0 AND (base_count <> 1 OR base_price::text IN ('NaN', 'Infinity', '-Infinity'))))
      OR EXISTS (SELECT 1 FROM filtered WHERE "stockGroupId" IS NULL AND (stock::text IN ('NaN', 'Infinity', '-Infinity')
        OR (stock > 0 AND "price"::text IN ('NaN', 'Infinity', '-Infinity'))))
    THEN NULL
    ELSE ROUND(
      COALESCE((SELECT SUM(CASE WHEN stock <= 0 THEN 0 ELSE stock * "price" END) FROM filtered WHERE "stockGroupId" IS NULL), 0)
      + COALESCE((SELECT SUM(CASE WHEN stock <= 0 THEN 0 ELSE stock * base_price END) FROM group_values), 0), 2)
    END;
$$;

CREATE FUNCTION pos_current_inventory_valuation(_store_id TEXT, _search TEXT DEFAULT NULL, _category TEXT DEFAULT NULL)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT pos_inventory_valuation_state(_store_id, NULL, _search, _category);
$$;

CREATE FUNCTION pos_inventory_valuation_at(_store_id TEXT, _cutoff TIMESTAMPTZ)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM "pos_inventory_valuation_v2_baselines" b WHERE b."storeId" = _store_id AND b."capturedAt" < _cutoff)
    AND NOT EXISTS (SELECT 1 FROM "pos_inventory_valuation_v2_transactions" t WHERE t."storeId" = _store_id AND t."capturedAt" < _cutoff AND (t."observedAt" IS NULL OR t."observedAt" >= _cutoff))
    THEN pos_inventory_valuation_state(_store_id, _cutoff, NULL, NULL) ELSE NULL END;
$$;

-- The ledger is internal to the server-side Prisma role. Supabase may grant
-- API roles access through default ACLs in addition to PostgreSQL's PUBLIC
-- function EXECUTE default, so remove both kinds of grant. RLS provides a
-- second boundary for the exposed schema without changing owner access.
ALTER TABLE "pos_inventory_valuation_v2_baselines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_inventory_valuation_v2_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_inventory_valuation_v2_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "pos_inventory_valuation_v2_baselines", "pos_inventory_valuation_v2_transactions", "pos_inventory_valuation_v2_events" FROM PUBLIC;
REVOKE ALL ON SEQUENCE "pos_inventory_valuation_v2_events_id_seq" FROM PUBLIC;
REVOKE ALL ON FUNCTION pos_inventory_valuation_v2_tx_key(), pos_initialize_inventory_valuation_v2(), pos_observe_inventory_valuation_v2(TEXT), pos_record_inventory_valuation_v2(), pos_inventory_valuation_state(TEXT, TIMESTAMPTZ, TEXT, TEXT), pos_current_inventory_valuation(TEXT, TEXT, TEXT), pos_inventory_valuation_at(TEXT, TIMESTAMPTZ) FROM PUBLIC;
DO $$
DECLARE api_role TEXT;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') LOOP
    EXECUTE format('REVOKE ALL ON TABLE "pos_inventory_valuation_v2_baselines", "pos_inventory_valuation_v2_transactions", "pos_inventory_valuation_v2_events" FROM %I', api_role);
    EXECUTE format('REVOKE ALL ON SEQUENCE "pos_inventory_valuation_v2_events_id_seq" FROM %I', api_role);
    EXECUTE format('REVOKE ALL ON FUNCTION pos_inventory_valuation_v2_tx_key(), pos_initialize_inventory_valuation_v2(), pos_observe_inventory_valuation_v2(TEXT), pos_record_inventory_valuation_v2(), pos_inventory_valuation_state(TEXT, TIMESTAMPTZ, TEXT, TEXT), pos_current_inventory_valuation(TEXT, TEXT, TEXT), pos_inventory_valuation_at(TEXT, TIMESTAMPTZ) FROM %I', api_role);
  END LOOP;
END;
$$;

COMMIT;
