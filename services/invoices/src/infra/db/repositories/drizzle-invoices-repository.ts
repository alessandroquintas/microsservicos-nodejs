import { eq } from "drizzle-orm";
import { InvoiceEntity } from "../../../domain/invoice/invoice-entity.ts";
import type { InvoicesRepository } from "../../../domain/invoice/invoices-repository.ts";
import { db as database } from "../client.ts";
import { schema } from "../schema/index.ts";

type Database = typeof database;

export class DrizzleInvoicesRepository implements InvoicesRepository {
  #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async save(invoice: InvoiceEntity): Promise<void> {
    await this.#db
      .insert(schema.invoices)
      .values({
        id: invoice.id,
        orderId: invoice.orderId,
      })
      .onConflictDoNothing({ target: schema.invoices.orderId });
  }

  async findByOrderId(orderId: string): Promise<InvoiceEntity | null> {
    const [row] = await this.#db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.orderId, orderId))
      .limit(1);

    if (!row) {
      return null;
    }

    return InvoiceEntity.restore({ id: row.id, orderId: row.orderId });
  }
}
