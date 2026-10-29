-- Preserve the stored selling prices and HPP; only change how followers are maintained.
UPDATE "pos_product_stock_groups" AS groups
SET "pricingConfig" = jsonb_set(
  jsonb_set(groups."pricingConfig"::jsonb, '{members}', (
    SELECT jsonb_object_agg(member.key,
      CASE WHEN member.key <> COALESCE(groups."pricingConfig"->>'sourceProductId', '')
        AND member.value->>'mode' = 'AUTO'
        THEN jsonb_set(member.value, '{mode}', '"MANUAL"'::jsonb)
        ELSE member.value END)
    FROM jsonb_each(CASE WHEN jsonb_typeof(groups."pricingConfig"->'members') = 'object'
      THEN groups."pricingConfig"->'members' ELSE '{}'::jsonb END) AS member
  )),
  '{revision}', CASE WHEN jsonb_typeof(groups."pricingConfig"->'revision') = 'number'
    THEN CASE WHEN (groups."pricingConfig"->>'revision')::numeric BETWEEN 1 AND 9007199254740990
      AND trunc((groups."pricingConfig"->>'revision')::numeric) = (groups."pricingConfig"->>'revision')::numeric
      THEN to_jsonb((groups."pricingConfig"->>'revision')::numeric + 1)
      ELSE groups."pricingConfig"->'revision' END
    ELSE COALESCE(groups."pricingConfig"->'revision', '1'::jsonb) END
), "updatedAt" = CURRENT_TIMESTAMP
WHERE jsonb_typeof(groups."pricingConfig"->'members') = 'object'
  AND EXISTS (
    SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(groups."pricingConfig"->'members') = 'object'
      THEN groups."pricingConfig"->'members' ELSE '{}'::jsonb END) AS member
    WHERE member.key <> COALESCE(groups."pricingConfig"->>'sourceProductId', '')
      AND member.value->>'mode' = 'AUTO'
  );
