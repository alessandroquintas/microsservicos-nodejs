import { OrderNotFoundError } from "../../domain/order/errors.ts";
import type { OrdersQuery, OrderView } from "../queries/orders-query.ts";

type GetOrderArgs = {
  orderId: string;
};

export class GetOrderUseCase {
  #ordersQuery: OrdersQuery;

  constructor(ordersQuery: OrdersQuery) {
    this.#ordersQuery = ordersQuery;
  }

  async execute(args: GetOrderArgs): Promise<OrderView> {
    const { orderId } = args;
    const order = await this.#ordersQuery.findById(orderId);

    if (!order) {
      throw new OrderNotFoundError(orderId);
    }

    return order;
  }
}
