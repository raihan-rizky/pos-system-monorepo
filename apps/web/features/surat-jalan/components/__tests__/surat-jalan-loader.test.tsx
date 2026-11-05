import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  editor: {} as Record<string, any>,
  create: vi.fn(), update: vi.fn(), approve: vi.fn(), invalidate: vi.fn(), setData: vi.fn(),
}));
vi.mock("@pos/ui", () => ({ Modal: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ canPerform: () => true }) }));
vi.mock("@/hooks/useSettings", () => ({ useStoreSettings: () => ({ data: { name: "Toko Contoh" } }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate, setQueryData: state.setData }) }));
vi.mock("../../hooks/useSuratJalan", () => ({ useSuratJalanBundle: () => state.query, suratJalanBundleKey: (id: string) => ["surat-jalan", "bundle", id] }));
vi.mock("../../api/surat-jalan-api", () => ({ createSuratJalan: state.create, updateSuratJalanDocument: state.update, approveSuratJalan: state.approve }));
vi.mock("../SuratJalanReceiptEditor", () => ({ SuratJalanReceiptEditor: (props: any) => { state.editor = props; return <div>Editor struk</div>; } }));
import { SuratJalanCreateModal } from "../SuratJalanCreateModal";

describe("Surat Jalan receipt loading and persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.editor = {};
    state.query = { data: { transaction: { id: "txn" }, suratJalan: [] }, isPending: false, error: null };
  });
  const render = () => renderToStaticMarkup(<SuratJalanCreateModal open transactionId="txn" initialRecordId="sj" onClose={() => {}} />);
  it("opens the selected receipt without creating a shipment", () => {
    expect(render()).toContain("Editor struk");
    expect(state.editor.initialRecordId).toBe("sj");
    expect(state.create).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });
  it("keeps the mounted editor when a background refresh fails", () => {
    state.query.error = new Error("Jaringan terputus");
    expect(render()).toContain("Editor struk");
  });
  it("provides retry when initial loading fails", () => {
    state.query = { data: undefined, isPending: false, error: new Error("Jaringan terputus") };
    expect(render()).toContain("Coba lagi");
  });
  it("submits the version captured by the editor and returns canonical data", async () => {
    render(); const canonical = { id: "sj", number: "SJ-001", updatedAt: "next" };
    state.update.mockResolvedValue(canonical);
    const changes = { recipientName: "Penerima", quantities: { line: 2 }, documentNames: { line: "Nama" }, keterangan: { line: "" } };
    expect(await state.editor.onSave({ id: "sj", updatedAt: "captured" }, changes)).toBe(canonical);
    expect(state.update).toHaveBeenCalledWith("sj", { ...changes, expectedUpdatedAt: "captured" });
    expect(state.create).not.toHaveBeenCalled();
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["surat-jalans"] });
  });
  it("refuses a saved document without a version", async () => {
    render(); await expect(state.editor.onSave({ id: "sj" }, {})).rejects.toThrow("Versi dokumen");
    expect(state.update).not.toHaveBeenCalled();
  });
});
