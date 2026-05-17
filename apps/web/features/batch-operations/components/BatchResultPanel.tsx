"use client";

import { Button } from "@pos/ui";
import { RotateCcw } from "lucide-react";
import { useUndoBatchOperation } from "../hooks/useUndoBatchOperation";

export function BatchResultPanel({
  batchOperationId,
  summary,
}: {
  batchOperationId: string;
  summary: Array<{ label: string; value: string | number }>;
}) {
  const undo = useUndoBatchOperation();

  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {summary.map((item) => (
          <div key={item.label} className="rounded-lg bg-white/80 border border-emerald-100 p-3">
            <p className="text-[10px] uppercase tracking-widest font-bold text-emerald-700">{item.label}</p>
            <p className="mt-1 text-xl font-black text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>
      {undo.data?.success === false && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
          Undo blocked for: {undo.data.blockedProducts.join(", ")}
        </div>
      )}
      {undo.data?.success && (
        <div className="rounded-lg bg-white border border-emerald-100 p-3 text-sm text-emerald-700">
          Undo completed. Reversal logs: {undo.data.reversalInventoryLogCount}
        </div>
      )}
      <Button
        type="button"
        variant="secondary"
        icon={<RotateCcw className="w-4 h-4" />}
        loading={undo.isPending}
        disabled={undo.isPending || undo.data?.success}
        onClick={() => undo.mutate(batchOperationId)}
      >
        Undo Batch
      </Button>
    </div>
  );
}
