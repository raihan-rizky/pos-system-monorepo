import { describe, expect, it, vi } from "vitest";
import {
  consumePendingAssistantModalAction,
  executeAssistantClientAction,
} from "../assistant-client-actions";
import type { AssistantClientAction } from "../../types/assistant";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("assistant client actions", () => {
  it("opens a modal immediately when the user is already on its route", async () => {
    const dispatchModal = vi.fn();
    const navigate = vi.fn();
    const action: AssistantClientAction = {
      kind: "open_modal",
      modal: "product-create",
      route: "/products",
    };

    await executeAssistantClientAction(action, {
      currentPath: "/products",
      dispatchModal,
      navigate,
      storage: memoryStorage(),
      exportFinancialReport: vi.fn(),
      exportCustomerRecap: vi.fn(),
    });

    expect(dispatchModal).toHaveBeenCalledWith("product-create");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("queues a modal action before navigating to another page", async () => {
    const storage = memoryStorage();
    const navigate = vi.fn();
    const action: AssistantClientAction = {
      kind: "open_modal",
      modal: "customer-create",
      route: "/customers",
    };

    await executeAssistantClientAction(action, {
      currentPath: "/dashboard",
      dispatchModal: vi.fn(),
      navigate,
      storage,
      exportFinancialReport: vi.fn(),
      exportCustomerRecap: vi.fn(),
    });

    expect(navigate).toHaveBeenCalledWith("/customers");
    expect(consumePendingAssistantModalAction({
      route: "/customers",
      modal: "customer-create",
      storage,
    })).toEqual(action);
    expect(consumePendingAssistantModalAction({
      route: "/customers",
      modal: "customer-create",
      storage,
    })).toBeNull();
  });

  it("reuses the financial report exporter selected by the assistant tool", async () => {
    const exportFinancialReport = vi.fn();

    await executeAssistantClientAction(
      { kind: "export_financial_report", period: "30d", format: "pdf" },
      {
        currentPath: "/dashboard",
        dispatchModal: vi.fn(),
        navigate: vi.fn(),
        storage: memoryStorage(),
        exportFinancialReport,
        exportCustomerRecap: vi.fn(),
      },
    );

    expect(exportFinancialReport).toHaveBeenCalledWith("30d", "pdf");
  });

  it("reuses the customer recap exporter selected by the assistant tool", async () => {
    const exportCustomerRecap = vi.fn();

    await executeAssistantClientAction(
      { kind: "export_customer_recap", period: "30d", format: "pdf" },
      {
        currentPath: "/dashboard",
        dispatchModal: vi.fn(),
        navigate: vi.fn(),
        storage: memoryStorage(),
        exportFinancialReport: vi.fn(),
        exportCustomerRecap,
      },
    );

    expect(exportCustomerRecap).toHaveBeenCalledWith("30d", "pdf");
  });
});
