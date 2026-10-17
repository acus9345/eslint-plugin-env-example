import fs from "node:fs";
import path from "node:path";

/** Default file name looked up when the `envFile` option is not set. */
export const DEFAULT_ENV_FILE = ".env.example";

/**
 * Matches `KEY=value`, `export KEY=value`, a bare `KEY`, and the same lines
 * commented out with `#` (a common way to document optional variables).
 */
const LINE = /^\s*(#\s*)?(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*(=|$)/;

/**
 * Parses the text of a dotenv-style file and returns the declared variable names.
 *
 * - `KEY=value`, `export KEY=value` and a bare `KEY` declare `KEY`.
 * - `# KEY=value` (a commented-out assignment) also declares `KEY`, so optional
 *   variables can stay documented without being set.
 * - Other comments, blank lines, a UTF-8 BOM and CRLF line endings are ignored.
 *
 * @param {string} text Contents of the file.
 * @returns {Set<string>} Declared variable names.
 */
export function parseEnvNames(text) {
  /** @type {Set<string>} */
  const names = new Set();
  for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const match = LINE.exec(raw);
    if (!match) continue;
    const [, commented, name, eq] = match;
    // A comment line only counts when it looks like an assignment (`# KEY=`),
    // so prose such as "# Required" is not mistaken for a variable.
    if (commented && eq !== "=") continue;
    names.add(name);
  }
  return names;
}

/**
 * Decodes file bytes as UTF-8, or as UTF-16 when the file starts with a UTF-16 byte order
 * mark (what `echo KEY= > .env.example` produces in Windows PowerShell 5.1).
 *
 * @param {Buffer} bytes
 * @returns {string}
 */
function decode(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.toString("utf16le");
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.from(bytes.subarray(0, bytes.length - (bytes.length % 2))).swap16();
    return swapped.toString("utf16le");
  }
  return bytes.toString("utf8");
}

/** @type {Map<string, { mtimeMs: number, size: number, names: Set<string> }>} */
const cache = new Map();

/**
 * Reads and parses an env file, reusing the previous result while the file is unchanged.
 *
 * @param {string} file Absolute path to the file.
 * @returns {{ ok: true, names: Set<string> } | { ok: false, reason: string }}
 */
export function readEnvFile(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return { ok: false, reason: "the file does not exist" };
  }
  if (!stat.isFile()) return { ok: false, reason: "the path is not a file" };

  const hit = cache.get(file);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) {
    return { ok: true, names: hit.names };
  }
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch (error) {
    const code = /** @type {NodeJS.ErrnoException} */ (error).code ?? "unknown error";
    return { ok: false, reason: `it could not be read (${code})` };
  }
  const names = parseEnvNames(decode(bytes));
  cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, names });
  return { ok: true, names };
}

/**
 * Finds the nearest file called `fileName`, starting in `startDir` and walking up
 * to the filesystem root.
 *
 * @param {string} startDir Directory to start in.
 * @param {string} [fileName] File name to look for. Defaults to `.env.example`.
 * @returns {string | null} Absolute path to the file, or `null` if none was found.
 */
export function findEnvFile(startDir, fileName = DEFAULT_ENV_FILE) {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, fileName);
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Not here; keep walking up.
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
