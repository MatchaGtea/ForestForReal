// Opt-in verification against actual GEE results. No simulated satellite data.
import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const output=process.env.FORESTPROOF_SMOKE_OUTPUT||'/tmp/forestproof-comparison-smoke';
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const reports=[];
try{
  const viewports=[['desktop',1440,1000],['tablet',900,1000],['mobile',390,844]];
  for(const [name,width,height] of viewports.filter(([name])=>!process.env.FORESTPROOF_SMOKE_VIEWPORT||name===process.env.FORESTPROOF_SMOKE_VIEWPORT)){
    const page=await browser.newPage({viewport:{width,height}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error'&&!message.location().url.endsWith('/favicon.ico'))errors.push(message.text());});
    let analysisRequests=0;
    page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/analysis')analysisRequests++;});
    await page.goto('http://127.0.0.1:5173/');
    await page.locator('.project-card').first().click();
    await page.getByRole('button',{name:'เปรียบเทียบก่อน–หลัง',exact:false}).click();
    await expect(page.locator('.comparison-map')).toHaveCount(2);
    await page.getByRole('button',{name:'เปิดตั้งค่า',exact:true}).click();
    await page.getByLabel('เริ่มช่วงฐาน',{exact:true}).fill('2023-01-01');
    await page.getByLabel('สิ้นสุดช่วงฐาน',{exact:true}).fill('2023-04-01');
    await page.getByLabel('เริ่มเปรียบเทียบ',{exact:true}).fill('2025-01-01');
    await page.getByLabel('สิ้นสุดเปรียบเทียบ',{exact:true}).fill('2025-04-01');
    await page.locator('.comparison-settings').getByRole('button',{name:'พับตั้งค่า',exact:true}).click();
    await page.getByRole('button',{name:'เริ่มวิเคราะห์พื้นที่'}).click();
    await expect(page.locator('.comparison-map')).toHaveCount(2,{timeout:600000});
    await expect(page.locator('.comparison-placeholder')).toHaveCount(0,{timeout:300000});
    await expect(page.locator('.comparison-warning')).toHaveCount(0);
    // A canceled Leaflet tile can be a complete 1px image while still hidden.
    // Wait for visible tiles and repeated readiness after viewport throttling.
    const waitForTiles=async()=>{
      let readySamples=0;
      await expect.poll(async()=>{
        const ready=await page.locator('.comparison-map .leaflet-tile').evaluateAll(images=>images.length>0&&images.every(image=>image.classList.contains('leaflet-tile-loaded')&&image.complete&&image.naturalWidth>0&&getComputedStyle(image).visibility==='visible'&&Number(getComputedStyle(image).opacity)===1));
        readySamples=ready?readySamples+1:0;
        return readySamples>=3;
      },{timeout:180000,intervals:[250,500,1000]}).toBe(true);
    };
    await waitForTiles();
    const positions=()=>page.locator('.comparison-map').evaluateAll(maps=>maps.map(map=>{
      const frame=map.getBoundingClientRect();
      const boundary=map.querySelector('.leaflet-comparison-boundary-pane path').getBoundingClientRect();
      return [boundary.x-frame.x,boundary.y-frame.y,boundary.width,boundary.height];
    }));
    const synchronized=async()=>{
      const [before,after]=await positions();
      return before.every((value,index)=>Math.abs(value-after[index])<2);
    };
    await expect.poll(synchronized).toBe(true);
    await page.getByRole('button',{name:'ซูมเข้าทั้งสองภาพ'}).click();
    await expect.poll(synchronized).toBe(true);
    const firstMap=page.locator('.comparison-map').first();
    await firstMap.scrollIntoViewIfNeeded();
    const box=await firstMap.boundingBox();
    await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
    await page.mouse.down();
    await page.mouse.move(box.x+box.width*.5+40,box.y+box.height*.5+25,{steps:8});
    await page.mouse.up();
    await expect.poll(synchronized).toBe(true);
    await expect(page.getByLabel('แสดงสัญญาณต้นไม้',{exact:true})).not.toBeChecked();
    await expect(page.getByLabel('แสดงกริด',{exact:true})).toBeChecked();
    const rgbLayers=await page.locator('.comparison-map .leaflet-tile-container').count();
    await page.getByLabel('แสดงสัญญาณต้นไม้',{exact:true}).check();
    await expect.poll(()=>page.locator('.comparison-map .leaflet-tile-container').count()).toBe(rgbLayers+2);
    await page.getByLabel('แสดงสัญญาณต้นไม้',{exact:true}).uncheck();
    await expect.poll(()=>page.locator('.comparison-map .leaflet-tile-container').count()).toBe(rgbLayers);
    await expect(page.locator('.analysis-grid-cell')).toHaveCount(120);
    await expect(page.locator('.inspection-point')).toHaveCount(6);
    const palettes=await page.locator('.comparison-map').evaluateAll(maps=>maps.map(map=>[...new Set([...map.querySelectorAll('.analysis-grid-cell')].map(cell=>cell.getAttribute('fill')))].sort()));
    expect(palettes[0]).toEqual(['#14532d','#d6a13c']);
    expect(palettes[1]).toEqual(palettes[0]);
    await page.getByLabel('แสดงกริด',{exact:true}).uncheck();
    await expect(page.locator('.analysis-grid-cell,.inspection-point')).toHaveCount(0);
    await page.getByLabel('แสดงกริด',{exact:true}).check();
    await page.getByRole('button',{name:'กลับไปขอบเขตโครงการทั้งสองภาพ'}).click();
    await expect.poll(synchronized).toBe(true);
    await waitForTiles();
    const initialPositions=await positions();
    await page.locator('[data-period=baseline] .inspection-point').first().click();
    await expect(page.getByRole('region',{name:'รายละเอียดช่องวิเคราะห์',exact:true})).toBeFocused();
    await expect(page.locator('.cell-detail')).toContainText('WINDOW 4-1');
    await page.keyboard.press('Escape');
    await expect(page.locator('.comparison-settings')).toHaveCount(0);
    expect(await positions()).toEqual(initialPositions);

    await page.getByRole('button',{name:'เปิดตั้งค่า',exact:true}).click();
    await expect(page.getByLabel('เริ่มช่วงฐาน',{exact:true})).toHaveValue('2023-01-01');
    await page.screenshot({path:path.join(output,`${name}-settings.png`),fullPage:true});
    await page.locator('.comparison-settings').getByRole('button',{name:'พับตั้งค่า',exact:true}).click();
    expect(await positions()).toEqual(initialPositions);
    expect(analysisRequests).toBe(1);
    expect(errors).toEqual([]);
    expect(await page.locator('vite-error-overlay').count()).toBe(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const screenshot=path.join(output,`${name}.png`);
    await page.screenshot({path:screenshot,fullPage:true});
    if(name!=='mobile'){
      const centerOffsets=()=>page.locator('.comparison-map').evaluateAll(maps=>maps.map(map=>{
        const frame=map.getBoundingClientRect();
        const boundary=map.querySelector('.leaflet-comparison-boundary-pane path').getBoundingClientRect();
        return [boundary.x+boundary.width/2-frame.x-frame.width/2,boundary.y+boundary.height/2-frame.y-frame.height/2];
      }));
      const originalOffsets=await centerOffsets();
      const centered=async()=>(await centerOffsets()).every((offset,index)=>offset.every((value,axis)=>Math.abs(value-originalOffsets[index][axis])<2));
      await page.getByRole('button',{name:'ขยายแผนที่เต็มพื้นที่'}).click();
      await expect(page.locator('.catalog')).toBeHidden();
      await expect.poll(synchronized).toBe(true);
      await expect.poll(centered).toBe(true);
      await waitForTiles();
      await page.screenshot({path:path.join(output,`${name}-wide.png`),fullPage:true});
      await page.getByRole('button',{name:'แสดงรายการโครงการ',exact:true}).click();
      await expect(page.locator('.catalog')).toBeVisible();
      await expect.poll(synchronized).toBe(true);
      await expect.poll(centered).toBe(true);
      await waitForTiles();
      expect(analysisRequests).toBe(1);
    }
    const deltas=await page.locator('.comparison-deltas strong').allTextContents();
    expect(deltas.every(value=>value!=='0'&&value!=='—')).toBe(true);
    await page.getByLabel('แสดงกริด',{exact:true}).uncheck();
    await waitForTiles();
    const rgbScreenshot=path.join(output,`${name}-rgb.png`);
    await page.screenshot({path:rgbScreenshot,fullPage:true});
    reports.push({name,url:page.url(),title:await page.title(),analysisRequests,errors,metrics:await page.locator('.comparison-metrics').allTextContents(),deltas,screenshot,rgbScreenshot});
    console.log(`${name}: real imagery, synchronized maps, overlays, grid, and single analysis request PASS`);
    await page.close();
  }
  await fs.writeFile(path.join(output,'validation.json'),JSON.stringify(reports,null,2));
}finally{await browser.close();}
