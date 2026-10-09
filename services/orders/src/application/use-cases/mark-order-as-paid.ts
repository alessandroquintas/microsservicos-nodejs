import { OrderNotFoundError } from "../../domain/order/errors.ts";
import {
  OrderStatus,
  type OrderEntity,
} from "../../domain/order/order-entity.ts";
import type { OrdersRepository } from "../../domain/order/orders-repository.ts";

type MarkOrderAsPaidArgs = {
  orderId: string;
};

export class MarkOrderAsPaidUseCase {
  #ordersRepository: OrdersRepository;

  constructor(ordersRepository: OrdersRepository) {
    this.#ordersRepository = ordersRepository;
  }

  async execute(args: MarkOrderAsPaidArgs): Promise<OrderEntity> {
    const { orderId } = args;
    const order = await this.#ordersRepository.findById(orderId);

    if (!order) {
      throw new OrderNotFoundError(orderId);
    }

    if (order.status === OrderStatus.PAID) {
      return order;
    }

    order.pay();
    await this.#ordersRepository.save(order);

    return order;
  }
}
