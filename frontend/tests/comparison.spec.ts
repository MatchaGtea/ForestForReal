import {test,expect} from '@playwright/test';
import realGrid from './fixtures/analysis-grid-fp001.json' with {type:'json'};

async function openComparison(page:import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.locator('.project-card')).toHaveCount(10);
  await page.locator('.project-card').first().click();
  await page.getByRole('button',{name:'เปรียบเทียบก่อน–หลัง',exact:false}).click();
}

async function openSettings(page:import('@playwright/test').Page){
  await page.getByRole('button',{name:'เปิดตั้งค่า',exact:true}).click();
  await expect(page.locator('.comparison-settings')).toBeVisible();
}

test('inline comparison keeps the catalog, folds settings, and returns to the selected project',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await openComparison(page);
  await expect(page.locator('.catalog')).toHaveCount(1);
  await expect(page.locator('.detail')).toHaveCount(0);
  await expect(page.locator('.comparison-period')).toHaveCount(2);
  // Opening comparison must preserve an actual navigable map while imagery
  // is waiting for analysis, rather than replacing it with two blank cards.
  await expect(page.locator('.comparison-map')).toHaveCount(2);
  await expect(page.locator('[data-period=baseline] figcaption')).toContainText('ก่อน');
  await expect(page.locator('[data-period=comparison] figcaption')).toContainText('หลัง');
  await expect(page.getByRole('button',{name:'แผนที่เดียว'})).toBeFocused();
  await expect(page.getByLabel('แสดงสัญญาณต้นไม้',{exact:true})).not.toBeChecked();
  await expect(page.getByLabel('แสดงกริด',{exact:true})).toBeChecked();
  await expect(page.locator('.comparison-placeholder')).toHaveCount(2);
  await expect(page.getByRole('button',{name:'ซูมเข้าทั้งสองภาพ'})).toBeEnabled();
  const canvas=await page.locator('.comparison-period').first().boundingBox();
  const mapFrame=await page.locator('.comparison-map').first().boundingBox();
  expect(mapFrame!.width).toBeCloseTo(canvas!.width,0);
  expect(mapFrame!.height).toBeCloseTo(canvas!.height,0);
  if(test.info().project.name!=='mobile'){
    const offset=()=>page.locator('.comparison-map').first().evaluate(map=>{
      const frame=map.getBoundingClientRect();
      const boundary=map.querySelector('.leaflet-comparison-boundary-pane path')!.getBoundingClientRect();
      return [boundary.x+boundary.width/2-frame.x-frame.width/2,boundary.y+boundary.height/2-frame.y-frame.height/2];
    });
    const initialOffset=await offset();
    await page.getByRole('button',{name:'ขยายแผนที่เต็มพื้นที่'}).click();
    await expect(page.locator('.catalog')).toBeHidden();
    await expect(page.locator('.comparison-map')).toHaveCount(2);
    const full=await page.locator('.comparison-workspace').boundingBox();
    expect(full!.x).toBe(0);
    expect(full!.width).toBe(await page.evaluate(()=>innerWidth));
    await expect.poll(async()=>(await offset()).every((value,index)=>Math.abs(value-initialOffset[index])<2)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.catalog')).toBeVisible();
    await expect.poll(async()=>(await offset()).every((value,index)=>Math.abs(value-initialOffset[index])<2)).toBe(true);
  }
  await openSettings(page);
  await expect(page.getByLabel('เริ่มช่วงฐาน',{exact:true})).toBeFocused();
  await page.getByLabel('เริ่มช่วงฐาน',{exact:true}).fill('');
  await expect(page.locator('[data-period=baseline] figcaption')).toContainText('เลือกวันที่');
  await page.getByLabel('เริ่มช่วงฐาน',{exact:true}).fill('2022-01-01');
  await expect(page.locator('[data-period=baseline] figcaption')).toContainText('2565');
  await page.locator('.comparison-settings').getByRole('button',{name:'พับตั้งค่า',exact:true}).click();
  await expect(page.locator('.comparison-settings')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'เปิดตั้งค่า',exact:true})).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const before=await page.locator('[data-period=baseline]').boundingBox();
  const after=await page.locator('[data-period=comparison]').boundingBox();
  if(test.info().project.name==='mobile')expect(after!.y).toBeGreaterThanOrEqual(before!.y+before!.height);
  else {
    expect(after!.x).toBeGreaterThanOrEqual(before!.x+before!.width);
    const catalog=await page.locator('.catalog').boundingBox();
    expect(before!.x).toBeGreaterThanOrEqual(catalog!.x+catalog!.width);
    expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);
  }
  await page.getByRole('button',{name:'แผนที่เดียว'}).click();
  await expect(page.locator('.project-card.selected')).toContainText('FP-001');
  await expect(page.getByRole('button',{name:'เปรียบเทียบก่อน–หลัง',exact:false})).toBeFocused();
  expect(errors).toEqual([]);
});

test('advanced options retain the current analysis contract',async({page})=>{
  await openComparison(page);
  await openSettings(page);
  await page.getByText('ตัวเลือกเพิ่มเติม',{exact:true}).click();
  const latest=page.getByLabel('ใช้ภาพล่าสุดที่มีข้อมูลใน 90 วัน เทียบฤดูเดียวกันปีก่อน');
  await latest.check();
  await expect(page.getByLabel('เริ่มช่วงฐาน',{exact:true})).toBeDisabled();
  await expect(page.getByLabel('เริ่มเปรียบเทียบ',{exact:true})).toBeDisabled();
  await latest.uncheck();
  await expect(page.getByLabel('เริ่มช่วงฐาน',{exact:true})).toBeEnabled();
  await page.getByLabel('หน้าต่าง (เมตร)',{exact:true}).fill('75');
  await expect(page.getByLabel('หน้าต่าง (เมตร)',{exact:true})).toHaveValue('75');
});

test('unavailable analysis never displays invented imagery or values',async({page})=>{
  await page.route('**/api/analysis',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'ยังไม่ได้ยืนยันสิทธิ์ Earth Engine'})}));
  await openComparison(page);
  await page.getByRole('button',{name:'เริ่มวิเคราะห์พื้นที่'}).click();
  await expect(page.getByRole('alert')).toContainText('ยังไม่ได้ยืนยันสิทธิ์');
  await expect(page.locator('.comparison-map')).toHaveCount(2);
  await expect(page.locator('.leaflet-analysis-images-pane img')).toHaveCount(0);
  await expect(page.locator('.comparison-metrics strong')).toHaveText(['—','—','—','—']);
  await expect(page.getByRole('button',{name:'เริ่มวิเคราะห์พื้นที่'})).toBeEnabled();
});

test('a late job response cannot restore results after the dates change',async({page})=>{
  let release!:()=>void;
  const hold=new Promise<void>(resolve=>{release=resolve;});
  let requested!:()=>void;
  const requestSeen=new Promise<void>(resolve=>{requested=resolve;});
  let polls=0;
  await page.route('**/api/analysis',async route=>{requested();await hold;await route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({job_id:'late-job',stage:'queued'})});});
  await page.route('**/api/analysis/late-job',route=>{polls++;return route.fulfill({json:{stage:'queued'}});});
  await openComparison(page);
  await page.getByRole('button',{name:'เริ่มวิเคราะห์พื้นที่'}).click();
  await requestSeen;
  await openSettings(page);
  await page.getByLabel('เริ่มช่วงฐาน',{exact:true}).fill('2022-01-01');
  await page.locator('.comparison-settings').getByRole('button',{name:'พับตั้งค่า',exact:true}).click();
  const response=page.waitForResponse(response=>response.url().endsWith('/api/analysis'));
  release();await response;
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(page.getByRole('button',{name:'เริ่มวิเคราะห์พื้นที่'})).toBeEnabled();
  await expect(page.locator('.comparison-map')).toHaveCount(2);
  await expect(page.locator('.leaflet-analysis-images-pane img')).toHaveCount(0);
  expect(polls).toBe(0);
});

// A completed, empty observation exercises failure states without inventing
// satellite imagery or numeric measurements.
const params={baseline_start:'2023-01-01',baseline_end:'2023-04-01',comparison_start:'2025-01-01',comparison_end:'2025-04-01',window_m:50,stride_m:25,latest:false};
const provenance=(start:string,end:string)=>({start,end_exclusive:end,sentinel_dates:[],dynamic_world_dates:[],sentinel_ids:[],dynamic_world_ids:[],sentinel_scene_count:0,dynamic_world_scene_count:0});
const emptyObservation={project_id:'FP-001',method:'test-empty-observation',datasets:[],created_at:'2026-10-11T00:00:00Z',params,metrics:{},comparable_metrics:{},baseline:provenance(params.baseline_start,params.baseline_end),comparison:provenance(params.comparison_start,params.comparison_end),trends:[],area_summaries:[],inspection_points:[]};
async function emptyAnalysis(page:import('@playwright/test').Page){
  await page.route('**/api/analysis',route=>route.fulfill({status:202,json:{job_id:'empty-observation',stage:'complete'}}));
  await page.route('**/api/analysis/empty-observation',route=>route.fulfill({json:{stage:'complete'}}));
  await page.route('**/api/analysis/empty-observation/summary',route=>route.fulfill({json:emptyObservation}));
  await page.route('**/api/analysis/empty-observation/grid',route=>route.fulfill({json:{type:'FeatureCollection',features:[]}}));
}

test('RGB starts with the shared colored grid and inspection points from the normal map',async({page})=>{
  let analyses=0;
  await emptyAnalysis(page);
  await page.route('**/api/analysis/empty-observation/summary',route=>route.fulfill({json:{...emptyObservation,inspection_points:realGrid.inspection_points}}));
  await page.route('**/api/analysis/empty-observation/grid',route=>route.fulfill({json:realGrid.grid}));
  await page.route('**/api/analysis/empty-observation/layers',route=>route.fulfill({json:{}}));
  page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/analysis')analyses++;});
  await openComparison(page);
  await page.getByRole('button',{name:'เริ่มวิเคราะห์พื้นที่'}).click();
  await expect(page.locator('.inspection-point')).toHaveCount(realGrid.inspection_points.length*2);
  await expect(page.locator('.analysis-grid-cell')).toHaveCount(realGrid.grid.features.length*2);
  await expect(page.getByLabel('แสดงกริด',{exact:true})).toBeChecked();
  await expect(page.getByLabel('แสดงสัญญาณต้นไม้',{exact:true})).not.toBeChecked();
  const palettes=await page.locator('.comparison-map').evaluateAll(maps=>maps.map(map=>[...map.querySelectorAll('.analysis-grid-cell')].map(cell=>[cell.getAttribute('fill'),cell.getAttribute('fill-opacity')])));
  expect(palettes[0]).toEqual(palettes[1]);
  expect(new Set(palettes[0].map(([color])=>color))).toEqual(new Set(['#14532d','#d6a13c']));
  expect(palettes[0].every(([,opacity])=>opacity==='0.12')).toBe(true);
  const key=page.locator('.comparison-grid-key');
  await key.locator('summary').focus();await page.keyboard.press('Enter');
  await expect(key).toHaveAttribute('open','');
  await expect(key).toContainText('มีต้นไม้อยู่เดิม');
  await expect(key).toContainText('ควรตรวจเพิ่มเติม');
  await expect(key).toContainText('ชุดเดียวกันทั้งสองฝั่ง');
  await page.keyboard.press('Enter');
  // Use the actual cached inspection point, without a new analysis or a cell fetch.
  const point=realGrid.inspection_points[0];
  await page.locator('[data-period=baseline] .inspection-point').first().click();
  await expect(page.locator('.cell-detail')).toContainText(`WINDOW ${point.cell_id}`);
  await expect(page.getByRole('region',{name:'รายละเอียดช่องวิเคราะห์',exact:true})).toBeFocused();
  await expect(page.locator('.catalog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.comparison-settings')).toHaveCount(0);
  await page.locator('[data-period=comparison] .inspection-point').first().click();
  await expect(page.locator('.cell-detail')).toContainText(`WINDOW ${point.cell_id}`);
  await page.keyboard.press('Escape');
  await page.getByLabel('แสดงกริด',{exact:true}).uncheck();
  await expect(page.locator('.analysis-grid-cell,.inspection-point')).toHaveCount(0);
  await expect(page.locator('.project-pin')).toHaveCount(2);
  await page.getByLabel('แสดงกริด',{exact:true}).check();
  await expect(page.locator('.inspection-point')).toHaveCount(realGrid.inspection_points.length*2);
  await openSettings(page);
  await expect(page.locator('.coverage')).toContainText('—%');
  await expect(page.locator('.coverage')).not.toContainText('0%');
  await page.getByRole('button',{name:'ปิดข้อมูลช่อง',exact:true}).click();
  await page.locator('.inspection').first().click();
  await expect(page.locator('.cell-detail')).toContainText(`WINDOW ${point.cell_id}`);
  await expect(page.locator('.workspace')).toHaveClass(/sheet-collapsed/);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'แผนที่เดียว',exact:true}).click();
  await expect(page.locator('.analysis-grid-cell')).toHaveCount(realGrid.grid.features.length);
  expect(await page.locator('.analysis-grid-cell').evaluateAll(cells=>cells.map(cell=>[cell.getAttribute('fill'),cell.getAttribute('fill-opacity')]))).toEqual(palettes[0]);
  expect(analyses).toBe(1);
});

test('two maps synchronize their boundary after zooming and panning, without new analysis',async({page})=>{
  let requests=0;
  await emptyAnalysis(page);
  page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/analysis')requests++;});
  await page.route('**/api/analysis/empty-observation/layers',route=>route.fulfill({json:{baseline_rgb:{error:'ภาพไม่พร้อม'},comparison_rgb:{error:'ภาพไม่พร้อม'}}}));
  await openComparison(page);
  await page.getByRole('button',{name:'เริ่มวิเคราะห์พื้นที่'}).click();
  await expect(page.locator('.comparison-map')).toHaveCount(2);
  await openSettings(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.comparison-settings')).toHaveCount(0);
  const synchronized=()=>page.locator('.comparison-map').evaluateAll(maps=>{
    const positions=maps.map(map=>{
      const frame=map.getBoundingClientRect();const boundary=map.querySelector('.leaflet-comparison-boundary-pane path')!.getBoundingClientRect();
      return [boundary.x-frame.x,boundary.y-frame.y,boundary.width,boundary.height];
    });
    return positions[0].every((value,index)=>Math.abs(value-positions[1][index])<2);
  });
  await expect.poll(synchronized).toBe(true);
  const initialWidth=await page.locator('.leaflet-comparison-boundary-pane path').first().evaluate(node=>node.getBoundingClientRect().width);
  await page.getByRole('button',{name:'ซูมเข้าทั้งสองภาพ'}).click();
  await expect.poll(synchronized).toBe(true);
  expect(await page.locator('.leaflet-comparison-boundary-pane path').first().evaluate(node=>node.getBoundingClientRect().width)).toBeGreaterThan(initialWidth);
  const map=page.locator('.comparison-map').first();await map.scrollIntoViewIfNeeded();const box=await map.boundingBox();
  await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();
  await page.mouse.move(box!.x+box!.width/2+40,box!.y+box!.height/2+25,{steps:8});await page.mouse.up();
  await expect.poll(synchronized).toBe(true);
  const keyboardMap=page.getByRole('region',{name:'แผนที่ช่วงก่อน',exact:true});
  const boundaryX=()=>page.locator('.leaflet-comparison-boundary-pane path').first().evaluate(node=>node.getBoundingClientRect().x);
  const beforeKeyboard=await boundaryX();
  await keyboardMap.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(boundaryX).toBeLessThan(beforeKeyboard-10);
  await expect.poll(synchronized).toBe(true);
  await page.getByLabel('แสดงสัญญาณต้นไม้',{exact:true}).uncheck();
  await page.getByRole('button',{name:'กลับไปขอบเขตโครงการทั้งสองภาพ'}).click();
  await expect.poll(synchronized).toBe(true);
  await page.getByRole('button',{name:'แผนที่เดียว',exact:true}).click();
  // This control changes the layout and unmounts itself. Assert the new maps
  // instead of waiting for the old checkbox to remain checked in the DOM.
  await page.locator('.layer-controls').getByLabel('เปรียบเทียบภาพก่อน / หลัง',{exact:true}).click();
  await expect(page.locator('.comparison-map')).toHaveCount(2);
  await expect(page.locator('.comparison-settings')).toHaveCount(0);
  await expect.poll(synchronized).toBe(true);
  expect(requests).toBe(1);
});

test('layer errors name the affected images and can be retried',async({page})=>{
  let layerRequests=0;
  await emptyAnalysis(page);
  await page.route('**/api/analysis/empty-observation/layers',route=>{layerRequests++;return route.fulfill({json:{baseline_rgb:{error:'ภาพไม่พร้อม'},comparison_rgb:{error:'ภาพไม่พร้อม'}}});});
  await openComparison(page);
  await page.getByRole('button',{name:'เริ่มวิเคราะห์พื้นที่'}).click();
  await expect(page.locator('.comparison-warning')).toContainText('ภาพสีจริงช่วงก่อน');
  await expect(page.locator('.comparison-warning')).toContainText('ภาพสีจริงช่วงหลัง');
  // A tile error is a small notification, never an opaque layer hiding the map.
  const notice=await page.locator('[data-period=baseline] .comparison-placeholder').boundingBox();
  const frame=await page.locator('[data-period=baseline] .comparison-map').boundingBox();
  expect(notice!.height).toBeLessThan(frame!.height/2);
  await page.getByRole('button',{name:'โหลดภาพใหม่',exact:true}).click();
  await expect.poll(()=>layerRequests).toBe(2);
  await expect(page.locator('.comparison-metrics strong')).toHaveText(['—','—','—','—']);
});

test('late layer refresh cannot restore images or values after dates change',async({page})=>{
  await emptyAnalysis(page);
  let release!:()=>void;const hold=new Promise<void>(resolve=>{release=resolve;});
  let started!:()=>void;const requestStarted=new Promise<void>(resolve=>{started=resolve;});
  await page.route('**/api/analysis/empty-observation/layers',async route=>{started();await hold;await route.fulfill({json:{baseline_rgb:{error:'ภาพไม่พร้อม'},comparison_rgb:{error:'ภาพไม่พร้อม'}}});});
  await openComparison(page);
  await page.getByRole('button',{name:'เริ่มวิเคราะห์พื้นที่'}).click();
  await requestStarted;
  await expect(page.locator('.comparison-map')).toHaveCount(2);
  await openSettings(page);
  await page.getByLabel('เริ่มช่วงฐาน',{exact:true}).fill('2022-01-01');
  await page.locator('.comparison-settings').getByRole('button',{name:'พับตั้งค่า',exact:true}).click();
  const response=page.waitForResponse(response=>response.url().endsWith('/layers'));release();await response;
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(page.locator('.comparison-map')).toHaveCount(2);
  await expect(page.locator('.leaflet-analysis-images-pane img')).toHaveCount(0);
  await expect(page.locator('.comparison-warning')).toHaveCount(0);
  await expect(page.locator('.comparison-metrics strong')).toHaveText(['—','—','—','—']);
});

test('a project change discards layers still loading for the previous project',async({page})=>{
  await emptyAnalysis(page);
  await page.route('**/api/analysis/empty-observation/summary',route=>route.fulfill({json:{...emptyObservation,inspection_points:realGrid.inspection_points}}));
  await page.route('**/api/analysis/empty-observation/grid',route=>route.fulfill({json:realGrid.grid}));
  let release!:()=>void;const hold=new Promise<void>(resolve=>{release=resolve;});
  let started!:()=>void;const requestStarted=new Promise<void>(resolve=>{started=resolve;});
  let releaseGrid!:()=>void;const holdGrid=new Promise<void>(resolve=>{releaseGrid=resolve;});
  let gridStarted!:()=>void;const gridRequestStarted=new Promise<void>(resolve=>{gridStarted=resolve;});
  await page.route('**/api/projects/FP-002/grid?*',async route=>{gridStarted();await holdGrid;await route.fulfill({json:{type:'FeatureCollection',features:[]}});});
  await page.route('**/api/analysis/empty-observation/layers',async route=>{started();await hold;await route.fulfill({json:{baseline_rgb:{error:'ภาพโครงการเก่าไม่พร้อม'}}});});
  await openComparison(page);
  await page.getByRole('button',{name:'เริ่มวิเคราะห์พื้นที่'}).click();
  await requestStarted;
  await expect(page.locator('.inspection-point')).toHaveCount(realGrid.inspection_points.length*2);
  if(test.info().project.name==='mobile')await page.locator('.sheet-handle').click();
  await page.locator('.project-card').nth(1).click();
  await expect(page.locator('.comparison-heading')).toContainText('FP-002');
  await gridRequestStarted;
  await expect(page.locator('.analysis-grid-cell,.inspection-point')).toHaveCount(0);
  const response=page.waitForResponse(response=>response.url().endsWith('/layers'));release();await response;
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(page.locator('.comparison-map')).toHaveCount(2);
  await expect(page.locator('.leaflet-analysis-images-pane img')).toHaveCount(0);
  await expect(page.locator('.comparison-warning')).toHaveCount(0);
  await expect(page.locator('.comparison-metrics strong')).toHaveText(['—','—','—','—']);
  const gridResponse=page.waitForResponse(response=>response.url().includes('/projects/FP-002/grid?'));releaseGrid();await gridResponse;
  await expect(page.locator('.analysis-grid-cell,.inspection-point')).toHaveCount(0);
});

test('expired image links name both affected periods and allow a fresh layer request',async({page})=>{
  await emptyAnalysis(page);
  let layerRequests=0;
  await page.route('**/api/analysis/empty-observation/layers',route=>{
    layerRequests++;
    return route.fulfill({json:{baseline_rgb:{url:`/expired-before/${layerRequests}/{z}/{x}/{y}`},comparison_rgb:{url:`/expired-after/${layerRequests}/{z}/{x}/{y}`}}});
  });
  await page.route('**/expired-*/*/*/*/*',route=>route.fulfill({status:410,body:'Image link expired'}));
  await openComparison(page);
  await page.getByRole('button',{name:'เริ่มวิเคราะห์พื้นที่'}).click();
  await expect(page.locator('[data-period=baseline] .comparison-placeholder strong')).toHaveText('ภาพช่วงนี้ยังไม่พร้อม');
  await expect(page.locator('[data-period=comparison] .comparison-placeholder strong')).toHaveText('ภาพช่วงนี้ยังไม่พร้อม');
  await expect(page.locator('.comparison-warning')).toContainText('ภาพสีจริงช่วงก่อน');
  await expect(page.locator('.comparison-warning')).toContainText('ภาพสีจริงช่วงหลัง');
  await page.getByRole('button',{name:'โหลดภาพใหม่',exact:true}).click();
  await expect.poll(()=>layerRequests).toBe(2);
});

test('tile failures are cleared when the failed viewport is unloaded',async({page})=>{
  await emptyAnalysis(page);
  const keys=['baseline_rgb','comparison_rgb','baseline_trees','comparison_trees','comparison_insufficient'];
  await page.route('**/api/analysis/empty-observation/layers',route=>route.fulfill({json:Object.fromEntries(keys.map(key=>[key,{url:`/failed-viewport/${key}/{z}/{x}/{y}`}]))}));
  let holdNewTiles=false;
  let release!:()=>void;
  const hold=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/failed-viewport/**',async route=>{
    if(holdNewTiles)await hold;
    await route.fulfill({status:410,body:'Expired tile'});
  });
  try{
    await openComparison(page);
    await page.getByRole('button',{name:'เริ่มวิเคราะห์พื้นที่'}).click();
    await expect(page.locator('.comparison-placeholder.has-error')).toHaveCount(2);
    holdNewTiles=true;
    await page.getByRole('button',{name:'ซูมเข้าทั้งสองภาพ'}).click();
    // Errors from the old viewport must not keep covering or labeling the new
    // view while its tile requests are still in flight.
    await expect(page.locator('.comparison-placeholder.has-error')).toHaveCount(0);
    await expect(page.locator('.comparison-warning')).toHaveCount(0);
    await expect(page.locator('.comparison-map')).toHaveCount(2);
  }finally{release();}
});
