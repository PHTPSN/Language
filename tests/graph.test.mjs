import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { EnglishGraph } from "../lib/graph/catalog.ts";
import { applyEvidence, weightOf, synonymProbe } from "../lib/graph/learning.ts";
import { resolveWordList, parseWordList, writingCandidates, validatedWritingEvidence, assessWriting, annotateNode, fingerprint } from "../lib/graph/assessment.ts";
import { graphProfile, graphStates, graphOverlay, graphAnnotations, duplicateInput, saveGraphBatch, StaleGraphRevision } from "../lib/graph/repository.ts";

const graph = new EnglishGraph(async path => JSON.parse(await readFile(join("public", path), "utf8")));
const now = "2026-10-02T08:00:00.000Z";
const evidence = (kind, overrides = {}) => ({ nodeId: "sense:appreciate%2:37:00::", kind, at: now, quality: .9, reason: "Controlled test fixture", context: "work", ...overrides });
function adapter(sql) {
  const runs = new WeakMap();
  return {
    prepare(query) {
      let args = [];
      const run = () => ({ meta: { changes: Number(sql.prepare(query).run(...args).changes) } });
      const statement = { bind(...values) { args = values; return this; }, async run() { return run(); }, async first() { return sql.prepare(query).get(...args) || null; }, async all() { return { results: sql.prepare(query).all(...args) }; } };
      runs.set(statement, run); return statement;
    },
    async batch(statements) { sql.exec("BEGIN IMMEDIATE"); try { const result = statements.map(s => runs.get(s)()); sql.exec("COMMIT"); return result; } catch (error) { sql.exec("ROLLBACK"); throw error; } },
  };
}
function migrate(sql) { for (const file of readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort()) sql.exec(readFileSync(join("drizzle", file), "utf8")); }

test("the shipped corpus is the complete pinned core, with individual lexical senses", async () => {
  const manifest = await graph.manifest();
  assert.equal(manifest.counts.lexicalEntries, 135969);
  assert.equal(manifest.counts.concepts, 107519);
  assert.equal(manifest.counts.senses, 185129);
  assert.equal(manifest.counts.nodes, 420050);
  assert.equal(manifest.counts.frames, 39);
  const bank = (await graph.lookup("bank"))[0];
  const senses = await graph.nodes(bank.children);
  assert.ok(senses.some(n => /financial|deposits/.test(n.definition)));
  assert.ok(senses.some(n => /body of water/.test(n.definition)));
  assert.ok((await graph.lookup("take into account")).length > 0);
  // A documented corpus gap must stay visible; never fabricate an imported sense.
  const gap = await resolveWordList(graph, "look forward to");
  assert.deepEqual(gap.unmatched, ["look forward to"]);
  assert.notEqual(senses[0].id, senses[1].id);
});
test("navigation respects density limits, pagination, and searchable long-tail entries", async () => {
  for (const root of ["english", "domain:noun.animal", "lex:bank", "sense:appreciate%2:37:00::"]) {
    const view = await graph.view(root, 4, 45);
    assert.ok(view.nodes.length <= 45, root);
    const ids = new Set(view.nodes.map(n => n.id));
    assert.ok(view.edges.every(e => ids.has(e.source) && ids.has(e.target)));
  }
  const first = await graph.view("domain:noun.animal", 1, 20);
  assert.ok(first.nextOffset > 0);
  const second = await graph.view("domain:noun.animal", 1, 20, first.nextOffset);
  const previous = new Set(first.nodes.slice(1).map(n => n.id));
  assert.ok(second.nodes.slice(1).every(n => !previous.has(n.id)));
  assert.ok((await graph.search("photosynth")).length > 0);
  assert.equal(await graph.node("__proto__"), null);
  assert.deepEqual(await graph.lookup("zzzznonexistenttestform"), []);
});
test("exposure and immediate copying never generate mastery evidence", () => {
  let state;
  for (let i = 0; i < 40; i++) state = applyEvidence(state, evidence(i % 2 ? "assisted" : "exposure"));
  const weight = weightOf(state);
  assert.equal(state.exposures, 1);
  assert.equal(weight.recognition, null); assert.equal(weight.production, null); assert.equal(weight.confidence, 0);
  assert.ok(weight.familiarity > 0 && weight.familiarity < .1);
  assert.equal(weightOf().production, null);
});
test("continuous independent-use evidence, failures, and context diversity behave monotonically", () => {
  const first = applyEvidence(undefined, evidence("independent"));
  const repeated = applyEvidence(first, evidence("independent"));
  const diverse = applyEvidence(first, evidence("retrieval", { at: "2026-10-05T08:00:00.000Z", context: "travel" }));
  assert.ok(weightOf(diverse).production > weightOf(repeated).production);
  assert.ok(weightOf(repeated).production > weightOf(first).production);
  assert.ok(weightOf(applyEvidence(first, evidence("failure"))).production < weightOf(first).production);
  const recognized = weightOf(applyEvidence(undefined, evidence("recognition")));
  assert.ok(recognized.recognition > 0); assert.equal(recognized.production, null);
});
test("2,000-entry import resolves against the real corpus without generating sense mastery", async () => {
  const forms = [];
  for (const file of readdirSync("public/graph-data/oewn-2025").filter(f => f.startsWith("forms-"))) {
    forms.push(...Object.keys(JSON.parse(readFileSync(join("public/graph-data/oewn-2025", file), "utf8"))));
    if (forms.length >= 2000) break;
  }
  const report = await resolveWordList(graph, forms.slice(0, 2000).join("\n"));
  assert.equal(report.entries, 2000); assert.equal(report.unmatched.length, 0); assert.ok(report.matched.size > 1500);
  for (const id of report.matched.keys()) { assert.ok(id.startsWith("lex:")); assert.equal(weightOf(applyEvidence(undefined, evidence("exposure", { nodeId: id }))).production, null); }
  assert.deepEqual(parseWordList("Appreciate, appreciate\nreschedule"), ["appreciate", "reschedule"]);
  assert.throws(() => parseWordList(Array.from({ length: 2001 }, (_, i) => "word" + i).join("\n")), /2,000/);
});
test("AI output must cite supplied senses and exact text; hints and copied examples are downgraded", async () => {
  const text = "I appreciate your help with the project today.";
  const candidates = await writingCandidates(graph, text);
  const candidate = candidates.find(c => c.node.id === "sense:appreciate%2:37:00::");
  assert.ok(candidate);
  const judgment = { senseId: candidate.node.id, quote: "appreciate your help", correct: true, confidence: .95, reason: "Expresses gratitude in context." };
  const evaluate = (j, states = {}) => validatedWritingEvidence(text, candidates, { judgments: j }, states, now, "test");
  assert.equal(evaluate([judgment])[0].kind, "independent");
  assert.equal(evaluate([{ ...judgment, senseId: "invented" }]).length, 0);
  assert.equal(evaluate([{ ...judgment, quote: "not in the text" }]).length, 0);
  assert.equal(evaluate([{ ...judgment, correct: false }]).length, 0);
  assert.equal(evaluate([{ ...judgment, confidence: .5 }]).length, 0);
  assert.equal(evaluate([judgment, judgment]).length, 1);
  const support = applyEvidence(undefined, evidence("exposure", { nodeId: candidate.node.lexeme }));
  assert.equal(evaluate([judgment], { [candidate.node.lexeme]: support })[0].kind, "assisted");
  const sourceCandidate = { ...candidate, node: { ...candidate.node, examples: [text] } };
  assert.equal(validatedWritingEvidence(text, [sourceCandidate], { judgments: [judgment] }, {}, now, "test")[0].kind, "assisted");
  await assert.rejects(() => writingCandidates(graph, "apple, river, notebook, banana, computer, reschedule, appreciate"), /connected sentences/);
});
test("AI uses configured DeepSeek, preserves missing evidence, and sanitizes provider failures", async () => {
  const text = "I appreciate your help with the project today.", candidates = await writingCandidates(graph, text);
  const config = { AI_BASE_URL: "https://api.deepseek.com", AI_MODEL: "deepseek-v4-flash", AI_API_KEY: "not-a-real-key" };
  let request;
  const empty = await assessWriting(text, candidates, {}, config, now, async (url, init) => { request = { url, body: JSON.parse(init.body) }; return Response.json({ choices: [{ message: { content: '{"judgments":[]}' } }] }); });
  assert.deepEqual(empty, []); assert.equal(request.url, "https://api.deepseek.com/chat/completions");
  assert.equal(request.body.thinking.type, "disabled");
  await assert.rejects(() => assessWriting(text, candidates, {}, config, now, async () => new Response("SECRET", { status: 401 })), error => /HTTP 401/.test(error.message) && !error.message.includes("SECRET"));
  await assert.rejects(() => annotateNode(candidates[0].node, [], {}, config, async () => Response.json({ choices: [{ message: { content: '{"note":"这不是一个英文标注，也不应该保存。"}' } }] })), /English-only/);
});
test("persistent graph batches are atomic, deduplicated, isolated, and survive reopening", async () => {
  const dir = mkdtempSync(join(tmpdir(), "english-graph-test-")), path = join(dir, "graph.sqlite");
  let sql = new DatabaseSync(path);
  try {
    migrate(sql); let db = adapter(sql);
    assert.equal((await graphProfile(db, "alice")).revision, 0);
    const event = evidence("independent"), state = applyEvidence(undefined, event);
    state.scopes = ["english", "lex:appreciate"]; state.cached = weightOf(state);
    const digest = await fingerprint("sample");
    const note = { id: "note-1", nodeId: state.nodeId, text: "Practice a different context.", source: "learner", at: now };
    assert.equal(await saveGraphBatch(db, "alice", 0, digest, { [state.nodeId]: state }, [event], [note], now), 1);
    assert.equal(await duplicateInput(db, "alice", digest), true);
    assert.equal(await duplicateInput(db, "bob", digest), false);
    await assert.rejects(() => saveGraphBatch(db, "alice", 0, "other", { [state.nodeId]: applyEvidence(state, evidence("failure")) }, [], [], now), StaleGraphRevision);
    assert.deepEqual((await graphStates(db, "alice", [state.nodeId]))[state.nodeId], state);
    assert.equal((await graphProfile(db, "alice")).revision, 1);
    assert.deepEqual(await graphStates(db, "bob", [state.nodeId]), {});
    const overlay = await graphOverlay(db, "alice", ["english", "lex:appreciate", "lex:thank"]);
    assert.equal(overlay.english.assessed, 1); assert.equal(overlay.english.production, weightOf(state).production); assert.equal(overlay["lex:thank"], undefined);
    assert.ok(sql.prepare("EXPLAIN QUERY PLAN SELECT state FROM graph_node_states WHERE user_id = ? AND node_id = ?").all("alice", state.nodeId).some(row => row.detail.includes("INDEX")));
    sql.close(); sql = new DatabaseSync(path); db = adapter(sql);
    assert.equal((await graphProfile(db, "alice")).revision, 1);
    assert.equal((await graphAnnotations(db, "alice", state.nodeId))[0].text, note.text);
    assert.deepEqual((await graphStates(db, "alice", [state.nodeId]))[state.nodeId], state);
    const bulk = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => { const id = "lex:test-" + i; return [id, applyEvidence(undefined, evidence("exposure", { nodeId: id }))]; }));
    assert.equal(await saveGraphBatch(db, "alice", 1, "bulk", bulk, [], [], now), 2);
    assert.equal(Object.keys(await graphStates(db, "alice", Object.keys(bulk))).length, 2000);
  } finally { sql.close(); rmSync(dir, { recursive: true, force: true }); }
});
test("synonym underuse only suggests probes with comparable opportunities, never score penalties", () => {
  assert.equal(synonymProbe(0, 10, .5, true).suggest, false);
  assert.equal(synonymProbe(0, 100, .5, false).suggest, false);
  assert.equal(synonymProbe(0, 100, .2, true).suggest, true);
  assert.equal(synonymProbe(20, 100, .2, true).suggest, false);
});
