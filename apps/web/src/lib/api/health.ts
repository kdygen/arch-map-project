import { z } from "zod";

import { apiGet } from "./client";

const healthSchema = z.object({ status: z.literal("healthy") });

export type HealthResponse = z.infer<typeof healthSchema>;

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiGet("/health", { schema: healthSchema, signal });
}
