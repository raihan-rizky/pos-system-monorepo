import { describe, it, expect } from "vitest";
import {
  buildInventoryLogRows,
  buildCustomerUpdateArgs,
} from "../post-commit";

describe("buildInventoryLogRows", () => {
  const baseItems = [
    {
      productId: "p1",
      name: "Item 1",
      size: null,
      material: null,
      price: 1000,
      costPrice: null,
      quantity: 2,
    },
    {
      productId: "p2",
      name: "Item 2",
      size: "A4",
      material: "HVS",
      price: 2500,
      costPrice: 1500,
      quantity: 1,
    },
  ];

  it("creates one OUT log per cart item with the invoice in the note", () => {
    const rows = buildInventoryLogRows({
      items: baseItems,
      invoiceNumber: "INV-20260519-0001",
      userId: "user-1",
      userName: "Alice",
    });

    expect(rows).toEqual([
      {
        productId: "p1",
        type: "OUT",
        quantity: 2,
        note: "Penjualan INV-20260519-0001",
        createdBy: "user-1",
        person: "Alice",
      },
      {
        productId: "p2",
        type: "OUT",
        quantity: 1,
        note: "Penjualan INV-20260519-0001",
        createdBy: "user-1",
        person: "Alice",
      },
    ]);
  });

  it("falls back to null person when the user has no name", () => {
    const rows = buildInventoryLogRows({
      items: baseItems.slice(0, 1),
      invoiceNumber: "INV-X",
      userId: "user-2",
      userName: null,
    });

    expect(rows[0].person).toBeNull();
  });

  it("returns an empty array when there are no items", () => {
    expect(
      buildInventoryLogRows({
        items: [],
        invoiceNumber: "INV-X",
        userId: "u",
        userName: "x",
      }),
    ).toEqual([]);
  });
});

describe("buildCustomerUpdateArgs", () => {
  it("returns null when no customer is attached", () => {
    expect(
      buildCustomerUpdateArgs({
        customerId: null,
        isDP: false,
        total: 100,
        amountPaid: 100,
      }),
    ).toBeNull();
  });

  it("returns null when customerId is an empty string", () => {
    expect(
      buildCustomerUpdateArgs({
        customerId: "",
        isDP: false,
        total: 100,
        amountPaid: 100,
      }),
    ).toBeNull();
  });

  it("increments totalSpent by amountPaid and totalOrders by 1 for a paid sale", () => {
    const args = buildCustomerUpdateArgs({
      customerId: "c1",
      isDP: false,
      total: 50000,
      amountPaid: 50000,
    });

    expect(args).not.toBeNull();
    expect(args!.where).toEqual({ id: "c1" });
    expect(args!.data.totalSpent).toEqual({ increment: 50000 });
    expect(args!.data.totalOrders).toEqual({ increment: 1 });
    expect(args!.data.totalDebt).toBeUndefined();
    expect(args!.data.lastVisitAt).toBeInstanceOf(Date);
  });

  it("increments totalDebt by remaining balance for a DP sale", () => {
    const args = buildCustomerUpdateArgs({
      customerId: "c1",
      isDP: true,
      total: 100000,
      amountPaid: 30000,
    });

    expect(args!.data.totalSpent).toEqual({ increment: 30000 });
    expect(args!.data.totalDebt).toEqual({ increment: 70000 });
  });

  it("omits totalDebt when DP fully covers the total", () => {
    const args = buildCustomerUpdateArgs({
      customerId: "c1",
      isDP: true,
      total: 100000,
      amountPaid: 100000,
    });

    expect(args!.data.totalDebt).toBeUndefined();
  });
});
