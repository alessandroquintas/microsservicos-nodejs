import type { OrderEntity } from "./orders-entity.ts";

export interface OrdersRepository {
  save(order: OrderEntity): Promise<void>;
}
