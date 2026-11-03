import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManualIncomePanel } from '@/features/keuangan/components/ManualIncomePanel';
import { SupplierPayablesPanel } from '@/features/keuangan/components/SupplierPayablesPanel';
const mocks=vi.hoisted(()=>({permission:vi.fn(),query:vi.fn(),client:{invalidateQueries:vi.fn()}}));
vi.mock('@/components/providers/RoleProvider',()=>({useRole:()=>({canPerform:mocks.permission,userId:'u-1',storeId:'s-1',authorizationFingerprint:'v1'})}));
vi.mock('@tanstack/react-query',()=>({useQuery:(options:unknown)=>{mocks.query(options);return {data:{items:[{id:'p1',supplierName:'Rahasia hutang',amount:100,paid:0,debtDate:'2026-11-01'}],data:[{id:'i1',description:'Rahasia pemasukan',amount:100,occurredAt:'2026-11-02',category:'ATK'}],pagination:{totalPages:1}},isLoading:false};},useQueryClient:()=>mocks.client}));
vi.mock('@/features/ai-assistant/hooks/useAssistantModalAction',()=>({useAssistantModalAction:vi.fn()}));
vi.mock('@/features/keuangan/components/GiroPanel',()=>({GiroPanel:({canUpdate}:{canUpdate:boolean})=><div data-giro-update={canUpdate}>Daftar giro</div>}));
describe('Izin panel keuangan terpisah',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.permission.mockReturnValue(false);});
 it('menyembunyikan pemasukan manual meski izin pemasukan umum ada',()=>{
  mocks.permission.mockImplementation(resource=>resource==='income');
  expect(renderToStaticMarkup(<ManualIncomePanel month="2026-11"/>)).toBe('');
  expect(mocks.query).toHaveBeenCalledWith(expect.objectContaining({enabled:false}));
 });
 it('menampilkan tambah pemasukan khusus tanpa izin pemasukan umum',()=>{
  mocks.permission.mockImplementation((resource,action)=>resource==='income.manual'&&action==='create');
  const html=renderToStaticMarkup(<ManualIncomePanel month="2026-11"/>);
  expect(html).toContain('Tambah Pemasukan');
  expect(html).not.toContain('Rahasia pemasukan');
 });
 it('menampilkan giro tanpa membaca daftar hutang',()=>{
  const html=renderToStaticMarkup(<SupplierPayablesPanel canRead={false} canCreate={false} canUpdate={false} canReadGiro canUpdateGiro/>);
  expect(html).toContain('Daftar giro');
  expect(html).not.toContain('Rahasia hutang');
  expect(html).toContain('data-giro-update="true"');
  expect(mocks.query).toHaveBeenCalledWith(expect.objectContaining({enabled:false}));
 });
 it('izin ubah hutang tidak menampilkan giro bila baca giro ditolak',()=>{
  const html=renderToStaticMarkup(<SupplierPayablesPanel canRead canCreate={false} canUpdate canReadGiro={false} canUpdateGiro={false}/>);
  expect(html).toContain('Rahasia hutang');
  expect(html).not.toContain('Daftar giro');
 });
});
