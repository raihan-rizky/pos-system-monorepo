import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/finance/expenses/route';
import { PATCH, DELETE } from '@/app/api/finance/expenses/[id]/route';
const mocks=vi.hoisted(()=>({permission:vi.fn(),role:vi.fn(),find:vi.fn(),create:vi.fn(),update:vi.fn(),query:vi.fn(),attemptUpdate:vi.fn(),denied:new Error('denied')}));
vi.mock('@/lib/rbac/guard',()=>({requirePermission:mocks.permission,requireRole:mocks.role,canAuthenticatedUserAccessPage:async()=>true,authorizeInTransaction:async()=>true,handleAuthError:(error:unknown)=>error===mocks.denied?new Response(null,{status:403}):null}));
vi.mock('@/features/keuangan/services/manual-transfer-allocation-service',()=>({linkTransferAllocations:async()=>undefined}));
vi.mock('@pos/db',()=>({db:{expense:{findFirst:mocks.find,create:mocks.create,update:mocks.update},$transaction:async(callback:(tx:unknown)=>Promise<unknown>)=>callback({expense:{findFirst:mocks.find,create:mocks.create,update:mocks.update},$executeRaw:async()=>1,$queryRaw:mocks.query,manualTransferAttempt:{updateMany:mocks.attemptUpdate},manualTransferAllocation:{findMany:async()=>[]}})}}));
const user={id:'u-1',storeId:'store-1',role:'CASHIER'};
const body={applicantName:'Staf',description:'Belanja kertas',amount:10000,occurredAt:'2026-11-02',updatedAt:'2026-11-03T00:00:00.000Z',manualPurchasePaymentMethod:'TRANSFER',reportCategory:'ATK'};
const row={...body,id:'e-1',changeAmount:0,deletedAt:null,shoppingRequestId:null,goodsPurchaseId:null,backdatedPurchaseDueId:null,backdatedPurchasePaymentId:null,customCategoryId:null};
const context={params:Promise.resolve({id:'e-1'})};
const request=(method:string,data:unknown=body)=>new Request('http://localhost/api/finance/expenses/e-1',{method,headers:{'Idempotency-Key':'c6fd6e10-f915-4dcc-830a-a169f13c4b22'},body:method==='DELETE'?undefined:JSON.stringify(data)});
describe('Belanja transfer memakai izin khusus sesuai sumber tersimpan',()=>{
  beforeEach(()=>{vi.resetAllMocks();mocks.role.mockResolvedValue(user);mocks.permission.mockImplementation(async(resource)=>{if(!['expense.manual_transfer','expense.manual_transfer.edit'].includes(resource))throw mocks.denied;return user;});mocks.find.mockResolvedValue(row);mocks.create.mockResolvedValue(row);mocks.update.mockResolvedValue(row);mocks.query.mockImplementation(async(parts:TemplateStringsArray)=>parts.join('').includes('pos_manual_transfer_attempts')?[{id:'c6fd6e10-f915-4dcc-830a-a169f13c4b22',body:JSON.stringify(body)}]:[{id:'e-1',updatedAt:new Date('2026-11-03T00:00:00Z')}]);mocks.attemptUpdate.mockResolvedValue({count:1});});
  it('membuat transfer dengan grant khusus tanpa grant pengeluaran umum',async()=>{
    mocks.find.mockResolvedValueOnce(null);
    expect((await POST(request('POST'))).status).toBe(201);
    expect(mocks.permission).toHaveBeenCalledWith('expense.manual_transfer','create');
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({storeId:'store-1',manualPurchasePaymentMethod:'TRANSFER'})}));
  });
  it.each([false,true])('mengonfirmasi transfer tersimpan saat percobaan di tab lain %s',async(attemptReregistered)=>{
    mocks.find.mockResolvedValueOnce(null);
    expect((await POST(request('POST'))).status).toBe(201);
    const savedData=mocks.create.mock.calls[0][0].data;
    mocks.find.mockResolvedValue({...row,...savedData,createdAt:new Date('2026-11-03T00:00:00Z')});
    mocks.query.mockResolvedValue(attemptReregistered?[{id:'c6fd6e10-f915-4dcc-830a-a169f13c4b22',body:JSON.stringify(body)}]:[]);
    mocks.attemptUpdate.mockClear();
    const response=await POST(request('POST'));
    expect(response.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.attemptUpdate).toHaveBeenCalledTimes(attemptReregistered?1:0);
  });
  it('menolak kunci transfer lama yang didaftarkan ulang dengan data berbeda',async()=>{
    mocks.find.mockResolvedValueOnce(null);
    expect((await POST(request('POST'))).status).toBe(201);
    mocks.find.mockResolvedValue({...row,...mocks.create.mock.calls[0][0].data,createdAt:new Date('2026-11-03T00:00:00Z')});
    const changed={...body,amount:20000};
    mocks.query.mockResolvedValue([{id:'c6fd6e10-f915-4dcc-830a-a169f13c4b22',body:JSON.stringify(changed)}]);
    expect((await POST(request('POST',changed))).status).toBe(409);
    expect(mocks.create).toHaveBeenCalledOnce();
  });
  it('mengubah transfer berdasarkan sumber tersimpan tanpa penanda dari request',async()=>{
    mocks.permission.mockResolvedValue(user);
    const {manualPurchasePaymentMethod: _type,...payload}=body;
    expect((await PATCH(request('PATCH',payload),context)).status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith('expense.manual_transfer','update');
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({where:{id:'e-1',storeId:'store-1'}}));
  });
  it('menolak koreksi transfer tanpa izin melihat pengeluaran',async()=>{
    const response=await PATCH(request('PATCH'),context);
    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
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
  it.each([
    ['PATCH', 'expense.manual_transfer'], ['PATCH', 'expense.manual_transfer.edit'],
    ['PATCH', 'expense'], ['PATCH', 'expense.manual_transfer.allocation'],
    ['PATCH', 'expense.payable'], ['DELETE', 'expense.manual_transfer'],
  ])('menolak %s saat identitas berubah pada izin %s',async(method,changedResource)=>{
    mocks.permission.mockImplementation(async(resource)=>resource===changedResource?{...user,storeId:'store-other'}:user);
    const response=method==='PATCH'?await PATCH(request(method,{...body,allocations:[{payableId:'p-1',paymentId:null,amount:100}]}),context):await DELETE(request(method),context);
    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(['POST','PATCH','DELETE'])('menolak %s jika peran berubah saat izin transfer diperiksa',async(method)=>{
    mocks.permission.mockResolvedValue({...user,role:'ADMIN'});
    const response=method==='POST'?await POST(request(method)):method==='PATCH'?await PATCH(request(method),context):await DELETE(request(method),context);
    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
