BEGIN;

CREATE TYPE "ExpenseCorrectionAction" AS ENUM ('EDIT', 'CANCEL');

CREATE TYPE "ExpenseCorrectionSubjectKind" AS ENUM ('GOODS_PURCHASE', 'BACKDATED_PURCHASE', 'SHOPPING_REQUEST');

CREATE TYPE "ExpenseCorrectionPaymentKind" AS ENUM ('GOODS_INITIAL_TRANSFER', 'SUPPLIER_PAYABLE_PAYMENT', 'BACKDATED_PAYMENT');

CREATE TYPE "ExpensePaymentSettlementKind" AS ENUM ('REFUND', 'CREDIT', 'ENTRY_ERROR');

CREATE TABLE "pos_expense_corrections" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" "ExpenseCorrectionAction" NOT NULL,
    "subjectKind" "ExpenseCorrectionSubjectKind" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "paymentKind" "ExpenseCorrectionPaymentKind",
    "paymentId" TEXT,
    "reason" VARCHAR(500) NOT NULL,
    "inputHash" VARCHAR(64) NOT NULL,
    "version" VARCHAR(64) NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_expense_corrections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_expense_payment_settlements" (
    "id" TEXT NOT NULL,
    "correctionId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "paymentKind" "ExpenseCorrectionPaymentKind" NOT NULL,
    "paymentId" TEXT NOT NULL,
    "kind" "ExpensePaymentSettlementKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" VARCHAR(160) NOT NULL,
    "receivedAt" DATE,
    "supplierId" TEXT,

    CONSTRAINT "pos_expense_payment_settlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_expense_supplier_credit_applications" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "creditId" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_expense_supplier_credit_applications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pos_expense_corrections_subject_idx" ON "pos_expense_corrections"("storeId", "subjectKind", "subjectId", "createdAt");

CREATE UNIQUE INDEX "pos_expense_corrections_id_storeId_key" ON "pos_expense_corrections"("id", "storeId");

CREATE UNIQUE INDEX "pos_expense_corrections_storeId_requestId_key" ON "pos_expense_corrections"("storeId", "requestId");

CREATE INDEX "pos_expense_payment_settlements_correctionId_idx" ON "pos_expense_payment_settlements"("correctionId");

CREATE INDEX "pos_expense_settlements_payment_idx" ON "pos_expense_payment_settlements"("storeId", "paymentKind", "paymentId");

CREATE INDEX "pos_expense_settlements_refund_idx" ON "pos_expense_payment_settlements"("storeId", "kind", "receivedAt");

CREATE INDEX "pos_expense_settlements_credit_idx" ON "pos_expense_payment_settlements"("storeId", "supplierId", "kind");

CREATE UNIQUE INDEX "pos_expense_payment_settlements_id_storeId_key" ON "pos_expense_payment_settlements"("id", "storeId");

CREATE INDEX "pos_expense_credit_applications_credit_idx" ON "pos_expense_supplier_credit_applications"("creditId");

CREATE INDEX "pos_expense_credit_applications_payable_idx" ON "pos_expense_supplier_credit_applications"("payableId");

CREATE UNIQUE INDEX "pos_expense_credit_applications_request_key" ON "pos_expense_supplier_credit_applications"("storeId", "requestId");

CREATE UNIQUE INDEX "pos_supplier_payables_id_storeId_key" ON "pos_supplier_payables"("id", "storeId");

ALTER TABLE "pos_expense_corrections" ADD CONSTRAINT "pos_expense_corrections_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_expense_payment_settlements" ADD CONSTRAINT "pos_expense_payment_settlements_correctionId_storeId_fkey" FOREIGN KEY ("correctionId", "storeId") REFERENCES "pos_expense_corrections"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_expense_payment_settlements" ADD CONSTRAINT "pos_expense_payment_settlements_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "pos_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_expense_supplier_credit_applications" ADD CONSTRAINT "pos_expense_supplier_credit_applications_creditId_storeId_fkey" FOREIGN KEY ("creditId", "storeId") REFERENCES "pos_expense_payment_settlements"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_expense_supplier_credit_applications" ADD CONSTRAINT "pos_expense_supplier_credit_applications_payableId_storeId_fkey" FOREIGN KEY ("payableId", "storeId") REFERENCES "pos_supplier_payables"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_expense_corrections"
    ADD CONSTRAINT "pos_expense_correction_payment_subject"
    CHECK (("paymentKind" IS NULL AND "paymentId" IS NULL) OR
        ("paymentKind" IS NOT NULL AND "paymentId" IS NOT NULL AND (
            ("subjectKind" = 'BACKDATED_PURCHASE' AND "paymentKind" = 'BACKDATED_PAYMENT') OR
            ("subjectKind" = 'GOODS_PURCHASE' AND "paymentKind" IN ('GOODS_INITIAL_TRANSFER', 'SUPPLIER_PAYABLE_PAYMENT'))
        )));

ALTER TABLE "pos_expense_payment_settlements"
    ADD CONSTRAINT "pos_expense_settlements_positive_amount" CHECK ("amount" > 0),
    ADD CONSTRAINT "pos_expense_settlements_required_details" CHECK (
        ("kind" = 'REFUND' AND "receivedAt" IS NOT NULL AND "supplierId" IS NULL) OR
        ("kind" = 'CREDIT' AND "receivedAt" IS NULL AND "supplierId" IS NOT NULL) OR
        ("kind" = 'ENTRY_ERROR' AND "receivedAt" IS NULL AND "supplierId" IS NULL)
    );

ALTER TABLE "pos_expense_supplier_credit_applications"
    ADD CONSTRAINT "pos_expense_credit_application_positive_amount" CHECK ("amount" > 0);

COMMIT;
