import type { InvoiceCreatedMessage } from "@microservices/contracts";
import type { InvoiceEventsPublisher } from "../../src/application/ports/invoice-events-publisher.ts";

export class FakeInvoiceEventsPublisher implements InvoiceEventsPublisher {
  published: InvoiceCreatedMessage[] = [];

  async publishInvoiceCreated(message: InvoiceCreatedMessage): Promise<void> {
    this.published.push(message);
  }
}
