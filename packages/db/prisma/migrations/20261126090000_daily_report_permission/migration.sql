-- Owner has built-in access. Existing overrides for configurable roles take precedence.
INSERT INTO "pos_role_permissions" ("id", "role", "scope", "target", "action", "allowed", "updatedAt")
SELECT 'daily-report-' || lower(defaults.role), defaults.role::"Role", 'resource',
       'financial-report.daily-report', 'read', defaults.allowed, CURRENT_TIMESTAMP
FROM (VALUES ('ADMIN', true), ('CASHIER', true), ('SALES', false), ('INVENTORY', false)) AS defaults(role, allowed)
ON CONFLICT ("role", "scope", "target", "action") DO NOTHING;
