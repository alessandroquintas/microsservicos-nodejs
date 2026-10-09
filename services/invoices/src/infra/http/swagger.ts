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
        title: "Invoices API",
        description:
          "Consulta das faturas criadas a partir dos pedidos (OrderCreated).",
        version: "1.0.0",
      },
      tags: [{ name: "Invoices", description: "Consulta de faturas" }],
    },
    transform: jsonSchemaTransform,
  });

  app.register(fastifySwaggerUi, { routePrefix: "/docs" });
}
