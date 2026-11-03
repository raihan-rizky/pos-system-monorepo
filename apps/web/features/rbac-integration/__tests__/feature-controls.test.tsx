import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CartSidebar } from '@/components/CartSidebar';
import { ReportExportMenu } from '@/features/financial-report/components/ReportExportMenu';
import { getProofUploadPolicy } from '@/features/proof-upload/helpers/proof-upload-core';
const permission=vi.hoisted(()=>vi.fn());
vi.mock('@/components/providers/RoleProvider',()=>({useRole:()=>({canPerform:permission})}));
const item={cartLineId:'p-1',lineType:'PRODUCT' as const,productId:'p-1',name:'Kertas',price:1000,catalogPrice:1000,quantity:1,unit:'pcs',stock:10,categoryId:'cat-1',categoryName:'Kertas'};
const noop=()=>{};
function cart(master:boolean,price:boolean){
  return renderToStaticMarkup(<CartSidebar items={[item]} subtotal={1000} totalItems={1}
    canQuickEdit={master} canEditPrice={price} onEditProduct={noop} onEditPrice={noop}
    onUpdateQuantity={noop} onRemoveItem={noop} onClearCart={noop} onCheckout={noop}/>);
}
describe('Kontrol fitur mengikuti izin khusus',()=>{
  beforeEach(()=>permission.mockReset());
  it('membolehkan harga nota tanpa edit master produk',()=>{
    const html=cart(false,true);
    expect(html).toContain('aria-label="Ubah harga produk Kertas"');
    expect(html).not.toContain('aria-label="Ubah produk Kertas"');
  });
  it('menyembunyikan harga nota meski edit master produk aktif',()=>{
    const html=cart(true,false);
    expect(html).not.toContain('aria-label="Ubah harga produk Kertas"');
    expect(html).toContain('aria-label="Ubah produk Kertas"');
  });
  it('menyembunyikan unduh saat izin ekspor tidak diberikan',()=>{
    permission.mockImplementation((resource,action)=>resource==='financial-report'&&action==='read');
    expect(renderToStaticMarkup(<ReportExportMenu/>)).toBe('');
  });
  it('menampilkan unduh dengan izin ekspor',()=>{
    permission.mockImplementation((resource,action)=>resource==='financial-report.export'&&action==='read');
    expect(renderToStaticMarkup(<ReportExportMenu/>)).toContain('Unduh');
  });
  it.each([['manual-transfer','create'],['manual-transfer-edit','update']])('bukti %s memakai izin belanja transfer', (context,action)=>{
    expect(getProofUploadPolicy(context)).toMatchObject({resource:'expense.manual_transfer',action,prefix:'proofs/manual-transfers'});
  });
});
