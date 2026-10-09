import { and, count, desc, eq, type SQL } from "drizzle-orm";
import type {
  ListOrdersFilters,
  OrdersQuery,
  OrderView,
  Page,
} from "../../../application/queries/orders-query.ts";
import type { DbExecutor } from "../executor.ts";
import { schema } from "../schema/index.ts";

type OrderRow = typeof schema.orders.$inferSelect;

function toView(row: OrderRow): OrderView {
  return {
    id: row.id,
    customerId: row.customerId,
    amount: row.amount,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export class DrizzleOrdersQuery implements OrdersQuery {
  #db: DbExecutor;

  constructor(db: DbExecutor) {
    this.#db = db;
  }

  async findById(id: string): Promise<OrderView | null> {
    const [row] = await this.#db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, id))
      .limit(1);

    return row ? toView(row) : null;
  }

  async list(filters: ListOrdersFilters): Promise<Page<OrderView>> {
    const { page, pageSize, status, customerId } = filters;

    const conditions: SQL[] = [];
    if (status) conditions.push(eq(schema.orders.status, status));
    if (customerId) conditions.push(eq(schema.orders.customerId, customerId));
    const where = and(...conditions);

    const [rows, [{ total }]] = await Promise.all([
      this.#db
        .select()
        .from(schema.orders)
        .where(where)
        .orderBy(desc(schema.orders.createdAt), desc(schema.orders.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.#db.select({ total: count() }).from(schema.orders).where(where),
    ]);

    return { items: rows.map(toView), page, pageSize, total };
  }
}
