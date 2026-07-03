import { describe, expect, it } from "vitest";
import { selectionReducer, SelectionState } from "../hooks/useProductSelection";
import type { Product } from "@/hooks/useProducts";

const mockProducts: Product[] = [
  {
    id: "prod-1",
    name: "Product 1",
    sku: "SKU1",
    price: 100,
    costPrice: 80,
    hargaDinas: null,
    hargaAgen: null,
    stock: 10,
    minStock: 2,
    unit: "pcs",
    size: null,
    material: null,
    imageUrl: null,
    isActive: true,
    category: { id: "cat-1", name: "Category 1", icon: null, color: null },
  },
  {
    id: "prod-2",
    name: "Product 2",
    sku: "SKU2",
    price: 200,
    costPrice: 150,
    hargaDinas: null,
    hargaAgen: null,
    stock: 5,
    minStock: 1,
    unit: "pcs",
    size: null,
    material: null,
    imageUrl: null,
    isActive: true,
    category: { id: "cat-1", name: "Category 1", icon: null, color: null },
  },
];

describe("product selection reducer", () => {
  it("starts with empty selected products", () => {
    const initialState: SelectionState = { selectedProducts: [] };
    expect(initialState.selectedProducts).toEqual([]);
  });

  it("adds a product when toggled on", () => {
    const state: SelectionState = { selectedProducts: [] };
    const nextState = selectionReducer(state, {
      type: "TOGGLE",
      id: "prod-1",
      visibleProducts: mockProducts,
    });
    expect(nextState.selectedProducts).toEqual([mockProducts[0]]);
  });

  it("removes a product when toggled off", () => {
    const state: SelectionState = { selectedProducts: [mockProducts[0]] };
    const nextState = selectionReducer(state, {
      type: "TOGGLE",
      id: "prod-1",
      visibleProducts: mockProducts,
    });
    expect(nextState.selectedProducts).toEqual([]);
  });

  it("preserves selection when visible products list changes", () => {
    // 1. Initial state with prod-1 selected
    const state: SelectionState = { selectedProducts: [mockProducts[0]] };
    // 2. Visible products changed (search returns only prod-2)
    const visibleProducts = [mockProducts[1]];
    // 3. Toggle prod-2 on
    const state2 = selectionReducer(state, {
      type: "TOGGLE",
      id: "prod-2",
      visibleProducts,
    });
    expect(state2.selectedProducts).toEqual([mockProducts[0], mockProducts[1]]);

    // 4. Toggle prod-1 off while it's NOT in visibleProducts
    const state3 = selectionReducer(state2, {
      type: "TOGGLE",
      id: "prod-1",
      visibleProducts,
    });
    expect(state3.selectedProducts).toEqual([mockProducts[1]]);
  });

  it("clears selection", () => {
    const state: SelectionState = { selectedProducts: mockProducts };
    const nextState = selectionReducer(state, { type: "CLEAR" });
    expect(nextState.selectedProducts).toEqual([]);
  });

  it("deselects a single product by id", () => {
    const state: SelectionState = { selectedProducts: mockProducts };
    const nextState = selectionReducer(state, { type: "DESELECT", id: "prod-1" });
    expect(nextState.selectedProducts).toEqual([mockProducts[1]]);
  });
});
