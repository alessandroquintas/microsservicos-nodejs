import {
  ORDER_CREATED_EVENT,
  orderCreatedMessageSchema,
  type OrderCreatedMessage,
} from "@microservices/contracts";
import type { OrderEventsPublisher } from "../../../application/ports/order-events-publisher.ts";
import type { DbExecutor } from "../executor.ts";
import { schema } from "../schema/index.ts";
import { randomUUID } from "node:crypto";

export class OutboxOrderEventsPublisher implements OrderEventsPublisher {
  #db: DbExecutor;

  constructor(db: DbExecutor) {
    this.#db = db;
  }

  async publishOrderCreated(message: OrderCreatedMessage): Promise<void> {
    const payload = orderCreatedMessageSchema.parse(message);

    await this.#db.insert(schema.outboxEvents).values({
      id: randomUUID(),
      type: ORDER_CREATED_EVENT,
      payload,
    });
  }
}
