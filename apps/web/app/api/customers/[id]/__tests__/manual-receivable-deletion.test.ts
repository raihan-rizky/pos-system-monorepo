import { beforeEach, expect, it, vi } from "vitest";
import { DELETE } from "../route";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), customer: vi.fn(), count: vi.fn(), unlink: vi.fn(), remove: vi.fn(), lock: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: () => null }));
vi.mock("@pos/db", () => ({ db: { customer: { findFirst: mocks.customer, delete: mocks.remove }, transaction: { updateMany: mocks.unlink }, $transaction: mocks.transaction } }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.permission.mockResolvedValue({ id: "user-1", storeId: "store-1" }); mocks.customer.mockResolvedValue({ id: "customer-1" }); mocks.count.mockResolvedValue(1);
  mocks.transaction.mockImplementation(callback => callback({ $queryRaw: mocks.lock, customer: { findFirst: mocks.customer, delete: mocks.remove }, customerReceivable: { count: mocks.count }, transaction: { updateMany: mocks.unlink } }));
});
it("protects even settled manual debt history when deleting a customer", async () => {
  const response = await DELETE(new Request("http://localhost/api/customers/customer-1", { method: "DELETE" }), { params: Promise.resolve({ id: "customer-1" }) });
  expect(response.status).toBe(409);
  expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.unlink).not.toHaveBeenCalled();
});
it("keeps ordinary customer deletion available when there is no manual ledger", async () => {
  mocks.count.mockResolvedValueOnce(0);
  const response = await DELETE(new Request("http://localhost/api/customers/customer-1", { method: "DELETE" }), { params: Promise.resolve({ id: "customer-1" }) });
  expect(response.status).toBe(204);
  expect(mocks.remove).toHaveBeenCalledWith({ where: { id: "customer-1" } });
});
it("does not mutate anything when the customer is outside the current store", async () => {
  mocks.customer.mockResolvedValueOnce(null);
  const response = await DELETE(new Request("http://localhost/api/customers/foreign", { method: "DELETE" }), { params: Promise.resolve({ id: "foreign" }) });
  expect(response.status).toBe(404); expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.customer).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "foreign", storeId: "store-1" } }));
});
it("rechecks deletion after obtaining the same customer lock used by manual debt writes", async () => {
  mocks.customer.mockResolvedValueOnce({ id: "customer-1" }).mockResolvedValueOnce(null);
  const response = await DELETE(new Request("http://localhost/api/customers/customer-1", { method: "DELETE" }), { params: Promise.resolve({ id: "customer-1" }) });
  expect(response.status).toBe(404); expect(mocks.lock).toHaveBeenCalledOnce(); expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.unlink).not.toHaveBeenCalled();
});
