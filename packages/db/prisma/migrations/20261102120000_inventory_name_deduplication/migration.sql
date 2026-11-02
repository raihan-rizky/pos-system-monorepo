BEGIN;
LOCK TABLE pos_products, pos_product_stock_groups IN SHARE ROW EXCLUSIVE MODE;

CREATE FUNCTION pos_inventory_product_name_key(product_name text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT NULLIF(btrim(regexp_replace(lower(btrim(regexp_replace(product_name, '[[:space:]]+', ' ', 'g'))), '(-new)+$', '', 'i')), '');
$$;

CREATE INDEX pos_products_inventory_name_key_idx
  ON pos_products ("storeId", pos_inventory_product_name_key(name)) WHERE "isActive";

-- Only genuine balance changes advance this timestamp. A depleted source stays
-- authoritative; price edits and replicated unit stock cannot revive old stock.
ALTER TABLE pos_inventory_cost_entity_values
  ADD COLUMN "stockChangedAt" timestamptz NOT NULL DEFAULT '1970-01-01T00:00:00Z';


-- Rows exist only inside their writing transaction and are drained at commit.
-- This avoids holding family/cache locks while application stock writes continue.
CREATE TABLE pos_inventory_cost_refresh_queue (
  id bigserial PRIMARY KEY,
  "transactionId" bigint NOT NULL,
  "storeId" text NOT NULL,
  "entityKeys" text[] NOT NULL,
  "nameKeys" text[] NOT NULL,
  "stockKeys" text[] NOT NULL,
  "changedAt" timestamptz NOT NULL
);
CREATE INDEX pos_inventory_cost_refresh_queue_tx_idx
  ON pos_inventory_cost_refresh_queue ("transactionId", "storeId");
ALTER TABLE pos_inventory_cost_refresh_queue ENABLE ROW LEVEL SECURITY;

WITH initial_sources AS (
  SELECT p."storeId",
    CASE WHEN g.id IS NULL THEN 'product:' || p.id ELSE 'group:' || g.id END AS entity_key,
    max(CASE WHEN COALESCE(g."baseStock", p.stock) > 0 THEN
      LEAST(COALESCE(g."updatedAt", p."updatedAt", p."createdAt") AT TIME ZONE 'UTC', clock_timestamp())
      ELSE '1970-01-01T00:00:00Z'::timestamptz END) AS changed_at
  FROM pos_products p LEFT JOIN pos_product_stock_groups g
    ON g.id = p."stockGroupId" AND g."storeId" = p."storeId"
  WHERE p."isActive" GROUP BY p."storeId", entity_key
)
UPDATE pos_inventory_cost_entity_values c SET "stockChangedAt" = s.changed_at
FROM initial_sources s WHERE c."storeId" = s."storeId" AND c."entityKey" = s.entity_key;

-- Follow both shared-pool membership and exact normalized-name aliases. The
-- recursive UNION also handles a shared pool bridging two catalog names.
CREATE FUNCTION pos_inventory_cost_family_entities(
  target_store text, entity_keys text[] DEFAULT NULL, name_keys text[] DEFAULT ARRAY[]::text[]
) RETURNS TABLE(root_key text, entity_key text) LANGUAGE sql STABLE AS $$
  WITH RECURSIVE seeds(root_key) AS (
    SELECT unnest(entity_keys)
    UNION
    SELECT CASE WHEN g.id IS NULL THEN 'product:' || p.id ELSE 'group:' || g.id END
    FROM pos_products p LEFT JOIN pos_product_stock_groups g
      ON g.id = p."stockGroupId" AND g."storeId" = p."storeId"
    WHERE p."storeId" = target_store AND p."isActive"
      AND (entity_keys IS NULL OR pos_inventory_product_name_key(p.name) = ANY(name_keys))
  ), family(root_key, entity_key) AS (
    SELECT s.root_key, s.root_key FROM seeds s
    UNION
    SELECT f.root_key, CASE WHEN peer_group.id IS NULL THEN 'product:' || peer.id ELSE 'group:' || peer_group.id END
    FROM family f
    JOIN pos_products member ON member."storeId" = target_store AND member."isActive"
      AND (member.id = CASE WHEN left(f.entity_key, 8) = 'product:' THEN substr(f.entity_key, 9) END
        OR member."stockGroupId" = CASE WHEN left(f.entity_key, 6) = 'group:' THEN substr(f.entity_key, 7) END)
    JOIN pos_products peer ON peer."storeId" = target_store AND peer."isActive"
      AND pos_inventory_product_name_key(peer.name) = pos_inventory_product_name_key(member.name)
    LEFT JOIN pos_product_stock_groups peer_group
      ON peer_group.id = peer."stockGroupId" AND peer_group."storeId" = peer."storeId"
  )
  SELECT f.root_key, f.entity_key FROM family f;
$$;

CREATE FUNCTION pos_inventory_cost_pool_values(target_store text, entity_keys text[] DEFAULT NULL)
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

CREATE OR REPLACE FUNCTION pos_inventory_cost_entities(target_store text, entity_keys text[] DEFAULT NULL)
RETURNS TABLE(entity_key text, value numeric, unvalued_count integer)
LANGUAGE sql STABLE AS $$
  WITH families AS MATERIALIZED (
    SELECT * FROM pos_inventory_cost_family_entities(target_store, entity_keys)
  ), candidates AS (
    SELECT f.root_key, f.entity_key, GREATEST(COALESCE(c."stockChangedAt", '1970-01-01T00:00:00Z'::timestamptz), COALESCE((
      SELECT max(q."changedAt") FROM pos_inventory_cost_refresh_queue q
      WHERE q."transactionId" = txid_current_if_assigned() AND q."storeId" = target_store
        AND f.entity_key = ANY(q."stockKeys")
    ), '1970-01-01T00:00:00Z'::timestamptz)) AS changed_at
    FROM families f LEFT JOIN pos_inventory_cost_entity_values c
      ON c."storeId" = target_store AND c."entityKey" = f.entity_key
    WHERE EXISTS (
      SELECT 1 FROM pos_products p LEFT JOIN pos_product_stock_groups g
        ON g.id = p."stockGroupId" AND g."storeId" = p."storeId"
      WHERE p."storeId" = target_store AND p."isActive"
        AND (p.id = CASE WHEN left(f.entity_key, 8) = 'product:' THEN substr(f.entity_key, 9) END
          OR p."stockGroupId" = CASE WHEN left(f.entity_key, 6) = 'group:' THEN substr(f.entity_key, 7) END)
        AND CASE WHEN g.id IS NULL THEN 'product:' || p.id ELSE 'group:' || g.id END = f.entity_key
      OFFSET 0 -- keep this correlated existence check on the pool indexes
    )
  ), representatives AS (
    SELECT DISTINCT ON (c.root_key) c.root_key, c.entity_key
    FROM candidates c ORDER BY c.root_key, c.changed_at DESC, c.entity_key COLLATE "C"
  ), selected AS (SELECT DISTINCT r.entity_key FROM representatives r)
  SELECT v.entity_key, v.value, v.unvalued_count
  FROM pos_inventory_cost_pool_values(target_store, ARRAY(SELECT s.entity_key FROM selected s)) v;
$$;

CREATE OR REPLACE FUNCTION record_inventory_unit_cost_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_rows jsonb := '[]'::jsonb;
  new_rows jsonb := '[]'::jsonb;
  store_key text;
  pool_keys text[];
  name_keys text[];
  stock_keys text[];
  change_time timestamptz := clock_timestamp();
BEGIN
  IF TG_OP <> 'INSERT' THEN
    EXECUTE 'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM valuation_old t' INTO old_rows;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    EXECUTE 'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM valuation_new t' INTO new_rows;
  END IF;
  FOR store_key IN SELECT DISTINCT r->>'storeId' FROM jsonb_array_elements(old_rows || new_rows) r ORDER BY 1 LOOP
    IF TG_TABLE_NAME = 'pos_products' THEN
      SELECT array_agg(DISTINCT k) INTO pool_keys FROM (
        SELECT 'product:' || (r->>'id') AS k FROM jsonb_array_elements(old_rows || new_rows) r WHERE r->>'storeId' = store_key
        UNION
        SELECT 'group:' || (r->>'stockGroupId') FROM jsonb_array_elements(old_rows || new_rows) r
          WHERE r->>'storeId' = store_key AND r->>'stockGroupId' IS NOT NULL
      ) keys;
      SELECT array_remove(array_agg(DISTINCT pos_inventory_product_name_key(r->>'name')), NULL)
        INTO name_keys FROM jsonb_array_elements(old_rows || new_rows) r WHERE r->>'storeId' = store_key;
      SELECT array_agg(DISTINCT 'product:' || (n->>'id')) INTO stock_keys
      FROM jsonb_array_elements(new_rows) n
      WHERE n->>'storeId' = store_key
        AND NOT EXISTS (SELECT 1 FROM pos_product_stock_groups g WHERE g.id = n->>'stockGroupId' AND g."storeId" = store_key)
        AND (EXISTS (
          SELECT 1 FROM jsonb_array_elements(old_rows) o
          WHERE o->>'id' = n->>'id' AND o->>'storeId' = store_key
            AND (o->>'stock')::double precision IS DISTINCT FROM (n->>'stock')::double precision
        ) OR ((n->>'stock')::double precision > 0 AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(old_rows) o WHERE o->>'id' = n->>'id' AND o->>'storeId' = store_key
        )));
    ELSE
      SELECT array_agg(DISTINCT 'group:' || (r->>'id')) INTO pool_keys
        FROM jsonb_array_elements(old_rows || new_rows) r WHERE r->>'storeId' = store_key;
      SELECT array_remove(array_agg(DISTINCT pos_inventory_product_name_key(p.name)), NULL) INTO name_keys
        FROM pos_products p WHERE p."storeId" = store_key
          AND p."stockGroupId" = ANY(ARRAY(SELECT substr(k, 7) FROM unnest(pool_keys) k));
      SELECT array_agg(DISTINCT 'group:' || (n->>'id')) INTO stock_keys
      FROM jsonb_array_elements(new_rows) n WHERE n->>'storeId' = store_key
        AND (EXISTS (
          SELECT 1 FROM jsonb_array_elements(old_rows) o
          WHERE o->>'id' = n->>'id' AND o->>'storeId' = store_key
            AND (o->>'baseStock')::double precision IS DISTINCT FROM (n->>'baseStock')::double precision
        ) OR ((n->>'baseStock')::double precision > 0 AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(old_rows) o WHERE o->>'id' = n->>'id' AND o->>'storeId' = store_key
        )));
    END IF;


    INSERT INTO pos_inventory_cost_refresh_queue ("transactionId", "storeId", "entityKeys", "nameKeys", "stockKeys", "changedAt")
    VALUES (txid_current(), store_key, COALESCE(pool_keys, ARRAY[]::text[]),
      COALESCE(name_keys, ARRAY[]::text[]), COALESCE(stock_keys, ARRAY[]::text[]), change_time);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE FUNCTION flush_inventory_unit_cost_changes() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  transaction_key bigint := txid_current();
  store_key text;
  pool_keys text[];
  name_keys text[];
  affected_keys text[];
  change_time timestamptz;
  old_value numeric;
  old_unvalued integer;
  new_value numeric;
  new_unvalued integer;
BEGIN
  -- Several deferred row triggers may be scheduled; the first drains the batch.
  IF NOT EXISTS (SELECT 1 FROM pos_inventory_cost_refresh_queue q WHERE q."transactionId" = transaction_key) THEN
    RETURN NULL;
  END IF;
  FOR store_key IN SELECT DISTINCT q."storeId" FROM pos_inventory_cost_refresh_queue q
    WHERE q."transactionId" = transaction_key ORDER BY q."storeId" LOOP
    IF NOT EXISTS (SELECT 1 FROM pos_stores WHERE id = store_key) THEN CONTINUE; END IF;
    -- All physical writes have completed. No other stock writer holds cache
    -- rows before this phase, so transaction-wide refreshes cannot invert locks.
    PERFORM pg_advisory_xact_lock(hashtextextended('inventory-unit-hpp:' || store_key, 0));
    SELECT array_agg(DISTINCT k) INTO pool_keys FROM pos_inventory_cost_refresh_queue q
      CROSS JOIN LATERAL unnest(q."entityKeys") k
      WHERE q."transactionId" = transaction_key AND q."storeId" = store_key;
    SELECT array_agg(DISTINCT k) INTO name_keys FROM pos_inventory_cost_refresh_queue q
      CROSS JOIN LATERAL unnest(q."nameKeys") k
      WHERE q."transactionId" = transaction_key AND q."storeId" = store_key;
    SELECT array_agg(DISTINCT f.entity_key) INTO affected_keys
      FROM pos_inventory_cost_family_entities(store_key, pool_keys, COALESCE(name_keys, ARRAY[]::text[])) f;
    change_time := clock_timestamp();

    WITH current_pools AS (
      SELECT CASE WHEN g.id IS NULL THEN 'product:' || p.id ELSE 'group:' || g.id END AS entity_key,
        bool_or(COALESCE(g."baseStock", p.stock) > 0) AS positive_stock
      FROM pos_products p LEFT JOIN pos_product_stock_groups g
        ON g.id = p."stockGroupId" AND g."storeId" = p."storeId"
      WHERE p."storeId" = store_key AND p."isActive"
        AND (p.id = ANY(ARRAY(SELECT substr(k, 9) FROM unnest(affected_keys) k WHERE left(k, 8) = 'product:'))
          OR p."stockGroupId" = ANY(ARRAY(SELECT substr(k, 7) FROM unnest(affected_keys) k WHERE left(k, 6) = 'group:')))
      GROUP BY CASE WHEN g.id IS NULL THEN 'product:' || p.id ELSE 'group:' || g.id END
    ), pending_sources AS (
      SELECT k AS entity_key, max(q."changedAt") AS changed_at FROM pos_inventory_cost_refresh_queue q
      CROSS JOIN LATERAL unnest(q."stockKeys") k
      WHERE q."transactionId" = transaction_key AND q."storeId" = store_key GROUP BY k
    )
    INSERT INTO pos_inventory_cost_entity_values ("storeId", "entityKey", value, "unvaluedCount", "stockChangedAt")
    SELECT store_key, p.entity_key, 0, 0,
      CASE WHEN p.positive_stock THEN COALESCE(s.changed_at, change_time)
        ELSE '1970-01-01T00:00:00Z'::timestamptz END
    FROM current_pools p LEFT JOIN pending_sources s ON s.entity_key = p.entity_key
    ON CONFLICT ("storeId", "entityKey") DO NOTHING;
    INSERT INTO pos_inventory_cost_entity_values ("storeId", "entityKey", value, "unvaluedCount")
    SELECT store_key, k, 0, 0 FROM unnest(affected_keys) k ON CONFLICT DO NOTHING;
    WITH stock_events AS (
      SELECT k AS entity_key, max(q."changedAt") AS changed_at FROM pos_inventory_cost_refresh_queue q
      CROSS JOIN LATERAL unnest(q."stockKeys") k
      WHERE q."transactionId" = transaction_key AND q."storeId" = store_key GROUP BY k
    )
    UPDATE pos_inventory_cost_entity_values c SET "stockChangedAt" = GREATEST(c."stockChangedAt", e.changed_at)
      FROM stock_events e WHERE c."storeId" = store_key AND c."entityKey" = e.entity_key;
    PERFORM 1 FROM pos_inventory_cost_entity_values
      WHERE "storeId" = store_key AND "entityKey" = ANY(affected_keys) ORDER BY "entityKey" FOR UPDATE;
    SELECT COALESCE(sum(value), 0), COALESCE(sum("unvaluedCount"), 0) INTO old_value, old_unvalued
      FROM pos_inventory_cost_entity_values WHERE "storeId" = store_key AND "entityKey" = ANY(affected_keys);
    WITH valued AS MATERIALIZED (SELECT * FROM pos_inventory_cost_entities(store_key, affected_keys)),
    next_values AS (
      SELECT k AS entity_key, COALESCE(v.value, 0) AS value, COALESCE(v.unvalued_count, 0) AS unvalued
      FROM unnest(affected_keys) k LEFT JOIN valued v ON v.entity_key = k
    )
    UPDATE pos_inventory_cost_entity_values c SET value = n.value, "unvaluedCount" = n.unvalued
      FROM next_values n WHERE c."storeId" = store_key AND c."entityKey" = n.entity_key;
    SELECT COALESCE(sum(value), 0), COALESCE(sum("unvaluedCount"), 0) INTO new_value, new_unvalued
      FROM pos_inventory_cost_entity_values WHERE "storeId" = store_key AND "entityKey" = ANY(affected_keys);
    IF old_value <> new_value OR old_unvalued <> new_unvalued THEN
      INSERT INTO pos_inventory_valuation_changes ("storeId", "occurredAt", delta, method, "unvaluedDelta")
      VALUES (store_key, clock_timestamp(), new_value - old_value, 'unit_hpp', new_unvalued - old_unvalued);
    END IF;
  END LOOP;
  DELETE FROM pos_inventory_cost_refresh_queue WHERE "transactionId" = transaction_key;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER pos_inventory_unit_cost_commit
AFTER INSERT ON pos_inventory_cost_refresh_queue DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION flush_inventory_unit_cost_changes();

-- Reconcile existing caches with one current correction, preserving historical
-- baselines and closed-month snapshots. No user action or master-stock rewrite.
DO $$
DECLARE
  s record;
  old_value numeric;
  old_unvalued integer;
  new_value numeric;
  new_unvalued integer;
BEGIN
  FOR s IN SELECT id FROM pos_stores ORDER BY id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('inventory-unit-hpp:' || s.id, 0));
    SELECT COALESCE(sum(value), 0), COALESCE(sum("unvaluedCount"), 0) INTO old_value, old_unvalued
      FROM pos_inventory_cost_entity_values WHERE "storeId" = s.id;
    WITH valued AS MATERIALIZED (SELECT * FROM pos_inventory_cost_entities(s.id))
    UPDATE pos_inventory_cost_entity_values c SET value = COALESCE(v.value, 0), "unvaluedCount" = COALESCE(v.unvalued_count, 0)
    FROM (
      SELECT c2."entityKey", v.value, v.unvalued_count
      FROM pos_inventory_cost_entity_values c2 LEFT JOIN valued v ON v.entity_key = c2."entityKey" WHERE c2."storeId" = s.id
    ) v WHERE c."storeId" = s.id AND c."entityKey" = v."entityKey";
    SELECT COALESCE(sum(value), 0), COALESCE(sum("unvaluedCount"), 0) INTO new_value, new_unvalued
      FROM pos_inventory_cost_entity_values WHERE "storeId" = s.id;
    IF old_value <> new_value OR old_unvalued <> new_unvalued THEN
      INSERT INTO pos_inventory_valuation_changes ("storeId", "occurredAt", delta, method, "unvaluedDelta")
      VALUES (s.id, clock_timestamp(), new_value - old_value, 'unit_hpp', new_unvalued - old_unvalued);
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON TABLE pos_inventory_cost_refresh_queue FROM PUBLIC;
REVOKE ALL ON SEQUENCE pos_inventory_cost_refresh_queue_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION flush_inventory_unit_cost_changes() FROM PUBLIC;
REVOKE ALL ON FUNCTION pos_inventory_product_name_key(text), pos_inventory_cost_family_entities(text, text[], text[]),
  pos_inventory_cost_pool_values(text, text[]) FROM PUBLIC;
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE pos_inventory_cost_refresh_queue FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON SEQUENCE pos_inventory_cost_refresh_queue_id_seq FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON FUNCTION flush_inventory_unit_cost_changes() FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON FUNCTION pos_inventory_product_name_key(text), pos_inventory_cost_family_entities(text,text[],text[]), pos_inventory_cost_pool_values(text,text[]) FROM %I', api_role);
    END IF;
  END LOOP;
END;
$$;
COMMIT;
