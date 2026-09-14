/**
 * 插件名称：生图预设魔方 (角色外貌强锁与纯净解耦版)
 * 版本：v6.7.0
 * 核心升级：
 * 1. 完美解决 vivo X80 顶部栏出框问题，5 个选项卡 100% 饱满且不超界
 * 2. 新增【自定义不等距间隙配置】：支持为每个 Tab 单独设定右侧间隔像素
 * 3. 纯净三段式提示词架构（画风+外貌强锁+负面），角色外貌独立配置不污染聊天
 */

export default {
  manifest: {
    id: "image-preset-magic-cube",
    name: "生图预设魔方",
    apiVersion: 1,
    version: "6.7.0",
    author: "阿念&小坊",
    description: "三段式提示词架构（画风+外貌强锁+负面）；支持为每个角色配置专属外貌特征与独立 API，底层精准装载生效。",
    permissions: ["storage", "ui", "ai"],
    settings: [],
  },

  setup(ctx) {
    // ────────────── 🎛️ 顶部 Tab 栏自定义不等距间距配置 (随时可调) ──────────────
    // 数值为右侧间距(px)。想要两个选项卡离得远就调大，想贴紧就设为 0
    const TAB_SPACING_CONFIG = {
      pair: 2,    // 「搭配」与「角色」之间的距离
      char: 2,    // 「角色」与「提示词」之间的距离
      prompt: 2,  // 「提示词」与「API」之间的距离
      api: 2,     // 「API」与「备份」之间的距离
      data: 0     // 最后一个「备份」右侧不需要间隙
    };

    const UNIFIED_STORE_KEY = "img_cube_latest_store_v5";
    const SYS_SETTINGS_KEY = "ai_phone_image_generation_settings_v1";
    const FAB_SWITCH_STORAGE_KEY = "img_cube_floating_ball_enabled";

    let alive = true;
    let webpackRequire = null;
    let hostLoadFn = null;
    let hostSaveFn = null;
    let hostLoadCharsFn = null;
    let cachedSystemChars = [];

    // ────────────── 全局顶层半透明 Toast ──────────────
    let toastTimer = null;
    function showGlobalToast(text) {
      let el = document.getElementById("cube-global-toast");
      if (!el) {
        el = document.createElement("div");
        el.id = "cube-global-toast";
        el.style.cssText = `
          position: fixed;
          top: 14px;
          left: 50%;
          transform: translateX(-50%) translateY(-20px);
          background: rgba(30, 41, 59, 0.88);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          color: #ffffff;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
          z-index: 999999;
          box-shadow: 0 8px 24px rgba(0,0,0,0.25);
          border: 1px solid rgba(255,255,255,0.15);
          pointer-events: none;
          opacity: 0;
          transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
          max-width: 90vw;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          text-align: center;
        `;
        document.body.appendChild(el);
      }

      el.textContent = text;
      el.style.opacity = "1";
      el.style.transform = "translateX(-50%) translateY(0)";

      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        if (el) {
          el.style.opacity = "0";
          el.style.transform = "translateX(-50%) translateY(-20px)";
        }
      }, 2400);
    }

    // ────────────── 数据获取与角色绑定存储 ──────────────
    function getCleanStore() {
      let store = ctx.system.storage.get(UNIFIED_STORE_KEY);
      if (!store || typeof store !== "object" || !Array.isArray(store.presets)) {
        store = {
          presets: [],
          activeId: "",
          prompts: [],
          activePromptId: "",
          charBindings: {},
          naiRelay: false,
        };
      }
      if (!store.charBindings || typeof store.charBindings !== "object") {
        store.charBindings = {};
      }
      return store;
    }

    const loadStore = () => getCleanStore();
    const saveStore = (s) => ctx.system.storage.set(UNIFIED_STORE_KEY, s);

    function isFloatingBallEnabled() {
      const v = ctx.system.storage.get(FAB_SWITCH_STORAGE_KEY);
      if (v === false || v === "false") return false;
      return true;
    }

    function setFloatingBallEnabled(enabled) {
      ctx.system.storage.set(FAB_SWITCH_STORAGE_KEY, Boolean(enabled));
      if (enabled) {
        createFloatingBall();
        showGlobalToast("已开启屏幕快捷悬浮球");
      } else {
        removeFloatingBall();
        showGlobalToast("已关闭屏幕快捷悬浮球");
      }
    }

    // ────────────── 深度穿透提取 Webpack 模块 ──────────────
    const getWebpackRequire = () => {
      if (webpackRequire) return webpackRequire;
      const g = typeof globalThis !== "undefined" ? globalThis : window;
      if (!g) return null;
      const name = Object.getOwnPropertyNames(g).find((k) => k.startsWith("webpackChunk"));
      if (!name || !Array.isArray(g[name])) return null;
      try {
        g[name].push([["cube-core-" + Date.now()], {}, (req) => { webpackRequire = req; }]);
      } catch {}
      return webpackRequire;
    };

    const pickHostFns = () => {
      if (typeof hostLoadFn === "function" && typeof hostSaveFn === "function" && typeof hostLoadCharsFn === "function") return true;
      const req = getWebpackRequire();
      if (!req) return false;

      const scanMap = (obj) => {
        if (!obj) return;
        for (const id of Object.keys(obj)) {
          try {
            const exp = req(id);
            if (!exp || typeof exp !== "object") continue;
            if (typeof exp.loadImageGenerationSettings === "function") hostLoadFn = exp.loadImageGenerationSettings;
            if (typeof exp.saveImageGenerationSettings === "function") hostSaveFn = exp.saveImageGenerationSettings;
            if (typeof exp.loadCharacters === "function") hostLoadCharsFn = exp.loadCharacters;
            if (exp.default) {
              if (typeof exp.default.loadImageGenerationSettings === "function") hostLoadFn = exp.default.loadImageGenerationSettings;
              if (typeof exp.default.saveImageGenerationSettings === "function") hostSaveFn = exp.default.saveImageGenerationSettings;
              if (typeof exp.default.loadCharacters === "function") hostLoadCharsFn = exp.default.loadCharacters;
            }
          } catch {}
        }
      };

      if (req.c) scanMap(req.c);
      if ((!hostLoadFn || !hostSaveFn || !hostLoadCharsFn) && req.m) scanMap(req.m);

      return typeof hostLoadFn === "function" && typeof hostSaveFn === "function";
    };

    // ────────────── 异步与同步全链路提取角色库 ──────────────
    async function refreshSystemCharactersAsync() {
      pickHostFns();
      if (typeof hostLoadCharsFn === "function") {
        try {
          const list = hostLoadCharsFn();
          if (Array.isArray(list) && list.length > 0) {
            cachedSystemChars = list;
            return list;
          }
        } catch {}
      }

      try {
        const idbReq = indexedDB.open("AiPhoneKvDB");
        idbReq.onsuccess = (e) => {
          const db = e.target.result;
          if (db.objectStoreNames.contains("entries")) {
            const tx = db.transaction("entries", "readonly");
            const getReq = tx.objectStore("entries").get("ai_phone_characters_v1");
            getReq.onsuccess = () => {
              if (getReq.result && getReq.result.value) {
                const parsed = JSON.parse(getReq.result.value);
                if (Array.isArray(parsed)) cachedSystemChars = parsed;
              }
            };
          }
        };
      } catch {}

      try {
        const raw = localStorage.getItem("ai_phone_characters_v1");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) cachedSystemChars = parsed;
        }
      } catch {}

      return cachedSystemChars;
    }

    function getSystemCharacters() {
      refreshSystemCharactersAsync();
      return cachedSystemChars;
    }

    const hostLoad = () => {
      pickHostFns();
      if (typeof hostLoadFn === "function") {
        try { return hostLoadFn(); } catch {}
      }
      try {
        const raw = localStorage.getItem(SYS_SETTINGS_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    };

    const hostSave = (s) => {
      pickHostFns();
      if (typeof hostSaveFn === "function") {
        try { hostSaveFn(s); return true; } catch {}
      }
      try {
        localStorage.setItem(SYS_SETTINGS_KEY, JSON.stringify(s));
        window.dispatchEvent(new CustomEvent("settings-image-generation-updated"));
        return true;
      } catch { return false; }
    };

    function detectCurrentActiveCharId() {
      try {
        const characters = getSystemCharacters();
        const headerTitles = document.querySelectorAll(".chat-header-title, .header-title, h1, h2, h3, header span, nav span");
        for (const el of headerTitles) {
          const t = (el.textContent || "").trim();
          const found = characters.find(c => c.name === t || t.startsWith(c.name));
          if (found) return found.id;
        }
        const hash = window.location.hash || window.location.pathname || "";
        for (const c of characters) {
          if (hash.includes(c.id)) return c.id;
        }
      } catch {}
      return null;
    }

    // ────────────── 核心三段式提示词构建引擎 ──────────────
    function buildTripartitePrompt(stylePos, appearance, neg) {
      const parts = [];
      const s = (stylePos || "").trim();
      const a = (appearance || "").trim();
      const n = (neg || "").trim();

      // 第一段：画风与场景
      if (s) {
        parts.push(`【Style & Scene / 艺术画风与场景】\n${s}`);
      }

      // 第二段：核心角色外貌强锁（置于正负之间，黄金强约束区）
      if (a) {
        parts.push(
          `【Mandatory Character Appearance / 角色核心外貌特征 (绝对锁定，最高优先级还原)】\n` +
          `The character MUST strictly feature the following specific visual details:\n` +
          `${a}\n` +
          `[CRITICAL INSTRUCTION: Ensure hair color, eye color, facial traits, clothing and distinctive features strictly adhere to the above description without deviation.]`
        );
      }

      // 第三段：负面约束
      if (n) {
        parts.push(`【Negative Constraints / 严格禁止出现以下元素】\nStrictly avoid: ${n}`);
      }

      return parts.join("\n\n");
    }

    // ────────────── DOM 原生穿透辅助 ──────────────
    const setNativeValue = (el, value) => {
      if (!el) return;
      const proto = el.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : el.tagName === "SELECT"
          ? window.HTMLSelectElement.prototype
          : window.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      const tracker = el._valueTracker;
      if (tracker && typeof tracker.setValue === "function") tracker.setValue("");
      if (desc && desc.set) desc.set.call(el, value);
      else el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };

    const findPageRoot = () => {
      const h2s = document.querySelectorAll("h2");
      for (const h of h2s) {
        if ((h.textContent || "").trim() !== "Image Generation") continue;
        return h.closest(".flex.flex-col.gap-6") || (h.parentElement && h.parentElement.parentElement);
      }
      return null;
    };

    const fieldControl = (root, labelText) => {
      if (!root) return null;
      const nodes = root.querySelectorAll("label, .menu-desc");
      for (const node of nodes) {
        if ((node.textContent || "").trim() !== labelText) continue;
        const wrap = node.parentElement;
        if (!wrap) continue;
        const el = wrap.querySelector("input:not([type=checkbox]), textarea, select");
        if (el) return el;
      }
      return null;
    };

    const waitFrames = (n) => new Promise((resolve) => {
      const step = (left) => {
        if (left <= 0) resolve();
        else requestAnimationFrame(() => step(left - 1));
      };
      step(n);
    });

    // ────────────── 核心：全量多预设共存与全局注入 ──────────────
    async function applyCombination(apiPreset, promptPreset, silent = false) {
      const currentSys = hostLoad() || {};
      const nextSys = {
        ...currentSys,
        enabled: currentSys.enabled ?? false,
      };

      const store = loadStore();

      if (apiPreset) {
        const isNai = apiPreset.provider === "novelai";
        nextSys.provider = isNai ? "novelai" : "openai";
        nextSys.requestMode = apiPreset.requestMode || "server";

        if (isNai) {
          nextSys.novelai = {
            ...(currentSys.novelai || {}),
            apiKey: apiPreset.apiKey || "",
          };
        } else {
          nextSys.baseUrl = apiPreset.baseUrl || "https://api.openai.com/v1";
          nextSys.apiKey = apiPreset.apiKey || "";
          nextSys.model = apiPreset.model || "gpt-image-2";
          nextSys.size = apiPreset.size || "1024x1024";
          nextSys.quality = apiPreset.quality || "auto";

          const existingPresets = Array.isArray(nextSys.openaiPresets) ? [...nextSys.openaiPresets] : [];
          const combinedPresets = [];

          store.presets.forEach(p => {
            if (p.provider === "novelai") return;
            const foundInSys = existingPresets.find(ep => ep.name === p.name || ep.baseUrl === p.baseUrl);
            combinedPresets.push({
              id: foundInSys ? foundInSys.id : (p.id || `preset_openai_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
              name: p.name,
              requestMode: p.requestMode || "server",
              apiKey: p.apiKey || "",
              baseUrl: p.baseUrl || "https://api.openai.com/v1",
              model: p.model || "gpt-image-2",
              size: p.size || "1024x1024",
              quality: p.quality || "auto",
              extraPrompt: p.id === apiPreset.id && promptPreset ? buildTripartitePrompt(promptPreset.positivePrompt, "", promptPreset.negativePrompt) : (foundInSys ? foundInSys.extraPrompt : ""),
            });
          });

          existingPresets.forEach(ep => {
            if (!combinedPresets.some(cp => cp.name === ep.name || cp.id === ep.id)) {
              combinedPresets.push(ep);
            }
          });

          let activePresetObj = combinedPresets.find(cp => cp.name === apiPreset.name || cp.baseUrl === apiPreset.baseUrl);
          if (activePresetObj) {
            combinedPresets.splice(combinedPresets.indexOf(activePresetObj), 1);
            combinedPresets.unshift(activePresetObj);
          } else {
            activePresetObj = {
              id: apiPreset.id || `preset_openai_${Date.now()}`,
              name: apiPreset.name,
              requestMode: nextSys.requestMode,
              apiKey: nextSys.apiKey,
              baseUrl: nextSys.baseUrl,
              model: nextSys.model,
              size: nextSys.size,
              quality: nextSys.quality,
              extraPrompt: promptPreset ? buildTripartitePrompt(promptPreset.positivePrompt, "", promptPreset.negativePrompt) : "",
            };
            combinedPresets.unshift(activePresetObj);
          }

          nextSys.openaiPresets = combinedPresets;
          nextSys.activeOpenAiPresetId = activePresetObj.id;
        }
      }

      if (promptPreset) {
        if (nextSys.provider === "novelai") {
          if (nextSys.novelai && Array.isArray(nextSys.novelai.presets) && nextSys.novelai.presets.length) {
            const activeId = nextSys.novelai.activePresetId;
            nextSys.novelai.presets = nextSys.novelai.presets.map((item, i) => {
              const isActive = activeId ? item.id === activeId : i === 0;
              if (!isActive) return item;
              return {
                ...item,
                positivePrompt: promptPreset.positivePrompt || "",
                negativePrompt: promptPreset.negativePrompt || "",
              };
            });
          }
        } else {
          nextSys.extraPrompt = buildTripartitePrompt(promptPreset.positivePrompt, "", promptPreset.negativePrompt);
          if (nextSys.openaiPresets?.length) {
            nextSys.openaiPresets[0].extraPrompt = nextSys.extraPrompt;
          }
        }
      }

      hostSave(nextSys);

      if (apiPreset) store.activeId = apiPreset.id;
      if (promptPreset) store.activePromptId = promptPreset.id;
      saveStore(store);

      const root = findPageRoot();
      if (root) {
        if (apiPreset) {
          setNativeValue(fieldControl(root, "生图提供方 / 引擎"), apiPreset.provider === "novelai" ? "novelai" : "openai");
          setNativeValue(fieldControl(root, "请求方式"), apiPreset.requestMode);
          await waitFrames(6);
          const page = findPageRoot() || root;
          if (apiPreset.provider === "novelai") {
            setNativeValue(fieldControl(page, "NovelAI API Token"), apiPreset.apiKey);
          } else {
            setNativeValue(fieldControl(page, "Base URL"), apiPreset.baseUrl);
            setNativeValue(fieldControl(page, "API Key"), apiPreset.apiKey);
            setNativeValue(fieldControl(page, "模型名"), apiPreset.model);
            setNativeValue(fieldControl(page, "尺寸"), apiPreset.size);
            setNativeValue(fieldControl(page, "质量"), apiPreset.quality);
            setNativeValue(fieldControl(page, "预设备注"), apiPreset.name);
            setNativeValue(fieldControl(page, "当前预设"), nextSys.activeOpenAiPresetId);
          }
        }
        if (promptPreset) {
          const page = findPageRoot() || root;
          setNativeValue(fieldControl(page, "补充提示词"), nextSys.extraPrompt || "");
          setNativeValue(fieldControl(page, "画师串 / 正面质量提示词 (Positive / Quality)"), promptPreset.positivePrompt || "");
          setNativeValue(fieldControl(page, "负面提示词 (Undesired Content / Negative)"), promptPreset.negativePrompt || "");
        }
      }

      if (!silent) {
        const aMsg = apiPreset ? `API「${apiPreset.name}」` : "";
        const pMsg = promptPreset ? `提示词「${promptPreset.name}」` : "";
        showGlobalToast(`已全局同步: ${[aMsg, pMsg].filter(Boolean).join(" + ")}`);
      }
    }

    // ────────────── 生图底层 Fetch 拦截与三段式装载 ──────────────
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const url = typeof args[0] === "string" ? args[0] : (args[0]?.url || "");
      const isImageGenCall = url.includes("/api/image-generation") || url.includes("/images/generations") || url.includes("novelai.net");

      if (isImageGenCall && args[1] && args[1].body && typeof args[1].body === "string") {
        try {
          const store = loadStore();
          const targetCharId = detectCurrentActiveCharId();
          if (targetCharId && store.charBindings && store.charBindings[targetCharId]) {
            const binding = store.charBindings[targetCharId];
            const boundApi = store.presets.find(a => a.id === binding.apiId);
            const boundPrompt = store.prompts.find(p => p.id === binding.promptId);
            const appearance = binding.appearancePrompt || "";

            if (boundApi || boundPrompt || appearance) {
              const payload = JSON.parse(args[1].body);

              const posStyle = boundPrompt ? boundPrompt.positivePrompt : "";
              const negConstraints = boundPrompt ? boundPrompt.negativePrompt : "";
              const triPrompt = buildTripartitePrompt(posStyle, appearance, negConstraints);

              if (triPrompt) {
                if (payload.prompt && !payload.prompt.includes(triPrompt)) {
                  payload.prompt = `${payload.prompt}\n\n${triPrompt}`;
                }
                if (payload.negativePrompt !== undefined && negConstraints) {
                  payload.negativePrompt = negConstraints;
                }
              }

              if (boundApi) {
                if (boundApi.provider !== "novelai") {
                  if (boundApi.apiKey) payload.apiKey = boundApi.apiKey;
                  if (boundApi.baseUrl) payload.baseUrl = boundApi.baseUrl;
                  if (boundApi.model) payload.model = boundApi.model;
                  if (boundApi.size) payload.size = boundApi.size;
                }
              }
              args[1].body = JSON.stringify(payload);
            }
          }
        } catch {}
      }
      return originalFetch.apply(this, args);
    };

    refreshSystemCharactersAsync();

    // ────────────── 文本相似度算法 (Bigram Dice) ──────────────
    function calcTextSimilarity(str1, str2) {
      const s1 = (str1 || "").trim().toLowerCase().replace(/\s+/g, " ");
      const s2 = (str2 || "").trim().toLowerCase().replace(/\s+/g, " ");
      if (s1 === s2) return 1.0;
      if (!s1 || !s2) return 0.0;
      if (s1.length < 2 || s2.length < 2) return s1 === s2 ? 1.0 : 0.0;

      const map1 = new Map();
      for (let i = 0; i < s1.length - 1; i++) {
        const sub = s1.substr(i, 2);
        map1.set(sub, (map1.get(sub) || 0) + 1);
      }
      let common = 0;
      for (let i = 0; i < s2.length - 1; i++) {
        const sub = s2.substr(i, 2);
        const count = map1.get(sub) || 0;
        if (count > 0) {
          map1.set(sub, count - 1);
          common++;
        }
      }
      const total = (s1.length - 1) + (s2.length - 1);
      return total > 0 ? (2 * common) / total : 0;
    }

    // ────────────── 智能抓取系统提示词 ──────────────
    function pullSystemPromptPresets(store) {
      const sys = hostLoad() || {};
      const rawCandidates = [];

      if (sys.extraPrompt && sys.extraPrompt.trim()) {
        rawCandidates.push({ name: "系统当前提示词", pos: sys.extraPrompt.trim(), neg: "" });
      }

      if (Array.isArray(sys.openaiPresets)) {
        sys.openaiPresets.forEach((op, idx) => {
          const text = (op.extraPrompt || "").trim();
          if (text) {
            rawCandidates.push({ name: op.name ? `提示词 - ${op.name}` : `系统预设提示词 ${idx + 1}`, pos: text, neg: "" });
          }
        });
      }

      if (sys.novelai && Array.isArray(sys.novelai.presets)) {
        sys.novelai.presets.forEach((np, idx) => {
          const pos = (np.positivePrompt || "").trim();
          const neg = (np.negativePrompt || "").trim();
          if (pos || neg) {
            rawCandidates.push({ name: np.name || `NAI 提示词 ${idx + 1}`, pos, neg });
          }
        });
      }

      const uniqueCandidates = [];
      for (const c of rawCandidates) {
        const isDup = uniqueCandidates.some(uc => uc.pos === c.pos && uc.neg === c.neg);
        if (!isDup) uniqueCandidates.push(c);
      }

      let addedCount = 0;
      for (const c of uniqueCandidates) {
        let maxSim = 0;
        let matchedOld = null;

        for (const ep of store.prompts) {
          const simPos = calcTextSimilarity(c.pos, ep.positivePrompt || "");
          const simNeg = calcTextSimilarity(c.neg, ep.negativePrompt || "");
          const sim = (c.neg || ep.negativePrompt) ? (simPos * 0.7 + simNeg * 0.3) : simPos;
          if (sim > maxSim) {
            maxSim = sim;
            matchedOld = ep;
          }
        }

        if (maxSim >= 0.999) continue;

        if (maxSim >= 0.95 && matchedOld) {
          const percent = Math.round(maxSim * 100);
          const pNew = c.pos.slice(0, 36) + (c.pos.length > 36 ? "..." : "");
          const pOld = (matchedOld.positivePrompt || "").slice(0, 36) + ((matchedOld.positivePrompt || "").length > 36 ? "..." : "");
          const allow = confirm(
            `⚠️ 提示词疑似重复 (${percent}% 相似)\n\n` +
            `待导入：「${c.name}」\n内容：${pNew}\n\n` +
            `已存有：「${matchedOld.name}」\n内容：${pOld}\n\n` +
            `确定要继续导入吗？`
          );
          if (!allow) continue;
        }

        store.prompts.push({
          id: `pmt_sys_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: c.name,
          positivePrompt: c.pos,
          negativePrompt: c.neg,
        });
        addedCount++;
      }

      saveStore(store);
      return addedCount;
    }

    // ────────────── 纯净拉取模型 ──────────────
    async function fetchRemoteModels(baseUrl, apiKey, requestMode) {
      const cleanUrl = (baseUrl || "").trim().replace(/\/+$/, "").replace(/\/images\/(?:generations|edits)$/i, "").replace(/\/images$/i, "");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);

      try {
        if (requestMode === "direct") {
          const modelsUrl = cleanUrl.endsWith("/models") ? cleanUrl : `${cleanUrl}/models`;
          const res = await fetch(modelsUrl, {
            method: "GET",
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`接口报错 ${res.status}`);
          const data = await res.json();
          const list = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : (data.models || []));
          return list.map(m => typeof m === "string" ? m : (m.id || m.name || m.model)).filter(Boolean);
        } else {
          const res = await fetch("/api/image-generation/models", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ apiKey, baseUrl: cleanUrl }),
            signal: controller.signal,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.error) throw new Error(data.error || `请求失败 ${res.status}`);
          return Array.isArray(data.models) ? data.models : [];
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    // ────────────── CSS 样式 ──────────────
    ctx.ui.injectCSS(`
      .cube-inject-card {
        background: #ffffff;
        border: 1px solid rgba(0, 0, 0, 0.06);
        border-radius: 20px;
        padding: 12px 14px;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.03);
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-top: -6px;
        margin-bottom: 2px;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        animation: cube-inject-fade 0.2s ease-out;
      }
      @keyframes cube-inject-fade {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .cube-inject-open-btn {
        width: 100%;
        background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
        border: 1px solid rgba(2, 132, 199, 0.2);
        border-radius: 14px;
        padding: 10px 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        color: #0369a1;
        box-sizing: border-box;
        transition: all 0.18s ease;
        box-shadow: 0 2px 6px rgba(2, 132, 199, 0.08);
      }
      .cube-inject-open-btn:active {
        transform: scale(0.985);
        background: #bae6fd;
      }
      .cube-inject-divider {
        height: 1px;
        background: rgba(0, 0, 0, 0.04);
        margin: 0 -2px;
      }
      .cube-inject-switch-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 2px 2px;
      }
      .cube-inject-switch-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .cube-inject-switch-title {
        font-size: 13.5px;
        font-weight: 600;
        color: #1e293b;
      }
      .cube-inject-switch-desc {
        font-size: 11.5px;
        color: #64748b;
        line-height: 1.35;
      }
      .cube-ios-switch {
        position: relative;
        display: inline-block;
        width: 44px;
        height: 24px;
        flex-shrink: 0;
        cursor: pointer;
      }
      .cube-ios-switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      .cube-ios-slider {
        position: absolute;
        cursor: pointer;
        top: 0; left: 0; right: 0; bottom: 0;
        background-color: #cbd5e1;
        transition: 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        border-radius: 24px;
      }
      .cube-ios-slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        transition: 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0,0,0,0.18);
      }
      .cube-ios-switch input:checked + .cube-ios-slider {
        background-color: #22c55e;
      }
      .cube-ios-switch input:checked + .cube-ios-slider:before {
        transform: translateX(20px);
      }

      /* 主弹窗 Modal */
      .cube-modal {
        width: 94vw;
        max-width: 410px;
        max-height: 84vh;
        background: rgba(255, 255, 255, 0.96);
        backdrop-filter: blur(28px) saturate(180%);
        -webkit-backdrop-filter: blur(28px) saturate(180%);
        border: 1px solid rgba(255, 255, 255, 0.95);
        border-radius: 24px;
        box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.04);
        color: #1e293b;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        animation: cube-fade-in 0.22s ease-out;
      }
      @keyframes cube-fade-in {
        from { opacity: 0; transform: scale(0.96) translateY(8px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      .cube-header {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 15px 16px 10px;
        box-sizing: border-box;
      }
      .cube-title {
        font-size: 16.5px;
        font-weight: 700;
        color: #0f172a;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .cube-close-btn {
        width: 28px;
        height: 28px;
        border-radius: 14px;
        background: rgba(0, 0, 0, 0.05);
        border: none;
        color: #64748b;
        font-size: 15px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }

      /* 顶部 Tab 栏 (精细适配不溢出) */
      .cube-tabs {
        flex-shrink: 0;
        display: flex;
        background: rgba(0, 0, 0, 0.05);
        border-radius: 14px;
        margin: 0 10px 12px;
        padding: 3px;
        box-sizing: border-box;
        align-items: center;
      }
      .cube-tab-btn {
        flex: 1 1 0;
        min-width: 0;
        padding: 6.5px 2px;
        background: transparent;
        color: #64748b;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.18s ease;
        white-space: nowrap;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1.5px;
        box-sizing: border-box;
      }
      .cube-tab-btn.active {
        background: #ffffff;
        color: #0284c7;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      }
      .cube-tab-icon {
        font-size: 11.5px;
        line-height: 1;
        flex-shrink: 0;
      }
      .cube-tab-text {
        font-size: 11px;
        font-weight: 600;
        line-height: 1;
      }
      .cube-tab-badge {
        font-size: 9px;
        line-height: 1;
        padding: 1.5px 3.5px;
        border-radius: 5px;
        background: rgba(0, 0, 0, 0.06);
        color: #64748b;
        font-weight: 700;
        flex-shrink: 0;
      }
      .cube-tab-btn.active .cube-tab-badge {
        background: rgba(2, 132, 199, 0.12);
        color: #0284c7;
      }
      .cube-body {
        padding: 0 14px 18px;
        overflow-y: auto;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 12px;
        box-sizing: border-box;
      }
      .cube-card {
        background: rgba(255, 255, 255, 0.7);
        border: 1px solid rgba(0, 0, 0, 0.06);
        border-radius: 16px;
        padding: 12px 14px;
        cursor: pointer;
        transition: all 0.18s ease;
      }
      .cube-card.selected {
        background: rgba(2, 132, 199, 0.07);
        border-color: #0284c7;
        box-shadow: 0 4px 12px rgba(2, 132, 199, 0.12);
      }
      .cube-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
      }
      .cube-card-name {
        font-size: 14px;
        font-weight: 600;
        color: #1e293b;
      }
      .cube-badge {
        font-size: 11px;
        font-weight: 500;
        padding: 2px 8px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.05);
        color: #64748b;
      }
      .cube-badge.active {
        background: #0284c7;
        color: #ffffff;
      }
      .cube-card-desc {
        font-size: 12px;
        color: #64748b;
        line-height: 1.45;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .cube-edit-icon-btn {
        background: rgba(0,0,0,0.04);
        border: 1px solid rgba(0,0,0,0.06);
        border-radius: 8px;
        padding: 3px 7px;
        font-size: 12px;
        color: #0284c7;
        cursor: pointer;
      }
      .cube-input {
        width: 100%;
        box-sizing: border-box;
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(0, 0, 0, 0.1);
        color: #1e293b;
        padding: 9px 12px;
        border-radius: 12px;
        font-size: 13px;
        margin-top: 4px;
      }
      .cube-input:focus {
        border-color: #0284c7;
        outline: none;
        box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
      }
      .cube-label {
        font-size: 12px;
        font-weight: 600;
        color: #475569;
        margin-top: 8px;
        display: block;
      }
      .cube-btn-primary {
        background: #0284c7;
        color: #ffffff;
        border: none;
        border-radius: 14px;
        padding: 12px 16px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        box-shadow: 0 4px 12px rgba(2, 132, 199, 0.25);
        transition: background 0.15s, opacity 0.15s;
      }
      .cube-btn-secondary {
        background: rgba(0, 0, 0, 0.05);
        color: #334155;
        border: 1px solid rgba(0, 0, 0, 0.06);
        border-radius: 12px;
        padding: 8px 12px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s;
      }
      .cube-btn-danger {
        background: rgba(239, 68, 68, 0.1);
        color: #ef4444;
        border: 1px solid rgba(239, 68, 68, 0.2);
        border-radius: 12px;
        padding: 8px 12px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }
      .cube-fab {
        position: fixed;
        right: 0px;
        top: 38%;
        width: 44px;
        height: 44px;
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.88);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border: 1px solid rgba(255, 255, 255, 0.95);
        box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(0, 0, 0, 0.06);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 9999;
        user-select: none;
        touch-action: none;
        transition: transform 0.26s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.26s ease, border-radius 0.26s ease;
      }
      .cube-fab:active {
        transform: scale(0.92) !important;
      }
      .cube-fab-icon {
        font-size: 20px;
        line-height: 1;
      }
      .cube-fab.docked-right {
        transform: translateX(62%);
        opacity: 0.4;
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
      }
      .cube-fab.docked-right:hover {
        transform: translateX(0);
        opacity: 1;
      }
      .cube-fab.docked-left {
        transform: translateX(-62%);
        opacity: 0.4;
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
      }
      .cube-fab.docked-left:hover {
        transform: translateX(0);
        opacity: 1;
      }
    `);

    // ────────────── 主弹窗 ──────────────
    async function openCubeModal() {
      let store = loadStore();
      let currentTab = "pair";
      let editingApi = null;
      let editingPrompt = null;
      let bindingCharId = null;

      await refreshSystemCharactersAsync();

      ctx.ui.openModal((modalEl, { close }) => {
        modalEl.innerHTML = "";
        const root = document.createElement("div");
        root.className = "cube-modal";

        function render() {
          root.innerHTML = "";
          store = loadStore();
          const characters = getSystemCharacters();

          const header = document.createElement("div");
          header.className = "cube-header";
          header.innerHTML = `
            <div class="cube-title">✨ 生图预设魔方</div>
            <button class="cube-close-btn" title="关闭">✕</button>
          `;
          header.querySelector(".cube-close-btn").onclick = close;
          root.appendChild(header);

          const tabs = document.createElement("div");
          tabs.className = "cube-tabs";
          const tabList = [
            { id: "pair", label: "搭配", icon: "⚡", count: null },
            { id: "char", label: "角色", icon: "🎭", count: null },
            { id: "prompt", label: "提示词", icon: "🎨", count: store.prompts.length },
            { id: "api", label: "API", icon: "🔌", count: store.presets.length },
            { id: "data", label: "备份", icon: "📦", count: null },
          ];

          tabList.forEach(t => {
            const btn = document.createElement("button");
            btn.className = `cube-tab-btn ${currentTab === t.id ? "active" : ""}`;
            
            // 应用不等距间隔
            const spacing = TAB_SPACING_CONFIG[t.id] ?? 0;
            if (spacing > 0) {
              btn.style.marginRight = `${spacing}px`;
            }

            btn.innerHTML = `
              <span class="cube-tab-icon">${t.icon}</span>
              <span class="cube-tab-text">${t.label}</span>
              ${t.count !== null && t.count !== undefined ? `<span class="cube-tab-badge">${t.count}</span>` : ""}
            `;
            btn.onclick = () => {
              currentTab = t.id;
              editingApi = null;
              editingPrompt = null;
              bindingCharId = null;
              render();
            };
            tabs.appendChild(btn);
          });
          root.appendChild(tabs);

          const body = document.createElement("div");
          body.className = "cube-body";

          // Tab 1: 自由搭配
          if (currentTab === "pair") {
            const curApi = store.presets.find(a => a.id === store.activeId) || store.presets[0];
            const curPrompt = store.prompts.find(p => p.id === store.activePromptId) || store.prompts[0];

            const statusCard = document.createElement("div");
            statusCard.style.cssText = "background:rgba(2,132,199,0.06);border:1px solid rgba(2,132,199,0.18);border-radius:16px;padding:12px 14px;font-size:13px;";
            statusCard.innerHTML = `
              <div style="font-weight:700;color:#0284c7;margin-bottom:6px;">当前全局默认搭配</div>
              <div style="display:flex;flex-direction:column;gap:3px;color:#334155;">
                <div>🔌 <b>API 配置:</b> ${curApi ? curApi.name : "<span style='color:#94a3b8;'>未选择</span>"}</div>
                <div>🎨 <b>提示词:</b> ${curPrompt ? curPrompt.name : "<span style='color:#94a3b8;'>未选择 (不注入补充词)</span>"}</div>
              </div>
            `;
            body.appendChild(statusCard);

            const apiHead = document.createElement("div");
            apiHead.style.cssText = "font-size:12px;font-weight:700;color:#64748b;margin-top:4px;";
            apiHead.textContent = "1. 选择 API 配置";
            body.appendChild(apiHead);

            if (store.presets.length === 0) {
              const emptyApi = document.createElement("div");
              emptyApi.style.cssText = "font-size:12px;color:#94a3b8;padding:8px 4px;";
              emptyApi.textContent = "暂无 API 配置，请到「🔌 API」标签新建或抓取系统配置";
              body.appendChild(emptyApi);
            } else {
              store.presets.forEach(item => {
                const isSel = item.id === (curApi ? curApi.id : "");
                const card = document.createElement("div");
                card.className = `cube-card ${isSel ? "selected" : ""}`;
                card.innerHTML = `
                  <div class="cube-card-header">
                    <span class="cube-card-name">${item.name}</span>
                    <span class="cube-badge ${isSel ? "active" : ""}">${item.model || "默认模型"}</span>
                  </div>
                  <div class="cube-card-desc">${item.provider === "novelai" ? "NovelAI 官方直连" : (item.baseUrl || "默认 URL")}</div>
                `;
                card.onclick = async () => {
                  await applyCombination(item, curPrompt);
                  render();
                };
                body.appendChild(card);
              });
            }

            const promptHead = document.createElement("div");
            promptHead.style.cssText = "font-size:12px;font-weight:700;color:#64748b;margin-top:6px;";
            promptHead.textContent = "2. 选择生图提示词";
            body.appendChild(promptHead);

            if (store.prompts.length === 0) {
              const emptyPrompt = document.createElement("div");
              emptyPrompt.style.cssText = "font-size:12px;color:#94a3b8;padding:8px 4px;";
              emptyPrompt.textContent = "暂无提示词，请到「🎨 提示词」标签新建或抓取系统提示词";
              body.appendChild(emptyPrompt);
            } else {
              store.prompts.forEach(item => {
                const isSel = item.id === (curPrompt ? curPrompt.id : "");
                const card = document.createElement("div");
                card.className = `cube-card ${isSel ? "selected" : ""}`;
                card.innerHTML = `
                  <div class="cube-card-header">
                    <span class="cube-card-name">${item.name}</span>
                    <span class="cube-badge ${isSel ? "active" : ""}">${isSel ? "已激活" : "选择"}</span>
                  </div>
                  <div class="cube-card-desc">${item.positivePrompt || "无正向词"}</div>
                `;
                card.onclick = async () => {
                  await applyCombination(curApi, item);
                  render();
                };
                body.appendChild(card);
              });
            }
          }
          // Tab 2: 角色专属生图绑定管理 (带角色外貌强锁)
          else if (currentTab === "char") {
            if (bindingCharId) {
              const char = characters.find(c => c.id === bindingCharId);
              const charName = char?.name || "该角色";
              const currentBinding = store.charBindings[bindingCharId] || {};
              const boundApi = store.presets.find(a => a.id === currentBinding.apiId);
              const boundPrompt = store.prompts.find(p => p.id === currentBinding.promptId);
              const currentAppearance = currentBinding.appearancePrompt || "";

              const topBar = document.createElement("div");
              topBar.style.cssText = "display:flex;justify-content:space-between;align-items:center;";
              topBar.innerHTML = `
                <div style="font-weight:700;font-size:14px;color:#0284c7;">🎭「${charName}」专属生图绑定</div>
                <button id="btn_back_char_list" class="cube-btn-secondary" style="padding:4px 8px;font-size:12px;">返回列表</button>
              `;
              body.appendChild(topBar);

              topBar.querySelector("#btn_back_char_list").onclick = () => {
                bindingCharId = null;
                render();
              };

              const statusCard = document.createElement("div");
              statusCard.style.cssText = "background:rgba(2,132,199,0.06);border:1px solid rgba(2,132,199,0.18);border-radius:16px;padding:12px 14px;font-size:13px;";
              statusCard.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                  <span style="font-weight:700;color:#0284c7;">当前生效搭配</span>
                  ${(currentBinding.apiId || currentBinding.promptId || currentBinding.appearancePrompt) ? `<button id="btn_clear_binding" class="cube-btn-danger" style="padding:2px 6px;font-size:11px;">恢复继承全局</button>` : `<span class="cube-badge">继承全局默认</span>`}
                </div>
                <div style="display:flex;flex-direction:column;gap:3px;color:#334155;">
                  <div>🔌 <b>专属 API:</b> ${boundApi ? boundApi.name : "<span style='color:#94a3b8;'>继承全局默认</span>"}</div>
                  <div>🎨 <b>专属画风:</b> ${boundPrompt ? boundPrompt.name : "<span style='color:#94a3b8;'>继承全局默认</span>"}</div>
                  <div>👤 <b>外貌锁定:</b> ${currentAppearance ? "<span style='color:#0284c7;'>已设置专属特征</span>" : "<span style='color:#94a3b8;'>未指定 (自由生成)</span>"}</div>
                </div>
              `;
              body.appendChild(statusCard);

              const clearBtn = statusCard.querySelector("#btn_clear_binding");
              if (clearBtn) {
                clearBtn.onclick = () => {
                  delete store.charBindings[bindingCharId];
                  saveStore(store);
                  showGlobalToast(`已将「${charName}」重置为继承全局！`);
                  render();
                };
              }

              // ── 0. 角色专属外貌提示词模块 ──
              const appBox = document.createElement("div");
              appBox.style.cssText = "background:rgba(255,255,255,0.85);border:1px solid rgba(2,132,199,0.18);border-radius:14px;padding:10px 12px;margin-top:4px;";
              appBox.innerHTML = `
                <div style="font-size:12px;font-weight:700;color:#0284c7;margin-bottom:6px;">👤 角色专属外貌提示词 (强制锁定特征)</div>
                <textarea id="in_char_appearance" class="cube-input" rows="3" placeholder="填写该角色的固定特征（如：白发、琥珀色眼睛、双马尾、红卫衣 / white hair, amber eyes...）">${currentAppearance}</textarea>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
                  <span style="font-size:10.5px;color:#94a3b8;">生图时将作为最高优先级插入画风与负面之间</span>
                  <button id="btn_save_char_app" class="cube-btn-primary" style="padding:4px 12px;font-size:12px;">保存外貌</button>
                </div>
              `;
              body.appendChild(appBox);

              appBox.querySelector("#btn_save_char_app").onclick = () => {
                const val = appBox.querySelector("#in_char_appearance").value.trim();
                store.charBindings[bindingCharId] = {
                  ...store.charBindings[bindingCharId],
                  appearancePrompt: val,
                };
                saveStore(store);
                showGlobalToast(`已保存「${charName}」专属外貌锁定！`);
                render();
              };

              // ── 1. 选择专属 API ──
              const apiHead = document.createElement("div");
              apiHead.style.cssText = "font-size:12px;font-weight:700;color:#64748b;margin-top:6px;";
              apiHead.textContent = "1. 为该角色选择专属 API (点击即换)";
              body.appendChild(apiHead);

              store.presets.forEach(item => {
                const isSel = item.id === currentBinding.apiId;
                const card = document.createElement("div");
                card.className = `cube-card ${isSel ? "selected" : ""}`;
                card.innerHTML = `
                  <div class="cube-card-header">
                    <span class="cube-card-name">${item.name}</span>
                    <span class="cube-badge ${isSel ? "active" : ""}">${isSel ? "专属激活" : (item.model || "默认")}</span>
                  </div>
                  <div class="cube-card-desc">${item.provider === "novelai" ? "NovelAI 官方直连" : (item.baseUrl || "默认 URL")}</div>
                `;
                card.onclick = () => {
                  store.charBindings[bindingCharId] = {
                    ...store.charBindings[bindingCharId],
                    apiId: item.id,
                  };
                  saveStore(store);
                  showGlobalToast(`已绑定「${charName}」API: ${item.name}`);
                  render();
                };
                body.appendChild(card);
              });

              // ── 2. 选择专属提示词 ──
              const promptHead = document.createElement("div");
              promptHead.style.cssText = "font-size:12px;font-weight:700;color:#64748b;margin-top:6px;";
              promptHead.textContent = "2. 为该角色选择专属画风提示词 (点击即换)";
              body.appendChild(promptHead);

              store.prompts.forEach(item => {
                const isSel = item.id === currentBinding.promptId;
                const card = document.createElement("div");
                card.className = `cube-card ${isSel ? "selected" : ""}`;
                card.innerHTML = `
                  <div class="cube-card-header">
                    <span class="cube-card-name">${item.name}</span>
                    <span class="cube-badge ${isSel ? "active" : ""}">${isSel ? "专属激活" : "选择"}</span>
                  </div>
                  <div class="cube-card-desc">${item.positivePrompt || "无正向词"}</div>
                `;
                card.onclick = () => {
                  store.charBindings[bindingCharId] = {
                    ...store.charBindings[bindingCharId],
                    promptId: item.id,
                  };
                  saveStore(store);
                  showGlobalToast(`已绑定「${charName}」提示词: ${item.name}`);
                  render();
                };
                body.appendChild(card);
              });
            } else {
              const info = document.createElement("div");
              info.style.cssText = "font-size:12px;color:#64748b;background:rgba(0,0,0,0.03);padding:10px 12px;border-radius:14px;";
              info.textContent = "点击下方任意角色，即可为其单独绑定专属外貌特征、API 与提示词；未单独绑定则跟随全局配置。";
              body.appendChild(info);

              if (characters.length === 0) {
                const empty = document.createElement("div");
                empty.style.cssText = "text-align:center;padding:30px 0;color:#94a3b8;font-size:13px;";
                empty.textContent = "正在读取角色库或暂无角色卡，请稍候...";
                body.appendChild(empty);
              } else {
                characters.forEach(char => {
                  const b = store.charBindings[char.id] || {};
                  const isBound = Boolean(b.apiId || b.promptId || b.appearancePrompt);
                  const boundApi = store.presets.find(a => a.id === b.apiId);
                  const boundPrompt = store.prompts.find(p => p.id === b.promptId);

                  const card = document.createElement("div");
                  card.className = `cube-card ${isBound ? "selected" : ""}`;
                  card.style.cssText = "display:flex;align-items:center;gap:10px;";
                  card.innerHTML = `
                    <div style="width:38px;height:38px;border-radius:19px;overflow:hidden;background:#e2e8f0;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:700;color:#64748b;">
                      ${char.avatar ? `<img src="${char.avatar}" style="width:100%;height:100%;object-fit:cover;" />` : char.name.charAt(0)}
                    </div>
                    <div style="flex:1;min-width:0;">
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
                        <span style="font-weight:600;font-size:13.5px;color:#1e293b;">${char.name}</span>
                        <span class="cube-badge ${isBound ? "active" : ""}">${isBound ? "专属配置" : "继承全局"}</span>
                      </div>
                      <div style="font-size:11.5px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        ${isBound ? `🔌 ${boundApi?.name || "全局"} + 🎨 ${boundPrompt?.name || "全局"}${b.appearancePrompt ? " + 👤 外貌锁定" : ""}` : "点击配置该角色专属画风、外貌与 API"}
                      </div>
                    </div>
                    <span style="font-size:15px;color:#94a3b8;">›</span>
                  `;
                  card.onclick = () => {
                    bindingCharId = char.id;
                    render();
                  };
                  body.appendChild(card);
                });
              }
            }
          }

          // Tab 3: 提示词管理
          else if (currentTab === "prompt") {
            if (editingPrompt) {
              const isUpdate = Boolean(editingPrompt.id);
              const title = document.createElement("div");
              title.style.cssText = "font-size:14px;font-weight:700;color:#0284c7;";
              title.textContent = isUpdate ? "✏️ 编辑提示词预设" : "+ 新建提示词预设";
              body.appendChild(title);

              body.innerHTML += `
                <div>
                  <label class="cube-label">提示词名称</label>
                  <input id="in_p_name" class="cube-input" value="${editingPrompt.name || ""}" placeholder="如：极简线稿 / 赛博朋克 / 动漫大师">
                </div>
                <div>
                  <label class="cube-label">画风 / 正面提示词 (Positive Prompt)</label>
                  <textarea id="in_p_pos" class="cube-input" rows="5" placeholder="画面艺术画风、光影、质量词">${editingPrompt.positivePrompt || ""}</textarea>
                </div>
                <div>
                  <label class="cube-label">负面提示词 (Negative Prompt，选填)</label>
                  <textarea id="in_p_neg" class="cube-input" rows="3" placeholder="不想出现的画面元素，如 lowres, bad hands, blurry...">${editingPrompt.negativePrompt || ""}</textarea>
                </div>
              `;

              const row = document.createElement("div");
              row.style.cssText = "display:flex;gap:8px;margin-top:10px;";
              row.innerHTML = `
                <button id="btn_cancel_p" class="cube-btn-secondary" style="flex:1;">取消编辑</button>
                <button id="btn_save_p" class="cube-btn-primary" style="flex:1;">${isUpdate ? "更新预设" : "保存预设"}</button>
              `;
              body.appendChild(row);

              body.querySelector("#btn_save_p").onclick = async () => {
                const name = body.querySelector("#in_p_name").value.trim() || "未命名提示词";
                const positivePrompt = body.querySelector("#in_p_pos").value.trim();
                const negativePrompt = body.querySelector("#in_p_neg").value.trim();

                let updatedItem;
                if (editingPrompt.id) {
                  const idx = store.prompts.findIndex(p => p.id === editingPrompt.id);
                  updatedItem = { ...editingPrompt, name, positivePrompt, negativePrompt };
                  if (idx >= 0) store.prompts[idx] = updatedItem;
                } else {
                  updatedItem = { id: `pmt_${Date.now()}`, name, positivePrompt, negativePrompt };
                  store.prompts.push(updatedItem);
                }
                saveStore(store);

                if (store.activePromptId === updatedItem.id) {
                  const curApi = store.presets.find(a => a.id === store.activeId);
                  await applyCombination(curApi, updatedItem);
                }

                editingPrompt = null;
                render();
              };

              body.querySelector("#btn_cancel_p").onclick = () => {
                editingPrompt = null;
                render();
              };
            } else {
              const topBar = document.createElement("div");
              topBar.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:6px;";
              topBar.innerHTML = `
                <span style="font-size:13px;font-weight:600;color:#64748b;">提示词列表</span>
                <div style="display:flex;gap:6px;">
                  <button id="btn_pull_sys_p" class="cube-btn-secondary" style="color:#0284c7;padding:5px 9px;font-size:12px;">📥 抓取系统</button>
                  <button id="btn_add_p" class="cube-btn-secondary" style="color:#0284c7;padding:5px 9px;font-size:12px;">+ 新建</button>
                </div>
              `;
              body.appendChild(topBar);

              body.querySelector("#btn_pull_sys_p").onclick = () => {
                const count = pullSystemPromptPresets(store);
                if (count > 0) showGlobalToast(`成功抓取 ${count} 个新提示词！`);
                else showGlobalToast("未发现新的提示词，已存预设已全覆盖");
                render();
              };

              body.querySelector("#btn_add_p").onclick = () => {
                editingPrompt = {};
                render();
              };

              if (store.prompts.length === 0) {
                const empty = document.createElement("div");
                empty.style.cssText = "text-align:center;padding:30px 0;color:#94a3b8;font-size:13px;";
                empty.textContent = "点击右上角「📥 抓取系统」直接导入现有提示词，或「+ 新建」";
                body.appendChild(empty);
              } else {
                store.prompts.forEach((item, idx) => {
                  const card = document.createElement("div");
                  card.className = "cube-card";
                  card.innerHTML = `
                    <div class="cube-card-header">
                      <span class="cube-card-name">${item.name}</span>
                      <div style="display:flex;gap:6px;align-items:center;">
                        <button class="cube-edit-icon-btn edit-btn" title="编辑预设">✏️ 编辑</button>
                        <button class="cube-btn-danger del-btn" style="padding:2px 8px;font-size:11px;">删除</button>
                      </div>
                    </div>
                    <div class="cube-card-desc">${item.positivePrompt || "无正向词"}</div>
                  `;
                  card.querySelector(".edit-btn").onclick = (e) => {
                    e.stopPropagation();
                    editingPrompt = { ...item };
                    render();
                  };
                  card.querySelector(".del-btn").onclick = (e) => {
                    e.stopPropagation();
                    if (confirm(`确定删除提示词「${item.name}」吗？`)) {
                      store.prompts.splice(idx, 1);
                      saveStore(store);
                      render();
                    }
                  };
                  body.appendChild(card);
                });
              }
            }
          }

          // Tab 4: API 配置管理
          else if (currentTab === "api") {
            if (editingApi) {
              const isUpdate = Boolean(editingApi.id);
              const title = document.createElement("div");
              title.style.cssText = "font-size:14px;font-weight:700;color:#0284c7;";
              title.textContent = isUpdate ? "✏️ 编辑 API 配置" : "+ 新建 API 配置";
              body.appendChild(title);

              const currentProvider = editingApi.provider || "openai";

              body.innerHTML += `
                <div>
                  <label class="cube-label">配置名称</label>
                  <input id="in_a_name" class="cube-input" value="${editingApi.name || ""}" placeholder="如：我的生图 API / 中转站">
                </div>
                <div>
                  <label class="cube-label">API 类型</label>
                  <select id="in_a_provider" class="cube-input">
                    <option value="openai" ${currentProvider !== "novelai" ? "selected" : ""}>OpenAI 兼容 / 第三方中转站 (Flux / SD / NAI中转)</option>
                    <option value="novelai" ${currentProvider === "novelai" ? "selected" : ""}>NovelAI 官方直接连接 (使用官网 Persistent Token)</option>
                  </select>
                </div>
                <div id="box_url_key_section" style="display:${currentProvider === "novelai" ? "none" : "block"}">
                  <label class="cube-label">Base URL</label>
                  <input id="in_a_url" class="cube-input" value="${editingApi.baseUrl || "https://api.openai.com/v1"}" placeholder="https://api.rua.chat/v1">

                  <label class="cube-label">API Key</label>
                  <input id="in_a_key" type="password" class="cube-input" value="${editingApi.apiKey || ""}" placeholder="sk-...">

                  <label class="cube-label">模型名 (Model)</label>
                  <div style="display:flex;gap:6px;margin-top:4px;">
                    <input id="in_a_model" class="cube-input" style="flex:1;margin-top:0;" value="${editingApi.model || ""}" placeholder="可手动输入或点击右侧拉取">
                    <button id="btn_fetch_models" class="cube-btn-secondary" style="white-space:nowrap;padding:0 12px;font-size:12px;">🔄 拉取模型</button>
                  </div>
                  <div id="box_model_select_container" style="display:none;margin-top:6px;">
                    <select id="sel_remote_model" class="cube-input">
                      <option value="">▼ 点击选择拉取到的真实模型...</option>
                    </select>
                  </div>

                  <label class="cube-label">尺寸</label>
                  <select id="in_a_size" class="cube-input">
                    <option value="1024x1024" ${editingApi.size === "1024x1024" ? "selected" : ""}>1024x1024 (正方形 1:1)</option>
                    <option value="1024x1536" ${editingApi.size === "1024x1536" ? "selected" : ""}>1024x1536 (竖屏 2:3)</option>
                    <option value="1536x1024" ${editingApi.size === "1536x1024" ? "selected" : ""}>1536x1024 (横屏 3:2)</option>
                    <option value="auto" ${editingApi.size === "auto" ? "selected" : ""}>auto</option>
                  </select>
                </div>

                <div id="box_nai_official_key" style="display:${currentProvider === "novelai" ? "block" : "none"}">
                  <label class="cube-label">NovelAI API Token</label>
                  <input id="in_a_nai_key" type="password" class="cube-input" value="${editingApi.apiKey || ""}" placeholder="pst-...">
                </div>

                <div>
                  <label class="cube-label">请求方式</label>
                  <select id="in_a_reqmode" class="cube-input">
                    <option value="server" ${editingApi.requestMode !== "direct" ? "selected" : ""}>服务端转发 (推荐)</option>
                    <option value="direct" ${editingApi.requestMode === "direct" ? "selected" : ""}>浏览器直连</option>
                  </select>
                </div>
              `;

              const provSelect = body.querySelector("#in_a_provider");
              provSelect.onchange = (e) => {
                const isNaiOfficial = e.target.value === "novelai";
                body.querySelector("#box_url_key_section").style.display = isNaiOfficial ? "none" : "block";
                body.querySelector("#box_nai_official_key").style.display = isNaiOfficial ? "block" : "none";
              };

              const selRemote = body.querySelector("#sel_remote_model");
              const selectContainer = body.querySelector("#box_model_select_container");
              if (selRemote) {
                selRemote.onchange = (e) => {
                  if (e.target.value) body.querySelector("#in_a_model").value = e.target.value;
                };
              }

              const fetchBtn = body.querySelector("#btn_fetch_models");
              if (fetchBtn) {
                fetchBtn.onclick = async () => {
                  const url = body.querySelector("#in_a_url").value.trim();
                  const key = body.querySelector("#in_a_key").value.trim();
                  const reqMode = body.querySelector("#in_a_reqmode").value;
                  if (!url || !key) {
                    showGlobalToast("请先填写 Base URL 和 API Key！");
                    return;
                  }
                  fetchBtn.textContent = "拉取中...";
                  fetchBtn.disabled = true;
                  try {
                    const list = await fetchRemoteModels(url, key, reqMode);
                    if (list.length > 0) {
                      selRemote.innerHTML = `<option value="">▼ 成功拉取到 ${list.length} 个模型 (点击填入)</option>` +
                        list.map(m => `<option value="${m}">${m}</option>`).join("");
                      selectContainer.style.display = "block";
                      showGlobalToast(`已拉取到 ${list.length} 个模型！`);
                    } else {
                      showGlobalToast("接口返回为空，可在输入框手动输入");
                    }
                  } catch (err) {
                    showGlobalToast(`拉取失败: ${err.message || "连接超时"}`);
                  } finally {
                    fetchBtn.textContent = "🔄 拉取模型";
                    fetchBtn.disabled = false;
                  }
                };
              }

              const row = document.createElement("div");
              row.style.cssText = "display:flex;gap:8px;margin-top:10px;";
              row.innerHTML = `
                <button id="btn_cancel_a" class="cube-btn-secondary" style="flex:1;">取消编辑</button>
                <button id="btn_save_a" class="cube-btn-primary" style="flex:1;">${isUpdate ? "更新预设" : "保存预设"}</button>
              `;
              body.appendChild(row);

              body.querySelector("#btn_save_a").onclick = async () => {
                const name = body.querySelector("#in_a_name").value.trim() || "未命名 API";
                const provider = body.querySelector("#in_a_provider").value;
                const apiKey = provider === "novelai"
                  ? body.querySelector("#in_a_nai_key").value.trim()
                  : body.querySelector("#in_a_key").value.trim();
                const requestMode = body.querySelector("#in_a_reqmode").value;
                const baseUrl = provider === "novelai" ? "" : (body.querySelector("#in_a_url").value.trim() || "https://api.openai.com/v1");
                const model = provider === "novelai" ? "nai-diffusion-4-curated-preview" : body.querySelector("#in_a_model").value.trim();
                const size = provider === "novelai" ? "" : body.querySelector("#in_a_size").value;

                let updatedItem;
                if (editingApi.id) {
                  const idx = store.presets.findIndex(a => a.id === editingApi.id);
                  updatedItem = { ...editingApi, name, provider, apiKey, requestMode, baseUrl, model, size };
                  if (idx >= 0) store.presets[idx] = updatedItem;
                } else {
                  updatedItem = { id: `api_${Date.now()}`, name, provider, apiKey, requestMode, baseUrl, model, size };
                  store.presets.push(updatedItem);
                }
                saveStore(store);

                if (store.activeId === updatedItem.id) {
                  const curPrompt = store.prompts.find(p => p.id === store.activePromptId);
                  await applyCombination(updatedItem, curPrompt);
                }

                editingApi = null;
                render();
              };

              body.querySelector("#btn_cancel_a").onclick = () => {
                editingApi = null;
                render();
              };
            } else {
              const topBar = document.createElement("div");
              topBar.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:6px;";
              topBar.innerHTML = `
                <span style="font-size:13px;font-weight:600;color:#64748b;">API 列表</span>
                <div style="display:flex;gap:6px;">
                  <button id="btn_pull_sys_a" class="cube-btn-secondary" style="color:#0284c7;padding:5px 9px;font-size:12px;">📥 抓取系统</button>
                  <button id="btn_add_a" class="cube-btn-secondary" style="color:#0284c7;padding:5px 9px;font-size:12px;">+ 新建</button>
                </div>
              `;
              body.appendChild(topBar);

              body.querySelector("#btn_pull_sys_a").onclick = () => {
                const sys = hostLoad() || {};
                let added = 0;
                const sysOpenAiList = Array.isArray(sys.openaiPresets) ? sys.openaiPresets : [];
                if (sysOpenAiList.length > 0) {
                  sysOpenAiList.forEach((sp, idx) => {
                    const exists = store.presets.some(p => (p.name === sp.name && p.baseUrl === sp.baseUrl) || (p.baseUrl === sp.baseUrl && p.apiKey === sp.apiKey && p.model === sp.model));
                    if (!exists) {
                      store.presets.push({
                        id: `api_sys_${Date.now()}_${idx}`,
                        name: sp.name || `系统预设 ${idx + 1}`,
                        provider: "openai",
                        requestMode: sp.requestMode || sys.requestMode || "server",
                        baseUrl: sp.baseUrl || "https://api.openai.com/v1",
                        apiKey: sp.apiKey || "",
                        model: sp.model || "gpt-image-2",
                        size: sp.size || "1024x1024",
                      });
                      added++;
                    }
                  });
                } else if (sys.baseUrl || sys.apiKey || sys.model) {
                  const exists = store.presets.some(p => p.baseUrl === sys.baseUrl && p.apiKey === sys.apiKey);
                  if (!exists) {
                    store.presets.push({
                      id: `api_sys_${Date.now()}`,
                      name: "系统当前 OpenAI 配置",
                      provider: "openai",
                      requestMode: sys.requestMode || "server",
                      baseUrl: sys.baseUrl || "https://api.openai.com/v1",
                      apiKey: sys.apiKey || "",
                      model: sys.model || "gpt-image-2",
                      size: sys.size || "1024x1024",
                    });
                    added++;
                  }
                }

                const naiKey = sys.novelai?.apiKey || (sys.provider === "novelai" ? sys.apiKey : "");
                if (naiKey) {
                  const exists = store.presets.some(p => p.provider === "novelai" && p.apiKey === naiKey);
                  if (!exists) {
                    store.presets.push({
                      id: `api_sys_nai_${Date.now()}`,
                      name: "系统当前 NovelAI 配置",
                      provider: "novelai",
                      requestMode: sys.requestMode || "server",
                      apiKey: naiKey,
                      baseUrl: "",
                      model: "nai-diffusion-4-curated-preview",
                      size: "",
                    });
                    added++;
                  }
                }

                saveStore(store);
                if (added > 0) showGlobalToast(`成功从系统抓取 ${added} 个 API 配置！`);
                else showGlobalToast("未发现新的系统 API 配置，已全量导入");
                render();
              };

              body.querySelector("#btn_add_a").onclick = () => {
                editingApi = {};
                render();
              };

              if (store.presets.length === 0) {
                const empty = document.createElement("div");
                empty.style.cssText = "text-align:center;padding:30px 0;color:#94a3b8;font-size:13px;";
                empty.textContent = "点击右上角「📥 抓取系统」直接导入现有配置，或「+ 新建」";
                body.appendChild(empty);
              } else {
                store.presets.forEach((item, idx) => {
                  const card = document.createElement("div");
                  card.className = "cube-card";
                  card.innerHTML = `
                    <div class="cube-card-header">
                      <span class="cube-card-name">${item.name}</span>
                      <div style="display:flex;gap:6px;align-items:center;">
                        <button class="cube-edit-icon-btn edit-btn" title="编辑预设">✏️ 编辑</button>
                        <button class="cube-btn-danger del-btn" style="padding:2px 8px;font-size:11px;">删除</button>
                      </div>
                    </div>
                    <div class="cube-card-desc">
                      类型: ${item.provider === "novelai" ? "NovelAI官方" : "OpenAI/中转"} | 模型: ${item.model || "未设置"} | 密钥: ${item.apiKey ? "••••" + item.apiKey.slice(-4) : "未填写"}
                    </div>
                  `;
                  card.querySelector(".edit-btn").onclick = (e) => {
                    e.stopPropagation();
                    editingApi = { ...item };
                    render();
                  };
                  card.querySelector(".del-btn").onclick = (e) => {
                    e.stopPropagation();
                    if (confirm(`确定删除 API 配置「${item.name}」吗？`)) {
                      store.presets.splice(idx, 1);
                      saveStore(store);
                      render();
                    }
                  };
                  body.appendChild(card);
                });
              }
            }
          }

          // Tab 5: 备份与导出导入
          else if (currentTab === "data") {
            const wrap = document.createElement("div");
            wrap.style.cssText = "display:flex;flex-direction:column;gap:12px;";
            wrap.innerHTML = `
              <div style="background:rgba(255,255,255,0.7);padding:14px;border-radius:16px;border:1px solid rgba(0,0,0,0.06);">
                <div style="font-size:14px;font-weight:700;color:#0284c7;margin-bottom:4px;">📤 导出预设文件 (.json)</div>
                <div style="font-size:12px;color:#64748b;margin-bottom:10px;">将所有 API 配置、提示词以及角色绑定关系（含专属外貌特征）完整导出备份。</div>
                <button id="btn_export_file" class="cube-btn-primary" style="width:100%;">导出并下载备份文件</button>
              </div>

              <div style="background:rgba(255,255,255,0.7);padding:14px;border-radius:16px;border:1px solid rgba(0,0,0,0.06);">
                <div style="font-size:14px;font-weight:700;color:#0284c7;margin-bottom:4px;">📥 从文件导入 (.json)</div>
                <div style="font-size:12px;color:#64748b;margin-bottom:10px;">打开系统文件管理器，选择之前导出的 json 备份文件。</div>
                <button id="btn_import_file" class="cube-btn-secondary" style="width:100%;">选择本地文件导入</button>
                <input id="hidden_file_input" type="file" accept=".json,application/json" style="display:none;" />
              </div>
            `;

            const exportBtn = wrap.querySelector("#btn_export_file");
            exportBtn.onclick = () => {
              exportBtn.textContent = "⏳ 正在导出中...";
              exportBtn.disabled = true;
              setTimeout(() => {
                try {
                  const dataStr = JSON.stringify(store, null, 2);
                  const blob = new Blob([dataStr], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `生图预设魔方备份_${new Date().toISOString().slice(0, 10)}.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  exportBtn.textContent = "✅ 导出成功，已开始下载";
                  showGlobalToast("备份文件已开始下载！");
                } catch {
                  exportBtn.textContent = "❌ 导出失败";
                } finally {
                  setTimeout(() => {
                    exportBtn.textContent = "导出并下载备份文件";
                    exportBtn.disabled = false;
                  }, 2000);
                }
              }, 400);
            };

            const fileInput = wrap.querySelector("#hidden_file_input");
            wrap.querySelector("#btn_import_file").onclick = () => fileInput.click();
            fileInput.onchange = (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (event) => {
                try {
                  const parsed = JSON.parse(event.target.result);
                  if (Array.isArray(parsed.presets)) store.presets = parsed.presets;
                  if (Array.isArray(parsed.prompts)) store.prompts = parsed.prompts;
                  if (parsed.charBindings) store.charBindings = parsed.charBindings;
                  if (parsed.activeId) store.activeId = parsed.activeId;
                  if (parsed.activePromptId) store.activePromptId = parsed.activePromptId;
                  saveStore(store);
                  showGlobalToast("已成功从文件导入全部预设与角色绑定！");
                  render();
                } catch {
                  alert("文件格式不正确，不是有效的 JSON 备份文件");
                }
              };
              reader.readAsText(file);
            };

            body.appendChild(wrap);
          }

          root.appendChild(body);
        }

        render();
        modalEl.appendChild(root);
      });
    }

    // ────────────── 悬浮球智能交互 ──────────────
    let fabEl = null;
    let idleTimer = null;
    let currentSide = "right";

    function removeFloatingBall() {
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      if (fabEl) { fabEl.remove(); fabEl = null; }
    }

    function dockFab(side) {
      if (!fabEl) return;
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      fabEl.classList.remove("docked-right", "docked-left");
      if (side === "left") fabEl.classList.add("docked-left");
      else fabEl.classList.add("docked-right");
    }

    function resetIdleTimer() {
      if (idleTimer) clearTimeout(idleTimer);
      if (!fabEl) return;
      fabEl.classList.remove("docked-right", "docked-left");
      idleTimer = setTimeout(() => {
        dockFab(currentSide);
      }, 5000);
    }

    function createFloatingBall() {
      if (!isFloatingBallEnabled()) return;
      if (fabEl) return;

      const fab = document.createElement("div");
      fab.className = "cube-fab";
      fab.title = "生图预设魔方 (拖拽贴边即刻隐入)";
      fab.innerHTML = `<span class="cube-fab-icon">🎨</span>`;

      let isDragging = false, startX = 0, startY = 0, initLeft = 0, initTop = 0, moved = false;

      const onPointerDown = (clientX, clientY) => {
        if (idleTimer) clearTimeout(idleTimer);
        fab.classList.remove("docked-right", "docked-left");
        isDragging = true;
        moved = false;
        startX = clientX;
        startY = clientY;
        const rect = fab.getBoundingClientRect();
        initLeft = rect.left;
        initTop = rect.top;
      };

      const onPointerMove = (clientX, clientY) => {
        if (!isDragging) return;
        const dx = clientX - startX, dy = clientY - startY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          moved = true;
          fab.style.left = `${Math.max(0, Math.min(window.innerWidth - 44, initLeft + dx))}px`;
          fab.style.top = `${Math.max(40, Math.min(window.innerHeight - 60, initTop + dy))}px`;
          fab.style.right = "auto";
        }
      };

      const onPointerUp = () => {
        if (!isDragging) return;
        isDragging = false;
        if (!moved) {
          openCubeModal();
          resetIdleTimer();
        } else {
          const rect = fab.getBoundingClientRect();
          const midX = window.innerWidth / 2;
          if (rect.left + rect.width / 2 < midX) {
            currentSide = "left";
            fab.style.left = "0px";
            fab.style.right = "auto";
            dockFab("left");
          } else {
            currentSide = "right";
            fab.style.left = "auto";
            fab.style.right = "0px";
            dockFab("right");
          }
        }
      };

      fab.addEventListener("touchstart", (e) => onPointerDown(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
      window.addEventListener("touchmove", (e) => { if (isDragging) onPointerMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
      window.addEventListener("touchend", onPointerUp);

      fab.addEventListener("mousedown", (e) => onPointerDown(e.clientX, e.clientY));
      window.addEventListener("mousemove", (e) => { if (isDragging) onPointerMove(e.clientX, e.clientY); });
      window.addEventListener("mouseup", onPointerUp);

      document.body.appendChild(fab);
      fabEl = fab;
      resetIdleTimer();
    }

    if (isFloatingBallEnabled()) {
      createFloatingBall();
    }

    // ────────────── 生图设置页挂载 ──────────────
    function tryInjectToSettingsPage() {
      if (!alive) return;
      if (document.getElementById("cube-settings-inject-panel")) return;

      let targetCard = null;
      const allTexts = document.querySelectorAll("div, span, label, p");
      for (const node of allTexts) {
        if (node.children.length === 0 && (node.textContent || "").trim() === "启用自动生图") {
          let cur = node;
          while (cur && cur.parentElement && cur.parentElement !== document.body) {
            if (cur.parentElement.textContent.includes("生图提供方") || cur.parentElement.textContent.includes("请求方式")) {
              targetCard = cur;
              break;
            }
            cur = cur.parentElement;
          }
          if (targetCard) break;
        }
      }

      if (!targetCard) {
        const root = findPageRoot();
        if (root && root.children.length > 0) targetCard = root.children[0];
      }

      if (!targetCard || !targetCard.parentElement) return;

      const panel = document.createElement("div");
      panel.id = "cube-settings-inject-panel";
      panel.className = "cube-inject-card";
      panel.style.cssText = "width: 100%; box-sizing: border-box; margin-top: 10px; margin-bottom: 4px;";

      const isFabActive = isFloatingBallEnabled();

      panel.innerHTML = `
        <button type="button" class="cube-inject-open-btn" id="cube_btn_trigger_modal" style="width:100%; padding:12px 14px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:18px;line-height:1;">✨</span>
            <span style="font-weight:600;font-size:14px;color:#0369a1;">生图预设魔方</span>
          </div>
          <div style="display:flex;align-items:center;gap:4px;font-size:12px;color:#0284c7;font-weight:600;">
            <span>自由搭配 & 角色绑定</span>
            <span style="font-size:16px;line-height:1;">›</span>
          </div>
        </button>
        <div class="cube-inject-divider" style="margin: 8px 0;"></div>
        <div class="cube-inject-switch-row" style="display:flex;justify-content:space-between;align-items:center;">
          <div class="cube-inject-switch-info">
            <div class="cube-inject-switch-title" style="font-size:13.5px;font-weight:600;color:#1e293b;">显示屏幕快捷悬浮球</div>
            <div class="cube-inject-switch-desc" style="font-size:11.5px;color:#64748b;">在屏幕边缘显示快捷悬浮球，支持拖拽与贴边半隐</div>
          </div>
          <label class="cube-ios-switch">
            <input type="checkbox" id="cube_switch_fab_input" ${isFabActive ? "checked" : ""}>
            <span class="cube-ios-slider"></span>
          </label>
        </div>
      `;

      panel.querySelector("#cube_btn_trigger_modal").onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        openCubeModal();
      };

      const switchInput = panel.querySelector("#cube_switch_fab_input");
      switchInput.onchange = (e) => setFloatingBallEnabled(e.target.checked);

      targetCard.insertAdjacentElement("afterend", panel);
    }

    let injectCheckTimer = null;
    const scheduleInjectCheck = () => {
      if (injectCheckTimer) return;
      injectCheckTimer = setTimeout(() => {
        injectCheckTimer = null;
        tryInjectToSettingsPage();
      }, 80);
    };

    const domObserver = new MutationObserver(() => {
      scheduleInjectCheck();
    });

    domObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    scheduleInjectCheck();

    return () => {
      alive = false;
      window.fetch = originalFetch;
      if (domObserver) domObserver.disconnect();
      const injected = document.getElementById("cube-settings-inject-panel");
      if (injected) injected.remove();
      removeFloatingBall();
    };
  }
};