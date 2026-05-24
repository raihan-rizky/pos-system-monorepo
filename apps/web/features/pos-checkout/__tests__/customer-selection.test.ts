import { describe, expect, it, vi } from "vitest";
import {
  GENERAL_CUSTOMER_NAME,
  resolveCheckoutCustomer,
  type CheckoutCustomerSelection,
} from "../customer-selection";

describe("resolveCheckoutCustomer", () => {
  it("resolves Pelanggan Umum without creating a customer", async () => {
    const createCustomer = vi.fn();

    await expect(
      resolveCheckoutCustomer({ kind: "general" }, createCustomer),
    ).resolves.toEqual({
      customerName: GENERAL_CUSTOMER_NAME,
      customerId: null,
    });
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("resolves an existing customer without creating a duplicate", async () => {
    const createCustomer = vi.fn();

    await expect(
      resolveCheckoutCustomer(
        {
          kind: "existing",
          customer: {
            id: "customer-1",
            name: "PT Maju",
          },
        },
        createCustomer,
      ),
    ).resolves.toEqual({
      customerName: "PT Maju",
      customerId: "customer-1",
    });
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("creates an UMUM customer from manual checkout entry before resolving", async () => {
    const createCustomer = vi.fn().mockResolvedValue({
      id: "customer-new",
      name: "Budi",
    });
    const selection: CheckoutCustomerSelection = {
      kind: "new",
      name: "  Budi  ",
      phone: " 08123456789 ",
    };

    await expect(resolveCheckoutCustomer(selection, createCustomer)).resolves.toEqual({
      customerName: "Budi",
      customerId: "customer-new",
    });
    expect(createCustomer).toHaveBeenCalledWith({
      name: "Budi",
      phone: "08123456789",
      type: "UMUM",
    });
  });

  it("blocks checkout when manual customer name is blank", async () => {
    const createCustomer = vi.fn();

    await expect(
      resolveCheckoutCustomer({ kind: "new", name: "   ", phone: "081" }, createCustomer),
    ).rejects.toThrow("Nama pelanggan wajib diisi");
    expect(createCustomer).not.toHaveBeenCalled();
  });
});
