import { eq } from "drizzle-orm";
import { InvoiceEntity } from "../../../domain/invoice/invoice-entity.ts";
import type { InvoicesRepository } from "../../../domain/invoice/invoices-repository.ts";
import { Money } from "../../../domain/shared/money.ts";
import type { DbExecutor } from "../executor.ts";
import { schema } from "../schema/index.ts";

type InvoiceRow = typeof schema.invoices.$inferSelect;

function toEntity(row: InvoiceRow): InvoiceEntity {
  return InvoiceEntity.restore({
    id: row.id,
    orderId: row.orderId,
    amount: Money.fromCents(row.amount),
    status: row.status,
    customer: {
      id: row.customerId,
      name: row.customerName,
      email: row.customerEmail,
    },
    dueDate: row.dueDate,
    createdAt: row.createdAt,
  });
}

export class DrizzleInvoicesRepository implements InvoicesRepository {
  #db: DbExecutor;

  constructor(db: DbExecutor) {
    this.#db = db;
  }

  async save(invoice: InvoiceEntity): Promise<void> {
    // Sem alvo, o DO NOTHING cobre os dois uniques: o id (fatura já gravada,
    // atualizada abaixo) e o order_id (outra fatura criada para o mesmo pedido
    // numa entrega concorrente, que é ignorada).
    const inserted = await this.#db
      .insert(schema.invoices)
      .values({
        id: invoice.id,
        orderId: invoice.orderId,
        amount: invoice.amount.cents,
        status: invoice.status,
        customerId: invoice.customer.id,
        customerName: invoice.customer.name,
        customerEmail: invoice.customer.email,
        dueDate: invoice.dueDate,
        createdAt: invoice.createdAt,
      })
      .onConflictDoNothing()
      .returning({ id: schema.invoices.id });

    if (inserted.length > 0) return;

    await this.#db
      .update(schema.invoices)
      .set({ status: invoice.status })
      .where(eq(schema.invoices.id, invoice.id));
  }

  async findById(id: string): Promise<InvoiceEntity | null> {
    const [row] = await this.#db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, id))
      .limit(1);

    return row ? toEntity(row) : null;
  }

  async findByOrderId(orderId: string): Promise<InvoiceEntity | null> {
    const [row] = await this.#db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.orderId, orderId))
      .limit(1);

    return row ? toEntity(row) : null;
  }
}
