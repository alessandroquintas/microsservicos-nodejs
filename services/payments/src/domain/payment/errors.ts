export class InvalidPaymentAmountError extends Error {
  constructor() {
    super("Payment amount must be greater than zero");
    this.name = "InvalidPaymentAmountError";
  }
}

export class InvalidInvoiceIdError extends Error {
  constructor() {
    super("Payment must reference an invoice");
    this.name = "InvalidInvoiceIdError";
  }
}

export class InvalidFailureReasonError extends Error {
  constructor() {
    super("A failed payment must have a reason");
    this.name = "InvalidFailureReasonError";
  }
}
