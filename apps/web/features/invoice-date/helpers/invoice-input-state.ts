import { toJakartaInputParts } from "./server-clock";

export type InvoiceInputState = {
  date: string;
  time: string;
  synchronized: boolean;
  dateEdited: boolean;
  timeEdited: boolean;
};

type InvoiceInputAction =
  | { type: "date" | "time"; value: string }
  | { type: "sync"; now: Date }
  | { type: "reset"; now: Date | null };

export function createInvoiceInputState(now: Date | null): InvoiceInputState {
  return {
    ...toJakartaInputParts(now ?? new Date()),
    synchronized: now !== null,
    dateEdited: false,
    timeEdited: false,
  };
}

export function invoiceInputReducer(state: InvoiceInputState, action: InvoiceInputAction): InvoiceInputState {
  switch (action.type) {
    case "date": return { ...state, date: action.value, dateEdited: true };
    case "time": return { ...state, time: action.value, timeEdited: true };
    case "reset": return { ...createInvoiceInputState(action.now), synchronized: false };
    case "sync": {
      if (state.synchronized) return state;
      const parts = toJakartaInputParts(action.now);
      return {
        ...state,
        date: state.dateEdited ? state.date : parts.date,
        time: state.timeEdited ? state.time : parts.time,
        synchronized: true,
      };
    }
  }
}
