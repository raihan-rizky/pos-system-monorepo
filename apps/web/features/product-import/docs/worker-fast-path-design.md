# Product Import Worker Fast Path

## Understanding Summary

- Improve product import worker speed for the existing 3,000-row import limit.
- Target completion time is 1-3 minutes for common imports.
- The common workload is mostly price updates to existing products, often mixed with auto-skipped rows.
- Keep the current DB-backed job queue, job APIs, polling UI, audit records, and undo behavior.
- Avoid higher-risk parallel chunk or row processing.
- DB infrastructure failures must keep rows pending for retry, not mark them failed or skipped.

## Assumptions

- Optimize the `update-price` and `skip` hot path first.
- Creates, variants, stock updates, full product updates, and complex rows can keep using the existing generic processor.
- Price logs are still required for real price or cost changes.
- Skipped rows should keep before/after snapshots when a matched product is already available.
- Minimal audit data is acceptable for skipped rows without a matched product.

## Decision Log

- Add a fast path for chunks containing only `update-price` and `skip` rows.
  Alternatives: generic cleanup only, parallel processing.
  Reason: the common workload is mostly price updates plus skips.

- Preserve generic fallback for complex chunks.
  Alternatives: rewrite all import processing.
  Reason: lower risk and preserves existing semantics.

- Keep snapshots for skipped rows when product exists.
  Alternatives: minimal audit only.
  Reason: keeps audit/debug value with limited extra cost.

- Avoid parallelism.
  Alternatives: concurrent chunks or rows.
  Reason: product, stock, log, and audit mutations make concurrency higher risk.

## Final Design

Inside `commitProductImportChunk`, after planned rows and committed row numbers are loaded, build the existing chunk execution plan once. If every uncommitted row has planned commit action `update-price` or `skip`, and every `update-price` row maps to an existing product, run a specialized fast path.

The fast path updates only price-related product fields, bulk-creates price logs, and bulk-creates batch operation items. It records `SKIP` batch operation items for skipped rows, using product snapshots when a matched product is available. Already committed source rows are ignored so chunk retries stay idempotent.

Any chunk containing creates, variants, stock changes, full updates, or other complex behavior falls back to the existing generic row processor.
