import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,readFile,readdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {parseEnv} from 'node:util';
import postgres from 'postgres';
import {z} from 'zod';
import {PRICES_NANO_USD_PER_TOKEN} from '../../src/integrations/meta/pricing';
import {connectDb} from '../../src/lib/db/client';
import {isEntrypoint} from '../../src/lib/entrypoint';
import {createTestDatabase} from '../../tests/support/db';
import {comparePricing} from './proof-s6-comparison';
import {parseCaseSet} from './proof-s6-policy';
import {createPricingSession,durableJson,maximumRequests,S6_APPROVAL,S6_ENDPOINT,S6_LIMITS,sha256,syncDirectory} from './proof-s6-live-contract';

const PREP='docs/plans/backfill-proof/evidence/s6-live-preparation-2026-11-04';
const OUTPUT='docs/plans/backfill-proof/evidence/s6-live-authorized-2026-11-04-01';
const CASES='docs/plans/backfill-proof/s6-cases.json';
const CASE_HASH='5b148931137ad9b5072e05adf24fb564117763c70855a34ec80a79701b4c4e7c';
const Manifest=z.strictObject({version:z.literal('s6-live-1'),preparedAt:z.iso.datetime(),caseFileSha256:z.literal(CASE_HASH),files:z.array(z.strictObject({path:z.string().regex(/^(src\/|drizzle\/|tests\/support\/|scripts\/verification\/proof-s6-|package(?:-lock)?\.json$|tsconfig\.json$|docs\/plans\/backfill-proof\/s6-cases\.json$)/u),sha256:z.string().regex(/^[0-9a-f]{64}$/u)})).min(20)});
export function checkExecution(approval:unknown,configured:unknown){
 assert.equal(approval,S6_APPROVAL,'S6 pricing approval required');
 return localDatabase(configured);
}
function localDatabase(configured:unknown){
 assert(typeof configured==='string','Explicit local TEST_DATABASE_URL required');
 const url=new URL(configured);
 assert.deepEqual([url.protocol,url.hostname,url.port,url.pathname,url.search,url.hash],['postgres:','127.0.0.1','5432','/postgres','',''],'Explicit local TEST_DATABASE_URL required');return url;
}
async function sourcePaths(){
 const paths=[CASES,'package.json','package-lock.json','tsconfig.json','scripts/verification/proof-s6-live.ts','scripts/verification/proof-s6-live-contract.ts','scripts/verification/proof-s6-comparison.ts','scripts/verification/proof-s6-offline.ts','scripts/verification/proof-s6-policy.ts'];
 for(const dir of ['src','drizzle','tests/support']){
  for(const entry of await readdir(dir,{recursive:true,withFileTypes:true}))if(entry.isFile()&&/\.(ts|tsx|json|sql)$/u.test(entry.name))paths.push(join(entry.parentPath,entry.name));
 }
 return paths.sort();
}
async function frozenCases(){const b=await readFile(CASES);assert.equal(sha256(b),CASE_HASH,'Frozen cases changed');const data=parseCaseSet(JSON.parse(b.toString('utf8')));assert.equal(maximumRequests(data),16);return data;}
export function verifyManifestPin(bytes:Uint8Array,expectedSha256:string){assert.equal(sha256(bytes),expectedSha256,'Prepared manifest replaced');}
async function verifyPrepared(expectedSha256?:string){
 const bytes=await readFile(join(PREP,'source-manifest.json')),manifest=Manifest.parse(JSON.parse(bytes.toString('utf8')));
 if(expectedSha256)verifyManifestPin(bytes,expectedSha256);
 assert.deepEqual(manifest.files.map(f=>f.path).sort(),await sourcePaths(),'Source file set changed');
 for(const file of manifest.files)assert.equal(sha256(await readFile(file.path)),file.sha256,`Source changed: ${file.path}`);
 assert.deepEqual(PRICES_NANO_USD_PER_TOKEN['muse-spark-1.3'],{input:1250,cachedInput:150,output:4250},'Recheck pricing');
 const calculated=16*(S6_LIMITS.contextTokens*1250+1024*4250)/1e9;
 assert.equal(calculated,S6_LIMITS.maximumCalculatedUsd);assert(calculated<=S6_LIMITS.ceilingUsd);
 return {manifestSha256:sha256(bytes),data:await frozenCases()};
}
async function prepare(){
 await frozenCases();const files=await Promise.all((await sourcePaths()).map(async path=>({path,sha256:sha256(await readFile(path))})));
 const manifest=Manifest.parse({version:'s6-live-1',preparedAt:new Date().toISOString(),caseFileSha256:CASE_HASH,files});
 await mkdir(PREP,{recursive:true});await durableJson(join(PREP,'source-manifest.json'),manifest);
 const prepared=await verifyPrepared();
 await durableJson(join(PREP,'contract.json'),{version:'s6-live-1',approved:false,model:'muse-spark-1.3',endpoint:S6_ENDPOINT,limits:S6_LIMITS,manifestSha256:prepared.manifestSha256,caseFileSha256:CASE_HASH,pricing:{inputUsdPerMillion:1.25,outputUsdPerMillion:4.25,cachedInputUsdPerMillion:0.15,source:'https://dev.meta.ai/docs/pricing-rate-limits',verifiedOn:'2026-11-04',contextSource:'https://dev.meta.ai/docs/models',completionLimitSource:'https://dev.meta.ai/docs/api-reference/chat-completions/schemas',invoiceCostUsd:null},retryPolicy:'No retries, polling, fallback, tools, search, or other models. Reserve full maximum per dispatched request, including failures.',approvalEnvironmentName:'BACKFILL_S6_PRICING_APPROVED',approvalValue:S6_APPROVAL,output:OUTPUT});
 console.log(JSON.stringify({prepared:true,approved:false,...S6_LIMITS,manifestSha256:prepared.manifestSha256,newInferenceCalls:0}));
}
export async function cleanupLocalWorlds(args:{configured:URL;output:string;role:string;roleCreated:boolean;databases:Pick<Awaited<ReturnType<typeof createTestDatabase>>,'url'|'drop'>[];clients:{close:()=>Promise<void>}[];requestsDispatched:number}){
 const failures:string[]=[];
 const closes=await Promise.allSettled(args.clients.map(c=>c.close()));closes.forEach((r,i)=>{if(r.status==='rejected')failures.push(`client_${i}`);});
 const drops=await Promise.allSettled(args.databases.map(d=>d.drop()));drops.forEach((r,i)=>{if(r.status==='rejected')failures.push(`database_${i}`);});
 const admin=postgres(args.configured.toString(),{max:1,onnotice:()=>{}});let ownedRolesRemaining:number|null=null,ownedDatabasesRemaining:number|null=null;
 try{
  if(args.roleCreated)try{await admin.unsafe(`DROP ROLE IF EXISTS ${args.role}`);}catch{failures.push('role');}
  try{
   const roles=await admin`select rolname from pg_roles where rolname=${args.role}`;ownedRolesRemaining=roles.length;
   const names=args.databases.map(d=>new URL(d.url).pathname.slice(1));
   const remaining=names.length?await admin`select datname from pg_database where datname in ${admin(names)}`:[];ownedDatabasesRemaining=remaining.length;
  }catch{failures.push('verification');}
 }finally{await admin.end({timeout:5}).catch(()=>{failures.push('admin_close');});}
 await durableJson(join(args.output,'cleanup.json'),{ownedRolesRemaining,ownedDatabasesRemaining,failures,requestsDispatched:args.requestsDispatched,productionChanges:false});
 assert(failures.length===0&&ownedRolesRemaining===0&&ownedDatabasesRemaining===0,'S6 cleanup failed');
}
async function execute(provenance:'live_meta'|'scripted_offline_transport'){
 const live=provenance==='live_meta';
 const configured=live?checkExecution(process.env.BACKFILL_S6_PRICING_APPROVED,process.env.TEST_DATABASE_URL):localDatabase(process.env.TEST_DATABASE_URL);
 assert.equal(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore'}).format(new Date()),'2026-11-04','Recheck current pricing and prepare a fresh dated approval');
 const prepared=await verifyPrepared();
 const upstream:typeof fetch=live?globalThis.fetch.bind(globalThis):async()=>new Response(JSON.stringify({id:'scripted-offline-rehearsal',choices:[{message:{content:'{"priceCents":544,"rationale":"Scripted holding policy for offline rehearsal"}'}}],usage:{prompt_tokens:100,completion_tokens:20}}));
 globalThis.fetch=async()=>{throw Error('Only the guarded S6 transport may use HTTP');};
 const output=live?OUTPUT:join(PREP,'rehearsal-02');await mkdir(output);await syncDirectory(dirname(output));
 await durableJson(join(output,'run-consumed.json'),{authority:live?S6_APPROVAL:null,approved:live,provenance,manifestSha256:prepared.manifestSha256,caseFileSha256:CASE_HASH,startedAt:new Date().toISOString(),consumed:true,limits:S6_LIMITS,productionAccess:false});
 const databases:Awaited<ReturnType<typeof createTestDatabase>>[]=[],clients:ReturnType<typeof connectDb>[]=[];
 const role='backfill_t_s6_live_'+randomBytes(4).toString('hex');let roleCreated=false,stage='credentials';
 let session:ReturnType<typeof createPricingSession>|undefined;
 try{
  const apiKey=live?z.string().min(1).parse(parseEnv(await readFile('.env.local','utf8')).META_API_KEY):'offline-dummy';
  stage='local_databases';
  for(const label of ['s6_live_fixed','s6_live_model'])databases.push(await createTestDatabase(label));
  const admin=postgres(configured.toString(),{max:1,onnotice:()=>{}});
  try{roleCreated=true;await admin.unsafe(`CREATE ROLE ${role} LOGIN IN ROLE backfill_app`);}finally{await admin.end({timeout:5});}
  for(const db of databases){const url=new URL(db.url);url.username=role;clients.push(connectDb(url.toString(),4));}
  const [baselineDb,modelDb]=databases,[baseline,model]=clients;assert(baselineDb&&modelDb&&baseline&&model);
  session=createPricingSession({directory:output,upstream,apiKey,verifySources:async()=>{await verifyPrepared(prepared.manifestSha256);}});
  stage='comparison';
  const result=await comparePricing({data:prepared.data,baseline:{db:baseline.db,admin:baselineDb.db},model:{db:model.db,admin:modelDb.db},session,provenance,save:async(id,value)=>durableJson(join(output,id+'.json'),value)});
  await durableJson(join(output,'summary.json'),{...result.summary,manifestSha256:prepared.manifestSha256,caseFileSha256:CASE_HASH,limits:S6_LIMITS});
  stage='final_source_check';await verifyPrepared(prepared.manifestSha256);
  console.log(JSON.stringify(result.summary));
 }catch(error){
  await durableJson(join(output,'failure.json'),{stage,errorName:error instanceof Error?error.name:'Error',requestsDispatched:session?.dispatched()??0,consumed:true,automaticRetries:0});throw error;
 }finally{
  await cleanupLocalWorlds({configured,output,role,roleCreated,databases,clients,requestsDispatched:session?.dispatched()??0});
 }
}
async function main(){
 const args=process.argv.slice(2);assert(args.length<=1&&args.every(a=>['--prepare','--check','--execute','--rehearse'].includes(a)),'Use --prepare, --check, --rehearse or --execute');
 if(args[0]==='--prepare')await prepare();
 else if(args[0]==='--execute')await execute('live_meta');
 else if(args[0]==='--rehearse')await execute('scripted_offline_transport');
 else{const prepared=await verifyPrepared();console.log(JSON.stringify({preflight:true,approved:false,manifestSha256:prepared.manifestSha256,newInferenceCalls:0,credentialReads:0,databaseAccess:false}));}
}
if(isEntrypoint(import.meta.url))main().catch(()=>{console.error('S6 pricing stopped. Check retained receipts. No automatic retry is permitted.');process.exitCode=1;});
