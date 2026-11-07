ALTER TABLE "pos_goods_purchases"
  ADD COLUMN "initialTransferAmount" DECIMAL(12,2),
  ADD COLUMN "initialTransferPaidAt" DATE;
