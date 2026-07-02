import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config.mjs";

describe("Next.js Config - Image Domains", () => {
  it("includes the production Supabase image domain in remotePatterns", () => {
    const remotePatterns = nextConfig.images?.remotePatterns || [];
    const hostnames = remotePatterns.map((pattern) => pattern.hostname);
    expect(hostnames).toContain("hqlyyyjlemqskpurzltz.supabase.co");
  });
});
