import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST,GET as expensesGET } from '@/app/api/finance/expenses/route';
import { PATCH } from '@/app/api/finance/expenses/[id]/route';
import { GET as incomeSummary } from '@/app/api/finance/income/summary/route';
import { GET as expenseSummary } from '@/app/api/finance/expenses/summary/route';
vi.mock('@/features/financial-report/services/monthly-report',()=>({getMonthlyFinancialReport:async()=>({income:[],expenses:[],purchaseExpenses:[{date:'2026-11-02',amount:25000,purchase:{method:'TRANSFER'}}]})}));

const mocks=vi.hoisted(()=>({expenseCreate:vi.fn(),expenseUpdate:vi.fn(),expenseFind:vi.fn(),expenseList:vi.fn(),expenseCount:vi.fn(),transaction:vi.fn(),manual:vi.fn()}));
vi.mock('@/lib/rbac/guard',()=>({requireRole:async()=>({id:'user-1',storeId:'store-1'}),requirePermission:async()=>({id:'user-1',storeId:'store-1'}),handleAuthError:()=>null}));
vi.mock('@pos/db',()=>({db:{expense:{create:mocks.expenseCreate,update:mocks.expenseUpdate,findFirst:mocks.expenseFind,findMany:mocks.expenseList,count:mocks.expenseCount},transaction:{findMany:mocks.transaction},manualIncome:{findMany:mocks.manual}}}));
const payload={applicantName:'Pemasok contoh',description:'Belanja kertas',category:'SUPPLIES',amount:25000,changeAmount:0,occurredAt:'2026-11-02',manualPurchasePaymentMethod:'TRANSFER'};
const expense={...payload,id:'expense-1',storeId:'store-1',occurredAt:new Date('2026-11-01T17:00:00Z'),createdAt:new Date(),deletedAt:null,recordedBy:{id:'user-1',name:'Contoh'},goodsPurchase:null,shoppingRequest:null};
const req=(method:string,data:unknown=payload)=>new Request('http://localhost',{method,body:JSON.stringify(data)});

describe('belanja transfer dan ringkasan pemasukan manual',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.expenseCreate.mockResolvedValue(expense);mocks.expenseUpdate.mockResolvedValue(expense);mocks.expenseFind.mockResolvedValue(expense);mocks.expenseList.mockResolvedValue([expense]);mocks.expenseCount.mockResolvedValue(1);mocks.transaction.mockResolvedValue([{createdAt:new Date('2026-11-01T17:00:00Z'),total:50000}]);mocks.manual.mockResolvedValue([{id:'income-1',occurredAt:new Date('2026-11-01T17:00:00Z'),amount:100000}]);});
  it('menyimpan satu Expense dengan metode transfer',async()=>{
    expect((await POST(req('POST'))).status).toBe(201);
    expect(mocks.expenseCreate).toHaveBeenCalledTimes(1);
    expect(mocks.expenseCreate).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({manualPurchasePaymentMethod:'TRANSFER',changeAmount:0,transactionId:null})}));
  });
  it('menampilkan sumber manual dan mempertahankan marker ketika diedit',async()=>{
    const list=await (await expensesGET(new Request('http://localhost?month=2026-11'))).json();
    expect(list.data[0].source.type).toBe('MANUAL_TRANSFER_PURCHASE');
    const {manualPurchasePaymentMethod:_,...edited}=payload;
    expect((await PATCH(req('PATCH',edited),{params:Promise.resolve({id:'expense-1'})})).status).toBe(200);
    expect(mocks.expenseUpdate).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({manualPurchasePaymentMethod:'TRANSFER'})}));
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
