import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { connectDb } from '../../src/lib/db/client';
import { creativeAssets, rules } from '../../src/lib/db/schema';
import { mintMerchant, MERCHANT_COOKIE } from '../../src/lib/onboarding/links';
import { readMenu, publishDraft } from '../../src/lib/onboarding/service';
import { MENU, PHOTO, SETTINGS } from '../support/proof-s1';
import { syntheticDishPhoto } from '../support/proof-s5';
import { listOffers } from '../../src/lib/commitments/service';

for(const width of [1280,375])test(`S5 exact asset review, rejection, stale terms and private media at ${width}px`,async({page,context})=>{
 const configured=new URL(process.env.S1_ADMIN_URL??'http://missing.invalid');expect([configured.hostname,configured.port]).toEqual(['127.0.0.1','5432']);expect(configured.pathname).toMatch(/^\/backfill_t_proof_s1_browser_/);
 const evidence=process.env.S5_EVIDENCE_DIR;if(!evidence)throw Error('Use S5 isolated launcher');const app=connectDb(configured.toString(),2),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.setViewportSize({width,height:900});
  const owner=await mintMerchant(app.db,'SYNTHETIC LOCAL OFFER'),draft=await readMenu(app.db,owner.id,PHOTO,async()=>MENU,'fixture:s5-menu');if(!('draftId'in draft))throw Error('draft');const pub=await publishDraft(app.db,owner.id,draft.draftId,SETTINGS);if(pub.status!=='published')throw Error('publish');
  await context.addCookies([{name:MERCHANT_COOKIE,value:owner.token,domain:'127.0.0.1',path:'/merchant',httpOnly:true,sameSite:'Lax'}]);await page.goto('/merchant');
  const field=page.getByRole('group',{name:`Creative asset for offer ${pub.ruleId}`,exact:true});
  async function upload(background=false){await field.getByLabel('Dish photo',{exact:true}).setInputFiles({name:'authored-rectangle.png',mimeType:'image/png',buffer:await syntheticDishPhoto()});await field.getByLabel('Dish or object to isolate',{exact:true}).fill('synthetic rectangle');await field.getByLabel('Photo rights basis',{exact:true}).fill('Authored fixture');await field.getByLabel('I permit local processing and composition.',{exact:true}).check();await field.getByLabel('This uses synthetic local offer terms.',{exact:true}).check();if(background)await field.getByLabel('Add one optional Muse Image decorative background after separate call approval.',{exact:true}).check();await field.getByRole('button',{name:'Save photo privately',exact:true}).click();await expect(field.getByRole('button',{name:'Create dish cutout',exact:true})).toBeVisible();}
  async function compose(){await field.getByRole('button',{name:'Create dish cutout',exact:true}).click();await expect(field.getByRole('img',{name:'Real-photo cutout',exact:true})).toBeVisible();await expect(field.getByRole('button',{name:'Approve this exact asset',exact:true})).toHaveCount(0);await field.getByRole('button',{name:'Approve this cutout',exact:true}).click();await field.getByRole('button',{name:'Compose exact offer',exact:true}).click();await expect(field.getByRole('img',{name:'Composed asset',exact:true})).toBeVisible();}
  async function capture(name:string){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await field.screenshot({path:`${evidence}/${name}-${width}.png`});}
  await upload(true);await compose();await expect(field.getByText('Preview only.',{exact:false})).toBeVisible();await capture('review');
  const rows=await app.db.select().from(creativeAssets).where(eq(creativeAssets.ruleId,pub.ruleId));expect(rows).toHaveLength(1);const id=rows[0]?.id;if(!id)throw Error('missing asset');
  const media=await page.request.get(`/merchant/creative/${id}/composed`);expect(media.status()).toBe(200);expect(media.headers()['cache-control']).toContain('no-store');
  const [before]=await app.db.select().from(rules).where(eq(rules.id,pub.ruleId));
  await field.getByRole('button',{name:'Approve this exact asset',exact:true}).click();await expect(field.getByText('Approved for this exact asset',{exact:false})).toBeVisible();await capture('approved');await page.reload();await expect(field.getByText('Approval saved for offer v1',{exact:false})).toBeVisible();expect((await app.db.select().from(rules).where(eq(rules.id,pub.ruleId)))[0]).toEqual(before);
  const outsider=await mintMerchant(app.db,'Synthetic other owner');await context.addCookies([{name:MERCHANT_COOKIE,value:outsider.token,domain:'127.0.0.1',path:'/merchant',httpOnly:true,sameSite:'Lax'}]);expect((await page.request.get(`/merchant/creative/${id}/source`)).status()).toBe(404);
  await context.addCookies([{name:MERCHANT_COOKIE,value:owner.token,domain:'127.0.0.1',path:'/merchant',httpOnly:true,sameSite:'Lax'}]);
  await app.db.update(rules).set({discountBps:1500}).where(eq(rules.id,pub.ruleId));await page.reload();await expect(field.getByText('The offer terms changed.',{exact:false})).toBeVisible();await expect(field.getByRole('img')).toHaveCount(0);expect((await page.request.get(`/merchant/creative/${id}/composed`)).status()).toBe(404);await capture('stale');
  await upload();await field.getByRole('button',{name:'Create dish cutout',exact:true}).click();await field.getByRole('button',{name:'Reject asset',exact:true}).click();await expect(field.getByText('Rejected. Nothing was posted.',{exact:true})).toBeVisible();await expect(field.getByRole('button',{name:'Approve this exact asset',exact:true})).toHaveCount(0);await capture('rejected');
  expect((await listOffers(app.db)).some(o=>o.offer.ruleId===pub.ruleId)).toBe(true);expect(errors).toEqual([]);
  await writeFile(`${evidence}/browser-${width}.json`,JSON.stringify({width,assurance:'Authored photo geometry and model-boundary fixtures. Scripted owner review; no genuine SAM/Image inference or human approval.',ruleId:pub.ruleId,assetId:id,cases:['separate cutout approval','exact composition preview','exact final approval','reload persistence','wrong owner private media 404','no-store media','stale version invalidation','rejection','unchanged offer operation'],pageErrors:errors},null,2)+'\n');
 }finally{await app.close();}
});
