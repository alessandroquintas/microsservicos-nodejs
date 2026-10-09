import {
  ORDER_CANCELED_EVENT,
  ORDER_CANCELED_ROUTING_KEY,
  ORDER_CREATED_EVENT,
  ORDER_CREATED_ROUTING_KEY,
} from "@microservices/contracts";

// Tipo do evento gravado no outbox → routing key usada pelo OutboxRelay.
export const ROUTING_KEY_BY_EVENT_TYPE: Record<string, string> = {
  [ORDER_CREATED_EVENT]: ORDER_CREATED_ROUTING_KEY,
  [ORDER_CANCELED_EVENT]: ORDER_CANCELED_ROUTING_KEY,
};
