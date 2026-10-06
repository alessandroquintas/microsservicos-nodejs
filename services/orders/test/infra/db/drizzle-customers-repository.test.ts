import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { CustomerEntity } from "../../../src/domain/customer/customer-entity.ts";
import { DrizzleCustomersRepository } from "../../../src/infra/db/repositories/drizzle-customers-repository.ts";
import { db } from "../../../src/infra/db/client.ts";
import { schema } from "../../../src/infra/db/schema/index.ts";

const sut = new DrizzleCustomersRepository(db);

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
});
