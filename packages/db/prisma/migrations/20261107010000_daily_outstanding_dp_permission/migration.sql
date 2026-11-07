-- Seed the new independent permission without overwriting existing overrides.
INSERT INTO "pos_role_permissions" ("id", "role", "scope", "target", "action", "allowed", "updatedAt")
SELECT 'daily-dp-' || lower(r.role) || '-' || a.action,
       r.role::"Role", 'resource', 'financial-report.daily-outstanding-dp', a.action,
       r.role IN ('ADMIN', 'SALES') AND a.action = 'read', CURRENT_TIMESTAMP
FROM (VALUES ('ADMIN'), ('CASHIER'), ('SALES'), ('INVENTORY')) AS r(role)
CROSS JOIN (VALUES ('create'), ('read'), ('update'), ('delete')) AS a(action)
ON CONFLICT ("role", "scope", "target", "action") DO NOTHING;
