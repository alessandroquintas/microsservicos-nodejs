import { eq } from "drizzle-orm";

import { schema } from "../schema/index.ts";
import type { CustomersRepository } from "../../../domain/customer/customers-repository.ts";
import { CustomerEntity } from "../../../domain/customer/customer-entity.ts";
import type { DbExecutor } from "../executor.ts";

export class DrizzleCustomersRepository implements CustomersRepository {
  #db: DbExecutor;

  constructor(db: DbExecutor) {
    this.#db = db;
  }

  async findById(id: string): Promise<CustomerEntity | null> {
    const [row] = await this.#db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.id, id))
      .limit(1);

    if (!row) return null;

    return CustomerEntity.restore({
      ...row,
      dateOfBirth: row.dateOfBirth ?? null,
    });
  }
}
