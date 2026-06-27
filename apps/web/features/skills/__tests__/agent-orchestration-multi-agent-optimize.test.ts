import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const skillPath =
  "C:\\Users\\Unknown\\.agents\\skills\\agent-orchestration-multi-agent-optimize\\SKILL.md";

const readSkill = () => readFileSync(skillPath, "utf8");

describe("agent-orchestration-multi-agent-optimize skill", () => {
  it("uses one explicit invocation contract without unresolved parameter placeholders", () => {
    const skill = readSkill();

    expect(skill).toContain("## Invocation Contract");
    expect(skill).toContain("Target system:");
    expect(skill).toContain("Performance goals:");
    expect(skill).toContain("Optimization scope:");
    expect(skill).toContain("Budget constraints:");
    expect(skill).toContain("Quality metrics:");
    expect(skill).not.toMatch(/\$(TARGET|PERFORMANCE_GOALS|OPTIMIZATION_SCOPE|BUDGET_CONSTRAINTS|QUALITY_METRICS|ARGUMENTS)\b/);
  });

  it("requires measurable baseline, thresholds, and rollback decisions before changes", () => {
    const skill = readSkill();

    expect(skill).toContain("## Required Baseline");
    expect(skill).toContain("## Validation And Rollback Gates");
    expect(skill).toContain("rollback");
    expect(skill).toContain("pass/fail");
    expect(skill).toContain("before/after");
  });

  it("documents concrete fault-tolerant orchestration behavior", () => {
    const skill = readSkill();

    expect(skill).toContain("timeout");
    expect(skill).toContain("retry");
    expect(skill).toContain("partial failure");
    expect(skill).toContain("cancellation");
    expect(skill).toContain("shared context");
    expect(skill).toContain("result aggregation");
  });

  it("keeps cost policy runtime-configurable instead of hard-coding model prices", () => {
    const skill = readSkill();

    expect(skill).toContain("runtime pricing configuration");
    expect(skill).toContain("per-run budget");
    expect(skill).not.toContain("'gpt-5': 0.03");
    expect(skill).not.toContain("'claude-4-sonnet': 0.015");
    expect(skill).not.toContain("'claude-4-haiku': 0.0025");
  });
});
