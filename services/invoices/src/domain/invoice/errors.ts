export class InvalidOrderIdError extends Error {
  constructor() {
    super("Invoice must reference an order");
    this.name = "InvalidOrderIdError";
  }
}
