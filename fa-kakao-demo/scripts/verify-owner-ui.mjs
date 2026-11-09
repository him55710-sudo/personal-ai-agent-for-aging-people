
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {createDemoServer} from '../server.mjs';
import assert from 'node:assert/strict';
mkdirSync(new URL('../.output/',import.meta.url),{recursive:true});
const app=createDemoServer({}); await new Promise(r=>app.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{}),headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const token='fixture_owner_key_'.repeat(3), calls=[];
let state={me:{name:'엄마',agentName:'치즈',consent:'active',scopes:['phone','message']},messages:[],contacts:[],tasks:[{id:'active',title:'진행 중인 작업',status:'executing',action:{body:'승인한 작업'},approvalHash:'a'.repeat(64)}]};
let slowRelease;
await page.route('**/api/owner/**',async route=>{
 const req=route.request(), path=new URL(req.url()).pathname.replace('/api/owner',''), body=req.postDataJSON();calls.push({path,body});
 assert.equal(req.headers().authorization,'Bearer '+token);
 if(path==='/chat')await new Promise(r=>slowRelease=r);
 const data=path==='/recent'?state:path==='/runtime'?{llm:{model:'fixture only',ready:true,consented:true},phone:{state:'fixture'}}:path==='/phone/quote'?{quoteId:'fixture-quote',durationMinutes:3,estimatedMaxUsd:.15}:path==='/phone/screen'?{dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR4cAAAAASUVORK5CYII=',capturedAt:new Date().toISOString()}:{};
 await route.fulfill({json:data});
});
try{
 await page.goto(`http://127.0.0.1:${app.address().port}`);
 await page.locator('#owner-open').click();await page.locator('#owner-key').fill(token);await page.getByRole('button',{name:'내 공간 연결',exact:true}).click();
 await page.getByText('엄마의 개인 실행 공간',{exact:false}).waitFor();
 await page.locator('#owner-minutes').selectOption('3');await page.getByRole('button',{name:'비용 확인',exact:true}).click();await page.getByRole('button',{name:'이 비용으로 VM 시작',exact:true}).waitFor();
 assert.equal(calls.filter(c=>c.path==='/phone/start').length,0);
 await page.getByRole('button',{name:'이 비용으로 VM 시작',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-owner="start"]'));
 assert.equal(calls.filter(c=>c.path==='/phone/start').length,1);
 await page.getByRole('button',{name:'실제 화면 보기',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#owner-frame')?.src.startsWith('data:'));
 await page.getByRole('button',{name:'상태 새로고침',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#owner-frame')?.src.startsWith('data:'));
 await page.waitForTimeout(300);await page.locator('#owner-draft').fill('무료 fixture 요청');await page.getByRole('button',{name:'치즈에게 부탁',exact:true}).click();await page.waitForTimeout(800);
 await page.getByRole('button',{name:'지금 중단하기',exact:true}).click();await page.waitForTimeout(100);
 assert(calls.some(c=>c.path==='/task/decision'&&c.body.decision==='cancel'));
 await page.getByRole('button',{name:'VM 종료',exact:true}).click();await page.waitForTimeout(100);assert(calls.some(c=>c.path==='/phone/stop'));
 slowRelease();await page.waitForTimeout(200);
 await page.screenshot({path:fileURLToPath(new URL('../.output/owner-fixture-desktop.png',import.meta.url)),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:fileURLToPath(new URL('../.output/owner-fixture-mobile.png',import.meta.url)),fullPage:true});
 assert(await page.evaluate(()=>document.querySelector('#owner-dialog').scrollWidth<=document.querySelector('#owner-dialog').clientWidth+1));
 await page.getByRole('button',{name:'연결 해제',exact:true}).click();assert.equal(await page.locator('#owner-frame').count(),0);
 assert(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes(token));
 assert.deepEqual(errors,[]);console.log('PASS owner UI: same-screen connection, explicit cost/start, screen persistence, cancel/stop during busy request, mobile width, private cleanup. FIXTURE ONLY.');
}finally{await browser.close();app.closeAllConnections();app.close();}
