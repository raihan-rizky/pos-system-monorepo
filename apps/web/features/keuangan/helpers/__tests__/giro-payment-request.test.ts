import { describe, expect, it, vi } from "vitest";
import { giroPaymentStorageKey, listLegacyGiroPayments, postGiroPayment, readGiroPaymentGeneration, readPendingGiroPayment, removeLegacyGiroPayment } from "../giro-payment-request";

function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}
function enumerableStorage() {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
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
  it.each([null, "8e90eec3-8f6c-42f1-b67d-30c52e2a38dc"])("tidak mengirim pemulihan jika kunci berubah menjadi %s saat menunggu", async currentKey => {
    const saved = storage();
    if (currentKey) saved.setItem(giroPaymentStorageKey(scope), JSON.stringify({ key: currentKey, ...draft }));
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 201 }));
    await expect(postGiroPayment(saved, scope, draft, fetcher, () => key, locks(), undefined, key)).rejects.toMatchObject({ refreshBalance: true });
    expect(fetcher).not.toHaveBeenCalled();
    expect(readPendingGiroPayment(saved, scope)?.key ?? null).toBe(currentKey);
  });

  it("menolak formulir baru yang dibuka sebelum pembayaran lain selesai meski saldo kembali sama", async () => {
    const saved = storage();
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ success: true }), { status: 201 }));
    await postGiroPayment(saved, scope, draft, fetcher, () => key, locks(), undefined, undefined, null);
    await expect(postGiroPayment(saved, scope, draft, fetcher, () => "8e90eec3-8f6c-42f1-b67d-30c52e2a38dc", locks(), undefined, undefined, null)).rejects.toMatchObject({ refreshBalance: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("tidak mengembalikan penanda lama setelah pemulihan dan pembayaran hutang lain", async () => {
    const saved = storage();
    const remove = saved.removeItem;
    let failRemoval = true;
    saved.removeItem = key => { if (failRemoval) { failRemoval = false; throw new Error("storage unavailable"); } remove(key); };
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ success: true }), { status: 201 }));
    await expect(postGiroPayment(saved, scope, draft, fetcher, () => key, locks())).rejects.toThrow();
    const oldGeneration = readGiroPaymentGeneration(saved, scope);
    await postGiroPayment(saved, { ...scope, payableId: "debt-2" }, draft, fetcher, () => "8e90eec3-8f6c-42f1-b67d-30c52e2a38dc", locks());
    await postGiroPayment(saved, scope, draft, fetcher, () => key, locks(), undefined, key);
    expect(readGiroPaymentGeneration(saved, scope)).not.toBe(oldGeneration);
  });

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
    await expect(postGiroPayment(saved, scope, { ...draft, expectedLedgerVersion: "0" }, fetcher, () => key, locks())).rejects.toMatchObject({ message: "Saldo berubah.", refreshBalance: true });
    expect(readPendingGiroPayment(saved, scope)).toBeNull();
  });

  it("mempertahankan pembayaran jika penolakan pendaftaran belum dapat dipastikan", async () => {
    const saved = storage();
    const versioned = { ...draft, expectedLedgerVersion: "0", resource: "GIRO" as const };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Nominal tidak valid.", code: "ValidationError" }), { status: 422 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "Conflict" }), { status: 409 }));
    await expect(postGiroPayment(saved, scope, versioned, fetcher, () => key, locks())).rejects.toThrow(/belum dapat dipastikan/i);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(readPendingGiroPayment(saved, scope)).toEqual({ key, ...versioned });
  });

  it("mengakui pembayaran yang sudah tersimpan setelah penolakan pendaftaran", async () => {
    const saved = storage();
    const versioned = { ...draft, expectedLedgerVersion: "0", resource: "GIRO" as const };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "ValidationError" }), { status: 422 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await postGiroPayment(saved, scope, versioned, fetcher, () => key, locks());
    expect(readPendingGiroPayment(saved, scope)).toBeNull();
  });

  it("mempertahankan pembayaran lama tanpa versi ketika server tidak dapat memastikan hasilnya", async () => {
    const saved = storage();
    const legacy = { key, amount: draft.amount, paidAt: draft.paidAt };
    saved.setItem(`giro-payment:${JSON.stringify([scope.storeId, scope.userId, scope.payableId])}`, JSON.stringify(legacy));
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Data hutang belum tersedia.", code: "ValidationError" }), { status: 422 }));
    await expect(postGiroPayment(saved, scope, { amount: legacy.amount, paidAt: legacy.paidAt }, fetcher, () => "unused", locks())).rejects.toThrow(/belum dapat dipastikan/i);
    expect(readPendingGiroPayment(saved, scope)).toEqual(legacy);
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

  it("mempertahankan snapshot sesi lama ketika akun lain membuka hutang yang sama", async () => {
    const saved = storage(); const session = storage();
    session.setItem("giro-payment:debt-1", JSON.stringify({ key, amount: draft.amount, paidAt: draft.paidAt }));
    vi.stubGlobal("window", { sessionStorage: session });
    try {
      expect(readPendingGiroPayment(saved, { ...scope, userId: "user-2" })).toBeNull();
      expect(saved.getItem(`giro-payment:${JSON.stringify([scope.storeId, "user-2", scope.payableId])}`)).toBeNull();
      expect(session.getItem("giro-payment:debt-1")).not.toBeNull();
      expect(readPendingGiroPayment(saved, scope)).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });

  it("menemukan catatan sesi lama tanpa menganggapnya milik akun atau toko saat ini", () => {
    const session = enumerableStorage();
    const legacy = { key, amount: draft.amount, paidAt: draft.paidAt };
    session.setItem("giro-payment:debt-1", JSON.stringify(legacy));
    session.setItem(`giro-payment:${JSON.stringify([scope.storeId, scope.userId, scope.payableId])}`, JSON.stringify(legacy));
    const result = listLegacyGiroPayments(session as unknown as Storage);
    expect(result).toEqual([{ payableId: "debt-1", raw: JSON.stringify(legacy), pending: legacy }]);
  });

  it("menampilkan catatan lama yang rusak agar tidak hilang tanpa keputusan pengguna", () => {
    const session = enumerableStorage();
    session.setItem("giro-payment:debt-1", "{broken");
    expect(listLegacyGiroPayments(session as unknown as Storage)).toEqual([{ payableId: "debt-1", raw: "{broken", pending: null }]);
  });

  it("menghapus catatan lama hanya jika salinannya belum berubah", () => {
    const session = enumerableStorage();
    const original = { key, amount: draft.amount, paidAt: draft.paidAt };
    const entryKey = "giro-payment:debt-1";
    session.setItem(entryKey, JSON.stringify(original));
    const [record] = listLegacyGiroPayments(session as unknown as Storage);
    session.setItem(entryKey, JSON.stringify({ ...original, amount: "1000" }));
    expect(removeLegacyGiroPayment(session as unknown as Storage, record)).toBe(false);
    expect(session.getItem(entryKey)).toBe(JSON.stringify({ ...original, amount: "1000" }));
  });

  it("tidak mengirim catatan sesi lama sebagai pembayaran baru setelah akun atau toko berubah", async () => {
    const saved = storage(); const session = storage();
    session.setItem("giro-payment:debt-1", JSON.stringify({ key, ...draft }));
    vi.stubGlobal("window", { sessionStorage: session });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 201 }));
    try {
      await expect(postGiroPayment(saved, { ...scope, userId: "user-2", storeId: "store-2" }, draft, fetcher, () => "new-key", locks())).rejects.toThrow(/catatan pembayaran lama/i);
      expect(fetcher).not.toHaveBeenCalled();
      expect(session.getItem("giro-payment:debt-1")).not.toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });

  it("hanya memeriksa catatan lama dengan replay, dan mempertahankannya jika akun atau toko tidak cocok", async () => {
    const saved = storage(); const session = storage();
    const legacy = { key, ...draft };
    const raw = JSON.stringify(legacy);
    session.setItem("giro-payment:debt-1", raw);
    vi.stubGlobal("window", { sessionStorage: session, dispatchEvent: () => true });
    try {
      const urls: string[] = [];
      const fetcher = vi.fn().mockImplementation(async (url: string) => {
        urls.push(url);
        return new Response(null, { status: 403 });
      });
      await expect(postGiroPayment(saved, { ...scope, storeId: "store-2" }, legacy, fetcher, () => "unused", locks(), undefined, undefined, undefined, { recoverLegacy: true, expectedLegacyRaw: raw })).rejects.toThrow(/belum dapat dipastikan/i);
      expect(urls).toEqual(["/api/finance/supplier-payables/debt-1/payments?replay=1"]);
      expect(session.getItem("giro-payment:debt-1")).toBe(raw);
      expect(saved.getItem(giroPaymentStorageKey({ ...scope, storeId: "store-2" }))).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });

  it("menolak formulir lama ketika permintaan pertama selesai setelah formulir kedua dibuka", async () => {
    const saved = storage(); const lock = locks();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const fetcher = vi.fn().mockImplementationOnce(async () => {
      await gate;
      return new Response(JSON.stringify({ success: true }), { status: 201 });
    });
    const newKey = vi.fn(() => "8e90eec3-8f6c-42f1-b67d-30c52e2a38dc");
    const first = postGiroPayment(saved, scope, draft, fetcher, () => key, lock);
    await Promise.resolve(); await Promise.resolve();
    const late = postGiroPayment(saved, scope, draft, fetcher, newKey, lock, undefined, undefined, null);
    release();
    await first;
    await expect(late).rejects.toMatchObject({ refreshBalance: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(newKey).not.toHaveBeenCalled();
  });

  it("hanya menghapus snapshot lama setelah replay akun asal berhasil", async () => {
    const saved = storage(); const session = storage();
    const legacy = { key, amount: draft.amount, paidAt: draft.paidAt };
    const raw = JSON.stringify(legacy);
    session.setItem("giro-payment:debt-1", raw);
    vi.stubGlobal("window", { sessionStorage: session, dispatchEvent: () => true });
    try {
      const fetcher = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        const headers = new Headers(init.headers);
        return headers.get("X-Payment-User") === scope.userId
          ? new Response(JSON.stringify({ success: true }), { status: 201 })
          : new Response(null, { status: 403 });
      });
      const recovery = { recoverLegacy: true, expectedLegacyRaw: raw };
      await expect(postGiroPayment(saved, { ...scope, userId: "user-2" }, { amount: legacy.amount, paidAt: legacy.paidAt }, fetcher, () => "unused", locks(), undefined, undefined, undefined, recovery)).rejects.toThrow(/belum dapat dipastikan/i);
      expect(session.getItem("giro-payment:debt-1")).not.toBeNull();
      await postGiroPayment(saved, scope, { amount: legacy.amount, paidAt: legacy.paidAt }, fetcher, () => "unused", locks(), undefined, undefined, undefined, recovery);
      expect(session.getItem("giro-payment:debt-1")).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });

  it("memeriksa snapshot sesi tanpa identitas hanya melalui replay tersimpan", async () => {
    const saved = storage(); const session = storage();
    const legacy = { key, ...draft, expectedLedgerVersion: "0", resource: "MANUAL" as const };
    session.setItem("giro-payment:debt-1", JSON.stringify(legacy));
    vi.stubGlobal("window", { sessionStorage: session, dispatchEvent: () => true });
    try {
      const urls: string[] = [];
      const fetcher = vi.fn().mockImplementation(async (url: string) => {
        urls.push(url);
        return new Response(JSON.stringify({ code: "BalanceChanged" }), { status: 409 });
      });
      const raw = JSON.stringify(legacy);
      await expect(postGiroPayment(saved, { ...scope, userId: "user-2" }, legacy, fetcher, () => "unused", locks(), undefined, undefined, undefined, { recoverLegacy: true, expectedLegacyRaw: raw })).rejects.toThrow(/belum dapat dipastikan/i);
      expect(urls).toHaveLength(1);
      expect(urls[0]).toContain("?replay=1");
      expect(session.getItem("giro-payment:debt-1")).toBe(JSON.stringify(legacy));
      expect(saved.getItem(giroPaymentStorageKey({ ...scope, userId: "user-2" }))).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });

  it("mengirim identitas formulir saat sesi berubah sebelum pemeriksaan ulang", async () => {
    const saved = storage();
    const versioned = { ...draft, expectedLedgerVersion: "0", resource: "MANUAL" as const };
    let calls = 0;
    const fetcher = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      calls++;
      if (calls === 1) return new Response(null, { status: 403 });
      const headers = new Headers(init.headers);
      return headers.get("X-Payment-User") === scope.userId && headers.get("X-Payment-Store") === scope.storeId
        ? new Response(null, { status: 403 })
        : new Response(JSON.stringify({ code: "BalanceChanged" }), { status: 409 });
    });
    await expect(postGiroPayment(saved, scope, versioned, fetcher, () => key, locks())).rejects.toThrow(/belum dapat dipastikan/i);
    expect(readPendingGiroPayment(saved, scope)).toEqual({ key, ...versioned });
    expect(calls).toBe(2);
  });

  it("mempertahankan snapshot ketika terjadi konflik yang harus diperiksa", async () => {
    const saved = storage();
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Konflik", code: "Conflict" }), { status: 409 }));
    await expect(postGiroPayment(saved, scope, draft, fetcher, () => key, locks())).rejects.toThrow();
    expect(readPendingGiroPayment(saved, scope)).toEqual({ key, ...draft });
  });
});
