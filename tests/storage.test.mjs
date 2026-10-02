import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {readProfile,writeProfile} from "../lib/repository.ts";
import {applyAction} from "../lib/engine.ts";
const adapter=(sql)=>({prepare(query){let args=[];return {bind(...values){args=values;return this;},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};},async first(){return sql.prepare(query).get(...args)||null;}};}});
test("real SQLite survives close/reopen and isolates profiles; stale writes cannot overwrite evidence",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"language-lab-test-")),path=join(dir,"test.sqlite");
  let sql;
  try {
    sql=new DatabaseSync(path);sql.exec("CREATE TABLE learners(id TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL,updated_at TEXT NOT NULL)");
    let db=adapter(sql),a=await readProfile(db,"alice");
    let state=applyAction(a.state,{type:"diagnostic",recognition:"change-time",production:"I wanted to 表达感谢, but I didn't know how."});
    assert.equal(await writeProfile(db,"alice",0,state),true);
    assert.equal(await writeProfile(db,"alice",0,a.state),false);
    assert.equal((await readProfile(db,"bob")).state.onboarded,false);
    sql.close();sql=new DatabaseSync(path);db=adapter(sql);
    a=await readProfile(db,"alice");
    assert.equal(a.revision,1);assert.deepEqual(a.state,state);
    state=applyAction(a.state,{type:"message",text:"I wanted to express my gratitude for your help."});
    assert.equal(await writeProfile(db,"alice",1,state),true);
    sql.close();sql=new DatabaseSync(path);
    assert.equal((await readProfile(adapter(sql),"alice")).state.items["express-gratitude.v.01"].stage,"assisted_production");
  } finally {sql?.close();rmSync(dir,{recursive:true,force:true});}
});
