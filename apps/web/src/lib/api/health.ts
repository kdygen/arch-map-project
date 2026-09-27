import { ApiError, apiGet } from "./client";

export type HealthResponse = {
  status: "healthy";
};

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const body = await apiGet<Partial<HealthResponse>>("/health", signal);
  if (body.status !== "healthy") {
    throw new ApiError("API returned an unexpected health payload");
  }
  return { status: body.status };
}
