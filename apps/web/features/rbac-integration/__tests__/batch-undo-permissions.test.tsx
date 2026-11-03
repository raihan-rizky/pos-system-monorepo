import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/batch-operations/[id]/undo/route';
import { BatchResultPanel } from '@/features/batch-operations/components/BatchResultPanel';
const mocks=vi.hoisted(()=>({permission:vi.fn(),role:vi.fn(),find:vi.fn(),canPerform:vi.fn(),denied:new Error('denied')}));
vi.mock('@/lib/rbac/guard',()=>({requirePermission:mocks.permission,requireRole:mocks.role,handleAuthError:(error:unknown)=>error===mocks.denied?new Response(null,{status:403}):null}));
vi.mock('@pos/db',()=>({Prisma:{},db:{$transaction:async(callback:(tx:unknown)=>unknown)=>callback({$queryRaw:vi.fn(),batchOperation:{findFirst:mocks.find}})}}));
vi.mock('@/components/providers/RoleProvider',()=>({useRole:()=>({canPerform:mocks.canPerform})}));
vi.mock('@/features/batch-operations/hooks/useUndoBatchOperation',()=>({useUndoBatchOperation:()=>({isPending:false,mutate:vi.fn()})}));
describe('Undo mengikuti izin jenis batch tersimpan',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.role.mockResolvedValue({id:'u1',storeId:'s1',role:'ADMIN'});mocks.permission.mockRejectedValue(mocks.denied);mocks.canPerform.mockReturnValue(false);});
 it.each([['PRODUCT_IMPORT','product.import','create'],['BULK_STOCK_ADJUSTMENT','inventory.bulk','update'],['BULK_STOCK_GROUP_ADJUSTMENT','inventory.bulk','update'],['INBOUND_RECEIPT','inventory','update']])('%s memerlukan %s.%s',async(type,resource,action)=>{
  mocks.find.mockResolvedValue({id:'b1',type,status:'COMPLETED',items:[]});
  const response=await POST(new Request('http://localhost/api/batch-operations/b1/undo',{method:'POST'}),{params:Promise.resolve({id:'b1'})});
  expect(response.status).toBe(403);
  expect(mocks.permission).toHaveBeenCalledExactlyOnceWith(resource,action);
 });
 it('grant impor bisa memeriksa ulang undo tanpa grant stok umum',async()=>{
  mocks.find.mockResolvedValue({id:'b1',type:'PRODUCT_IMPORT',status:'UNDONE',items:[]});
  mocks.permission.mockImplementation(async(resource)=>{if(resource!=='product.import')throw mocks.denied;return {id:'u1',storeId:'s1',role:'ADMIN'};});
  const response=await POST(new Request('http://localhost/api/batch-operations/b1/undo',{method:'POST'}),{params:Promise.resolve({id:'b1'})});
  expect(response.status).toBe(409);
 });
 it('ringkasan hasil tetap tampil tanpa tombol undo ketika grant ditolak',()=>{
  const html=renderToStaticMarkup(<BatchResultPanel batchOperationId="b1" undoPermission={{resource:'product.import',action:'create'}} summary={[{label:'Selesai',value:10}]}/>);
  expect(html).toContain('Selesai');expect(html).not.toContain('Undo Batch');
 });
 it('grant impor menampilkan tombol undo tanpa izin stok umum',()=>{
  mocks.canPerform.mockImplementation(resource=>resource==='product.import');
  const html=renderToStaticMarkup(<BatchResultPanel batchOperationId="b1" undoPermission={{resource:'product.import',action:'create'}} summary={[]}/>);
  expect(html).toContain('Undo Batch');
 });
});
