'use client';
import { useState } from 'react';
export function SandboxConnect({token}:{token:string}) {
 const [copied,setCopied]=useState(false);
 return <details className="space-y-3 break-words"><summary>Use your own agent</summary><p>Add this site&apos;s /mcp endpoint to your agent, with the sandbox token as its bearer credential. This credential can access only synthetic sandbox offers.</p><button disabled={!token} onClick={async()=>{try{await navigator.clipboard.writeText(token);setCopied(true);}catch{setCopied(false);}}}>Copy sandbox token</button>{copied&&<p role="status">Token copied.</p>}<p>Use the example first to create a token. It stays in this page&apos;s memory. Agent actions are not proof of a real person&apos;s consent.</p></details>;
}
