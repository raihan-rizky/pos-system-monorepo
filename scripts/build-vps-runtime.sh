#!/usr/bin/env bash
set -euo pipefail
target="${1:?Target dev atau prod wajib diisi}"
case "$target" in dev|prod) ;; *) exit 2 ;; esac
test -n "${NEXT_PUBLIC_SUPABASE_URL:-}"
test -n "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}"
test -n "${R2_PUBLIC_BASE_URL:-}"
pnpm exec turbo run build
grep -RFq -- "$NEXT_PUBLIC_SUPABASE_URL" apps/web/.next/static
grep -RFq -- "$NEXT_PUBLIC_SUPABASE_ANON_KEY" apps/web/.next/static
runtime="${RUNNER_TEMP:?}/pos-artifact/$target/runtime"
output="${GITHUB_WORKSPACE:?}/artifact/output"
mkdir -p "$runtime/apps/web" "$runtime/apps/admin" "$runtime/packages" "$output"
cp -a package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json "$runtime/"
cp -al node_modules "$runtime/node_modules"
cp -a apps/admin/package.json "$runtime/apps/admin/"
cp -a apps/web/{package.json,next.config.mjs,tsconfig.json} "$runtime/apps/web/"
cp -a apps/web/{public,node_modules} "$runtime/apps/web/"
rsync -a --exclude='/cache/' apps/web/.next/ "$runtime/apps/web/.next/"
for directory in app components features hooks lib utils; do
  rsync -a --exclude='__tests__/' --exclude='*.test.*' --exclude='*.spec.*' \
    --exclude='*.log' --exclude='*.log.*' --exclude='.env*' \
    "apps/web/$directory" "$runtime/apps/web/"
done
for package in db ui config product-import-worker; do
  mkdir -p "$runtime/packages/$package"
  cp -a "packages/$package/package.json" "$runtime/packages/$package/"
  for entry in src prisma node_modules tsconfig.json tailwind.config.js tailwind.config.ts; do
    if [ -e "packages/$package/$entry" ]; then
      cp -al "packages/$package/$entry" "$runtime/packages/$package/"
    fi
  done
done
VPS_BUILD_REF="$GITHUB_REF" node scripts/package-vps-artifact.mjs "$runtime" "$output" "$GITHUB_SHA" "$target"
test "$(find "$output" -maxdepth 1 -type f | wc -l)" = 3
