import { outboxEvents } from "./outbox-events.ts";
import { payments } from "./payments.ts";

export const schema = {
  payments,
  outboxEvents,
};
