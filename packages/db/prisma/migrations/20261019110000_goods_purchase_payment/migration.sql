CREATE TYPE "PurchasePaymentMethod" AS ENUM ('TRANSFER', 'GIRO');

ALTER TABLE "pos_goods_purchases"
ADD COLUMN "paymentMethod" "PurchasePaymentMethod",
ADD COLUMN "paymentDueDate" DATE,
ADD CONSTRAINT "pos_goods_purchases_payment_due_date_check"
CHECK (CASE WHEN "paymentMethod" = 'GIRO' THEN "paymentDueDate" IS NOT NULL ELSE "paymentDueDate" IS NULL END);
