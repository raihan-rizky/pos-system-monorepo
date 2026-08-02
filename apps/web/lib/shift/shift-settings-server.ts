import { db } from "@pos/db";
import { getPauseDurationSeconds } from "./shift-pause";

const SETTINGS_ID = "store-main";
const DEFAULT_SHIFT_ENABLED = true;

export type ShiftSettings = {
  enabled: boolean;
};

export async function getShiftSettings(): Promise<ShiftSettings> {
  const settings = await db.storeSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { shiftEnabled: true },
  });

  return { enabled: settings?.shiftEnabled ?? DEFAULT_SHIFT_ENABLED };
}

export async function setShiftEnabled(
  enabled: boolean,
  now: Date = new Date(),
): Promise<ShiftSettings> {
  return db.$transaction(async (transaction) => {
    const currentSettings = await transaction.storeSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { shiftEnabled: true },
    });
    const currentEnabled = currentSettings?.shiftEnabled ?? DEFAULT_SHIFT_ENABLED;

    if (currentEnabled !== enabled) {
      if (enabled) {
        const pausedShifts = await transaction.cashierShift.findMany({
          where: { status: "OPEN", pausedAt: { not: null } },
          select: { id: true, pausedAt: true },
        });

        for (const shift of pausedShifts) {
          if (!shift.pausedAt) continue;

          await transaction.cashierShift.update({
            where: { id: shift.id },
            data: {
              pausedAt: null,
              pausedDurationSeconds: {
                increment: getPauseDurationSeconds(shift.pausedAt, now),
              },
            },
          });
        }
      } else {
        await transaction.cashierShift.updateMany({
          where: { status: "OPEN", pausedAt: null },
          data: { pausedAt: now },
        });
      }
    }

    await transaction.storeSettings.upsert({
      where: { id: SETTINGS_ID },
      update: { shiftEnabled: enabled },
      create: { id: SETTINGS_ID, shiftEnabled: enabled },
    });

    return { enabled };
  });
}
