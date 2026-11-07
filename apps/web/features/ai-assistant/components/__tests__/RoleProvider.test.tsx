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
  it("hides protected content and offers recovery when permissions are unverified", () => {
    const html = renderToStaticMarkup(
      <RoleProvider role="OWNER" userId="owner-1" userName="Pemilik" permissionsVerified={false}>
        <main>Data toko yang dilindungi</main>
      </RoleProvider>,
    );
    expect(html).toMatch(/hidden=""[^>]*><main>Data toko yang dilindungi/);
    expect(html).toContain("Coba lagi");
    expect(html).toContain("Keluar");
  });

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

  it("binds the prepared POS markup to the rendered authorization snapshot", () => {
    const html = renderToStaticMarkup(
      <RoleProvider role="CASHIER" userId="cashier-1" userName="Kasir" storeId="store-1"
        authorizationFingerprint="0123456789abcdef" permissionsVerified>
        <main>POS</main>
      </RoleProvider>,
    );
    expect(html).toContain('data-offline-auth-user="cashier-1"');
    expect(html).toContain('data-offline-auth-store="store-1"');
    expect(html).toContain('data-offline-auth-role="CASHIER"');
    expect(html).toContain('data-offline-auth-fingerprint="0123456789abcdef"');
    expect(html).toContain('data-offline-auth-verified="true"');
  });

  it("marks a failed server permission lookup as unverified", () => {
    const html = renderToStaticMarkup(
      <RoleProvider role="CASHIER" userId="cashier-1" userName="Kasir" storeId="store-1"
        authorizationFingerprint="0123456789abcdef" permissionsVerified={false}>
        <main>POS</main>
      </RoleProvider>,
    );
    expect(html).toContain('data-offline-auth-verified="false"');
  });
});
