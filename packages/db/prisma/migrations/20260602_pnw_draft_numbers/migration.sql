WITH active_old_drafts AS (
  SELECT
    id,
    "storeId",
    substring("draftNumber" FROM '^DRAFT-(\d{8})-\d+$') AS draft_date,
    "createdAt"
  FROM pos_transactions
  WHERE status = 'DRAFT'
    AND "draftNumber" ~ '^DRAFT-\d{8}-\d+$'
),
renumbered AS (
  SELECT
    id,
    draft_date,
    row_number() OVER (
      PARTITION BY "storeId", draft_date
      ORDER BY "createdAt", id
    ) AS seq
  FROM active_old_drafts
  WHERE draft_date IS NOT NULL
)
UPDATE pos_transactions AS tx
SET "draftNumber" = 'PNW-TLD-' || r.draft_date || '-' || lpad(r.seq::text, 3, '0')
FROM renumbered AS r
WHERE tx.id = r.id;
