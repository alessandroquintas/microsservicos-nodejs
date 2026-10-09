import type { FastifyInstance } from "fastify";
import { fastifySwagger } from "@fastify/swagger";
import { fastifySwaggerUi } from "@fastify/swagger-ui";
import { jsonSchemaTransform } from "fastify-type-provider-zod";

// Gera o OpenAPI a partir dos schemas zod das rotas e serve a UI em /docs
// (JSON em /docs/json). Precisa ser registrado antes das rotas: o
// @fastify/swagger coleta as rotas no hook onRoute.
export function registerSwagger(app: FastifyInstance) {
  app.register(fastifySwagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Orders API",
        description:
          "Clientes e pedidos. Ao criar um pedido, o serviço publica OrderCreated e a saga segue por invoices e payments.",
        version: "1.0.0",
      },
      tags: [
        { name: "Customers", description: "Cadastro e consulta de clientes" },
        {
          name: "Orders",
          description: "Criação, consulta e cancelamento de pedidos",
        },
      ],
    },
    transform: jsonSchemaTransform,
  });

  app.register(fastifySwaggerUi, { routePrefix: "/docs" });
}
