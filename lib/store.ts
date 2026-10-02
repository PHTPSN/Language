import { readProfile, writeProfile } from "./repository";
import type { Learner } from "./types";
import { nodeDatabase } from "./node-store";
import { runtimeEnv } from "./runtime";

export async function database() {
  const env = await runtimeEnv();
  if (env.DB) return env.DB;
  return nodeDatabase();
}
export async function loadLearner(id:string) {
  return readProfile(await database(),id);
}
export async function saveLearner(id:string,revision:number,state:Learner) {
  return writeProfile(await database(),id,revision,state);
}
