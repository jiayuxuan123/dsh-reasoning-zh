# dsh-reasoning-zh

[DeepSeek Harness](https://github.com/deepseek-ai/dsh)（DSH）Web GUI 插件：把「推理等级」（reasoning effort）档位名翻译成中文，并让接入的自定义第三方模型也能显示推理等级。

- **翻译**：模型选择器里的「推理等级」档位名（Off/Low/Medium/High/Max/Default 等）显示为中文。
- **注入**：官方 DSH 默认不会给第三方模型注入推理等级元数据，接入的自定义 OpenAI 兼容模型因此没有「推理等级」控件；本插件为未声明 reasoning 的第三方模型自动注入档位（默认 off/high/max，与打包版 dsh-third-party-thinking 一致），并把所选档位写入出站 `chat/completions` 请求体（字段名可配置）。这样不依赖打包版的 `dsh-third-party-thinking` 也能独立工作；两者同时存在时互不冲突。

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

- **宿主半边**（`lib/index.js`）：在 `ctx.llm` 适配器层包装 `resolveModel` / `listModels`（翻译 + 为未声明 reasoning 的模型注入档位）和 `stream`（把所选档位写入出站请求体），与官方配套插件 `dsh-third-party-thinking` 的注入方式同构，不修改任何官方 `@deepseek-ai` 包。
- **客户端半边**（`lib/client.js`）：MutationObserver 兜底，只对模型选择器内「整段等于英文档位名」的文本做精确替换，覆盖宿主侧尚未生效的数据与官方 zh 字典漏翻的 `Default` 文案。

## 安装 / Install

1. 把本仓库克隆或复制为 `~/.dsh/profiles/web/node_modules/dsh-reasoning-zh/`：

   ```bash
   git clone https://github.com/jiayuxuan123/dsh-reasoning-zh.git "$HOME/.dsh/profiles/web/node_modules/dsh-reasoning-zh"
   ```

2. 在 `~/.dsh/profiles/web/cordis.patch.yml` 末尾追加（`config` 可选，全部有默认值）：

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

3. 首次安装或更新 `lib/` 后，需要重启一次服务（插件市场 →「立即重启服务」，或重启 DSH Desktop）让新的宿主代码生效。

## 卸载 / Uninstall

删除 `cordis.patch.yml` 里的 `reasoning-zh` insert 块，再删除 `node_modules/dsh-reasoning-zh/` 目录。

## License

MIT
