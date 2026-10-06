import type {
  UnitOfWork,
  UnitOfWorkContext,
} from "../../application/ports/unit-of-work.ts";
import type { db as database } from "./client.ts";
import { OutboxOrderEventsPublisher } from "./outbox/outbox-order-events-publisher.ts";
import { DrizzleOrdersRepository } from "./repositories/drizzle-orders-repository.ts";

type Database = typeof database;

export class DrizzleUnitOfWork implements UnitOfWork {
  #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async run<T>(work: (context: UnitOfWorkContext) => Promise<T>): Promise<T> {
    return this.#db.transaction((tx) =>
      work({
        orders: new DrizzleOrdersRepository(tx),
        orderEvents: new OutboxOrderEventsPublisher(tx),
      }),
    );
  }
}
