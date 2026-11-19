-- Schedule rows carry individual methods and dates. A null summary method can
-- represent Transfer + Giro while retaining the earliest Giro due date.
ALTER TABLE "pos_goods_purchases"
    DROP CONSTRAINT "pos_goods_purchases_payment_due_date_check",
    ADD CONSTRAINT "pos_goods_purchases_payment_due_date_check"
    CHECK (
        "paymentMethod" IS NULL
        OR ("paymentMethod" = 'TRANSFER' AND "paymentDueDate" IS NULL)
        OR ("paymentMethod" = 'GIRO' AND "paymentDueDate" IS NOT NULL)
    );
