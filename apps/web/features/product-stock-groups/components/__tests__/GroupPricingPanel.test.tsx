import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GroupPricingPanel } from "../GroupPricingPanel";
import { snowman } from "../../__tests__/pricing-ui-fixture";
describe("group pricing panel", () => {
  it("labels the source, exact legacy factor, computed HPP, and preview action", () => {
    const html = renderToStaticMarkup(<GroupPricingPanel detail={snowman} canUpdate onApplied={() => {}} />);
    expect(html).toContain("Sumber harga");
    expect(html).toContain("9/10");
    expect(html).toContain("HPP otomatis pak");
    expect(html).toContain('<output aria-label="HPP otomatis pak"');
    expect(html).toContain("Pratinjau harga");
    expect(html).not.toContain("Simpan harga pak");
  });
  it("separates persisted money from an uncalculated draft and explains the unit relationship", () => {
    const html = renderToStaticMarkup(<GroupPricingPanel detail={snowman} canUpdate onApplied={() => {}} />);
    expect(html).toContain('aria-label="Harga tersimpan"');
    expect(html).toContain("Belum dihitung");
    expect(html).toContain("1 pak = 12 pcs");
    expect(html).toContain("21.000");
    expect(html).not.toContain('aria-label="Pratinjau perubahan harga"');
  });
  it("names inactive affected members and offers source repair", () => {
    const detail = structuredClone(snowman);
    detail.pricing!.config.sourceProductId = "old";
    detail.pricingMembers = [{ id: "old", name: "Snowman edisi lama", unit: "dus", isActive: false, unitMultiplierToBase: 24, conversionNeedsReview: false }];
    detail.pricing!.members.push({ productId: "old", price: "60000", costPrice: null, review: { price: ["SOURCE_UNAVAILABLE"], costPrice: ["SOURCE_UNAVAILABLE"] } });
    const html = renderToStaticMarkup(<GroupPricingPanel detail={detail} canUpdate onApplied={() => {}} />);
    expect(html).toContain("Snowman edisi lama");
    expect(html).toContain("Pilih sumber aktif");
    expect(html).toContain("Tidak aktif");
  });
  it("keeps an inactive Manual unit read-only without labelling its saved price as automatic", () => {
    const detail = structuredClone(snowman);
    detail.pricingMembers = detail.variants.map(member => ({ ...member, isActive: member.id !== "pak" }));
    detail.pricing!.config.members.pak.mode = "MANUAL";
    const html = renderToStaticMarkup(<GroupPricingPanel detail={detail} canUpdate onApplied={() => {}} />);
    expect(html).toContain('<output aria-label="Harga jual pak"');
    expect(html).not.toContain('aria-label="Harga otomatis pak"');
    expect(html).toContain("Tidak aktif · hanya baca");
  });
});
