CREATE TABLE "pos_goods_purchase_payments" (
    "id" TEXT NOT NULL,
    "goodsPurchaseId" TEXT NOT NULL,
    "method" "PurchasePaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "dueDate" DATE,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_goods_purchase_payments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pos_inventory_inbound_receipts" ADD COLUMN "paymentSchedule" JSONB;

CREATE INDEX "pos_goods_purchase_payments_goodsPurchaseId_dueDate_idx"
    ON "pos_goods_purchase_payments"("goodsPurchaseId", "dueDate");

ALTER TABLE "pos_goods_purchase_payments"
    ADD CONSTRAINT "pos_goods_purchase_payments_goodsPurchaseId_fkey"
    FOREIGN KEY ("goodsPurchaseId") REFERENCES "pos_goods_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pos_goods_purchase_payments"
    ADD CONSTRAINT "pos_goods_purchase_payments_method_dueDate_check"
    CHECK (("method" = 'GIRO' AND "dueDate" IS NOT NULL) OR ("method" = 'TRANSFER' AND "dueDate" IS NULL));

ALTER TABLE "pos_goods_purchase_payments"
    ADD CONSTRAINT "pos_goods_purchase_payments_amount_check" CHECK ("amount" >= 0);

INSERT INTO "pos_goods_purchase_payments" ("id", "goodsPurchaseId", "method", "amount", "dueDate", "createdAt")
SELECT concat('legacy-', "id"), "id", "paymentMethod", "totalAmount", "paymentDueDate", "createdAt"
FROM "pos_goods_purchases"
WHERE "paymentMethod" IS NOT NULL;
