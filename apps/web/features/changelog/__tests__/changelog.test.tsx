import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getPublishedChanges, getRecentChanges, getUnseenChanges, parseSeenChanges, changeKey } from "../helpers/changelog";
import type { ChangeEntry } from "../types";
import { CHANGELOG } from "../data/changelog";
import { ChangeCard } from "../components/ChangeCard";
import { ChangelogFeed } from "../components/ChangelogFeed";
import { WhatsNewDialog } from "../components/WhatsNewDialog";
import { APP_SHELL_NAV_GROUPS } from "@/components/app-shell/app-shell-navigation";
import { ALL_ROLES, buildDefaultRolePermissions, canRoleAccessPage } from "@/features/rbac/helpers/rbac-core";
import { RBAC_PERMISSION_MODULES } from "@/features/rbac/helpers/rbac-settings-ui";
import HelpContent from "@/features/help-documentation/components/HelpContent";
import { FAQ_WORKFLOWS } from "@/features/ai-assistant/workflows/workflow-catalog";
import { ChangeIllustration } from "../components/ChangeIllustration";

const entry = (id: string, date: string, revision = 1): ChangeEntry => ({
  id, date, revision, title: `Pembaruan ${id}`, summary: "Lebih mudah dipakai.",
  highlight: { title: `Inti ${id}`, summary: "Manfaatnya langsung terlihat." },
  kind: "improvement", area: "Kasir", href: "/pos", visual: "units",
  steps: [{ title: "Pilih produk", detail: "Buka Kasir" }, { title: "Cek satuan", detail: "Lihat konversi" }, { title: "Lanjutkan", detail: "Masukkan jumlah" }],
});
const now = new Date("2026-10-18T03:00:00Z");

describe("manual changelog", () => {
  it("announces and illustrates daily receipt subtotals in the monthly RC sheet", () => {
    const update = CHANGELOG.find(change => change.id === "total-harian-rc-bulan-20261121");
    expect(update).toMatchObject({
      date: "2026-11-21",
      revision: 1,
      kind: "improvement",
      impact: "minor",
      area: "Laporan Keuangan",
      href: "/financial-report",
      visual: "daily-subtotal",
    });
    expect(update?.highlight.title.length).toBeLessThanOrEqual(40);
    expect(update?.highlight.summary.length).toBeLessThanOrEqual(85);
    expect(update?.steps).toHaveLength(3);

    const html = renderToStaticMarkup(<ChangeIllustration visual={"daily-subtotal" as ChangeEntry["visual"]} />);
    for (const detail of ["RC Bulan September", "Tanggal", "Cetak", "Perlu pemetaan", "TOTAL", "TOTAL HARIAN", "Rp110.000"]) {
      expect(html).toContain(detail);
    }
    expect(html.match(/TOTAL HARIAN/g)).toHaveLength(2);
    expect(html).toContain("30/09/2026");
    for (const color of ["#DFF3ED", "#14564F", "#15816F"]) expect(html).toContain(color);
    expect(renderToStaticMarkup(<ChangeIllustration visual={"daily-subtotal" as ChangeEntry["visual"]} compact />))
      .toContain("Subtotal harian di RC Bulan");
    expect(renderToStaticMarkup(<WhatsNewDialog entries={update ? [update] : []} onClose={() => {}} canAccess={() => true} />))
      .toContain("Subtotal harian di RC Bulan");
  });

  it("announces the POS catalog pills and active cart unit", () => {
    const update = CHANGELOG.find(change => change.id === "pos-catalog-pill-unit-awareness-20261117");
    expect(update).toMatchObject({
      date: "2026-11-17",
      revision: 1,
      kind: "improvement",
      impact: "minor",
      area: "Kasir",
      href: "/pos",
      visual: "pos-catalog",
    });
    expect(update?.highlight.title.length).toBeLessThanOrEqual(40);
    expect(update?.highlight.summary.length).toBeLessThanOrEqual(85);
    expect(update?.steps).toHaveLength(3);
    expect(JSON.stringify(update)).toContain("SPANDUK");
    expect(JSON.stringify(update)).toContain("Satuan dipilih");
    expect(renderToStaticMarkup(<WhatsNewDialog entries={update ? [update] : []} onClose={() => {}} canAccess={() => true} />))
      .toContain("Filter POS lebih jelas");
  });

  it("illustrates category pills, printing subcategories, and the active unit label", () => {
    const html = renderToStaticMarkup(<ChangeIllustration visual={"pos-catalog" as ChangeEntry["visual"]} />);
    for (const label of ["Kategori produk", "ATK", "PERCETAKAN", "CETAK", "SPANDUK", "PLAT", "PRINT", "STEMPEL", "Satuan dipilih", "Rim"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('data-selected="true"');
  });

  it("illustrates RBAC using page, data, and action permissions", () => {
    const html = renderToStaticMarkup(<ChangeIllustration visual={"rbac" as ChangeEntry["visual"]} />);
    expect(html).toContain("Ilustrasi fitur");
    expect(html).toContain("Akses Riwayat");
    expect(html).toContain("Halaman");
    expect(html).toContain("Data");
    expect(html).toContain("Tindakan");
  });
  it("announces manual customer receivables with a concise three-step flow", () => {
    const manual = CHANGELOG.find(change => change.id === "customer-manual-receivables");
    expect(manual).toMatchObject({ date: "2026-10-20", revision: 1, href: "/customers", kind: "feature" });
    expect(manual?.steps).toHaveLength(3);
    expect(JSON.stringify(manual)).toContain("Tambah Piutang");
    expect(JSON.stringify(manual)).toContain("Bayar Piutang");
  });
  it("announces the collapsible Piutang Manual section as a minor improvement", () => {
    const receivables = CHANGELOG.find(change => change.id === "piutang-manual-toggle-20261115");
    expect(receivables).toMatchObject({
      date: "2026-11-15",
      revision: 1,
      title: "Lipat daftar Piutang Manual saat perlu.",
      kind: "improvement",
      impact: "minor",
      area: "Pelanggan",
      href: "/customers",
      visual: "manual-receivables",
    });
    expect(receivables?.steps).toHaveLength(3);
    expect(JSON.stringify(receivables)).toContain("browser yang sama");
  });
  it("announces choosing a new customer's type during checkout", () => {
    const checkout = CHANGELOG.find(change => change.id === "jenis-pelanggan-checkout-20261114");
    expect(checkout).toMatchObject({
      date: "2026-11-14",
      revision: 1,
      title: "Pilih jenis pelanggan baru saat checkout.",
      kind: "feature",
      impact: "major",
      area: "Kasir",
      href: "/pos",
      visual: "checkout-customer-type",
    });
    expect(checkout?.steps).toHaveLength(3);
    expect(JSON.stringify(checkout)).toContain("UMUM");
    expect(JSON.stringify(checkout)).toContain("PEMERINTAH");
  });
  it("illustrates collapsible receivables and checkout customer types", () => {
    const receivables = renderToStaticMarkup(<ChangeIllustration visual={"manual-receivables" as ChangeEntry["visual"]} />);
    const checkout = renderToStaticMarkup(<ChangeIllustration visual={"checkout-customer-type" as ChangeEntry["visual"]} />);
    expect(receivables).toContain("Piutang Manual");
    expect(receivables).toContain("Bagian terbuka");
    expect(receivables).toContain("Bagian tertutup");
    expect(checkout).toContain("Jenis pelanggan");
    expect(checkout).toContain("UMUM");
    expect(checkout).toContain("PEMERINTAH");
  });
  it("renders the new feature visuals in the weekly popup", () => {
    const entries = CHANGELOG.filter(change => ["piutang-manual-toggle-20261115", "jenis-pelanggan-checkout-20261114"].includes(change.id));
    const html = renderToStaticMarkup(<WhatsNewDialog entries={entries} onClose={() => {}} canAccess={() => true} />);
    expect(html).toContain("Tutup Piutang Manual saat perlu");
    expect(html).toContain("Jenis pelanggan saat checkout");
  });
  it("announces the Dashboard and report Piutang KPI with three usage steps", () => {
    const receivable = CHANGELOG.find(change => change.id === "kpi-piutang-dashboard-laporan");
    expect(receivable).toMatchObject({
      date: "2026-11-11",
      revision: 1,
      title: "Pantau Piutang di tiga tampilan laporan.",
      href: "/financial-report",
      kind: "improvement",
      area: "Laporan Keuangan",
    });
    expect(receivable?.steps).toHaveLength(3);
    expect(JSON.stringify(receivable)).toContain("sisa Tempo dan Piutang Manual");
    expect(JSON.stringify(receivable)).toContain("Outstanding DP");
  });
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

  it("shows every weekly highlight together with direct copy and no carousel or tutorial", () => {
    const html = renderToStaticMarkup(<WhatsNewDialog entries={[entry("satu", "2026-10-18"), entry("dua", "2026-10-17")]} onClose={() => {}} canAccess={() => true} />);
    expect(html).toContain("Inti satu");
    expect(html).toContain("Inti dua");
    expect(html).toContain("Manfaatnya langsung terlihat.");
    expect(html).not.toContain("Pembaruan berikutnya");
    expect(html).not.toContain("Alur penggunaan");
    expect(html).not.toContain("Ilustrasi fitur");
    expect(html).toContain("Sudah lihat");
  });

  it("keeps popup highlights readable without exposing restricted feature links", () => {
    const html = renderToStaticMarkup(<WhatsNewDialog entries={[entry("terbatas", "2026-10-18")]} onClose={() => {}} canAccess={() => false} />);
    expect(html).toContain("Inti terbatas");
    expect(html).not.toContain('href="/pos"');
    expect(html).toContain('href="/changelog"');
  });

  it("shows a compact release-date badge with the full date available", () => {
    const html = renderToStaticMarkup(<WhatsNewDialog entries={[entry("awal", "2026-01-01"), entry("akhir", "2025-12-31")]} onClose={() => {}} canAccess={() => true} />);
    expect(html).toContain('dateTime="2026-01-01"');
    expect(html).toContain('title="1 Januari 2026"');
    expect(html).toContain('>1 Jan</time>');
    expect(html).toContain('dateTime="2025-12-31"');
    expect(html).toContain('>31 Des</time>');
  });

  it("keeps manually written popup titles and summaries short", () => {
    for (const change of CHANGELOG) {
      expect(change.highlight).toEqual({ title: expect.any(String), summary: expect.any(String) });
      expect(change.highlight.title.length).toBeLessThanOrEqual(40);
      expect(change.highlight.summary.length).toBeLessThanOrEqual(85);
    }
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
