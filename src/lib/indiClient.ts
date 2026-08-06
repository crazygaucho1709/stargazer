// src/lib/indiClient.ts

export enum INDIErrorCode {
  TIMEOUT = "TIMEOUT",
  NOT_CONNECTED = "NOT_CONNECTED",
  DEVICE_NOT_FOUND = "DEVICE_NOT_FOUND",
  LIMIT_REACHED = "LIMIT_REACHED",
  UNKNOWN = "UNKNOWN",
}

export class INDIError extends Error {
  public readonly code: INDIErrorCode;

  constructor(code: INDIErrorCode, message: string) {
    super(message);
    this.name = "INDIError";
    this.code = code;
  }
}

const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapErrorCode(status: number, body: string): INDIErrorCode {
  const lower = body.toLowerCase();

  if (status === 504 || lower.includes("timeout") || lower.includes("timed out")) {
    return INDIErrorCode.TIMEOUT;
  }
  if (
    lower.includes("not connected") ||
    lower.includes("bridge") ||
    lower.includes("indi not connected") ||
    status === 503
  ) {
    return INDIErrorCode.NOT_CONNECTED;
  }
  if (
    lower.includes("device not found") ||
    lower.includes("no device") ||
    lower.includes("driver") ||
    lower.includes("périphérique")
  ) {
    return INDIErrorCode.DEVICE_NOT_FOUND;
  }
  if (
    lower.includes("limit") ||
    lower.includes("limite") ||
    lower.includes("slew cancelled") ||
    lower.includes("slew annulé")
  ) {
    return INDIErrorCode.LIMIT_REACHED;
  }

  return INDIErrorCode.UNKNOWN;
}

function mapErrorCodeFromBody(body: Record<string, unknown>): INDIErrorCode {
  // Prefer explicit error_code field if set by the API route
  if (typeof body.error_code === "string") {
    const code = body.error_code as string;
    if (Object.values(INDIErrorCode).includes(code as INDIErrorCode)) {
      return code as INDIErrorCode;
    }
  }

  const message =
    typeof body.error === "string"
      ? body.error
      : typeof body.message === "string"
      ? body.message
      : "";

  return mapErrorCode(0, message);
}

export async function indiRequest<T>(
  endpoint: string,
  options?: RequestInit,
  retries: number = RETRY_COUNT
): Promise<T> {
  let lastError: Error = new INDIError(INDIErrorCode.UNKNOWN, "Unknown error");

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(endpoint, options);

      const contentType = response.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");

      if (!response.ok) {
        const rawText = await response.text();
        let errorCode: INDIErrorCode;
        let errorMessage: string;

        if (isJson) {
          try {
            const parsed = JSON.parse(rawText) as Record<string, unknown>;
            errorCode = mapErrorCodeFromBody(parsed);
            errorMessage =
              typeof parsed.error === "string"
                ? parsed.error
                : typeof parsed.message === "string"
                ? parsed.message
                : rawText;
          } catch {
            errorCode = mapErrorCode(response.status, rawText);
            errorMessage = rawText;
          }
        } else {
          errorCode = mapErrorCode(response.status, rawText);
          errorMessage = `HTTP ${response.status}: ${rawText}`;
        }

        throw new INDIError(errorCode, errorMessage);
      }

      if (isJson) {
        const json = (await response.json()) as Record<string, unknown>;

        // Check application-level failure (success: false)
        if (json.success === false) {
          const errorCode = mapErrorCodeFromBody(json);
          const errorMessage =
            typeof json.error === "string"
              ? json.error
              : typeof json.message === "string"
              ? json.message
              : "Bridge command failed";
          throw new INDIError(errorCode, errorMessage);
        }

        return json as T;
      }

      // Non-JSON success
      const text = await response.text();
      return { success: true, message: text } as unknown as T;
    } catch (err) {
      if (err instanceof INDIError) {
        // INDIErrors are typed failures — re-throw immediately, no retry
        throw err;
      }

      // Network / fetch-level error — retry
      lastError =
        err instanceof Error ? err : new Error(String(err));

      if (attempt < retries) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  // All retries exhausted
  throw new INDIError(
    INDIErrorCode.NOT_CONNECTED,
    `INDI request failed after ${retries} attempts: ${lastError.message}`
  );
}
