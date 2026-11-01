BEGIN;

-- A row exists only if the barrier was held across this cutoff and its
-- transaction committed. This also makes missed scheduler runs observable.
CREATE TABLE "pos_inventory_valuation_v2_closures" (
  "cutoff" TIMESTAMPTZ(6) PRIMARY KEY,
  "closedAt" TIMESTAMPTZ(6) NOT NULL
);

-- Invoke only as a separate statement with statement_timeout set to at most
-- five seconds. The caller must commit promptly after this function returns.
CREATE FUNCTION pos_close_inventory_at(_cutoff TIMESTAMPTZ)
RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  remaining NUMERIC;
  timeout_ms NUMERIC;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Penutupan inventaris memerlukan isolasi READ COMMITTED.';
  END IF;
  -- A caller that already wrote inventory could see and certify its own
  -- uncommitted changes, since its own locks never conflict with SHARE.
  IF txid_current_if_assigned() IS NOT NULL THEN
    RAISE EXCEPTION 'Penutupan inventaris memerlukan transaksi baru.';
  END IF;
  SELECT setting::numeric INTO timeout_ms FROM pg_settings WHERE name = 'statement_timeout';
  IF timeout_ms <= 0 OR timeout_ms > 5000 THEN
    RAISE EXCEPTION 'Penutupan inventaris memerlukan statement_timeout maksimal 5 detik.';
  END IF;
  remaining := EXTRACT(EPOCH FROM (_cutoff - clock_timestamp()));
  IF remaining IS NULL OR remaining <= 0 OR remaining > 3 THEN
    RETURN FALSE;
  END IF;

  -- A conflicting writer must finish quickly; on timeout the transaction
  -- aborts and no observation is recorded. Locks persist until commit.
  PERFORM set_config('lock_timeout', '500ms', TRUE);
  LOCK TABLE "pos_stores", "pos_product_stock_groups", "pos_products" IN SHARE MODE;
  IF clock_timestamp() >= _cutoff THEN
    RETURN FALSE;
  END IF;

  -- VOLATILE + READ COMMITTED gives this statement a new snapshot after
  -- acquiring every lock. All visible ledger rows belong to committed writers.
  UPDATE "pos_inventory_valuation_v2_transactions"
  SET "observedAt" = clock_timestamp()
  WHERE "observedAt" IS NULL;
  IF clock_timestamp() >= _cutoff THEN
    RAISE EXCEPTION 'Penutupan inventaris melewati batas bulan.';
  END IF;
  remaining := EXTRACT(EPOCH FROM (_cutoff - clock_timestamp()));
  IF remaining > 0 THEN
    PERFORM pg_sleep(remaining::double precision);
  END IF;
  IF clock_timestamp() < _cutoff THEN
    RAISE EXCEPTION 'Waktu penutupan inventaris berubah sebelum batas bulan.';
  END IF;
  INSERT INTO "pos_inventory_valuation_v2_closures" ("cutoff", "closedAt")
  VALUES (_cutoff, clock_timestamp()) ON CONFLICT ("cutoff") DO NOTHING;
  RETURN TRUE;
END;
$$;

-- A scheduler can invoke this at 23:59 WIB. It waits without holding any
-- inventory locks, and does nothing outside the final minute of a month.
CREATE FUNCTION pos_wait_for_inventory_month_close()
RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  local_now TIMESTAMP := clock_timestamp() AT TIME ZONE 'Asia/Jakarta';
  cutoff TIMESTAMPTZ := (date_trunc('month', local_now) + interval '1 month') AT TIME ZONE 'Asia/Jakarta';
  remaining NUMERIC := EXTRACT(EPOCH FROM (cutoff - clock_timestamp()));
BEGIN
  IF remaining <= 0 OR remaining > 61 THEN RETURN FALSE; END IF;
  IF remaining > 2 THEN PERFORM pg_sleep((remaining - 2)::double precision); END IF;
  RETURN TRUE;
END;
$$;

-- pg_cron reports SELECT false as success. Classify a daily run separately so
-- an end-of-month miss raises an error and ordinary days remain a no-op.
CREATE FUNCTION pos_inventory_month_close_mode(_time TIMESTAMPTZ)
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN (local_time + interval '1 minute') >= date_trunc('month', local_time) + interval '1 month' THEN 'DUE'
    WHEN EXTRACT(DAY FROM local_time) = 1 AND local_time::time < time '06:00' THEN 'MISSED'
    ELSE 'SKIP'
  END
  FROM (SELECT _time AT TIME ZONE 'Asia/Jakarta' AS local_time) local_clock;
$$;

-- Call after the wait in a separate statement, after setting a 5s timeout.
CREATE FUNCTION pos_close_inventory_month()
RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  local_now TIMESTAMP := clock_timestamp() AT TIME ZONE 'Asia/Jakarta';
  cutoff TIMESTAMPTZ := (date_trunc('month', local_now) + interval '1 month') AT TIME ZONE 'Asia/Jakarta';
  mode TEXT := pos_inventory_month_close_mode(clock_timestamp());
BEGIN
  IF mode = 'SKIP' THEN RETURN FALSE; END IF;
  IF mode = 'MISSED' OR NOT pos_close_inventory_at(cutoff) THEN
    RAISE EXCEPTION 'Penutupan inventaris bulanan terlewat; nilai historis belum tersedia.';
  END IF;
  RETURN TRUE;
END;
$$;

-- Only the owner (or an explicitly granted scheduler role) may execute the
-- closing functions; no scheduler is installed or enabled by this migration.
-- Supabase API roles may also receive direct grants via default privileges.
ALTER TABLE "pos_inventory_valuation_v2_closures" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "pos_inventory_valuation_v2_closures" FROM PUBLIC;
REVOKE ALL ON FUNCTION pos_close_inventory_at(TIMESTAMPTZ), pos_wait_for_inventory_month_close(), pos_inventory_month_close_mode(TIMESTAMPTZ), pos_close_inventory_month() FROM PUBLIC;
DO $$
DECLARE api_role TEXT;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') LOOP
    EXECUTE format('REVOKE ALL ON TABLE "pos_inventory_valuation_v2_closures" FROM %I', api_role);
    EXECUTE format('REVOKE ALL ON FUNCTION pos_close_inventory_at(TIMESTAMPTZ), pos_wait_for_inventory_month_close(), pos_inventory_month_close_mode(TIMESTAMPTZ), pos_close_inventory_month() FROM %I', api_role);
  END LOOP;
END;
$$;

COMMIT;
