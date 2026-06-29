import { describe, expect, it } from "vitest";

import { FAQ_WORKFLOWS } from "../workflow-catalog";

describe("FAQ workflow catalog", () => {
  it("defines one serializable guided workflow for each numbered FAQ", () => {
    expect(FAQ_WORKFLOWS).toHaveLength(32);
    expect(FAQ_WORKFLOWS.map((workflow) => workflow.faqNumber).sort((a, b) => a - b))
      .toEqual(Array.from({ length: 32 }, (_, index) => index + 1));

    for (const workflow of FAQ_WORKFLOWS) {
      expect(workflow.id).toMatch(/^faq-q\d{2}-[a-z0-9-]+$/);
      expect(workflow.title).toMatch(/[A-Za-zÀ-ž]/);
      expect(workflow.aliases.length).toBeGreaterThanOrEqual(2);
      expect(workflow.requiredPages.length + workflow.requiredCapabilities.length)
        .toBeGreaterThan(0);
      expect(workflow.route).toMatch(/^\//);
      expect(workflow.actionLabel).toMatch(/^Buka /);
      expect(workflow.sourceRef).toMatch(/^docs\/help\/faq\.md#q\d+/);
      expect(workflow.iconKey).toMatch(/^[a-z-]+$/);
      expect(workflow.steps.length).toBeGreaterThanOrEqual(2);

      for (const step of workflow.steps) {
        expect(step.id).toMatch(new RegExp(`^${workflow.id}-step-\\d+$`));
        expect(step.title).not.toContain("TODO");
        expect(step.description).not.toContain("TODO");
        expect(step.route).toBe(workflow.route);
        expect(step.actionLabel).toBe(workflow.actionLabel);
        expect(step.iconKey).toBe(workflow.iconKey);
      }

      expect(() => JSON.stringify(workflow)).not.toThrow();
    }
  });

  it("keeps inbound receipt approval guidance aligned with owner-locked RBAC", () => {
    const inbound = FAQ_WORKFLOWS.find((workflow) => workflow.faqNumber === 17);

    expect(inbound).toBeDefined();
    expect(JSON.stringify(inbound)).toContain("OWNER");
    expect(JSON.stringify(inbound)).not.toContain("admin dengan izin `inventory.approve`");
  });
});
