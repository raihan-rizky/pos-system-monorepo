import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { expect, it } from "vitest";
import { config } from "@/middleware";

it("serves the offline unlock modules without requiring a session", () => {
  for (const url of ["/offline.html", "/offline-unlock.mjs", "/offline-vault.mjs", "/offline-prepare.mjs"]) {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
  }
  expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "/pos" })).toBe(true);
});
