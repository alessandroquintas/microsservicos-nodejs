# CLAUDE.md

Guia rápido para trabalhar neste repositório. Os detalhes estão em [ARCHITECTURE.md](ARCHITECTURE.md).

## O que é

Monorepo (npm workspaces), Node.js + TypeScript (Fastify 5, Drizzle/pg, amqplib, zod 4, Vitest, OpenTelemetry):

- `services/orders` (:3333, Postgres :5482): `POST /orders` grava pedido + evento em `outbox_events` na mesma transação; o `OutboxRelay` publica na exchange topic `events` (routing key `order.created`) com publisher confirms.
- `services/invoices` (:3334, Postgres :5483): consome `invoices.order-created` (retry 3× com 5s, depois DLQ) e cria a invoice de forma idempotente.
- `packages/contracts`: schemas zod das mensagens, `EVENTS_EXCHANGE` e as routing keys. `docker/kong`: gateway (:8000). `infra/`: Pulumi, **fora** dos workspaces.

## Comandos

```bash
npm install && npm run typecheck && npm test        # na raiz
npm test -w @microservices/orders                   # um workspace
npm run dev -w @microservices/invoices              # suba o invoices antes do orders (cria filas e bind)
npm run db:migrate:test -w @microservices/orders    # migra o banco *_test
docker compose up -d                                # RabbitMQ, Jaeger, Kong
docker compose -f services/orders/docker-compose.yml up -d
```

Os testes em `test/infra/db/` e o do relay precisam do Postgres do serviço rodando e migrado. Nenhum teste precisa de RabbitMQ. Antes de concluir uma mudança, rode `npm run typecheck` e `npm test` (é o que o CI roda).

## Arquitetura hexagonal

- `src/domain/<agregado>/` (+ `shared/`): não importa de `application`, `infra` nem de pacotes de terceiros (só built-ins como `node:crypto`).
- `src/application/`: `use-cases/` (classe com `execute(args)`) e `ports/`. Importa só de `domain` e tipos de `@microservices/contracts`.
- `src/infra/`: adapters (`db/`, `http/`, `messaging/`). Adapters de entrada recebem `Pick<XUseCase, "execute">`.
- `src/server.ts`: composition root, o único lugar que instancia adapters concretos.
- Nova dependência de use case: interface (repositório em `domain/<agregado>/`, outras em `application/ports/`), adapter em `infra/`, fake em `test/fakes/`, ligação no `server.ts`.
- Mensagens: o schema fica em `packages/contracts`, o envelope é sempre `{ data }`. O orders publica só pelo outbox. No invoices, o handler só lança (`InvalidMessageError` para mensagem inválida) e o `startConsumer` decide ack/retry/DLQ. O invoices declara as próprias filas em `topology.ts`. Ver ARCHITECTURE.md §4.

## Convenções obrigatórias

Roda com `node --experimental-strip-types`, sem build:

- **Sem `enum`** (use `as const` + type derivado), **sem parameter properties**, sem `namespace`.
- **Imports relativos com extensão `.ts`** e **`import type`** para tudo que é só tipo (`verbatimModuleSyntax`).

Estilo:

- Entidades com `private constructor`, `static create(...)` (valida, gera `randomUUID()`) e `static restore(props)`.
- Estado mutável e dependências em campos `#`; dados imutáveis em `readonly`.
- Dinheiro em **centavos inteiros** com `Money`; no banco e nas mensagens, `amount` em centavos.
- Erros: `class XxxError extends Error` com `this.name = "XxxError"`, em `domain/<agregado>/errors.ts`.
- Nomes: `XxxEntity`, `XxxsRepository`, `DrizzleXxxsRepository`, `InMemoryXxxsRepository`, `FakeXxx`, `XxxUseCase`; arquivos em kebab-case (`domain/order/order-entity.ts`, `domain/order/orders-repository.ts`).
- Testes: `sut` para o objeto testado, fakes in-memory com array público; `test/` espelha `src/`.
- Cada workspace declara no próprio `package.json` todas as dependências que importa.

## Cuidados

- `@opentelemetry/auto-instrumentations-node/register` continua sendo a **primeira linha** de cada `server.ts`.
- `infra/db/client.ts` e `infra/messaging/client.ts` exigem `DATABASE_URL` / `BROKER_URL` e conectam no import (top-level await, com retentativas no broker). Não importe esses módulos em testes que não precisam deles.
- Os dois `server.ts` têm graceful shutdown (SIGTERM/SIGINT, timeout de 10s). Recurso novo com conexão ou trabalho em andamento precisa entrar na função `shutdown`. Ver ARCHITECTURE.md §3.6.
- `POST /orders` usa um `DEFAULT_CUSTOMER_ID` fixo que precisa existir na tabela `customers` (insert manual, ver §7.2).
- `npm run db:migrate` não carrega o `.env`: defina `DATABASE_URL` no ambiente.
- A seção 11 do ARCHITECTURE.md lista inconsistências conhecidas. Não as "corrija" numa mudança não relacionada.
