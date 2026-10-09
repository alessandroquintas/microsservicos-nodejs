import { and, count, desc, eq, type SQL } from "drizzle-orm";
import type {
  InvoicesQuery,
  InvoiceView,
  ListInvoicesFilters,
  Page,
} from "../../../application/queries/invoices-query.ts";
import type { DbExecutor } from "../executor.ts";
import { schema } from "../schema/index.ts";

type InvoiceRow = typeof schema.invoices.$inferSelect;

function toView(row: InvoiceRow): InvoiceView {
  return {
    id: row.id,
    orderId: row.orderId,
    amount: row.amount,
    status: row.status,
    customer: {
      id: row.customerId,
      name: row.customerName,
      email: row.customerEmail,
    },
    dueDate: row.dueDate.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export class DrizzleInvoicesQuery implements InvoicesQuery {
  #db: DbExecutor;

  constructor(db: DbExecutor) {
    this.#db = db;
  }

  async findById(id: string): Promise<InvoiceView | null> {
    const [row] = await this.#db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, id))
      .limit(1);

    return row ? toView(row) : null;
  }

  async list(filters: ListInvoicesFilters): Promise<Page<InvoiceView>> {
    const { page, pageSize, status, orderId } = filters;

    const conditions: SQL[] = [];
    if (status) conditions.push(eq(schema.invoices.status, status));
    if (orderId) conditions.push(eq(schema.invoices.orderId, orderId));
    const where = and(...conditions);

    const [rows, [{ total }]] = await Promise.all([
      this.#db
        .select()
        .from(schema.invoices)
        .where(where)
        .orderBy(desc(schema.invoices.createdAt), desc(schema.invoices.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.#db.select({ total: count() }).from(schema.invoices).where(where),
    ]);

    return { items: rows.map(toView), page, pageSize, total };
  }
}
