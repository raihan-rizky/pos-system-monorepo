import { describe, expect, it } from "vitest";

import {
  OWNER_GLOW_QUICK_PROMPTS,
  ROLE_QUICK_PROMPTS,
  getQuickPromptsForRole,
} from "../quick-prompt-catalog";
import { getToolsForRole } from "../../services/assistant-tool-registry";
import type { UserRole } from "../../types/assistant";

const roles = ["OWNER", "ADMIN", "INVENTORY", "CASHIER", "SALES"] as const;

describe("quick prompt catalog", () => {
  it("only assigns prompts to tools available for the same role", () => {
    for (const role of roles) {
      const availableToolNames = getToolsForRole(role).map((tool) => tool.name);
      for (const prompt of ROLE_QUICK_PROMPTS[role]) {
        expect(availableToolNames, `${role}: ${prompt.label}`).toContain(
          prompt.toolName,
        );
      }
    }
  });

  it("keeps the existing glowing owner prompts unchanged and first", () => {
    expect(OWNER_GLOW_QUICK_PROMPTS).toEqual([
      "Rekap finansial bulanan",
      "Rekap pelanggan bulanan",
    ]);
    expect(getQuickPromptsForRole("OWNER").slice(0, 2)).toEqual(
      OWNER_GLOW_QUICK_PROMPTS,
    );
    expect(
      ROLE_QUICK_PROMPTS.OWNER.filter(
        (prompt) => "glow" in prompt && prompt.glow,
      ).map(
        (prompt) => prompt.label,
      ),
    ).toEqual(OWNER_GLOW_QUICK_PROMPTS);
  });

  it("gives every role direct action prompts for its role-specific tools", () => {
    const expectedTools: Record<UserRole, string[]> = {
      OWNER: ["analyzeFinancialReport", "get_supplier_search"],
      ADMIN: ["openProductModal", "openSupplierModal", "openSalespersonModal"],
      INVENTORY: ["openStockUpdateModal", "openInboundReceiptModal"],
      CASHIER: ["openExpenseModal", "openShiftModal"],
      SALES: ["exportCustomerRecap", "openCustomerModal"],
    };

    for (const role of roles) {
      const toolNames = ROLE_QUICK_PROMPTS[role].map((prompt) => prompt.toolName);
      expect(toolNames, role).toEqual(expect.arrayContaining(expectedTools[role]));
    }
  });

  it("falls back to help-only prompts for an unknown role", () => {
    expect(getQuickPromptsForRole("UNKNOWN")).toEqual([
      "Cara menggunakan asisten Pak Teladan",
      "Panduan penggunaan sistem POS",
    ]);
  });
});
