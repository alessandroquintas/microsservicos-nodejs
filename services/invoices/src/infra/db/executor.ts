import { db } from "./client.ts";

export type DbExecutor = Pick<
  typeof db,
  "select" | "insert" | "update" | "delete"
>;
