import { randomUUID } from "node:crypto";
import {
  InvalidFailureReasonError,
  InvalidInvoiceIdError,
  InvalidPaymentAmountError,
} from "./errors.ts";
import type { Money } from "../shared/money.ts";

export const PaymentStatus = {
  APPROVED: "approved",
  FAILED: "failed",
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

type PaymentProps = {
  id: string;
  invoiceId: string;
  orderId: string;
  amount: Money;
  status: PaymentStatus;
  failureReason: string | null;
  createdAt: Date;
};

type NewPaymentProps = {
  invoiceId: string;
  orderId: string;
  amount: Money;
};

export class PaymentEntity {
  readonly id: string;
  readonly invoiceId: string;
  readonly orderId: string;
  readonly amount: Money;
  readonly status: PaymentStatus;
  readonly failureReason: string | null;
  readonly createdAt: Date;

  private constructor(props: PaymentProps) {
    this.id = props.id;
    this.invoiceId = props.invoiceId;
    this.orderId = props.orderId;
    this.amount = props.amount;
    this.status = props.status;
    this.failureReason = props.failureReason;
    this.createdAt = props.createdAt;
  }

  static approve(props: NewPaymentProps): PaymentEntity {
    return PaymentEntity.#create(props, PaymentStatus.APPROVED, null);
  }

  static fail(props: NewPaymentProps, reason: string): PaymentEntity {
    if (!reason?.trim()) {
      throw new InvalidFailureReasonError();
    }

    return PaymentEntity.#create(props, PaymentStatus.FAILED, reason);
  }

  static restore(props: PaymentProps): PaymentEntity {
    return new PaymentEntity(props);
  }

  static #create(
    props: NewPaymentProps,
    status: PaymentStatus,
    failureReason: string | null,
  ): PaymentEntity {
    const { invoiceId, orderId, amount } = props;

    if (!invoiceId?.trim()) {
      throw new InvalidInvoiceIdError();
    }

    if (amount.isZero()) {
      throw new InvalidPaymentAmountError();
    }

    return new PaymentEntity({
      id: randomUUID(),
      invoiceId,
      orderId,
      amount,
      status,
      failureReason,
      createdAt: new Date(),
    });
  }
}
