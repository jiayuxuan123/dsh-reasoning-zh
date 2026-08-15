# dsh-reasoning-zh

把 [DeepSeek Harness](https://github.com/deepseek-ai/dsh)（DSH）Web GUI 模型选择器里的「推理等级」（reasoning effort）档位名翻译成中文的插件。

Translate the reasoning-effort level names in the DeepSeek Harness Web GUI model selector into Chinese.

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

## 工作原理 / How it works

档位名（`reasoning.efforts[].name`）是纯展示字段，wire 层只使用档位 id（`off/low/medium/high/max`），因此翻译名称不会影响请求行为。

- **宿主半边**（`lib/index.js`）：在 `ctx.llm` 适配器层包装所有适配器的 `resolveModel` / `listModels`，按档位 id（回退到英文名精确匹配）把 `name` 翻译成中文 —— 与官方配套插件 `dsh-third-party-thinking` 的注入方式同构。包装后广播一次 `llm/adapters-updated` 让客户端立即刷新模型目录。不修改任何官方 `@deepseek-ai` 包。
- **客户端半边**（`lib/client.js`）：MutationObserver 兜底，只对模型选择器（触发按钮 + 弹出菜单）内「整段等于英文档位名」的文本做精确替换，覆盖宿主侧尚未生效的数据、以及官方 zh 字典漏翻的 `Default` 文案。不触碰会话正文、输入框等其它区域。

## 安装 / Install

1. 把本仓库克隆或复制为 `~/.dsh/profiles/web/node_modules/dsh-reasoning-zh/`：

   ```bash
   git clone https://github.com/jiayuxuan123/dsh-reasoning-zh.git "$HOME/.dsh/profiles/web/node_modules/dsh-reasoning-zh"
   ```

2. 在 `~/.dsh/profiles/web/cordis.patch.yml` 末尾追加：

   ```yaml
   - insert:
       - id: reasoning-zh
         name: 'dsh-reasoning-zh'
   ```

   profile 的 HMR 会热生效宿主半边；刷新页面（Ctrl+R）加载客户端半边。

3. （可选）在「插件市场」里点「立即重启服务」，让数据层翻译完全生效。

## 卸载 / Uninstall

删除 `cordis.patch.yml` 里的 `reasoning-zh` insert 块，再删除 `node_modules/dsh-reasoning-zh/` 目录。

## License

MIT
