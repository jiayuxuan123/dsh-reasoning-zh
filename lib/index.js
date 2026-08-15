// dsh-reasoning-zh 宿主半边
// ---------------------------------------------------------------------------
// 两个职责：
//   1. 翻译：把模型声明里的「推理等级」（reasoning effort）档位显示名翻译成
//      中文。档位名（reasoning.efforts[].name）是纯展示字段，wire 层只使用
//      档位 id（off/low/medium/high/max），翻译不影响请求行为。
//   2. 注入：官方 DSH 默认不会给第三方模型注入推理等级元数据，接入的自定义
//      第三方模型因此不显示「推理等级」控件；打包版作者的 dsh-third-party-thinking
//      插件会为未声明 reasoning 的模型注入 off/high/max 并把所选档位写入请求体。
//      本插件把这一能力也收进来：未声明 reasoning 的第三方模型自动获得推理等级
//      控件（注入的档位直接给中文名），所选档位写入出站请求体（字段名可配）。
//      这样不依赖打包版的 dsh-third-party-thinking 也能独立工作；两者同时存在
//      时行为不冲突（包装幂等、同字段写入同值）。
//
// 不修改任何官方 @deepseek-ai 包；包装方式与 dsh-third-party-thinking 同构，
// dsh 包升级后不会丢失。

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

// 具备原生 reasoning 机制（请求体自行写入 reasoning_effort）的适配器：
// wire 注入会破坏其原生路径，跳过。与 dsh-third-party-thinking 的豁免一致。
const NATIVE_REASONING_CLASSES = new Set(["DeepSeekAdapter"]);

// 默认注入档位（与官方打包版 dsh-third-party-thinking 一致）。
const DEFAULT_LEVELS = ["off", "high", "max"];

// 当前生效配置；apply 时用 patch config 规整后覆盖（patch 热更新会重跑 apply）。
let liveConfig = {
	enabled: true,
	injectThirdParty: true,
	levels: DEFAULT_LEVELS,
	defaultLevel: "high",
	wireField: "reasoning_effort"
};

/** 把 patch config 规整为安全默认值（不依赖 schemastery）。 */
function normalizeConfig(raw) {
	const src = raw && typeof raw === "object" ? raw : {};
	const levels = Array.isArray(src.levels) && src.levels.length > 0
		? src.levels.filter((x) => typeof x === "string")
		: DEFAULT_LEVELS;
	// 未配置时默认 high（与官方打包版 dsh-third-party-thinking 一致）；若用户
	// 自定义了 levels 且不含 high，则回退到第一个档位。
	const defaultLevel = typeof src.defaultLevel === "string" && src.defaultLevel ? src.defaultLevel : "high";
	return {
		enabled: src.enabled !== false,
		injectThirdParty: src.injectThirdParty !== false,
		levels,
		defaultLevel: levels.includes(defaultLevel) ? defaultLevel : levels[0],
		wireField: typeof src.wireField === "string" && src.wireField ? src.wireField : "reasoning_effort"
	};
}

function zhNameFor(id) {
	return EFFORT_ZH_BY_ID[String(id).toLowerCase()] ?? String(id);
}

/** 翻译单个档位的显示名；无需翻译时返回原引用。 */
function translateEffort(effort) {
	if (!effort || typeof effort !== "object") return effort;
	const id = typeof effort.id === "string" ? effort.id.toLowerCase() : "";
	const effortName = typeof effort.name === "string" ? effort.name : "";
	const zh = EFFORT_ZH_BY_ID[id] ?? EFFORT_ZH_BY_NAME[effortName.toLowerCase()];
	if (zh === void 0 || effort.name === zh) return effort;
	return { ...effort, name: zh };
}

/** 由档位 id 列表构造显示档位（中文名）。 */
function effortsFromIds(ids) {
	return ids.map((id) => ({ id, name: zhNameFor(id) }));
}

function sameEfforts(a, b) {
	if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
	return a.every((e, i) => e.id === b[i].id && e.name === b[i].name && (e.description ?? null) === (b[i].description ?? null));
}

function isNativeReasoningAdapter(adapter) {
	const cls = adapter && adapter.constructor ? adapter.constructor.name : "";
	return NATIVE_REASONING_CLASSES.has(cls);
}

/**
 * 对单个模型应用 transform：
 *   - 模型已声明 reasoning：只翻译档位名（默认档位保持原值）；
 *   - 模型未声明 reasoning 且 allowInject：注入配置的档位（中文名），
 *     让「推理等级」控件出现 —— 官方 DSH 默认不做这件事。
 * 结果与输入相同时返回原引用。
 */
function transformModel(provider, model, allowInject) {
	if (!model || typeof model !== "object") return model;
	const cfg = liveConfig;
	if (!cfg.enabled) return model;
	const declared = model.reasoning && Array.isArray(model.reasoning.efforts) && model.reasoning.efforts.length > 0
		? model.reasoning.efforts
		: null;

	let efforts;
	let defaultEffort;

	if (declared) {
		efforts = declared.map(translateEffort);
		defaultEffort = model.reasoning.defaultEffort;
	} else if (cfg.injectThirdParty && allowInject) {
		efforts = effortsFromIds(cfg.levels);
		defaultEffort = cfg.defaultLevel;
	} else {
		return model;
	}

	// defaultEffort 必须落在档位集内，否则 dsh-llm 的 resolveModelInfo 校验
	// （INVALID_MODEL_REASONING）会抛错并隐藏整个 provider。
	const ids = new Set(efforts.map((e) => e.id));
	if (defaultEffort === void 0 || !ids.has(defaultEffort)) {
		defaultEffort = ids.has(cfg.defaultLevel) ? cfg.defaultLevel : efforts[0].id;
	}

	const reasoning = { efforts, defaultEffort };
	const prev = model.reasoning;
	if (prev && prev.defaultEffort === defaultEffort && sameEfforts(prev.efforts, efforts)) return model;
	return { ...model, reasoning };
}

/** 包装 stream：向第三方 provider 的出站 chat/completions 请求体注入档位字段。 */
function wrapStream(adapter) {
	return async function* (...args) {
		const options = args[0];
		const cfg = liveConfig;
		const effort = options && options.reasoningEffort;
		if (!cfg.enabled || !cfg.injectThirdParty || effort === void 0 || effort === "off") {
			yield* adapter.stream.apply(adapter, args);
			return;
		}
		const wireField = cfg.wireField || "reasoning_effort";
		const model = options && options.model;
		const originalFetch = globalThis.fetch;
		// 限定范围的 fetch 拦截：仅在本流执行期间临时替换 globalThis.fetch，
		// 只对「/chat/completions 的 POST JSON 请求体」注入档位字段；命中 DeepSeek
		// 宿主的请求（/deepseek/i）与 model 不匹配的请求一律跳过。
		globalThis.fetch = async (input, init) => {
			const url = typeof input === "string" ? input : input && input.url;
			const method = String((init && init.method) || (input && typeof input !== "string" && input.method) || "GET").toUpperCase();
			const isChat = typeof url === "string" && /\/chat\/completions(\?|$)/i.test(url);
			const isDeepSeek = typeof url === "string" && /deepseek/i.test(url);
			if (isChat && !isDeepSeek && method === "POST" && init && typeof init.body === "string") {
				try {
					const body = JSON.parse(init.body);
					if (body && Array.isArray(body.messages) && (!body.model || !model || body.model === model)) {
						body[wireField] = effort;
						init = { ...init, body: JSON.stringify(body) };
					}
				} catch {
					// 非 JSON 请求体，跳过
				}
			}
			return originalFetch(input, init);
		};
		try {
			yield* adapter.stream.apply(adapter, args);
		} finally {
			globalThis.fetch = originalFetch;
		}
	};
}

/** 包装一个适配器：保留原型链，只覆盖 resolveModel / listModels / stream。 */
function wrapAdapter(adapter) {
	if (adapter && adapter.__dshReasoningZhWrapped) return adapter;
	const native = isNativeReasoningAdapter(adapter);
	const wrapped = Object.create(adapter);
	wrapped.__dshReasoningZhWrapped = true;
	wrapped.resolveModel = async (provider, model, signal) => transformModel(provider, await adapter.resolveModel(provider, model, signal), !native);
	wrapped.listModels = async (provider) => (await adapter.listModels(provider)).map((model) => transformModel(provider, model, !native));
	if (!native) wrapped.stream = wrapStream(adapter);
	return wrapped;
}

function apply(ctx, config) {
	liveConfig = normalizeConfig(config);
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
				// 浏览器端）。幂等：再次触发时没有新适配器可包装，不会自激循环。
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
