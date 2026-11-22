CREATE TABLE IF NOT EXISTS "pos_daily_income_comparisons" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "savedById" TEXT,
  "savedByName" TEXT NOT NULL,
  "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "posSnapshot" JSONB NOT NULL,
  CONSTRAINT "pos_daily_income_comparisons_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_daily_income_comparisons_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "pos_daily_income_comparisons_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pos_daily_income_comparisons_savedById_fkey" FOREIGN KEY ("savedById") REFERENCES "pos_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "pos_daily_income_comparisons_storeId_date_key"
  ON "pos_daily_income_comparisons"("storeId", "date");

CREATE TABLE IF NOT EXISTS "pos_daily_income_comparison_amounts" (
  "id" TEXT NOT NULL,
  "comparisonId" TEXT NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "pos_daily_income_comparison_amounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_daily_income_comparison_amounts_amount_check" CHECK ("amount" >= 0),
  CONSTRAINT "pos_daily_income_comparison_amounts_method_check" CHECK ("method" IN ('CASH', 'QRIS', 'DEBIT', 'CREDIT', 'TRANSFER')),
  CONSTRAINT "pos_daily_income_comparison_amounts_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "pos_daily_income_comparisons"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "pos_daily_income_comparison_amounts_comparisonId_method_key"
  ON "pos_daily_income_comparison_amounts"("comparisonId", "method");

ALTER TABLE "pos_daily_income_comparisons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_daily_income_comparison_amounts" ENABLE ROW LEVEL SECURITY;

-- Apply the explicitly requested cashier access once, without resetting later Owner changes.
DO $bootstrap$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "pos_role_permissions" WHERE "scope" = 'resource' AND "target" = 'financial-report.daily-comparison') THEN
    INSERT INTO "pos_role_permissions" ("id", "role", "scope", "target", "action", "allowed", "updatedAt")
    SELECT 'daily-comparison-' || lower(r.role) || '-' || a.action,
           r.role::"Role", 'resource', 'financial-report.daily-comparison', a.action,
           r.role = 'CASHIER' AND a.action IN ('read', 'create', 'update'), CURRENT_TIMESTAMP
    FROM (VALUES ('ADMIN'), ('CASHIER'), ('SALES'), ('INVENTORY')) AS r(role)
    CROSS JOIN (VALUES ('create'), ('read'), ('update'), ('delete')) AS a(action)
    ON CONFLICT ("role", "scope", "target", "action") DO NOTHING;

    INSERT INTO "pos_role_permissions" ("id", "role", "scope", "target", "action", "allowed", "updatedAt")
    VALUES ('daily-comparison-cashier-page', 'CASHIER', 'page', '/financial-report', 'access', true, CURRENT_TIMESTAMP),
           ('daily-comparison-cashier-total', 'CASHIER', 'resource', 'financial-report.daily-income', 'read', true, CURRENT_TIMESTAMP),
           ('daily-comparison-cashier-method', 'CASHIER', 'resource', 'financial-report.daily-payment-method', 'read', true, CURRENT_TIMESTAMP)
    ON CONFLICT ("role", "scope", "target", "action") DO UPDATE
    SET "allowed" = EXCLUDED."allowed", "updatedAt" = CURRENT_TIMESTAMP;
  END IF;
END $bootstrap$;
