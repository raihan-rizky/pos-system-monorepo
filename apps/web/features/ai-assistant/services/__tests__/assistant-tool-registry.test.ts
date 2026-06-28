import { describe, expect, it } from "vitest";
import { createAssistantToolRegistry } from "../assistant-tool-registry";

describe("tool-design compliance", () => {
  const tools = createAssistantToolRegistry();

  it("all tools have USE triggers in description", () => {
    const missing = tools.filter((t) => !t.description.includes("USE"));
    expect(missing.map((t) => t.name)).toEqual([]);
  });

  it("all tools have scope boundaries (DO NOT USE) in description", () => {
    const missing = tools.filter(
      (t) => !t.description.includes("DO NOT USE") && !t.description.includes("Not for"),
    );
    expect(missing.map((t) => t.name)).toEqual([]);
  });

  it("get_product_stock and get_product_price cross-reference each other", () => {
    const stock = tools.find((t) => t.name === "get_product_stock")!;
    const price = tools.find((t) => t.name === "get_product_price")!;
    expect(stock.description).toContain("get_product_price");
    expect(price.description).toContain("get_product_stock");
  });

  it("all tools expose errorCodes array for agent recovery", () => {
    const missing = tools.filter((t) => !(t as any).errorCodes?.length);
    expect(missing.map((t) => t.name)).toEqual([]);
  });

  it("shapeOutput does not leak extra raw fields", () => {
    const leaking = tools.filter((t) => {
      const raw = { extra: "LEAK", generatedAt: new Date().toISOString() };
      const out = t.shapeOutput(raw) as Record<string, unknown>;
      return "extra" in out;
    });
    expect(leaking.map((t) => t.name)).toEqual([]);
  });
});
