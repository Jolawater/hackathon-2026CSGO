import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const browser=await chromium.launch({channel:'msedge'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8766/');
 await page.getByRole('button',{name:'Try an example first',exact:true}).click();
 const canvas=page.locator('.scene3d-canvas canvas');await canvas.waitFor();await page.waitForTimeout(1500);
 await canvas.scrollIntoViewIfNeeded();
 const b=await canvas.boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;
 for(const delta of [-190,190,-190,190]){
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+100,y+delta,{steps:20});await page.mouse.up();await page.waitForTimeout(300);
  assert(Number(await canvas.getAttribute('data-camera-height'))>=1.79,'Camera stays above the roof');
 }
 await page.mouse.move(x,y);await page.mouse.wheel(0,-12000);await page.waitForTimeout(1000);
 const distance=Number(await canvas.getAttribute('data-camera-distance')),min=Number(await canvas.getAttribute('data-min-camera-distance'));
 assert(distance>=min-.002);assert(Math.abs(distance-min)<.03);
 assert(await page.locator('.scene-camera-limit').isVisible());
 await page.mouse.wheel(0,650);await page.waitForTimeout(500);
 assert(Number(await canvas.getAttribute('data-camera-distance'))>distance);
 await page.locator('.scene3d').screenshot({path:'E:/hackathon/roofsun-ui-review/camera-limit.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: repeated orbit stays above rooftop, zoom stops at safe distance, boundary notice and reverse movement');
}finally{await browser.close();}
