import { formShard, normalizeForm, nodeShard } from "./keys.ts";
import type { GraphNode, GraphView, GraphManifest, JsonLoader } from "./types.ts";

/** The same query layer works against local files or hosted static assets. */
export class EnglishGraph {
  private cache = new Map<string, Promise<unknown>>();
  private readonly load: JsonLoader;
  constructor(load: JsonLoader) { this.load = load; }
  private read<T>(name: string): Promise<T> {
    if (!this.cache.has(name)) {
      if (this.cache.size >= 48) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(name, this.load<T>(`graph-data/oewn-2025/${name}.json`).catch(error => { this.cache.delete(name); throw error; }));
    }
    return this.cache.get(name) as Promise<T>;
  }
  manifest() { return this.read<GraphManifest>("manifest"); }
  async node(id: string): Promise<GraphNode | null> {
    if (!id || id.length > 300) return null;
    const shard = await this.read<Record<string, GraphNode>>(`node-${nodeShard(id)}`);
    return Object.hasOwn(shard, id) ? shard[id] : null;
  }
  async nodes(ids: string[]) {
    const unique = [...new Set(ids)], result: GraphNode[] = [];
    for (let i = 0; i < unique.length; i += 12) result.push(...(await Promise.all(unique.slice(i, i + 12).map(id => this.node(id)))).filter((n): n is GraphNode => n !== null));
    return result;
  }
  async lookupIds(form: string) {
    const key = normalizeForm(form);
    const shard = await this.read<Record<string, string[]>>(`forms-${formShard(key)}`);
    return Object.hasOwn(shard, key) ? shard[key] : [];
  }
  async lookup(form: string) {
    return this.nodes(await this.lookupIds(form));
  }
  async search(query: string, limit = 30) {
    const key = normalizeForm(query);
    if (key.length < 2) return this.lookup(key);
    const shard = await this.read<Record<string, string[]>>(`forms-${formShard(key)}`);
    const forms = Object.keys(shard).filter(f => f.startsWith(key)).sort((a, b) => a === key ? -1 : b === key ? 1 : a < b ? -1 : 1).slice(0, limit);
    return this.nodes(forms.flatMap(f => shard[f]));
  }
  async view(root: string, depth = 2, budget = 120, offset = 0): Promise<GraphView> {
    const first = await this.node(root);
    if (!first) throw new Error("Graph node not found.");
    const nodes = new Map([[first.id, first]]);
    const edges: GraphView["edges"] = [];
    let frontier = [first];
    let truncated = false, firstTaken = 0;
    // Divide each visible level's budget fairly, so one large branch cannot hide its siblings.
    for (let level = 0; level < depth && frontier.length && nodes.size < budget; level++) {
      const next: GraphNode[] = [];
      const allowance = Math.max(1, Math.floor((budget - nodes.size) / frontier.length));
      for (const parent of frontier) {
        const start = level === 0 ? offset : 0;
        const ids = parent.children.slice(start, start + Math.min(allowance, budget - nodes.size));
        if (level === 0) firstTaken = ids.length;
        if (start + ids.length < parent.children.length) truncated = true;
        for (const child of await this.nodes(ids)) {
          if (!nodes.has(child.id)) { nodes.set(child.id, child); next.push(child); }
          edges.push({ source: parent.id, target: child.id, type: "contains" });
        }
      }
      frontier = next;
    }
    // At leaf/sense level expose semantic neighbours without flooding the screen.
    if (first.kind === "sense" || first.kind === "concept" || first.kind === "lexeme") {
      const relations = [...(first.parent ? [{ target: first.parent, type: "belongs_to" }] : []), ...first.relations];
      for (const relation of relations.slice(0, Math.max(0, budget - nodes.size))) {
        const target = await this.node(relation.target);
        if (!target) continue;
        nodes.set(target.id, target);
        edges.push({ source: first.id, target: target.id, type: relation.type });
      }
      if (relations.length > Math.max(0, budget - first.children.length - 1)) truncated = true;
    }
    const nextOffset = firstTaken && offset + firstTaken < first.children.length ? offset + firstTaken : null;
    return { root, nodes: [...nodes.values()], edges, totalChildren: first.children.length, offset, nextOffset, truncated };
  }
}
