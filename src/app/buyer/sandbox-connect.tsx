'use client';
import { useState } from 'react';
export function SandboxConnect({token}:{token:string}) {
 const [copied,setCopied]=useState(false);
 return <details><summary>Use your own agent</summary><p className="buyer-fine">Add this site&apos;s /mcp endpoint to your agent, with the sandbox token as its bearer credential. {token ? 'This credential can access only synthetic sandbox offers.' : 'Sandbox export is available only for a credential created by this page. A manually entered credential is not exported here.'}</p><button className="button" disabled={!token} onClick={async()=>{try{await navigator.clipboard.writeText(token);setCopied(true);}catch{setCopied(false);}}}>Copy sandbox token</button>{copied&&<p role="status">Token copied.</p>}<p className="buyer-fine">Use the example first to create a token. It stays in this page&apos;s memory. Agent actions are not proof of a real person&apos;s consent.</p></details>;
}
