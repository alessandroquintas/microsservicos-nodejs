import { randomUUID } from "node:crypto";
import {
  InvalidInvoiceAmountError,
  InvalidInvoiceStatusTransitionError,
  InvalidOrderIdError,
} from "./errors.ts";
import type { Money } from "../shared/money.ts";

export const InvoiceStatus = {
  OPEN: "open",
  PAID: "paid",
  CANCELED: "canceled",
} as const;

export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export type InvoiceCustomer = {
  id: string;
  name: string;
  email: string;
};

const DUE_IN_DAYS = 7;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

type InvoiceProps = {
  id: string;
  orderId: string;
  amount: Money;
  status: InvoiceStatus;
  customer: InvoiceCustomer;
  dueDate: Date;
  createdAt: Date;
};

export class InvoiceEntity {
  readonly id: string;
  readonly orderId: string;
  readonly amount: Money;
  readonly customer: InvoiceCustomer;
  readonly dueDate: Date;
  readonly createdAt: Date;

  #status: InvoiceStatus;

  private constructor(props: InvoiceProps) {
    this.id = props.id;
    this.orderId = props.orderId;
    this.amount = props.amount;
    this.customer = props.customer;
    this.dueDate = props.dueDate;
    this.createdAt = props.createdAt;
    this.#status = props.status;
  }

  get status(): InvoiceStatus {
    return this.#status;
  }

  static create(props: {
    orderId: string;
    amount: Money;
    customer: InvoiceCustomer;
  }): InvoiceEntity {
    const { orderId, amount, customer } = props;

    if (!orderId?.trim()) {
      throw new InvalidOrderIdError();
    }

    if (amount.isZero()) {
      throw new InvalidInvoiceAmountError();
    }

    const createdAt = new Date();

    return new InvoiceEntity({
      id: randomUUID(),
      orderId,
      amount,
      status: InvoiceStatus.OPEN,
      customer: { ...customer },
      dueDate: new Date(createdAt.getTime() + DUE_IN_DAYS * DAY_IN_MS),
      createdAt,
    });
  }

  static restore(props: InvoiceProps): InvoiceEntity {
    return new InvoiceEntity(props);
  }

  markAsPaid(): void {
    this.#transitionTo(InvoiceStatus.PAID);
  }

  cancel(): void {
    this.#transitionTo(InvoiceStatus.CANCELED);
  }

  #transitionTo(target: InvoiceStatus): void {
    if (this.#status === target) return;

    if (this.#status !== InvoiceStatus.OPEN) {
      throw new InvalidInvoiceStatusTransitionError(this.#status, target);
    }

    this.#status = target;
  }
}
