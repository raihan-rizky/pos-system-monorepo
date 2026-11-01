import { describe, expect, it, vi } from "vitest";
import { fullDay, shortDay } from "../CashFlowChart";

describe("label tanggal arus kas WIB", () => {
  it("uses the same calendar date in browsers outside Indonesia", () => {
    const RealDateTimeFormat = Intl.DateTimeFormat;
    const optionsSeen: Intl.DateTimeFormatOptions[] = [];
    vi.stubGlobal("Intl", {
      ...Intl,
      DateTimeFormat: function (locale: string, options: Intl.DateTimeFormatOptions) {
        optionsSeen.push(options);
        return new RealDateTimeFormat(locale, options);
      },
    });
    try {
      expect(shortDay("2026-11-10")).toBe("10");
      expect(fullDay("2026-11-10")).toMatch(/10 Nov 2026/);
      expect(optionsSeen).toHaveLength(2);
      for (const options of optionsSeen) expect(options.timeZone).toBe("Asia/Jakarta");
    } finally { vi.unstubAllGlobals(); }
  });
});
