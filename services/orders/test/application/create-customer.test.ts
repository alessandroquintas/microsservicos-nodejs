import { beforeEach, describe, expect, it } from "vitest";
import { CreateCustomerUseCase } from "../../src/application/use-cases/create-customer.ts";
import { CustomerAlreadyExistsError } from "../../src/domain/customer/errors.ts";
import { InMemoryCustomersRepository } from "../fakes/in-memory-customers-repository.ts";

function validArgs() {
  return {
    name: "John Doe",
    email: "johndoe@example.com",
    address: "Rua das Flores, 123",
    state: "PR",
    zipCode: "80000-000",
    country: "Brazil",
  };
}

let customersRepository: InMemoryCustomersRepository;
let sut: CreateCustomerUseCase;

beforeEach(() => {
  customersRepository = new InMemoryCustomersRepository();
  sut = new CreateCustomerUseCase(customersRepository);
});

describe("CreateCustomerUseCase", () => {
  it("creates and saves a customer", async () => {
    const customer = await sut.execute(validArgs());

    expect(customer.email).toBe("johndoe@example.com");
    expect(customersRepository.items).toEqual([customer]);
  });

  it("rejects an email that is already registered", async () => {
    await sut.execute(validArgs());

    await expect(
      sut.execute({ ...validArgs(), email: "JohnDoe@Example.com" }),
    ).rejects.toThrow(CustomerAlreadyExistsError);

    expect(customersRepository.items).toHaveLength(1);
  });
});
