ALTER TABLE "pos_inventory_inbound_receipts"
ADD COLUMN "paymentMethod" "PurchasePaymentMethod",
ADD COLUMN "paymentDueDate" DATE;

ALTER TABLE "pos_goods_purchases"
ADD COLUMN "deferMasterHppToReceipt" BOOLEAN NOT NULL DEFAULT false;
