// dsh-reasoning-zh npm 生命周期辅助脚本
// ---------------------------------------------------------------------------
// npm install 时（postinstall）自动把插件注册块写入 cordis.patch.yml，
// npm uninstall 时（postuninstall）自动移除。这样用户不需要手动编辑
// ~/.dsh/profiles/web/cordis.patch.yml。
//
// 用法：node scripts/manage-patch.mjs --add | --remove
// npm 运行生命周期脚本时设置 INIT_CWD = 执行 npm 命令的目录
// （即用户 cd 进去的 profile 目录），因此 cordis.patch.yml 位于其下。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const cwd = process.env.INIT_CWD || process.cwd();
const patchPath = join(cwd, "cordis.patch.yml");
const mode = process.argv.includes("--add") ? "add" : process.argv.includes("--remove") ? "remove" : null;

if (!mode) {
  console.error("[dsh-reasoning-zh] usage: manage-patch.mjs --add | --remove");
  process.exit(1);
}

/** 检测文本换行风格，返回 eol。 */
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
      // 收集本 insert 块：紧随其后的缩进行
      const block = [];
      let j = i + 1;
      while (j < lines.length && /^\s+\S/.test(lines[j])) {
        block.push(j);
        j++;
      }
      // 块内条目起点（- id: ...）
      const entryLines = block.filter((k) => /^\s+- id:\s/.test(lines[k]));
      const zhEntries = entryLines.filter((k) => /^\s+- id: reasoning-zh\s*$/.test(lines[k]));
      if (zhEntries.length > 0) {
        if (entryLines.length === 1) {
          // 整个块只包含 reasoning-zh → 整块删除
          i = j;
          changed = true;
          continue;
        }
        // 块里还有其它条目 → 保留 - insert: 头与其它条目，只删 reasoning-zh
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

if (!existsSync(patchPath)) {
  if (mode === "add") {
    // 不是 profile 目录（没有 cordis.patch.yml）时静默跳过，不创建多余文件
    console.log("[dsh-reasoning-zh] 未找到 " + patchPath + "，跳过自动注册（请确认在 profile 目录执行 npm install）");
  } else {
    console.log("[dsh-reasoning-zh] 未找到 " + patchPath + "，无需清理");
  }
  process.exit(0);
}

const src = readFileSync(patchPath, "utf8");
const eol = detectEol(src);
const { text, changed } = mode === "add" ? addBlock(src, eol) : removeBlock(src, eol);

if (!changed) {
  console.log("[dsh-reasoning-zh] " + (mode === "add" ? "注册块已存在，无需改动" : "未找到 reasoning-zh 注册块，无需清理"));
  process.exit(0);
}

writeFileSync(patchPath, text, "utf8");
console.log("[dsh-reasoning-zh] " + (mode === "add" ? "已写入注册块: " + patchPath : "已移除注册块: " + patchPath));
