# CLAUDE.md

Guia rápido para trabalhar neste repositório. Os detalhes estão em [ARCHITECTURE.md](ARCHITECTURE.md).

## O que é

Monorepo (npm workspaces), Node.js + TypeScript (Fastify 5, Drizzle/pg, amqplib, zod 4, Vitest, OpenTelemetry). Três serviços numa saga coreografada pela exchange topic `events` (ARCHITECTURE.md §1.1):

- `services/orders` (:3333, Postgres :5482): `/customers` e `/orders` (criar, listar, consultar, `POST /orders/:id/cancel`). Publica `OrderCreated` e `OrderCanceled`; consome `PaymentApproved` (pedido `paid`) e `PaymentFailed` (cancela o pedido).
- `services/invoices` (:3334, Postgres :5483): cria a fatura no `OrderCreated` e publica `InvoiceCreated`; marca paga no `PaymentApproved`; cancela no `OrderCanceled`. `GET /invoices` e `GET /invoices/:id`.
- `services/payments` (:3335, Postgres :5484): consome `InvoiceCreated`, cobra no `FakePaymentGateway` (`PAYMENT_APPROVAL_RATE`, 0 a 1) e publica `PaymentApproved` ou `PaymentFailed`. Só `/health`.
- `packages/contracts`: schemas zod das mensagens, `EVENTS_EXCHANGE`, tipos de evento e routing keys.
- `packages/messaging`: `connectWithRetry`, `startConsumer` + `InvalidMessageError`, `declareConsumerQueues` e `OutboxRelay` com a porta `OutboxStore` (ARCHITECTURE.md §4.6).
- `docker/kong`: gateway (:8000, `/orders`, `/customers`, `/invoices`). `infra/`: Pulumi (orders, invoices, payments, rabbitmq e kong no ECS Fargate; o payments sem load balancer), **fora** dos workspaces.

## Comandos

```bash
npm install && npm run typecheck && npm test        # na raiz
npm test -w @microservices/orders                   # um workspace
docker compose up -d                                # RabbitMQ, Jaeger, Kong
docker compose -f services/<svc>/docker-compose.yml up -d --wait   # Postgres do serviço; volume nomeado, down -v apaga os dados
DATABASE_URL=postgresql://docker:docker@127.0.0.1:<porta>/<svc> npm run db:migrate -w @microservices/<svc>
npm run dev -w @microservices/invoices              # depois payments e orders (cada um declara as próprias filas)
npm run db:seed -w @microservices/orders            # customer padrão para testes manuais (idempotente)
```

Os testes em `test/infra/db/` precisam do Postgres do serviço rodando (o `globalSetup` do Vitest aplica as migrations). Nenhum teste precisa de RabbitMQ. Antes de concluir uma mudança, rode `npm run typecheck` e `npm test` (é o que o CI roda).

## Arquitetura hexagonal

- `src/domain/<agregado>/` (+ `shared/`): não importa de `application`, `infra` nem de pacotes de terceiros (só built-ins como `node:crypto`).
- `src/application/`: `use-cases/` (classe com `execute(args)`), `ports/` e `queries/` (portas de leitura que devolvem DTOs, sem passar pelas entidades). Importa só de `domain` e tipos de `@microservices/contracts`.
- `src/infra/`: adapters (`db/`, `http/`, `messaging/`, `gateway/`). Adapters de entrada recebem `Pick<XUseCase, "execute">`. HTTP: `schemas/` (zod) → `routes/` (plugin Fastify, só monta a rota) → `controllers/` (chama o use case e devolve `HttpResponse`); erro de domínio vira status em `http/common/errors/domain-error-statuses.ts`, sem try/catch nas rotas. Erros e respostas HTTP compartilhados ficam em `http/common/{errors,responses}/`.
- `src/bootstrap/` + `src/server.ts`: composition root, o único lugar que instancia adapters concretos. `bootstrap/use-cases.ts` (`createUseCases()`: adapters de saída + use cases), `bootstrap/messaging.ts` (`startConsumers`, `startOutboxRelay`), `bootstrap/connections.ts` (`closeConnections`) e `bootstrap/graceful-shutdown.ts`. O `server.ts` só liga essas peças ao Fastify.
- Nova dependência de use case: interface (repositório em `domain/<agregado>/`, outras em `application/ports/`), adapter em `infra/`, fake em `test/fakes/`, ligação no `bootstrap/use-cases.ts`.
- Bounded contexts não importam código uns dos outros (cada serviço tem o próprio `Money`).

## Mensageria

- O schema fica em `packages/contracts`, o envelope é sempre `{ data }`.
- Todo evento sai pelo outbox: grave no `outbox_events` dentro do `UnitOfWork` (validando com o schema) e registre o tipo em `infra/messaging/routing-keys.ts`. Nunca publique direto no RabbitMQ.
- Todo consumidor tem fila principal, `.retry` e `.dlq` próprias (`declareConsumerQueues` em `topology.ts`) e é idempotente.
- O handler só lança: `InvalidMessageError` para mensagem inválida, e os erros de negócio permanentes viram `InvalidMessageError` via `toPermanentError(error, [...])` (DLQ direto). O resto vai para o retry (3× de 5 s). O `startConsumer` decide ack/retry/DLQ. Ver ARCHITECTURE.md §4.3.

## Convenções obrigatórias

Roda com `node --experimental-strip-types`, sem build:

- **Sem `enum`** (use `as const` + type derivado), **sem parameter properties**, sem `namespace`.
- **Imports relativos com extensão `.ts`** e **`import type`** para tudo que é só tipo (`verbatimModuleSyntax`).

Estilo:

- Entidades com `private constructor`, fábricas estáticas que validam e geram `randomUUID()` (`create`, ou `approve`/`fail` no payment) e `static restore(props)`.
- Estado mutável e dependências em campos `#`; dados imutáveis em `readonly`.
- Dinheiro em **centavos inteiros** com `Money`; no banco e nas mensagens, `amount` em centavos.
- Erros: `class XxxError extends Error` com `this.name = "XxxError"`, em `domain/<agregado>/errors.ts`.
- Nomes: `XxxEntity`, `XxxsRepository`, `XxxsQuery`, `DrizzleXxxsRepository`, `DrizzleXxxsQuery`, `InMemoryXxxsRepository`, `FakeXxx`, `XxxUseCase`; arquivos em kebab-case (`domain/order/order-entity.ts`, `domain/order/orders-repository.ts`).
- Testes: `sut` para o objeto testado, fakes in-memory com array público; `test/` espelha `src/`.
- Cada workspace declara no próprio `package.json` todas as dependências que importa. Os Dockerfiles copiam o `package.json` de todos os workspaces (exigência do `npm ci`).

## Cuidados

- `@opentelemetry/auto-instrumentations-node/register` continua sendo a **primeira linha** de cada `server.ts`.
- `infra/db/client.ts` e `infra/messaging/client.ts` exigem `DATABASE_URL` / `BROKER_URL` e conectam no import (top-level await, com retentativas no broker). Os `infra/messaging/channels/*.ts` também. Não importe esses módulos em testes que não precisam deles.
- Os três `server.ts` registram graceful shutdown com `registerGracefulShutdown` (SIGTERM/SIGINT, timeout de 10s): consumers, HTTP, relay e `closeConnections` (channels, broker e banco), nessa ordem. Recurso novo com conexão ou trabalho em andamento precisa entrar nos passos do shutdown (channel/conexão novo vai no `closeConnections`). Ver ARCHITECTURE.md §3.6.
- Eventos publicados antes de existir a fila são descartados: numa instalação nova, suba os três serviços antes do primeiro pedido.
- `npm run db:migrate` não carrega o `.env`: defina `DATABASE_URL` no ambiente.
- As seções 12 e 13 do ARCHITECTURE.md listam limitações e inconsistências conhecidas. Não as "corrija" numa mudança não relacionada.
