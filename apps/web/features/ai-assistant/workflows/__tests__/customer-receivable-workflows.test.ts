import { expect, it } from "vitest";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";
import { FAQ_WORKFLOWS } from "../workflow-catalog";
import { isWorkflowPermitted } from "../assistant-workflow-matcher";

it("only offers payment and manual-entry guides when their independent actions are granted", () => {
  const permissions = buildDefaultRolePermissions();
  const payment = FAQ_WORKFLOWS.find((workflow) => workflow.faqNumber === 15)!;
  const manual = FAQ_WORKFLOWS.find((workflow) => workflow.faqNumber === 41)!;
  expect(isWorkflowPermitted(payment, "SALES", permissions)).toBe(false);
  expect(isWorkflowPermitted(manual, "SALES", permissions)).toBe(false);
  permissions.SALES.resources["customer.receivable.payment"].create = true;
  expect(isWorkflowPermitted(payment, "SALES", permissions)).toBe(true);
  expect(isWorkflowPermitted(manual, "SALES", permissions)).toBe(false);
  permissions.SALES.resources["customer.receivable"].create = true;
  expect(isWorkflowPermitted(manual, "SALES", permissions)).toBe(true);
});
