import {
  PAYMENT_APPROVED_EVENT,
  PAYMENT_FAILED_EVENT,
  paymentApprovedMessageSchema,
  paymentFailedMessageSchema,
  type PaymentApprovedMessage,
  type PaymentFailedMessage,
} from "@microservices/contracts";
import type { PaymentEventsPublisher } from "../../../application/ports/payment-events-publisher.ts";
import type { DbExecutor } from "../executor.ts";
import { schema } from "../schema/index.ts";
import { randomUUID } from "node:crypto";

export class OutboxPaymentEventsPublisher implements PaymentEventsPublisher {
  #db: DbExecutor;

  constructor(db: DbExecutor) {
    this.#db = db;
  }

  async publishPaymentApproved(message: PaymentApprovedMessage): Promise<void> {
    const payload = paymentApprovedMessageSchema.parse(message);

    await this.#db.insert(schema.outboxEvents).values({
      id: randomUUID(),
      type: PAYMENT_APPROVED_EVENT,
      payload,
    });
  }

  async publishPaymentFailed(message: PaymentFailedMessage): Promise<void> {
    const payload = paymentFailedMessageSchema.parse(message);

    await this.#db.insert(schema.outboxEvents).values({
      id: randomUUID(),
      type: PAYMENT_FAILED_EVENT,
      payload,
    });
  }
}
