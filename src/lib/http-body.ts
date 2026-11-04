// A request body up to maxBytes, or null past it. Counts what arrives, not what Content-Length says.
export async function readBounded(req: Request, maxBytes: number): Promise<Uint8Array | null> {
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) return Buffer.concat(chunks);
    size += part.value.length;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(part.value);
  }
}
