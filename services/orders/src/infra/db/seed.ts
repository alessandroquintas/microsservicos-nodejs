import { db } from "./client.ts";
import { DEFAULT_CUSTOMER_ID } from "./default-customer.ts";
import { schema } from "./schema/index.ts";

await db
  .insert(schema.customers)
  .values({
    id: DEFAULT_CUSTOMER_ID,
    name: "John Doe",
    email: "johndoe@example.com",
    address: "Rua das Flores, 123",
    state: "PR",
    zipCode: "80000-000",
    country: "Brazil",
  })
  .onConflictDoNothing();

console.log("Seed completed");

await db.$client.end();
