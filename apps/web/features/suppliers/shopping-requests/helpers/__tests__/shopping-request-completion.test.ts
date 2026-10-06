import { expect, it, vi } from "vitest";
import { finishShoppingRequest } from "../shopping-request-completion";

it("closes only after success and leaves the popup open after failure", async () => {
  const close = vi.fn();

  await expect(
    finishShoppingRequest(async () => {
      throw new Error("gagal");
    }, close),
  ).rejects.toThrow("gagal");
  expect(close).not.toHaveBeenCalled();

  await finishShoppingRequest(async () => ({ ok: true }), close);
  expect(close).toHaveBeenCalledTimes(1);
});
