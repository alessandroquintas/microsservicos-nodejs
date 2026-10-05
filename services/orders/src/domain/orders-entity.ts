import { randomUUID } from "node:crypto";
import {
  InvalidCustomerIdError,
  InvalidOrderAmountError,
  InvalidOrderStatusTransitionError,
} from "./errors.ts";
import type { Money } from "./shared/money.ts";

export const OrderStatus = {
  PENDING: "pending",
  PAID: "paid",
  CANCELED: "canceled",
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

type OrderProps = {
  id: string;
  customerId: string;
  amount: Money;
  createdAt: Date;
  status: OrderStatus;
};

export class OrderEntity {
  readonly id: string;
  readonly customerId: string;
  readonly amount: Money;
  readonly createdAt: Date;

  #status: OrderStatus;

  private constructor(props: OrderProps) {
    this.id = props.id;
    this.customerId = props.customerId;
    this.amount = props.amount;
    this.createdAt = props.createdAt;
    this.#status = props.status;
  }

  get status(): OrderStatus {
    return this.#status;
  }

  static create(props: { customerId: string; amount: Money }): OrderEntity {
    const { customerId, amount } = props;

    if (!customerId.trim()) {
      throw new InvalidCustomerIdError();
    }

    if (amount.isZero()) {
      throw new InvalidOrderAmountError();
    }

    return new OrderEntity({
      id: randomUUID(),
      customerId,
      amount,
      status: OrderStatus.PENDING,
      createdAt: new Date(),
    });
  }

  static restore(props: OrderProps): OrderEntity {
    return new OrderEntity(props);
  }

  pay(): void {
    if (this.#status !== OrderStatus.PENDING) {
      throw new InvalidOrderStatusTransitionError(
        this.#status,
        OrderStatus.PAID,
      );
    }

    this.#status = OrderStatus.PAID;
  }

  cancel(): void {
    if (this.#status !== OrderStatus.PENDING) {
      throw new InvalidOrderStatusTransitionError(
        this.#status,
        OrderStatus.CANCELED,
      );
    }

    this.#status = OrderStatus.CANCELED;
  }
}
