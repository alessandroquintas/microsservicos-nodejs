import { beforeEach, describe, expect, it } from "vitest";
import { CancelOrderUseCase } from "../../src/application/use-cases/cancel-order.ts";
import {
  InvalidOrderStatusTransitionError,
  OrderNotFoundError,
} from "../../src/domain/order/errors.ts";
import {
  OrderEntity,
  OrderStatus,
} from "../../src/domain/order/order-entity.ts";
import { Money } from "../../src/domain/shared/money.ts";
import { FakeOrderEventsPublisher } from "../fakes/fake-order-events-publisher.ts";
import { InMemoryOrdersRepository } from "../fakes/in-memory-orders-repository.ts";
import { InMemoryUnitOfWork } from "../fakes/in-memory-unit-of-work.ts";

let ordersRepository: InMemoryOrdersRepository;
let orderEventsPublisher: FakeOrderEventsPublisher;
let sut: CancelOrderUseCase;
let order: OrderEntity;

beforeEach(() => {
  ordersRepository = new InMemoryOrdersRepository();
  orderEventsPublisher = new FakeOrderEventsPublisher();
  sut = new CancelOrderUseCase(
    ordersRepository,
    new InMemoryUnitOfWork(ordersRepository, orderEventsPublisher),
  );

  order = OrderEntity.create({
    customerId: "customer-1",
    amount: Money.fromCents(100),
  });
  ordersRepository.items.push(order);
});

describe("CancelOrderUseCase", () => {
  it("cancels a pending order and publishes OrderCanceled", async () => {
    const result = await sut.execute({
      orderId: order.id,
      reason: "Card declined",
    });

    expect(result.status).toBe(OrderStatus.CANCELED);
    expect(ordersRepository.items[0].status).toBe(OrderStatus.CANCELED);
    expect(orderEventsPublisher.canceled).toEqual([
      { orderId: order.id, reason: "Card declined" },
    ]);
  });

  it("does nothing when the order is already canceled", async () => {
    await sut.execute({ orderId: order.id, reason: "Card declined" });

    const result = await sut.execute({
      orderId: order.id,
      reason: "Card declined",
    });

    expect(result.status).toBe(OrderStatus.CANCELED);
    expect(orderEventsPublisher.canceled).toHaveLength(1);
  });

  it("fails when the order does not exist", async () => {
    await expect(
      sut.execute({ orderId: "unknown", reason: "Card declined" }),
    ).rejects.toThrow(OrderNotFoundError);
  });

  it("does not cancel a paid order", async () => {
    order.pay();

    await expect(
      sut.execute({ orderId: order.id, reason: "Card declined" }),
    ).rejects.toThrow(InvalidOrderStatusTransitionError);
    expect(ordersRepository.items[0].status).toBe(OrderStatus.PAID);
    expect(orderEventsPublisher.canceled).toHaveLength(0);
  });
});
