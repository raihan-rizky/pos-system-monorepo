"use client";

import { useEffect, useRef } from "react";
import {
  ASSISTANT_OPEN_MODAL_EVENT,
  consumePendingAssistantModalAction,
} from "../helpers/assistant-client-actions";
import type { AssistantModalId } from "../types/assistant";

export function useAssistantModalAction(
  modal: AssistantModalId,
  onOpen: () => void,
) {
  const onOpenRef = useRef(onOpen);

  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ modal?: AssistantModalId }>).detail;
      if (detail?.modal === modal) onOpenRef.current();
    };
    window.addEventListener(ASSISTANT_OPEN_MODAL_EVENT, handleOpen);

    let pending: ReturnType<typeof consumePendingAssistantModalAction> = null;
    try {
      pending = consumePendingAssistantModalAction({
        route: window.location.pathname,
        modal,
        storage: window.sessionStorage,
      });
    } catch {
      pending = null;
    }
    const timeout = pending
      ? window.setTimeout(() => onOpenRef.current(), 0)
      : null;

    return () => {
      window.removeEventListener(ASSISTANT_OPEN_MODAL_EVENT, handleOpen);
      if (timeout !== null) window.clearTimeout(timeout);
    };
  }, [modal]);
}
