import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { ESLint } from "eslint";
import plugin from "../src/index.js";
import { findEnvFile, parseEnvNames, readEnvFile } from "../src/env-file.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "env-example-file-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("parseEnvNames", () => {
  it("reads assignments, export, bare names and commented assignments", () => {
    const names = parseEnvNames(
      [
        "A=1",
        "  B = two words ",
        "export C=3",
        "D",
        "#E=",
        "  # F = x",
        "# Prose line",
        "# G",
        "not a var line",
        "H.I-J=dotted",
        "",
      ].join("\n"),
    );
    assert.deepEqual([...names].sort(), ["A", "B", "C", "D", "E", "F", "H.I-J"]);
  });

  it("handles empty input, BOM and CRLF", () => {
    assert.equal(parseEnvNames("").size, 0);
    assert.equal(parseEnvNames("\n\r\n   \n").size, 0);
    assert.deepEqual([...parseEnvNames("\uFEFFA=1\r\nB=2\r\n")], ["A", "B"]);
  });

  it("ignores lines that start with a digit or symbol", () => {
    assert.equal(parseEnvNames("1A=1\n-B=2\n=C\n$D=1").size, 0);
  });

  it("parses a large file quickly", () => {
    const text = Array.from({ length: 50_000 }, (_, i) => `VAR_${i}=value_${i}`).join("\n");
    const start = performance.now();
    const names = parseEnvNames(text);
    assert.equal(names.size, 50_000);
    assert.ok(performance.now() - start < 1000);
  });
});

describe("readEnvFile / findEnvFile", () => {
  it("re-reads the file after it changes", () => {
    const file = path.join(tmp, "changing.env");
    fs.writeFileSync(file, "A=1\n");
    const first = readEnvFile(file);
    assert.ok(first.ok && first.names.has("A"));
    fs.writeFileSync(file, "A=1\nBB=2\n");
    const second = readEnvFile(file);
    assert.ok(second.ok && second.names.has("BB"));
  });

  it("reads UTF-16 files written by Windows PowerShell", () => {
    const le = path.join(tmp, "le.env");
    fs.writeFileSync(le, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("LE_A=1\r\nLE_B=\r\n", "utf16le")]));
    const be = path.join(tmp, "be.env");
    fs.writeFileSync(be, Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from("BE_A=1\n", "utf16le").swap16()]));
    const leResult = readEnvFile(le);
    const beResult = readEnvFile(be);
    assert.ok(leResult.ok && beResult.ok);
    assert.deepEqual([...leResult.names], ["LE_A", "LE_B"]);
    assert.deepEqual([...beResult.names], ["BE_A"]);
  });

  it("reports missing files and directories", () => {
    assert.deepEqual(readEnvFile(path.join(tmp, "nope")), {
      ok: false,
      reason: "the file does not exist",
    });
    assert.deepEqual(readEnvFile(tmp), { ok: false, reason: "the path is not a file" });
  });

  it("walks up to the nearest file and returns null at the root", () => {
    const deep = path.join(tmp, "a", "b", "c");
    fs.mkdirSync(deep, { recursive: true });
    assert.equal(findEnvFile(deep), null);
    fs.writeFileSync(path.join(tmp, "a", ".env.example"), "X=1\n");
    assert.equal(findEnvFile(deep), path.join(tmp, "a", ".env.example"));
  });
});

describe("plugin with ESLint", () => {
  it("exposes meta, rules and a recommended config", () => {
    assert.equal(plugin.meta.name, "eslint-plugin-env-example");
    assert.match(plugin.meta.version, /^\d+\.\d+\.\d+/);
    assert.deepEqual(Object.keys(plugin.rules).sort(), ["no-dynamic-env", "no-undeclared-env"]);
    assert.equal(plugin.configs.recommended.plugins?.["env-example"], plugin);
  });

  it("lints a project end to end with the recommended config", async () => {
    const project = path.join(tmp, "project");
    fs.mkdirSync(project);
    fs.writeFileSync(path.join(project, ".env.example"), "API_URL=\n");
    const eslint = new ESLint({
      cwd: project,
      overrideConfigFile: true,
      overrideConfig: [plugin.configs.recommended],
    });
    const [result] = await eslint.lintText(
      "process.env.API_URL; process.env.SECRET; process.env[k];",
      { filePath: path.join(project, "index.js") },
    );
    const found = result.messages.map((m) => [m.ruleId, m.severity]);
    assert.deepEqual(found, [
      ["env-example/no-undeclared-env", 2],
      ["env-example/no-dynamic-env", 1],
    ]);
    assert.match(result.messages[0].message, /"SECRET" is read from process\.env but is not listed in \.env\.example/);
  });

  it("handles a file with thousands of env reads", async () => {
    const project = path.join(tmp, "big");
    fs.mkdirSync(project);
    fs.writeFileSync(path.join(project, ".env.example"), "OK=\n");
    const code = Array.from({ length: 5_000 }, (_, i) => `process.env.${i % 2 ? "OK" : `MISSING_${i}`};`).join("\n");
    const eslint = new ESLint({ cwd: project, overrideConfigFile: true, overrideConfig: [plugin.configs.recommended] });
    const [result] = await eslint.lintText(code, { filePath: path.join(project, "big.js") });
    assert.equal(result.errorCount, 2_500);
  });

  it("rejects invalid options with ESLint's schema error", async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        plugin.configs.recommended,
        { rules: { "env-example/no-undeclared-env": ["error", { envfile: ".env.example" }] } },
      ],
    });
    await assert.rejects(eslint.lintText("process.env.X"), /envfile|additional properties/i);
  });
});
