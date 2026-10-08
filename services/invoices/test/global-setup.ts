import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

export async function setup() {
  process.loadEnvFile(".env.test");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be configured in .env.test.");
  }

  const db = drizzle(process.env.DATABASE_URL);

  try {
    await migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL("../src/infra/db/migrations", import.meta.url),
      ),
    });
  } finally {
    await db.$client.end();
  }
}
