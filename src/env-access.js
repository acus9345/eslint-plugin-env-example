/**
 * Shared AST helpers that recognise environment-variable reads.
 *
 * Recognised sources: `process.env`, `import.meta.env`, `Bun.env` and `Deno.env.get()`.
 */

/** @typedef {import("estree").Node} Node */
/** @typedef {import("estree").MemberExpression} MemberExpression */
/** @typedef {import("estree").CallExpression} CallExpression */
/** @typedef {import("eslint").Rule.Node} RuleNode */

/**
 * @typedef {object} EnvRead
 * @property {string | null} name Variable name, or `null` when the key is computed at runtime.
 * @property {string} source Human-readable source, e.g. `process.env`.
 * @property {Node} node Node to report on.
 */

/**
 * Returns the static name of a member property (`a.b`, `a["b"]`, ``a[`b`]``), or `null`.
 *
 * @param {MemberExpression} node
 * @returns {string | null}
 */
function memberName(node) {
  const { property } = node;
  if (!node.computed && property.type === "Identifier") return property.name;
  return staticString(property);
}

/**
 * Returns the value of a string literal or an expression-free template literal, or `null`.
 *
 * @param {Node | undefined} node
 * @returns {string | null}
 */
function staticString(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null;
  }
  return null;
}

/**
 * @param {Node} node
 * @param {string} name
 * @returns {boolean}
 */
function isIdentifier(node, name) {
  return node.type === "Identifier" && node.name === name;
}

/**
 * Unwraps optional-chain wrappers and TypeScript assertion/cast wrappers around an expression.
 *
 * @param {Node} node
 * @returns {Node}
 */
function unwrap(node) {
  let current = node;
  while (
    current.type === "ChainExpression" ||
    /** @type {string} */ (current.type) === "TSNonNullExpression" ||
    /** @type {string} */ (current.type) === "TSAsExpression" ||
    /** @type {string} */ (current.type) === "TSSatisfiesExpression" ||
    /** @type {string} */ (current.type) === "TSTypeAssertion"
  ) {
    current = /** @type {{ expression: Node }} */ (/** @type {unknown} */ (current)).expression;
  }
  return current;
}

/**
 * If `node` is an env object (`process.env`, `import.meta.env`, `Bun.env`), returns its
 * display name; otherwise `null`.
 *
 * @param {Node} node
 * @returns {string | null}
 */
export function envObjectName(node) {
  const target = unwrap(node);
  if (target.type !== "MemberExpression" || memberName(target) !== "env") return null;
  const object = unwrap(target.object);
  if (isIdentifier(object, "process")) return "process.env";
  if (isIdentifier(object, "Bun")) return "Bun.env";
  if (
    object.type === "MetaProperty" &&
    object.meta.name === "import" &&
    object.property.name === "meta"
  ) {
    return "import.meta.env";
  }
  return null;
}

/**
 * True when `node` is the write target of an assignment, destructuring assignment, or
 * `for..in` / `for..of` header.
 *
 * @param {MemberExpression} node
 * @returns {boolean}
 */
function isAssignmentTarget(node) {
  let current = /** @type {RuleNode} */ (/** @type {unknown} */ (node));
  for (;;) {
    const parent = current.parent;
    if (!parent) return false;
    if (
      (parent.type === "AssignmentExpression" ||
        parent.type === "ForInStatement" ||
        parent.type === "ForOfStatement") &&
      parent.left === current
    ) {
      return true;
    }
    if (
      (parent.type === "Property" && parent.value === current) ||
      parent.type === "ArrayPattern" ||
      parent.type === "ObjectPattern" ||
      (parent.type === "AssignmentPattern" && parent.left === current) ||
      parent.type === "RestElement"
    ) {
      current = parent;
      continue;
    }
    return false;
  }
}

/**
 * True when the member expression is being written to or deleted rather than read
 * (`process.env.X = 1`, `({ a: process.env.X } = obj)`, `process.env.X++`, `delete process.env.X`).
 *
 * @param {MemberExpression} node
 * @returns {boolean}
 */
function isWrite(node) {
  const parent = /** @type {RuleNode} */ (/** @type {unknown} */ (node)).parent;
  if (!parent) return false;
  if (parent.type === "UpdateExpression") return true;
  if (parent.type === "UnaryExpression" && parent.operator === "delete") return true;
  return isAssignmentTarget(node);
}

/**
 * Describes the env read made by a `MemberExpression` such as `process.env.FOO`.
 * Returns `null` when the node is not an env read.
 *
 * @param {MemberExpression} node
 * @returns {EnvRead | null}
 */
export function readFromMember(node) {
  const source = envObjectName(node.object);
  if (!source || isWrite(node)) return null;
  return { name: memberName(node), source, node };
}

/**
 * Describes the env reads made by destructuring an env object, e.g.
 * `const { FOO, BAR: bar } = process.env`. Rest elements are skipped.
 *
 * @param {import("estree").ObjectPattern} pattern
 * @param {Node | null | undefined} init The value being destructured.
 * @returns {EnvRead[]}
 */
export function readsFromPattern(pattern, init) {
  const source = init ? envObjectName(init) : null;
  if (!source) return [];
  /** @type {EnvRead[]} */
  const reads = [];
  for (const prop of pattern.properties) {
    if (prop.type !== "Property") continue;
    const name =
      !prop.computed && prop.key.type === "Identifier" ? prop.key.name : staticString(prop.key);
    reads.push({ name, source, node: prop.key });
  }
  return reads;
}

/**
 * Describes the env read made by `Deno.env.get("FOO")`. Returns `null` for other calls.
 *
 * @param {CallExpression} node
 * @returns {EnvRead | null}
 */
export function readFromCall(node) {
  const callee = unwrap(node.callee);
  if (callee.type !== "MemberExpression" || memberName(callee) !== "get") return null;
  const object = unwrap(callee.object);
  if (
    object.type !== "MemberExpression" ||
    memberName(object) !== "env" ||
    !isIdentifier(unwrap(object.object), "Deno")
  ) {
    return null;
  }
  const arg = node.arguments[0];
  return {
    name: arg && arg.type !== "SpreadElement" ? staticString(arg) : null,
    source: "Deno.env.get()",
    node: arg ?? node,
  };
}

/**
 * Builds a rule visitor that calls `onRead` for every env read in the file.
 *
 * @param {(read: EnvRead) => void} onRead
 * @returns {import("eslint").Rule.RuleListener}
 */
export function envReadVisitor(onRead) {
  return {
    MemberExpression(node) {
      const read = readFromMember(node);
      if (read) onRead(read);
    },
    CallExpression(node) {
      const read = readFromCall(node);
      if (read) onRead(read);
    },
    VariableDeclarator(node) {
      if (node.id.type === "ObjectPattern") readsFromPattern(node.id, node.init).forEach(onRead);
    },
    AssignmentExpression(node) {
      if (node.left.type === "ObjectPattern") readsFromPattern(node.left, node.right).forEach(onRead);
    },
    AssignmentPattern(node) {
      if (node.left.type === "ObjectPattern") readsFromPattern(node.left, node.right).forEach(onRead);
    },
  };
}
