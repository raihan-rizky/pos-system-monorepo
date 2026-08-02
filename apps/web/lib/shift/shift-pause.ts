export type ShiftDateInput = Date | string;

export interface ShiftDurationInput {
  openedAt: ShiftDateInput;
  closedAt?: ShiftDateInput | null;
  pausedAt?: ShiftDateInput | null;
  pausedDurationSeconds?: number | null;
}

function toTimestamp(value: ShiftDateInput): number {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

export function getPauseDurationSeconds(
  pausedAt: ShiftDateInput,
  resumedAt: ShiftDateInput,
): number {
  const pausedTimestamp = toTimestamp(pausedAt);
  const resumedTimestamp = toTimestamp(resumedAt);

  if (!Number.isFinite(pausedTimestamp) || !Number.isFinite(resumedTimestamp)) {
    return 0;
  }

  return Math.max(0, Math.floor((resumedTimestamp - pausedTimestamp) / 1000));
}

export function getEffectiveDurationSeconds(
  input: ShiftDurationInput,
  now: Date = new Date(),
): number {
  const openedTimestamp = toTimestamp(input.openedAt);
  const endTimestamp = toTimestamp(input.closedAt ?? now);

  if (!Number.isFinite(openedTimestamp) || !Number.isFinite(endTimestamp)) {
    return 0;
  }

  const storedPauseSeconds = Math.max(0, input.pausedDurationSeconds ?? 0);
  const currentPauseSeconds = input.pausedAt
    ? getPauseDurationSeconds(input.pausedAt, input.closedAt ?? now)
    : 0;
  const elapsedSeconds = Math.floor((endTimestamp - openedTimestamp) / 1000);

  return Math.max(0, elapsedSeconds - storedPauseSeconds - currentPauseSeconds);
}

export function formatEffectiveDuration(seconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  if (totalMinutes < 60) return `${totalMinutes} mnt`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}j ${minutes}m`;
}
