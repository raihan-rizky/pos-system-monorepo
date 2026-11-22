import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({find:vi.fn(),write:vi.fn(),permission:vi.fn()}));
vi.mock("@/lib/rbac/guard",()=>({requirePermission:m.permission,handleAuthError:()=>null}));
vi.mock("@pos/db",()=>({db:{transaction:{findUnique:m.find,findFirst:m.find,update:m.write,updateMany:m.write,findFirstOrThrow:m.find}}}));
import {POST} from "../route";
const ctx={params:Promise.resolve({id:"tx"})};
beforeEach(()=>{vi.clearAllMocks();m.permission.mockResolvedValue({id:"admin",storeId:"store"});m.find.mockResolvedValue({id:"tx",storeId:"store",status:"PENDING_APPROVAL",requestedById:"sales",cashierId:null});m.write.mockResolvedValue({id:"tx",count:1,status:"VOIDED"});});
it("refuses an already-active legacy debt rather than bypassing the Void guard",async()=>{
  m.find.mockResolvedValue({id:"tx",storeId:"store",status:"DP",requestedById:"sales",cashierId:null});
  expect((await POST(new Request("http://localhost"),ctx)).status).toBe(409);expect(m.write).not.toHaveBeenCalled();
});
it("does not overwrite an invoice approved after its pending snapshot",async()=>{
  m.write.mockImplementation(async({where})=>({count:where.status==="PENDING_APPROVAL"&&where.storeId==="store"?0:1}));
  expect((await POST(new Request("http://localhost"),ctx)).status).toBe(409);
});
it("scopes pending lookup and the conditional write to the authenticated store",async()=>{
  expect((await POST(new Request("http://localhost"),ctx)).status).toBe(200);
  expect(m.find.mock.calls[0][0].where).toEqual({id:"tx",storeId:"store"});
  expect(m.write.mock.calls[0][0].where).toEqual({id:"tx",storeId:"store",status:"PENDING_APPROVAL"});
});
