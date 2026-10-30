import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

async function main(){
 mkdirSync('.test-data/chat-v2',{recursive:true});
 const bundle=await build({bundle:true,write:false,format:'iife',jsx:'automatic',loader:{'.svg':'dataurl','.png':'dataurl','.task':'dataurl'},plugins:[{name:'devices',setup(build){
  build.onResolve({filter:/\/useEyeTracking$/},()=>({path:'eye',namespace:'fixture'}));
  build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const noop=()=>{}; export function useEyeTracking(){return {state:'idle',error:'',isCalibrated:false,sensitivity:3,cameras:[],monitors:[],selectedCameraId:'',selectedDisplayId:null,overlayActive:false,start:async()=>{},stop:noop,sendStickyToOverlay:noop,setSensitivity:noop,listCameras:noop,switchCamera:noop,listMonitors:noop,openOverlay:noop,closeOverlay:noop};}`}));
  build.onResolve({filter:/\/interviewAudio$/},()=>({path:'audio',namespace:'fixture-audio'}));
  build.onLoad({filter:/.*/,namespace:'fixture-audio'},()=>({contents:'export class InterviewAudio {async start(){} async stop(){} close(){}} export function captureProvider(){return {}}'}));
 }}],stdin:{resolveDir:resolve('.'),loader:'tsx',contents:`
 import {useState} from 'react'; import {createRoot} from 'react-dom/client';
 import {ChatPage} from './src/renderer/src/pages/ChatPage'; import {AppModeProvider} from './src/renderer/src/context/AppModeContext';
 const ok=value=>({ok:true,value});
 window.code='const message = "Hello";\\n\\n/* A multiline\\ncomment */\\nconsole.log(message);';
 const conversation={id:'chat',title:'Review the code',createdAt:1,updatedAt:1,messages:[{id:'q',role:'user',content:'Please explain this code.',createdAt:1},{id:'a',role:'assistant',content:'Here is the implementation.\\n\\n'+String.fromCharCode(96).repeat(3)+'ts\\n'+window.code+'\\n'+String.fromCharCode(96).repeat(3)+'\\n\\nThe original code stays intact when copied.',createdAt:2,status:'complete',latency:{providerTotalMs:1200,requestMessages:2}}]};
 const initial={user:{id:'user',name:'Test',email:'test',managed:true},settings:{displayName:'Test',theme:'dark',onboardingComplete:true,activeConnectionId:'key',connections:[{id:'key',name:'My AI',provider:'gemini',model:'test-model',stream:true,managed:true}]},credentialIds:['key'],conversations:[conversation],contextSession:{id:'session',isEmpty:true,status:'ready',summaryReady:true}};
 let debug={enabled:false,active:[],events:[]};window.copied=[];
 window.openChat=()=>{window.chatEvent({type:'started',conversation});window.chatEvent({type:'finished',conversation});};
 const smart={enabled:false,busy:false,error:'',reason:'',shortcut:'Control+Alt+Shift+Space',shortcutRegistered:true};
 window.novi=new Proxy({
  onChat:fn=>{window.chatEvent=fn;return()=>{};},
  getDebugState:async()=>ok(structuredClone(debug)),setDebugEnabled:async enabled=>{debug={enabled,active:[],events:enabled?[{id:'auto',sequence:1,time:Date.now(),startedAt:Date.now(),lastActivityAt:Date.now(),operation:'smart-placement',stage:'Finding space for Novi',level:'info',details:{model:'test-model'}}]:[]};return ok(structuredClone(debug));},clearDebug:async()=>{debug.events=[];return ok(structuredClone(debug));},
  getStealthState:async()=>ok({transparent:false,clickThrough:false}),getMonitors:async()=>ok([]),getWorkingMonitor:async()=>ok({workingMonitorId:null}),
  listModels:async()=>ok([{id:'test-model',name:'Test model'}]),
  localAISetup:async()=>ok({selectedASR:'auto',models:[]}),getSmartPlacement:async()=>ok(smart),
  copyText:async text=>{window.copied.push(text);return ok(undefined);},
  setTrayHeight:async height=>{(window.trayHeights??=[]).push(height);return ok(undefined);},
 },{get(target,name){return target[name]||(String(name).startsWith('on')?()=>()=>{}:async()=>ok(undefined));}});
 function Fixture(){const[state,setState]=useState(initial);return <AppModeProvider snapshot={state} onSnapshotUpdated={setState}><div className="app-shell"><div className="app-content"><ChatPage state={state} onSaved={setState} onSignOut={()=>{}}/></div></div></AppModeProvider>};createRoot(document.getElementById('root')).render(<Fixture/>);
 `}});
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});
 try{
 const page=await browser.newPage({viewport:{width:1180,height:940},reducedMotion:'reduce'});page.setDefaultTimeout(12000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{(window as any).__name=(value:unknown)=>value;});
 await page.route('https://novi.test/',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('https://novi.test/');
 await page.addStyleTag({content:readFileSync('src/renderer/src/styles/app.css','utf8')});await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.locator('.empty-state h1').waitFor();assert.equal(await page.locator('.empty-state p').count(),0);
 assert.equal(await page.locator('.sidebar').count(),0,'collapsed navigation leaves no rail');
 const layout=(await page.locator('.chat-layout').boundingBox())!,main=(await page.locator('.chat-main').boundingBox())!;
 assert(Math.abs(layout.width-main.width)<2,'the conversation uses the full collapsed layout width');
 await page.evaluate(()=>(window as any).openChat());await page.getByText('Please explain this code.',{exact:true}).waitFor();
 assert.equal(await page.locator('.message-heading,.message-model,.message time').count(),0,'message rows show only an icon and content');
 await page.evaluate(()=>(window as any).chatEvent({type:'started',conversation:{id:'chat',title:'Waiting',createdAt:1,updatedAt:1,messages:[{id:'pending',role:'assistant',content:'',createdAt:1}]}}));
 await page.getByRole('status',{name:'Novi is thinking'}).waitFor();
 await page.getByText('“Let me take a moment to think that through.”',{exact:true}).waitFor();
 await page.evaluate(()=>(window as any).chatEvent({type:'delta',conversationId:'chat',messageId:'pending',text:'The answer is arriving.'}));
 await page.locator('.waiting-phrases').waitFor({state:'detached'});
 await page.evaluate(()=>(window as any).openChat());
 await page.getByText('Please explain this code.',{exact:true}).waitFor();
 assert.equal(await page.getByText('Response timing',{exact:true}).count(),0);assert.equal(await page.locator('.debug-chat').count(),0);
 assert.equal(await page.locator('.code-line-number').count(),5);
 await page.getByRole('button',{name:'Copy code',exact:true}).click();assert.equal(await page.evaluate(()=>(window as any).copied[0]),await page.evaluate(()=>(window as any).code));
 await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Debug',exact:true}).click();
 await page.getByRole('checkbox',{name:'Show debug information in chat'}).check();assert.equal(await page.locator('.debug-toolbar').count(),0,'settings only contains the debug toggle');
 await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByText('Finding space for Novi',{exact:true}).waitFor();await page.getByText('Response timing',{exact:true}).waitFor();
 assert.equal(await page.locator('.debug-chat').getAttribute('open'),'');await page.getByRole('button',{name:'Clear',exact:true}).click();await page.getByText('No events recorded yet.',{exact:false}).waitFor();
 await page.screenshot({path:'.test-data/chat-v2/debug.png',fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Debug',exact:true}).click();await page.getByRole('checkbox',{name:'Show debug information in chat'}).uncheck();await page.getByRole('button',{name:'Back',exact:true}).click();
 await page.getByLabel('Message Novi',{exact:true}).fill('Keep this draft through the style change.');
 await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('button',{name:'Appearance',exact:true}).click();
 const popupEvent=page.waitForEvent('popup');
 await page.getByRole('group',{name:'Interface style',exact:true}).getByRole('button',{name:/^Modern/}).click();
 const popup=await popupEvent;popup.setDefaultTimeout(12000);
 await popup.locator('.modern-tray').waitFor();
 await popup.getByRole('group',{name:'Interface style',exact:true}).waitFor();
 await popup.getByRole('button',{name:'General',exact:true}).click();
 await popup.waitForTimeout(150);
 const shellBottom=await popup.locator('.tray-shell').evaluate(el=>Math.ceil(el.getBoundingClientRect().bottom+scrollY));
 assert((await page.evaluate(()=>(window as any).trayHeights.at(-1)))<=shellBottom+8,'scrolling settings content must not enlarge the floating window beyond its panel');
 await popup.getByRole('button',{name:'Appearance',exact:true}).click();
 assert.equal(await page.locator('.chat-header,.sidebar,.composer').count(),0,'Modern leaves only responses in the main window');
 assert.equal(await popup.getByLabel('Message Novi',{exact:true}).inputValue(),'Keep this draft through the style change.');
 await popup.getByRole('button',{name:'Collapse message box',exact:true}).click();
 assert.equal(await popup.getByLabel('Message Novi',{exact:true}).isVisible(),false);
 await popup.getByRole('button',{name:'Write a message',exact:true}).click();
 assert.equal(await popup.getByLabel('Message Novi',{exact:true}).inputValue(),'Keep this draft through the style change.');
 await popup.getByRole('group',{name:'Theme',exact:true}).getByRole('button',{name:'Light',exact:true}).click();
 await popup.keyboard.press('Escape');
 await popup.getByText('You have unsaved changes.',{exact:true}).waitFor();
 await popup.getByRole('button',{name:'Discard',exact:true}).click();
 await popup.locator('.modern-panel').waitFor({state:'detached'});
 await popup.getByRole('button',{name:'Settings',exact:true}).click();
 await popup.getByRole('button',{name:'Appearance',exact:true}).click();
 const popupClosed=popup.waitForEvent('close');
 await popup.getByRole('group',{name:'Interface style',exact:true}).getByRole('button',{name:/^Classic/}).click();
 await popupClosed;
 await page.getByRole('group',{name:'Interface style',exact:true}).waitFor();
 assert.equal(await page.getByRole('group',{name:'Interface style',exact:true}).getByRole('button',{name:/^Classic/}).getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'Back',exact:true}).click();
 assert.equal(await page.getByLabel('Message Novi',{exact:true}).inputValue(),'Keep this draft through the style change.');
 await page.waitForTimeout(150);assert.equal(await page.locator('.debug-chat,.response-latency').count(),0);
 await page.screenshot({path:'.test-data/chat-v2/chat.png',fullPage:true,animations:'disabled'});
 for(const scale of [.7,1,1.5,2]){
  await page.evaluate(scale=>document.documentElement.style.setProperty('--ui-scale',String(scale)),scale);
  const box=(await page.locator('.app-shell').boundingBox())!;assert(Math.abs(box.width-1180)<2,'scaled interface fits width at '+scale);assert(Math.abs(box.height-940)<2,'scaled interface fits height at '+scale);
 }
 await page.evaluate(()=>{document.documentElement.style.setProperty('--ui-scale','1');document.documentElement.classList.add('transparent-mode');document.documentElement.style.setProperty('--transparent-text','#ffffff');document.documentElement.style.setProperty('--transparent-bg','#09090b');});
 const alpha=(value:string)=>Number(value.match(/\/\s*([\d.]+)\)/)?.[1]??value.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)?.[1]??1);
 assert(alpha(await page.locator('.message.assistant').evaluate(el=>getComputedStyle(el).backgroundColor))<.15);
 assert(alpha(await page.locator('.code-block').evaluate(el=>getComputedStyle(el).backgroundColor))<.1);
 assert.equal(await page.locator('.message.assistant').evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)');
 await page.screenshot({path:'.test-data/chat-v2/transparent-dark.png',fullPage:true,animations:'disabled'});
 await page.evaluate(()=>{document.documentElement.style.setProperty('--transparent-text','#141414');document.documentElement.style.setProperty('--transparent-bg','#ffffff');document.documentElement.style.setProperty('--transparent-color-scheme','light');});
 assert.equal(await page.locator('.message.assistant').evaluate(el=>getComputedStyle(el).color),'rgb(20, 20, 20)');
 await page.screenshot({path:'.test-data/chat-v2/transparent-light.png',fullPage:true,animations:'disabled'});
 assert.deepEqual(errors,[]);console.log('Chat UI passed: minimal greeting, debug-only timings and activity, settings toggle, clear, numbered code, exact copying, whole-interface scale and translucent light/dark replies.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
