import { describe, expect, it } from "vitest";
import { CustomerEntity } from "../../src/domain/customer/customer-entity.ts";
import {
  EmptyCustomerFieldError,
  InvalidCustomerDateOfBirthError,
  InvalidCustomerEmailError,
} from "../../src/domain/customer/errors.ts";

function validProps() {
  return {
    name: "John Doe",
    email: "johndoe@example.com",
    address: "Rua das Flores, 123",
    state: "PR",
    zipCode: "80000-000",
    country: "Brazil",
  };
}

describe("CustomerEntity", () => {
  it("creates a customer with a generated id", () => {
    const customer = CustomerEntity.create({
      ...validProps(),
      dateOfBirth: new Date("1990-05-10"),
    });

    expect(customer.id).toEqual(expect.any(String));
    expect(customer).toMatchObject({
      ...validProps(),
      dateOfBirth: new Date("1990-05-10"),
    });
  });

  it("creates a customer without date of birth", () => {
    const customer = CustomerEntity.create(validProps());

    expect(customer.dateOfBirth).toBeNull();
  });

  it("trims the text fields and normalizes the email to lowercase", () => {
    const customer = CustomerEntity.create({
      ...validProps(),
      name: "  John Doe  ",
      email: "  JohnDoe@Example.COM ",
    });

    expect(customer.name).toBe("John Doe");
    expect(customer.email).toBe("johndoe@example.com");
  });

  it.each(["name", "address", "state", "zipCode", "country"] as const)(
    "rejects an empty %s",
    (field) => {
      expect(() =>
        CustomerEntity.create({ ...validProps(), [field]: "   " }),
      ).toThrow(EmptyCustomerFieldError);
    },
  );

  it.each(["", "johndoe", "johndoe@example", "john doe@example.com"])(
    "rejects the email %j",
    (email) => {
      expect(() => CustomerEntity.create({ ...validProps(), email })).toThrow(
        InvalidCustomerEmailError,
      );
    },
  );

  it("rejects a date of birth in the future", () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

    expect(() =>
      CustomerEntity.create({ ...validProps(), dateOfBirth: tomorrow }),
    ).toThrow(InvalidCustomerDateOfBirthError);
  });

  it("generates a different id for each customer", () => {
    const a = CustomerEntity.create(validProps());
    const b = CustomerEntity.create(validProps());

    expect(a.id).not.toBe(b.id);
  });
});
