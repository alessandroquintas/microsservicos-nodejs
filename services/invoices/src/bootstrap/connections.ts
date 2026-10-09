import { db } from "../infra/db/client.ts";
import { invoicesChannel } from "../infra/messaging/channels/invoices.ts";
import { ordersChannel } from "../infra/messaging/channels/orders.ts";
import { paymentsChannel } from "../infra/messaging/channels/payments.ts";
import {
  broker,
  markBrokerShuttingDown,
} from "../infra/messaging/client.ts";

// Último passo do shutdown: channels, broker e banco, nessa ordem.
export async function closeConnections() {
  markBrokerShuttingDown();
  await ordersChannel.close();
  await paymentsChannel.close();
  await invoicesChannel.close();
  await broker.close();
  await db.$client.end();
}
