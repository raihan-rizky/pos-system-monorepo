import { describe, expect, it } from "vitest";

import { calculateMagnifierFrame } from "../components/app-shell-preview/PreviewMagnifier";

describe("preview magnifier geometry", () => {
  it("centers a 2x zoom bubble over the pointer in the middle of the AppShell", () => {
    expect(
      calculateMagnifierFrame({
        width: 1000,
        height: 500,
        pointX: 500,
        pointY: 250,
        diameter: 184,
        zoom: 2,
      }),
    ).toEqual({
      pointX: 500,
      pointY: 250,
      left: 408,
      top: 158,
      translateX: -908,
      translateY: -408,
    });
  });

  it("clamps the bubble inside the top-left and bottom-right AppShell edges", () => {
    expect(
      calculateMagnifierFrame({
        width: 1000,
        height: 500,
        pointX: 20,
        pointY: 16,
        diameter: 184,
        zoom: 2,
      }),
    ).toMatchObject({ left: 0, top: 0, pointX: 20, pointY: 16 });

    expect(
      calculateMagnifierFrame({
        width: 1000,
        height: 500,
        pointX: 980,
        pointY: 490,
        diameter: 184,
        zoom: 2,
      }),
    ).toMatchObject({ left: 816, top: 316, pointX: 980, pointY: 490 });
  });

  it("clamps pointer coordinates before calculating the zoom transform", () => {
    expect(
      calculateMagnifierFrame({
        width: 600,
        height: 300,
        pointX: 900,
        pointY: -50,
        diameter: 184,
        zoom: 2,
      }),
    ).toEqual({
      pointX: 600,
      pointY: 0,
      left: 416,
      top: 0,
      translateX: -1108,
      translateY: 92,
    });
  });
});

