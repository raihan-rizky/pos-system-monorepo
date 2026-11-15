import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDefaultRolePermissions } from '@/features/rbac/helpers/rbac-core';
const mocks=vi.hoisted(()=>({permission:vi.fn(),user:vi.fn(),permissions:vi.fn(),sales:vi.fn(),expenses:vi.fn(),manual:vi.fn(),report:vi.fn(),denied:new Error('denied')}));
vi.mock('@/lib/rbac/guard',()=>({
  requirePermission:mocks.permission,
  getCurrentUser:mocks.user,
  handleAuthError:(error:unknown)=>error===mocks.denied?new Response(null,{status:403}):null,
}));
vi.mock('@/features/rbac/helpers/rbac-server',()=>({getGlobalRolePermissions:mocks.permissions}));
vi.mock('@pos/db',()=>({db:{transaction:{findMany:mocks.sales},expense:{findMany:mocks.expenses},manualIncome:{findMany:mocks.manual}},Prisma:{}}));
vi.mock('@/features/financial-report/services/monthly-report',()=>({getMonthlyFinancialReport:mocks.report}));
vi.mock('@/lib/logger',()=>({getLogger:()=>({error:vi.fn(),warn:vi.fn(),info:vi.fn(),debug:vi.fn()})}));
type RouteCase = readonly [string, () => Promise<unknown>, string, string, string];
type Handler = (request: Request, context: { params: Promise<{ id: string; batchId: string; goodsPurchaseId: string }> }) => Promise<Response>;
const cases: RouteCase[]=[
  ['app/api/inventory-management/stock-group-bulk/route.ts POST', () => import('../../../app/api/inventory-management/stock-group-bulk/route'), 'POST', 'inventory.bulk', 'update'],
  ["app/api/products/import/commit/route.ts POST", () => import("../../../app/api/products/import/commit/route"), "POST", "product.import", "create"],
  ["app/api/products/import/image-extract/route.ts POST", () => import("../../../app/api/products/import/image-extract/route"), "POST", "product.import", "create"],
  ["app/api/products/import/jobs/route.ts POST", () => import("../../../app/api/products/import/jobs/route"), "POST", "product.import", "create"],
  ["app/api/products/import/preview/route.ts POST", () => import("../../../app/api/products/import/preview/route"), "POST", "product.import", "create"],
  ["app/api/products/import/commit/chunk/route.ts POST", () => import("../../../app/api/products/import/commit/chunk/route"), "POST", "product.import", "create"],
  ["app/api/products/import/commit/finish/route.ts POST", () => import("../../../app/api/products/import/commit/finish/route"), "POST", "product.import", "create"],
  ["app/api/products/import/commit/start/route.ts POST", () => import("../../../app/api/products/import/commit/start/route"), "POST", "product.import", "create"],
  ["app/api/products/import/jobs/active/route.ts GET", () => import("../../../app/api/products/import/jobs/active/route"), "GET", "product.import", "read"],
  ["app/api/products/import/jobs/[id]/route.ts GET", () => import("../../../app/api/products/import/jobs/[id]/route"), "GET", "product.import", "read"],
  ["app/api/products/import/supplier-codes/commit/route.ts POST", () => import("../../../app/api/products/import/supplier-codes/commit/route"), "POST", "product.import", "update"],
  ["app/api/products/import/supplier-codes/preview/route.ts POST", () => import("../../../app/api/products/import/supplier-codes/preview/route"), "POST", "product.import", "update"],
  ["app/api/products/import/jobs/[id]/cancel/route.ts POST", () => import("../../../app/api/products/import/jobs/[id]/cancel/route"), "POST", "product.import", "create"],
  ["app/api/products/import/jobs/[id]/retry/route.ts POST", () => import("../../../app/api/products/import/jobs/[id]/retry/route"), "POST", "product.import", "create"],
  ["app/api/inventory/bulk/commit/route.ts POST", () => import("../../../app/api/inventory/bulk/commit/route"), "POST", "inventory.bulk", "update"],
  ["app/api/inventory/bulk/preview/route.ts POST", () => import("../../../app/api/inventory/bulk/preview/route"), "POST", "inventory.bulk", "update"],
  ["app/api/inventory/bulk/[batchId]/route.ts GET", () => import("../../../app/api/inventory/bulk/[batchId]/route"), "GET", "inventory.bulk", "read"],
  ["app/api/inventory/bulk/import/commit/route.ts POST", () => import("../../../app/api/inventory/bulk/import/commit/route"), "POST", "inventory.bulk", "update"],
  ["app/api/inventory/bulk/import/preview/route.ts POST", () => import("../../../app/api/inventory/bulk/import/preview/route"), "POST", "inventory.bulk", "update"],
  ["app/api/inventory/bulk/[batchId]/cancel/route.ts POST", () => import("../../../app/api/inventory/bulk/[batchId]/cancel/route"), "POST", "inventory.bulk", "update"],
  ["app/api/inventory/bulk/import/commit/jobs/route.ts POST", () => import("../../../app/api/inventory/bulk/import/commit/jobs/route"), "POST", "inventory.bulk", "update"],
  ["app/api/inventory/bulk/import/commit/jobs/active/route.ts GET", () => import("../../../app/api/inventory/bulk/import/commit/jobs/active/route"), "GET", "inventory.bulk", "read"],
  ["app/api/inventory/bulk/import/commit/jobs/[id]/route.ts GET", () => import("../../../app/api/inventory/bulk/import/commit/jobs/[id]/route"), "GET", "inventory.bulk", "read"],
  ["app/api/finance/income/route.ts GET", () => import("../../../app/api/finance/income/route"), "GET", "income.manual", "read"],
  ["app/api/finance/income/route.ts POST", () => import("../../../app/api/finance/income/route"), "POST", "income.manual", "create"],
  ["app/api/finance/income/[id]/route.ts PATCH", () => import("../../../app/api/finance/income/[id]/route"), "PATCH", "income.manual", "update"],
  ["app/api/finance/income/[id]/route.ts DELETE", () => import("../../../app/api/finance/income/[id]/route"), "DELETE", "income.manual", "delete"],
  ["app/api/finance/supplier-payables/route.ts GET", () => import("../../../app/api/finance/supplier-payables/route"), "GET", "expense.payable", "read"],
  ["app/api/finance/supplier-payables/route.ts POST", () => import("../../../app/api/finance/supplier-payables/route"), "POST", "expense.payable", "create"],
  ["app/api/finance/giro/route.ts GET", () => import("../../../app/api/finance/giro/route"), "GET", "expense.giro", "read"],
  ["app/api/finance/giro/[goodsPurchaseId]/link-manual/route.ts POST", () => import("../../../app/api/finance/giro/[goodsPurchaseId]/link-manual/route"), "POST", "expense.giro", "update"],
  ["app/api/finance/giro/[goodsPurchaseId]/reconcile/route.ts POST", () => import("../../../app/api/finance/giro/[goodsPurchaseId]/reconcile/route"), "POST", "expense.giro", "update"],
];
describe('Izin khusus fitur baru pada API',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.permission.mockRejectedValue(mocks.denied);});
  it.each(cases)('%s menolak sebelum memuat atau mengubah data',async(_name,load,method,resource,action)=>{
    const route=await load();
    const handler=(route as Record<string,Handler>)[method];
    const response=await handler(new Request('http://localhost/api?year=2026&month=10&period=monthly'),{params:Promise.resolve({id:'record-1',batchId:'batch-1',goodsPurchaseId:'purchase-1'})});
    expect(response.status).toBe(403);
    expect(mocks.permission).toHaveBeenCalledExactlyOnceWith(resource,action);
  });
});

describe('Izin ekspor pada API laporan',()=>{
  const exports = [
    ['jurnal', () => import('../../../app/api/finance/report/journal/route')],
    ['bulanan', () => import('../../../app/api/finance/report/monthly/route')],
  ] as const;

  beforeEach(()=>{
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({id:'admin-1',role:'ADMIN',storeId:'store-1'});
    mocks.sales.mockResolvedValue([]);
    mocks.expenses.mockResolvedValue([]);
    mocks.manual.mockResolvedValue([]);
    mocks.report.mockResolvedValue({});
  });

  it.each(exports)('%s menolak tanpa izin ekspor sebelum membaca data',async(_name,load)=>{
    const permissions=buildDefaultRolePermissions();
    permissions.ADMIN.pages['/financial-report']=true;
    permissions.ADMIN.resources['financial-report'].read=true;
    permissions.ADMIN.resources['financial-report.export'].read=false;
    mocks.permissions.mockResolvedValue(permissions);
    const {GET}=await load();
    const response=await GET(new Request('http://localhost/api?year=2026&month=10&period=monthly'));
    expect(response.status).toBe(403);
    expect(mocks.user).toHaveBeenCalledOnce();
    expect(mocks.permissions).toHaveBeenCalledOnce();
    expect(mocks.sales).not.toHaveBeenCalled();
    expect(mocks.expenses).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it.each(exports)('%s menerima pengguna dengan izin ekspor',async(name,load)=>{
    const permissions=buildDefaultRolePermissions();
    permissions.ADMIN.pages['/financial-report']=true;
    permissions.ADMIN.resources['financial-report'].read=true;
    permissions.ADMIN.resources['financial-report.export'].read=true;
    mocks.permissions.mockResolvedValue(permissions);
    const {GET}=await load();
    const response=await GET(new Request('http://localhost/api?year=2026&month=10&period=monthly'));
    expect(response.status).toBe(200);
    if(name==='jurnal') {
      expect(mocks.sales).toHaveBeenCalledOnce();
      expect(mocks.expenses).toHaveBeenCalledOnce();
    } else {
      expect(mocks.report).toHaveBeenCalledOnce();
    }
  });
});
