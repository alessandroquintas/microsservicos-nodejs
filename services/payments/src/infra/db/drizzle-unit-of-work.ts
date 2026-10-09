import type {
  UnitOfWork,
  UnitOfWorkContext,
} from "../../application/ports/unit-of-work.ts";
import type { db as database } from "./client.ts";
import { OutboxPaymentEventsPublisher } from "./outbox/outbox-payment-events-publisher.ts";
import { DrizzlePaymentsRepository } from "./repositories/drizzle-payments-repository.ts";

type Database = typeof database;

export class DrizzleUnitOfWork implements UnitOfWork {
  #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async run<T>(work: (context: UnitOfWorkContext) => Promise<T>): Promise<T> {
    return this.#db.transaction((tx) =>
      work({
        payments: new DrizzlePaymentsRepository(tx),
        paymentEvents: new OutboxPaymentEventsPublisher(tx),
      }),
    );
  }
}
