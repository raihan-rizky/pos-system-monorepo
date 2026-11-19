import { afterEach, expect, it, vi } from "vitest";
import { getCorrectionEditor } from "../shopping-request-correction-api";

afterEach(() => vi.unstubAllGlobals());

it("mempertahankan status konflik agar pengguna dapat memuat ulang data koreksi", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: false, status: 409, json: async () => ({ message: "Data berubah. Muat ulang." }),
  }));
  await expect(getCorrectionEditor("r1")).rejects.toMatchObject({ message: "Data berubah. Muat ulang.", status: 409 });
});
