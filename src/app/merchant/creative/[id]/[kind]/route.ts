import { currentMerchant } from '../../../session';
import { webDb } from '@/lib/db/client';
import { readCreativeMedia } from '@/lib/creative/service';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string;kind:string}>}){
  const owner=await currentMerchant();
  const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"};
  if(!owner)return new Response(null,{status:404,headers});
  const {id,kind}=await params,media=await readCreativeMedia(webDb(),owner.id,id,kind);
  if(!media)return new Response(null,{status:404,headers});
  return new Response(new Uint8Array(media.bytes),{headers:{...headers,'Content-Type':media.type,'Content-Disposition':'inline'}});
}
