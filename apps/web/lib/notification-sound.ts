export const NOTIFICATION_SOUND_ENABLED_KEY =
  "pos_notification_sound_enabled_v1";
export const NOTIFICATION_SOUND_URL = "/sounds/notification.mp3";

export function isNotificationSoundEnabled() {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(NOTIFICATION_SOUND_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setNotificationSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;

  try {
    if (enabled) {
      window.localStorage.setItem(NOTIFICATION_SOUND_ENABLED_KEY, "1");
    } else {
      window.localStorage.removeItem(NOTIFICATION_SOUND_ENABLED_KEY);
    }
  } catch {
    // Preference storage can be unavailable in private or restricted contexts.
  }
}

export async function playNotificationSound() {
  if (typeof window === "undefined") return;

  const audio = new Audio(NOTIFICATION_SOUND_URL);
  audio.volume = 0.6;
  await audio.play();
}
