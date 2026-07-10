import { describe, expect, it } from "vitest";
import * as beamsBackground from "@/components/ui/beams-background";

describe("beams background performance profile", () => {
  it("uses a lightweight animation profile on low-end devices", () => {
    const getProfile = (
      beamsBackground as typeof beamsBackground & {
        getBeamPerformanceProfile?: (input: {
          viewportWidth: number;
          devicePixelRatio: number;
          hardwareConcurrency: number;
          deviceMemory: number;
          prefersReducedMotion: boolean;
        }) => {
          animate: boolean;
          beamCount: number;
          pixelRatio: number;
          targetFps: number;
        };
      }
    ).getBeamPerformanceProfile;

    expect(getProfile).toBeTypeOf("function");
    expect(
      getProfile?.({
        viewportWidth: 390,
        devicePixelRatio: 3,
        hardwareConcurrency: 4,
        deviceMemory: 4,
        prefersReducedMotion: false,
      }),
    ).toMatchObject({
      animate: true,
      beamCount: 8,
      pixelRatio: 1,
      targetFps: 30,
    });
  });

  it("renders a static background when reduced motion is requested", () => {
    const getProfile = (
      beamsBackground as typeof beamsBackground & {
        getBeamPerformanceProfile?: (input: {
          viewportWidth: number;
          devicePixelRatio: number;
          hardwareConcurrency: number;
          deviceMemory: number;
          prefersReducedMotion: boolean;
        }) => { animate: boolean; targetFps: number };
      }
    ).getBeamPerformanceProfile;

    expect(getProfile).toBeTypeOf("function");
    expect(
      getProfile?.({
        viewportWidth: 1440,
        devicePixelRatio: 2,
        hardwareConcurrency: 8,
        deviceMemory: 8,
        prefersReducedMotion: true,
      }),
    ).toMatchObject({ animate: false, targetFps: 0 });
  });
});
