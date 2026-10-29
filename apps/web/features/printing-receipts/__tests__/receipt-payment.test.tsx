import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PaymentModal } from "@/components/PaymentModal";
import type { PrintingServiceCartItem } from "@/hooks/useCart";

const roleState = vi.hoisted(() => ({ role: "CASHIER" }));

vi.mock("@pos/ui", () => ({
  Modal: ({children}: {children:React.ReactNode}) => <section>{children}</section>,
  Button: ({children,loading:_loading,...props}: React.ComponentProps<"button"> & {loading?:boolean}) => <button {...props}>{children}</button>,
  Input: ({label,...props}: React.ComponentProps<"input"> & {label?:string}) => <label>{label}<input {...props}/></label>,
}));
vi.mock("@/hooks/useCustomers", () => ({useCreateCustomer: () => ({isPending:false,mutateAsync:vi.fn()})}));
vi.mock("@/components/providers/RoleProvider", () => ({useRole:()=>roleState}));
vi.mock("@/hooks/useSalespersons", () => ({useSalespersons:()=>({data:[]})}));
vi.mock("@/hooks/useCustomerCategoryPricingRules", () => ({useCustomerCategoryPricingRules:()=>({data:[]})}));
vi.mock("@/features/customer-category-pricing/hooks/useSpecialPricingSettings", () => ({useSpecialPricingSettings:()=>({data:false})}));
vi.mock("@/features/product-price-rounding/hooks/usePriceRoundingSettings", () => ({
  usePriceRoundingSettings: () => ({ data: { enabled: true, increment: 500, threshold: 50 } }),
}));
vi.mock("@/features/pos-checkout/components/CustomerCheckoutSelect", () => ({CustomerCheckoutSelect:()=>null}));
vi.mock("@/features/pos-checkout/hooks/useCartCatalogPrices", () => ({useCartCatalogPrices:(items:unknown)=>items}));
vi.mock("@/features/invoice-date/hooks/useServerClock", () => ({useServerClock:()=>({now:new Date("2026-10-20T03:00:00Z"),isLoading:false,source:"SERVER_FALLBACK",lastSyncedAt:null})}));

const item: PrintingServiceCartItem = {cartLineId:"manual-1",lineType:"PRINTING_SERVICE",printingServiceId:null,
  name:"Plat pesanan",price:50000,quantity:2,unit:"pcs",needsMaterial:false};

describe("pembayaran nota Percetakan", () => {
  it("shows the saved receipt date and backdate reason for an owner", () => {
    roleState.role = "OWNER";
    try {
      const html = renderToStaticMarkup(<PaymentModal open onClose={()=>{}} items={[item]} subtotal={100000} onConfirm={()=>{}} receiptInvoiceDate="2026-10-19" />);
      expect(html).toContain('value="2026-10-19"');
      expect(html).toContain("Tanggal mengikuti nota");
      expect(html).toContain("Alasan perubahan tanggal");
      expect(html).toMatch(/id="payment-invoice-date"[^>]*disabled=""/);
    } finally { roleState.role = "CASHIER"; }
  });
  it("menampilkan item manual dan pembayaran tanpa editor diskon baris yang tidak ada di nota", () => {
    const html=renderToStaticMarkup(<PaymentModal open onClose={()=>{}} items={[item]} subtotal={100000} onConfirm={()=>{}} allowItemDiscounts={false}/>);
    expect(html).toContain("Plat pesanan");
    expect(html).toContain("Konfirmasi Bayar");
    expect(html).not.toContain('aria-label="Diskon untuk');
    expect(html).not.toContain('aria-label="Pilih Plat pesanan untuk diskon"');
  });
  it("tetap menyediakan diskon baris untuk keranjang POS biasa", () => {
    const html=renderToStaticMarkup(<PaymentModal open onClose={()=>{}} items={[{...item,printingServiceId:"service-1"}]} subtotal={100000} onConfirm={()=>{}}/>);
    expect(html).toContain('aria-label="Diskon untuk Plat pesanan"');
  });
});
