import type { OrderEntity } from "../../../domain/order/order-entity.ts";
import type { OrdersRepository } from "../../../domain/order/orders-repository.ts";
import { schema } from "../schema/index.ts";
import type { DbExecutor } from "../executor.ts";

export class DrizzleOrdersRepository implements OrdersRepository {
  #db: DbExecutor;

  constructor(db: DbExecutor) {
    this.#db = db;
  }

  async save(order: OrderEntity): Promise<void> {
    await this.#db.insert(schema.orders).values({
      id: order.id,
      customerId: order.customerId,
      amount: order.amount.cents,
      status: order.status,
      createdAt: order.createdAt,
    });
  }
}
