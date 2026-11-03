import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useActiveProductImportJob } from '@/features/product-import/hooks/useProductImport';
import { ProductImportProgressModal } from '@/features/product-import/components/ProductImportProgressModal';
import type { ProductImportJobResponse } from '@/features/product-import/hooks/useProductImport';
const mocks=vi.hoisted(()=>({query:vi.fn(),mutate:vi.fn()}));
vi.mock('@tanstack/react-query',()=>({useQuery:mocks.query,useMutation:()=>({mutateAsync:mocks.mutate}),useQueryClient:()=>({invalidateQueries:vi.fn()})}));
vi.mock('@pos/ui',()=>({Button:({children,...props}:React.ComponentProps<'button'>)=><button {...props}>{children}</button>,Modal:({children}:React.PropsWithChildren)=><div>{children}</div>}));
const noop=()=>{};
const baseJob={id:'job1',totalRows:10,processedRows:1,failedRows:0,successfulRows:1,status:'RUNNING',rows:[],createdAt:'2026-11-02',updatedAt:'2026-11-02'} as unknown as ProductImportJobResponse;
describe('Progres impor hanya membaca jika diizinkan',()=>{
 beforeEach(()=>vi.clearAllMocks());
 it('tidak polling job ketika izin baca progres ditolak',()=>{
  function Probe(){useActiveProductImportJob(false);return null;}
  renderToStaticMarkup(<Probe/>);
  expect(mocks.query).toHaveBeenCalledWith(expect.objectContaining({enabled:false}));
 });
 it('polling job ketika izin baca progres diberikan',()=>{
  function Probe(){useActiveProductImportJob(true);return null;}
  renderToStaticMarkup(<Probe/>);
  expect(mocks.query).toHaveBeenCalledWith(expect.objectContaining({enabled:true}));
 });
 it('pembaca progres tidak mendapat tombol batal',()=>{
  const html=renderToStaticMarkup(<ProductImportProgressModal open job={baseJob} canManage={false} isRefreshing={false} onRefresh={async()=>{}} onClose={noop}/>);
  expect(html).not.toContain('Batalkan');
 });
 it('pembaca progres tidak mendapat tombol coba ulang',()=>{
  const html=renderToStaticMarkup(<ProductImportProgressModal open job={{...baseJob,status:'FAILED'}} canManage={false} isRefreshing={false} onRefresh={async()=>{}} onClose={noop}/>);
  expect(html).not.toContain('Coba Lagi');
 });
 it('pengelola impor mendapat tombol batal',()=>{
  const html=renderToStaticMarkup(<ProductImportProgressModal open job={baseJob} canManage isRefreshing={false} onRefresh={async()=>{}} onClose={noop}/>);
  expect(html).toContain('Batalkan');
 });
});
