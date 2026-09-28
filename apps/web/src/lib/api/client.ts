import type { ZodType } from "zod";

const DEFAULT_API_BASE_URL = "http://localhost:8000";

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(
  /\/+$/,
  "",
);

/**
 * - `network`: the API could not be reached at all.
 * - `http`: the API answered with an error status.
 * - `malformed`: the API answered, but not with the shape we expect.
 */
export type ApiErrorKind = "network" | "http" | "malformed";

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
    /** A stable machine-readable code, when the API sent one. */
    readonly code?: string,
    /** The API's own explanation, safe to show to people. */
    readonly detail?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue | readonly string[]>;

export function buildUrl(path: string, params: QueryParams = {}): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    if (typeof value === "object") {
      for (const item of value) search.append(name, item);
    } else {
      search.append(name, String(value));
    }
  }
  const query = search.toString();
  return `${API_BASE_URL}/api/v1${path}${query ? `?${query}` : ""}`;
}

export function isAbortError(error: unknown): boolean {
  // Checked by name, because DOMException is not always an Error subclass.
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
  );
}

type RequestOptions<T> = {
  /** Every response is validated. Nothing unchecked reaches the UI. */
  schema: ZodType<T>;
  params?: QueryParams;
  signal?: AbortSignal;
};

async function errorFromResponse(response: Response): Promise<ApiError> {
  let code: string | undefined;
  let detail: string | undefined;
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null) {
      if ("code" in body && typeof body.code === "string") code = body.code;
      if ("detail" in body && typeof body.detail === "string") detail = body.detail;
    }
  } catch {
    // The error body is optional. The status alone is enough.
  }
  return new ApiError(
    "http",
    `API responded with ${response.status}`,
    response.status,
    code,
    detail,
  );
}

async function request<T>(url: string, init: RequestInit, schema: ZodType<T>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError("network", "Could not reach the API");
  }

  if (!response.ok) throw await errorFromResponse(response);

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError("malformed", "API response was not valid JSON", response.status);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("malformed", "API response had an unexpected shape", response.status);
  }
  return parsed.data;
}

export function apiGet<T>(path: string, options: RequestOptions<T>): Promise<T> {
  return request(
    buildUrl(path, options.params),
    { signal: options.signal, headers: { Accept: "application/json" } },
    options.schema,
  );
}

export function apiPost<T>(
  path: string,
  body: unknown,
  options: Omit<RequestOptions<T>, "params">,
): Promise<T> {
  return request(
    buildUrl(path),
    {
      method: "POST",
      signal: options.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    options.schema,
  );
}
