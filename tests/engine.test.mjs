import test from "node:test";
import assert from "node:assert/strict";
import {createLearner,applyAction,derive,sampleLearner} from "../lib/engine.ts";
import {PRIMARY,ITEMS,BASE_WORDS} from "../lib/catalog.ts";
import {validateLexical,originalReading,matches} from "../lib/lexical.ts";
import {completionEndpoint,generateDraft} from "../lib/provider.ts";
const now="2026-09-14T08:00:00.000Z";
function fresh(){return applyAction(createLearner(now),{type:"diagnostic",recognition:"change-time",production:""},now);}
function msg(s,text){return applyAction(s,{type:"message",text},new Date(Date.parse(now)+(s.turn+1)*60000).toISOString());}
function supported(){
  let s=msg(fresh(),"I wanted to 表达感谢, but I didn't know how.");
  s=msg(s,"I wanted to express my gratitude for your help.");
  return s;
}
function delayed(s=supported()) {
  for(const text of ["I will finish my work first.","I would go to the park with my friend.","I will take the bus home today."]) s=msg(s,text);
  return s;
}
test("eleven-step acceptance: gap, teaching, immediate assistance, delay, new context, independent use, serialization",()=>{
  let s=supported();
  assert.equal(s.items[PRIMARY].stage,"assisted_production");
  assert.equal(s.items[PRIMARY].evidence.filter(e=>e.kind==="spontaneous").length,0);
  assert.ok(s.items[PRIMARY].evidence.some(e=>e.kind==="help_requested"));
  s=delayed(s);assert.equal(s.scene.mode,"retrieval");assert.notEqual(s.scene.domain,"work");
  assert.doesNotMatch(s.scene.prompt,/express|gratitude/i);
  s=msg(s,"I would like to express my gratitude for finding my book.");
  assert.equal(s.items[PRIMARY].stage,"spontaneous_production");
  assert.equal(s.items[PRIMARY].evidence.at(-1).kind,"spontaneous");
  assert.equal(s.items[PRIMARY].evidence.at(-1).assisted,false);
  const restored=JSON.parse(JSON.stringify(s));
  assert.deepEqual(restored.items,s.items);
  assert.equal(applyAction(restored,{type:"session"},s.updatedAt).items[PRIMARY].stage,"spontaneous_production");
  assert.equal(s.scene.targetId,"reschedule.v.01");
});
test("a hint in the recall context prevents independent credit",()=>{
  let s=delayed();s=applyAction(s,{type:"hint"},s.updatedAt);
  s=msg(s,"I want to express my gratitude for the book you found.");
  assert.equal(s.items[PRIMARY].stage,"assisted_production");
});
test("opening the model counts as support, including after a new session",()=>{
  let s=delayed();s=applyAction(s,{type:"inspect",itemIds:[PRIMARY]},s.updatedAt);
  s=applyAction(s,{type:"session"},s.updatedAt);
  s=msg(s,"I want to express my gratitude for finding the book.");
  assert.equal(s.items[PRIMARY].stage,"assisted_production");
  assert.ok(s.items[PRIMARY].evidence.some(e=>e.source==="model-inspection"));
});
test("exact supplied sentence remains assisted even after a delay",()=>{
  const s=msg(delayed(),"I wanted to express my gratitude for your help.");
  assert.equal(s.items[PRIMARY].evidence.at(-1).kind,"assisted");
});
test("three intervening replies are required and short or duplicate replies cannot advance",()=>{
  let s=supported();
  assert.throws(()=>msg(s,"ok"),/four/);
  s=msg(s,"I will work on the project.");
  assert.throws(()=>msg(s,"I will work on the project."),/different response/);
  assert.equal(s.scene.mode,"bridge");
  s=msg(s,"I will go to the park.");
  assert.equal(s.scene.mode,"bridge");
  s=msg(s,"I will take the train home.");
  assert.equal(s.scene.mode,"retrieval");
});
test("recognition is not production; failed checks do not award recognition",()=>{
  assert.equal(fresh().items["reschedule.v.01"].stage,"understood");
  const s=applyAction(createLearner(now),{type:"diagnostic",recognition:"cancel",production:""},now);
  assert.equal(s.items["reschedule.v.01"].stage,"encountered");
});
test("alternative valid wording is a missing observation, not mastery",()=>{
  const s=msg(delayed(),"Thank you so much for finding my book.");
  assert.equal(s.items[PRIMARY].stage,"assisted_production");
  assert.equal(s.items[PRIMARY].evidence.at(-1).kind,"failed");
  assert.match(s.items[PRIMARY].evidence.at(-1).reason,/not proof/);
});
test("unexpected Chinese remains uncertain and does not silently invent a translation",()=>{
  const s=msg(fresh(),"I would like to 繁花似锦 today.");
  assert.equal(s.items[PRIMARY].evidenceCount,0);assert.match(s.notice,/Unresolved/);
});
test("bare mention and unrelated context cannot count as independent",()=>{
  let s=msg(delayed(),"express gratitude");
  assert.equal(s.items[PRIMARY].stage,"assisted_production");
  const t=msg(supported(),"I express my gratitude for the nice book.");
  assert.equal(t.items[PRIMARY].stage,"assisted_production");
});
test("stable requires three domains, two sessions, and seven days",()=>{
  const sample=sampleLearner(now).items["figure-out.v.01"];
  assert.equal(sample.stage,"stable");
  const e=sample.evidence;
  assert.notEqual(derive(e.map(x=>({...x,session:"one"})),now).stage,"stable");
  assert.notEqual(derive(e.map(x=>({...x,domain:"work"})),now).stage,"stable");
  assert.notEqual(derive(e.map(x=>({...x,at:now})),now).stage,"stable");
  assert.notEqual(derive(e.slice(0,2),now).stage,"stable");
});
test("recent passive exposure cannot erase old production recency",()=>{
  const sample=sampleLearner(now).items["figure-out.v.01"];
  const later="2027-09-14T08:00:00.000Z";
  const r=derive([...sample.evidence,{...sample.evidence[0],kind:"supplied",at:later}],later);
  assert.equal(r.stage,"spontaneous_production");
  assert.ok(r.confidence<.1);
});
test("every original reading passes actual validation",()=>{
  for(const item of ITEMS.filter(i=>!i.id.startsWith("bank."))){
    const report=validateLexical(originalReading(item.id),BASE_WORDS,[],[item.id]);
    assert.equal(report.passed,true,item.id+": "+report.unexpected.map(t=>t.surface).join(","));
    assert.ok(report.tokens.some(t=>t.kind==="target"));
  }
});
test("controlled input repairs an invalid draft and persists both reports",()=>{
  const draft=originalReading(PRIMARY).replace("Maya","The exceptionally meticulous Maya");
  const s=applyAction(supported(),{type:"reading"},now,draft);
  assert.equal(s.reading.attempts.length,2);
  assert.equal(s.reading.attempts[0].report.passed,false);
  assert.equal(s.reading.attempts[1].report.passed,true);
  assert.ok(s.reading.attempts[0].report.unexpected.some(t=>t.surface==="meticulous"));
  assert.equal(s.reading.source,"original-template");
  assert.equal(s.reading.text,originalReading(PRIMARY));
  assert.ok(s.items[PRIMARY].evidence.some(e=>e.source==="controlled-reading"));
  assert.equal(s.items[PRIMARY].stage,"assisted_production");
});
test("unknown content words cannot pass through capitalization",()=>{
  const r=validateLexical("Maya saw Obfuscation.",["see"],[],[]);
  assert.ok(r.tokens.some(t=>t.surface==="Maya"&&t.kind==="name"));
  assert.ok(r.unexpected.some(t=>t.surface==="Obfuscation"));
});
test("inflections, irregular forms and contractions work",()=>{
  const r=validateLexical("She helped her friends. They went home. I couldn't come.",["help","friend","go","home","come"],[],[]);
  assert.equal(r.passed,true);
});
test("knowing components does not license a multiword expression",()=>{
  const r=validateLexical("We take the cost into account.",["take","cost","account"],[],[]);
  assert.equal(r.passed,false);assert.equal(r.unexpected[0].itemId,"take-into-account.v.01");
});
test("bank senses remain separate and unresolved ambiguity fails closed",()=>{
  assert.equal(validateLexical("I put money in the bank.",["put","money"],["bank.n.finance"],[]).passed,true);
  assert.equal(validateLexical("I sat on the bank of the river.",["sit","river"],["bank.n.finance"],[]).passed,false);
  assert.equal(validateLexical("I saw a bank.",["see"],["bank.n.finance"],[]).passed,false);
  assert.equal(matches("The investment appreciated in value.").length,0);
});
test("reading recognition remains weak and cannot be farmed repeatedly",()=>{
  let s=applyAction(supported(),{type:"reading"},now);
  s=applyAction(s,{type:"comprehension",answer:"correct"},now);
  assert.equal(s.items[PRIMARY].stage,"assisted_production");
  assert.throws(()=>applyAction(s,{type:"comprehension",answer:"correct"},now),/already/);
});
test("optional provider receives vocabulary state and returns only a candidate",async()=>{
  let captured;
  const fake=async(url,init)=>{captured={url,body:JSON.parse(init.body)};return Response.json({choices:[{message:{content:"Maya used an obfuscation."}}]});};
  assert.equal(await generateDraft(fresh(),{}),undefined);
  const draft=await generateDraft(fresh(),{AI_BASE_URL:"https://provider.example/v1",AI_MODEL:"test-model",AI_API_KEY:"test-key"},fake);
  assert.equal(captured.url,"https://provider.example/v1/chat/completions");
  assert.ok(captured.body.messages[1].content.includes("permittedWords"));
  assert.equal(captured.body.thinking,undefined);
  const s=applyAction(fresh(),{type:"reading"},now,draft);
  assert.equal(s.reading.attempts.length,2);assert.equal(s.reading.attempts[1].report.passed,true);
});
test("DeepSeek accepts base or full URLs and uses non-thinking mode for short readings",async()=>{
  for(const url of ["https://api.deepseek.com","https://api.deepseek.com/chat/completions","https://api.deepseek.com/chat/completions/"]) {
    assert.equal(completionEndpoint(url),"https://api.deepseek.com/chat/completions");
  }
  let captured;
  await generateDraft(fresh(),{AI_BASE_URL:"https://api.deepseek.com/chat/completions",AI_MODEL:"deepseek-v4-flash",AI_API_KEY:"test-key"},async(url,init)=>{
    captured={url,body:JSON.parse(init.body)};
    return Response.json({choices:[{message:{content:"Maya expressed gratitude."}}]});
  });
  assert.equal(captured.url,"https://api.deepseek.com/chat/completions");
  assert.equal(captured.body.model,"deepseek-v4-flash");
  assert.deepEqual(captured.body.thinking,{type:"disabled"});
});
test("original readings validate directly without an artificial failure",()=>{
  const s=applyAction(supported(),{type:"reading"},now);
  assert.equal(s.reading.attempts.length,1);
  assert.equal(s.reading.attempts[0].report.passed,true);
  assert.equal(s.reading.source,"original-template");
});
test("a passing model draft remains the delivered passage",()=>{
  const draft="Alex helped me finish the project. I wanted to express my gratitude for his help. I wrote him a short note.";
  const s=applyAction(supported(),{type:"reading"},now,draft);
  assert.equal(s.reading.source,"model-provider");
  assert.equal(s.reading.text,draft);
  assert.equal(s.reading.attempts.length,1);
});
test("provider HTTP failures expose only status, never response bodies",async()=>{
  const config={AI_BASE_URL:"https://api.deepseek.com",AI_MODEL:"deepseek-v4-flash",AI_API_KEY:"private-key"};
  for(const status of [401,429,500]) {
    await assert.rejects(()=>generateDraft(fresh(),config,async()=>new Response("private-key internal response",{status})),error=>{
      assert.match(error.message,new RegExp("HTTP "+status));
      assert.doesNotMatch(error.message,/private-key|internal response/);
      return true;
    });
  }
});
test("provider connection and timeout failures are reported without internal details",async()=>{
  const config={AI_BASE_URL:"https://api.deepseek.com",AI_MODEL:"deepseek-v4-flash",AI_API_KEY:"private-key"};
  await assert.rejects(()=>generateDraft(fresh(),config,async()=>{throw new Error("private-key network detail");}),/^Error: Reading provider could not be reached\./);
  await assert.rejects(()=>generateDraft(fresh(),config,async()=>{throw new DOMException("private-key network detail","TimeoutError");}),/^Error: Reading provider timed out\./);
});
test("invalid or truncated provider responses cannot become a reading",async()=>{
  const config={AI_BASE_URL:"https://api.deepseek.com",AI_MODEL:"deepseek-v4-flash",AI_API_KEY:"private-key"};
  for(const response of [new Response("not JSON"),Response.json({choices:[]}),Response.json({choices:[{message:{content:42}}]}),Response.json({choices:[{message:{content:"Maya expressed gratitude."},finish_reason:"length"}]})]) {
    await assert.rejects(()=>generateDraft(fresh(),config,async()=>response),/invalid passage|incomplete passage/);
  }
});
test("a passage without its selected target is rejected even if every word is known",()=>{
  const r=validateLexical("Maya helped me.",BASE_WORDS,[],[PRIMARY]);
  assert.equal(r.passed,false);assert.deepEqual(r.missingTargets,[PRIMARY]);
});
test("a stated inability is not mistaken for successful independent use",()=>{
  const s=msg(delayed(),"I don't know how to express gratitude for the book.");
  assert.equal(s.items[PRIMARY].stage,"assisted_production");
});
