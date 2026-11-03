import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/finance/expenses/route';
import { PATCH, DELETE } from '@/app/api/finance/expenses/[id]/route';
const mocks=vi.hoisted(()=>({permission:vi.fn(),role:vi.fn(),find:vi.fn(),create:vi.fn(),update:vi.fn(),denied:new Error('denied')}));
vi.mock('@/lib/rbac/guard',()=>({requirePermission:mocks.permission,requireRole:mocks.role,handleAuthError:(error:unknown)=>error===mocks.denied?new Response(null,{status:403}):null}));
vi.mock('@pos/db',()=>({db:{expense:{findFirst:mocks.find,create:mocks.create,update:mocks.update}}}));
const user={id:'u-1',storeId:'store-1',role:'CASHIER'};
const body={applicantName:'Staf',description:'Belanja kertas',amount:10000,occurredAt:'2026-11-02',manualPurchasePaymentMethod:'TRANSFER'};
const row={...body,id:'e-1',changeAmount:0,deletedAt:null,shoppingRequestId:null,goodsPurchaseId:null,backdatedPurchaseDueId:null,backdatedPurchasePaymentId:null,customCategoryId:null};
const context={params:Promise.resolve({id:'e-1'})};
const request=(method:string,data:unknown=body)=>new Request('http://localhost/api/finance/expenses/e-1',{method,body:method==='DELETE'?undefined:JSON.stringify(data)});
describe('Belanja transfer memakai izin khusus sesuai sumber tersimpan',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.role.mockResolvedValue(user);mocks.permission.mockImplementation(async(resource)=>{if(resource!=='expense.manual_transfer')throw mocks.denied;return user;});mocks.find.mockResolvedValue(row);mocks.create.mockResolvedValue(row);mocks.update.mockResolvedValue(row);});
  it('membuat transfer dengan grant khusus tanpa grant pengeluaran umum',async()=>{
    expect((await POST(request('POST'))).status).toBe(201);
    expect(mocks.permission).toHaveBeenCalledWith('expense.manual_transfer','create');
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({storeId:'store-1',manualPurchasePaymentMethod:'TRANSFER'})}));
  });
  it('mengubah transfer berdasarkan sumber tersimpan tanpa penanda dari request',async()=>{
    const {manualPurchasePaymentMethod: _type,...payload}=body;
    expect((await PATCH(request('PATCH',payload),context)).status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith('expense.manual_transfer','update');
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({where:{id:'e-1',storeId:'store-1'}}));
  });
  it('menghapus transfer dengan grant khusus',async()=>{
    expect((await DELETE(request('DELETE'),context)).status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith('expense.manual_transfer','delete');
  });
  it('menolak pengeluaran biasa meski request mengaku transfer',async()=>{
    mocks.find.mockResolvedValue({...row,manualPurchasePaymentMethod:null});
    expect((await PATCH(request('PATCH'),context)).status).toBe(403);
    expect(mocks.permission).toHaveBeenCalledWith('expense','update');
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(['PATCH','DELETE'])('penolakan eksplisit transfer mengalahkan grant umum untuk %s',async(method)=>{
    mocks.permission.mockImplementation(async(resource)=>{if(resource==='expense.manual_transfer')throw mocks.denied;return user;});
    const response=method==='PATCH'?await PATCH(request(method),context):await DELETE(request(method),context);
    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
