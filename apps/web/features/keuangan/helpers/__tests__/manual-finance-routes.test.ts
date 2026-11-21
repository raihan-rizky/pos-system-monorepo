import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST,GET as expensesGET } from '@/app/api/finance/expenses/route';
import { PATCH, DELETE } from '@/app/api/finance/expenses/[id]/route';
import { GET as incomeSummary } from '@/app/api/finance/income/summary/route';
import { GET as expenseSummary } from '@/app/api/finance/expenses/summary/route';
vi.mock('@/features/financial-report/services/monthly-report',()=>({getMonthlyFinancialReport:async()=>({income:[],expenses:[],purchaseExpenses:[{date:'2026-11-02',amount:25000,purchase:{method:'TRANSFER'}}]})}));

const mocks=vi.hoisted(()=>({expenseCreate:vi.fn(),expenseUpdate:vi.fn(),expenseFind:vi.fn(),findReplay:vi.fn(),expenseList:vi.fn(),expenseCount:vi.fn(),transaction:vi.fn(),manual:vi.fn(),permission:vi.fn(),page:vi.fn(),transactionScope:vi.fn(),link:vi.fn(),lock:vi.fn(),findAllocations:vi.fn(),findAttempt:vi.fn(),updateAttempt:vi.fn(),recognized:vi.fn()}));
vi.mock('@/lib/rbac/guard',()=>({requireRole:async()=>({id:'user-1',storeId:'store-1'}),requirePermission:mocks.permission,canAuthenticatedUserAccessPage:mocks.page,authorizeInTransaction:async()=>true,handleAuthError:(error:unknown)=>error instanceof Error && error.message==='forbidden' ? new Response(null,{status:403}) : null}));
vi.mock('@pos/db',()=>({db:{expense:{create:mocks.expenseCreate,update:mocks.expenseUpdate,findFirst:mocks.expenseFind,findMany:mocks.expenseList,count:mocks.expenseCount},transaction:{findMany:mocks.transaction},manualIncome:{findMany:mocks.manual},customerReceivable:{findMany:async()=>[]},$transaction:mocks.transactionScope}}));
vi.mock('@/features/keuangan/services/manual-transfer-allocation-service',()=>({linkTransferAllocations:mocks.link}));
vi.mock('@/features/keuangan/services/recognized-finance',()=>({loadRecognizedExpenses:mocks.recognized}));
const payload={applicantName:'Pemasok contoh',description:'Belanja kertas',category:'SUPPLIES',reportCategory:'ATK',amount:25000,changeAmount:0,occurredAt:'2026-11-02',updatedAt:'2026-11-03T00:00:00.000Z',manualPurchasePaymentMethod:'TRANSFER'};
const expense={...payload,id:'expense-1',storeId:'store-1',occurredAt:new Date('2026-11-01T17:00:00Z'),createdAt:new Date(),updatedAt:new Date('2026-11-03T00:00:00Z'),deletedAt:null,recordedBy:{id:'user-1',name:'Contoh'},goodsPurchase:null,shoppingRequest:null};
const req=(method:string,data:unknown=payload)=>new Request('http://localhost',{method,headers:{'Idempotency-Key':'c6fd6e10-f915-4dcc-830a-a169f13c4b22'},body:JSON.stringify(data)});

describe('belanja transfer dan ringkasan pemasukan manual',()=>{
  beforeEach(()=>{vi.resetAllMocks();mocks.permission.mockResolvedValue({id:'user-1',storeId:'store-1'});mocks.page.mockResolvedValue(true);mocks.expenseCreate.mockResolvedValue(expense);mocks.expenseUpdate.mockResolvedValue(expense);mocks.expenseFind.mockResolvedValue(expense);mocks.findReplay.mockResolvedValue(null);mocks.expenseList.mockResolvedValue([expense]);mocks.expenseCount.mockResolvedValue(1);mocks.lock.mockImplementation(async (parts:TemplateStringsArray)=>parts.join('').includes('pos_manual_transfer_attempts') ? mocks.findAttempt() : [{id:'expense-1',updatedAt:expense.updatedAt}]);mocks.findAllocations.mockResolvedValue([]);mocks.findAttempt.mockResolvedValue([{id:'c6fd6e10-f915-4dcc-830a-a169f13c4b22',body:JSON.stringify(payload)}]);mocks.updateAttempt.mockResolvedValue({count:1});mocks.transactionScope.mockImplementation(async callback=>callback({expense:{create:mocks.expenseCreate,update:mocks.expenseUpdate,findFirst:mocks.findReplay},$executeRaw:async()=>1,$queryRaw:mocks.lock,manualTransferAllocation:{findMany:mocks.findAllocations},manualTransferAttempt:{updateMany:mocks.updateAttempt}}));mocks.link.mockResolvedValue({allocated:20000,remaining:5000});mocks.transaction.mockResolvedValue([{id:'tx-1',createdAt:new Date('2026-11-01T17:00:00Z'),status:'COMPLETED',total:50000,amountPaid:50000,change:0,paymentMethod:'CASH',transactionCategory:'ATK',items:[],payments:[{id:'p1',method:'CASH',amount:50000,createdAt:new Date('2026-11-01T17:00:00Z')}],debtPaymentLogs:[]}]);mocks.manual.mockResolvedValue([{id:'income-1',occurredAt:new Date('2026-11-01T17:00:00Z'),category:'ATK',amount:100000}]);});
  beforeEach(()=>{mocks.recognized.mockResolvedValue({monthlyTotal:25000,incomplete:false,entryCount:1,
    daily:[{date:'2026-11-02',total:25000,byCategory:{'report:ATK':25000}}],byCategory:[{category:'report:ATK',total:25000}],
    components:{manual:0,transfer:25000,giroPayment:0,giroDue:0,overpayment:0,manualPayable:0},
    rows:[{...expense,source:{type:'MANUAL_TRANSFER_PURCHASE'}}]});});
  it('menyimpan satu Expense dengan metode transfer',async()=>{
    expect((await POST(req('POST'))).status).toBe(201);
    expect(mocks.expenseCreate).toHaveBeenCalledTimes(1);
    expect(mocks.expenseCreate).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({manualPurchasePaymentMethod:'TRANSFER',changeAmount:0,transactionId:null})}));
  });
  it.each([
    'https://pub-example.r2.dev/proofs/manual-transfers/store-other/abc.webp',
    'https://pub-example.r2.dev/proofs/transactions/store-1/abc.webp',
  ])('menolak lampiran transfer di luar ruang bukti toko: %s',async(attachmentUrl)=>{
    const changed={...payload,attachmentUrl};
    mocks.findAttempt.mockResolvedValueOnce([{id:'c6fd6e10-f915-4dcc-830a-a169f13c4b22',body:JSON.stringify(changed)}]);
    expect((await POST(req('POST',changed))).status).toBe(422);
    expect(mocks.expenseCreate).not.toHaveBeenCalled();
  });
  it('menyimpan dan mengembalikan kategori laporan transfer',async()=>{
    expect((await POST(req('POST'))).status).toBe(201);
    expect(mocks.expenseCreate).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({reportCategory:'ATK'})}));
    const list=await (await expensesGET(new Request('http://localhost?month=2026-11'))).json();
    expect(list.data[0].reportCategory).toBe('ATK');
  });
  it('mencatat transfer dan pembayaran beberapa hutang dalam satu transaksi',async()=>{
    const allocations=[{payableId:'debt-1',paymentId:'payment-1',amount:10000},{payableId:'debt-2',paymentId:null,amount:10000}];
    mocks.findAttempt.mockResolvedValueOnce([{id:'c6fd6e10-f915-4dcc-830a-a169f13c4b22',body:JSON.stringify({...payload,allocations})}]);
    expect((await POST(req('POST',{...payload,allocations}))).status).toBe(201);
    expect(mocks.transactionScope).toHaveBeenCalledOnce();
    expect(mocks.permission).toHaveBeenCalledWith('expense.manual_transfer.allocation','update');
    expect(mocks.permission).toHaveBeenCalledWith('expense.payable','read');
    expect(mocks.permission).toHaveBeenCalledWith('expense.payable','update');
    expect(mocks.link).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({storeId:'store-1',expenseId:'expense-1',actorId:'user-1'}),allocations);
  });
  it('mengembalikan transfer yang sama saat permintaan yang responsnya hilang dikirim ulang',async()=>{
    const allocations=[{payableId:'debt-1',paymentId:null,amount:10000}];
    mocks.findAttempt.mockResolvedValue([{id:'c6fd6e10-f915-4dcc-830a-a169f13c4b22',body:JSON.stringify({...payload,allocations})}]);
    expect((await POST(req('POST',{...payload,allocations}))).status).toBe(201);
    const saved = mocks.expenseCreate.mock.calls[0][0].data;
    mocks.expenseCreate.mockRejectedValueOnce({code:'P2002'});
    mocks.findReplay.mockResolvedValueOnce(null).mockResolvedValueOnce({...expense,id:saved.id,manualTransferFingerprint:saved.manualTransferFingerprint});
    const retry = await POST(req('POST',{...payload,allocations}));
    expect(retry.status).toBe(200);
    expect((await retry.json()).data.id).toBe(saved.id);
    expect(mocks.link).toHaveBeenCalledTimes(1);
  });
  it('menolak kunci yang hilang atau dipakai ulang dengan data transfer berbeda',async()=>{
    expect((await POST(new Request('http://localhost',{method:'POST',body:JSON.stringify(payload)}))).status).toBe(422);
    expect(mocks.expenseCreate).not.toHaveBeenCalled();
    mocks.expenseCreate.mockRejectedValueOnce({code:'P2002'});
    mocks.findReplay.mockResolvedValueOnce(null).mockResolvedValueOnce({...expense,manualTransferFingerprint:'different'});
    expect((await POST(req('POST',payload))).status).toBe(409);
  });
  it('menolak percobaan yang tidak dimiliki pengguna sebelum membuat transfer',async()=>{
    mocks.findAttempt.mockResolvedValueOnce([]);
    expect((await POST(req('POST'))).status).toBe(409);
    expect(mocks.expenseCreate).not.toHaveBeenCalled();
  });
  it('menolak penyimpanan jika identitas berubah saat izin diperiksa',async()=>{
    mocks.permission.mockResolvedValueOnce({id:'other-user',storeId:'store-1'});
    expect((await POST(req('POST'))).status).toBe(403);
    expect(mocks.transactionScope).not.toHaveBeenCalled();
  });
  it('menolak alokasi tanpa izin sebelum membuat transfer',async()=>{
    mocks.permission.mockImplementation(async (target:string)=>{if(target==='expense.manual_transfer.allocation') throw new Error('forbidden'); return {id:'user-1',storeId:'store-1'};});
    expect((await POST(req('POST',{...payload,allocations:[{payableId:'debt-1',paymentId:'p1',amount:10000}]}))).status).toBe(403);
    expect(mocks.expenseCreate).not.toHaveBeenCalled();
  });
  it('memerlukan izin melihat pengeluaran untuk membuat atau mengubah alokasi',async()=>{
    mocks.permission.mockImplementation(async (target:string, action:string)=>{if(target==='expense' && action==='read') throw new Error('forbidden'); return {id:'user-1',storeId:'store-1'};});
    const allocations=[{payableId:'debt-1',paymentId:'p1',amount:10000}];
    expect((await POST(req('POST',{...payload,allocations}))).status).toBe(403);
    expect((await PATCH(req('PATCH',{...payload,allocations}),{params:Promise.resolve({id:'expense-1'})})).status).toBe(403);
    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.expenseCreate).not.toHaveBeenCalled();
    expect(mocks.expenseUpdate).not.toHaveBeenCalled();
  });
  it('menolak perubahan transfer jika akses halaman Keuangan dicabut',async()=>{
    mocks.page.mockResolvedValue(false);
    expect((await POST(req('POST'))).status).toBe(403);
    expect((await PATCH(req('PATCH'),{params:Promise.resolve({id:'expense-1'})})).status).toBe(403);
    expect(mocks.expenseCreate).not.toHaveBeenCalled();
    expect(mocks.expenseUpdate).not.toHaveBeenCalled();
    expect((await expensesGET(new Request('http://localhost?month=2026-11'))).status).toBe(403);
    expect((await DELETE(req('DELETE'),{params:Promise.resolve({id:'expense-1'})})).status).toBe(403);
    expect(mocks.expenseList).not.toHaveBeenCalled();
  });
  it('menampilkan sumber manual dan mempertahankan marker ketika diedit',async()=>{
    const list=await (await expensesGET(new Request('http://localhost?month=2026-11'))).json();
    expect(list.data[0].source.type).toBe('MANUAL_TRANSFER_PURCHASE');
    const {manualPurchasePaymentMethod:_,...edited}=payload;
    expect((await PATCH(req('PATCH',edited),{params:Promise.resolve({id:'expense-1'})})).status).toBe(200);
    expect(mocks.expenseUpdate).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({manualPurchasePaymentMethod:'TRANSFER'})}));
  });
  it('memerlukan izin edit transfer baru selain izin transfer yang sudah ada',async()=>{
    mocks.permission.mockImplementation(async (target:string)=>{
      if(target==='expense.manual_transfer.edit') throw new Error('forbidden');
      return {id:'user-1',storeId:'store-1'};
    });
    const {manualPurchasePaymentMethod:_,...edited}=payload;
    expect((await PATCH(req('PATCH',edited),{params:Promise.resolve({id:'expense-1'})})).status).toBe(403);
    expect(mocks.expenseUpdate).not.toHaveBeenCalled();
    expect(mocks.permission).toHaveBeenCalledWith('expense.manual_transfer','update');
    expect(mocks.permission).toHaveBeenCalledWith('expense.manual_transfer.edit','update');
  });
  it('memerlukan izin hapus bukti untuk melepas bukti transfer yang tersimpan',async()=>{
    mocks.expenseFind.mockResolvedValueOnce({...expense,attachmentUrl:'https://prnt.sc/abc'});
    mocks.permission.mockImplementation(async (target:string)=>{if(target==='proof_upload') throw new Error('forbidden'); return {id:'user-1',storeId:'store-1'};});
    expect((await PATCH(req('PATCH',{...payload,attachmentUrl:null}),{params:Promise.resolve({id:'expense-1'})})).status).toBe(403);
    expect(mocks.expenseUpdate).not.toHaveBeenCalled();
  });
  it('mempertahankan bukti transfer bila field lampiran tidak dikirim',async()=>{
    mocks.expenseFind.mockResolvedValueOnce({...expense,attachmentUrl:'https://prnt.sc/abc'});
    mocks.lock.mockResolvedValueOnce([{id:'expense-1',updatedAt:expense.updatedAt,attachmentUrl:'https://prnt.sc/abc'}]);
    expect((await PATCH(req('PATCH',payload),{params:Promise.resolve({id:'expense-1'})})).status).toBe(200);
    expect(mocks.expenseUpdate).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({attachmentUrl:'https://prnt.sc/abc'})}));
  });
  it('menolak penyimpanan jika bukti berubah setelah izin diperiksa',async()=>{
    mocks.expenseFind.mockResolvedValueOnce({...expense,attachmentUrl:null});
    mocks.lock.mockResolvedValueOnce([{id:'expense-1',updatedAt:expense.updatedAt,attachmentUrl:'https://prnt.sc/new'}]);
    expect((await PATCH(req('PATCH',payload),{params:Promise.resolve({id:'expense-1'})})).status).toBe(409);
    expect(mocks.expenseUpdate).not.toHaveBeenCalled();
  });
  it('menolak perubahan nominal, tanggal, atau penghapusan yang bertentangan dengan alokasi',async()=>{
    mocks.findAllocations.mockResolvedValue([{amount:20000,payment:{paidAt:new Date('2026-11-02T00:00:00Z')}}]);
    const {manualPurchasePaymentMethod:_,...edited}=payload;
    expect((await PATCH(req('PATCH',{...edited,amount:19999}),{params:Promise.resolve({id:'expense-1'})})).status).toBe(409);
    expect((await PATCH(req('PATCH',{...edited,occurredAt:'2026-11-03'}),{params:Promise.resolve({id:'expense-1'})})).status).toBe(409);
    expect((await DELETE(req('DELETE'),{params:Promise.resolve({id:'expense-1'})})).status).toBe(409);
    expect(mocks.expenseUpdate).not.toHaveBeenCalled();
  });
  it('mengganti atau melepas alokasi pada perubahan transfer dengan izin terpisah',async()=>{
    const {manualPurchasePaymentMethod:_,...edited}=payload;
    const allocations=[{payableId:'debt-1',paymentId:'p1',amount:10000}];
    expect((await PATCH(req('PATCH',{...edited,allocations}),{params:Promise.resolve({id:'expense-1'})})).status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith('expense.manual_transfer.allocation','update');
    expect(mocks.link).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({expenseId:'expense-1',storeId:'store-1'}),allocations);
    expect((await PATCH(req('PATCH',{...edited,allocations:[]}),{params:Promise.resolve({id:'expense-1'})})).status).toBe(200);
    expect(mocks.link).toHaveBeenLastCalledWith(expect.anything(),expect.anything(),[]);
  });
  it('menolak formulir transfer lama agar alokasi baru tidak terlepas diam-diam',async()=>{
    mocks.lock.mockResolvedValueOnce([{id:'expense-1',updatedAt:new Date('2026-11-03T00:00:01Z')}]);
    const response=await PATCH(req('PATCH',{...payload,updatedAt:'2026-11-03T00:00:00.000Z',allocations:[]}),{params:Promise.resolve({id:'expense-1'})});
    expect(response.status).toBe(409);
    expect(mocks.expenseUpdate).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();
  });
  it.each([{changeAmount:1},{transactionId:'transaction-1'},{description:''},{manualPurchasePaymentMethod:'GIRO'}])('menolak belanja transfer tidak sah %j',async(extra)=>{
    expect((await POST(req('POST',{...payload,...extra}))).status).toBe(422);
    expect(mocks.expenseCreate).not.toHaveBeenCalled();
  });
  it('menambahkan nominal manual tanpa menaikkan jumlah transaksi',async()=>{
    const response=await (await incomeSummary(new Request('http://localhost?month=2026-11'))).json();
    expect(response).toMatchObject({monthlyTotal:150000,transactionCount:1,manualEntryCount:1,daily:[{date:'2026-11-02',total:150000,count:1,manualCount:1}]});
    expect(mocks.manual).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({storeId:'store-1',deletedAt:null})}));
    const out=await (await expenseSummary(new Request('http://localhost?month=2026-11'))).json();
    expect(out.cashExpense).toMatchObject({ total: 25000, incomplete: false });
  });
});
