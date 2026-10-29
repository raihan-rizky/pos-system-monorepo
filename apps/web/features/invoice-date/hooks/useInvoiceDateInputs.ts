"use client";

import { useEffect, useReducer, useRef } from "react";
import { createInvoiceInputState, invoiceInputReducer } from "../helpers/invoice-input-state";

export function useInvoiceDateInputs(
  open: boolean,
  now: Date | null,
  isLoading = false,
  { preserveOnReopen = false }: { preserveOnReopen?: boolean } = {},
) {
  const [state, dispatch] = useReducer(invoiceInputReducer, isLoading ? null : now, createInvoiceInputState);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (open && !wasOpen.current && !preserveOnReopen) dispatch({ type: "reset", now });
    else if (open && now && !isLoading) dispatch({ type: "sync", now });
    wasOpen.current = open;
  }, [open, now, isLoading, preserveOnReopen]);

  return {
    invoiceDate: state.date,
    invoiceTime: state.time,
    setInvoiceDate: (value: string) => dispatch({ type: "date", value }),
    setInvoiceTime: (value: string) => dispatch({ type: "time", value }),
  };
}
