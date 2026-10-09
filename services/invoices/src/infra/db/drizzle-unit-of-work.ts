import type {
  UnitOfWork,
  UnitOfWorkContext,
} from "../../application/ports/unit-of-work.ts";
import type { db as database } from "./client.ts";
import { OutboxInvoiceEventsPublisher } from "./outbox/outbox-invoice-events-publisher.ts";
import { DrizzleInvoicesRepository } from "./repositories/drizzle-invoices-repository.ts";

type Database = typeof database;

export class DrizzleUnitOfWork implements UnitOfWork {
  #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async run<T>(work: (context: UnitOfWorkContext) => Promise<T>): Promise<T> {
    return this.#db.transaction((tx) =>
      work({
        invoices: new DrizzleInvoicesRepository(tx),
        invoiceEvents: new OutboxInvoiceEventsPublisher(tx),
      }),
    );
  }
}
