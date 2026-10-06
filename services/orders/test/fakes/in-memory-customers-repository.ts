import type { CustomerEntity } from "../../src/domain/customer/customer-entity.ts";
import type { CustomersRepository } from "../../src/domain/customer/customers-repository.ts";

export class InMemoryCustomersRepository implements CustomersRepository {
  items: CustomerEntity[] = [];

  async findById(id: string): Promise<CustomerEntity | null> {
    return this.items.find((customer) => customer.id === id) ?? null;
  }
}
