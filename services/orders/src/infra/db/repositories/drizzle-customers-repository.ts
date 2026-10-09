import { eq } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";

import { schema } from "../schema/index.ts";
import type { CustomersRepository } from "../../../domain/customer/customers-repository.ts";
import { CustomerEntity } from "../../../domain/customer/customer-entity.ts";
import { CustomerAlreadyExistsError } from "../../../domain/customer/errors.ts";
import type { DbExecutor } from "../executor.ts";

const UNIQUE_VIOLATION = "23505";

type CustomerRow = typeof schema.customers.$inferSelect;

function toEntity(row: CustomerRow): CustomerEntity {
  return CustomerEntity.restore({
    ...row,
    dateOfBirth: row.dateOfBirth ?? null,
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof DrizzleQueryError &&
    (error.cause as { code?: string } | undefined)?.code === UNIQUE_VIOLATION
  );
}

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

    return row ? toEntity(row) : null;
  }

  async findByEmail(email: string): Promise<CustomerEntity | null> {
    const [row] = await this.#db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.email, email))
      .limit(1);

    return row ? toEntity(row) : null;
  }

  async save(customer: CustomerEntity): Promise<void> {
    try {
      await this.#db.insert(schema.customers).values({
        id: customer.id,
        name: customer.name,
        email: customer.email,
        address: customer.address,
        state: customer.state,
        zipCode: customer.zipCode,
        country: customer.country,
        dateOfBirth: customer.dateOfBirth,
      });
    } catch (error) {
      // Corrida entre dois cadastros com o mesmo email: o unique do banco decide.
      if (isUniqueViolation(error)) {
        throw new CustomerAlreadyExistsError(customer.email);
      }

      throw error;
    }
  }
}
