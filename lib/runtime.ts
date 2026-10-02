import type { ProviderConfig } from "./provider";
import type { Database } from "./repository";

type RuntimeEnv = ProviderConfig & { DB?: Database; ASSETS?: { fetch(request: Request): Promise<Response> } };

/**
 * Cloudflare exposes bindings through a virtual module. Next's local Node
 * server does not, so resolve it lazily and fall back to process.env there.
 */
export async function runtimeEnv(): Promise<RuntimeEnv> {
  try {
    const workerRuntime = await import("cloudflare:workers");
    return workerRuntime.env as unknown as RuntimeEnv;
  } catch {
    return {
      AI_BASE_URL: process.env.AI_BASE_URL,
      AI_API_KEY: process.env.AI_API_KEY,
      AI_MODEL: process.env.AI_MODEL,
    };
  }
}

export function isNodeRuntime() {
  return typeof process !== "undefined" && process.release?.name === "node";
}
