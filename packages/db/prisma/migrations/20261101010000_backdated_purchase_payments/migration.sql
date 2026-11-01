CREATE TABLE "pos_backdated_purchases" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "purchaseDate" DATE NOT NULL,
    "paymentMethod" "PurchasePaymentMethod" NOT NULL DEFAULT 'GIRO',
    "dueDate" DATE NOT NULL,
    "reference" VARCHAR(160) NOT NULL,
    "amount" DECIMAL(12, 2) NOT NULL,
    "requestId" VARCHAR(100) NOT NULL,
    "requestFingerprint" VARCHAR(64) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_backdated_purchases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_backdated_purchases_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "pos_backdated_purchases_dates_valid" CHECK ("dueDate" >= "purchaseDate"),
    CONSTRAINT "pos_backdated_purchases_reference_nonempty" CHECK (length(btrim("reference")) > 0),
    CONSTRAINT "pos_backdated_purchases_request_nonempty" CHECK (length(btrim("requestId")) > 0)
);

CREATE TABLE "pos_backdated_purchase_payments" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "requestId" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(12, 2) NOT NULL,
    "paidAt" DATE NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_backdated_purchase_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_backdated_purchase_payments_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "pos_backdated_purchase_payments_request_nonempty" CHECK (length(btrim("requestId")) > 0)
);

ALTER TABLE "pos_expenses"
    ADD COLUMN "backdatedPurchaseDueId" TEXT,
    ADD COLUMN "backdatedPurchasePaymentId" TEXT;

CREATE UNIQUE INDEX "pos_backdated_purchases_storeId_requestId_key"
    ON "pos_backdated_purchases"("storeId", "requestId");
CREATE INDEX "pos_backdated_purchases_storeId_createdAt_idx"
    ON "pos_backdated_purchases"("storeId", "createdAt");
CREATE INDEX "pos_backdated_purchases_storeId_paymentMethod_dueDate_idx"
    ON "pos_backdated_purchases"("storeId", "paymentMethod", "dueDate");
CREATE UNIQUE INDEX "pos_backdated_purchase_payments_purchaseId_requestId_key"
    ON "pos_backdated_purchase_payments"("purchaseId", "requestId");
CREATE INDEX "pos_backdated_purchase_payments_purchaseId_paidAt_idx"
    ON "pos_backdated_purchase_payments"("purchaseId", "paidAt");
CREATE UNIQUE INDEX "pos_expenses_backdatedPurchaseDueId_key"
    ON "pos_expenses"("backdatedPurchaseDueId");
CREATE UNIQUE INDEX "pos_expenses_backdatedPurchasePaymentId_key"
    ON "pos_expenses"("backdatedPurchasePaymentId");

ALTER TABLE "pos_backdated_purchases"
    ADD CONSTRAINT "pos_backdated_purchases_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_backdated_purchase_payments"
    ADD CONSTRAINT "pos_backdated_purchase_payments_purchaseId_fkey"
    FOREIGN KEY ("purchaseId") REFERENCES "pos_backdated_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_expenses"
    ADD CONSTRAINT "pos_expenses_backdatedPurchaseDueId_fkey"
    FOREIGN KEY ("backdatedPurchaseDueId") REFERENCES "pos_backdated_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_expenses"
    ADD CONSTRAINT "pos_expenses_backdatedPurchasePaymentId_fkey"
    FOREIGN KEY ("backdatedPurchasePaymentId") REFERENCES "pos_backdated_purchase_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
