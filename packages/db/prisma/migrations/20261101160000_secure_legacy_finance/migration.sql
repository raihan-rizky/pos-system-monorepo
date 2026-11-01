BEGIN;

-- These ledgers are accessed through server-side Prisma, not the Supabase Data
-- API. Preserve any existing policies while enabling RLS as a second boundary.
ALTER TABLE "pos_inventory_valuation_baselines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_inventory_valuation_changes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_supplier_payables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_supplier_payable_payments" ENABLE ROW LEVEL SECURITY;

-- Supabase installations can assign API roles direct default grants in
-- addition to PostgreSQL's default PUBLIC function EXECUTE privilege.
REVOKE ALL ON TABLE "pos_inventory_valuation_baselines", "pos_inventory_valuation_changes", "pos_supplier_payables", "pos_supplier_payable_payments" FROM PUBLIC;
REVOKE ALL ON SEQUENCE "pos_inventory_valuation_changes_id_seq" FROM PUBLIC;
REVOKE ALL ON FUNCTION initialize_inventory_valuation(), record_inventory_valuation_change() FROM PUBLIC;
DO $$
DECLARE api_role TEXT;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') LOOP
    EXECUTE format('REVOKE ALL ON TABLE "pos_inventory_valuation_baselines", "pos_inventory_valuation_changes", "pos_supplier_payables", "pos_supplier_payable_payments" FROM %I', api_role);
    EXECUTE format('REVOKE ALL ON SEQUENCE "pos_inventory_valuation_changes_id_seq" FROM %I', api_role);
    EXECUTE format('REVOKE ALL ON FUNCTION initialize_inventory_valuation(), record_inventory_valuation_change() FROM %I', api_role);
  END LOOP;
END;
$$;

COMMIT;
