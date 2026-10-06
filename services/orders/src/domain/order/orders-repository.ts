import type { OrderEntity } from "./order-entity.ts";

export interface OrdersRepository {
  save(order: OrderEntity): Promise<void>;
}
