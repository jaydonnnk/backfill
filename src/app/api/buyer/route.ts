import { webDb } from '@/lib/db/client';
import { buyerDeps } from '@/lib/buyer/deps';
import { buyerHandler } from '@/lib/buyer/http';
export const dynamic = 'force-dynamic';
export const POST = buyerHandler(webDb, buyerDeps);
export const GET = POST;
