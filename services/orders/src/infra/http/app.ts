import { fastify } from "fastify";
import { fastifyCors } from "@fastify/cors";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { CreateOrderUseCase } from "../../application/use-cases/create-order.ts";
import type { CreateCustomerUseCase } from "../../application/use-cases/create-customer.ts";
import type { GetCustomerUseCase } from "../../application/use-cases/get-customer.ts";
import type { GetOrderUseCase } from "../../application/use-cases/get-order.ts";
import type { ListOrdersUseCase } from "../../application/use-cases/list-orders.ts";
import type { CancelOrderUseCase } from "../../application/use-cases/cancel-order.ts";
import { DOMAIN_ERROR_STATUSES } from "./common/errors/domain-error-statuses.ts";
import { createErrorHandler } from "./common/errors/error-handler.ts";
import { CustomersController } from "./controllers/customers-controller.ts";
import { OrdersController } from "./controllers/orders-controller.ts";
import { customersRoutes } from "./routes/customers-routes.ts";
import { ordersRoutes } from "./routes/orders-routes.ts";

type AppDependencies = {
  createOrder: Pick<CreateOrderUseCase, "execute">;
  createCustomer: Pick<CreateCustomerUseCase, "execute">;
  getCustomer: Pick<GetCustomerUseCase, "execute">;
  getOrder: Pick<GetOrderUseCase, "execute">;
  listOrders: Pick<ListOrdersUseCase, "execute">;
  cancelOrder: Pick<CancelOrderUseCase, "execute">;
};

export function buildApp({
  createOrder,
  createCustomer,
  getCustomer,
  getOrder,
  listOrders,
  cancelOrder,
}: AppDependencies) {
  const app = fastify().withTypeProvider<ZodTypeProvider>();

  app.setSerializerCompiler(serializerCompiler);
  app.setValidatorCompiler(validatorCompiler);
  app.setErrorHandler(createErrorHandler(DOMAIN_ERROR_STATUSES));

  app.register(fastifyCors, { origin: "*" });

  app.get("/health", () => {
    return "Ok";
  });

  const customersController = new CustomersController(
    createCustomer,
    getCustomer,
  );
  const ordersController = new OrdersController(
    createOrder,
    getOrder,
    listOrders,
    cancelOrder,
  );

  app.register(customersRoutes(customersController));
  app.register(ordersRoutes(ordersController));

  return app;
}
