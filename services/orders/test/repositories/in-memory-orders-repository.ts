import type { OrderEntity } from "../../src/domain/orders-entity.ts";
import type { OrdersRepository } from "../../src/domain/orders-repository.ts";

export class InMemoryOrdersRepository implements OrdersRepository {
  items: OrderEntity[] = [];

  async save(order: OrderEntity): Promise<void> {
    this.items.push(order);
  }
}
