export class ShoppingRequestCorrectionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ShoppingRequestCorrectionError";
  }
}
