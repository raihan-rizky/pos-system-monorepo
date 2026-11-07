import { describe, expect, it } from "vitest";
import { resolveCorrectionSchedule, resizeCorrectionSchedule } from "../shopping-request-correction-schedule";

const schedule = [
  { method: "TRANSFER" as const, amount: "3000.00", dueDate: null, note: "DP" },
  { method: "GIRO" as const, amount: "3000.00", dueDate: "2026-12-01", note: "Awal" },
  { method: "GIRO" as const, amount: "4000.00", dueDate: "2026-12-15", note: "Akhir" },
];
describe("jadwal pembayaran koreksi", () => {
  it("menerima jadwal campuran hanya jika total sesuai biaya", () => {
    expect(resolveCorrectionSchedule({ total: "10000", schedule, previous: [], method: null, dueDate: null })).toEqual(schedule);
    expect(() => resolveCorrectionSchedule({ total: "9000", schedule, previous: [], method: null, dueDate: null })).toThrow(/total/i);
  });
  it("tidak meruntuhkan multi jadwal yang dihilangkan dari payload", () => {
    expect(() => resolveCorrectionSchedule({ total: "9000", previous: schedule, method: "GIRO", dueDate: "2026-12-01" })).toThrow(/rincian/i);
  });
  it("mempertahankan Transfer dan mengurangi Giro terakhir dahulu tanpa menghapus baris", () => {
    expect(resizeCorrectionSchedule(schedule, "5000")).toEqual([schedule[0], { ...schedule[1], amount: "2000.00" }, { ...schedule[2], amount: "0.00" }]);
    expect(resizeCorrectionSchedule(schedule, "12000")).toEqual([schedule[0], schedule[1], { ...schedule[2], amount: "6000.00" }]);
  });
  it("membatasi rencana Transfer ketika biaya lebih kecil sambil menjaga sumber aktual terpisah", () => {
    expect(resizeCorrectionSchedule(schedule, "1000").map(row => row.amount)).toEqual(["1000.00", "0.00", "0.00"]);
  });
});
