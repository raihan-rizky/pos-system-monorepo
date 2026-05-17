import { describe, expect, it } from "vitest";
import { shouldShowAction, shouldShowDeleteAction, shouldShowUpdateAction } from "../rbac-ui";

describe("RBAC UI action visibility", () => {
  it("hides delete controls when the role cannot delete the resource", () => {
    const canPerform = (resource: string, action: string) =>
      resource === "customer" && action === "delete" ? false : true;

    expect(shouldShowDeleteAction("customer", canPerform)).toBe(false);
  });

  it("shows delete controls when the role can delete the resource", () => {
    const canPerform = (resource: string, action: string) =>
      resource === "transaction" && action === "delete";

    expect(shouldShowDeleteAction("transaction", canPerform)).toBe(true);
  });

  it("hides edit and update controls when the role only has read access", () => {
    const canPerform = (_resource: string, action: string) => action === "read";

    expect(shouldShowUpdateAction("product", canPerform)).toBe(false);
    expect(shouldShowAction("product", "create", canPerform)).toBe(false);
    expect(shouldShowAction("product", "read", canPerform)).toBe(true);
  });
});
