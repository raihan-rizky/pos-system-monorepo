import { describe, expect, it, vi } from "vitest";
import { installNumberInputGuards } from "../number-input-guard";

type RegisteredListener = EventListenerOrEventListenerObject;

function createDocumentHarness() {
  const listeners = new Map<string, RegisteredListener>();

  const documentTarget = {
    addEventListener: vi.fn(
      (type: string, listener: RegisteredListener) => {
        listeners.set(type, listener);
      },
    ),
    removeEventListener: vi.fn(),
  };

  const dispatch = (type: string, event: Event) => {
    const listener = listeners.get(type);
    if (typeof listener === "function") {
      listener(event);
      return;
    }

    listener?.handleEvent(event);
  };

  return { documentTarget, dispatch };
}

function createInputTarget(type: string) {
  return {
    tagName: "INPUT",
    type,
    blur: vi.fn(),
  };
}

describe("installNumberInputGuards", () => {
  it("blurs a number input on wheel without blocking page scrolling", () => {
    const { documentTarget, dispatch } = createDocumentHarness();
    const input = createInputTarget("number");
    const preventDefault = vi.fn();

    installNumberInputGuards(documentTarget);
    dispatch("wheel", { target: input, preventDefault } as unknown as WheelEvent);

    expect(input.blur).toHaveBeenCalledOnce();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it.each(["ArrowUp", "ArrowDown"])(
    "blocks %s from stepping a focused number input",
    (key) => {
      const { documentTarget, dispatch } = createDocumentHarness();
      const preventDefault = vi.fn();

      installNumberInputGuards(documentTarget);
      dispatch(
        "keydown",
        {
          target: createInputTarget("number"),
          key,
          preventDefault,
        } as unknown as KeyboardEvent,
      );

      expect(preventDefault).toHaveBeenCalledOnce();
    },
  );

  it("leaves normal typing and non-number inputs unchanged", () => {
    const { documentTarget, dispatch } = createDocumentHarness();
    const numberInput = createInputTarget("number");
    const textInput = createInputTarget("text");
    const numberPreventDefault = vi.fn();
    const textPreventDefault = vi.fn();

    installNumberInputGuards(documentTarget);
    dispatch(
      "keydown",
      {
        target: numberInput,
        key: "5",
        preventDefault: numberPreventDefault,
      } as unknown as KeyboardEvent,
    );
    dispatch(
      "keydown",
      {
        target: textInput,
        key: "ArrowUp",
        preventDefault: textPreventDefault,
      } as unknown as KeyboardEvent,
    );
    dispatch(
      "wheel",
      { target: textInput, preventDefault: vi.fn() } as unknown as WheelEvent,
    );

    expect(numberPreventDefault).not.toHaveBeenCalled();
    expect(textPreventDefault).not.toHaveBeenCalled();
    expect(numberInput.blur).not.toHaveBeenCalled();
    expect(textInput.blur).not.toHaveBeenCalled();
  });

  it("removes both global listeners during cleanup", () => {
    const { documentTarget } = createDocumentHarness();

    const cleanup = installNumberInputGuards(documentTarget);
    cleanup();

    expect(documentTarget.removeEventListener).toHaveBeenCalledWith(
      "wheel",
      expect.any(Function),
      true,
    );
    expect(documentTarget.removeEventListener).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
      true,
    );
  });
});
