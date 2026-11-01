import {
  parseBackdatedPaymentInput,
  parseBackdatedPurchaseInput,
} from "../helpers/backdated-purchase-input";
import {
  addBackdatedPurchasePayment,
  createBackdatedPurchase,
  getBackdatedPurchase,
  type BackdatedPurchaseActor,
} from "../repositories/backdated-purchase-repository";

export function createHistoricalPurchase(body: unknown, actor: BackdatedPurchaseActor) {
  return createBackdatedPurchase(parseBackdatedPurchaseInput(body), actor);
}

export async function addHistoricalPayment(id: string, body: unknown, actor: BackdatedPurchaseActor) {
  const purchase = await getBackdatedPurchase(id, actor);
  const payment = parseBackdatedPaymentInput(body, purchase.purchaseDate);
  return addBackdatedPurchasePayment(id, payment, actor);
}
