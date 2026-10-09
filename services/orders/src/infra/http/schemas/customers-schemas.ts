import { z } from "zod";

export const createCustomerBodySchema = z.object({
  name: z.string(),
  email: z.email(),
  address: z.string(),
  state: z.string(),
  zipCode: z.string(),
  country: z.string(),
  dateOfBirth: z.iso.date().optional(),
});

export const customerParamsSchema = z.object({ id: z.string() });

export const createCustomerResponseSchema = z.object({ customerId: z.string() });

export const customerResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  address: z.string(),
  state: z.string(),
  zipCode: z.string(),
  country: z.string(),
  dateOfBirth: z.iso.datetime().nullable(),
});

export type CreateCustomerBody = z.infer<typeof createCustomerBodySchema>;
export type CustomerParams = z.infer<typeof customerParamsSchema>;
