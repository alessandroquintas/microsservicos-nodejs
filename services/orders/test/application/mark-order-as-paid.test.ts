import { beforeEach, describe, expect, it } from "vitest";
import { MarkOrderAsPaidUseCase } from "../../src/application/use-cases/mark-order-as-paid.ts";
import {
  InvalidOrderStatusTransitionError,
  OrderNotFoundError,
} from "../../src/domain/order/errors.ts";
import {
  OrderEntity,
  OrderStatus,
} from "../../src/domain/order/order-entity.ts";
import { Money } from "../../src/domain/shared/money.ts";
import { InMemoryOrdersRepository } from "../fakes/in-memory-orders-repository.ts";

let ordersRepository: InMemoryOrdersRepository;
let sut: MarkOrderAsPaidUseCase;
let order: OrderEntity;

beforeEach(() => {
  ordersRepository = new InMemoryOrdersRepository();
  sut = new MarkOrderAsPaidUseCase(ordersRepository);

  order = OrderEntity.create({
    customerId: "customer-1",
    amount: Money.fromCents(100),
  });
  ordersRepository.items.push(order);
});

describe("MarkOrderAsPaidUseCase", () => {
  it("pays a pending order", async () => {
    await sut.execute({ orderId: order.id });

    const [saved] = ordersRepository.items;
    expect(saved.status).toBe(OrderStatus.PAID);
  });

  it("does nothing when the order is already paid", async () => {
    await sut.execute({ orderId: order.id });

    const result = await sut.execute({ orderId: order.id });

    expect(result.status).toBe(OrderStatus.PAID);
    expect(ordersRepository.items).toHaveLength(1);
  });

  it("fails when the order does not exist", async () => {
    await expect(sut.execute({ orderId: "unknown" })).rejects.toThrow(
      OrderNotFoundError,
    );
  });

  it("does not pay a canceled order", async () => {
    order.cancel();

    await expect(sut.execute({ orderId: order.id })).rejects.toThrow(
      InvalidOrderStatusTransitionError,
    );
    expect(ordersRepository.items[0].status).toBe(OrderStatus.CANCELED);
  });
});
