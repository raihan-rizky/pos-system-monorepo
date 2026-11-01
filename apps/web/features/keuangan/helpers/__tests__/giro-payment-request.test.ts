import { describe, expect, it, vi } from "vitest";
import { postGiroPayment, readPendingGiroPayment } from "../giro-payment-request";

function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}
function locks() {
  let previous = Promise.resolve();
  return async (_name: string, operation: () => Promise<void>) => {
    const next = previous.then(operation);
    previous = next.catch(() => {});
    return next;
  };
}
const scope = { storeId: "store-1", userId: "user-1", payableId: "debt-1" };
const key = "b14f880a-fb50-43bc-a2aa-4733c8811dad";
const draft = { amount: "30000", paidAt: "2026-10-20", expectedBalance: "70000" };

describe("retry pembayaran giro", () => {
  it("membatalkan pembayaran yang masih menunggu kunci sebelum menyimpan snapshot", async () => {
    const saved = storage();
    const controller = new AbortController();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const waitingLock = async (_name: string, operation: () => Promise<void>) => { await gate; await operation(); };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 201 }));
    const result = postGiroPayment(saved, scope, draft, fetcher, () => key, waitingLock, controller.signal);
    controller.abort();
    release();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(readPendingGiroPayment(saved, scope)).toBeNull();
  });

  it("menyimpan kunci dan data saat respons hilang lalu menggunakan kembali setelah tab ditutup", async () => {
    const saved = storage();
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("connection lost"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 201 }));
    const lock = locks();
    await expect(postGiroPayment(saved, scope, draft, fetcher, () => key, lock)).rejects.toThrow(/belum dapat dipastikan/i);
    expect(readPendingGiroPayment(saved, scope)).toEqual({ key, ...draft });
    await postGiroPayment(saved, scope, draft, fetcher, () => "must-not-be-used", lock);
    expect(fetcher.mock.calls[0][1].headers["Idempotency-Key"]).toBe(key);
    expect(fetcher.mock.calls[1][1].headers["Idempotency-Key"]).toBe(key);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual(draft);
    expect(readPendingGiroPayment(saved, scope)).toBeNull();
  });

  it("mengantre dua tab dan mempertahankan kunci saat respons pertama hilang", async () => {
    const saved = storage(); const lock = locks();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const fetcher = vi.fn().mockImplementationOnce(async () => { await gate; throw new TypeError("lost"); })
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 201 }));
    const first = postGiroPayment(saved, scope, draft, fetcher, () => key, lock).catch(() => {});
    await Promise.resolve(); await Promise.resolve();
    const second = postGiroPayment(saved, scope, draft, fetcher, () => "must-not-be-used", lock);
    expect(fetcher).toHaveBeenCalledTimes(1);
    release(); await Promise.all([first, second]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1].headers["Idempotency-Key"]).toBe(key);
  });

  it("menolak perubahan nominal atau sisa saat hasil sebelumnya belum pasti", async () => {
    const saved = storage(); const lock = locks();
    const fetcher = vi.fn().mockRejectedValue(new TypeError("connection lost"));
    await expect(postGiroPayment(saved, scope, draft, fetcher, () => key, lock)).rejects.toThrow();
    await expect(postGiroPayment(saved, scope, { ...draft, expectedBalance: "40000" }, fetcher, () => key, lock)).rejects.toThrow(/pembayaran sebelumnya/i);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("memisahkan snapshot antar toko dan pengguna", async () => {
    const saved = storage(); const lock = locks();
    await expect(postGiroPayment(saved, scope, draft, vi.fn().mockRejectedValue(new Error()), () => key, lock)).rejects.toThrow();
    expect(readPendingGiroPayment(saved, { ...scope, userId: "user-2" })).toBeNull();
    expect(readPendingGiroPayment(saved, { ...scope, storeId: "store-2" })).toBeNull();
  });

  it("mempertahankan snapshot jika server mengembalikan 500", async () => {
    const saved = storage();
    await expect(postGiroPayment(saved, scope, draft, vi.fn().mockResolvedValue(new Response("", { status: 500 })), () => key, locks())).rejects.toThrow(/belum dapat dipastikan/i);
    expect(readPendingGiroPayment(saved, scope)).toEqual({ key, ...draft });
  });

  it.each([422, 409])("menghapus snapshot dan meminta pembaruan saldo pada penolakan pasti %s", async status => {
    const saved = storage();
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Saldo berubah.", code: status === 409 ? "BalanceChanged" : "ValidationError" }), { status }));
    await expect(postGiroPayment(saved, scope, draft, fetcher, () => key, locks())).rejects.toMatchObject({ message: "Saldo berubah.", refreshBalance: true });
    expect(readPendingGiroPayment(saved, scope)).toBeNull();
  });

  it("menolak mengirim jika penyimpanan atau kunci lintas tab tidak tersedia", async () => {
    const saved = { getItem: () => null, setItem: () => { throw new Error("storage unavailable"); }, removeItem: () => {} };
    const fetcher = vi.fn();
    await expect(postGiroPayment(saved, scope, draft, fetcher, () => key, locks())).rejects.toThrow(/penyimpanan/i);
    vi.stubGlobal("navigator", {});
    try { await expect(postGiroPayment(storage(), scope, draft, fetcher, () => key)).rejects.toThrow(/peramban/i); }
    finally { vi.unstubAllGlobals(); }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("tidak mengganti permintaan tersimpan yang rusak dengan pembayaran baru", async () => {
    const saved = storage();
    saved.setItem(`giro-payment:${JSON.stringify([scope.storeId, scope.userId, scope.payableId])}`, "{broken");
    const fetcher = vi.fn();
    expect(() => readPendingGiroPayment(saved, scope)).toThrow(/pembayaran sebelumnya/i);
    await expect(postGiroPayment(saved, scope, draft, fetcher, () => key, locks())).rejects.toThrow(/pembayaran sebelumnya/i);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("mengulangi snapshot format lama tanpa mengarang saldo awal", async () => {
    const saved = storage();
    saved.setItem(`giro-payment:${JSON.stringify([scope.storeId, scope.userId, scope.payableId])}`, JSON.stringify({ key, amount: draft.amount, paidAt: draft.paidAt }));
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 201 }));
    expect(readPendingGiroPayment(saved, scope)).toEqual({ key, amount: draft.amount, paidAt: draft.paidAt });
    await postGiroPayment(saved, scope, { amount: draft.amount, paidAt: draft.paidAt }, fetcher, () => "unused", locks());
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ amount: draft.amount, paidAt: draft.paidAt });
  });

  it("mengadopsi snapshot sesi format lama sebelum mengirim ulang", async () => {
    const saved = storage(); const session = storage();
    session.setItem("giro-payment:debt-1", JSON.stringify({ key, amount: draft.amount, paidAt: draft.paidAt }));
    vi.stubGlobal("window", { sessionStorage: session });
    try {
      const pending = readPendingGiroPayment(saved, scope);
      expect(pending).toEqual({ key, amount: draft.amount, paidAt: draft.paidAt });
      expect(session.getItem("giro-payment:debt-1")).toBeNull();
      expect(saved.getItem(`giro-payment:${JSON.stringify([scope.storeId, scope.userId, scope.payableId])}`)).not.toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });

  it("mempertahankan snapshot ketika terjadi konflik yang harus diperiksa", async () => {
    const saved = storage();
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Konflik", code: "Conflict" }), { status: 409 }));
    await expect(postGiroPayment(saved, scope, draft, fetcher, () => key, locks())).rejects.toThrow();
    expect(readPendingGiroPayment(saved, scope)).toEqual({ key, ...draft });
  });
});
