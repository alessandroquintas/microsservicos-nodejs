export class CustomerNotFoundError extends Error {
  constructor(customerId: string) {
    super(`Customer ${customerId} not found`);
    this.name = "CustomerNotFoundError";
  }
}

export class CustomerAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`Customer with email ${email} already exists`);
    this.name = "CustomerAlreadyExistsError";
  }
}

export class EmptyCustomerFieldError extends Error {
  constructor(field: string) {
    super(`Customer ${field} must not be empty`);
    this.name = "EmptyCustomerFieldError";
  }
}

export class InvalidCustomerEmailError extends Error {
  constructor(email: string) {
    super(`Invalid customer email: ${email}`);
    this.name = "InvalidCustomerEmailError";
  }
}

export class InvalidCustomerDateOfBirthError extends Error {
  constructor() {
    super("Customer date of birth must not be in the future");
    this.name = "InvalidCustomerDateOfBirthError";
  }
}
