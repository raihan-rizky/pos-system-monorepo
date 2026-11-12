import { describe, expect, it, vi } from "vitest";
import { signOutCurrentSession } from "@/lib/auth/local-sign-out";

describe("current-device sign out", () => {
  it("revokes only the current session, leaving other devices signed in", async () => {
    const sessions = new Set(["this-device", "other-device"]);
    const client = {
      auth: {
        async signOut({ scope }: { scope: "local" }) {
          if (scope === "local") sessions.delete("this-device");
          else sessions.clear();
          return { error: null };
        },
      },
    };
    await signOutCurrentSession(client);
    expect([...sessions]).toEqual(["other-device"]);
  });

  it("does not report success when the auth server rejects sign out", async () => {
    const error = new Error("connection unavailable");
    const signOut = vi.fn(async () => ({ error }));
    await expect(signOutCurrentSession({ auth: { signOut } })).rejects.toBe(error);
  });

  it("allows login cleanup when the current session was already revoked", async () => {
    const error = Object.assign(new Error("Refresh token not found"), { code: "refresh_token_not_found", status: 400 });
    const signOut = vi.fn(async () => ({ error }));
    await expect(signOutCurrentSession({ auth: { signOut } })).resolves.toBeUndefined();
  });
});
