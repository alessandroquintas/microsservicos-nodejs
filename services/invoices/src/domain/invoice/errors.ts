export class InvalidOrderIdError extends Error {
  constructor() {
    super("Invoice must reference an order");
    this.name = "InvalidOrderIdError";
  }
}

export class InvalidInvoiceAmountError extends Error {
  constructor() {
    super("Invoice amount must be greater than zero");
    this.name = "InvalidInvoiceAmountError";
  }
}

export class InvalidInvoiceStatusTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot change invoice status from "${from}" to "${to}"`);
    this.name = "InvalidInvoiceStatusTransitionError";
  }
}

export class InvoiceNotFoundError extends Error {
  constructor(reference: string) {
    super(`Invoice ${reference} not found`);
    this.name = "InvoiceNotFoundError";
  }
}
