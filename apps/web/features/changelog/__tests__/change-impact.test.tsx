import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ChangeEntry } from "../types";
import { CHANGELOG } from "../data/changelog";
import { ChangeCard } from "../components/ChangeCard";
import { WhatsNewDialog } from "../components/WhatsNewDialog";

const entry: ChangeEntry = {
  id: "contoh", date: "2026-11-06", revision: 1,
  title: "Contoh pembaruan", summary: "Manfaat pembaruan.",
  highlight: { title: "Contoh pembaruan", summary: "Manfaat pembaruan." },
  kind: "improvement", area: "Kasir", href: "/pos", visual: "units",
  steps: [{ title: "Buka", detail: "Buka Kasir" }, { title: "Pilih", detail: "Pilih produk" }, { title: "Lanjutkan", detail: "Lanjutkan transaksi" }],
};

describe("pembedaan jenis dan dampak catatan perubahan", () => {
  it("shows the size and type of a major feature in the weekly popup", () => {
    const major = { ...entry, kind: "feature" as const, impact: "major" as const };
    const html = renderToStaticMarkup(<WhatsNewDialog entries={[major]} onClose={() => {}} canAccess={() => true} />);

    expect(html).toContain("Pembaruan besar");
    expect(html).toContain("Fitur baru");
    expect(html).toContain('href="/pos"');
  });

  it("shows a bug fix independently of its impact", () => {
    const majorFix = { ...entry, kind: "fix" as const, impact: "major" as const };
    const html = renderToStaticMarkup(<WhatsNewDialog entries={[majorFix]} onClose={() => {}} canAccess={() => false} />);

    expect(html).toContain("Pembaruan besar");
    expect(html).toContain("Perbaikan bug");
    expect(html).not.toContain('href="/pos"');
  });

  it("uses a minor impact for existing entries without an explicit size", () => {
    const html = renderToStaticMarkup(<WhatsNewDialog entries={[entry]} onClose={() => {}} canAccess={() => true} />);

    expect(html).toContain("Pembaruan kecil");
    expect(html).toContain("Peningkatan");
  });

  it("uses the same labels in the full archive", () => {
    const minorFix = { ...entry, kind: "fix" as const, impact: "minor" as const };
    const html = renderToStaticMarkup(<ChangeCard entry={minorFix} />);

    expect(html).toContain("Pembaruan kecil");
    expect(html).toContain("Perbaikan bug");
  });

  it("records the improved changelog and identifies an existing major update", () => {
    expect(CHANGELOG.find(change => change.id === "changelog-update-categories")).toMatchObject({
      date: "2026-11-06", revision: 1, href: "/changelog", kind: "improvement",
      screenshot: { src: "/images/changelog/kategori-pembaruan-2026-11-06.png", alt: expect.any(String) },
    });
    expect(CHANGELOG.find(change => change.id === "surat-jalan-inline-receipt")).toMatchObject({ impact: "major" });
  });
});
