# dsh-reasoning-zh

[![npm version](https://img.shields.io/npm/v/dsh-reasoning-zh)](https://www.npmjs.com/package/dsh-reasoning-zh) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[DeepSeek Harness](https://github.com/deepseek-ai/dsh)（DSH）Web GUI 插件：把「推理等级」（reasoning effort）档位名翻译成中文，并让接入的自定义第三方模型也能显示推理等级。

- **翻译**：模型选择器里的「推理等级」档位名（Off/Low/Medium/High/Max/Default 等）显示为中文。
- **注入**：官方 DSH 不会为未声明推理等级的第三方模型显示「推理等级」控件。本插件自动为这类模型注入档位（默认 off/high/max），并把所选档位写入出站 `chat/completions` 请求体（字段名可配置）。开箱即用，无需任何其它插件。

## 翻译表 / Translation table

| id | 中文 | English |
| --- | --- | --- |
| `off` | 关闭 | Off |
| `minimal` | 最小 | Minimal |
| `low` | 低 | Low |
| `medium` | 中 | Medium |
| `high` | 高 | High |
| `max` | 最大 | Max |
| （provider 默认） | 默认 | Default |

档位名（`reasoning.efforts[].name`）是纯展示字段，wire 层只使用档位 id，因此翻译/注入名称不影响请求行为；原生 DeepSeek 适配器（自带 reasoning 机制）只做翻译、不做 wire 注入。

## 工作原理 / How it works

- **宿主半边**（`lib/index.js`）：在 `ctx.llm` 适配器层包装 `resolveModel` / `listModels`（翻译 + 为未声明 reasoning 的模型注入档位）和 `stream`（把所选档位写入出站请求体），不修改任何官方 `@deepseek-ai` 包。
- **客户端半边**（`lib/client.js`）：MutationObserver 兜底，只对模型选择器内「整段等于英文档位名」的文本做精确替换，覆盖宿主侧尚未生效的数据与官方 zh 字典漏翻的 `Default` 文案。

## 安装 / Install

方式一（推荐，npm）：

```bash
cd ~/.dsh/profiles/web
npm install dsh-reasoning-zh
node node_modules/dsh-reasoning-zh/scripts/cli.mjs add
```

`cli.mjs add` 自动把注册块写入 `cordis.patch.yml`（幂等），profile HMR 直接生效，无需手动编辑。如需自定义档位，再在注册块上加 `config`（见下）。pnpm 管理的 profile 用 `pnpm add dsh-reasoning-zh` 代替 `npm install`。

方式二（源码，从 GitHub 克隆）：

```bash
git clone https://github.com/jiayuxuan123/dsh-reasoning-zh.git "$HOME/.dsh/profiles/web/node_modules/dsh-reasoning-zh"
```

装好后，在 `~/.dsh/profiles/web/cordis.patch.yml` 末尾追加（`config` 可选，全部有默认值）：

```yaml
- insert:
    - id: reasoning-zh
      name: 'dsh-reasoning-zh'
      config:
        enabled: true              # 总开关（默认 true）
        injectThirdParty: true     # 为未声明 reasoning 的第三方模型注入档位（默认 true）
        levels: [off, high, max]   # 注入的档位 id 列表（默认 off/high/max）
        defaultLevel: high         # 注入档位的默认选中项（默认 high）
        wireField: reasoning_effort # 出站请求体字段名（默认 reasoning_effort）
```

profile 的 HMR 会热生效；刷新页面（Ctrl+R）加载客户端半边。修改 `config` 后 HMR 会以新配置重跑宿主半边。

首次安装或更新 `lib/` 后，需要重启一次服务（插件市场 →「立即重启服务」，或重启 DSH Desktop）让新的宿主代码生效。

## 卸载 / Uninstall

```bash
cd ~/.dsh/profiles/web
node node_modules/dsh-reasoning-zh/scripts/cli.mjs uninstall
```

一条命令完成：自动移除 `cordis.patch.yml` 里的注册块，并自动执行 `pnpm remove` / `npm uninstall` 删除包文件。npm / pnpm 都不会为被卸载的依赖运行卸载生命周期脚本，所以用这个命令代替手动编辑。

手动安装的（git 克隆）：删除 `cordis.patch.yml` 里的 `reasoning-zh` insert 块，再删除 `node_modules/dsh-reasoning-zh/` 目录（或运行 `node node_modules/dsh-reasoning-zh/scripts/cli.mjs remove` 自动移除注册块）。

## License

MIT
