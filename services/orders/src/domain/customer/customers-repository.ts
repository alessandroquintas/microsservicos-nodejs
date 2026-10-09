import type { CustomerEntity } from "./customer-entity.ts";

export interface CustomersRepository {
  findById(id: string): Promise<CustomerEntity | null>;
  findByEmail(email: string): Promise<CustomerEntity | null>;
  save(customer: CustomerEntity): Promise<void>;
}
