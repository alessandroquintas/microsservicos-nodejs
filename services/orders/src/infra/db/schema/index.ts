import { customers } from "./customers.ts";
import { orders } from "./orders.ts";
import { outboxEvents } from "./outbox-events.ts";

export const schema = {
  orders,
  customers,
  outboxEvents,
};
