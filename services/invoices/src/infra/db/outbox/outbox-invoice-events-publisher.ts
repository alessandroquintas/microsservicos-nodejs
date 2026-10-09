import {
  INVOICE_CREATED_EVENT,
  invoiceCreatedMessageSchema,
  type InvoiceCreatedMessage,
} from "@microservices/contracts";
import type { InvoiceEventsPublisher } from "../../../application/ports/invoice-events-publisher.ts";
import type { DbExecutor } from "../executor.ts";
import { schema } from "../schema/index.ts";
import { randomUUID } from "node:crypto";

export class OutboxInvoiceEventsPublisher implements InvoiceEventsPublisher {
  #db: DbExecutor;

  constructor(db: DbExecutor) {
    this.#db = db;
  }

  async publishInvoiceCreated(message: InvoiceCreatedMessage): Promise<void> {
    const payload = invoiceCreatedMessageSchema.parse(message);

    await this.#db.insert(schema.outboxEvents).values({
      id: randomUUID(),
      type: INVOICE_CREATED_EVENT,
      payload,
    });
  }
}
