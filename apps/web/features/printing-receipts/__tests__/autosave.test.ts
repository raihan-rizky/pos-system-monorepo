import { describe, expect, it } from "vitest";
import { createPrintingReceiptSaveQueue } from "../autosave";
import type { PrintingReceipt } from "../types";

const draft = { id: "one", number: "SP-1", revision: 1, document: { note: "awal" }, transactionId: null } as PrintingReceipt;

describe("serial receipt autosave", () => {
  it("does not write a clean receipt when flushed repeatedly", async () => {
    let calls = 0;
    const queue = createPrintingReceiptSaveQueue(draft, async record => { calls++; return record; });
    expect(await queue.flush()).toEqual(draft);
    expect(await queue.flush()).toEqual(draft);
    expect(calls).toBe(0);
  });
  it("rejects another receipt without changing or saving the active document", async () => {
    let calls = 0;
    const queue = createPrintingReceiptSaveQueue(draft, async record => { calls++; return record; });
    expect(() => queue.update({ ...draft, id: "other", number: "OTHER-1" })).toThrow("Nota aktif berubah");
    expect(await queue.flush()).toEqual(draft);
    expect(queue.hasPending()).toBe(false);
    expect(calls).toBe(0);
  });
  it("retries the latest buffered edit after an older in-flight save fails", async () => {
    let reject!: (error: Error) => void;
    const writes: { revision: number; note: string }[] = [];
    const queue = createPrintingReceiptSaveQueue(draft, async record => {
      writes.push({ revision: record.revision, note: record.document.note });
      if (writes.length === 1) await new Promise<void>((_resolve, fail) => { reject = fail; });
      return { ...record, revision: record.revision + 1 };
    });
    queue.update({ ...draft, document: { ...draft.document, note: "pertama" } });
    const failure = expect(queue.flush()).rejects.toThrow("offline");
    queue.update({ ...draft, revision: 999, document: { ...draft.document, note: "terbaru" } });
    reject(new Error("offline"));
    await failure;
    expect(queue.current().document.note).toBe("terbaru");
    expect((await queue.flush()).revision).toBe(2);
    expect(writes).toEqual([{ revision: 1, note: "pertama" }, { revision: 1, note: "terbaru" }]);
    expect(queue.hasPending()).toBe(false);
  });
  it("does not start writes or accept updates after disposal", async () => {
    let calls = 0;
    const queue = createPrintingReceiptSaveQueue(draft, async record => { calls++; return record; });
    queue.update({ ...draft, number: "sebelum" });
    queue.dispose();
    queue.update({ ...draft, number: "sesudah" });
    expect((await queue.flush()).number).toBe("sebelum");
    expect(calls).toBe(0);
  });
  it("saves newer edits using the revision returned by the prior request", async () => {
    let release!: () => void;
    const requests: { revision: number; note: string }[] = [];
    const queue = createPrintingReceiptSaveQueue(draft, async (record) => {
      requests.push({ revision: record.revision, note: record.document.note });
      if (requests.length === 1) await new Promise<void>(resolve => { release = resolve; });
      return { ...record, revision: record.revision + 1 };
    });
    queue.update({ ...draft, document: { ...draft.document, note: "pertama" } });
    const saving = queue.flush();
    await Promise.resolve();
    queue.update({ ...draft, document: { ...draft.document, note: "kedua" } });
    release();
    const saved = await saving;
    expect(requests).toEqual([{ revision: 1, note: "pertama" }, { revision: 2, note: "kedua" }]);
    expect(saved.revision).toBe(3);
    expect(saved.document.note).toBe("kedua");
  });
  it("preserves edits after a failed save and retries the same revision", async () => {
    let fail = true;
    const queue = createPrintingReceiptSaveQueue(draft, async record => {
      if (fail) throw new Error("Nomor nota sudah digunakan");
      return { ...record, revision: record.revision + 1 };
    });
    queue.update({ ...draft, number: "pilihan-saya" });
    await expect(queue.flush()).rejects.toThrow("Nomor nota sudah digunakan");
    expect(queue.current().number).toBe("pilihan-saya");
    expect(queue.hasPending()).toBe(true);
    fail = false;
    expect((await queue.flush()).revision).toBe(2);
    expect(queue.hasPending()).toBe(false);
  });
  it("shares one in-flight flush so switching or checkout waits for the same write", async () => {
    let release!: () => void;
    let calls = 0;
    const queue = createPrintingReceiptSaveQueue(draft, async record => {
      calls++;
      await new Promise<void>(resolve => { release = resolve; });
      return { ...record, revision: 2 };
    });
    queue.update({ ...draft, number: "changed" });
    const first = queue.flush();
    const second = queue.flush();
    release();
    expect(await first).toEqual(await second);
    expect(calls).toBe(1);
  });
  it("stops buffered writes after an editor scope is disposed", async () => {
    let release!: () => void;
    const savedNotes: string[] = [];
    const queue = createPrintingReceiptSaveQueue(draft, async record => {
      savedNotes.push(record.document.note);
      await new Promise<void>(resolve => { release = resolve; });
      return { ...record, revision: record.revision + 1 };
    });
    queue.update({ ...draft, document: { ...draft.document, note: "sedang disimpan" } });
    const saving = queue.flush();
    queue.update({ ...draft, document: { ...draft.document, note: "belum dikirim" } });
    queue.dispose();
    release();
    await saving;
    expect(savedNotes).toEqual(["sedang disimpan"]);
  });
});
