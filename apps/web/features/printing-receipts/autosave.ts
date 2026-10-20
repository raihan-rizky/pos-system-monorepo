import type { PrintingReceipt } from "./types";

export function createPrintingReceiptSaveQueue(initial: PrintingReceipt, save: (receipt: PrintingReceipt) => Promise<PrintingReceipt>) {
  let record = initial;
  let version = 0;
  let savedVersion = 0;
  let pending: Promise<PrintingReceipt> | null = null;
  let disposed = false;

  function flush(): Promise<PrintingReceipt> {
    if (pending) return pending;
    pending = (async () => {
      while (!disposed && savedVersion < version) {
        const savingVersion = version;
        const result = await save(record);
        savedVersion = savingVersion;
        record = version === savingVersion ? result : { ...record, revision: result.revision, updatedAt: result.updatedAt };
      }
      return record;
    })().finally(() => { pending = null; });
    return pending;
  }

  return {
    update(next: PrintingReceipt) {
      if (disposed) return;
      if (next.id !== record.id) throw new Error("Nota aktif berubah. Buka kembali nota yang ingin diisi.");
      record = { ...next, revision: record.revision };
      version++;
    },
    current: () => record,
    hasPending: () => savedVersion < version,
    dispose: () => { disposed = true; },
    flush,
  };
}
