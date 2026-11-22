import { describe, expect, it, vi } from "vitest";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";
import { getToolsForRole, type AssistantToolsRepository } from "../assistant-tool-registry";

const customer = { id: "c1", name: "Budi", phone: "private-phone", company: "Private company", totalDebt: 75000, totalSpent: 250000, totalOrders: 2 };
function repository() {
  return {
    getCustomerSearch: vi.fn().mockResolvedValue({ items: [customer], total: 1 }),
    getCustomerRecapSummary: vi.fn().mockResolvedValue({ match: { ...customer, debtPaid: 25000, revenue: 125000 }, candidates: [] }),
    getCustomerDebtSummary: vi.fn().mockResolvedValue({ match: customer, candidates: [] }),
  } as unknown as AssistantToolsRepository;
}

describe("assistant customer receivable permissions", () => {
  it("removes debt tools while retaining permitted customer search", () => {
    const permissions = buildDefaultRolePermissions();
    permissions.SALES.resources["customer.receivable"].read = false;
    const names = getToolsForRole("SALES", repository(), permissions).map((tool) => tool.name);
    expect(names).not.toContain("get_customer_debt_summary");
    expect(names).toContain("get_customer_search");
  });

  it.each(["get_customer_search", "get_customer_recap_summary"])("redacts debt from %s results", async (name) => {
    const permissions = buildDefaultRolePermissions();
    permissions.SALES.resources["customer.receivable"].read = false;
    const repo = repository();
    const tool = getToolsForRole("SALES", repo, permissions).find((candidate) => candidate.name === name)!;
    const raw = await tool.execute({ query: "Budi", limit: 10 }, { storeId: "store-1", repository: repo, now: new Date() });
    const output = tool.outputSchema.parse(tool.shapeOutput(raw));
    expect(JSON.stringify(output)).not.toContain("totalDebt");
    expect(JSON.stringify(output)).not.toContain("debtPaid");
    expect(JSON.stringify(output)).toContain("Budi");
    if (name === "get_customer_search") {
      expect(repo.getCustomerSearch).toHaveBeenCalledWith(expect.objectContaining({ canViewReceivables: false }));
    } else {
      expect(repo.getCustomerRecapSummary).toHaveBeenCalledWith(expect.objectContaining({ canViewReceivables: false }));
    }
  });

  it("shows only necessary debt fields to a receivable-only role", async () => {
    const permissions = buildDefaultRolePermissions();
    permissions.SALES.resources.customer.read = false;
    const repo = repository();
    const tool = getToolsForRole("SALES", repo, permissions).find((candidate) => candidate.name === "get_customer_debt_summary");
    expect(tool).toBeDefined();
    if (!tool) return;
    const raw = await tool.execute({ query: "Budi" }, { storeId: "store-1", repository: repo, now: new Date() });
    const output = tool.outputSchema.parse(tool.shapeOutput(raw)) as { match: Record<string, unknown> };
    expect(repo.getCustomerDebtSummary).toHaveBeenCalledWith(expect.objectContaining({ canViewReceivables: true }));
    expect(output.match).toMatchObject({ id: "c1", name: "Budi", totalDebt: 75000 });
    expect(output.match).not.toHaveProperty("phone");
    expect(output.match).not.toHaveProperty("company");
    expect(output.match).not.toHaveProperty("totalSpent");
  });
});
