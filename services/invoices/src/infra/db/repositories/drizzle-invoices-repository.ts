import type { InvoiceEntity } from "../../../domain/invoices-entity.ts";
import type { InvoicesRepository } from "../../../domain/invoices-repository.ts";
import { db as database } from "../client.ts";
import { schema } from "../schema/index.ts";

type Database = typeof database;

export class DrizzleInvoicesRepository implements InvoicesRepository {
  #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async save(invoice: InvoiceEntity): Promise<void> {
    await this.#db.insert(schema.invoices).values({
      id: invoice.id,
      orderId: invoice.orderId,
    });
  }
}
