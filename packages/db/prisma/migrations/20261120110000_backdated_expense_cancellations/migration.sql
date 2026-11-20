BEGIN;

ALTER TABLE "pos_backdated_purchases" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "pos_backdated_purchase_payments" ADD COLUMN "cancelledAt" TIMESTAMP(3);

COMMIT;
