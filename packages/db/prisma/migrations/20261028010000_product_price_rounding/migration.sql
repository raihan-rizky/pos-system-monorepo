ALTER TABLE "StoreSettings"
  ADD COLUMN "priceRoundingEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "priceRoundingIncrement" INTEGER NOT NULL DEFAULT 500,
  ADD COLUMN "priceRoundingThreshold" INTEGER NOT NULL DEFAULT 50;

ALTER TABLE "StoreSettings"
  ADD CONSTRAINT "StoreSettings_price_rounding_bounds_check"
  CHECK (
    "priceRoundingIncrement" BETWEEN 1 AND 1000000000
    AND "priceRoundingThreshold" BETWEEN 0 AND "priceRoundingIncrement"
  );
