import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoleProvider, useRole } from "@/components/providers/RoleProvider";

function ContextProbe() {
  const context = useRole() as ReturnType<typeof useRole> & {
    storeId?: string | null;
    authorizationFingerprint?: string | null;
  };

  return (
    <div
      data-store-id={context.storeId ?? ""}
      data-authorization-fingerprint={context.authorizationFingerprint ?? ""}
    />
  );
}

describe("RoleProvider", () => {
  it("exposes store and authorization fingerprint for assistant history isolation", () => {
    const html = renderToStaticMarkup(
      <RoleProvider
        role="ADMIN"
        userId="user-1"
        userName="Admin User"
        storeId="store-1"
        authorizationFingerprint="perm-v1"
      >
        <ContextProbe />
      </RoleProvider>,
    );

    expect(html).toContain('data-store-id="store-1"');
    expect(html).toContain('data-authorization-fingerprint="perm-v1"');
  });
});
