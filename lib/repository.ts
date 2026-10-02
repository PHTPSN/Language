import { createLearner } from "./engine.ts";
import type { Learner } from "./types.ts";
export type Statement = { bind(...args:(string|number)[]):Statement; run():Promise<{meta:{changes?:number}}> ; first<T>():Promise<T|null>; all<T>():Promise<{results:T[]}> };
export type Database = { prepare(query:string):Statement; batch(statements:Statement[]):Promise<unknown> };
export async function readProfile(db:Database,id:string) {
  const initial=createLearner();
  await db.prepare("INSERT OR IGNORE INTO learners (id, revision, state, updated_at) VALUES (?, 0, ?, ?)").bind(id,JSON.stringify(initial),initial.updatedAt).run();
  const row=await db.prepare("SELECT revision, state FROM learners WHERE id = ?").bind(id).first<{revision:number;state:string}>();
  if(!row) throw new Error("Learner could not be loaded.");
  const state=JSON.parse(row.state) as Learner;
  if(state.version!==1) throw new Error("This learner needs a data migration.");
  return {revision:row.revision,state};
}
export async function writeProfile(db:Database,id:string,revision:number,state:Learner) {
  const result=await db.prepare("UPDATE learners SET revision = revision + 1, state = ?, updated_at = ? WHERE id = ? AND revision = ?").bind(JSON.stringify(state),state.updatedAt,id,revision).run();
  return result.meta.changes===1;
}
