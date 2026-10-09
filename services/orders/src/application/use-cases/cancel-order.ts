import { OrderNotFoundError } from "../../domain/order/errors.ts";
import {
  OrderStatus,
  type OrderEntity,
} from "../../domain/order/order-entity.ts";
import type { OrdersRepository } from "../../domain/order/orders-repository.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";

type CancelOrderArgs = {
  orderId: string;
  reason: string;
};

export class CancelOrderUseCase {
  #ordersRepository: OrdersRepository;
  #unitOfWork: UnitOfWork;

  constructor(ordersRepository: OrdersRepository, unitOfWork: UnitOfWork) {
    this.#ordersRepository = ordersRepository;
    this.#unitOfWork = unitOfWork;
  }

  async execute(args: CancelOrderArgs): Promise<OrderEntity> {
    const { orderId, reason } = args;
    const order = await this.#ordersRepository.findById(orderId);

    if (!order) {
      throw new OrderNotFoundError(orderId);
    }

    // O OrderCanceled foi gravado junto com o primeiro cancelamento.
    if (order.status === OrderStatus.CANCELED) {
      return order;
    }

    order.cancel();

    await this.#unitOfWork.run(async ({ orders, orderEvents }) => {
      await orders.save(order);
      await orderEvents.publishOrderCanceled({ orderId: order.id, reason });
    });

    return order;
  }
}
