import { randomUUID } from "node:crypto";
import {
  EmptyCustomerFieldError,
  InvalidCustomerDateOfBirthError,
  InvalidCustomerEmailError,
} from "./errors.ts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CustomerProps = {
  id: string;
  name: string;
  email: string;
  address: string;
  state: string;
  zipCode: string;
  country: string;
  dateOfBirth: Date | null;
};

type CreateCustomerProps = Omit<CustomerProps, "id" | "dateOfBirth"> & {
  dateOfBirth?: Date | null;
};

function requireText(field: string, value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new EmptyCustomerFieldError(field);
  }

  return trimmed;
}

export class CustomerEntity {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly address: string;
  readonly state: string;
  readonly zipCode: string;
  readonly country: string;
  readonly dateOfBirth: Date | null;

  private constructor(props: CustomerProps) {
    this.id = props.id;
    this.name = props.name;
    this.email = props.email;
    this.address = props.address;
    this.state = props.state;
    this.zipCode = props.zipCode;
    this.country = props.country;
    this.dateOfBirth = props.dateOfBirth;
  }

  static create(props: CreateCustomerProps): CustomerEntity {
    const email = props.email.trim().toLowerCase();

    if (!EMAIL_PATTERN.test(email)) {
      throw new InvalidCustomerEmailError(props.email);
    }

    const dateOfBirth = props.dateOfBirth ?? null;

    if (dateOfBirth && dateOfBirth.getTime() > Date.now()) {
      throw new InvalidCustomerDateOfBirthError();
    }

    return new CustomerEntity({
      id: randomUUID(),
      name: requireText("name", props.name),
      email,
      address: requireText("address", props.address),
      state: requireText("state", props.state),
      zipCode: requireText("zipCode", props.zipCode),
      country: requireText("country", props.country),
      dateOfBirth,
    });
  }

  static restore(props: CustomerProps): CustomerEntity {
    return new CustomerEntity(props);
  }
}
