import { existsSync } from "node:fs";
import { expect, it } from "vitest";

import { FAQ_WORKFLOWS } from "../../ai-assistant/workflows/workflow-catalog";
import { CHANGELOG } from "../../changelog/data/changelog";

it("guides users through split payments and their daily report", () => {
  const workflow = FAQ_WORKFLOWS.find((item) => item.faqNumber === 48);
  const instructions = workflow?.steps.map((step) => step.description).join(" ") ?? "";

  expect(instructions).toContain("beberapa metode pembayaran");
  expect(instructions).toContain("laporan pemasukan harian");
});

it("announces the split-payment flow with a safe screenshot and three steps", () => {
  const entry = CHANGELOG.find((item) => item.id === "manual-income-split-payments");

  expect(entry).toMatchObject({ date: "2026-11-11", href: "/keuangan" });
  expect(entry?.steps).toHaveLength(3);
  expect(entry?.screenshot?.src).toBe("/images/changelog/metode-pembayaran-pemasukan-2026-11-10.png");
  expect(existsSync(new URL("../../../public/images/changelog/metode-pembayaran-pemasukan-2026-11-10.png", import.meta.url))).toBe(true);
});
