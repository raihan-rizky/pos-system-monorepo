import React, { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PosTopPanel } from "../components/PosTopPanel";

const harness = vi.hoisted(() => ({ cursor: 0, slots: [] as any[] }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useId: () => "pos-panel-test",
    useRef: (initial: unknown) => {
      const index = harness.cursor++;
      harness.slots[index] ??= { current: initial };
      return harness.slots[index];
    },
    useState: (initial: unknown) => {
      const index = harness.cursor++;
      harness.slots[index] ??= { value: initial };
      return [harness.slots[index].value, (value: any) => {
        harness.slots[index].value = typeof value === "function" ? value(harness.slots[index].value) : value;
      }];
    },
  };
});

function render() {
  harness.cursor = 0;
  return PosTopPanel({ children: <input defaultValue="ATK" /> });
}

function find(node: React.ReactNode, predicate: (props: any) => boolean): any {
  if (!isValidElement(node)) return undefined;
  const props = node.props as any;
  if (predicate(props)) return props;
  for (const child of React.Children.toArray(props.children)) {
    const result = find(child, predicate);
    if (result) return result;
  }
}
const toggle = (tree: React.ReactNode) => find(tree, (p) => p["aria-expanded"] !== undefined);
const content = (tree: React.ReactNode) => find(tree, (p) => p.id === "pos-panel-test");
const handle = (tree: React.ReactNode) => find(tree, (p) => p.role === "separator");
const key = (name: string) => ({ key: name, preventDefault: vi.fn() });

describe("PosTopPanel", () => {
  beforeEach(() => { harness.cursor = 0; harness.slots = []; });

  it("starts expanded and hides content without unmounting it", () => {
    const tree = render();
    expect(toggle(tree)["aria-expanded"]).toBe(true);
    toggle(tree).onClick();
    const collapsed = render();
    expect(toggle(collapsed)["aria-expanded"]).toBe(false);
    expect(content(collapsed).hidden).toBe(true);
    expect(content(collapsed).children).toEqual(content(tree).children);
    expect(handle(collapsed)).toBeUndefined();
    toggle(collapsed).onClick();
    expect(content(render()).hidden).toBe(false);
  });

  it("supports keyboard resizing with bounded heights", () => {
    handle(render()).onKeyDown(key("End"));
    expect(content(render()).style.height).toBe(360);
    handle(render()).onKeyDown(key("ArrowDown"));
    expect(content(render()).style.height).toBe(360);
    handle(render()).onKeyDown(key("Home"));
    expect(content(render()).style.height).toBe(96);
    handle(render()).onKeyDown(key("ArrowUp"));
    expect(content(render()).style.height).toBe(96);
    handle(render()).onKeyDown(key("ArrowDown"));
    expect(content(render()).style.height).toBe(112);
  });

  it("resizes by pointer delta and stops after cancellation", () => {
    const target = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
    const grip = handle(render());
    grip.onPointerDown({ button: 0, pointerId: 7, clientY: 100, currentTarget: target, preventDefault: vi.fn() });
    grip.onPointerMove({ pointerId: 7, clientY: 130 });
    expect(content(render()).style.height).toBe(206);
    grip.onPointerCancel({ pointerId: 7, currentTarget: target });
    grip.onPointerMove({ pointerId: 7, clientY: 300 });
    expect(content(render()).style.height).toBe(206);
    expect(target.setPointerCapture).toHaveBeenCalledWith(7);
  });

  it("ignores secondary pointers and preserves height when reopened", () => {
    const grip = handle(render());
    grip.onPointerDown({ button: 2 });
    grip.onPointerMove({ pointerId: 8, clientY: 300 });
    expect(content(render()).style.height).toBeUndefined();
    grip.onKeyDown(key("End"));
    toggle(render()).onClick();
    toggle(render()).onClick();
    expect(content(render()).style.height).toBe(360);
  });

  it("restores automatic height on reset", () => {
    handle(render()).onKeyDown(key("End"));
    find(render(), (p) => p["aria-label"] === "Kembalikan ukuran panel").onClick();
    expect(content(render()).style.height).toBeUndefined();
  });
});
