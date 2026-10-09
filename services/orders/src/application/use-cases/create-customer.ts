import { CustomerEntity } from "../../domain/customer/customer-entity.ts";
import type { CustomersRepository } from "../../domain/customer/customers-repository.ts";
import { CustomerAlreadyExistsError } from "../../domain/customer/errors.ts";

type CreateCustomerArgs = {
  name: string;
  email: string;
  address: string;
  state: string;
  zipCode: string;
  country: string;
  dateOfBirth?: Date | null;
};

export class CreateCustomerUseCase {
  #customersRepository: CustomersRepository;

  constructor(customersRepository: CustomersRepository) {
    this.#customersRepository = customersRepository;
  }

  async execute(args: CreateCustomerArgs): Promise<CustomerEntity> {
    const customer = CustomerEntity.create(args);

    const existing = await this.#customersRepository.findByEmail(
      customer.email,
    );

    if (existing) {
      throw new CustomerAlreadyExistsError(customer.email);
    }

    await this.#customersRepository.save(customer);

    return customer;
  }
}
