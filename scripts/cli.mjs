#!/usr/bin/env node
// dsh-reasoning-zh 命令行工具
// ---------------------------------------------------------------------------
//   node scripts/cli.mjs add        把注册块写入 cordis.patch.yml（幂等，HMR 生效）
//   node scripts/cli.mjs remove     从 cordis.patch.yml 移除注册块（幂等）
//   node scripts/cli.mjs uninstall  移除注册块 + 自动执行 pnpm remove / npm uninstall
//
// 为什么要这个工具：npm / pnpm 都不会为被卸载的依赖运行卸载生命周期脚本
// （官方文档明确限制），所以「卸载时自动清理 patch」无法用 postuninstall 实现；
// 这里用一条显式命令完成：自动编辑 patch 注册块 + 自动调用包管理器删除包文件。
// 请在 profile 目录（含 cordis.patch.yml 的目录）下运行。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const cwd = process.env.INIT_CWD || process.cwd();
const patchPath = join(cwd, "cordis.patch.yml");
const cmd = process.argv[2] || "help";

/** 检测文本换行风格。 */
function detectEol(src) {
  return src.includes("\r\n") ? "\r\n" : "\n";
}

/** 追加注册块（幂等）。 */
function addBlock(src, eol) {
  const has = /(^|\r?\n)- insert:\r?\n[ \t]+- id: reasoning-zh(\r?\n|$)/.test(src);
  if (has) return { text: src, changed: false };
  const block = ["- insert:", "    - id: reasoning-zh", "      name: 'dsh-reasoning-zh'"].join(eol);
  const text = src.endsWith(eol) ? src + block + eol : src + eol + block + eol;
  return { text, changed: true };
}

/**
 * 移除 reasoning-zh 注册块（幂等）。只动包含该条目的 insert 块：
 * 块内只有 reasoning-zh 一条时整块删除；块内还有其它条目时只删这一条。
 */
function removeBlock(src, eol) {
  const lines = src.split(/\r?\n/);
  const out = [];
  let i = 0;
  let changed = false;
  while (i < lines.length) {
    const line = lines[i];
    if (/^- insert:\s*$/.test(line)) {
      const block = [];
      let j = i + 1;
      while (j < lines.length && /^\s+\S/.test(lines[j])) {
        block.push(j);
        j++;
      }
      const entryLines = block.filter((k) => /^\s+- id:\s/.test(lines[k]));
      const zhEntries = entryLines.filter((k) => /^\s+- id: reasoning-zh\s*$/.test(lines[k]));
      if (zhEntries.length > 0) {
        if (entryLines.length === 1) {
          i = j;
          changed = true;
          continue;
        }
        out.push(line);
        const zhIdx = block.indexOf(zhEntries[0]);
        let end = zhIdx + 1;
        while (end < block.length && !/^\s+- id:\s/.test(lines[block[end]])) end++;
        const removeSet = new Set(block.slice(zhIdx, end));
        for (const k of block) {
          if (!removeSet.has(k)) out.push(lines[k]);
        }
        i = j;
        changed = true;
        continue;
      }
    }
    out.push(line);
    i++;
  }
  return { text: out.join(eol), changed };
}

/** 读取并就地修改 patch 文件；返回是否发生变更。 */
function withPatch(apply) {
  if (!existsSync(patchPath)) {
    console.log("[dsh-reasoning-zh] 未找到 " + patchPath);
    console.log("[dsh-reasoning-zh] 请在 profile 目录（含 cordis.patch.yml 的目录）下运行本命令");
    return false;
  }
  const src = readFileSync(patchPath, "utf8");
  const eol = detectEol(src);
  const { text, changed } = apply(src, eol);
  if (!changed) return false;
  writeFileSync(patchPath, text, "utf8");
  return true;
}

if (cmd === "add") {
  const changed = withPatch((src, eol) => addBlock(src, eol));
  console.log(changed ? "[dsh-reasoning-zh] 已写入注册块: " + patchPath : "[dsh-reasoning-zh] 注册块已存在，无需改动");
} else if (cmd === "remove") {
  const changed = withPatch((src, eol) => removeBlock(src, eol));
  console.log(changed ? "[dsh-reasoning-zh] 已移除注册块: " + patchPath : "[dsh-reasoning-zh] 未找到 reasoning-zh 注册块，无需清理");
} else if (cmd === "uninstall") {
  if (existsSync(patchPath)) {
    const src = readFileSync(patchPath, "utf8");
    const eol = detectEol(src);
    const { text, changed } = removeBlock(src, eol);
    if (changed) {
      writeFileSync(patchPath, text, "utf8");
      console.log("[dsh-reasoning-zh] 已移除注册块: " + patchPath);
    } else {
      console.log("[dsh-reasoning-zh] 未找到 reasoning-zh 注册块，跳过");
    }
  } else {
    console.log("[dsh-reasoning-zh] 未找到 " + patchPath + "，跳过注册块清理");
  }
  const pm = existsSync(join(cwd, "pnpm-lock.yaml")) ? "pnpm" : "npm";
  console.log("[dsh-reasoning-zh] 执行 " + pm + " remove dsh-reasoning-zh ...");
  const res = spawnSync(pm, ["remove", "dsh-reasoning-zh"], {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (res.status !== 0) {
    console.log("[dsh-reasoning-zh] " + pm + " remove 未完全成功；若是手动复制安装的，请手动删除 node_modules/dsh-reasoning-zh 目录");
  }
} else {
  console.log("dsh-reasoning-zh CLI — 在 profile 目录（含 cordis.patch.yml）下运行：");
  console.log("  add        写入注册块到 cordis.patch.yml（幂等，HMR 自动生效）");
  console.log("  remove     从 cordis.patch.yml 移除注册块（幂等）");
  console.log("  uninstall  移除注册块 + 自动执行 pnpm remove / npm uninstall");
  process.exit(cmd === "help" ? 0 : 1);
}
