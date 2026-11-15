import { expect, it } from "vitest";
import { HELP_ROLE_CONTENT } from "../components/HelpContent";
import { FAQ_WORKFLOWS } from "@/features/ai-assistant/workflows/workflow-catalog";

it("guides owners and admins to export the displayed range with manual income", () => {
  const guides = [
    HELP_ROLE_CONTENT.OWNER.find((item) => item.id === "owner-export-reports"),
    HELP_ROLE_CONTENT.ADMIN.find((item) => item.id === "admin-export-reports"),
    FAQ_WORKFLOWS.find((workflow) => workflow.faqNumber === 21),
  ];
  for (const guide of guides) {
    expect(guide).toBeDefined();
    const text = guide!.steps.map((step) => step.description).join(" ");
    expect(text).toMatch(/Jurnal transaksi · Excel \/ PDF/);
    expect(text).toMatch(/Periode pada layar.*rentang.*layar/i);
    expect(text).toMatch(/pemasukan manual.*(pembayaran|metode)/i);
    expect(text).toMatch(/tanpa izin.*rincian.*disembunyikan/i);
  }
});
