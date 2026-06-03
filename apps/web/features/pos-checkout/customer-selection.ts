import type { CreateCustomerInput } from "@/hooks/useCustomers";

export const GENERAL_CUSTOMER_NAME = "Pelanggan Umum";

export type CheckoutCustomerSelection =
  | { kind: "general" }
  | {
      kind: "existing";
      customer: {
        id: string;
        name: string;
        type?: "UMUM" | "AGEN" | "INDUSTRI" | "PEMERINTAH";
      };
    }
  | {
      kind: "new";
      name: string;
      phone?: string;
    };

export interface ResolvedCheckoutCustomer {
  customerName: string;
  customerId: string | null;
  customerType: "UMUM" | "AGEN" | "INDUSTRI" | "PEMERINTAH";
}

type CreateCustomerForCheckout = (
  input: CreateCustomerInput,
) => Promise<{ id: string; name: string }>;

export async function resolveCheckoutCustomer(
  selection: CheckoutCustomerSelection,
  createCustomer: CreateCustomerForCheckout,
): Promise<ResolvedCheckoutCustomer> {
  if (selection.kind === "general") {
    return {
      customerName: GENERAL_CUSTOMER_NAME,
      customerId: null,
      customerType: "UMUM",
    };
  }

  if (selection.kind === "existing") {
    return {
      customerName: selection.customer.name,
      customerId: selection.customer.id,
      customerType: selection.customer.type ?? "UMUM",
    };
  }

  const name = selection.name.trim();
  if (!name) {
    throw new Error("Nama pelanggan wajib diisi");
  }

  const phone = selection.phone?.trim();
  const customer = await createCustomer({
    name,
    phone: phone || undefined,
    type: "UMUM",
  });

  return {
    customerName: customer.name,
    customerId: customer.id,
    customerType: "UMUM",
  };
}
