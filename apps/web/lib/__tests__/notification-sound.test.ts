import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isNotificationSoundEnabled,
  NOTIFICATION_SOUND_ENABLED_KEY,
  NOTIFICATION_SOUND_URL,
  playNotificationSound,
  setNotificationSoundEnabled,
} from "../notification-sound";

describe("notification sound helpers", () => {
  const storage = new Map<string, string>();
  const playMock = vi.fn();
  const audioInstances: Array<{ src: string; volume: number }> = [];

  beforeEach(() => {
    storage.clear();
    playMock.mockResolvedValue(undefined);
    audioInstances.length = 0;

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
          removeItem: (key: string) => storage.delete(key),
        },
      },
    });

    Object.defineProperty(globalThis, "Audio", {
      configurable: true,
      value: vi.fn().mockImplementation(function createAudio(src: string) {
        const audio = {
          src,
          volume: 1,
          play: playMock,
        };
        audioInstances.push(audio);
        return audio;
      }),
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "Audio");
  });

  it("stores the local sound preference", () => {
    expect(isNotificationSoundEnabled()).toBe(false);

    setNotificationSoundEnabled(true);

    expect(storage.get(NOTIFICATION_SOUND_ENABLED_KEY)).toBe("1");
    expect(isNotificationSoundEnabled()).toBe(true);

    setNotificationSoundEnabled(false);

    expect(storage.has(NOTIFICATION_SOUND_ENABLED_KEY)).toBe(false);
    expect(isNotificationSoundEnabled()).toBe(false);
  });

  it("plays the configured notification sound at moderate volume", async () => {
    await playNotificationSound();

    expect(Audio).toHaveBeenCalledWith(NOTIFICATION_SOUND_URL);
    expect(audioInstances[0].volume).toBe(0.6);
    expect(playMock).toHaveBeenCalledTimes(1);
  });
});
