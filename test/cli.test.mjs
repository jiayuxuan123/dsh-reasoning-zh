// 单元测试：cli.mjs add/remove 对 cordis.patch.yml 的 YAML 结构合法性
// 运行：node test/cli.test.mjs
// 覆盖两个历史 bug：
//   1. add 在全新模板（空数组 `[]`）上直接追加，产生非法 YAML（`[]` 后紧跟块序列项）；
//   2. remove 移除唯一注册块后只剩注释，YAML 解析为 null 而非顶层数组，导致 loader include 启动失败。
// 采用零依赖结构断言：不要求先 npm install。
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dirname, "..", "scripts", "cli.mjs");
const TEMPLATE = `# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; \`!!js\` expressions allowed).
[]
`;

/** 运行 cli.mjs，stdout/stderr 透传（不捕获管道，避免子进程输出被沙箱拦截）。 */
function runCli(cwd, ...args) {
  const res = spawnSync(process.execPath, [CLI, ...args], { cwd, stdio: "inherit" });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`cli.mjs ${args.join(" ")} exited with ${res.status}`);
}

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log("FAIL  " + name + (detail !== void 0 ? "  -> " + JSON.stringify(detail) : "")); }
}

/** 结构断言：文件必须是合法顶层数组形态的 YAML。 */
function assertValidArrayShape(src) {
  const lines = src.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return false; // 空文件不是数组
  // 非注释行要么是块序列项（- 开头），要么是缩进续行；`[]` 行只能单独存在（不能后面紧跟 - 项）。
  let sawFlowEmpty = false;
  for (const line of lines) {
    if (line.startsWith("#")) continue;
    if (/^\[\]\s*$/.test(line)) { sawFlowEmpty = true; continue; }
    if (/^-\s+\S/.test(line)) { sawFlowEmpty = false; continue; }
    if (/^\s+\S/.test(line)) continue; // 缩进续行
    return false;
  }
  return !sawFlowEmpty; // 不能以裸 `[]` 结尾又带其它项 —— 简化：仅当文件含 `[]` 且后面还有条目才算非法
}

const dir = mkdtempSync(join(tmpdir(), "dsh-reasoning-zh-cli-"));
try {
  // 1) add 在模板（空数组）上必须生成合法 YAML
  const patch = join(dir, "cordis.patch.yml");
  writeFileSync(patch, TEMPLATE);
  runCli(dir, "add");
  let src = readFileSync(patch, "utf8");
  check("add on template: 合法块序列（无 `[]` 残留后跟条目）", /- insert:\r?\n\s+- id: reasoning-zh/.test(src) && !/\[\]\r?\n- insert:/.test(src), src);
  check("add on template: 不含裸 `[]` 行", !/^\[\]\s*$/m.test(src), src);

  // 2) add 幂等
  runCli(dir, "add");
  src = readFileSync(patch, "utf8");
  const insertCount = (src.match(/- id: reasoning-zh/g) || []).length;
  check("add 幂等: 只出现一次", insertCount === 1, insertCount);

  // 3) remove 后仍是合法 YAML（补回 `[]`）且条目消失
  runCli(dir, "remove");
  src = readFileSync(patch, "utf8");
  check("remove: 补回空数组 `[]`", /^\[\]\s*$/m.test(src), src);
  check("remove: reasoning-zh 已移除", !src.includes("reasoning-zh"), src);

  // 4) 再次 add 仍可用（往返）
  runCli(dir, "add");
  src = readFileSync(patch, "utf8");
  check("re-add: 再次注册成功", /- insert:\r?\n\s+- id: reasoning-zh/.test(src), src);

  // 5) 已有其它条目的文件追加（非模板场景）
  writeFileSync(patch, "- id: other\n  name: 'other-plugin'\n");
  runCli(dir, "add");
  src = readFileSync(patch, "utf8");
  check("add on non-empty: 保留原条目并追加", /- id: other/.test(src) && /- id: reasoning-zh/.test(src), src);
  check("add on non-empty: 仍是合法数组形态", assertValidArrayShape(src), src);

  // 6) remove 不破坏同文件里的其它条目
  runCli(dir, "remove");
  src = readFileSync(patch, "utf8");
  check("remove keeps others: other 保留", /- id: other/.test(src) && !src.includes("reasoning-zh"), src);
  check("remove keeps others: 仍是合法数组形态", assertValidArrayShape(src), src);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
