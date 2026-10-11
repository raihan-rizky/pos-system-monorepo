const CUSTOMER_RECAP_EXPANDED_KEY = "customer-recap-expanded";

export function loadCustomerRecapExpanded(): boolean {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(CUSTOMER_RECAP_EXPANDED_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveCustomerRecapExpanded(expanded: boolean): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(CUSTOMER_RECAP_EXPANDED_KEY, String(expanded));
  } catch {
    // Keep the recap usable when browser storage is unavailable.
  }
}
