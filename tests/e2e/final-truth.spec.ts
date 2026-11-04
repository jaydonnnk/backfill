import {test,expect} from '@playwright/test';
import postgres from 'postgres';
test('public claims, diagnostics privacy, and pending merchant notice',async({page})=>{
 const db=postgres(process.env.MERCHANT_ACCESS_TEST_DATABASE_URL!,{max:1});
 try{await db`insert into llm_calls(provider,model,purpose,attempt,tokens_in,tokens_cached_in,tokens_out,cost_nano_usd,latency_ms,ok,output) values ('meta','muse-spark-1.3','negotiation',1,10,0,20,100,12,true,'PRIVATE_OUTPUT_CANARY')`;}finally{await db.end();}
 await page.goto('/evals');await expect(page.locator('main')).not.toContainText('runs the counter');await expect(page.locator('main')).not.toContainText('Buyers use their Muse agents');
 for(const text of ['Spark reads the menu. Code holds the line.','6 focal seats in 3 of 12 worlds','12 in 6 of 12','32 versus 48','live in the buyer sandbox','enabled for merchants with daily caps; one hosted test on a synthetic image'])await expect(page.locator('main')).toContainText(text);
 await expect(page.getByRole('navigation').first().getByRole('link',{name:'Demo',exact:true})).toBeVisible();
 await page.goto('/system');await expect(page.getByRole('table')).toContainText('negotiation');await expect(page.locator('body')).not.toContainText('PRIVATE_OUTPUT_CANARY');
 for(const text of ['voice','media','sandbox','US$0.0878'])await expect(page.locator('main')).toContainText(text);
 for(const width of [375,800])for(const path of ['/','/demo','/merchant']){
  await page.setViewportSize({width,height:900});await page.goto(path);await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await expect(page.locator('.kopi-bubble')).not.toBeVisible();
 }
 await page.goto('/merchant');await page.getByLabel('Café or restaurant name').fill('Pending truth fixture');await page.getByRole('button',{name:'Create my workspace',exact:true}).click();await expect(page).toHaveURL(/\/merchant\/access$/);
 const owner=postgres(process.env.MERCHANT_ACCESS_TEST_DATABASE_URL!,{max:1});
 try{await owner`insert into rules(merchant_id,list_price_cents,capacity_covers,weekday,start_minute,end_minute,commit_by_minute,discount_bps,min_pool_covers,per_agent_cap_covers,floor_price_cents) select id,680,200,2,840,1020,720,2000,4,4,500 from merchants where name='Pending truth fixture'`;}finally{await owner.end();}
 await page.goto('/merchant');await expect(page.getByText('Your offer is awaiting a quick review before buyer agents can see it.',{exact:true})).toBeVisible();
 await expect(page.getByText('Open to commitments',{exact:true})).not.toBeVisible();
 for(const width of [375,800]){await page.setViewportSize({width,height:900});await expect(page.locator('.kopi-bubble')).not.toBeVisible();}
});
