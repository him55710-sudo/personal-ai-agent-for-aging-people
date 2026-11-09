// Read-only API setup check. Never enables consent, calls an LLM or starts a VM.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { apiRequest } from '../client/runtime.ts';
const root=resolve(import.meta.dirname,'..'),baseUrl='http://127.0.0.1:4318';
try{
 const owners=(await readFile(resolve(root,'.data/owner-access.txt'),'utf8')).trim().split(/\r?\n/).map(line=>line.split(': '));
 const states=[];
 for(const [actor,token] of owners){
  const auth={baseUrl,token};
  const runtime=await apiRequest(auth,'/runtime'),state=await apiRequest(auth,'/state');
  assert.equal(runtime.mode,'live');assert.equal(runtime.actor,actor);assert.equal(state.me.id,actor);
  assert.equal(runtime.llm.provider,'letsur');assert.equal(runtime.llm.configured,true);assert.equal(runtime.phone.configured,actor==='mom');
  states.push({actor,consent:state.me.consent,model:runtime.llm.model,vmConfigured:runtime.phone.configured,vmState:runtime.phone.state});
 }
 const report={passed:true,checkedAt:new Date().toISOString(),readOnly:true,modelCalls:0,vmStarts:0,apiUrl:baseUrl,states};
 await mkdir(resolve(root,'docs/live'),{recursive:true});
 await writeFile(resolve(root,'docs/live/live-api-setup-report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}catch{console.error('Live API setup verification failed.');process.exitCode=1;}
