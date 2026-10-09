-- Ainda não há dados de produção. As faturas antigas não têm valor, status nem
-- cliente e não podem receber as colunas NOT NULL abaixo, então são apagadas
-- para a migration não falhar em bancos de dev que já tenham faturas.
DELETE FROM "invoices";--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('open', 'paid', 'canceled');--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "amount" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "status" "invoice_status" NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "customer_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "customer_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "customer_email" text NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "due_date" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;