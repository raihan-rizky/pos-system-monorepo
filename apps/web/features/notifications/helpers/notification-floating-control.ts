export type NotificationFloatingEdge = "left" | "right";

export type NotificationFloatingPreference = {
  edge: NotificationFloatingEdge;
  y: number;
  hidden: boolean;
};

export const NOTIFICATION_FLOATING_PREFERENCE_KEY =
  "pos_notification_floating_preference_v1";

export const DEFAULT_NOTIFICATION_FLOATING_PREFERENCE = {
  edge: "right",
  y: 24,
  hidden: true,
} satisfies NotificationFloatingPreference;

export function clampNotificationY(
  y: number,
  viewportHeight: number,
  controlHeight: number,
  margin = 8,
) {
  return Math.min(
    Math.max(y, margin),
    Math.max(margin, viewportHeight - controlHeight - margin),
  );
}

export function snapNotificationEdge(
  pointerX: number,
  viewportWidth: number,
): NotificationFloatingEdge {
  return pointerX < viewportWidth / 2 ? "left" : "right";
}

export function parseNotificationFloatingPreference(
  value: string | null,
): NotificationFloatingPreference {
  try {
    const parsed = value ? (JSON.parse(value) as Record<string, unknown>) : null;
    if (
      parsed &&
      (parsed.edge === "left" || parsed.edge === "right") &&
      typeof parsed.y === "number" &&
      Number.isFinite(parsed.y) &&
      typeof parsed.hidden === "boolean"
    ) {
      return {
        edge: parsed.edge,
        y: parsed.y,
        hidden: parsed.hidden,
      };
    }
  } catch {
    return { ...DEFAULT_NOTIFICATION_FLOATING_PREFERENCE };
  }

  return { ...DEFAULT_NOTIFICATION_FLOATING_PREFERENCE };
}
