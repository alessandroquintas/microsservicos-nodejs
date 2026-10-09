import { beforeEach, describe, expect, it } from "vitest";
import { GetCustomerUseCase } from "../../src/application/use-cases/get-customer.ts";
import { CustomerEntity } from "../../src/domain/customer/customer-entity.ts";
import { CustomerNotFoundError } from "../../src/domain/customer/errors.ts";
import { InMemoryCustomersRepository } from "../fakes/in-memory-customers-repository.ts";

let customersRepository: InMemoryCustomersRepository;
let sut: GetCustomerUseCase;

beforeEach(() => {
  customersRepository = new InMemoryCustomersRepository();
  sut = new GetCustomerUseCase(customersRepository);
});

describe("GetCustomerUseCase", () => {
  it("returns the customer", async () => {
    const customer = CustomerEntity.create({
      name: "John Doe",
      email: "johndoe@example.com",
      address: "Rua das Flores, 123",
      state: "PR",
      zipCode: "80000-000",
      country: "Brazil",
    });
    customersRepository.items.push(customer);

    expect(await sut.execute({ customerId: customer.id })).toBe(customer);
  });

  it("fails when the customer does not exist", async () => {
    await expect(sut.execute({ customerId: "unknown" })).rejects.toThrow(
      CustomerNotFoundError,
    );
  });
});
