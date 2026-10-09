import { z } from "zod";

// Corpo das respostas de erro montadas pelo error handler.
export const errorResponseSchema = z.object({ message: z.string() });
