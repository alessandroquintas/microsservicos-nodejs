import type { CustomerEntity } from "../../domain/customer/customer-entity.ts";
import type { CustomersRepository } from "../../domain/customer/customers-repository.ts";
import { CustomerNotFoundError } from "../../domain/customer/errors.ts";

type GetCustomerArgs = {
  customerId: string;
};

export class GetCustomerUseCase {
  #customersRepository: CustomersRepository;

  constructor(customersRepository: CustomersRepository) {
    this.#customersRepository = customersRepository;
  }

  async execute(args: GetCustomerArgs): Promise<CustomerEntity> {
    const { customerId } = args;
    const customer = await this.#customersRepository.findById(customerId);

    if (!customer) {
      throw new CustomerNotFoundError(customerId);
    }

    return customer;
  }
}
