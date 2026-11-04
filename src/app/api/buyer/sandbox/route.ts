import { webDb } from '@/lib/db/client';
import { sandboxHandler } from '@/lib/buyer/sandbox';
export const dynamic = 'force-dynamic';
export const POST = sandboxHandler(webDb);
