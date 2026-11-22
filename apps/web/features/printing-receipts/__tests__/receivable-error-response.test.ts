import {expect,it,vi} from "vitest";
vi.mock("@/lib/rbac/guard",()=>({handleAuthError:()=>null}));
vi.mock("@/features/rbac/helpers/rbac-server",()=>({getGlobalRolePermissions:vi.fn()}));
vi.mock("../server/receipt-store",()=>({PrintingReceiptStorageError:class extends Error{}}));
import {printingReceiptErrorResponse} from "../server/route-support";
import {ReceivableAuthorizationError} from "@/features/customer-debt/helpers/receivable-authorization";
it("returns the receivable denial as 403 for processed receipt corrections",async()=>{
  const response=printingReceiptErrorResponse(new ReceivableAuthorizationError());
  expect(response.status).toBe(403);expect((await response.json()).message).toMatch(/izin.*piutang/);
});
