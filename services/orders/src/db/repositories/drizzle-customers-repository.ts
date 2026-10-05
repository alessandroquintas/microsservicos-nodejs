import { eq } from "drizzle-orm";
import { CustomerEntity } from "../../domain/customer/customer-entity.ts";
import type { CustomersRepository } from "../../domain/customer/customers-repository.ts";
import { db as database } from "../client.ts";
import { schema } from "../schema/index.ts";

type Database = typeof database;

export class DrizzleCustomersRepository implements CustomersRepository {
  #db: Database;

  constructor(db: Database) {
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
