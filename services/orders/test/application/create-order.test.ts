import { beforeEach, describe, expect, it } from "vitest";
import { CreateOrderUseCase } from "../../src/application/use-cases/create-order.ts";
import { CustomerEntity } from "../../src/domain/customer/customer-entity.ts";
import { CustomerNotFoundError } from "../../src/domain/customer/errors.ts";
import { InMemoryCustomersRepository } from "../fakes/in-memory-customers-repository.ts";
import { InMemoryOrdersRepository } from "../fakes/in-memory-orders-repository.ts";
import { FakeOrderEventsPublisher } from "../fakes/fake-order-events-publisher.ts";
import { OrderStatus } from "../../src/domain/order/order-entity.ts";
import { InvalidOrderAmountError } from "../../src/domain/order/errors.ts";

function makeCustomer() {
  return CustomerEntity.restore({
    id: "customer-1",
    name: "John Doe",
    email: "johndoe@example.com",
    address: "Rua das Flores, 123",
    state: "PR",
    zipCode: "80000-000",
    country: "Brazil",
    dateOfBirth: null,
  });
}

let customersRepository: InMemoryCustomersRepository;
let ordersRepository: InMemoryOrdersRepository;
let orderEventsPublisher: FakeOrderEventsPublisher;
let sut: CreateOrderUseCase;

beforeEach(() => {
  customersRepository = new InMemoryCustomersRepository();
  ordersRepository = new InMemoryOrdersRepository();
  orderEventsPublisher = new FakeOrderEventsPublisher();
  sut = new CreateOrderUseCase(
    customersRepository,
    ordersRepository,
    orderEventsPublisher,
  );

  customersRepository.items.push(makeCustomer());
});

describe("CreateOrderUseCase", () => {
  it("creates and saves a pending order", async () => {
    const order = await sut.execute({
      customerId: "customer-1",
      amountInCents: 100,
    });

    expect(order.status).toBe(OrderStatus.PENDING);
    expect(order.amount.cents).toBe(100);
    expect(ordersRepository.items).toEqual([order]);
  });

  it("publishes OrderCreated with the customer data", async () => {
    const order = await sut.execute({
      customerId: "customer-1",
      amountInCents: 100,
    });

    expect(orderEventsPublisher.published).toEqual([
      {
        orderId: order.id,
        amount: 100,
        customer: {
          id: "customer-1",
          name: "John Doe",
          email: "johndoe@example.com",
        },
      },
    ]);
  });

  it("fails when the customer does not exist", async () => {
    await expect(
      sut.execute({ customerId: "unknown", amountInCents: 100 }),
    ).rejects.toThrow(CustomerNotFoundError);

    expect(ordersRepository.items).toHaveLength(0);
    expect(orderEventsPublisher.published).toHaveLength(0);
  });

  it("fails when the amount is zero", async () => {
    await expect(
      sut.execute({ customerId: "customer-1", amountInCents: 0 }),
    ).rejects.toThrow(InvalidOrderAmountError);

    expect(ordersRepository.items).toHaveLength(0);
    expect(orderEventsPublisher.published).toHaveLength(0);
  });
});
