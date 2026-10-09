import type {
  ListOrdersFilters,
  OrdersQuery,
  OrderView,
  Page,
} from "../queries/orders-query.ts";

type ListOrdersArgs = ListOrdersFilters;

export class ListOrdersUseCase {
  #ordersQuery: OrdersQuery;

  constructor(ordersQuery: OrdersQuery) {
    this.#ordersQuery = ordersQuery;
  }

  async execute(args: ListOrdersArgs): Promise<Page<OrderView>> {
    return this.#ordersQuery.list(args);
  }
}
