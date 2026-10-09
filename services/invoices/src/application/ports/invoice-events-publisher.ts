import type { InvoiceCreatedMessage } from "@microservices/contracts";

export interface InvoiceEventsPublisher {
  publishInvoiceCreated(message: InvoiceCreatedMessage): Promise<void>;
}
