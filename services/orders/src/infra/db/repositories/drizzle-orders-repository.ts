import type { OrderEntity } from "../../../domain/order/order-entity.ts";
import type { OrdersRepository } from "../../../domain/order/orders-repository.ts";
import { db as database } from "../client.ts";
import { schema } from "../schema/index.ts";

type Database = typeof database;

export class DrizzleOrdersRepository implements OrdersRepository {
  #db: Database;

  constructor(db: Database) {
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
