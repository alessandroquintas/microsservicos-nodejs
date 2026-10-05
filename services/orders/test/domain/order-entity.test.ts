import { describe, it, expect } from "vitest";
import { Money } from "../../src/domain/shared/money.ts";
import { OrderEntity, OrderStatus } from "../../src/domain/orders-entity.ts";
import {
  InvalidCustomerIdError,
  InvalidOrderAmountError,
  InvalidOrderStatusTransitionError,
} from "../../src/domain/errors.ts";

function makeOrder() {
  return OrderEntity.create({
    customerId: "customer-1",
    amount: Money.fromCents(100),
  });
}

describe("OrderEntity", () => {
  it("creates a pending order", () => {
    const order = makeOrder();

    expect(order.id).toEqual(expect.any(String));
    expect(order.status).toBe(OrderStatus.PENDING);
    expect(order.amount.cents).toBe(100);
  });

  it("rejects an order without customer", () => {
    expect(() =>
      OrderEntity.create({ customerId: " ", amount: Money.fromCents(100) }),
    ).toThrow(InvalidCustomerIdError);
  });

  it("rejects an order with zero amount", () => {
    expect(() =>
      OrderEntity.create({
        customerId: "customer-1",
        amount: Money.fromCents(0),
      }),
    ).toThrow(InvalidOrderAmountError);
  });

  it("pays a pending order", () => {
    const order = makeOrder();

    order.pay();

    expect(order.status).toBe(OrderStatus.PAID);
  });

  it("cancels a pending order", () => {
    const order = makeOrder();

    order.cancel();

    expect(order.status).toBe(OrderStatus.CANCELED);
  });

  it("does not cancel a paid order", () => {
    const order = makeOrder();
    order.pay();

    expect(() => order.cancel()).toThrow(InvalidOrderStatusTransitionError);
    expect(order.status).toBe(OrderStatus.PAID);
  });

  it("does not pay a canceled order", () => {
    const order = makeOrder();
    order.cancel();

    expect(() => order.pay()).toThrow(InvalidOrderStatusTransitionError);
    expect(order.status).toBe(OrderStatus.CANCELED);
  });
});
