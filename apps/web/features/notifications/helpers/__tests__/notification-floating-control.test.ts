import { describe, expect, it } from "vitest";

import {
  clampNotificationY,
  DEFAULT_NOTIFICATION_FLOATING_PREFERENCE,
  parseNotificationFloatingPreference,
  snapNotificationEdge,
} from "../notification-floating-control";

describe("notification floating control helpers", () => {
  it("starts hidden on the right edge", () => {
    expect(DEFAULT_NOTIFICATION_FLOATING_PREFERENCE).toEqual({
      edge: "right",
      y: 24,
      hidden: true,
    });
  });

  it("clamps the control inside the vertical viewport", () => {
    expect(clampNotificationY(-20, 800, 48)).toBe(8);
    expect(clampNotificationY(900, 800, 48)).toBe(744);
    expect(clampNotificationY(120, 800, 48)).toBe(120);
  });

  it("snaps to the nearest horizontal edge", () => {
    expect(snapNotificationEdge(200, 1000)).toBe("left");
    expect(snapNotificationEdge(800, 1000)).toBe("right");
  });

  it("restores valid preferences and falls back safely", () => {
    expect(
      parseNotificationFloatingPreference(
        '{"edge":"left","y":120,"hidden":false}',
      ),
    ).toEqual({ edge: "left", y: 120, hidden: false });
    expect(parseNotificationFloatingPreference("broken")).toEqual(
      DEFAULT_NOTIFICATION_FLOATING_PREFERENCE,
    );
    expect(
      parseNotificationFloatingPreference(
        '{"edge":"top","y":"120","hidden":"no"}',
      ),
    ).toEqual(DEFAULT_NOTIFICATION_FLOATING_PREFERENCE);
  });
});
