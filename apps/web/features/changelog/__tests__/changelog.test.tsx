import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getPublishedChanges, getRecentChanges, getUnseenChanges, parseSeenChanges, changeKey } from "../helpers/changelog";
import type { ChangeEntry } from "../types";
import { CHANGELOG } from "../data/changelog";
import { ChangeCard } from "../components/ChangeCard";
import { ChangelogFeed } from "../components/ChangelogFeed";
import { APP_SHELL_NAV_GROUPS } from "@/components/app-shell/app-shell-navigation";
import { ALL_ROLES, buildDefaultRolePermissions, canRoleAccessPage } from "@/features/rbac/helpers/rbac-core";
import { RBAC_PERMISSION_MODULES } from "@/features/rbac/helpers/rbac-settings-ui";
import HelpContent from "@/features/help-documentation/components/HelpContent";
import { FAQ_WORKFLOWS } from "@/features/ai-assistant/workflows/workflow-catalog";

const entry = (id: string, date: string, revision = 1): ChangeEntry => ({
  id, date, revision, title: `Pembaruan ${id}`, summary: "Lebih mudah dipakai.",
  kind: "improvement", area: "Kasir", href: "/pos", visual: "units",
  steps: [{ title: "Pilih produk", detail: "Buka Kasir" }, { title: "Cek satuan", detail: "Lihat konversi" }, { title: "Lanjutkan", detail: "Masukkan jumlah" }],
});
const now = new Date("2026-10-18T03:00:00Z");

describe("manual changelog", () => {
  it("uses seven WIB calendar days including today and excludes future and invalid dates", () => {
    const changes = [entry("old", "2026-10-11"), entry("boundary", "2026-10-12"), entry("today", "2026-10-18"), entry("future", "2026-10-19"), entry("invalid", "2026-02-30")];
    expect(getRecentChanges(changes, now).map(item => item.id)).toEqual(["today", "boundary"]);
    expect(getPublishedChanges(changes, now).map(item => item.id)).toEqual(["today", "boundary", "old"]);
  });

  it("rolls the calendar over at midnight WIB rather than UTC", () => {
    const changes = [entry("boundary", "2026-10-12"), entry("tomorrow", "2026-10-19")];
    expect(getRecentChanges(changes, new Date("2026-10-18T16:59:59Z")).map(item => item.id)).toEqual(["boundary"]);
    expect(getRecentChanges(changes, new Date("2026-10-18T17:00:00Z")).map(item => item.id)).toEqual(["tomorrow"]);
  });

  it("does not mutate the manual catalog when sorting", () => {
    const changes = [entry("first", "2026-10-12"), entry("second", "2026-10-18")];
    getRecentChanges(changes, now);
    expect(changes[0].id).toBe("first");
  });

  it("only announces unseen entries and reannounces an explicitly revised entry", () => {
    const seen = [changeKey(entry("seen", "2026-10-18"))];
    expect(getUnseenChanges([entry("seen", "2026-10-18"), entry("new", "2026-10-18"), entry("old", "2026-10-01")], seen, now).map(item => item.id)).toEqual(["new"]);
    expect(getUnseenChanges([entry("seen", "2026-10-18", 2)], seen, now)).toHaveLength(1);
  });

  it("recovers from malformed or unavailable saved state", () => {
    for (const value of [null, "{", "{}", "null", '"hello"']) expect(parseSeenChanges(value)).toEqual([]);
    expect(parseSeenChanges('["one:1",42,null,"two:1"]')).toEqual(["one:1", "two:1"]);
  });

  it("provides visual entries with unique IDs, concise copy, and real local screenshot paths", () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    expect(new Set(CHANGELOG.map(item => item.id)).size).toBe(CHANGELOG.length);
    for (const change of CHANGELOG) {
      expect(change.summary.length).toBeLessThanOrEqual(220);
      expect(change.steps).toHaveLength(3);
      if (change.screenshot) expect(change.screenshot.src).toMatch(/^\/images\/changelog\/.+\.(webp|png)$/);
    }
  });

  it("renders a screenshot with an enlarge control and a numbered visual flow", () => {
    const change = { ...entry("visual", "2026-10-18"), screenshot: { src: "/images/changelog/units.webp", alt: "Stok dan konversi satuan di kartu produk" } };
    const html = renderToStaticMarkup(<ChangeCard entry={change} canOpenFeature />);
    expect(html).toContain(change.screenshot.alt);
    expect(html).toContain("Perbesar gambar");
    expect(html).toContain('aria-label="Alur penggunaan"');
    expect(html).toContain('href="/pos"');
  });

  it("hides feature links when the role lacks access while keeping the explanation visible", () => {
    const html = renderToStaticMarkup(<ChangeCard entry={entry("limited", "2026-10-18")} canOpenFeature={false} />);
    expect(html).toContain("Pembaruan limited");
    expect(html).not.toContain('href="/pos"');
  });

  it("shows useful empty states for archive and weekly popup content", () => {
    expect(renderToStaticMarkup(<ChangelogFeed entries={[]} />)).toContain("Belum ada catatan perubahan");
    expect(renderToStaticMarkup(<ChangelogFeed entries={[]} recent />)).toContain("Belum ada pembaruan dalam 7 hari terakhir");
  });

  it("puts Catatan Perubahan in Lainnya and allows all roles by default", () => {
    expect(APP_SHELL_NAV_GROUPS.find(group => group.id === "utils")?.items).toContainEqual(expect.objectContaining({ href: "/changelog", label: "Catatan Perubahan" }));
    const permissions = buildDefaultRolePermissions();
    for (const role of ALL_ROLES) expect(canRoleAccessPage(role, "/changelog", permissions)).toBe(true);
    expect(RBAC_PERMISSION_MODULES.some(module => module.pageTargets.includes("/changelog"))).toBe(true);
  });

  it("keeps help and assistant guidance in sync with the new page", () => {
    expect(renderToStaticMarkup(<HelpContent targetRole="OWNER" />)).toContain('href="/changelog"');
    expect(FAQ_WORKFLOWS.find(item => item.route === "/changelog")?.steps).toHaveLength(3);
  });
});
