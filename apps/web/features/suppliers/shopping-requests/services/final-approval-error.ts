export class FinalApprovalError extends Error {
  constructor(message: string, public readonly status = 422) {
    super(message);
    this.name = "FinalApprovalError";
  }
}
