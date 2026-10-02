/** Shared by the offline importer, browser-safe graph code, and the server. */
export function normalizeForm(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/_/g, " ").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
}
export function shardKey(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0 & 255).toString(16).padStart(2, "0");
}
export function nodeShard(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0 & 4095).toString(16).padStart(3, "0");
}
export function formShard(value: string) { return shardKey(normalizeForm(value).slice(0, 2)); }
