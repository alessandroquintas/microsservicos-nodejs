import type {
  ListOrdersFilters,
  OrdersQuery,
  OrderView,
  Page,
} from "../../src/application/queries/orders-query.ts";

export class FakeOrdersQuery implements OrdersQuery {
  items: OrderView[] = [];

  async findById(id: string): Promise<OrderView | null> {
    return this.items.find((order) => order.id === id) ?? null;
  }

  async list(filters: ListOrdersFilters): Promise<Page<OrderView>> {
    const { page, pageSize, status, customerId } = filters;

    const matching = this.items
      .filter((order) => !status || order.status === status)
      .filter((order) => !customerId || order.customerId === customerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const start = (page - 1) * pageSize;

    return {
      items: matching.slice(start, start + pageSize),
      page,
      pageSize,
      total: matching.length,
    };
  }
}
