import {test,expect} from '@playwright/test';
import checkedDates from './fixtures/date-suggestions-fp001.json' with {type:'json'};

async function openAdvisor(page:import('@playwright/test').Page){
  await page.goto('/');
  await page.locator('.project-card').first().click();
  await page.getByRole('button',{name:'เปรียบเทียบก่อน–หลัง',exact:false}).click();
  await page.getByRole('button',{name:'เปิดตั้งค่า',exact:true}).click();
  for(const [key,label] of Object.entries({baseline_start:'เริ่มช่วงฐาน',baseline_end:'สิ้นสุดช่วงฐาน',comparison_start:'เริ่มเปรียบเทียบ',comparison_end:'สิ้นสุดเปรียบเทียบ'}))await page.getByLabel(label,{exact:true}).fill(checkedDates.current!.params[key as keyof typeof checkedDates.current['params']]);
}

test('analysis failure offers a date check and tells the user what to change',async({page})=>{
  await page.route('**/api/analysis',route=>route.fulfill({status:422,json:{detail:'ใช้ช่วง 30–120 วัน ตั้งแต่ปี 2019 ถึงวันนี้ (วันสิ้นสุดไม่นับรวม)'}}));
  await page.goto('/');
  await page.locator('.project-card').first().click();
  await page.getByRole('button',{name:'เปรียบเทียบก่อน–หลัง',exact:false}).click();
  await page.getByRole('button',{name:'เริ่มวิเคราะห์พื้นที่'}).click();
  await expect(page.getByRole('alert')).toContainText('30–120 วัน');
  await page.getByRole('button',{name:'เปิดตั้งค่า',exact:true}).click();
  await expect(page.getByRole('button',{name:'แนะนำช่วงวันที่จากดาวเทียม',exact:true})).toBeVisible();
  await expect(page.locator('.analysis-guidance')).toContainText('ควรปรับ');
});

test('checked recommendations apply all four dates without starting another analysis',async({page})=>{
  // This is a recorded real GEE availability response, not invented observations.
  let analyses=0;
  page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/analysis')analyses++;});
  await page.route('**/api/projects/FP-001/date-suggestions',route=>route.fulfill({json:checkedDates}));
  await openAdvisor(page);
  await page.getByRole('button',{name:'แนะนำช่วงวันที่จากดาวเทียม',exact:true}).click();
  await expect(page.locator('.date-advisor-result')).toContainText('พบช่วงวันที่ที่ผ่านเกณฑ์ข้อมูลร่วม');
  await expect(page.locator('.date-check-current')).toContainText('0%');
  await expect(page.locator('.date-recommendation').first()).toContainText('100%');
  await expect(page.locator('.date-recommendation').first()).toContainText('2025-01-01 → 2025-04-01');
  await page.locator('.date-recommendation').first().getByRole('button',{name:'ใช้ช่วงวันที่นี้'}).click();
  for(const [key,label] of Object.entries({baseline_start:'เริ่มช่วงฐาน',baseline_end:'สิ้นสุดช่วงฐาน',comparison_start:'เริ่มเปรียบเทียบ',comparison_end:'สิ้นสุดเปรียบเทียบ'})){
    await expect(page.getByLabel(label,{exact:true})).toHaveValue(checkedDates.recommendations[0].params[key as keyof typeof checkedDates.recommendations[0]['params']]);
  }
  await expect(page.locator('.date-advisor-result')).toHaveCount(0);
  await expect(page.locator('.comparison-metrics strong')).toHaveText(['—','—','—','—']);
  expect(analyses).toBe(0);
  await page.route('**/api/analysis',route=>route.fulfill({status:503,json:{detail:'บริการยังไม่พร้อม'}}));
  await page.locator('.comparison-settings').getByRole('button',{name:'พับตั้งค่า',exact:true}).click();
  await page.getByRole('button',{name:'เริ่มวิเคราะห์พื้นที่',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('บริการยังไม่พร้อม');
  await expect(page.locator('.toast')).toHaveCount(0);
  expect(analyses).toBe(1);
});

test('late date suggestions cannot override a changed date or project',async({page})=>{
  let release!:()=>void;const hold=new Promise<void>(resolve=>{release=resolve;});
  let seen!:()=>void;const requested=new Promise<void>(resolve=>{seen=resolve;});
  let settled!:()=>void;const finished=new Promise<void>(resolve=>{settled=resolve;});
  await page.route('**/api/projects/FP-001/date-suggestions',async route=>{seen();await hold;await route.fulfill({json:checkedDates}).catch(()=>{});settled();});
  await openAdvisor(page);
  await page.getByRole('button',{name:'แนะนำช่วงวันที่จากดาวเทียม',exact:true}).click();await requested;
  await page.getByLabel('เริ่มช่วงฐาน',{exact:true}).fill('2022-01-01');
  release();await finished;
  await expect(page.locator('.date-advisor-result')).toHaveCount(0);
  await expect(page.getByLabel('เริ่มช่วงฐาน',{exact:true})).toHaveValue('2022-01-01');
  await expect(page.getByRole('button',{name:'แนะนำช่วงวันที่จากดาวเทียม',exact:true})).toBeEnabled();
  let releaseProject!:()=>void;const projectHold=new Promise<void>(resolve=>{releaseProject=resolve;});
  let projectSeen!:()=>void;const projectRequested=new Promise<void>(resolve=>{projectSeen=resolve;});
  let projectSettled!:()=>void;const projectFinished=new Promise<void>(resolve=>{projectSettled=resolve;});
  await page.route('**/api/projects/FP-001/date-suggestions',async route=>{projectSeen();await projectHold;await route.fulfill({json:checkedDates}).catch(()=>{});projectSettled();});
  await page.getByRole('button',{name:'แนะนำช่วงวันที่จากดาวเทียม',exact:true}).click();await projectRequested;
  await page.locator('.comparison-settings').getByRole('button',{name:'พับตั้งค่า',exact:true}).click();
  if(test.info().project.name==='mobile')await page.locator('.sheet-handle').click();
  await page.locator('.project-card').nth(1).click();
  await page.getByRole('button',{name:'เปิดตั้งค่า',exact:true}).click();
  releaseProject();await projectFinished;
  await expect(page.locator('.date-advisor-result')).toHaveCount(0);
  await expect(page.locator('.comparison-heading')).toContainText('FP-002');
});

test('no eligible dates stays honest and does not offer an insufficient pair as a recommendation',async({page})=>{
  await page.route('**/api/projects/FP-001/date-suggestions',route=>route.fulfill({json:{...checkedDates,checks:checkedDates.checks.filter(check=>!check.eligible),recommendations:[],message:'ยังไม่พบช่วงที่ผ่านเกณฑ์ในช่วงที่ตรวจ ข้อมูลขาดจะยังแสดงเป็นสีเทา',actions:['ลองเลือกปีอื่นที่มีภาพ หรือกลับมาตรวจเมื่อมีภาพใหม่']}}));
  await openAdvisor(page);
  await page.getByRole('button',{name:'แนะนำช่วงวันที่จากดาวเทียม',exact:true}).click();
  await expect(page.locator('.date-advisor-result')).toContainText('ยังไม่พบช่วงที่ผ่านเกณฑ์');
  await expect(page.locator('.date-advisor-result')).toContainText('ลองเลือกปีอื่น');
  await expect(page.getByRole('button',{name:'ใช้ช่วงวันที่นี้'})).toHaveCount(0);
  await expect(page.getByLabel('เริ่มช่วงฐาน',{exact:true})).toHaveValue('2025-07-13');
});

test('a permission failure explains access setup without promising better dates',async({page})=>{
  await page.route('**/api/projects/FP-001/date-suggestions',route=>route.fulfill({status:503,json:{detail:'การเชื่อมต่อหรือสิทธิ์ Earth Engine ยังไม่พร้อม',guidance:{code:'gee_access',message:'การเชื่อมต่อหรือสิทธิ์ Earth Engine ยังไม่พร้อม',actions:['ตรวจการยืนยันบัญชีและสิทธิ์ GEE project การเปลี่ยนวันที่ไม่แก้ปัญหาสิทธิ์'],suggest_dates:false}}}));
  await openAdvisor(page);
  await page.getByRole('button',{name:'แนะนำช่วงวันที่จากดาวเทียม',exact:true}).click();
  await expect(page.locator('.analysis-guidance')).toContainText('การเปลี่ยนวันที่ไม่แก้ปัญหาสิทธิ์');
  await expect(page.locator('.date-recommendation')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
