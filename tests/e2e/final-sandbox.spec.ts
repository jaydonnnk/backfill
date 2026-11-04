import { test, expect } from '@playwright/test';
import postgres from 'postgres';

test('a visitor completes a synthetic buyer round and can connect their own agent',async({page})=>{
 await page.setViewportSize({width:375,height:900});
 await page.goto('/');await page.getByRole('link',{name:'Try it as a buyer',exact:true}).click();
 await expect(page.getByLabel('Buyer credential',{exact:true})).not.toBeVisible();
 await page.getByRole('button',{name:'Use example',exact:true}).click();
 await expect(page.getByLabel('Your request',{exact:true})).toHaveValue(/Table for 2 on \d{4}-\d{2}-\d{2}, between 14:00 and 17:00, up to S\$6 per person/);
 await page.getByRole('button',{name:'Save request',exact:true}).click();
 await page.getByRole('button',{name:'Ask hosted Glimmer',exact:true}).click();
 await expect(page.getByText('Glimmer:',{exact:false})).toContainText('nvidia_nim');
 await page.getByRole('button',{name:'Save reviewed constraints',exact:true}).click();
 await page.getByRole('button',{name:'Ask Spark Open for a decision',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Decision for this party'})).toBeVisible();
 await expect(page.getByText('via vercel_gateway',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Approve these exact terms',exact:true}).click();
 await page.getByRole('button',{name:'Submit approved commitment',exact:true}).click();
 await expect(page.getByText('Pooled covers:',{exact:false})).toContainText('2 / 4');
 await page.getByText('Use your own agent',{exact:true}).click();
 await expect(page.getByRole('button',{name:'Copy sandbox token',exact:true})).toBeVisible();
 await expect(page.getByText('/mcp',{exact:false}).last()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
for(const scenario of ['time','provider'])test(`${scenario} failure leaves no commitment`,async({page})=>{
 await page.goto('/buyer');await page.getByRole('button',{name:'Use example',exact:true}).click();
 await expect(page.getByLabel('Your request',{exact:true})).toHaveValue(/Table for 2 on/);
 if(scenario==='provider')await page.getByLabel('Your request',{exact:true}).fill('provider-failure');
 await page.getByRole('button',{name:'Save request',exact:true}).click();
 await page.getByRole('button',{name:'Ask hosted Glimmer',exact:true}).click();
 if(scenario==='provider')await expect(page.locator('main').getByRole('status')).toContainText('model is unavailable');
 else{
  await page.getByLabel('Earliest arrival',{exact:true}).fill('15:00');
  await page.getByRole('button',{name:'Save reviewed constraints',exact:true}).click();
  await page.getByRole('button',{name:'Ask Spark Open for a decision',exact:true}).click();
  await expect(page.locator('main').getByRole('status')).toContainText('This offer runs 14:00-17:00. Widen your time window or use the example.');
 }
 const db=postgres(process.env.MERCHANT_ACCESS_TEST_DATABASE_URL!,{max:1});
 try{const rows=await db`select record from buyer_sessions order by created_at desc limit 1`;const id=rows[0]?.record.partyId;expect(await db`select id from commitments where agent_id=${id}`).toHaveLength(0);}finally{await db.end();}
});
