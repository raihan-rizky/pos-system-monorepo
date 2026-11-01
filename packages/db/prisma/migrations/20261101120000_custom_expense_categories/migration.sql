CREATE TABLE "pos_expense_categories" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pos_expense_categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_expense_categories_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "pos_expense_categories_storeId_normalizedName_key"
  ON "pos_expense_categories"("storeId", "normalizedName");
CREATE UNIQUE INDEX "pos_expense_categories_id_storeId_key"
  ON "pos_expense_categories"("id", "storeId");

ALTER TABLE "pos_expenses" ADD COLUMN "customCategoryId" TEXT;
ALTER TABLE "pos_expenses" ADD CONSTRAINT "pos_expenses_customCategoryId_storeId_fkey"
  FOREIGN KEY ("customCategoryId", "storeId") REFERENCES "pos_expense_categories"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_expenses" ADD CONSTRAINT "pos_expenses_custom_category_kind_check"
  CHECK ("customCategoryId" IS NULL OR "category" = 'OTHER');
CREATE INDEX "pos_expenses_storeId_customCategoryId_idx"
  ON "pos_expenses"("storeId", "customCategoryId");
