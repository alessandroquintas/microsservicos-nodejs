import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { CustomerEntity } from "../../../src/domain/customer/customer-entity.ts";
import { CustomerAlreadyExistsError } from "../../../src/domain/customer/errors.ts";
import { DrizzleCustomersRepository } from "../../../src/infra/db/repositories/drizzle-customers-repository.ts";
import { db } from "../../../src/infra/db/client.ts";
import { schema } from "../../../src/infra/db/schema/index.ts";

const sut = new DrizzleCustomersRepository(db);

function makeCustomer(email = "johndoe@example.com") {
  return CustomerEntity.create({
    name: "John Doe",
    email,
    address: "Rua das Flores, 123",
    state: "PR",
    zipCode: "80000-000",
    country: "Brazil",
    dateOfBirth: new Date("1990-05-10"),
  });
}

beforeEach(async () => {
  await db.delete(schema.orders);
  await db.delete(schema.customers);
});

afterAll(async () => {
  await db.$client.end();
});

describe("DrizzleCustomersRepository", () => {
  it("finds a customer by id", async () => {
    await db.insert(schema.customers).values({
      id: "customer-1",
      name: "John Doe",
      email: "johndoe@example.com",
      address: "Rua das Flores, 123",
      state: "PR",
      zipCode: "80000-000",
      country: "Brazil",
    });

    const customer = await sut.findById("customer-1");

    expect(customer).toBeInstanceOf(CustomerEntity);
    expect(customer).toMatchObject({
      id: "customer-1",
      name: "John Doe",
      email: "johndoe@example.com",
      dateOfBirth: null,
    });
  });

  it("returns null when the customer does not exist", async () => {
    expect(await sut.findById("unknown")).toBeNull();
  });

  it("saves a customer with all its fields", async () => {
    const customer = makeCustomer();

    await sut.save(customer);

    const found = await sut.findById(customer.id);
    expect(found).toEqual(customer);
  });

  it("finds a customer by email", async () => {
    const customer = makeCustomer();
    await sut.save(customer);

    const found = await sut.findByEmail("johndoe@example.com");

    expect(found).toBeInstanceOf(CustomerEntity);
    expect(found?.id).toBe(customer.id);
  });

  it("returns null when no customer has the email", async () => {
    expect(await sut.findByEmail("nobody@example.com")).toBeNull();
  });

  it("throws CustomerAlreadyExistsError when the email is taken", async () => {
    await sut.save(makeCustomer());

    await expect(sut.save(makeCustomer())).rejects.toThrow(
      CustomerAlreadyExistsError,
    );
  });
});
