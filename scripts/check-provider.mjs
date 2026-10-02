import { createLearner, applyAction } from "../lib/engine.ts";
import { configured, generateDraft } from "../lib/provider.ts";

// One explicit live request with synthetic learner state. No real profile is
// read or written, and credentials/remote error bodies are never printed.
const config = {
  AI_BASE_URL: process.env.AI_BASE_URL,
  AI_MODEL: process.env.AI_MODEL,
  AI_API_KEY: process.env.AI_API_KEY,
};

try {
  if (!configured(config)) throw new Error("Configure AI_BASE_URL, AI_MODEL, and AI_API_KEY in .env.local first.");
  const learner = applyAction(createLearner(), {
    type: "diagnostic",
    recognition: "change-time",
    production: "",
  });
  const started = performance.now();
  const draft = await generateDraft(learner, config);
  const result = applyAction(learner, { type: "reading" }, new Date().toISOString(), draft);
  const first = result.reading.attempts[0].report;
  const final = result.reading.attempts.at(-1).report;
  console.log(JSON.stringify({
    providerReached: true,
    endpointHost: new URL(config.AI_BASE_URL).hostname,
    requestedModel: config.AI_MODEL,
    elapsedMs: Math.round(performance.now() - started),
    draftPassed: first.passed,
    unexpectedWords: first.unexpected.map(token => token.surface),
    missingTargets: first.missingTargets,
    finalPassed: final.passed,
    deliveredSource: result.reading.source,
    validationPasses: result.reading.attempts.length,
    profileWritten: false,
  }, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown failure.";
  console.error("Live provider check failed: " + message);
  process.exitCode = 1;
}
