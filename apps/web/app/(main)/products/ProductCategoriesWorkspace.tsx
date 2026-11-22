"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";

const CategoryManagementTab = lazy(() =>
  import("@/features/product-categories/components/CategoryManagementTab").then(module => ({ default: module.CategoryManagementTab })),
);
const ProductClassificationContainer = lazy(() =>
  import("@/features/product-classification/components/ProductClassificationContainer").then(module => ({ default: module.ProductClassificationContainer })),
);

export function ProductCategoriesWorkspace({
  onLegacyCategoriesDeleted,
  ...permissions
}: {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onLegacyCategoriesDeleted: (ids: string[]) => void;
}) {
  const [showLegacyCategories, setShowLegacyCategories] = useState(false);
  const switchButton = useRef<HTMLButtonElement>(null);
  const hasSwitchedViews = useRef(false);

  useEffect(() => {
    if (hasSwitchedViews.current) switchButton.current?.focus();
  }, [showLegacyCategories]);

  const viewAction = (
    <button
      ref={switchButton}
      type="button"
      className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-sky-600"
      onClick={() => {
        hasSwitchedViews.current = true;
        setShowLegacyCategories(showing => !showing);
      }}
    >
      {showLegacyCategories ? "Kembali ke daftar produk" : "Kelola kategori lama"}
    </button>
  );

  return (
    <>
      <div hidden={showLegacyCategories}>
        <ProductClassificationContainer
          {...permissions}
          headingAction={showLegacyCategories ? null : viewAction}
        />
      </div>
      {showLegacyCategories && (
        <div className="space-y-4">
          {viewAction}
          <Suspense fallback={<p role="status">Memuat kategori...</p>}>
            <CategoryManagementTab {...permissions} onDeleted={onLegacyCategoriesDeleted} />
          </Suspense>
        </div>
      )}
    </>
  );
}
