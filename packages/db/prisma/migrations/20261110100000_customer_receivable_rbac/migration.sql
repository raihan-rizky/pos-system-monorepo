-- Initialize granular receivable grants without overwriting existing choices.
-- Legacy denials remain effective when upgrading an existing installation.
WITH roles(role) AS (
  VALUES ('ADMIN'), ('CASHIER'), ('SALES'), ('INVENTORY')
), targets(target) AS (
  VALUES ('customer.receivable'), ('customer.receivable.payment')
), actions(action) AS (
  VALUES ('read'), ('create'), ('update'), ('delete')
)
INSERT INTO "pos_role_permissions" ("id", "role", "scope", "target", "action", "allowed", "updatedAt")
SELECT 'customer-receivable-rbac-' || lower(roles.role) || '-' || targets.target || '-' || actions.action,
       roles.role::"Role", 'resource', targets.target, actions.action,
       CASE
         WHEN targets.target = 'customer.receivable' AND actions.action = 'read'
           THEN COALESCE(customer_read."allowed", roles.role IN ('ADMIN', 'CASHIER', 'SALES'))
         WHEN targets.target = 'customer.receivable' AND actions.action IN ('create', 'update')
           THEN roles.role = 'ADMIN' AND COALESCE(customer_update."allowed", true)
         WHEN targets.target = 'customer.receivable.payment' AND actions.action = 'create'
           THEN roles.role = 'ADMIN' AND COALESCE(customer_update."allowed", true)
             AND COALESCE(transaction_update."allowed", true)
         ELSE false
       END,
       CURRENT_TIMESTAMP
FROM roles
CROSS JOIN targets
CROSS JOIN actions
LEFT JOIN "pos_role_permissions" AS customer_read
  ON customer_read."role" = roles.role::"Role" AND customer_read."scope" = 'resource'
  AND customer_read."target" = 'customer' AND customer_read."action" = 'read'
LEFT JOIN "pos_role_permissions" AS customer_update
  ON customer_update."role" = roles.role::"Role" AND customer_update."scope" = 'resource'
  AND customer_update."target" = 'customer' AND customer_update."action" = 'update'
LEFT JOIN "pos_role_permissions" AS transaction_update
  ON transaction_update."role" = roles.role::"Role" AND transaction_update."scope" = 'resource'
  AND transaction_update."target" = 'transaction' AND transaction_update."action" = 'update'
ON CONFLICT ("role", "scope", "target", "action") DO NOTHING;
