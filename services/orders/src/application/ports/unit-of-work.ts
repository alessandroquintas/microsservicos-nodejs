import type { OrdersRepository } from "../../domain/order/orders-repository.ts";
import type { OrderEventsPublisher } from "./order-events-publisher.ts";

export type UnitOfWorkContext = {
  orders: OrdersRepository;
  orderEvents: OrderEventsPublisher;
};

export interface UnitOfWork {
  run<T>(work: (context: UnitOfWorkContext) => Promise<T>): Promise<T>;
}
