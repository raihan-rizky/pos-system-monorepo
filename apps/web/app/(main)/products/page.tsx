import { Suspense } from "react";
import ProductsClientPage from "./ProductsClientPage";

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <span className="text-sm font-medium text-slate-400">
            Memuat halaman...
          </span>
        </div>
      }
    >
      <ProductsClientPage />
    </Suspense>
  );
}
