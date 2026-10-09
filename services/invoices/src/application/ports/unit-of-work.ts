import type { InvoicesRepository } from "../../domain/invoice/invoices-repository.ts";
import type { InvoiceEventsPublisher } from "./invoice-events-publisher.ts";

export type UnitOfWorkContext = {
  invoices: InvoicesRepository;
  invoiceEvents: InvoiceEventsPublisher;
};

export interface UnitOfWork {
  run<T>(work: (context: UnitOfWorkContext) => Promise<T>): Promise<T>;
}
