import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Match the node-only component tests while exercising the real effect lifecycle.
const hooks = vi.hoisted(() => ({
  values: [] as any[], index: 0, effectIndex: 0,
  dependencies: [] as unknown[][], effects: [] as (() => void)[],
  cleanups: [] as (void | (() => void))[], dirty: false,
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (next: any) => {
      const value = typeof next === "function" ? next(hooks.values[index]) : next;
      if (!Object.is(value, hooks.values[index])) hooks.dirty = true;
      hooks.values[index] = value;
    }];
  },
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = { current: initial };
    return hooks.values[index];
  },
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const index = hooks.effectIndex++;
    if (!hooks.dependencies[index] || deps.some((value, i) => !Object.is(value, hooks.dependencies[index][i]))) {
      hooks.effects.push(() => {
        hooks.cleanups[index]?.();
        hooks.cleanups[index] = effect();
      });
      hooks.dependencies[index] = deps;
    }
  },
}));
vi.mock("../../hooks/useShoppingRequests", () => ({
  useShoppingRequest: () => ({ data: null }),
  useFinalizeShoppingRequest: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useRejectShoppingRequest: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ canPerform: () => true }) }));
vi.mock("../ProductAutocomplete", () => ({ ProductAutocomplete: () => null }));
vi.mock("../ShoppingRequestUnitSelect", () => ({ ShoppingRequestUnitSelect: () => null }));
vi.mock("@/features/inventory-management/components/ProductStockThumbnail", () => ({ ProductStockThumbnail: () => null }));
vi.mock("@pos/ui", () => ({ Button: () => null, Modal: () => null }));
import { ShoppingRequestFinalApprovalModal } from "../ShoppingRequestFinalApprovalModal";

let active: FakeElement;
class FakeElement {
  inert = false;
  isConnected = true;
  tabIndex = 0;
  parentElement: FakeElement | null = null;
  children: FakeElement[] = [];
  constructor(readonly name: string, readonly visible = true, readonly disabled = false) {}
  focus() { active = this; }
  getClientRects() { return this.visible ? [{}] : []; }
  contains(element: FakeElement) { return element === this || this.children.some((child) => child.contains(element)); }
}
let opener: FakeElement, first: FakeElement, last: FakeElement, dialog: FakeElement;
let background: FakeElement, preexistingInert: FakeElement, dialogSibling: FakeElement;
let listeners: Map<string, Set<(event: any) => void>>;

function render(requestId: string | null) {
  let passes = 0;
  do {
    hooks.dirty = false;
    hooks.index = hooks.effectIndex = 0;
    const tree = ShoppingRequestFinalApprovalModal({ requestId, onClose: vi.fn() });
    const attach = (node: any): void => {
      if (Array.isArray(node)) return node.forEach(attach);
      if (!node?.props) return;
      if (node.props.ref && requestId) node.props.ref.current = { closest: () => dialog };
      attach(node.props.children);
    };
    attach(tree);
    hooks.effects.splice(0).forEach((effect) => effect());
    if (++passes > 10) throw new Error("Component did not settle");
  } while (hooks.dirty);
}
function tab(shiftKey = false) {
  const event = { key: "Tab", shiftKey, preventDefault: vi.fn() };
  listeners.get("keydown")?.forEach((listener) => listener(event));
  return event;
}

describe("final approval keyboard session", () => {
  beforeEach(() => {
    hooks.values = []; hooks.dependencies = []; hooks.effects = []; hooks.cleanups = [];
    listeners = new Map();
    opener = new FakeElement("open approval");
    first = new FakeElement("close"); last = new FakeElement("back");
    const disabled = new FakeElement("disabled submit", true, true);
    const collapsed = new FakeElement("collapsed rejection", false);
    dialog = new FakeElement("dialog");
    dialog.children = [first, last, disabled, collapsed];
    Object.assign(dialog, {
      querySelectorAll: () => dialog.children.filter((node) => !node.disabled),
      querySelector: () => first,
    });
    const body = new FakeElement("body"), host = new FakeElement("host"), overlay = new FakeElement("overlay");
    background = new FakeElement("app"); preexistingInert = new FakeElement("already inert");
    preexistingInert.inert = true;
    dialogSibling = new FakeElement("overlay sibling");
    overlay.children = [dialog]; host.children = [dialogSibling, overlay];
    body.children = [background, preexistingInert, host];
    dialog.parentElement = overlay; overlay.parentElement = host; host.parentElement = body;
    active = opener;
    vi.stubGlobal("HTMLElement", FakeElement);
    vi.stubGlobal("document", {
      body, get activeElement() { return active; },
      addEventListener: (name: string, listener: (event: any) => void) => {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name)!.add(listener);
      },
      removeEventListener: (name: string, listener: (event: any) => void) => listeners.get(name)?.delete(listener),
    });
  });
  afterEach(() => {
    hooks.cleanups.forEach((cleanup) => cleanup?.());
    vi.unstubAllGlobals();
  });

  it("moves focus into the dialog even while request data is loading", () => {
    render("A");
    expect(active.name).toBe(first.name);
  });
  it("wraps Tab and Shift+Tab around enabled visible controls", () => {
    render("A");
    last.focus();
    expect(tab().preventDefault).toHaveBeenCalled();
    expect(active.name).toBe(first.name);
    expect(tab(true).preventDefault).toHaveBeenCalled();
    expect(active.name).toBe(last.name);
  });
  it("excludes background siblings and restores their inert state and the opener on close", () => {
    render("A");
    expect(background.inert).toBe(true);
    expect(dialogSibling.inert).toBe(true);
    render(null);
    expect(background.inert).toBe(false);
    expect(dialogSibling.inert).toBe(false);
    expect(preexistingInert.inert).toBe(true);
    expect(active.name).toBe(opener.name);
    expect(listeners.get("keydown")?.size ?? 0).toBe(0);
  });
});
