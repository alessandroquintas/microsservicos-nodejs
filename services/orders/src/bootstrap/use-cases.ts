import { CreateOrderUseCase } from "../application/use-cases/create-order.ts";
import { CreateCustomerUseCase } from "../application/use-cases/create-customer.ts";
import { GetCustomerUseCase } from "../application/use-cases/get-customer.ts";
import { GetOrderUseCase } from "../application/use-cases/get-order.ts";
import { ListOrdersUseCase } from "../application/use-cases/list-orders.ts";
import { MarkOrderAsPaidUseCase } from "../application/use-cases/mark-order-as-paid.ts";
import { CancelOrderUseCase } from "../application/use-cases/cancel-order.ts";
import { db } from "../infra/db/client.ts";
import { DrizzleUnitOfWork } from "../infra/db/drizzle-unit-of-work.ts";
import { DrizzleOrdersQuery } from "../infra/db/queries/drizzle-orders-query.ts";
import { DrizzleCustomersRepository } from "../infra/db/repositories/drizzle-customers-repository.ts";
import { DrizzleOrdersRepository } from "../infra/db/repositories/drizzle-orders-repository.ts";

export function createUseCases() {
  // Adapters de saída
  const customersRepository = new DrizzleCustomersRepository(db);
  const ordersRepository = new DrizzleOrdersRepository(db);
  const unitOfWork = new DrizzleUnitOfWork(db);
  const ordersQuery = new DrizzleOrdersQuery(db);

  return {
    createOrder: new CreateOrderUseCase(customersRepository, unitOfWork),
    createCustomer: new CreateCustomerUseCase(customersRepository),
    getCustomer: new GetCustomerUseCase(customersRepository),
    getOrder: new GetOrderUseCase(ordersQuery),
    listOrders: new ListOrdersUseCase(ordersQuery),
    markOrderAsPaid: new MarkOrderAsPaidUseCase(ordersRepository),
    cancelOrder: new CancelOrderUseCase(ordersRepository, unitOfWork),
  };
}

export type UseCases = ReturnType<typeof createUseCases>;
