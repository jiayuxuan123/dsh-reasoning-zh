// dsh-reasoning-zh 宿主半边
// ---------------------------------------------------------------------------
// 把模型选择器里的「推理等级」（reasoning effort）档位显示名翻译成中文。
//
// 档位名（reasoning.efforts[].name）是纯展示字段，wire 层只使用档位 id
// （off/low/medium/high/max）。各 llm 适配器在 resolveModel / listModels 里
// 产出这些英文名：官方 DeepSeek 是 Off/High/Max；pi-ai 按 level 首字母大写
// （Off/Low/Medium/High/Max）；dsh-third-party-thinking 给第三方模型注入的
// 也是 Off/High/Max。
//
// 本插件不改任何官方包，只在 ctx.llm 适配器层包装 resolveModel / listModels，
// 按档位 id（回退到英文名精确匹配）把 name 翻译成中文 —— 与官方配套插件
// dsh-third-party-thinking 的注入方式同构，dsh 包升级后不会丢失。
//
// 顺序说明：本插件在 cordis.patch.yml 中插入于 dsh-third-party-thinking 之后，
// 包装层位于最外层，能同时翻译官方模型与第三方模型被注入的档位名。

const name = "dsh-reasoning-zh";
const inject = ["llm"];

// 档位 id -> 中文名（id 是 wire 层真实使用的值，最可靠）。
const EFFORT_ZH_BY_ID = {
	off: "关闭",
	minimal: "最小",
	low: "低",
	medium: "中",
	high: "高",
	max: "最大"
};

// 英文名 -> 中文名回退（个别适配器可能自定义 id 但沿用这些英文名）。
const EFFORT_ZH_BY_NAME = {
	off: "关闭",
	minimal: "最小",
	low: "低",
	medium: "中",
	high: "高",
	max: "最大",
	standard: "标准",
	default: "默认"
};

/** 翻译单个档位的显示名；无需翻译时返回原引用。 */
function translateEffort(effort) {
	if (!effort || typeof effort !== "object") return effort;
	const id = typeof effort.id === "string" ? effort.id.toLowerCase() : "";
	const effortName = typeof effort.name === "string" ? effort.name : "";
	const zh = EFFORT_ZH_BY_ID[id] ?? EFFORT_ZH_BY_NAME[effortName.toLowerCase()];
	if (zh === void 0 || effort.name === zh) return effort;
	return { ...effort, name: zh };
}

/** 翻译一个模型元数据的 reasoning.efforts 显示名；无变化时返回原引用。 */
function translateModel(model) {
	if (!model || !model.reasoning || !Array.isArray(model.reasoning.efforts) || model.reasoning.efforts.length === 0) return model;
	let changed = false;
	const efforts = model.reasoning.efforts.map((effort) => {
		const next = translateEffort(effort);
		if (next !== effort) changed = true;
		return next;
	});
	if (!changed) return model;
	return { ...model, reasoning: { ...model.reasoning, efforts } };
}

/** 包装一个适配器：保留原型链，只覆盖 resolveModel / listModels。 */
function wrapAdapter(adapter) {
	if (adapter && adapter.__dshReasoningZhWrapped) return adapter;
	const wrapped = Object.create(adapter);
	wrapped.__dshReasoningZhWrapped = true;
	wrapped.resolveModel = async (provider, model, signal) => translateModel(await adapter.resolveModel(provider, model, signal));
	wrapped.listModels = async (provider) => (await adapter.listModels(provider)).map((model) => translateModel(model));
	return wrapped;
}

function apply(ctx) {
	let notifying = false;
	const applyWrap = () => {
		try {
			if (!ctx.llm || !ctx.llm.adapters) return;
			let wrappedCount = 0;
			for (const [, registration] of ctx.llm.adapters) {
				if (!registration || !registration.adapter) continue;
				if (registration.adapter.__dshReasoningZhWrapped) continue;
				registration.adapter = wrapAdapter(registration.adapter);
				wrappedCount++;
			}
			if (wrappedCount > 0 && !notifying) {
				// 让客户端立即刷新模型目录（dsh-api-remotes 会把该事件转发到
				// 浏览器端），已渲染的档位名随即变中文。幂等：再次触发时没有
				// 新适配器可包装，不会自激循环。
				notifying = true;
				try {
					ctx.emit("llm/adapters-updated");
				} catch (error) {
					console.warn("[dsh-reasoning-zh] notify refresh failed: " + ((error && error.message) || error));
				} finally {
					notifying = false;
				}
			}
		} catch (error) {
			console.warn("[dsh-reasoning-zh] adapter wrap failed: " + ((error && error.message) || error));
		}
	};
	applyWrap();
	return ctx.on("llm/adapters-updated", applyWrap);
}

export { apply, inject, name };
