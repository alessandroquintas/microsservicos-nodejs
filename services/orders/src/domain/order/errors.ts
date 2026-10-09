export class InvalidOrderAmountError extends Error {
  constructor() {
    super("Order amount must be greater than zero");
    this.name = "InvalidOrderAmountError";
  }
}

export class InvalidCustomerIdError extends Error {
  constructor() {
    super("Order must reference a customer");
    this.name = "InvalidCustomerIdError";
  }
}

export class InvalidOrderStatusTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot change order status from "${from}" to "${to}"`);
    this.name = "InvalidOrderStatusTransitionError";
  }
}

export class OrderNotFoundError extends Error {
  constructor(orderId: string) {
    super(`Order ${orderId} not found`);
    this.name = "OrderNotFoundError";
  }
}
