import { describe, expect, it } from "vitest";
import { HELP_ROLE_CONTENT } from "../components/HelpContent";
import { FAQ_WORKFLOWS } from "@/features/ai-assistant/workflows/workflow-catalog";

describe("special pricing cost and margin guidance", () => {
  it.each(["help", "assistant"])("explains per-unit HPP, markup and loss warnings in %s", (source) => {
    const text = source === "help"
      ? JSON.stringify(HELP_ROLE_CONTENT.OWNER.find(item => item.id === "owner-special-pricing")?.steps)
      : JSON.stringify(FAQ_WORKFLOWS.find(item => item.id.endsWith("-customer-special-pricing"))?.steps);
    expect(text).toBeDefined();
    for (const phrase of ["HPP masing-masing satuan", "HPP satuan terkecil", "0%", "25,93%", "laba", "margin", "di bawah HPP", "lebih spesifik"]) {
      expect(text).toContain(phrase);
    }
  });
});
