const CUSTOMER_RECEIVABLES_EXPANDED_STORAGE_KEY =
  "pos:customers:manual-receivables:expanded";

export function loadCustomerReceivablesExpanded(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    return window.localStorage.getItem(CUSTOMER_RECEIVABLES_EXPANDED_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function saveCustomerReceivablesExpanded(expanded: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      CUSTOMER_RECEIVABLES_EXPANDED_STORAGE_KEY,
      String(expanded),
    );
  } catch {
    // Keep the section usable when browser storage is unavailable.
  }
}
