import { eq } from "drizzle-orm";
import { OrderEntity } from "../../../domain/order/order-entity.ts";
import type { OrdersRepository } from "../../../domain/order/orders-repository.ts";
import { Money } from "../../../domain/shared/money.ts";
import { schema } from "../schema/index.ts";
import type { DbExecutor } from "../executor.ts";

export class DrizzleOrdersRepository implements OrdersRepository {
  #db: DbExecutor;

  constructor(db: DbExecutor) {
    this.#db = db;
  }

  async save(order: OrderEntity): Promise<void> {
    await this.#db
      .insert(schema.orders)
      .values({
        id: order.id,
        customerId: order.customerId,
        amount: order.amount.cents,
        status: order.status,
        createdAt: order.createdAt,
      })
      .onConflictDoUpdate({
        target: schema.orders.id,
        set: { status: order.status },
      });
  }

  async findById(id: string): Promise<OrderEntity | null> {
    const [row] = await this.#db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, id))
      .limit(1);

    if (!row) {
      return null;
    }

    return OrderEntity.restore({
      ...row,
      amount: Money.fromCents(row.amount),
    });
  }
}
