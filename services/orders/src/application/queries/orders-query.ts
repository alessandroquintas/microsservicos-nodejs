import type { OrderStatus } from "../../domain/order/order-entity.ts";

export type OrderView = {
  id: string;
  customerId: string;
  amount: number;
  status: OrderStatus;
  createdAt: string;
};

export type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

export type ListOrdersFilters = {
  page: number;
  pageSize: number;
  status?: OrderStatus;
  customerId?: string;
};

export interface OrdersQuery {
  findById(id: string): Promise<OrderView | null>;
  list(filters: ListOrdersFilters): Promise<Page<OrderView>>;
}
