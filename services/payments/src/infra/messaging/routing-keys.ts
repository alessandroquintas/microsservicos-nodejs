import {
  PAYMENT_APPROVED_EVENT,
  PAYMENT_APPROVED_ROUTING_KEY,
  PAYMENT_FAILED_EVENT,
  PAYMENT_FAILED_ROUTING_KEY,
} from "@microservices/contracts";

// Tipo do evento gravado no outbox → routing key usada pelo OutboxRelay.
export const ROUTING_KEY_BY_EVENT_TYPE: Record<string, string> = {
  [PAYMENT_APPROVED_EVENT]: PAYMENT_APPROVED_ROUTING_KEY,
  [PAYMENT_FAILED_EVENT]: PAYMENT_FAILED_ROUTING_KEY,
};
