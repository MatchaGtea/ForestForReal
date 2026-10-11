import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.goto('/');await expect(page.locator('.project-card')).toHaveCount(10);});

test('project search clears conflicts and selects correct boundary',async({page})=>{
  await page.getByRole('button',{name:'เลือกพื้นที่'}).click();
  await page.getByLabel('จังหวัด',{exact:true}).selectOption('10');
  await expect(page.locator('.project-card')).toHaveCount(0);
  await page.getByLabel('ค้นหาโครงการหรือบริษัท').fill('FP-003');
  await page.locator('.suggestions button').first().click();
  await expect(page.locator('.detail-title h2')).toContainText('ภูหลวง');
  await expect(page.locator('.project-card.selected')).toContainText('FP-003');
  await expect(page.getByLabel('จังหวัด',{exact:true})).toHaveValue('');
  await expect(page.locator('.project-card')).toHaveCount(10);
  await expect(page.locator('.map svg path')).not.toHaveCount(0);
});

test('company selection fits all locations',async({page})=>{
  await page.getByLabel('ค้นหาโครงการหรือบริษัท').fill('ใบไม้วันใหม่');
  await page.locator('.suggestions button').last().click();
  await expect(page.locator('.project-card')).toHaveCount(3);
  await expect(page.locator('.leaflet-overlay-pane svg path[fill-opacity="1"]')).toHaveCount(3);
  await expect(page.locator('.detail')).toHaveCount(0);
});

test('map marker and list select the same project',async({page})=>{
  await page.locator('.leaflet-overlay-pane svg path[fill-opacity="1"]').nth(2).click();
  await expect(page.locator('.detail-title h2')).toContainText('ภูหลวง');
  await expect(page.locator('.project-card.selected')).toContainText('FP-003');
});

test('administrative cascade and list selection',async({page})=>{
  await page.getByRole('button',{name:'เลือกพื้นที่'}).click();
  await page.getByLabel('จังหวัด',{exact:true}).selectOption('50');
  await expect(page.locator('.project-card')).toHaveCount(2);
  await page.getByLabel('อำเภอ',{exact:true}).selectOption('5001');
  await expect(page.getByLabel('ตำบล',{exact:true}).locator('option')).not.toHaveCount(1);
  await page.getByLabel('ตำบล',{exact:true}).selectOption('500114');
  await page.getByLabel('จังหวัด',{exact:true}).selectOption('55');
  await expect(page.getByLabel('อำเภอ',{exact:true})).toHaveValue('');
  await expect(page.getByLabel('ตำบล',{exact:true})).toHaveValue('');
  await expect(page.getByLabel('ตำบล',{exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'เลือกพื้นที่'}).click();
  await page.locator('.project-card').first().click();
  await expect(page.locator('.detail-title h2')).toContainText('ดอยภูคา');
  await expect(page.locator('.project-card.selected')).toHaveCount(1);
});

test('missing credentials displays an honest unavailable message',async({page})=>{
  await page.route('**/api/analysis',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'ยังไม่ได้ยืนยันสิทธิ์ Earth Engine'})}));
  await page.locator('.project-card').first().click();
  await page.getByRole('button',{name:'เริ่มวิเคราะห์พื้นที่'}).click();
  await expect(page.getByRole('alert')).toContainText('ยังไม่ได้ยืนยันสิทธิ์');
  await expect(page.locator('.results')).toHaveCount(0);
});

test('responsive view and keyboard selection',async({page})=>{
  const card=page.locator('.project-card').first();await card.focus();await page.keyboard.press('Enter');
  await expect(page.locator('.detail-title h2')).toContainText('ดอยสุเทพ');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(test.info().project.name==='mobile'){
    await expect.poll(async()=>{const marker=await page.locator('.leaflet-overlay-pane svg path[fill-opacity="1"]').first().boundingBox();const sheet=await page.locator('.sheet-handle').boundingBox();return !!marker&&!!sheet&&marker.y+marker.height<sheet.y;}).toBe(true);
  }
  const analysis=page.getByRole('button',{name:'เริ่มวิเคราะห์พื้นที่'});await analysis.scrollIntoViewIfNeeded();await expect(analysis).toBeVisible();
  await page.screenshot({path:`test-results/${test.info().project.name}-detail.png`,fullPage:true});
});
