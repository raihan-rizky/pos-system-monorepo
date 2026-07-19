import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  INITIAL_PROOF_UPLOAD_STATE,
  ProofImageUploader,
  PendingProofPreview,
  deleteUploadedProof,
  rotateProof,
  proofUploadReducer,
} from "../ProofImageUploader";
import { RoleProvider } from "@/components/providers/RoleProvider";

describe("ProofImageUploader", () => {
  it("cycles preview rotation in 90-degree steps", () => {
    expect(rotateProof(0, "clockwise")).toBe(90);
    expect(rotateProof(270, "clockwise")).toBe(0);
    expect(rotateProof(0, "counterclockwise")).toBe(270);
  });

  it("renders rotate controls and an explicit upload action for a selected image", () => {
    const html = renderToStaticMarkup(
      <PendingProofPreview
        previewUrl="blob:proof"
        rotation={90}
        disabled={false}
        onRotate={vi.fn()}
        onUpload={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(html).toContain("Putar kiri");
    expect(html).toContain("Putar kanan");
    expect(html).toContain("Unggah foto");
    expect(html).toContain("rotate(90deg)");
  });

  it("keeps a quarter-turn preview within both axes of its viewport", () => {
    const html = renderToStaticMarkup(
      <PendingProofPreview
        previewUrl="blob:portrait-proof"
        rotation={90}
        disabled={false}
        onRotate={vi.fn()}
        onUpload={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(html).toContain("[container-type:inline-size]");
    expect(html).toContain("max-h-[min(100%,100cqw)]");
    expect(html).toContain("max-w-[min(100%,16rem)]");
  });

  it("starts with the R2 file picker and keeps prnt.sc fallback hidden", () => {
    const html = renderToStaticMarkup(
      <ProofImageUploader
        context="expense"
        label="Bukti pengeluaran"
        value=""
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain('type="file"');
    expect(html).toContain("Pilih gambar bukti");
    expect(html).not.toContain("Gunakan prnt.sc sebagai fallback");
  });

  it("does not reveal fallback for validation or permission errors", () => {
    const validationFailure = proofUploadReducer(INITIAL_PROOF_UPLOAD_STATE, {
      type: "failed",
      status: 415,
      message: "Format tidak didukung",
    });
    const permissionFailure = proofUploadReducer(INITIAL_PROOF_UPLOAD_STATE, {
      type: "failed",
      status: 403,
      message: "Tidak memiliki izin",
    });

    expect(validationFailure.fallbackVisible).toBe(false);
    expect(permissionFailure.fallbackVisible).toBe(false);
  });

  it("reveals fallback for R2 failures and hides it after a successful retry", () => {
    const failed = proofUploadReducer(INITIAL_PROOF_UPLOAD_STATE, {
      type: "failed",
      status: 503,
      message: "R2 tidak tersedia",
    });
    expect(failed.fallbackVisible).toBe(true);

    const recovered = proofUploadReducer(failed, {
      type: "succeeded",
    });
    expect(recovered.fallbackVisible).toBe(false);
    expect(recovered.error).toBeNull();
  });

  it("reveals fallback when the upload request cannot reach the server", () => {
    const failed = proofUploadReducer(INITIAL_PROOF_UPLOAD_STATE, {
      type: "failed",
      status: null,
      message: "Jaringan bermasalah",
    });

    expect(failed.fallbackVisible).toBe(true);
  });

  it("reveals fallback when preprocessing fails after valid file selection", () => {
    const failed = proofUploadReducer(INITIAL_PROOF_UPLOAD_STATE, {
      type: "failed",
      status: 422,
      code: "PROOF_PREPROCESSING_FAILED",
      message: "Gambar tidak dapat diproses",
    });

    expect(failed.fallbackVisible).toBe(true);
  });

  it("shows deletion to OWNER when a proof is present", () => {
    const html = renderToStaticMarkup(
      <RoleProvider role="OWNER" userId="owner-1" userName="Owner">
        <ProofImageUploader
          context="expense"
          label="Bukti pengeluaran"
          value="https://pub-example.r2.dev/proofs/expenses/a.webp"
          onChange={vi.fn()}
        />
      </RoleProvider>,
    );

    expect(html).toContain("Hapus foto");
  });

  it("clears prnt.sc locally but calls the protected endpoint for R2", async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: {} }),
    });

    await deleteUploadedProof("https://prnt.sc/abc123", request);
    expect(request).not.toHaveBeenCalled();

    await deleteUploadedProof(
      "https://pub-example.r2.dev/proofs/expenses/a.webp",
      request,
    );
    expect(request).toHaveBeenCalledWith(
      "/api/proof-uploads",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
