import type { CustomersRepository } from "../../domain/customer/customers-repository.ts";
import { CustomerNotFoundError } from "../../domain/customer/errors.ts";
import { OrderEntity } from "../../domain/order/order-entity.ts";
import { Money } from "../../domain/shared/money.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";

type CreateOrderArgs = {
  customerId: string;
  amountInCents: number;
};

export class CreateOrderUseCase {
  #customersRepository: CustomersRepository;
  #unitOfWork: UnitOfWork;

  constructor(
    customersRepository: CustomersRepository,
    unitOfWork: UnitOfWork,
  ) {
    this.#customersRepository = customersRepository;
    this.#unitOfWork = unitOfWork;
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

    await this.#unitOfWork.run(async ({ orders, orderEvents }) => {
      await orders.save(order);
      await orderEvents.publishOrderCreated({
        orderId: order.id,
        amount: order.amount.cents,
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
        },
      });
    });

    return order;
  }
}
