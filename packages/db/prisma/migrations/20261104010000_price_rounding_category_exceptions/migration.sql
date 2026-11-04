CREATE TABLE "_PriceRoundingExcludedCategories" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL,
  CONSTRAINT "_PriceRoundingExcludedCategories_AB_pkey" PRIMARY KEY ("A", "B")
);

CREATE INDEX "_PriceRoundingExcludedCategories_B_index"
  ON "_PriceRoundingExcludedCategories"("B");

ALTER TABLE "_PriceRoundingExcludedCategories"
  ADD CONSTRAINT "_PriceRoundingExcludedCategories_A_fkey"
  FOREIGN KEY ("A") REFERENCES "pos_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_PriceRoundingExcludedCategories"
  ADD CONSTRAINT "_PriceRoundingExcludedCategories_B_fkey"
  FOREIGN KEY ("B") REFERENCES "StoreSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
