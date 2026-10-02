import type { Database } from "../repository.ts";
import { WEIGHT_MODEL, type Evidence, type NodeLearning, type Weight } from "./learning.ts";
export type OverlayWeight = Weight & { aggregate?: boolean; tracked?: number; assessed?: number };
export type Annotation = { id: string; nodeId: string; text: string; source: "learner" | "ai"; at: string; model?: string };
export class StaleGraphRevision extends Error {}
export async function graphProfile(db: Database, userId: string) {
  await db.prepare("INSERT OR IGNORE INTO graph_profiles (id, revision) VALUES (?, 0)").bind(userId).run();
  return (await db.prepare("SELECT revision FROM graph_profiles WHERE id = ?").bind(userId).first<{ revision: number }>())!;
}
export async function graphStates(db: Database, userId: string, ids: string[]) {
  const states: Record<string, NodeLearning> = {};
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 70) {
    const part = unique.slice(i, i + 70);
    const rows = await db.prepare(`SELECT node_id, state FROM graph_node_states WHERE user_id = ? AND node_id IN (${part.map(() => "?").join(",")})`).bind(userId, ...part).all<{ node_id: string; state: string }>();
    for (const row of rows.results) states[row.node_id] = JSON.parse(row.state);
  }
  return states;
}
export async function graphSummary(db: Database, userId: string) {
  return await db.prepare("SELECT count(*) AS tracked, sum(CASE WHEN json_extract(state, '$.productionSuccess') + json_extract(state, '$.productionFailure') > 0 THEN 1 ELSE 0 END) AS assessed FROM graph_node_states WHERE user_id = ?").bind(userId).first<{ tracked: number; assessed: number | null }>();
}
export async function graphOverlay(db: Database, userId: string, ids: string[]) {
  const result: Record<string, OverlayWeight> = {};
  for (let i = 0; i < ids.length; i += 70) {
    const part = ids.slice(i, i + 70); if (!part.length) continue;
    const rows = await db.prepare(`SELECT scope.value AS node_id, count(*) AS tracked,
      count(json_extract(state, '$.cached.production')) AS assessed,
      avg(json_extract(state, '$.cached.familiarity')) AS familiarity,
      avg(json_extract(state, '$.cached.recognition')) AS recognition,
      avg(json_extract(state, '$.cached.production')) AS production,
      avg(json_extract(state, '$.cached.confidence')) AS confidence,
      sum(json_extract(state, '$.evidenceCount')) AS evidence_count
      FROM graph_node_states, json_each(graph_node_states.state, '$.scopes') AS scope
      WHERE user_id = ? AND scope.value IN (${part.map(() => "?").join(",")}) GROUP BY scope.value`).bind(userId, ...part).all<{ node_id: string; tracked: number; assessed: number; familiarity: number; recognition: number | null; production: number | null; confidence: number; evidence_count: number }>();
    for (const row of rows.results) result[row.node_id] = { familiarity: row.familiarity, recognition: row.recognition, production: row.production, confidence: row.confidence, evidenceCount: row.evidence_count, model: WEIGHT_MODEL, aggregate: true, tracked: row.tracked, assessed: row.assessed };
  }
  return result;
}
export async function graphAnnotations(db: Database, userId: string, nodeId: string) {
  const rows = await db.prepare("SELECT payload FROM graph_annotations WHERE user_id = ? AND node_id = ? ORDER BY created_at DESC LIMIT 20").bind(userId, nodeId).all<{ payload: string }>();
  return rows.results.map(row => JSON.parse(row.payload) as Annotation);
}
export async function duplicateInput(db: Database, userId: string, fingerprint: string) {
  return Boolean(await db.prepare("SELECT id FROM graph_batches WHERE user_id = ? AND fingerprint = ? LIMIT 1").bind(userId, fingerprint).first());
}
export async function saveGraphBatch(db: Database, userId: string, revision: number, fingerprint: string, states: Record<string, NodeLearning>, evidence: Evidence[], annotations: Annotation[], at: string) {
  const id = crypto.randomUUID();
  const stateGroups = [], values = Object.values(states);
  for (let i = 0; i < values.length; i += 80) stateGroups.push(db.prepare("INSERT INTO graph_node_states (user_id, node_id, state) SELECT ?, json_extract(value, '$.nodeId'), value FROM json_each(?) WHERE true ON CONFLICT(user_id, node_id) DO UPDATE SET state = excluded.state").bind(userId, JSON.stringify(values.slice(i, i + 80))));
  // Unique (user_id, base_revision) makes stale writes fail inside the atomic batch,
  // even when a different request wins after the route's initial revision check.
  const statements = [
    db.prepare("INSERT INTO graph_batches (id, user_id, base_revision, fingerprint, evidence, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, userId, revision, fingerprint, JSON.stringify(evidence), at),
    db.prepare("UPDATE graph_profiles SET revision = revision + 1 WHERE id = ? AND revision = ?").bind(userId, revision),
    ...stateGroups,
    ...annotations.map(note => db.prepare("INSERT INTO graph_annotations (id, user_id, node_id, payload, created_at) VALUES (?, ?, ?, ?, ?)").bind(note.id, userId, note.nodeId, JSON.stringify(note), at)),
  ];
  try { await db.batch(statements); }
  catch (error) {
    if (/UNIQUE constraint failed.*graph_batches/i.test(String(error))) throw new StaleGraphRevision("Your graph changed in another tab. Reload and retry.");
    throw error;
  }
  return revision + 1;
}
