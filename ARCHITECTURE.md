# Arquitetura

Este documento descreve a arquitetura **atual** do repositório `microservices-nodejs`, com base no código existente. Pontos inconsistentes ou incompletos estão listados na [seção 11](#11-inconsistências-e-pontos-de-atenção).

---

## 1. Visão geral

O sistema tem dois microsserviços Node.js:

- **orders** (`services/orders`): recebe `POST /orders`, grava o pedido e o evento `OrderCreated` na mesma transação (outbox) e um relay publica o evento no RabbitMQ.
- **invoices** (`services/invoices`): consome `OrderCreated` da fila `invoices.order-created` e cria uma fatura (invoice) no Postgres dele, de forma idempotente.

Na frente fica um API Gateway Kong (`docker/kong`), que roteia `/orders` para o orders e `/invoices` para o invoices. Cada serviço tem o próprio banco Postgres. A comunicação entre os serviços é só assíncrona, pela exchange topic `events` do RabbitMQ (ver [4.2](#42-catálogo-de-eventos-e-topologia)).

```mermaid
flowchart LR
    client([Cliente]) -->|POST /orders| kong[Kong<br/>:8000]
    kong -->|/orders| orders[orders<br/>Fastify :3333]
    orders -->|INSERT orders + outbox_events| ordersdb[(Postgres orders<br/>:5482)]
    orders -->|relay: publish<br/>events / order.created| rabbit[[RabbitMQ<br/>:5672]]
    rabbit -->|consume<br/>invoices.order-created| invoices[invoices<br/>Fastify :3334]
    invoices -->|INSERT invoices| invoicesdb[(Postgres invoices<br/>:5483)]
    kong -.->|/invoices| invoices
```

Os dois serviços também exportam traces via OpenTelemetry (`@opentelemetry/auto-instrumentations-node/register`, importado na primeira linha de cada `server.ts`). No ambiente local, o destino é o Jaeger do `docker-compose.yml` da raiz. Na AWS, é o Grafana Cloud (configurado em `infra/src/services/*.ts`).

---

## 2. Estrutura do monorepo

```
microservices-nodejs/
├── .github/
│   └── workflows/          # ci.yml: typecheck + migrations + testes
├── docker/
│   └── kong/               # Dockerfile, config.template.yaml, startup.sh do API Gateway
├── infra/                  # Programa Pulumi (AWS ECS Fargate), NÃO é workspace npm
│   ├── src/                # cluster, load balancers, imagens (ECR) e serviços Fargate
│   ├── index.ts
│   ├── Pulumi.yaml / Pulumi.dev.yaml
│   └── package.json        # dependências próprias + package-lock.json próprio
├── packages/
│   └── contracts/          # @microservices/contracts: schemas zod das mensagens
├── services/
│   ├── invoices/           # @microservices/invoices
│   └── orders/             # @microservices/orders
├── docker-compose.yml      # RabbitMQ, Jaeger e Kong para desenvolvimento local
├── package.json            # raiz: declara os workspaces e os scripts agregados
└── package-lock.json       # lockfile único dos workspaces
```

| Pasta | Papel |
| --- | --- |
| `services/` | Um diretório por microsserviço. Cada um tem `src/`, `test/`, `Dockerfile`, um `docker-compose.yml` com o próprio Postgres, `drizzle.config.ts`, `vitest.config.ts`, `.env.example` e `.env.test`. |
| `packages/` | Código compartilhado entre os serviços. Hoje só existe `packages/contracts`. |
| `docker/` | Imagem do Kong. O `startup.sh` usa `envsubst` para gerar `/kong/config.yaml` a partir de `config.template.yaml`, substituindo `ORDERS_SERVICE_URL` e `INVOICES_SERVICE_URL`. |
| `infra/` | Infraestrutura como código (Pulumi + `@pulumi/awsx`): cluster ECS, um ALB e um NLB, repositórios ECR, build e push das imagens e os serviços Fargate de orders, invoices, rabbitmq e kong. |
| `.github/` | CI no GitHub Actions (ver [6.4](#64-ci)). |

### npm workspaces

O `package.json` da raiz declara:

```json
"workspaces": ["services/*", "packages/*"],
"scripts": {
  "test": "npm run test --workspaces --if-present",
  "typecheck": "npm run typecheck --workspaces --if-present"
}
```

- Existe um único `package-lock.json`, na raiz. O `npm install` cria symlinks em `node_modules/@microservices/{orders,invoices,contracts}`.
- Os serviços consomem o pacote de contratos como dependência normal: `"@microservices/contracts": "^1.0.0"`.
- **Cada pacote declara as próprias dependências.** Não dependa do hoisting. Exemplo: o orders declara `@opentelemetry/api` porque `src/infra/http/app.ts` usa `trace`, e o invoices não declara porque não usa. Os dois declaram `zod`, `amqplib`, `drizzle-orm` etc., mesmo que a versão física seja compartilhada.
- `infra/` **não** faz parte dos workspaces e tem o próprio `package-lock.json`.
- Os Dockerfiles dos serviços instalam só as dependências de produção do workspace alvo (`npm ci --omit=dev --workspace=@microservices/orders`). Para isso, copiam os `package.json` de todos os workspaces, porque o `npm ci` exige que o lockfile bata.

---

## 3. Arquitetura dos serviços (hexagonal)

### 3.1 Camadas

Cada serviço segue a estrutura `src/{domain,application,infra}` + `src/server.ts`.

| Camada | O que pode conter | orders | invoices |
| --- | --- | --- | --- |
| `domain/` | Entidades, value objects, erros de domínio e as **interfaces de repositório** (portas de persistência), com uma subpasta por agregado. Código TypeScript puro. | `order/{order-entity.ts, orders-repository.ts, errors.ts}`, `customer/{customer-entity.ts, customers-repository.ts, errors.ts}`, `shared/money.ts` | `invoice/{invoice-entity.ts, invoices-repository.ts, errors.ts}` |
| `application/` | Casos de uso (`use-cases/`) e portas que não são de persistência (`ports/`). Orquestra o domínio pelas interfaces. | `use-cases/create-order.ts`, `ports/order-events-publisher.ts`, `ports/unit-of-work.ts` | `use-cases/create-invoice-from-order.ts` |
| `infra/` | Adapters: banco (Drizzle), HTTP (Fastify), mensageria (amqplib). Implementam as portas ou chamam os casos de uso. | `db/`, `http/app.ts`, `messaging/` | `db/`, `http/app.ts`, `messaging/` |
| `server.ts` | Composition root: instancia adapters e use cases e liga tudo. | `src/server.ts` | `src/server.ts` |

Dentro de `infra/`, a organização é a mesma nos dois serviços:

- `infra/db/client.ts`: instância do Drizzle (`drizzle(process.env.DATABASE_URL, { casing: "snake_case" })`).
- `infra/db/schema/*.ts` + `schema/index.ts`: tabelas Drizzle, agregadas no objeto `schema`.
- `infra/db/repositories/drizzle-*-repository.ts`: implementação das portas de repositório.
- `infra/db/migrations/`: migrations geradas pelo drizzle-kit.
- `infra/messaging/client.ts`: conexão AMQP com top-level await, via `connectWithRetry(() => amqp.connect(BROKER_URL))` (`connect-with-retry.ts`). Exporta `broker` e `markBrokerShuttingDown()` (ver [3.6](#36-ciclo-de-vida-dos-serviços)).
- `infra/messaging/channels/orders.ts`: cria o canal e declara a parte da topologia que cabe ao serviço. No orders, `createConfirmChannel()` + `assertExchange("events", "topic")`. No invoices, `createChannel()` + `setupTopology(channel)` (`topology.ts`).
- Só no orders: `infra/db/drizzle-unit-of-work.ts`, `infra/db/outbox/outbox-order-events-publisher.ts` e `infra/messaging/outbox-relay.ts` (ver [4.4](#44-outbox-no-orders)).
- Só no invoices: `infra/messaging/topology.ts`, `consumer.ts`, `errors.ts` (`InvalidMessageError`) e `handlers/order-created.handler.ts` (ver [4.3](#43-validação-retry-e-dlq)).
- `infra/http/app.ts`: instância do Fastify com `fastify-type-provider-zod`.

### 3.2 Regra de dependência

```
infra  ──▶  application  ──▶  domain
  │              │
  └──────────────┴──▶  @microservices/contracts
```

- **domain** não importa nada de `application`, de `infra` nem de bibliotecas de terceiros. A única importação externa é o built-in `node:crypto` (`randomUUID`) em `orders-entity.ts` e `invoices-entity.ts`.
- **application** importa só de `domain` e, para as portas de eventos, tipos de `@microservices/contracts`. Exemplo: `application/ports/order-events-publisher.ts` faz `import type { OrderCreatedMessage } from "@microservices/contracts"`.
- **infra** implementa as portas (`DrizzleOrdersRepository implements OrdersRepository`, `OutboxOrderEventsPublisher implements OrderEventsPublisher`, `DrizzleUnitOfWork implements UnitOfWork`) e, nos adapters de entrada, depende do caso de uso só pelo formato `Pick<UseCase, "execute">`:
  - `services/orders/src/infra/http/app.ts`: `createOrder: Pick<CreateOrderUseCase, "execute">`
  - `services/invoices/src/infra/messaging/handlers/order-created.handler.ts`: `type CreateInvoiceFromOrder = Pick<CreateInvoiceFromOrderUseCase, "execute">`

  Assim, o teste do adapter injeta `{ execute: vi.fn() }` sem precisar montar o caso de uso real.
- Os casos de uso recebem as portas pelo construtor e as guardam em campos privados `#`.

### 3.3 Portas e adapters

| Serviço | Porta (interface) | Adapter de produção | Fake nos testes |
| --- | --- | --- | --- |
| orders | `OrdersRepository` (`src/domain/order/orders-repository.ts`) | `DrizzleOrdersRepository` (`src/infra/db/repositories/drizzle-orders-repository.ts`) | `InMemoryOrdersRepository` (`test/fakes/in-memory-orders-repository.ts`) |
| orders | `CustomersRepository` (`src/domain/customer/customers-repository.ts`) | `DrizzleCustomersRepository` (`src/infra/db/repositories/drizzle-customers-repository.ts`) | `InMemoryCustomersRepository` (`test/fakes/in-memory-customers-repository.ts`) |
| orders | `OrderEventsPublisher` (`src/application/ports/order-events-publisher.ts`) | `OutboxOrderEventsPublisher` (`src/infra/db/outbox/outbox-order-events-publisher.ts`): grava na tabela `outbox_events` | `FakeOrderEventsPublisher` (`test/fakes/fake-order-events-publisher.ts`) |
| orders | `UnitOfWork` (`src/application/ports/unit-of-work.ts`): `run(work)` entrega `{ orders, orderEvents }` ligados à mesma transação | `DrizzleUnitOfWork` (`src/infra/db/drizzle-unit-of-work.ts`) | `InMemoryUnitOfWork` (`test/fakes/in-memory-unit-of-work.ts`) |
| invoices | `InvoicesRepository` (`src/domain/invoice/invoices-repository.ts`) | `DrizzleInvoicesRepository` (`src/infra/db/repositories/drizzle-invoices-repository.ts`) | `InMemoryInvoicesRepository` (`test/fakes/in-memory-invoices-repository.ts`) |

Adapters de **entrada** (não implementam interface, chamam o caso de uso):

| Serviço | Adapter de entrada | Como é testado |
| --- | --- | --- |
| orders | `buildApp({ createOrder })` em `src/infra/http/app.ts`: rota `POST /orders` e `GET /health` | `test/infra/http/app.test.ts`, com `app.inject` e `createOrder = { execute: vi.fn() }` |
| invoices | `createOrderCreatedHandler(createInvoiceFromOrder)` em `src/infra/messaging/handlers/order-created.handler.ts`, registrado por `startConsumer` (`src/infra/messaging/consumer.ts`), que cuida de ack, retry e DLQ | `test/infra/messaging/order-created.handler.test.ts` (sem canal: o handler só lança) e `test/infra/messaging/consumer.test.ts` (canal fake que captura o callback do `consume`) |
| invoices | `buildApp()` em `src/infra/http/app.ts`: só `GET /health` | sem teste |

Os fakes in-memory expõem um array público (`items`, `published`) para os testes fazerem asserções.

### 3.4 `server.ts` como composition root

O `server.ts` é o único lugar que conhece as implementações concretas. A ordem é sempre: adapters de saída → use cases → adapter de entrada → `listen` → registro do `shutdown`. Trecho de `services/orders/src/server.ts`:

```ts
import "@opentelemetry/auto-instrumentations-node/register";

// ...imports

// Adapters de sáida
const customersRepository = new DrizzleCustomersRepository(db);
const unitOfWork = new DrizzleUnitOfWork(db);

// Use cases
const createOrder = new CreateOrderUseCase(customersRepository, unitOfWork);

// Adapter de entrada
const app = buildApp({ createOrder });

const outboxRelay = new OutboxRelay(db, ordersChannel);
outboxRelay.start();

app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3333) });

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
```

O import do OpenTelemetry precisa ser o **primeiro**, para a auto-instrumentação conseguir aplicar patch em `http`, `fastify`, `pg` e `amqplib` antes de eles serem carregados.

No invoices, o adapter de entrada é o consumidor da fila: `const consumer = await startConsumer(ordersChannel, { queue: ORDER_CREATED_QUEUE, deadLetterQueue: ORDER_CREATED_DLQ, maxRetries: 3 }, handleOrderCreated)`. O servidor HTTP sobe só para o `/health`.

### 3.5 Cadeia de dependências de `POST /orders`

```mermaid
flowchart TD
    route["POST /orders<br/>infra/http/app.ts (buildApp)"]
    uc["CreateOrderUseCase<br/>application/use-cases/create-order.ts"]
    custRepo["CustomersRepository<br/>(porta, domain)"]
    uow["UnitOfWork<br/>(porta, application/ports)"]
    ordRepo["OrdersRepository<br/>(porta, domain)"]
    pub["OrderEventsPublisher<br/>(porta, application/ports)"]
    order["OrderEntity.create()<br/>domain/order/order-entity.ts"]
    money["Money.fromCents()<br/>domain/shared/money.ts"]
    custEnt["CustomerEntity<br/>domain/customer/customer-entity.ts"]
    drizzleCust["DrizzleCustomersRepository"]
    drizzleUow["DrizzleUnitOfWork<br/>(db.transaction)"]
    drizzleOrd["DrizzleOrdersRepository(tx)"]
    outboxPub["OutboxOrderEventsPublisher(tx)<br/>INSERT outbox_events"]
    contract["orderCreatedMessageSchema<br/>@microservices/contracts"]

    route -->|"execute({ customerId, amountInCents })"| uc
    uc -->|"1. findById"| custRepo
    custRepo -.implementado por.-> drizzleCust
    drizzleCust -->|CustomerEntity.restore| custEnt
    uc -->|"2. cria"| order
    order --> money
    uc -->|"3. run"| uow
    uow -.implementado por.-> drizzleUow
    uow -->|"3a. save"| ordRepo
    ordRepo -.implementado por.-> drizzleOrd
    uow -->|"3b. publishOrderCreated"| pub
    pub -.implementado por.-> outboxPub
    outboxPub -->|parse| contract
```

Comportamento de `CreateOrderUseCase.execute`:

1. Busca o cliente. Se não existir, lança `CustomerNotFoundError`, que a rota converte em 404.
2. Cria o `OrderEntity` com `Money.fromCents(amountInCents)`. Valor zero lança `InvalidOrderAmountError`. Valor negativo ou não inteiro lança `InvalidMoneyError`.
3. Dentro de `unitOfWork.run(...)`, numa única transação: salva o pedido e grava o evento `OrderCreated` (`orderId`, `amount` em centavos, `customer { id, name, email }`) na tabela `outbox_events`.

Se qualquer um dos dois falhar (por exemplo, a mensagem fora do contrato no `parse`), a transação é desfeita e nada fica gravado. A publicação no RabbitMQ acontece depois, pelo `OutboxRelay` (ver [4.4](#44-outbox-no-orders)).

A rota usa um `DEFAULT_CUSTOMER_ID` fixo (`5961a952-0d3e-465f-b635-4b93a1cefa97`) com o comentário "Temporário: até a feature de customers". O `amount` do body é repassado como `amountInCents`. O error handler devolve a mensagem do erro para status < 500 e `{ message: "Internal server error" }` para 500, registrando os detalhes só no `console.error`.

### 3.6 Ciclo de vida dos serviços

**Graceful shutdown.** Cada `server.ts` registra `shutdown(signal)` com `process.once("SIGTERM", ...)` (enviado pelo ECS e pelo `node --watch` ao reiniciar) e `process.once("SIGINT", ...)` (Ctrl+C). Uma segunda chamada durante o encerramento é ignorada. Um `setTimeout` de **10 s** (com `.unref()`) loga `Forced shutdown` e chama `process.exit(1)` se algum passo travar. A ordem de encerramento é:

| Passo | orders | invoices |
| --- | --- | --- |
| 1 | log `[Orders] <signal> received, shutting down` | log `[Invoices] <signal> received, shutting down` |
| 2 | `app.close()`: para de aceitar HTTP e espera as requisições em andamento | `consumer.stop()`: `channel.cancel(consumerTag)` e espera as mensagens em processamento |
| 3 | `outboxRelay.stop()`: cancela o próximo ciclo e espera o ciclo em andamento | `app.close()` |
| 4 | `markBrokerShuttingDown()`, fecha o channel e a conexão do RabbitMQ | idem |
| 5 | `db.$client.end()` | idem |
| 6 | `process.exit(0)` | idem |

**Conexão com o RabbitMQ.** O `client.ts` de cada serviço conecta com `connectWithRetry` (`connect-with-retry.ts`): até 10 tentativas, com espera que dobra a cada falha (1 s, 2 s, 4 s...) limitada a 30 s, e um `console.warn` por falha. Esgotadas as tentativas, o erro é relançado no top-level await e o processo cai.

Com o serviço rodando:

- `broker.on("error")` e `channel.on("error")` só logam com `console.error`;
- `broker.on("close")`: se não foi o `shutdown` que fechou (`markBrokerShuttingDown()`), loga `RabbitMQ connection lost, exiting` e chama `process.exit(1)`. Não há reconexão dentro do processo: quem reinicia o serviço com uma conexão nova é o orquestrador (ECS ou a política de restart do container).

---

## 4. Contratos e eventos

### 4.1 `@microservices/contracts`

Fica em `packages/contracts`. Exporta, a partir de `src/index.ts`, os schemas zod e os tipos das mensagens trocadas entre os serviços e os nomes compartilhados da topologia:

- `src/exchanges.ts`: `EVENTS_EXCHANGE = "events"`;
- `src/messages/order-created-message.ts`: o schema abaixo, `ORDER_CREATED_EVENT = "OrderCreated"` (tipo gravado no outbox) e `ORDER_CREATED_ROUTING_KEY = "order.created"`.

```ts
export const orderCreatedMessageSchema = z.object({
  orderId: z.uuid(),
  amount: z.number().int().positive(),
  customer: z.object({
    id: z.uuid(),
    name: z.string().min(1),
    email: z.email(),
  }),
});

export type OrderCreatedMessage = z.infer<typeof orderCreatedMessageSchema>;
```

O pacote existe para que produtor e consumidor usem **a mesma definição** da mensagem, tanto o tipo TypeScript quanto a validação em runtime. Assim, uma mudança no formato quebra o typecheck dos dois lados. O pacote é distribuído como fonte TypeScript (`"exports": { ".": "./src/index.ts" }`), sem build, e por isso funciona com `--experimental-strip-types`. Ele não tem testes, `tsconfig.json` nem script `typecheck`. O código dele é verificado pelo `tsc` dos serviços que o importam.

### 4.2 Catálogo de eventos e topologia

| Evento | Produtor | Consumidor | Exchange / routing key | Formato da mensagem |
| --- | --- | --- | --- | --- |
| `OrderCreated` | orders: `CreateOrderUseCase` grava no outbox, e o `OutboxRelay` publica | invoices: `startConsumer` + `handleOrderCreated` (`order-created.handler.ts`), que chama `CreateInvoiceFromOrderUseCase` | Exchange `events` (topic, durable), routing key `order.created`. Publicada com `persistent: true` e `messageId` = id do evento no outbox | JSON `{ "data": OrderCreatedMessage }`, ou seja `{ "data": { "orderId": uuid, "amount": int > 0 (centavos), "customer": { "id": uuid, "name": string, "email": email } } }` |

Filas do invoices (`services/invoices/src/infra/messaging/topology.ts`), todas `durable`:

| Fila | Argumentos | Papel |
| --- | --- | --- |
| `invoices.order-created` | bind em `events` com `order.created`. `deadLetterExchange: ""`, `deadLetterRoutingKey: invoices.order-created.retry` | Fila principal, consumida pelo invoices. Um `nack` sem requeue manda a mensagem para a fila de retry. |
| `invoices.order-created.retry` | `messageTtl: 5000`, `deadLetterExchange: ""`, `deadLetterRoutingKey: invoices.order-created` | Sem consumidor. Depois de 5 s a mensagem expira e volta para a fila principal. |
| `invoices.order-created.dlq` | — | Falhas persistentes e mensagens inválidas. Sem consumidor. |

Quem declara cada parte (`assertExchange` e `assertQueue` são idempotentes):

- **orders**: só a exchange `events` (`channels/orders.ts`). Ele não sabe quais filas existem.
- **invoices**: a exchange `events`, as próprias três filas e o bind (`setupTopology`).

Uma exchange topic descarta mensagens que não combinam com nenhum bind. Por isso, numa instalação nova, o invoices precisa subir (e criar o bind) antes de o orders publicar o primeiro evento.

### 4.3 Validação, retry e DLQ

**Na gravação** (orders, `OutboxOrderEventsPublisher`): `orderCreatedMessageSchema.parse(message)` antes do insert no outbox. Se a mensagem violar o contrato, o `parse` lança, a transação do pedido é desfeita e a rota responde 500.

**No consumo** (invoices). O handler (`order-created.handler.ts`) não faz ack/nack: só lança.

- JSON inválido ou `payload.data` reprovado em `orderCreatedMessageSchema.safeParse` → lança `InvalidMessageError` (`infra/messaging/errors.ts`), com o `path` e a `message` de cada issue no texto.
- Mensagem válida → `createInvoiceFromOrder.execute({ orderId })`, deixando qualquer erro propagar.

O `startConsumer` (`consumer.ts`, `noAck: false`) decide o destino da mensagem:

| Situação | Ação |
| --- | --- |
| Sucesso | `ack` |
| `InvalidMessageError` | vai direto para a DLQ (sem retentativas) + `ack` |
| Outro erro, com menos de `maxRetries` (3) retentativas | `nack(message, false, false)` → fila de retry → volta em 5 s. `console.warn` com o número da tentativa. |
| Outro erro, já com 3 retentativas | DLQ + `ack` |

- O número de retentativas vem do header `x-death`: o `count` da entrada com `queue` igual à fila principal e `reason` igual a `"rejected"` (0 se não houver).
- O envio para a DLQ é `sendToQueue(dlq, content, { persistent: true, messageId, headers })`, com os headers originais mais `x-last-error` (a mensagem do erro), e é logado com `console.warn`.

**Reprocessar a DLQ.** Depois de corrigir a causa, mova as mensagens de `invoices.order-created.dlq` para `invoices.order-created` pela UI do RabbitMQ (`:15672`, aba *Queues* → `invoices.order-created.dlq` → *Move messages*, que usa o plugin shovel). Se a mensagem movida conservar o header `x-death` antigo, uma nova falha pode mandá-la direto para a DLQ, sem as 3 retentativas.

### 4.4 Outbox no orders

- **Tabela `outbox_events`** (`infra/db/schema/outbox-events.ts`): `id`, `type` (ex.: `OrderCreated`), `payload` (jsonb, a mensagem já validada), `created_at`, `published_at` (nulo enquanto pendente), `attempts` e `last_error`, com índice em `(published_at, created_at)`.
- **Unit of work**: `DrizzleUnitOfWork.run(work)` abre `db.transaction` e entrega `DrizzleOrdersRepository(tx)` e `OutboxOrderEventsPublisher(tx)`. O pedido e o evento são gravados juntos ou nenhum dos dois.
- **Relay** (`infra/messaging/outbox-relay.ts`): `OutboxRelay.start()` roda um ciclo por segundo. Cada ciclo (`publishPending`), numa transação:
  - seleciona até 50 eventos com `published_at` nulo, em ordem de `created_at`, com `FOR UPDATE SKIP LOCKED` (várias instâncias não publicam o mesmo evento);
  - publica cada um com `channel.publish("events", routingKey, { data: payload }, { persistent: true, messageId: id })` e espera `waitForConfirms()` (o channel é de confirm);
  - no confirm, grava `published_at`, incrementa `attempts` e limpa `last_error`. Na falha, incrementa `attempts`, grava `last_error` e deixa o evento pendente para o próximo ciclo.
- A routing key vem de `ROUTING_KEY_BY_EVENT_TYPE`. Um `type` sem routing key gera o erro `No routing key configured for event type "<tipo>"`.
- A entrega é **at-least-once**: se o processo cair entre o confirm e o commit, o evento é publicado de novo. O consumidor é idempotente por isso (ver 4.5).
- **Reenviar um evento**: `UPDATE outbox_events SET published_at = NULL WHERE id = '<id>';` no banco `orders`. O relay o publica no próximo ciclo.

### 4.5 Idempotência no invoices

- A coluna `invoices.order_id` é `unique` (`infra/db/schema/invoices.ts`, migration `0001`).
- `CreateInvoiceFromOrderUseCase` procura `findByOrderId` antes e devolve a invoice existente.
- `DrizzleInvoicesRepository.save` usa `onConflictDoNothing({ target: order_id })`, que cobre a corrida entre duas entregas simultâneas.

Assim, a mesma mensagem entregue mais de uma vez (reenvio do outbox, retry, reprocessamento da DLQ) gera uma única invoice.

---

## 5. Convenções de código

Estas convenções foram extraídas do código. As exceções estão listadas na [seção 11](#11-inconsistências-e-pontos-de-atenção).

### Nomes de arquivos e classes

Arquivos em `kebab-case`. Classes em `PascalCase` com sufixo que indica o papel. No domínio, cada agregado tem uma subpasta (`domain/order/`, `domain/customer/`, `domain/invoice/`) com o arquivo da entidade no **singular**, a interface do repositório no **plural** e um `errors.ts`. Value objects compartilhados ficam em `domain/shared/`.

| Papel | Classe | Arquivo |
| --- | --- | --- |
| Entidade | `OrderEntity`, `CustomerEntity`, `InvoiceEntity` | `domain/order/order-entity.ts`, `domain/customer/customer-entity.ts`, `domain/invoice/invoice-entity.ts` |
| Value object | `Money` | `domain/shared/money.ts` |
| Porta de repositório | `OrdersRepository`, `CustomersRepository`, `InvoicesRepository` (interface, nome no plural) | `domain/order/orders-repository.ts`, `domain/customer/customers-repository.ts`, `domain/invoice/invoices-repository.ts` |
| Outra porta | `OrderEventsPublisher`, `UnitOfWork` | `application/ports/order-events-publisher.ts`, `application/ports/unit-of-work.ts` |
| Caso de uso | `CreateOrderUseCase`, `CreateInvoiceFromOrderUseCase` (método único `execute(args)`) | `use-cases/create-order.ts`, `use-cases/create-invoice-from-order.ts` (sem o sufixo `use-case` no arquivo) |
| Repositório Drizzle | `Drizzle<Plural>Repository` | `drizzle-<plural>-repository.ts` |
| Adapter de outbox / mensageria | `OutboxOrderEventsPublisher`, `OutboxRelay`, `DrizzleUnitOfWork` | `infra/db/outbox/outbox-order-events-publisher.ts`, `infra/messaging/outbox-relay.ts`, `infra/db/drizzle-unit-of-work.ts` |
| Fake de repositório | `InMemory<Plural>Repository`, `InMemoryUnitOfWork` | `test/fakes/in-memory-<plural>-repository.ts`, `test/fakes/in-memory-unit-of-work.ts` |
| Outro fake | `Fake<Porta>` | `test/fakes/fake-order-events-publisher.ts` |
| Erro | `<Descrição>Error extends Error`, com `this.name` igual ao nome da classe | `domain/<agregado>/errors.ts` (`domain/order/errors.ts`, `domain/customer/errors.ts`, `domain/invoice/errors.ts`) |

Os argumentos dos use cases são um objeto tipado com `type <UseCase>Args = { ... }` (`CreateOrderArgs`, `CreateInvoiceFromOrderUseCaseArgs`).

### Entidades: construtor privado + `static create` / `static restore`

- `private constructor(props)`: ninguém faz `new` fora da classe.
- `static create(...)`: cria uma entidade **nova**. Valida invariantes, gera o `id` com `randomUUID()` e define valores iniciais (ex.: `status: OrderStatus.PENDING`, `createdAt: new Date()`).
- `static restore(props)`: reidrata uma entidade já existente, sem validar e sem gerar id. É usado pelos repositórios (`CustomerEntity.restore` em `DrizzleCustomersRepository`) e nos testes.
- `CustomerEntity` tem só `restore`, porque o serviço não cria clientes.

### Encapsulamento com `#`

- Estado mutável fica em campos privados `#` com getter público. Exemplo: `#status` + `get status()` em `OrderEntity`, alterado só por `pay()` e `cancel()`, que lançam `InvalidOrderStatusTransitionError` se o status não for `pending`.
- Dependências injetadas também usam `#`: `#ordersRepository`, `#db`, `#channel`.
- Dados imutáveis são `readonly` públicos (`readonly id`, `readonly amount`).

### `as const` no lugar de `enum`

```ts
export const OrderStatus = {
  PENDING: "pending",
  PAID: "paid",
  CANCELED: "canceled",
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];
```

(`services/orders/src/domain/order/order-entity.ts`). No banco, o equivalente é `pgEnum("orders_status", [...])` do Drizzle, que é uma função e não um `enum` TypeScript.

### Imports

- **Extensão `.ts` obrigatória** nos imports relativos: `import { Money } from "../../domain/shared/money.ts"`. O `tsconfig.json` habilita `allowImportingTsExtensions` e `noEmit`.
- **`import type`** para tudo que é só tipo (`import type { OrdersRepository } ...`) ou `type` inline (`import { orderCreatedMessageSchema, type OrderCreatedMessage }`). O `verbatimModuleSyntax: true` no tsconfig faz o `tsc` exigir isso.

### Restrições do `--experimental-strip-types`

Os serviços rodam TypeScript direto no Node (`node --experimental-strip-types src/server.ts`), sem build. O Node só **remove** anotações de tipo, então não é possível usar sintaxe TypeScript que gera código JavaScript:

- **sem `enum`**: use objeto `as const`, como acima;
- **sem parameter properties** (`constructor(private repo: X)`): declare o campo `#repo` e atribua no corpo do construtor, como em `CreateOrderUseCase`;
- **sem `namespace`** com código;
- imports de tipo precisam ser `import type`, senão o Node tenta importar um binding que não existe em runtime.

### Dinheiro em centavos com `Money`

- Valores monetários são inteiros em **centavos**. `Money.fromCents(cents)` lança `InvalidMoneyError` se o valor não for inteiro ou for negativo. Zero é aceito pelo `Money` e rejeitado pelo `OrderEntity` (`amount.isZero()` → `InvalidOrderAmountError`).
- A entidade guarda `Money`. Repositório e contrato usam o número: `amount: order.amount.cents` em `DrizzleOrdersRepository` e em `CreateOrderUseCase`. A coluna `orders.amount` é `integer`.
- `Money` existe só no orders. O invoices não guarda valor.

### Outros padrões

- Validação de entrada HTTP com zod via `fastify-type-provider-zod` (`schema: { body: z.object({ ... }) }`).
- Variáveis de ambiente obrigatórias são checadas no carregamento do módulo, com `throw new Error(...)` (`infra/db/client.ts`, `infra/messaging/client.ts`, `drizzle.config.ts`).
- Os testes usam `sut` ("system under test") para o objeto testado.

---

## 6. Testes

Vitest em todos os serviços. `vitest.config.ts` (igual nos dois):

```ts
test: {
  setupFiles: ["./test/setup.ts"],
  fileParallelism: false,   // os testes de banco compartilham o mesmo DB
  silent: "passed-only",
}
```

### 6.1 Tipos de teste

| Tipo | orders | invoices | Precisa de banco? |
| --- | --- | --- | --- |
| Domínio (entidades / VOs) | `test/domain/order-entity.test.ts`, `test/domain/money.test.ts` | `test/domain/invoice-entity.test.ts` | Não |
| Caso de uso (com fakes in-memory) | `test/application/create-order.test.ts` | `test/application/create-invoice-from-order.test.ts` | Não |
| Adapter de saída: Drizzle (repositórios, unit of work, outbox) | `test/infra/db/drizzle-orders-repository.test.ts`, `drizzle-customers-repository.test.ts`, `drizzle-unit-of-work.test.ts`, `outbox-order-events-publisher.test.ts` | `test/infra/db/drizzle-invoices-repository.test.ts` | **Sim** (Postgres de teste) |
| Relay do outbox | `test/infra/messaging/outbox-relay.test.ts` (banco real + canal fake `{ publish, waitForConfirms }`) | — | **Sim** (Postgres de teste), sem RabbitMQ |
| Conexão com retentativas | `test/infra/messaging/connect-with-retry.test.ts` (sleep falso) | `test/infra/messaging/connect-with-retry.test.ts` | Não |
| Adapter de entrada: rota HTTP | `test/infra/http/app.test.ts` (`buildApp` + `app.inject`) | — | Não |
| Adapter de entrada: handler e consumer | — | `test/infra/messaging/order-created.handler.test.ts`, `test/infra/messaging/consumer.test.ts` (canal fake `{ consume, ack, nack, sendToQueue, cancel }`) | Não |

A pasta `test/` espelha o `src/`: `test/domain/`, `test/application/`, `test/infra/{db,http,messaging}/`, mais `test/fakes/` para os test doubles. Hoje o invoices não tem testes em `test/infra/http/`.

Os testes de `test/infra/db/` e o do relay importam o `db` real (`src/infra/db/client.ts`), limpam as tabelas no `beforeEach` (`db.delete(schema.orders)` etc.) e fecham a conexão no `afterAll` (`db.$client.end()`). Nenhum teste precisa de RabbitMQ.

Fakes e test doubles ficam em `test/fakes/`: os repositórios in-memory (`in-memory-*-repository.ts`) e o publisher falso (`fake-order-events-publisher.ts`).

### 6.2 `.env.test` e `test/setup.ts`

- `test/setup.ts` tem uma linha: `process.loadEnvFile(".env.test");`. O caminho é relativo ao diretório atual, que é o diretório do workspace quando o teste roda via `npm run test` / `-w`.
- `.env.test` define só `DATABASE_URL`, apontando para o banco `*_test`:
  - orders: `postgresql://docker:docker@127.0.0.1:5482/orders_test`
  - invoices: `postgresql://docker:docker@127.0.0.1:5483/invoices_test`
- Os bancos `orders_test` / `invoices_test` são criados pelos scripts `services/*/docker/create-test-database.sql`, montados em `/docker-entrypoint-initdb.d` no `docker-compose.yml` de cada serviço. O script só roda quando o volume do Postgres é criado pela primeira vez.
- As migrations de teste rodam com `npm run db:migrate:test`, que é `node --env-file=.env.test ../../node_modules/.bin/drizzle-kit migrate`.

### 6.3 Como rodar

```bash
# Raiz: todos os workspaces (orders e invoices; contracts não tem script test)
npm test
npm run typecheck

# Um workspace
npm test -w @microservices/orders
npm run test:watch -w @microservices/invoices
npm run typecheck -w @microservices/orders

# Um arquivo (de dentro do serviço)
cd services/orders && npx vitest run test/domain/money.test.ts
```

Para os testes de banco passarem, o Postgres do serviço precisa estar rodando e migrado (ver [7](#7-desenvolvimento-local)).

### 6.4 CI

`.github/workflows/ci.yml` roda em `push` para `main` e em todo `pull_request`, com um único job `test` (ubuntu-latest):

1. Sobe dois containers `postgres:16`: `orders-db` (porta 5482, DB `orders_test`) e `invoices-db` (porta 5483, DB `invoices_test`), ambos com user/senha `docker`/`docker`. São as mesmas URLs dos `.env.test`.
2. `actions/setup-node@v4` com Node 22 e cache do npm.
3. `npm ci`
4. `npm run typecheck`
5. `npm run db:migrate:test -w @microservices/orders` e `npm run db:migrate:test -w @microservices/invoices`
6. `npm test`

O CI não sobe RabbitMQ nem Kong e não faz build de imagens Docker nem deploy.

---

## 7. Desenvolvimento local

### 7.1 Requisitos

- **Node.js 22, versão ≥ 22.6.**
  - Os Dockerfiles dos dois serviços usam `FROM node:22-alpine` (`services/orders/Dockerfile`, `services/invoices/Dockerfile`).
  - O CI usa `node-version: 22` e o tsconfig estende `@tsconfig/node22`.
  - O mínimo 22.6 vem do `--experimental-strip-types`, usado nos scripts `dev` e `start`.
  - Não há campo `engines` nem `.nvmrc`.
- **Docker + Docker Compose**, para RabbitMQ, Jaeger, Kong e um Postgres por serviço.
- **npm**, por causa dos workspaces. Não há configuração para yarn ou pnpm.

### 7.2 Passo a passo do zero

Todos os comandos partem da raiz do repositório, salvo indicação.

**1. Dependências**

```bash
npm install
```

**2. Infra compartilhada** (`docker-compose.yml` da raiz: RabbitMQ, Jaeger e Kong)

```bash
docker compose up -d
```

O Kong é construído a partir de `docker/kong` e encaminha para `http://host.docker.internal:3333` (orders) e `:3334` (invoices). Por isso, os serviços rodam **no host**, e não em containers.

**3. Postgres de cada serviço**

```bash
docker compose -f services/orders/docker-compose.yml up -d     # projeto app-orders, porta 5482
docker compose -f services/invoices/docker-compose.yml up -d   # projeto app-invoices, porta 5483
```

Cada compose monta `services/<serviço>/docker` em `/docker-entrypoint-initdb.d`. Assim, o script `create-test-database.sql` cria o banco `orders_test` / `invoices_test` ao lado do banco principal. Ele só roda na primeira inicialização do volume de dados.

**4. Arquivos `.env`**

```bash
cp services/orders/.env.example services/orders/.env
cp services/invoices/.env.example services/invoices/.env
```

Os `.env.test` já estão versionados e não precisam ser criados.

**5. Migrations de dev**

O script `npm run db:migrate` (`drizzle-kit migrate`) **não** carrega o `.env`, e o `drizzle.config.ts` lança erro sem `DATABASE_URL`. Rode o drizzle-kit com `--env-file`, de dentro de cada serviço, como o `db:migrate:test` já faz:

```bash
cd services/orders
node --env-file=.env ../../node_modules/.bin/drizzle-kit migrate
cd ../invoices
node --env-file=.env ../../node_modules/.bin/drizzle-kit migrate
cd ../..
```

**6. Migrations de teste**

```bash
npm run db:migrate:test -w @microservices/orders
npm run db:migrate:test -w @microservices/invoices
```

**7. Customer padrão**

`POST /orders` usa o cliente fixo `DEFAULT_CUSTOMER_ID = "5961a952-0d3e-465f-b635-4b93a1cefa97"` (`services/orders/src/infra/http/app.ts`). Como não existe seed, insira o cliente manualmente no banco `orders`:

```bash
docker compose -f services/orders/docker-compose.yml exec orders-pg \
  psql -U docker -d orders -c "INSERT INTO customers (id, name, email, address, state, zip_code, country) VALUES ('5961a952-0d3e-465f-b635-4b93a1cefa97', 'John Doe', 'johndoe@example.com', 'Rua das Flores, 123', 'PR', '80000-000', 'Brazil') ON CONFLICT (id) DO NOTHING;"
```

- As colunas seguem a migration `0000_aromatic_queen_noir.sql`. `date_of_birth` é a única coluna opcional.
- O `ON CONFLICT (id) DO NOTHING` deixa o comando seguro para rodar de novo.
- `name` e `email` precisam passar no `orderCreatedMessageSchema` (`name` não vazio, `email` válido). Caso contrário, o `parse` do outbox lança, a transação é desfeita e a rota responde 500.

**8. Serviços** (um terminal para cada)

```bash
npm run dev -w @microservices/invoices    # :3334. Suba primeiro: cria as filas e o bind na exchange
npm run dev -w @microservices/orders      # :3333, node --env-file=.env --experimental-strip-types --watch
```

Se o RabbitMQ ainda não estiver pronto, os serviços tentam conectar de novo por alguns segundos (ver [3.6](#36-ciclo-de-vida-dos-serviços)).

**9. Testar o fluxo pelo Kong**

```bash
curl -X POST http://127.0.0.1:8000/orders \
  -H 'Content-Type: application/json' \
  -d '{"amount": 1050}'
# → 201 {"orderId":"..."}
```

O `amount` é repassado como centavos (`amountInCents`). Para conferir:

- O relay publica o evento na exchange `events` em até 1 s, e a mensagem passa pela fila `invoices.order-created`, visível na UI do RabbitMQ. Na tabela `outbox_events`, o `published_at` fica preenchido.
- O invoices grava uma linha na tabela `invoices` com o `order_id`.
- Os traces dos dois serviços aparecem no Jaeger.

**10. Testes**

```bash
npm run typecheck
npm test
```

### 7.3 Portas

| Porta (host) | Componente | Origem |
| --- | --- | --- |
| 3333 | orders (HTTP, Fastify) | `PORT ?? 3333` em `services/orders/src/server.ts` |
| 3334 | invoices (HTTP, Fastify, só `/health`) | `PORT ?? 3334` em `services/invoices/src/server.ts` |
| 5482 | Postgres do orders (`orders`, `orders_test`) | `services/orders/docker-compose.yml` |
| 5483 | Postgres do invoices (`invoices`, `invoices_test`) | `services/invoices/docker-compose.yml` |
| 5672 | RabbitMQ (AMQP) | `docker-compose.yml` (raiz) |
| 15672 | RabbitMQ Management UI | `docker-compose.yml` (raiz) |
| 8000 | Kong proxy (entrada da API) | `docker-compose.yml` (raiz) |
| 8001 | Kong Admin API | `docker-compose.yml` (raiz) |
| 8002 | Kong Admin GUI | `docker-compose.yml` (raiz) |
| 8443 / 8444 | Kong proxy HTTPS / Admin API HTTPS | `docker-compose.yml` (raiz) |
| 8100 | Kong Status API (`/status/ready`) | `docker-compose.yml` (raiz) |
| 16686 | Jaeger UI | `docker-compose.yml` (raiz) |
| 4317 / 4318 | Jaeger OTLP gRPC / HTTP (os serviços usam 4318) | `docker-compose.yml` (raiz) |
| 6831/udp, 14268 | Jaeger, coletores legados | `docker-compose.yml` (raiz) |

### 7.4 `127.0.0.1` em vez de `localhost`

Use `127.0.0.1` nas URLs locais (`DATABASE_URL`, `BROKER_URL`, `OTEL_EXPORTER_OTLP_ENDPOINT`, curl). Os `.env.example` e `.env.test` já fazem isso. No Node 17+, `localhost` pode resolver primeiro para o endereço IPv6 `::1`. Dependendo do ambiente (por exemplo, WSL2 com Docker), a porta publicada pelo container não responde em IPv6, e a conexão falha com `ECONNREFUSED ::1:<porta>`. Com `127.0.0.1`, o IPv4 é usado sempre.

### 7.5 Variáveis de ambiente (`.env.example`)

| Variável | orders | invoices |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://docker:docker@127.0.0.1:5482/orders` | `postgresql://docker:docker@127.0.0.1:5483/invoices` |
| `BROKER_URL` | `amqp://127.0.0.1:5672` | `amqp://127.0.0.1:5672` |
| `OTEL_TRACES_EXPORTER` | `otlp` | `otlp` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://127.0.0.1:4318` (Jaeger) | `http://127.0.0.1:4318` |
| `OTEL_SERVICE_NAME` | `app-orders` | `app-invoices` |
| `OTEL_NODE_RESOURCE_DETECTORS` | `env,host,os` | `env,host,os` |
| `OTEL_NODE_ENABLED_INSTRUMENTATIONS` | `http,fastify,pg,amqplib` | `http,fastify,pg,amqplib` |
| `PORT` (opcional) | padrão `3333` | padrão `3334` |

O `BROKER_URL` local não tem credenciais, então o amqplib usa o usuário padrão do RabbitMQ (`guest`/`guest`). As mesmas credenciais servem para a UI em `:15672`.

### 7.6 Migrations

- Os schemas ficam em `src/infra/db/schema/*` e as migrations em `src/infra/db/migrations/` (`drizzle.config.ts`).
- O `casing: "snake_case"` converte os nomes: `customerId` vira a coluna `customer_id`.
- Não existe script npm para `drizzle-kit generate`. Para gerar uma migration nova, use o mesmo padrão do `migrate`, de dentro do serviço: `node --env-file=.env ../../node_modules/.bin/drizzle-kit generate`.

---

## 8. Infra e deploy

O deploy fica em `infra/`, um projeto **Pulumi** em TypeScript (`@pulumi/awsx` classic + `@pulumi/docker-build`) para a AWS. O projeto se chama `microsservico-node-infra` e usa a stack `dev` (`Pulumi.dev.yaml`, `aws:region: us-east-1`). Ele não é workspace npm: tem `package.json` e `package-lock.json` próprios, então rode `npm install` dentro de `infra/`.

### 8.1 O que o Pulumi cria

| Recurso | Arquivo | Detalhes |
| --- | --- | --- |
| Cluster ECS | `src/cluster.ts` | `awsx.classic.ecs.Cluster("app-cluster")` |
| Application Load Balancer | `src/load-balancer.ts` | `app-lb`, com os security groups do cluster |
| Network Load Balancer | `src/load-balancer.ts` | `net-lb`, nas subnets públicas da VPC do cluster |
| Repositórios ECR + imagens | `src/images/{orders,invoices,kong}.ts` | `app-orders-ecr`, `app-invoices-ecr`, `app-kong-ecr` (`forceDelete: true`) |
| Fargate `fargate-orders` | `src/services/orders.ts` | 256 CPU / 512 MB. ALB listener e target group na porta 3333, health check `GET /health` |
| Fargate `fargate-invoices` | `src/services/invoices.ts` | 256 CPU / 512 MB. ALB na porta 3334, health check `GET /health` |
| Fargate `fargate-rabbitmq` | `src/services/rabbitmq.ts` | imagem pública `rabbitmq:3-management`, 512 CPU / 1024 MB. AMQP 5672 pelo **NLB** (TCP). Management UI 15672 pelo ALB |
| Fargate `fargate-kong` | `src/services/kong.ts` | 256 CPU / 512 MB. ALB porta **80 → 8000** (proxy), 8002 (Admin GUI), 8001 (Admin API). Container expõe também 8100 (Status API) |

Todos os serviços usam `desiredCount: 1` e `waitForSteadyState: false`.

O Kong recebe `ORDERS_SERVICE_URL` / `INVOICES_SERVICE_URL` apontando para o hostname e a porta dos listeners do ALB dos serviços. O `startup.sh` substitui esses valores no `config.template.yaml`, como no ambiente local.

O orders e o invoices recebem:

- `BROKER_URL`, montado com usuário, senha e o endpoint do NLB;
- `DATABASE_URL`;
- as variáveis `OTEL_*`, com `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`, apontando para o Grafana Cloud.

**O Pulumi não cria bancos Postgres.** As URLs dos bancos são recebidas por config e apontam para uma instância externa, que precisa ser acessível a partir do Fargate.

Saídas exportadas em `infra/index.ts`: `ordersId`, `ordersUrl`, `invoiceId`, `invoiceUrl`, `rabbitMQId`, `rabbitMQAdminUrl`, `kongId`, `kongUIUrl`.

### 8.2 Build das imagens

O build é feito pelo próprio `pulumi up` (`docker.Image` do `@pulumi/docker-build`, `platforms: ["linux/amd64"]`, `push: true`, tag `:latest` no ECR). Por isso, a máquina que roda o deploy precisa do Docker.

- **orders / invoices**: `context.location: ".."` (a **raiz do repositório**) e `dockerfile.location: "../services/<serviço>/Dockerfile"`. O contexto precisa ser a raiz porque o Dockerfile copia o `package-lock.json` da raiz, os `package.json` de todos os workspaces e `packages/contracts`. Em seguida, roda `npm ci --omit=dev --workspace=@microservices/<serviço>`. O `.dockerignore` da raiz exclui `node_modules`, `.env*`, `test`, `infra`, `docker` etc.
- **kong**: `context.location: "../docker/kong"`, usando o `Dockerfile` dessa pasta.
- As imagens dos serviços rodam `node --experimental-strip-types --no-warnings src/server.ts`, sem etapa de build TypeScript, como usuário não-root `api`.

### 8.3 Secrets e configuração

`infra/src/config.ts` lê a configuração da stack com `pulumi.Config`:

| Chave | Leitura | Uso |
| --- | --- | --- |
| `ordersDatabaseUrl` | `config.requireSecret` | `DATABASE_URL` do orders |
| `invoicesDatabaseUrl` | `config.requireSecret` | `DATABASE_URL` do invoices |
| `otlpHeaders` | `config.requireSecret` | `OTEL_EXPORTER_OTLP_HEADERS` (autenticação no Grafana Cloud) |
| `brokerUsername` | `config.requireSecret` | `RABBITMQ_DEFAULT_USER` e `BROKER_URL` |
| `brokerPassword` | `config.requireSecret` | `RABBITMQ_DEFAULT_PASS` e `BROKER_URL` |
| `otlpEndpoint` | `config.require` (não secreto) | `OTEL_EXPORTER_OTLP_ENDPOINT` |

- Os secrets ficam criptografados em `Pulumi.dev.yaml` (`secure: ...`) e são definidos com `pulumi config set --secret <chave> <valor>`.
- Nenhum valor deve ir para o código nem para a documentação.
- No ECS, os valores são passados no `environment` da task definition.

### 8.4 Health check do Kong

O target group do proxy (`proxy-target`, porta 8000) **não** verifica a porta do proxy. Ele usa a Status API do Kong:

```ts
healthCheck: {
  path: "/status/ready",
  port: "8100", // health check: Status API do Kong
  protocol: "HTTP",
},
```

A porta 8100 é habilitada por `KONG_STATUS_LISTEN=0.0.0.0:8100` (tanto no `docker-compose.yml` quanto em `src/services/kong.ts`). Na porta 8000, o proxy só responde às rotas `/orders` e `/invoices` e devolve 404 para `/`. Já o `/status/ready` responde 200 quando o Kong carregou a configuração declarativa e está pronto para receber tráfego.

### 8.5 Deploy efêmero

A stack sobe recursos cobrados por hora: dois load balancers, quatro tarefas Fargate e o RabbitMQ em Fargate. A recomendação é usar deploy **efêmero**: subir para demonstrar ou validar e destruir logo depois.

```bash
cd infra
npm install
pulumi stack select dev
pulumi up        # build + push das imagens e criação dos recursos
# ... demonstração / testes usando as URLs exportadas ...
pulumi destroy   # remove tudo; os repositórios ECR têm forceDelete: true
```

Pré-requisitos: Pulumi CLI, credenciais AWS configuradas, Docker local (para o build) e os secrets da stack definidos. O banco Postgres externo não é afetado pelo `destroy`.

---

## 9. Como adicionar uma feature

Checklist na ordem em que o trabalho deve ser feito. Pule os passos que a feature não exige (por exemplo, o contrato, se ela não troca mensagens).

1. **Contrato**: se a feature publica ou consome uma mensagem, crie o schema zod, o tipo, a constante do tipo do evento e a routing key em `packages/contracts/src/messages/<nome>-message.ts` e exporte em `packages/contracts/src/index.ts`. A exchange continua sendo `events` e o envelope, `{ data }`.
2. **Entidade / value object**: em `src/domain/<agregado>/<agregado>-entity.ts` (value objects compartilhados em `src/domain/shared/`), com `private constructor`, `static create` (valida e gera o id) e `static restore`. Erros em `domain/<agregado>/errors.ts`. Teste em `test/domain/`, sem banco.
3. **Porta**: a interface de repositório fica em `src/domain/<agregado>/<plural>-repository.ts`. Outras portas (publisher etc.) ficam em `src/application/ports/`.
4. **Use case + teste com fakes**: classe `XxxUseCase` em `src/application/use-cases/`, com as portas injetadas no construtor em campos `#` e o método `execute(args)`. Teste em `test/application/` com os fakes `InMemory*Repository` e `Fake*` de `test/fakes/`. Crie os fakes que faltarem.
5. **Adapter de saída + teste de integração**:
   - Repositório Drizzle em `src/infra/db/repositories/drizzle-<plural>-repository.ts`, com schema em `src/infra/db/schema/` registrado em `schema/index.ts`. Teste em `test/infra/db/` contra o banco `*_test`.
   - Evento publicado pelo orders: grave no outbox dentro do unit of work (validando com o schema do contrato) e adicione o tipo em `ROUTING_KEY_BY_EVENT_TYPE` do `OutboxRelay`.
6. **Adapter de entrada + teste**:
   - Rota em `src/infra/http/app.ts`, recebendo o use case como `Pick<XxxUseCase, "execute">`. Teste em `test/infra/http/` com `app.inject`.
   - Ou handler de mensagem em `src/infra/messaging/handlers/`, validando `payload.data` com `safeParse` e lançando `InvalidMessageError` se falhar. O handler não faz ack/nack: registre-o com `startConsumer`, e declare as filas (principal, retry, DLQ) e o bind em `topology.ts`. Teste em `test/infra/messaging/` sem canal. O consumidor precisa ser idempotente.
7. **Ligar no `server.ts`**: instancie o adapter concreto, depois o use case, e passe o use case para o adapter de entrada. O import do OpenTelemetry continua na primeira linha.
8. **Migration**: gere com `drizzle-kit generate` (ver [7.6](#76-migrations)) e aplique no banco de dev e no de teste (`npm run db:migrate:test -w <workspace>`). O CI aplica as migrations de teste antes do `npm test`.

No fim, rode `npm run typecheck` e `npm test` na raiz.

---

## 10. Limitações conhecidas

Esta seção só descreve o comportamento atual. Não há propostas de solução aqui.

- **Customer fixo.** Todo `POST /orders` usa `DEFAULT_CUSTOMER_ID` (`5961a952-0d3e-465f-b635-4b93a1cefa97`), definido em `services/orders/src/infra/http/app.ts` com o comentário "Temporário: até a feature de customers". Não existe cadastro de clientes nem seed. O body aceita só `amount`.
- **Eventos sem bind são descartados.** A exchange `events` é topic. Um evento publicado antes de existir uma fila ligada à routing key dele é descartado pelo RabbitMQ, mesmo com o confirm do publisher. O outbox o marca como publicado.
- **Sem reconexão dentro do processo.** Se a conexão com o RabbitMQ cair, o serviço sai com código 1 e depende do orquestrador (ECS, política de restart do container) para voltar. No `npm run dev` local, o processo fica parado até ser reiniciado.
- **Logs com `console`.** O logging é feito com `console.log`, `console.warn` e `console.error`:
  - mensagem de servidor no ar, nos dois `server.ts`;
  - erros 500, no error handler do orders;
  - retentativas, envios para a DLQ e falhas de conexão, na mensageria;
  - o relay do outbox e o shutdown.

  O logger do Fastify não está habilitado (`fastify()` sem opções), e não há log estruturado nem correlação dos logs com os traces do OpenTelemetry.

---

## 11. Inconsistências e pontos de atenção

Itens encontrados durante a leitura do código e ainda não resolvidos. Os itens já corrigidos foram removidos da lista: `.gitignore` com linhas coladas, `noUnusedLocals` só no orders, teste do repositório de invoices sem asserção, nome de arquivo de entidade no plural, `Order` fora de subpasta, layout de `test/` diferente entre os serviços `app` pronto no invoices em vez de `buildApp()`, import duplicado no `server.ts` do invoices, nome da fila duplicado e falta de atomicidade entre `save` e `publish`.

### Configuração / repositório

1. **`infra/README.md` é o README do template do Pulumi.** Ele diz que o programa "creates an S3 bucket" e cita Node >= 14. O `Pulumi.yaml` também mantém `description: A minimal AWS TypeScript Pulumi program`.
2. **`infra/` usa outro padrão de módulos.** `infra/tsconfig.json` usa `module: nodenext`, imports sem extensão (`from "./src/services/orders"`) e `@types/node ^18`, diferente dos serviços. O nome do pacote (`microsservico-node-infra`) também não segue o escopo `@microservices/`.
3. **Sem `engines` / `.nvmrc`.** A exigência de Node 22 está só implícita (CI, Dockerfile, tsconfig).

### Arquitetura / código

4. **Error handler só no orders.** Os dois serviços agora usam `buildApp()`, mas só o do orders configura `setErrorHandler`, que esconde os detalhes de erros 500. O `buildApp()` do invoices não configura error handler e não recebe dependências, porque só expõe `/health`.
5. **Kong roteia `/invoices`, mas o invoices não tem rota `/invoices`**, só `/health`. O `/health` dos serviços também não é exposto pelo Kong.
6. **CORS configurado duas vezes**: no plugin `cors` do Kong e no `@fastify/cors` (`origin: "*"`) de cada serviço.
7. **Cliente fixo na rota** (`DEFAULT_CUSTOMER_ID`, marcado como temporário no código) e nenhum seed para criá-lo.
8. **O domínio importa `node:crypto`.** A regra "domain não importa nada de fora" vale para pacotes de terceiros e outras camadas. Os módulos built-in do Node são usados (`randomUUID`).
9. **Validação de `orderId` diferente de `customerId`.** `InvoiceEntity.create` usa `orderId?.trim()` (optional chaining) e `OrderEntity.create` usa `customerId.trim()`.
10. **O invoice guarda só `orderId`.** O valor (`amount`) e o cliente vêm na mensagem e são ignorados. A tabela `invoices` não tem `amount` nem `created_at`.

### Convenções de nomes

11. **`InvalidMoneyError` fora de um `errors.ts`.** Os erros dos agregados ficam em `domain/<agregado>/errors.ts`, mas o `InvalidMoneyError` está dentro de `domain/shared/money.ts`.
12. **Sufixo `.handler.ts`.** Só `order-created.handler.ts` usa sufixo com ponto. Os outros arquivos usam só kebab-case (`outbox-order-events-publisher.ts`, `drizzle-orders-repository.ts`).
13. **Nome do tipo de argumentos dos use cases.** O orders usa `CreateOrderArgs` e o invoices usa `CreateInvoiceFromOrderUseCaseArgs`.
14. **Comentários de seção no `server.ts`.** O orders tem "Adapters de sáida" (com erro de acentuação) e "Adapter de entrada". O invoices tem "Adapters de saída", "UseCases" e "Adapters de entrada".

### Testes

15. **Sem testes para:** `setupTopology` (`topology.ts`), o `shutdown` dos `server.ts`, o `GET /health` dos dois serviços (o invoices não tem nada em `test/infra/http/`) e o pacote `@microservices/contracts`.
