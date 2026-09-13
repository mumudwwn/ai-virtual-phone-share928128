/**
 * 插件名称：生图预设魔方 (生图面板集成与全局联动版)
 * 版本：v5.5.0
 * 说明：
 * 1. 控制台与悬浮球开关全量移至系统「生图设置」面板（启用自动生图正下方）
 * 2. 移除插件管理页开关，保持界面纯净
 * 3. 完整保留全量多预设共存、自由搭配、Webpack 底层模块穿透与全局即时生效能力
 */

export default {
  manifest: {
    id: "image-preset-magic-cube",
    name: "生图预设魔方",
    apiVersion: 1,
    version: "5.5.0",
    author: "小坊",
    description: "API 配置与提示词解耦管理、自由搭配；已直接集成进系统生图设置页面，支持全局双向同步与快捷悬浮球。",
    permissions: ["storage", "ui", "ai"],
    settings: [],
  },

  setup(ctx) {
    const UNIFIED_STORE_KEY = "img_cube_latest_store_v5";
    const SYS_SETTINGS_KEY = "ai_phone_image_generation_settings_v1";
    const FAB_SWITCH_STORAGE_KEY = "img_cube_floating_ball_enabled";

    let alive = true;
    let webpackRequire = null;
    let hostLoadFn = null;
    let hostSaveFn = null;

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

    // ────────────── 仅平滑继承最近一个有效版本的数据 ──────────────
    function getCleanStore() {
      let store = ctx.system.storage.get(UNIFIED_STORE_KEY);
      if (!store || typeof store !== "object" || !Array.isArray(store.presets)) {
        const fallbackKeys = [
          "img_cube_latest_store",
          "img_cube_permanent_store_v1",
          "img_cube_permanent_store",
          "img_cube_store_v4",
          "img_cube_api_list_v4",
          "img_cube_api_list_v3",
          "img_cube_api_list_v2",
          "img_mgr_api_presets_v1",
        ];

        let foundRecent = null;
        for (const k of fallbackKeys) {
          try {
            const old = ctx.system.storage.get(k);
            if (old) {
              const obj = typeof old === "string" ? JSON.parse(old) : old;
              if (obj && (Array.isArray(obj.presets) || Array.isArray(obj))) {
                foundRecent = obj;
                break;
              }
            }
          } catch {}
        }

        if (foundRecent) {
          store = {
            presets: Array.isArray(foundRecent.presets) ? foundRecent.presets : (Array.isArray(foundRecent) ? foundRecent : []),
            activeId: typeof foundRecent.activeId === "string" ? foundRecent.activeId : "",
            prompts: Array.isArray(foundRecent.prompts) ? foundRecent.prompts : [],
            activePromptId: typeof foundRecent.activePromptId === "string" ? foundRecent.activePromptId : "",
            naiRelay: foundRecent.naiRelay === true,
          };
        } else {
          store = {
            presets: [],
            activeId: "",
            prompts: [],
            activePromptId: "",
            naiRelay: false,
          };
        }
        ctx.system.storage.set(UNIFIED_STORE_KEY, store);
      }
      return store;
    }

    const loadStore = () => getCleanStore();
    const saveStore = (s) => ctx.system.storage.set(UNIFIED_STORE_KEY, s);

    // ────────────── 悬浮球开关状态持久化 ──────────────
    function isFloatingBallEnabled() {
      const v = ctx.system.storage.get(FAB_SWITCH_STORAGE_KEY);
      if (v === false || v === "false") return false;
      return true; // 默认开启
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
      if (typeof hostLoadFn === "function" && typeof hostSaveFn === "function") return true;
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
            if (exp.default) {
              if (typeof exp.default.loadImageGenerationSettings === "function") hostLoadFn = exp.default.loadImageGenerationSettings;
              if (typeof exp.default.saveImageGenerationSettings === "function") hostSaveFn = exp.default.saveImageGenerationSettings;
            }
          } catch {}
        }
      };

      if (req.c) scanMap(req.c);
      if ((!hostLoadFn || !hostSaveFn) && req.m) scanMap(req.m);

      return typeof hostLoadFn === "function" && typeof hostSaveFn === "function";
    };

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

    // ────────────── 智能负面提示词 ──────────────
    function buildOpenAiPrompt(pos, neg) {
      const p = (pos || "").trim();
      const n = (neg || "").trim();
      if (!n) return p;
      if (!p) return `【Negative Constraints / 严格禁止出现】Avoid: ${n}`;
      return `${p}\n\n【Negative Constraints / 严格禁止出现以下元素】\nStrictly avoid: ${n}`;
    }

    // ────────────── 核心：全量多预设共存与全局注入 ──────────────
    async function applyCombination(apiPreset, promptPreset) {
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
              extraPrompt: p.id === apiPreset.id && promptPreset ? buildOpenAiPrompt(promptPreset.positivePrompt, promptPreset.negativePrompt) : (foundInSys ? foundInSys.extraPrompt : ""),
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
              extraPrompt: promptPreset ? buildOpenAiPrompt(promptPreset.positivePrompt, promptPreset.negativePrompt) : "",
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
          nextSys.extraPrompt = buildOpenAiPrompt(promptPreset.positivePrompt, promptPreset.negativePrompt);
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

      const aMsg = apiPreset ? `API「${apiPreset.name}」` : "";
      const pMsg = promptPreset ? `提示词「${promptPreset.name}」` : "";
      showGlobalToast(`已全局同步: ${[aMsg, pMsg].filter(Boolean).join(" + ")}`);
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
      .cube-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 10000;
        background: rgba(0, 0, 0, 0.28);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        box-sizing: border-box;
      }
      .cube-modal {
        width: 100%;
        max-width: 420px;
        max-height: 88vh;
        background: rgba(255, 255, 255, 0.94);
        backdrop-filter: blur(28px) saturate(180%);
        -webkit-backdrop-filter: blur(28px) saturate(180%);
        border: 1px solid rgba(255, 255, 255, 0.95);
        border-radius: 26px;
        box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.04);
        color: #1e293b;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        animation: cube-fade-in 0.22s ease-out;
      }
      @keyframes cube-fade-in {
        from { opacity: 0; transform: scale(0.96) translateY(8px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      .cube-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px 12px;
      }
      .cube-title {
        font-size: 17px;
        font-weight: 700;
        color: #0f172a;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .cube-close-btn {
        width: 30px;
        height: 30px;
        border-radius: 15px;
        background: rgba(0, 0, 0, 0.05);
        border: none;
        color: #64748b;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .cube-tabs {
        display: flex;
        background: rgba(0, 0, 0, 0.04);
        border-radius: 14px;
        margin: 0 18px 12px;
        padding: 3px;
        gap: 2px;
      }
      .cube-tab-btn {
        flex: 1;
        padding: 7px 4px;
        font-size: 13px;
        font-weight: 600;
        background: transparent;
        color: #64748b;
        border: none;
        border-radius: 11px;
        cursor: pointer;
        transition: all 0.2s;
        text-align: center;
      }
      .cube-tab-btn.active {
        background: #ffffff;
        color: #0284c7;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      }
      .cube-body {
        padding: 0 18px 20px;
        overflow-y: auto;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 12px;
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

      ctx.ui.openModal((modalEl, { close }) => {
        modalEl.innerHTML = "";
        const root = document.createElement("div");
        root.className = "cube-modal";

        function render() {
          root.innerHTML = "";
          store = loadStore();

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
            { id: "pair", label: "⚡ 自由搭配" },
            { id: "prompt", label: `🎨 提示词 (${store.prompts.length})` },
            { id: "api", label: `🔌 API 配置 (${store.presets.length})` },
            { id: "data", label: "📦 备份" },
          ];
          tabList.forEach(t => {
            const btn = document.createElement("button");
            btn.className = `cube-tab-btn ${currentTab === t.id ? "active" : ""}`;
            btn.textContent = t.label;
            btn.onclick = () => {
              currentTab = t.id;
              editingApi = null;
              editingPrompt = null;
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
              <div style="font-weight:700;color:#0284c7;margin-bottom:6px;">当前装载搭配</div>
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
              emptyApi.textContent = "暂无保存的 API 配置，请先到「🔌 API 配置」标签新建";
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
              emptyPrompt.textContent = "暂无保存的提示词，请到「🎨 提示词」标签新建";
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

          // Tab 2: 提示词管理
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
                  <input id="in_p_name" class="cube-input" value="${editingPrompt.name || ""}" placeholder="如：极简线稿 / 角色外貌特征">
                </div>
                <div>
                  <label class="cube-label">正向提示词 (Positive Prompt)</label>
                  <textarea id="in_p_pos" class="cube-input" rows="5" placeholder="画面描述或外貌特征词">${editingPrompt.positivePrompt || ""}</textarea>
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
                  updatedItem = {
                    id: `pmt_${Date.now()}`,
                    name, positivePrompt, negativePrompt
                  };
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
              topBar.style.cssText = "display:flex;justify-content:space-between;align-items:center;";
              topBar.innerHTML = `
                <span style="font-size:13px;font-weight:600;color:#64748b;">提示词列表</span>
                <button id="btn_add_p" class="cube-btn-secondary" style="color:#0284c7;">+ 新建提示词</button>
              `;
              body.appendChild(topBar);
              body.querySelector("#btn_add_p").onclick = () => {
                editingPrompt = {};
                render();
              };

              if (store.prompts.length === 0) {
                const empty = document.createElement("div");
                empty.style.cssText = "text-align:center;padding:30px 0;color:#94a3b8;font-size:13px;";
                empty.textContent = "点击右上角「+ 新建提示词」添加你的生图提示词";
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
                  card.querySelector(".del-btn").onclick = async (e) => {
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
// Tab 3: API 配置管理
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
                  <label class="cube-label">接口类型</label>
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
                    <button id="btn_fetch_models" class="cube-btn-secondary" style="white-space:nowrap;padding:0 12px;font-size:12px;">
                      🔄 拉取模型
                    </button>
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
                    <option value="server" ${editingApi.requestMode !== "direct" ? "selected" : ""}>服务端转发 (推荐，解决跨域与拦截)</option>
                    <option value="direct" ${editingApi.requestMode === "direct" ? "selected" : ""}>浏览器直连 (需上游接口允许 CORS)</option>
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
                  updatedItem = {
                    id: `api_${Date.now()}`,
                    name, provider, apiKey, requestMode, baseUrl, model, size
                  };
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
              topBar.style.cssText = "display:flex;justify-content:space-between;align-items:center;";
              topBar.innerHTML = `
                <span style="font-size:13px;font-weight:600;color:#64748b;">API 配置列表</span>
                <button id="btn_add_a" class="cube-btn-secondary" style="color:#0284c7;">+ 新建 API 配置</button>
              `;
              body.appendChild(topBar);
              body.querySelector("#btn_add_a").onclick = () => {
                editingApi = {};
                render();
              };

              if (store.presets.length === 0) {
                const empty = document.createElement("div");
                empty.style.cssText = "text-align:center;padding:30px 0;color:#94a3b8;font-size:13px;";
                empty.textContent = "点击右上角「+ 新建 API 配置」添加你的生图接口";
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
                  card.querySelector(".del-btn").onclick = async (e) => {
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

          // Tab 4: 备份与导出导入
          else if (currentTab === "data") {
            const wrap = document.createElement("div");
            wrap.style.cssText = "display:flex;flex-direction:column;gap:12px;";
            wrap.innerHTML = `
              <div style="background:rgba(255,255,255,0.7);padding:14px;border-radius:16px;border:1px solid rgba(0,0,0,0.06);">
                <div style="font-size:14px;font-weight:700;color:#0284c7;margin-bottom:4px;">📤 导出预设文件 (.json)</div>
                <div style="font-size:12px;color:#64748b;margin-bottom:10px;">将所有 API 配置和提示词导出为本地文件下载保存。</div>
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
                } catch (e) {
                  exportBtn.textContent = "❌ 导出失败";
                  showGlobalToast("导出失败，请重试");
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
                  if (parsed.activeId) store.activeId = parsed.activeId;
                  if (parsed.activePromptId) store.activePromptId = parsed.activePromptId;
                  saveStore(store);
                  showGlobalToast("已成功从文件导入全部预设！");
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

    // ────────────── 生图设置页红圈位置精准注入 ──────────────
    function tryInjectToSettingsPage() {
      if (!alive) return;
      if (document.getElementById("cube-settings-inject-panel")) return;

      // 1. 精准定位：找到包含“启用自动生图”的整张独立卡片
      let targetCard = null;
      const allTexts = document.querySelectorAll("div, span, label, p");
      for (const node of allTexts) {
        if (node.children.length === 0 && (node.textContent || "").trim() === "启用自动生图") {
          let cur = node;
          while (cur && cur.parentElement && cur.parentElement !== document.body) {
            // 如果父容器同时包含“生图提供方”，说明 cur 就是第一张完整的独立大卡片
            if (cur.parentElement.textContent.includes("生图提供方") || cur.parentElement.textContent.includes("请求方式")) {
              targetCard = cur;
              break;
            }
            cur = cur.parentElement;
          }
          if (targetCard) break;
        }
      }

      // 兜底找生图根列表的第一项
      if (!targetCard) {
        const root = findPageRoot();
        if (root && root.children.length > 0) {
          targetCard = root.children[0];
        }
      }

      if (!targetCard || !targetCard.parentElement) return;

      // 2. 创建插件控制卡片
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
            <span>自由搭配 & 预设管理</span>
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
        e.preventDefault();
        e.stopPropagation();
        openCubeModal();
      };

      const switchInput = panel.querySelector("#cube_switch_fab_input");
      switchInput.onchange = (e) => {
        setFloatingBallEnabled(e.target.checked);
      };

      // 3. 稳稳插入在整个「启用自动生图」卡片的正下方（红圈空位）
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
      if (domObserver) domObserver.disconnect();
      const injected = document.getElementById("cube-settings-inject-panel");
      if (injected) injected.remove();
      removeFloatingBall();
    };
  }
};
