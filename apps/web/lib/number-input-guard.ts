type NumberInputGuardEventTarget = {
  addEventListener(
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions | boolean,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListener,
    options?: EventListenerOptions | boolean,
  ): void;
};

function getNumberInput(target: EventTarget | null): HTMLInputElement | null {
  if (!target || typeof target !== "object") return null;

  const input = target as Partial<HTMLInputElement>;
  if (
    input.tagName !== "INPUT" ||
    input.type !== "number" ||
    typeof input.blur !== "function"
  ) {
    return null;
  }

  return input as HTMLInputElement;
}

export function installNumberInputGuards(
  eventTarget: NumberInputGuardEventTarget,
) {
  const handleWheel: EventListener = (event) => {
    getNumberInput(event.target)?.blur();
  };

  const handleKeyDown: EventListener = (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (
      getNumberInput(event.target) &&
      (keyboardEvent.key === "ArrowUp" || keyboardEvent.key === "ArrowDown")
    ) {
      event.preventDefault();
    }
  };

  eventTarget.addEventListener("wheel", handleWheel, {
    capture: true,
    passive: true,
  });
  eventTarget.addEventListener("keydown", handleKeyDown, true);

  return () => {
    eventTarget.removeEventListener("wheel", handleWheel, true);
    eventTarget.removeEventListener("keydown", handleKeyDown, true);
  };
}
