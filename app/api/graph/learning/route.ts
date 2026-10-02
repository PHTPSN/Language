import { z } from "zod";
import { database } from "@/lib/store";
import { runtimeEnv } from "@/lib/runtime";
import { configured } from "@/lib/provider";
import { hasSameRequestOrigin } from "@/lib/request-origin";
import { graphCatalog, graphIdentity } from "@/lib/graph/server";
import { applyEvidence, weightOf, type Evidence, type NodeLearning } from "@/lib/graph/learning";
import { annotateNode, assessWriting, fingerprint, GraphInputError, GraphProviderError, resolveWordList, writingCandidates } from "@/lib/graph/assessment";
import { duplicateInput, graphAnnotations, graphProfile, graphStates, graphSummary, saveGraphBatch, StaleGraphRevision, type Annotation } from "@/lib/graph/repository";
export const dynamic = "force-dynamic";
const output = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("import"), text: z.string().min(1).max(150000) }),
  z.object({ type: z.literal("writing"), text: z.string().min(1).max(6000) }),
  z.object({ type: z.literal("inspect"), nodeId: z.string().max(300) }),
  z.object({ type: z.literal("annotate"), nodeId: z.string().max(300), text: z.string().min(1).max(2000).optional(), ai: z.boolean() }),
]);
export async function GET(request: Request) {
  const user = graphIdentity(request); if (!user) return output({ error: "Sign in to load your graph evidence." }, 401);
  try {
    const db = await database(), query = new URL(request.url).searchParams;
    const ids = (query.get("ids") || "").split("|").filter(id => id && id.length < 301).slice(0, 400);
    const profile = await graphProfile(db, user), states = await graphStates(db, user, ids);
    return output({ ...profile, states, weights: Object.fromEntries(ids.map(id => [id, weightOf(states[id])])), summary: await graphSummary(db, user), annotations: query.has("node") ? await graphAnnotations(db, user, query.get("node")!.slice(0, 300)) : [], provider: configured(await runtimeEnv()) });
  } catch { return output({ error: "Learning evidence could not be loaded. Check storage and retry." }, 503); }
}
export async function POST(request: Request) {
  const user = graphIdentity(request); if (!user) return output({ error: "Sign in to save your graph evidence." }, 401);
  if (!hasSameRequestOrigin(request)) return output({ error: "Cross-origin request rejected." }, 403);
  try {
    const text = await request.text(); if (text.length > 160000) return output({ error: "Request is too large." }, 413);
    let raw: unknown; try { raw = JSON.parse(text); } catch { return output({ error: "Invalid JSON." }, 400); }
    const parsed = z.object({ revision: z.number().int().nonnegative(), action }).safeParse(raw);
    if (!parsed.success) return output({ error: "Invalid graph action." }, 400);
    const db = await database(), profile = await graphProfile(db, user);
    if (profile.revision !== parsed.data.revision) return output({ error: "Your graph changed in another tab. Reload evidence and retry; your draft is preserved." }, 409);
    const graph = await graphCatalog(), at = new Date().toISOString(), input = parsed.data.action;
    const key = await fingerprint(JSON.stringify(input) + (input.type === "inspect" ? at.slice(0, 10) : ""));
    if (await duplicateInput(db, user, key)) return output({ revision: profile.revision, duplicate: true, message: "Already recorded. Repeated input does not add evidence." });
    let events: Evidence[] = [], states: Record<string, NodeLearning> = {}, annotations: Annotation[] = [];
    let report: Record<string, unknown> = {};
    if (input.type === "import") {
      const resolved = await resolveWordList(graph, input.text);
      states = await graphStates(db, user, [...resolved.matched.keys()]);
      events = [...resolved.matched.keys()].map(nodeId => ({ nodeId, kind: "exposure", at, quality: 1, reason: "A word-list entry was supplied. This is form familiarity, not assessed knowledge of any sense." }));
      report = { supplied: resolved.entries, matched: resolved.matched.size, unmatched: resolved.unmatched, message: "Familiarity updated. Recognition and independent-use weights were not increased." };
    } else if (input.type === "writing") {
      const candidates = await writingCandidates(graph, input.text);
      states = await graphStates(db, user, candidates.flatMap(c => [c.node.id, c.node.lexeme!, c.node.concept!]));
      events = await assessWriting(input.text, candidates, states, await runtimeEnv(), at);
      report = { candidateSenses: candidates.length, assessed: events.length, independent: events.filter(e => e.kind === "independent").length, supported: events.filter(e => e.kind === "assisted").length, message: "AI-reviewed evidence saved for accepted senses only. Missing matches are not failures. The review is provisional, not a verified test result." };
    } else {
      const node = await graph.node(input.nodeId);
      if (!node) return output({ error: "Graph node not found." }, 404);
      const ids = [node.id, ...(node.lexeme ? [node.lexeme] : [])];
      states = await graphStates(db, user, ids);
      if (input.type === "inspect") {
        if (!["sense", "lexeme", "frame", "concept"].includes(node.kind)) return output({ revision: profile.revision, message: "Navigation group selected; no learning evidence inferred." });
        events = ids.map(nodeId => ({ nodeId, kind: "exposure", at, quality: .5, reason: "The node or its explanation was displayed. Production remains unassessed." }));
      } else {
        if (!input.ai && (!input.text?.trim() || /[\u3400-\u9fff]/.test(input.text))) throw new GraphInputError("Write the graph annotation in English.");
        const neighbours = input.ai ? await graph.nodes([...node.children.slice(0, 8), ...node.relations.slice(0, 8).map(r => r.target)]) : [];
        const context = input.ai ? await graphStates(db, user, neighbours.map(n => n.id)) : {};
        const config = await runtimeEnv();
        const note = input.ai ? await annotateNode(node, neighbours, { ...context, ...states }, config) : input.text!.trim();
        annotations = [{ id: crypto.randomUUID(), nodeId: node.id, text: note, source: input.ai ? "ai" : "learner", at, ...(input.ai ? { model: config.AI_MODEL } : {}) }];
        events = ids.map(nodeId => ({ nodeId, kind: "exposure", at, quality: .5, reason: "An annotation was added. A note is not proof of mastery." }));
        report = { annotations, message: "Annotation saved. No recognition or production credit was awarded." };
      }
    }
    const updated: Record<string, NodeLearning> = {};
    for (const event of events) updated[event.nodeId] = applyEvidence(updated[event.nodeId] || states[event.nodeId], event);
    const pos: Record<string, string> = { n: "noun", v: "verb", a: "adj", s: "adj", r: "adv" };
    for (const state of Object.values(updated)) {
      // List imports are deliberately form-level; they cannot populate every possible sense.
      if (state.nodeId.startsWith("lex:")) state.scopes = ["english", "lexicon"];
      else {
        const node = await graph.node(state.nodeId);
        state.scopes = node?.kind === "sense" ? ["english", "lexicon", `pos:${pos[node.pos || ""]}`, `domain:${node.domain}`, node.concept!, node.lexeme!] : node?.kind === "frame" ? ["english", "patterns"] : ["english", "lexicon"];
      }
      state.cached = weightOf(state, at);
    }
    const revision = await saveGraphBatch(db, user, profile.revision, key, updated, events, annotations, at);
    return output({ revision, report, events, weights: Object.fromEntries(Object.entries(updated).map(([id, state]) => [id, weightOf(state, at)])) });
  } catch (error) {
    if (error instanceof StaleGraphRevision) return output({ error: error.message }, 409);
    if (error instanceof GraphInputError) return output({ error: error.message }, 400);
    if (error instanceof GraphProviderError) return output({ error: error.message }, 502);
    console.error("graph_action_failed", error instanceof Error ? error.name : "unknown");
    return output({ error: "The graph action could not be saved. Your draft is preserved; check storage and retry." }, 503);
  }
}
