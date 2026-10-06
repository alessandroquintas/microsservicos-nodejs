import type { CustomersRepository } from "../../domain/customer/customers-repository.ts";
import { CustomerNotFoundError } from "../../domain/customer/errors.ts";
import { OrderEntity } from "../../domain/order/order-entity.ts";
import type { OrdersRepository } from "../../domain/order/orders-repository.ts";
import { Money } from "../../domain/shared/money.ts";
import type { OrderEventsPublisher } from "../ports/order-events-publisher.ts";

type CreateOrderArgs = {
  customerId: string;
  amountInCents: number;
};

export class CreateOrderUseCase {
  #customersRepository: CustomersRepository;
  #ordersRepository: OrdersRepository;
  #orderEventsPublisher: OrderEventsPublisher;

  constructor(
    customersRepository: CustomersRepository,
    ordersRepository: OrdersRepository,
    orderEventsPublisher: OrderEventsPublisher,
  ) {
    this.#customersRepository = customersRepository;
    this.#ordersRepository = ordersRepository;
    this.#orderEventsPublisher = orderEventsPublisher;
  }

  async execute(args: CreateOrderArgs): Promise<OrderEntity> {
    const { customerId, amountInCents } = args;
    const customer = await this.#customersRepository.findById(customerId);

    if (!customer) {
      throw new CustomerNotFoundError(customerId);
    }

    const order = OrderEntity.create({
      customerId: customer.id,
      amount: Money.fromCents(amountInCents),
    });

    await this.#ordersRepository.save(order);

    await this.#orderEventsPublisher.publishOrderCreated({
      orderId: order.id,
      amount: order.amount.cents,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
      },
    });

    return order;
  }
}
