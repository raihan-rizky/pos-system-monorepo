BEGIN;

-- Install the cost baseline and triggers atomically with respect to stock writers.
SET LOCAL lock_timeout = '5s';
LOCK TABLE "pos_stores", "pos_product_stock_groups", "pos_products" IN SHARE ROW EXCLUSIVE MODE;
SET LOCAL lock_timeout = DEFAULT;

-- A shared balance is decomposed into whole larger units and then its remainder.
-- Arrays are ordered largest to smallest; the last unit also values fractional stock.
CREATE FUNCTION pos_calculate_unit_inventory_cost(
  balance numeric, multipliers numeric[], costs numeric[]
) RETURNS TABLE(value numeric, unvalued_count integer)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  remaining numeric := GREATEST(COALESCE(balance, 0), 0);
  total numeric := 0;
  quantity numeric;
  effective_cost numeric;
  fallback_cost numeric;
  fallback_multiplier numeric;
  unit_count integer := COALESCE(array_length(multipliers, 1), 0);
  i integer;
BEGIN
  IF remaining = 0 THEN RETURN QUERY SELECT 0::numeric, 0; RETURN; END IF;
  IF unit_count = 0 THEN RETURN QUERY SELECT 0::numeric, 1; RETURN; END IF;
  -- The smallest unit with an actual HPP supplies only missing HPP values.
  FOR i IN REVERSE unit_count..1 LOOP
    IF costs[i] IS NOT NULL THEN
      fallback_cost := costs[i];
      fallback_multiplier := multipliers[i];
      EXIT;
    END IF;
  END LOOP;
  IF fallback_cost IS NULL THEN RETURN QUERY SELECT 0::numeric, 1; RETURN; END IF;
  FOR i IN 1..unit_count LOOP
    quantity := CASE WHEN i = unit_count THEN remaining / multipliers[i]
      ELSE floor(remaining / multipliers[i]) END;
    remaining := remaining - quantity * multipliers[i];
    effective_cost := COALESCE(costs[i], fallback_cost * multipliers[i] / fallback_multiplier);
    total := total + quantity * effective_cost;
  END LOOP;
  RETURN QUERY SELECT round(total, 2), 0;
END;
$$;

-- One row per physical stock pool, independent of the number of catalog units.
-- The optional key filter lets statement triggers revalue only affected pools.
CREATE FUNCTION pos_inventory_cost_entities(target_store text, entity_keys text[] DEFAULT NULL)
RETURNS TABLE(entity_key text, value numeric, unvalued_count integer)
LANGUAGE sql STABLE AS $$
  WITH members AS (
    SELECT CASE WHEN g.id IS NULL THEN 'product:' || p.id ELSE 'group:' || g.id END AS entity_key,
      p.id,
      CASE WHEN g.id IS NULL THEN
        CASE WHEN p.stock > 0 AND p.stock < 'Infinity'::double precision THEN p.stock::numeric ELSE 0 END
      ELSE CASE WHEN g."baseStock" > 0 AND g."baseStock" < 'Infinity'::double precision
        THEN g."baseStock"::numeric ELSE 0 END END AS balance,
      CASE WHEN g.id IS NULL THEN 1::numeric
        WHEN p."unitMultiplierToBase" > 0 AND p."unitMultiplierToBase" < 'Infinity'::double precision
        THEN p."unitMultiplierToBase"::numeric ELSE NULL END AS multiplier,
      CASE WHEN p."costPrice" >= 0 AND p."costPrice" < 'Infinity'::numeric THEN p."costPrice" ELSE NULL END AS cost
    FROM pos_products p
    LEFT JOIN pos_product_stock_groups g ON g.id = p."stockGroupId" AND g."storeId" = p."storeId"
    WHERE p."storeId" = target_store AND p."isActive"
      AND (entity_keys IS NULL
        OR p.id = ANY(ARRAY(SELECT substr(k, 9) FROM unnest(entity_keys) k WHERE left(k, 8) = 'product:'))
        OR p."stockGroupId" = ANY(ARRAY(SELECT substr(k, 7) FROM unnest(entity_keys) k WHERE left(k, 6) = 'group:')))
      AND (entity_keys IS NULL OR
        CASE WHEN g.id IS NULL THEN 'product:' || p.id ELSE 'group:' || g.id END = ANY(entity_keys))
  ), balances AS (
    SELECT m.entity_key, max(m.balance) AS balance FROM members m GROUP BY m.entity_key
  ), units AS (
    -- Duplicate unit sizes are aliases of one stock pool, never extra inventory.
    SELECT DISTINCT ON (m.entity_key, m.multiplier) m.entity_key, m.multiplier, m.cost
    FROM members m WHERE m.multiplier IS NOT NULL
    ORDER BY m.entity_key, m.multiplier, (m.cost IS NULL), m.id COLLATE "C"
  ), unit_arrays AS (
    SELECT u.entity_key, array_agg(u.multiplier ORDER BY u.multiplier DESC) AS multipliers,
      array_agg(u.cost ORDER BY u.multiplier DESC) AS costs
    FROM units u GROUP BY u.entity_key
  )
  SELECT b.entity_key, result.value, result.unvalued_count
  FROM balances b LEFT JOIN unit_arrays a ON a.entity_key = b.entity_key
  CROSS JOIN LATERAL pos_calculate_unit_inventory_cost(b.balance, a.multipliers, a.costs) result;
$$;

-- Keep old selling-price snapshots identifiable instead of relabelling them HPP.
ALTER TABLE pos_inventory_valuation_baselines
  ADD COLUMN method text NOT NULL DEFAULT 'selling_price',
  ADD COLUMN "unvaluedCount" integer NOT NULL DEFAULT 0;
ALTER TABLE pos_inventory_valuation_baselines DROP CONSTRAINT pos_inventory_valuation_baselines_pkey;
ALTER TABLE pos_inventory_valuation_baselines ADD PRIMARY KEY ("storeId", method);
ALTER TABLE pos_inventory_valuation_changes
  ADD COLUMN method text NOT NULL DEFAULT 'selling_price',
  ADD COLUMN "unvaluedDelta" integer NOT NULL DEFAULT 0;
CREATE INDEX pos_inventory_valuation_changes_method_time_idx
  ON pos_inventory_valuation_changes ("storeId", method, "occurredAt");

CREATE TABLE pos_inventory_cost_entity_values (
  "storeId" text NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "entityKey" text NOT NULL,
  value numeric(65,20) NOT NULL,
  "unvaluedCount" integer NOT NULL,
  PRIMARY KEY ("storeId", "entityKey")
);

INSERT INTO pos_inventory_cost_entity_values ("storeId", "entityKey", value, "unvaluedCount")
SELECT s.id, e.entity_key, e.value, e.unvalued_count
FROM pos_stores s CROSS JOIN LATERAL pos_inventory_cost_entities(s.id) e;

INSERT INTO pos_inventory_valuation_baselines ("storeId", "capturedAt", value, method, "unvaluedCount")
SELECT s.id, clock_timestamp(), COALESCE(sum(e.value), 0), 'unit_hpp', COALESCE(sum(e."unvaluedCount"), 0)
FROM pos_stores s LEFT JOIN pos_inventory_cost_entity_values e ON e."storeId" = s.id GROUP BY s.id;

CREATE FUNCTION initialize_inventory_unit_cost_valuation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO pos_inventory_valuation_baselines ("storeId", "capturedAt", value, method)
  VALUES (NEW.id, clock_timestamp(), 0, 'unit_hpp');
  RETURN NEW;
END;
$$;
CREATE TRIGGER pos_stores_inventory_unit_cost
AFTER INSERT ON pos_stores FOR EACH ROW EXECUTE FUNCTION initialize_inventory_unit_cost_valuation();

-- Per-entity locks serialize concurrent changes to the same stock pool. A bulk
-- statement touching several units of one group produces only one journal delta.
CREATE FUNCTION record_inventory_unit_cost_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  select_template text;
  affected_sql text := '';
  affected record;
  old_value numeric;
  old_unvalued integer;
  new_value numeric;
  new_unvalued integer;
BEGIN
  IF TG_TABLE_NAME = 'pos_products' THEN
    select_template := 'SELECT p."storeId",
      CASE WHEN g.id IS NULL THEN ''product:'' || p.id ELSE ''group:'' || g.id END AS entity_key
      FROM %1$I p LEFT JOIN pos_product_stock_groups g ON g.id = p."stockGroupId" AND g."storeId" = p."storeId"';
  ELSE
    select_template := 'SELECT "storeId", ''group:'' || id AS entity_key FROM %1$I
      UNION SELECT p."storeId", ''product:'' || p.id AS entity_key
      FROM pos_products p JOIN %1$I g ON g.id = p."stockGroupId"';
  END IF;
  IF TG_OP <> 'INSERT' THEN affected_sql := format(select_template, 'valuation_old'); END IF;
  IF TG_OP <> 'DELETE' THEN
    IF affected_sql <> '' THEN affected_sql := affected_sql || ' UNION '; END IF;
    affected_sql := affected_sql || format(select_template, 'valuation_new');
  END IF;
  FOR affected IN EXECUTE 'SELECT DISTINCT "storeId", entity_key FROM (' || affected_sql ||
    ') affected ORDER BY "storeId", entity_key' LOOP
    INSERT INTO pos_inventory_cost_entity_values ("storeId", "entityKey", value, "unvaluedCount")
    VALUES (affected."storeId", affected.entity_key, 0, 0) ON CONFLICT DO NOTHING;
    SELECT e.value, e."unvaluedCount" INTO old_value, old_unvalued
    FROM pos_inventory_cost_entity_values e
    WHERE e."storeId" = affected."storeId" AND e."entityKey" = affected.entity_key FOR UPDATE;
    SELECT COALESCE(sum(e.value), 0), COALESCE(sum(e.unvalued_count), 0)
    INTO new_value, new_unvalued
    FROM pos_inventory_cost_entities(affected."storeId", ARRAY[affected.entity_key]) e;
    IF old_value <> new_value OR old_unvalued <> new_unvalued THEN
      INSERT INTO pos_inventory_valuation_changes ("storeId", "occurredAt", delta, method, "unvaluedDelta")
      VALUES (affected."storeId", clock_timestamp(), new_value - old_value, 'unit_hpp', new_unvalued - old_unvalued);
      UPDATE pos_inventory_cost_entity_values SET value = new_value, "unvaluedCount" = new_unvalued
      WHERE "storeId" = affected."storeId" AND "entityKey" = affected.entity_key;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

-- Keep the selling-price ledger active while old application instances drain.
-- HPP reads select their own method and never combine the two ledgers.
CREATE TRIGGER pos_products_inventory_unit_cost_insert AFTER INSERT ON pos_products
REFERENCING NEW TABLE AS valuation_new FOR EACH STATEMENT EXECUTE FUNCTION record_inventory_unit_cost_change();
CREATE TRIGGER pos_products_inventory_unit_cost_update AFTER UPDATE ON pos_products
REFERENCING OLD TABLE AS valuation_old NEW TABLE AS valuation_new FOR EACH STATEMENT EXECUTE FUNCTION record_inventory_unit_cost_change();
CREATE TRIGGER pos_products_inventory_unit_cost_delete AFTER DELETE ON pos_products
REFERENCING OLD TABLE AS valuation_old FOR EACH STATEMENT EXECUTE FUNCTION record_inventory_unit_cost_change();
CREATE TRIGGER pos_groups_inventory_unit_cost_insert AFTER INSERT ON pos_product_stock_groups
REFERENCING NEW TABLE AS valuation_new FOR EACH STATEMENT EXECUTE FUNCTION record_inventory_unit_cost_change();
CREATE TRIGGER pos_groups_inventory_unit_cost_update AFTER UPDATE ON pos_product_stock_groups
REFERENCING OLD TABLE AS valuation_old NEW TABLE AS valuation_new FOR EACH STATEMENT EXECUTE FUNCTION record_inventory_unit_cost_change();
CREATE TRIGGER pos_groups_inventory_unit_cost_delete AFTER DELETE ON pos_product_stock_groups
REFERENCING OLD TABLE AS valuation_old FOR EACH STATEMENT EXECUTE FUNCTION record_inventory_unit_cost_change();

-- Server-side Prisma owns these entry points. Supabase API roles can receive
-- direct grants through default privileges, so revoke both those and PUBLIC.
ALTER TABLE pos_inventory_cost_entity_values ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pos_inventory_cost_entity_values FROM PUBLIC;
REVOKE ALL ON FUNCTION pos_calculate_unit_inventory_cost(numeric, numeric[], numeric[]),
  pos_inventory_cost_entities(text, text[]), initialize_inventory_unit_cost_valuation(),
  record_inventory_unit_cost_change() FROM PUBLIC;
DO $$
DECLARE api_role text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') LOOP
    EXECUTE format('REVOKE ALL ON TABLE pos_inventory_cost_entity_values FROM %I', api_role);
    EXECUTE format('REVOKE ALL ON FUNCTION pos_calculate_unit_inventory_cost(numeric, numeric[], numeric[]), pos_inventory_cost_entities(text, text[]), initialize_inventory_unit_cost_valuation(), record_inventory_unit_cost_change() FROM %I', api_role);
  END LOOP;
END;
$$;

COMMIT;
