import type { QueryClient } from "@tanstack/react-query";

// Prefix invalidation covers siblings, old/target groups, all history pages,
// POS and inventory observers after any writer cascades group prices.
export function invalidatePricingQueries(client: QueryClient) {
  return Promise.all(["products", "product-stats", "stock-group", "inventory-management", "product-price-logs", "categories", "dashboard"]
    .map(key => client.invalidateQueries({ queryKey: [key] })));
}
