import { useReducer, useMemo, useCallback } from "react";
import type { Product } from "@/hooks/useProducts";

export interface SelectionState {
  selectedProducts: Product[];
}

export type SelectionAction =
  | { type: "TOGGLE"; id: string; visibleProducts: Product[] }
  | { type: "DESELECT"; id: string }
  | { type: "CLEAR" };

export function selectionReducer(
  state: SelectionState,
  action: SelectionAction
): SelectionState {
  switch (action.type) {
    case "TOGGLE": {
      const exists = state.selectedProducts.some((p) => p.id === action.id);
      if (exists) {
        return {
          selectedProducts: state.selectedProducts.filter((p) => p.id !== action.id),
        };
      } else {
        const found = action.visibleProducts.find((p) => p.id === action.id);
        if (found) {
          return {
            selectedProducts: [...state.selectedProducts, found],
          };
        }
        return state;
      }
    }
    case "DESELECT": {
      return {
        selectedProducts: state.selectedProducts.filter((p) => p.id !== action.id),
      };
    }
    case "CLEAR": {
      return {
        selectedProducts: [],
      };
    }
    default:
      return state;
  }
}

export function useProductSelection(visibleProducts: Product[]) {
  const [state, dispatch] = useReducer(selectionReducer, { selectedProducts: [] });

  const selectedProductIds = useMemo(
    () => new Set(state.selectedProducts.map((p) => p.id)),
    [state.selectedProducts]
  );

  const toggleSelectedProduct = useCallback(
    (id: string) => {
      dispatch({ type: "TOGGLE", id, visibleProducts });
    },
    [visibleProducts]
  );

  const deselectProduct = useCallback((id: string) => {
    dispatch({ type: "DESELECT", id });
  }, []);

  const clearSelection = useCallback(() => {
    dispatch({ type: "CLEAR" });
  }, []);

  return {
    selectedProducts: state.selectedProducts,
    selectedProductIds,
    toggleSelectedProduct,
    deselectProduct,
    clearSelection,
  };
}
