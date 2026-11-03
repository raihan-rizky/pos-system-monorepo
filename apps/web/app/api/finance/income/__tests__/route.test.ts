import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../route';
import { PATCH, DELETE } from '../[id]/route';

const mocks=vi.hoisted(()=>({ guard:vi.fn(), findMany:vi.fn(), count:vi.fn(), create:vi.fn(), findFirst:vi.fn(), update:vi.fn() }));
vi.mock('@/lib/rbac/guard',()=>({requirePermission:mocks.guard,handleAuthError:(error:unknown)=>error instanceof Error && error.message==='denied'?new Response(null,{status:403}):null}));
vi.mock('@pos/db',()=>({db:{manualIncome:{findMany:mocks.findMany,count:mocks.count,create:mocks.create,findFirst:mocks.findFirst,update:mocks.update}}}));
const data={description:'Tambahan ATK',category:'ATK',amount:100000,occurredAt:'2026-11-02'};
const row={...data,id:'income-1',storeId:'store-1',recordedById:'user-1',occurredAt:new Date('2026-11-01T17:00:00Z'),createdAt:new Date(),updatedAt:new Date(),deletedAt:null,recordedBy:{id:'user-1',name:'Pengguna contoh'}};
const request=(method:string,payload:unknown=data)=>new Request('http://localhost/api/finance/income',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
const context={params:Promise.resolve({id:'income-1'})};

describe('CRUD pemasukan tanpa transaksi',()=>{
  beforeEach(()=>{vi.clearAllMocks(); mocks.guard.mockResolvedValue({id:'user-1',storeId:'store-1'});mocks.findMany.mockResolvedValue([row]);mocks.count.mockResolvedValue(1);mocks.create.mockResolvedValue(row);mocks.findFirst.mockResolvedValue(row);mocks.update.mockResolvedValue(row);});
  it('menyimpan toko/pencatat sesi dan tanggal WIB',async()=>{
    const response=await POST(request('POST',{...data,storeId:'toko-lain',recordedById:'orang-lain'}));
    expect(response.status).toBe(201);
    expect(mocks.guard).toHaveBeenCalledWith("income.manual", "create");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({...data,storeId:'store-1',recordedById:'user-1',occurredAt:new Date('2026-11-01T17:00:00Z')})}));
  });
  it('membatasi daftar pada toko, bulan, dan catatan aktif dengan pagination',async()=>{
    const response=await GET(new Request('http://localhost/api/finance/income?month=2026-11&page=2&limit=10'));
    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:'store-1',deletedAt:null,occurredAt:{gte:new Date('2026-10-31T17:00:00Z'),lt:new Date('2026-11-30T17:00:00Z')}},skip:10,take:10}));
    expect((await response.json()).pagination.total).toBe(1);
  });
  it('menolak kategori/tanggal/nominal invalid dan JSON rusak',async()=>{
    expect((await POST(request('POST',{...data,category:'PLAT',amount:0}))).status).toBe(422);
    expect((await GET(new Request('http://localhost/api/finance/income?month=2026-13'))).status).toBe(422);
    expect((await POST(new Request('http://localhost',{method:'POST',body:'{'}))).status).toBe(422);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('mengoreksi hanya catatan aktif milik toko sesi',async()=>{
    expect((await PATCH(request('PATCH',{...data,category:'CETAK',amount:80000}),context)).status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{id:'income-1',storeId:'store-1',deletedAt:null}}));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:'income-1',storeId:'store-1',deletedAt:null}),data:expect.objectContaining({category:'CETAK',amount:80000})}));
  });
  it('menghapus lunak dan menolak record yang tidak tersedia',async()=>{
    expect((await DELETE(new Request('http://localhost',{method:'DELETE'}),context)).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({data:{deletedAt:expect.any(Date)}}));
    mocks.findFirst.mockResolvedValue(null);
    expect((await PATCH(request('PATCH'),context)).status).toBe(404);
    expect((await DELETE(new Request('http://localhost'),context)).status).toBe(404);
  });
  it('menolak pengguna tanpa toko dan tanpa izin',async()=>{
    mocks.guard.mockResolvedValue({id:'user-1',storeId:null});
    expect((await POST(request('POST'))).status).toBe(403);
    mocks.guard.mockRejectedValue(new Error('denied'));
    expect((await GET(new Request('http://localhost'))).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
