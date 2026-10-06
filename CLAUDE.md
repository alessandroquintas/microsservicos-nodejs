# CLAUDE.md

Guia rápido para trabalhar neste repositório. A explicação completa está em [ARCHITECTURE.md](ARCHITECTURE.md).

## O que é

Monorepo (npm workspaces) com dois microsserviços Node.js + TypeScript:

- `services/orders` (`@microservices/orders`, :3333): `POST /orders` → Postgres (:5482) → publica `OrderCreated` na fila `orders-queue` (RabbitMQ).
- `services/invoices` (`@microservices/invoices`, :3334): consome `orders-queue` → cria invoice no Postgres (:5483).
- `packages/contracts` (`@microservices/contracts`): schemas zod das mensagens (`orderCreatedMessageSchema`, `OrderCreatedMessage`).
- `docker/kong`: API Gateway (:8000). `infra/`: Pulumi/AWS, **fora** dos workspaces, com lockfile próprio.

Stack: Fastify 5 + `fastify-type-provider-zod`, Drizzle ORM (pg), amqplib, zod 4, Vitest, OpenTelemetry.

## Comandos

```bash
npm install                                   # na raiz
npm test                                      # todos os workspaces
npm run typecheck                             # tsc --noEmit em todos os workspaces
npm test -w @microservices/orders             # um workspace
npm run dev -w @microservices/orders          # node --experimental-strip-types --watch, lê .env
npm run db:migrate:test -w @microservices/orders   # migra o banco *_test (.env.test)
cd services/orders && npx vitest run test/domain/money.test.ts   # um arquivo

docker compose up -d                                        # RabbitMQ, Jaeger, Kong
docker compose -f services/orders/docker-compose.yml up -d  # Postgres do orders (+ orders_test)
docker compose -f services/invoices/docker-compose.yml up -d
```

Os testes em `test/infra/db/` precisam do Postgres do serviço rodando e migrado. Os outros testes não precisam de banco nem de RabbitMQ.

Antes de concluir uma mudança, rode `npm run typecheck` e `npm test`. O CI (`.github/workflows/ci.yml`) roda exatamente isso, depois das migrations de teste.

## Arquitetura hexagonal: regras

```
src/domain/       uma subpasta por agregado (order/, customer/, invoice/) + shared/
src/application/  use-cases/ (classe com execute(args)) e ports/ (interfaces não-persistência)
src/infra/        adapters: db/ (Drizzle), http/ (Fastify), messaging/ (amqplib)
src/server.ts     composition root: o único lugar que instancia adapters concretos
```

- `domain` não importa de `application`, `infra` nem de pacotes de terceiros (só built-ins como `node:crypto`).
- `application` importa só de `domain` e tipos de `@microservices/contracts`.
- `infra` implementa as portas (`DrizzleOrdersRepository implements OrdersRepository`). Os adapters de entrada recebem o use case como `Pick<XUseCase, "execute">`, para os testes injetarem `{ execute: vi.fn() }`.
- Nova dependência de um use case: crie a interface (repositório em `domain/<agregado>/`, outras em `application/ports/`), o adapter em `infra/`, um fake em `test/fakes/`, e faça a ligação em `server.ts`.
- Mudança no formato de uma mensagem: altere o schema em `packages/contracts`. O publisher valida com `.parse` antes de enviar, e o consumer valida `payload.data` com `.safeParse` e faz `nack(msg, false, false)` se falhar. O envelope é sempre `{ data: <mensagem> }`.

## Convenções obrigatórias

O código roda com `node --experimental-strip-types`, sem build:

- **Sem `enum`.** Use objeto `as const` + type derivado (ver `OrderStatus` em `services/orders/src/domain/order/order-entity.ts`).
- **Sem parameter properties** (`constructor(private x: X)`) e sem `namespace`.
- **Imports relativos com extensão `.ts`**: `import { Money } from "./shared/money.ts"`.
- **`import type`** (ou `type` inline) para tudo que é só tipo. O `verbatimModuleSyntax` exige isso.

Estilo do código existente:

- Entidades com `private constructor`, `static create(...)` (valida, gera `randomUUID()`) e `static restore(props)` (reidrata, sem validar).
- Estado mutável e dependências injetadas em campos privados `#` (`#status`, `#ordersRepository`). Dados imutáveis em `readonly`.
- Dinheiro sempre em **centavos inteiros**, com o value object `Money` (`Money.fromCents`, `.cents`, `.isZero()`). No banco e nas mensagens, `amount` é o número em centavos.
- Erros de domínio: `class XxxError extends Error` com `this.name = "XxxError"`, em `domain/<agregado>/errors.ts`.
- Nomes: `XxxEntity`, `XxxsRepository` (interface), `DrizzleXxxsRepository`, `InMemoryXxxsRepository`, `FakeXxx`, `XxxUseCase`. Arquivos em kebab-case. No domínio: `domain/<agregado>/<agregado>-entity.ts` (singular), `domain/<agregado>/<plural>-repository.ts` (plural) e `domain/<agregado>/errors.ts`. Ex.: `domain/order/order-entity.ts`, `domain/order/orders-repository.ts`.
- Testes: `sut` para o objeto testado, fakes in-memory com array público (`items`, `published`).
- Cada workspace declara no próprio `package.json` todas as dependências que importa. Não dependa do hoisting.

## Testes

- Vitest, `test/setup.ts` carrega `.env.test` (`process.loadEnvFile`), `fileParallelism: false`.
- `test/` espelha o `src/` nos dois serviços: `test/domain/`, `test/application/`, `test/infra/db/` (banco real, limpa as tabelas no `beforeEach`, `db.$client.end()` no `afterAll`), `test/infra/http/` (`buildApp(...)` + `app.inject`), `test/infra/messaging/` (publisher com canal `{ sendToQueue }` fake, handler com canal `{ ack, nack }` fake) e `test/fakes/` (repositórios in-memory e publisher falso).

## Cuidados

- O import de `@opentelemetry/auto-instrumentations-node/register` precisa continuar sendo a **primeira linha** de cada `server.ts`.
- `client.ts` do db e do broker lançam erro no import se `DATABASE_URL` / `BROKER_URL` não estiverem definidos, e o broker conecta com top-level await. Não importe esses módulos em testes que não precisam deles.
- `POST /orders` usa um `DEFAULT_CUSTOMER_ID` fixo (temporário) que precisa existir na tabela `customers`.
- `npm run db:migrate` não carrega o `.env`. Defina `DATABASE_URL` no ambiente.
- A seção 11 do ARCHITECTURE.md lista as inconsistências conhecidas (por exemplo, error handler só no orders, import duplicado no `server.ts` do invoices). Não "corrija" esses pontos de passagem numa mudança não relacionada.
