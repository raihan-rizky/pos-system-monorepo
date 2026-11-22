INSERT INTO "pos_product_subcategories" ("id", "group", "name")
SELECT defaults.id, 'PERCETAKAN'::"ProductCatalogGroup", defaults.name
FROM (VALUES
  ('catalog_printing_cetak', 'CETAK'),
  ('catalog_printing_spanduk', 'SPANDUK')
) AS defaults(id, name)
WHERE NOT EXISTS (
  SELECT 1
  FROM "pos_product_subcategories" existing
  WHERE existing."group" = 'PERCETAKAN'::"ProductCatalogGroup"
    AND lower(btrim(regexp_replace(existing."name", '[[:space:]]+', ' ', 'g'))) = lower(defaults.name)
)
ON CONFLICT DO NOTHING;
