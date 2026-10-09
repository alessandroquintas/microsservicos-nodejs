import type { OrderEntity } from "../../src/domain/order/order-entity.ts";
import type { OrdersRepository } from "../../src/domain/order/orders-repository.ts";

export class InMemoryOrdersRepository implements OrdersRepository {
  items: OrderEntity[] = [];

  async save(order: OrderEntity): Promise<void> {
    const index = this.items.findIndex((item) => item.id === order.id);

    if (index >= 0) {
      this.items[index] = order;
      return;
    }

    this.items.push(order);
  }

  async findById(id: string): Promise<OrderEntity | null> {
    return this.items.find((order) => order.id === id) ?? null;
  }
}
