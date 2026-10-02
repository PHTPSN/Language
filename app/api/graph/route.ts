import { graphCatalog, graphIdentity } from "@/lib/graph/server";
import { database } from "@/lib/store";
import { graphOverlay, graphProfile, graphStates, graphSummary } from "@/lib/graph/repository";
import { weightOf } from "@/lib/graph/learning";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const output = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  const user = graphIdentity(request);
  if (!user) return output({ error: "Sign in to explore your English graph." }, 401);
  const query = new URL(request.url).searchParams;
  const graph = await graphCatalog();
  const integer = (name: string, fallback: number, min: number, max: number) => {
    const value = Number(query.get(name) ?? fallback);
    return Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
  };
  try {
    if (query.has("q")) return output({ results: await graph.search((query.get("q") || "").slice(0, 120)) });
    const id = query.get("root") || "english";
    if (!await graph.node(id)) return output({ error: "Graph node not found." }, 404);
    const view = await graph.view(id, integer("depth", 2, 1, 5), integer("budget", 100, 20, 350), integer("offset", 0, 0, 200000));
    let learning: Record<string, unknown>;
    try {
      const db = await database(), ids = view.nodes.map(n => n.id), profile = await graphProfile(db, user);
      const states = await graphStates(db, user, ids), weights = await graphOverlay(db, user, ids);
      for (const [nodeId, state] of Object.entries(states)) {
        const direct = weightOf(state), aggregate = weights[nodeId];
        weights[nodeId] = nodeId.startsWith("lex:") && aggregate ? { ...aggregate, familiarity: Math.max(direct.familiarity, aggregate.familiarity), evidenceCount: direct.evidenceCount + aggregate.evidenceCount } : direct;
      }
      learning = { ...profile, weights, summary: await graphSummary(db, user) };
    } catch { learning = { weights: {}, error: "Learning storage is unavailable. The graph is read-only until its schema migration is applied." }; }
    const visible = new Set(view.nodes.map(node => node.id));
    view.nodes = view.nodes.map(node => ({ ...node, childCount: node.children.length, children: node.children.filter(id => visible.has(id)), relations: node.relations.filter(r => visible.has(r.target)) }));
    return output({ manifest: await graph.manifest(), view, learning });
  } catch {
    return output({ error: "The English graph is unavailable. Import the pinned corpus and retry." }, 503);
  }
}
