import {
  INVOICE_CREATED_EVENT,
  INVOICE_CREATED_ROUTING_KEY,
} from "@microservices/contracts";

// Tipo do evento gravado no outbox → routing key usada pelo OutboxRelay.
export const ROUTING_KEY_BY_EVENT_TYPE: Record<string, string> = {
  [INVOICE_CREATED_EVENT]: INVOICE_CREATED_ROUTING_KEY,
};
