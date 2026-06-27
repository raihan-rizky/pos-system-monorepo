export type InventoryTaskPriority = "LOW" | "NORMAL" | "HIGH";

export interface SortableTaskChecklistItem {
  id: string;
  priority: InventoryTaskPriority;
  dueTime: string | null;
  isCompleted: boolean;
  createdAt: string | Date;
}

const PRIORITY_ORDER: Record<InventoryTaskPriority, number> = {
  HIGH: 0,
  NORMAL: 1,
  LOW: 2,
};

function createdAtTime(value: string | Date) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function sortTaskChecklistItems<T extends SortableTaskChecklistItem>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;

    const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (priorityDiff !== 0) return priorityDiff;

    if (a.dueTime && b.dueTime && a.dueTime !== b.dueTime) {
      return a.dueTime.localeCompare(b.dueTime);
    }
    if (a.dueTime && !b.dueTime) return -1;
    if (!a.dueTime && b.dueTime) return 1;

    return createdAtTime(a.createdAt) - createdAtTime(b.createdAt);
  });
}
