-- New read permissions follow the application's defaults; preserve existing overrides.
INSERT INTO "pos_role_permissions" ("id", "role", "scope", "target", "action", "allowed", "updatedAt")
SELECT 'daily-finance-' || lower(r.role) || '-' || t.target || '-' || a.action,
       r.role::"Role", 'resource', t.target, a.action,
       r.role IN ('ADMIN', 'SALES') AND a.action = 'read', CURRENT_TIMESTAMP
FROM (VALUES ('ADMIN'), ('CASHIER'), ('SALES'), ('INVENTORY')) AS r(role)
CROSS JOIN (VALUES ('financial-report.daily-income'), ('financial-report.daily-category'),
                   ('financial-report.daily-subcategory'), ('financial-report.daily-payment-method')) AS t(target)
CROSS JOIN (VALUES ('create'), ('read'), ('update'), ('delete')) AS a(action)
ON CONFLICT ("role", "scope", "target", "action") DO NOTHING;

-- Explicitly transition existing SALES accounts to the approved daily view.
INSERT INTO "pos_role_permissions" ("id", "role", "scope", "target", "action", "allowed", "updatedAt")
VALUES ('daily-finance-sales-page', 'SALES', 'page', '/financial-report', 'access', true, CURRENT_TIMESTAMP),
       ('daily-finance-sales-full', 'SALES', 'resource', 'financial-report', 'read', false, CURRENT_TIMESTAMP)
ON CONFLICT ("role", "scope", "target", "action") DO UPDATE
SET "allowed" = EXCLUDED."allowed", "updatedAt" = CURRENT_TIMESTAMP;
