import { EnglishGraph } from "./catalog";
import { runtimeEnv } from "../runtime";

export async function graphCatalog() {
  const env = await runtimeEnv();
  return new EnglishGraph(async <T>(path: string) => {
    if (env.ASSETS) {
      const response = await env.ASSETS.fetch(new Request(`https://graph-assets.local/${path}`));
      if (!response.ok) throw new Error("English graph assets are unavailable.");
      return await response.json() as T;
    }
    if (typeof process !== "undefined" && process.release?.name === "node") {
      const { readFile } = await import("node:fs/promises");
      return JSON.parse(await readFile(`${process.cwd()}/public/${path}`, "utf8")) as T;
    }
    throw new Error("English graph assets are unavailable.");
  });
}
export function graphIdentity(request: Request) {
  const user = request.headers.get("oai-authenticated-user-id");
  if (user) return `user:${user}`;
  return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname) ? "local-demo" : null;
}
