import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { RemoteCompanionService } from '../src/main/services/remoteCompanion';

async function main(){
 const html=(new RemoteCompanionService({} as any,()=>null) as any).renderMobileAppHTML();
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});
 try {
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.setDefaultTimeout(10000);
 await page.addInitScript(()=>{(window as any).__name=(x:unknown)=>x;});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const actions:Array<{action:string,payload:any}>=[];
 const status={ok:true,transparent:false,clickThrough:false,currentMode:'normal',windowLayout:{xRatio:.25,yRatio:.15,widthRatio:.4,heightRatio:.6,minWidthRatio:.12,minHeightRatio:.15,aspectRatio:16/9},conversationScroll:{position:.5,scrollable:true},smartPlacement:{enabled:false,busy:false,error:'',reason:'',shortcut:'Control+Alt+Shift+Space',shortcutRegistered:true}};
 await page.route('https://companion.test/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
  if(url.pathname==='/api/action'){
   const input=route.request().postDataJSON();actions.push(input);
   if(input.action==='set-window-bounds')Object.assign(status.windowLayout,input.payload);
   if(input.action==='scroll-conversation-to')status.conversationScroll.position=input.payload;
   if(input.action==='auto-smart')status.smartPlacement.enabled=input.payload;
   if(input.action==='auto-detect')status.smartPlacement.reason='A quiet right margin.';
  }
  return route.fulfill({contentType:'application/json',body:JSON.stringify(status)});
 });
 await page.goto('https://companion.test/#token=fixture');await page.getByRole('slider',{name:'Conversation scroll position'}).waitFor();
 await page.waitForFunction(()=>!document.querySelector<HTMLInputElement>('#conversationScroll')?.disabled);
 assert.equal(await page.getByRole('button',{name:/^(Left|Right|Center|↑ Up|↓ Down)$/}).count(),0);
 const preview=page.locator('#windowPreview');
 const drag=async(edge:string|null,dx:number,dy:number)=>{
  const target=edge?page.locator('[data-edge="'+edge+'"]'):preview;
  const box=(await target.boundingBox())!;const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:5});await page.mouse.up();
  await page.waitForTimeout(300);return actions.filter(x=>x.action==='set-window-bounds').at(-1)!.payload;
 };
 const moved=await drag(null,15,8);assert(Math.abs(moved.widthRatio-.4)<.001);assert(Math.abs(moved.heightRatio-.6)<.001);assert(moved.xRatio>.25);assert(moved.yRatio>.15);
 const right=moved.xRatio+moved.widthRatio;const leftResize=await drag('w',-15,0);assert(Math.abs(leftResize.xRatio+leftResize.widthRatio-right)<.001);assert(Math.abs(leftResize.heightRatio-moved.heightRatio)<.001);
 const bottom=leftResize.yRatio+leftResize.heightRatio;const topResize=await drag('n',0,-8);assert(Math.abs(topResize.yRatio+topResize.heightRatio-bottom)<.001);assert(Math.abs(topResize.widthRatio-leftResize.widthRatio)<.001);
 await page.locator('#conversationScroll').evaluate(el=>{(el as HTMLInputElement).value='730';el.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForTimeout(150);
 assert.equal(actions.filter(x=>x.action==='scroll-conversation-to').at(-1)?.payload,.73);
 await page.getByRole('button',{name:'✦ AutoDetect',exact:true}).click();await page.getByText('A quiet right margin.').waitFor();
 await page.getByRole('checkbox',{name:'Auto Smart',exact:true}).check();await page.waitForTimeout(150);assert.equal(actions.at(-1)?.action,'auto-smart');
 await page.screenshot({path:'.test-data/companion-v2/portrait.png',fullPage:true});
 const before={...status.windowLayout};await page.setViewportSize({width:844,height:390});await page.screenshot({path:'.test-data/companion-v2/landscape.png',fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const landscapeMove=await drag(null,-10,0);assert(Math.abs(landscapeMove.widthRatio-before.widthRatio)<.001);assert(landscapeMove.xRatio<before.xRatio);
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await preview.evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
 assert.deepEqual(errors,[]);console.log('Phone UI passed: independent edge resizing, center movement, live slider, AutoDetect, Auto Smart, compact portrait/landscape and reduced motion.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
