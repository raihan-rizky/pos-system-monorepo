-- Existing editable roles receive no new purchase correction grants by default.
INSERT INTO "pos_role_permissions" ("id", "role", "scope", "target", "action", "allowed", "updatedAt")
SELECT 'expense-correction-' || lower(roles.role) || '-' || targets.target || '-' || actions.action,
       roles.role::"Role", 'resource', targets.target, actions.action, false, CURRENT_TIMESTAMP
FROM (VALUES ('ADMIN'), ('CASHIER'), ('SALES'), ('INVENTORY')) AS roles(role)
CROSS JOIN (VALUES
  ('supplier.goods_purchase.correction'),
  ('supplier.backdated_purchase.correction'),
  ('supplier.backdated_payment.correction')
) AS targets(target)
CROSS JOIN (VALUES ('update'), ('delete')) AS actions(action)
ON CONFLICT ("role", "scope", "target", "action") DO NOTHING;
