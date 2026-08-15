// 单元测试：dsh-reasoning-zh 宿主半边（mock llm.adapters，走真实 apply/wrap 代码路径）
// 运行：node test/reasoning-zh.test.mjs
import { apply } from "../lib/index.js";

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log("FAIL  " + name + (detail ? "  -> " + JSON.stringify(detail) : "")); }
}

// ---- 构造 mock 适配器 ----
function makeAdapter(name, models) {
  return {
    constructor: { name },
    resolveModel: async (provider, modelId) => models.find((m) => m.id === modelId) ?? models[0],
    listModels: async () => models,
    stream: async function* () {}
  };
}

const poke2Adapter = makeAdapter("Poke2Adapter", [
  { id: "gpt-5.6-luna", name: "gpt-5.6-luna", reasoning: { efforts: [{ id: "off", name: "Off" }, { id: "minimal", name: "Minimal" }, { id: "high", name: "High" }, { id: "max", name: "Max" }], defaultEffort: "high" } }
]);

const customAdapter = makeAdapter("OpenClawBridgeAdapter", [
  { id: "custom-model", name: "custom-model" } // 未声明 reasoning —— 应被注入
]);

const deepseekAdapter = makeAdapter("DeepSeekAdapter", [
  { id: "deepseek-v4-flash", name: "DeepSeek-V4-Flash", reasoning: { efforts: [{ id: "off", name: "Off" }, { id: "high", name: "High" }, { id: "max", name: "Max" }], defaultEffort: "high" } }
]);

// PiAiAdapter 同属原生 reasoning 适配器：只翻译已声明档位、不为裸模型注入、不包装 stream。
const piAiAdapter = makeAdapter("PiAiAdapter", [
  { id: "gpt-5.6-luna", name: "gpt-5.6-luna", reasoning: { efforts: [{ id: "off", name: "Off" }, { id: "low", name: "Low" }, { id: "high", name: "High" }], defaultEffort: "high" } },
  { id: "deepseek-v4-flash", name: "deepseek-v4-flash" }
]);

const adapters = new Map([
  ["poke2", { adapter: poke2Adapter }],
  ["custom", { adapter: customAdapter }],
  ["deepseek-official", { adapter: deepseekAdapter }],
  ["pi-ai", { adapter: piAiAdapter }]
]);

let emitted = 0;
const ctx = {
  llm: { adapters },
  emit: () => { emitted++; },
  on: () => () => {}
};

// ---- apply：默认配置（注入 off/high/max，默认 high）----
await apply(ctx, undefined);

const p2 = adapters.get("poke2").adapter;
const cu = adapters.get("custom").adapter;
const ds = adapters.get("deepseek-official").adapter;

// 1) 已声明档位名被翻译成中文
let m = await p2.resolveModel("poke2", "gpt-5.6-luna");
check("poke2: 档位名翻译", m.reasoning.efforts.map((e) => `${e.id}=${e.name}`).join(",") === "off=关闭,minimal=最小,high=高,max=最大",
  m.reasoning.efforts.map((e) => `${e.id}=${e.name}`));
check("poke2: 默认档位保留", m.reasoning.defaultEffort === "high", m.reasoning.defaultEffort);

// 2) 未声明 reasoning 的第三方模型被注入中文档位 + 控件出现
m = await cu.resolveModel("custom", "custom-model");
check("custom: 注入档位", m.reasoning.efforts.map((e) => `${e.id}=${e.name}`).join(",") === "off=关闭,high=高,max=最大",
  m.reasoning.efforts.map((e) => `${e.id}=${e.name}`));
check("custom: 注入默认档位 high", m.reasoning.defaultEffort === "high", m.reasoning.defaultEffort);

// 3) listModels 同样注入
const customList = await cu.listModels("custom");
check("custom: listModels 注入", customList[0].reasoning.efforts.length === 3, customList[0].reasoning);

// 4) DeepSeek 原生适配器：只翻译、不注入（其声明已存在），且不包装 stream
m = await ds.resolveModel("deepseek-official", "deepseek-v4-flash");
check("deepseek: 翻译", m.reasoning.efforts.map((e) => e.name).join(",") === "关闭,高,最大", m.reasoning.efforts.map((e) => e.name));
check("deepseek: 无 stream 包装", ds.stream === deepseekAdapter.stream);

// 5) 原生豁免 + 包装标记
check("adapters 已被包装", p2.__dshReasoningZhWrapped === true && cu.__dshReasoningZhWrapped === true && ds.__dshReasoningZhWrapped === true);
check("apply 广播过 llm/adapters-updated", emitted >= 1, emitted);

// 5b) PiAiAdapter：只翻译已声明档位；裸模型不被注入；不包装 stream。
const pi = adapters.get("pi-ai").adapter;
m = await pi.resolveModel("pi-ai", "gpt-5.6-luna");
check("pi-ai declared: 档位名翻译", m.reasoning.efforts.map((e) => `${e.id}=${e.name}`).join(",") === "off=关闭,low=低,high=高", m.reasoning.efforts.map((e) => `${e.id}=${e.name}`));
m = await pi.resolveModel("pi-ai", "deepseek-v4-flash");
check("pi-ai naked: 不注入（交给适配器自身能力）", m.reasoning === void 0, m.reasoning);
check("pi-ai: 无 stream 包装", pi.stream === piAiAdapter.stream);

// 6) 自定义 config：注入不同档位（off/low/max，默认 low）
const adapters2 = new Map([["custom2", { adapter: makeAdapter("XAdapter", [{ id: "x", name: "x" }]) }]]);
await apply({ llm: { adapters: adapters2 }, emit: () => {}, on: () => () => {} }, {
  levels: ["off", "low", "max"],
  defaultLevel: "low"
});
m = await adapters2.get("custom2").adapter.resolveModel("custom2", "x");
check("custom config: levels=off/low/max", m.reasoning.efforts.map((e) => e.name).join(",") === "关闭,低,最大",
  m.reasoning.efforts.map((e) => e.name));
check("custom config: default=low", m.reasoning.defaultEffort === "low", m.reasoning.defaultEffort);

// 7) disabled: injectThirdParty=false 时不注入
const adapters3 = new Map([["custom3", { adapter: makeAdapter("YAdapter", [{ id: "y", name: "y" }]) }]]);
await apply({ llm: { adapters: adapters3 }, emit: () => {}, on: () => () => {} }, { injectThirdParty: false });
m = await adapters3.get("custom3").adapter.resolveModel("custom3", "y");
check("injectThirdParty=false: 不注入", m.reasoning === void 0, m.reasoning);

// 7b) enabled: false 时翻译与注入都应失效（总开关）
const adapters3b = new Map([
  ["declared", { adapter: makeAdapter("ZAdapter", [{ id: "z", name: "z", reasoning: { efforts: [{ id: "high", name: "High" }], defaultEffort: "high" } }]) }],
  ["naked", { adapter: makeAdapter("QAdapter", [{ id: "q", name: "q" }]) }]
]);
await apply({ llm: { adapters: adapters3b }, emit: () => {}, on: () => () => {} }, { enabled: false });
let m3 = await adapters3b.get("declared").adapter.resolveModel("declared", "z");
check("enabled=false: 不翻译", m3.reasoning.efforts[0].name === "High", m3.reasoning.efforts[0].name);
m3 = await adapters3b.get("naked").adapter.resolveModel("naked", "q");
check("enabled=false: 不注入", m3.reasoning === void 0, m3.reasoning);

// 8) wire：stream 期间出站 chat/completions 请求体被注入档位字段
const fakeFetchCalls = [];
const fakeAdapter = {
  constructor: { name: "Wire2Adapter" },
  resolveModel: async () => ({ id: "m", name: "m" }),
  listModels: async () => [{ id: "m", name: "m" }],
  stream: async function* () {
    const f = globalThis.fetch;
    await f("https://api.example.com/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "m", messages: [{ role: "user", content: "hi" }] }) });
    yield "ok";
  }
};
const adapters5 = new Map([["wire2", { adapter: fakeAdapter }]]);
await apply({ llm: { adapters: adapters5 }, emit: () => {}, on: () => () => {} }, { wireField: "reasoning_effort" });
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => { fakeFetchCalls.push({ input, init }); return new Response("{}", { status: 200 }); };
try {
  for await (const _ of adapters5.get("wire2").adapter.stream({ model: "m", reasoningEffort: "max" })) {}
} finally {
  globalThis.fetch = realFetch;
}
const call = fakeFetchCalls[0];
const sentBody = call && JSON.parse(call.init.body);
check("wire: chat/completions 请求体注入 reasoning_effort=max", sentBody && sentBody.reasoning_effort === "max", sentBody);
check("wire: 其它字段未被破坏", sentBody && sentBody.messages && sentBody.messages[0].content === "hi", sentBody);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
