-- Payments belong to an invoice even when it has no registered customer.
ALTER TABLE "pos_debt_payment_logs" ALTER COLUMN "customerId" DROP NOT NULL;
