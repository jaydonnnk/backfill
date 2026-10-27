import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Whether the module at `moduleUrl` (its import.meta.url) is the script Node was started with.
// Node gives the main module its real path, with symlinks resolved and characters such as spaces
// percent-encoded, so argv[1] is resolved and encoded the same way before comparing; a plain
// `file://${argv[1]}` comparison is false through a symlink or a space, and the script silently
// does nothing.
export function isEntrypoint(moduleUrl: string, argv1: string | undefined = process.argv[1]): boolean {
  if (!argv1) return false;
  try {
    return moduleUrl === pathToFileURL(realpathSync(argv1)).href;
  } catch {
    return false;
  }
}
