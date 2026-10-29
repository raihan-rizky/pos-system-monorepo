import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HELP_ROLE_CONTENT } from "../components/HelpContent";
import { matchAssistantWorkflow } from "@/features/ai-assistant/workflows/assistant-workflow-matcher";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";
import { CHANGELOG } from "@/features/changelog/data/changelog";
import { runGroupPricingBackfill } from "../../../scripts/backfill-group-pricing";
import { initializeGroupPricing, type GroupPricingInput } from "@/features/product-stock-groups/automatic-pricing";

describe("automatic group pricing guidance", () => {
  it.each(["ubah harga produk", "ganti harga jual"])("routes primary request %s through the actual separate pricing action", message => {
    const result = matchAssistantWorkflow({ message, role: "OWNER", permissions: buildDefaultRolePermissions() });
    expect(result.kind).toBe("matched");
    if (result.kind !== "matched") throw new Error("Panduan harga tidak ditemukan");
    expect(result.workflow.id).toBe("faq-q02-change-product-price");
    const text = result.workflow.steps.map(step => step.description).join(" ");
    for (const phrase of ["Atur harga grup / Manual", "Sumber harga", "Auto", "Pratinjau harga", "Terapkan harga grup", "Harga Agen", "Harga Dinas", "Harga Khusus", "transaksi ini"]) expect(text).toContain(phrase);
  });
  it.each(["OWNER", "ADMIN", "INVENTORY"])("gives %s an actionable source, adjustment and review flow", role => {
    const guide = HELP_ROLE_CONTENT[role].find(entry => entry.id.endsWith("-stock-group"))!;
    const text = guide.steps.map(step => `${step.title} ${step.description}`).join(" ");
    for (const phrase of ["Sumber harga", "Auto", "Manual", "diskon", "markup", "Pratinjau harga", "Terapkan harga grup", "Perlu ditinjau", "120 pcs", "24.000", "37.800", "tidak mengurangi HPP", "muat ulang"]) expect(text).toContain(phrase);
    expect(text).not.toMatch(/simpan harga per satuan/i);
  });

  it.each(["harga otomatis grup", "diskon harga pak", "sumber harga satuan"])("routes %s to the implemented guided flow", message => {
    const result = matchAssistantWorkflow({ message, role: "OWNER", permissions: buildDefaultRolePermissions() });
    expect(result.kind).toBe("matched");
    if (result.kind !== "matched") throw new Error("Panduan harga tidak ditemukan");
    expect(result.workflow.route).toBe("/products");
    const text = result.workflow.steps.map(step => step.description).join(" ");
    for (const phrase of ["Sumber harga", "Auto", "Manual", "Pratinjau harga", "Terapkan harga grup", "Perlu ditinjau"]) expect(text).toContain(phrase);
  });

  it("links the release to a real sample screenshot and three executable steps", () => {
    const entry = CHANGELOG.find(change => change.id === "automatic-group-unit-pricing")!;
    expect(entry).toBeDefined();
    expect(entry.href).toBe("/products");
    expect(entry.steps).toHaveLength(3);
    expect(entry.highlight.title.length).toBeLessThanOrEqual(40);
    expect(entry.highlight.summary.length).toBeLessThanOrEqual(85);
    expect(readFileSync(new URL(`../../../public${entry.screenshot!.src}`, import.meta.url)).length).toBeGreaterThan(0);
  });

  it("runs the documented offline sample without writes and initializes idempotently through an adapter", async () => {
    const sample: GroupPricingInput[] = JSON.parse(readFileSync(new URL("../../../scripts/fixtures/group-pricing-sample.json", import.meta.url), "utf8"));
    async function* groups() { yield* structuredClone(sample); }
    let writes = 0;
    const preview = await runGroupPricingBackfill({ groups: groups(), applyGroup: async () => { writes++; throw new Error("Preview must not write"); } });
    expect(writes).toBe(0);
    expect(preview).toMatchObject({ scanned: 1, pending: 1, initialized: 0, skipped: 0 });
    expect(preview.groups[0].projection.config.members["sample-pak"].mode).toBe("MANUAL");
    expect(preview.groups[0].projection.config.members["sample-pak"].factor).toBeNull();
    expect(preview.groups[0].costChanges).toEqual([]);
    const stored = structuredClone(sample[0]);
    const applyGroup = async () => {
      writes++;
      const result = initializeGroupPricing(stored);
      stored.config = result.config;
      return result;
    };
    const apply = await runGroupPricingBackfill({ groups: groups(), apply: true, applyGroup });
    expect(apply).toMatchObject({ initialized: 1, skipped: 0 });
    async function* saved() { yield stored; }
    const rerun = await runGroupPricingBackfill({ groups: saved(), apply: true, applyGroup });
    expect(rerun).toMatchObject({ scanned: 1, initialized: 0, pending: 0, skipped: 1 });
    expect(writes).toBe(1);
  });
});
