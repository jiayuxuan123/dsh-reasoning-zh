// dsh-reasoning-zh 客户端半边：兜底翻译。
// ---------------------------------------------------------------------------
// 宿主侧已把适配器产出的档位名翻译成中文（并为第三方模型注入中文档位），但
// 以下情形仍可能看到英文档位名：
//   1. 「Default」—— effort.providerDefault 是客户端本地化文案（zh 字典漏翻）；
//   2. 模型目录刷新前，当前会话里已渲染的旧英文档位名；
//   3. 个别未被宿主侧包装覆盖的适配器。
// 这里用 MutationObserver 只对模型选择器（触发按钮 + 弹出菜单）内的「整段英文
// 档位名」做精确替换，不触碰会话正文、输入框等其它区域；中文文本一律不动。
window.__ModuleLoader__.load({
	id: "dsh-reasoning-zh",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		// 英文档位名 -> 中文（整段精确匹配；与宿主侧译表保持一致）。
		const EFFORT_ZH = {
			off: "关闭",
			minimal: "最小",
			low: "低",
			medium: "中",
			high: "高",
			max: "最大",
			standard: "标准",
			default: "默认"
		};

		// 模型选择器触发按钮 aria-label 的提示词（zh/en 语言环境都覆盖）。
		const TRIGGER_ARIA_HINTS = ["推理等级", "reasoning effort"];
		// 模型选择器弹出菜单的 aria-label（zh/en）。
		const MENU_ARIA_LABELS = new Set(["模型与推理等级", "Model and reasoning effort"]);

		function zhOf(text) {
			const key = String(text).trim().toLowerCase();
			return EFFORT_ZH[key] || null;
		}

		/** 文本节点是否为「模型选择器触发按钮里直接子 span 的整段档位名」。 */
		function isTriggerEffortNode(node) {
			const parent = node.parentElement;
			if (!parent || parent.tagName !== "SPAN") return false;
			const button = parent.parentElement;
			if (!button || button.tagName !== "BUTTON") return false;
			if (button.getAttribute("aria-haspopup") !== "menu") return false;
			const aria = button.getAttribute("aria-label") || "";
			return TRIGGER_ARIA_HINTS.some((hint) => aria.includes(hint));
		}

		/** 文本节点是否位于模型选择器的弹出菜单内。 */
		function isMenuNode(node) {
			if (!node.parentElement) return false;
			const menu = node.parentElement.closest('[role="menu"]');
			if (!menu) return false;
			return MENU_ARIA_LABELS.has(menu.getAttribute("aria-label") || "");
		}

		/** 尝试把单个文本节点从英文档位名翻译成中文。 */
		function translateNode(node) {
			const text = node.nodeValue;
			if (!text || !text.trim()) return;
			const zh = zhOf(text);
			if (!zh) return;
			if (!isTriggerEffortNode(node) && !isMenuNode(node)) return;
			node.nodeValue = zh;
			// 触发按钮的 title（如 "DeepSeek-V4-Flash · High"）同步替换最后一处
			// 英文档位名，避免误伤模型名里恰好包含同名子串的情况。
			const button = node.parentElement && node.parentElement.tagName === "SPAN" ? node.parentElement.parentElement : null;
			if (button && button.tagName === "BUTTON" && button.title) {
				const oldName = text.trim();
				const idx = button.title.lastIndexOf(oldName);
				if (idx >= 0) {
					button.title = button.title.slice(0, idx) + zh + button.title.slice(idx + oldName.length);
				}
			}
		}

		/** 扫描某个子树里的全部文本节点。 */
		function scan(root) {
			if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			let node;
			while ((node = walker.nextNode())) translateNode(node);
		}

		function apply(ctx) {
			if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
			ctx.effect(() => {
				// 页面尚未就绪时退回 documentElement；扫描目标与观察目标保持一致。
				const root = document.body || document.documentElement;
				scan(root);
				const observer = new MutationObserver((mutations) => {
					for (const mutation of mutations) {
						if (mutation.type === "characterData" && mutation.target) {
							translateNode(mutation.target);
							continue;
						}
						for (const node of mutation.addedNodes) {
							if (node.nodeType === Node.TEXT_NODE) translateNode(node);
							else if (node.nodeType === Node.ELEMENT_NODE) scan(node);
						}
					}
				});
				observer.observe(root, { subtree: true, childList: true, characterData: true });
				return () => observer.disconnect();
			}, "dsh-reasoning-zh: effort label translation");
		}

		exports.apply = apply;
		exports.inject = [];
		return module.exports;
	}
});
