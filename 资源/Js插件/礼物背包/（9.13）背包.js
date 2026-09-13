export default {
  manifest: {
    id: "gift-backpack",
    name: "背包",
    apiVersion: 1,
    version: "3.25.0",
    author: "穆叶",
    description:
      "提取会话中的赠礼卡片信息计入背包，可自定义新物品，可将背包里的转赠给角色或拿走角色背包里的物品；群聊礼物自动归入群礼物堆",
    permissions: ["chat.read", "chat.write"],
    settings: [
      {
        key: "defaultInjected",
        label: "新收到的物品默认开启记忆注入",
        type: "boolean",
        default: true,
      },
    ],
  },

  setup(ctx) {
    let currentSessionId = null;
    let bpModalOpen = false;
    let scanningAllGifts = false;

    /* ===== 悬浮层注册中心 ===== */
    const floatingOverlays = new Set();
    const floatingOverlayCleanups = new Map();

    function registerFloatingOverlay(el, cleanupFn) {
      if (!el) return;
      floatingOverlays.add(el);
      if (typeof cleanupFn === "function") {
        floatingOverlayCleanups.set(el, cleanupFn);
      }
    }

    function unregisterFloatingOverlay(el) {
      if (!el) return;
      floatingOverlays.delete(el);
      floatingOverlayCleanups.delete(el);
    }

    function cleanupAllFloatingOverlays() {
      for (const el of [...floatingOverlays]) {
        try {
          el.remove();
        } catch (_) {}
      }
      for (const [el, fn] of [...floatingOverlayCleanups]) {
        try {
          fn();
        } catch (_) {}
      }
      floatingOverlays.clear();
      floatingOverlayCleanups.clear();
    }

    // ================= 日志 =================
    function logError(...args) {
      try {
        ctx.system.log?.(...args);
      } catch (_) {}
    }

    // ================= 定时器管理 =================
    const managedTimers = new Set();

    function cancelTimer(cancel) {
      if (!cancel) return;
      managedTimers.delete(cancel);
      try {
        if (typeof cancel === "function") cancel();
        else if (typeof cancel === "number") clearTimeout(cancel);
      } catch (_) {}
    }

    function later(fn, ms) {
      let cancel;
      cancel = ctx.system.timers.setTimeout(() => {
        managedTimers.delete(cancel);
        try {
          const r = fn();
          Promise.resolve(r).catch((e) =>
            logError("backpack async timer error", e)
          );
        } catch (e) {
          logError("backpack timer error", e);
        }
      }, ms);
      managedTimers.add(cancel);
      return cancel;
    }

    // ================= 工具函数 =================
    function esc(s) {
      return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function sanitizePromptField(s, maxLen = 120) {
      return String(s ?? "")
        .replace(/[\u0000-\u001F\u2028\u2029]/g, "")
        .replace(/[【】\[\]{}<>《》]/g, "")
        .replace(/[\r\n]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLen);
    }

    const MAX_IMAGE_LEN = 250 * 1024;
    const MAX_TOTAL_IMAGE_BYTES = 3 * 1024 * 1024;

    const ALLOWED_DATA_IMAGE_MIME =
      /^data:image\/(png|jpe?g|gif|webp|bmp|avif|apng);/i;

    function isValidImageUrl(url) {
      if (!url || typeof url !== "string") return false;
      const trimmed = url.trim();
      if (trimmed.length > MAX_IMAGE_LEN) return false;
      if (/^data:image\/svg/i.test(trimmed)) return false;
      if (/^data:image\//i.test(trimmed)) {
        return ALLOWED_DATA_IMAGE_MIME.test(trimmed);
      }
      try {
        const base =
          typeof location !== "undefined" ? location.href : undefined;
        const u = new URL(trimmed, base);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch (_) {
        return false;
      }
    }

    function computeInlineImageBytes(gifts, excludeId) {
      let total = 0;
      if (!Array.isArray(gifts)) return 0;
      for (const g of gifts) {
        if (!g) continue;
        if (excludeId && g.id === excludeId) continue;
        if (
          typeof g.customImage === "string" &&
          g.customImage.startsWith("data:")
        ) {
          total += g.customImage.length;
        }
      }
      return total;
    }

    function isForeignPluginCard(msg) {
      return !!(
        msg &&
        typeof msg.mediaType === "string" &&
        msg.mediaType.startsWith("plugin:")
      );
    }

    function isElementLike(x) {
      return !!(
        x &&
        typeof x === "object" &&
        x.nodeType === 1 &&
        typeof x.querySelector === "function"
      );
    }

    function sidStr(v) {
      if (v === null || v === undefined) return "";
      return String(v);
    }

    function mergeDescSorted(a, b) {
      const result = new Array(a.length + b.length);
      let i = 0;
      let j = 0;
      let k = 0;
      while (i < a.length && j < b.length) {
        const ta = a[i].timestamp || 0;
        const tb = b[j].timestamp || 0;
        if (ta >= tb) result[k++] = a[i++];
        else result[k++] = b[j++];
      }
      while (i < a.length) result[k++] = a[i++];
      while (j < b.length) result[k++] = b[j++];
      return result;
    }

    /* 群聊判定缓存 */
    let groupSessionCache = null;

    function isGroupSession(sid) {
      const s = sidStr(sid);
      if (!s) return false;
      if (!groupSessionCache) {
        groupSessionCache = new Map();
        try {
          const sessions = ctx.data.sessions.list() || [];
          for (const x of sessions) {
            const id = sidStr(x.id || x.sessionId);
            if (id) groupSessionCache.set(id, x.isGroup === true);
          }
        } catch (_) {}
      }
      return groupSessionCache.get(s) === true;
    }

    /* 从消息对象里解析送礼人名字
       私聊时回退到会话角色名，避免全部显示"角色" */
    function resolveSenderName(msgLike, role, sessionId) {
      if (role === "user") return "用户";
      if (msgLike && typeof msgLike === "object") {
        const candidates = [
          msgLike.senderName,
          msgLike.characterName,
          msgLike.character_name,
          msgLike.speakerName,
          msgLike.name,
          msgLike.sender,
        ];
        for (const c of candidates) {
          if (c && typeof c === "string" && c.trim()) {
            return c.trim().slice(0, 30);
          }
        }
        const cid = msgLike.characterId || msgLike.character_id;
        if (cid) {
          try {
            const char = ctx.data.characters.get?.(cid);
            if (char && char.name) return String(char.name).slice(0, 30);
          } catch (_) {}
        }
      }
      if (sessionId && !isGroupSession(sessionId)) {
        const charName = resolveCharacterNameBySession(sessionId);
        if (charName) return charName;
      }
      return "角色";
    }

    /* 会话ID → 角色名 / 群名 缓存 */
    function resolveCharacterNameBySession(sid) {
      const s = sidStr(sid);
      if (!s) return "";
      if (!sessionCharNameCache) sessionCharNameCache = new Map();
      if (sessionCharNameCache.has(s)) {
        return sessionCharNameCache.get(s) || "";
      }

      let result = "";
      try {
        const sessions = ctx.data.sessions.list() || [];
        const charMap = buildCharMap();
        for (const x of sessions) {
          const id = sidStr(x.id || x.sessionId);
          if (id !== s) continue;
          if (x.isGroup === true) {
            result = resolveGroupDisplayName(x);
          } else {
            const matchedChar =
              (x.characterId && charMap.get(String(x.characterId))) ||
              (x.contactId && charMap.get(String(x.contactId)));
            result =
              matchedChar && matchedChar.name
                ? String(matchedChar.name).slice(0, 30)
                : x.title || x.name || "角色";
          }
          break;
        }
      } catch (_) {}

      sessionCharNameCache.set(s, result);
      return result;
    }

    const ICONS = {
      backpack: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--c-text)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M8 21v-5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v5"/><path d="M8 10h8"/><path d="M8 14h8"/></svg>`,
      gift: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"></rect><path d="M12 8v13"></path><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"></path><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"></path></svg>`,
      close: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
      sparkles: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
      emptyBox: `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--c-icon, #9ca3af)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
      descendingMenu: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="15" y2="12"></line><line x1="4" y1="18" x2="9" y2="18"></line></svg>`,
      refresh: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path><path d="M16 21h5v-5"></path></svg>`,
      manageList: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
      plus: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
      trash: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>`,
      ban: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="m4.9 4.9 14.2 14.2"></path></svg>`,
      camera: `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`,
      upload: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
      eye: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
      group: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    };

    ctx.ui.injectCSS(`
:root {
  --bp-accent: #34C759;
  --bp-accent-hover: #2FB350;
  --bp-accent-light: rgba(52, 199, 89, 0.14);
  --bp-accent-border: rgba(52, 199, 89, 0.38);
  --bp-group: #8B5CF6;
  --bp-group-light: rgba(139, 92, 246, 0.12);
  --bp-group-border: rgba(139, 92, 246, 0.35);
}

.backpack-modal-box {
  display: flex;
  flex-direction: column;
  width: min(92vw, 450px);
  max-height: 84vh;
  background: var(--c-page-body-bg, #ffffff);
  color: var(--c-text, #1f2937);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.22);
  font-family: inherit;
  position: relative;
}

.backpack-select-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
}

.backpack-role-select {
  flex: 1;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid rgba(128, 128, 128, 0.18);
  background: var(--c-page-body-bg, #fff);
  color: var(--c-text);
  font-size: 13px;
  outline: none;
  cursor: pointer;
}

.backpack-scroll-content {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.backpack-card-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(128, 128, 128, 0.04);
  border: 1px solid rgba(128, 128, 128, 0.09);
  transition: all 0.15s;
  cursor: pointer;
  user-select: none;
}

.backpack-card-item:hover {
  background: rgba(128, 128, 128, 0.07);
}

.backpack-card-item.selected {
  border-color: var(--bp-accent);
  background: var(--bp-accent-light);
}

.backpack-icon-wrap {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(128, 128, 128, 0.08);
  color: var(--c-icon, #6b7280);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.25s;
  overflow: visible;
}

.backpack-icon-sparkle-badge {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--bp-accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid var(--c-page-body-bg, #fff);
  z-index: 2;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
}

.backpack-icon-sparkle-badge.bp-eye-badge {
  background: #3b82f6;
}

.backpack-icon-sparkle-badge.bp-group-badge {
  background: var(--bp-group);
}

.backpack-custom-thumb {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
  display: block;
}

.backpack-card-body {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  flex: 1;
}

.backpack-dropdown-menu {
  position: absolute;
  top: 52px;
  left: 16px;
  background: var(--c-page-body-bg, #fff);
  border: 1px solid rgba(128, 128, 128, 0.16);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
  padding: 6px;
  display: none;
  flex-direction: column;
  gap: 2px;
  z-index: 100;
  min-width: 135px;
}

.backpack-dropdown-menu.show {
  display: flex;
}

.backpack-menu-action {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--c-text);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
}

.backpack-menu-action:hover {
  background: rgba(128, 128, 128, 0.08);
}

.backpack-batch-bar {
  display: none;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(128, 128, 128, 0.05);
  border-top: 1px solid rgba(128, 128, 128, 0.12);
}

.backpack-batch-bar.show {
  display: flex;
}

.backpack-batch-btn {
  border: none;
  padding: 7px 10px;
  border-radius: 7px;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-weight: 500;
}

.backpack-batch-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bp-input-field {
  width: 100%;
  padding: 7px 10px;
  font-size: 12px;
  border-radius: 8px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  background: var(--c-page-body-bg, #fff);
  color: var(--c-text);
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color 0.2s;
}

.bp-input-field:focus {
  border-color: var(--bp-accent);
}

.bp-readonly-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--c-text);
  padding: 7px 10px;
  background: rgba(128, 128, 128, 0.06);
  border-radius: 8px;
  border: 1px solid rgba(128, 128, 128, 0.12);
  user-select: text;
  word-break: break-word;
  line-height: 1.3;
}

.bp-readonly-hint {
  font-size: 10px;
  color: var(--c-icon);
  opacity: 0.75;
}

.bp-transfer-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--c-text);
  background: transparent;
  transition: background 0.15s;
}

.bp-transfer-item:hover {
  background: rgba(128, 128, 128, 0.08);
}

.bp-target-edit-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.bp-target-edit-item:hover {
  background: rgba(128, 128, 128, 0.08);
}
    `);

    // ================= 会话绑定 =================
    /* msgToSessionCache 仅由 message.persisted 增量维护，作为最快路径使用。
       不再做全表索引，避免会话多时同步遍历上万条消息。 */
    let msgToSessionCache = null;
    let msgToSessionCacheTime = 0;

    let targetsCache = null;
    let rawTargetsCache = null;
    let enabledIdsCache = null;
    let receiverToSessionCache = null;
    let sessionCharNameCache = null;
    let charMapCache = null;

    const ENABLED_IDS_CACHE_MAX = 500;

    function invalidateTargetCaches() {
      targetsCache = null;
      rawTargetsCache = null;
      enabledIdsCache = null;
      groupSessionCache = null;
      receiverToSessionCache = null;
      sessionCharNameCache = null;
      charMapCache = null;
    }

    ctx.ui.slot("chat.header", (el, props) => {
      if (
        props &&
        props.sessionId &&
        sidStr(props.sessionId) !== sidStr(currentSessionId)
      ) {
        currentSessionId = props.sessionId;
        invalidateTargetCaches();
      }
      return () => {};
    });

    const MSG_INDEX_PER_SESSION_LIMIT = 500;

    /* 惰性反查：给定一组候选 msgId，返回第一个命中消息所属的会话 id。
       不建全表，找到就返回。扫描量 = 候选 id 数 × 每会话尾部 500 条消息。 */
    function resolveSessionIdByMsgIds(candidateIds) {
      if (!candidateIds || candidateIds.size === 0) return null;
      let sessions = [];
      try {
        sessions = ctx.data.sessions.list() || [];
      } catch (_) {
        return null;
      }
      for (const s of sessions) {
        const sid = s && (s.id || s.sessionId);
        if (!sid) continue;
        try {
          const msgs = ctx.data.messages.list(sid) || [];
          const start = Math.max(0, msgs.length - MSG_INDEX_PER_SESSION_LIMIT);
          for (let i = start; i < msgs.length; i++) {
            const m = msgs[i];
            if (m && m.id && candidateIds.has(String(m.id))) {
              return sid;
            }
          }
        } catch (_) {}
      }
      return null;
    }

    function detectCurrentSessionId() {
      if (currentSessionId) return currentSessionId;

      const msgEls = document.querySelectorAll(
        ".chat-msg-wrapper[id^='message-'], [data-msg-id]"
      );
      if (msgEls.length > 0) {
        /* 收集 DOM 里可见的候选 msgId（从新到旧，最多 20 个就够了） */
        const candidates = new Set();
        for (let i = msgEls.length - 1; i >= 0; i--) {
          const e = msgEls[i];
          let mid = "";
          try {
            mid = e.getAttribute("data-msg-id") || "";
          } catch (_) {}
          if (!mid && e.id && e.id.startsWith("message-")) {
            mid = e.id.slice("message-".length);
          }
          if (mid) candidates.add(String(mid));
          if (candidates.size >= 20) break;
        }

        /* 快速路径：message.persisted 攒下的增量 map */
        if (msgToSessionCache && candidates.size > 0) {
          for (const mid of candidates) {
            const sid = msgToSessionCache.get(mid);
            if (sid) return sid;
          }
        }

        /* 慢路径：一次惰性反查 */
        if (candidates.size > 0) {
          const sid = resolveSessionIdByMsgIds(candidates);
          if (sid) return sid;
        }
      }

      try {
        const el = document.querySelector("[data-session-id]");
        if (el) {
          const sid = el.getAttribute("data-session-id");
          if (sid) return sid;
        }
      } catch (_) {}

      try {
        const src = (location.hash || "") + " " + (location.pathname || "");
        const m = src.match(/session[\/=:]([A-Za-z0-9_\-]+)/i);
        if (m && m[1]) return m[1];
      } catch (_) {}

      return null;
    }

    // ================= 转送目标配置 =================
    const TARGETS_CONFIG_KEY = "backpack_transfer_targets_v2";
    let transferTargetsConfig = null;
    let transferTargetsLoaded = false;

    const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    async function loadTransferTargetsConfig() {
      try {
        const data = await ctx.system.storage.get(TARGETS_CONFIG_KEY);
        if (data && typeof data === "object" && !Array.isArray(data)) {
          transferTargetsConfig = Object.create(null);
          for (const k of Object.keys(data)) {
            if (UNSAFE_KEYS.has(k)) continue;
            if (Array.isArray(data[k])) {
              transferTargetsConfig[String(k)] = data[k].map(String);
            }
          }
        } else {
          transferTargetsConfig = null;
        }
      } catch (e) {
        logError("backpack load targets config error", e);
        transferTargetsConfig = null;
      }
      transferTargetsLoaded = true;
    }

    async function saveTransferTargetsConfigForSource(sourceId, ids) {
      if (!transferTargetsConfig) {
        transferTargetsConfig = Object.create(null);
      }
      const key = String(sourceId || "");
      if (UNSAFE_KEYS.has(key)) {
        logError("backpack save targets: unsafe key rejected", key);
        return;
      }
      transferTargetsConfig[key] = (ids || []).map(String);
      invalidateTargetCaches();
      try {
        await ctx.system.storage.set(TARGETS_CONFIG_KEY, transferTargetsConfig);
      } catch (e) {
        logError("backpack save targets config error", e);
      }
      if (key === "user") {
        schedulePromptSync(null);
      } else if (key) {
        schedulePromptSync([key]);
      }
    }

    function getEnabledTargetIdsForSource(sourceId) {
      const sid = String(sourceId || "");
      if (!enabledIdsCache) enabledIdsCache = new Map();
      const hit = enabledIdsCache.get(sid);
      if (hit) return hit;

      let s;
      if (
        transferTargetsConfig &&
        !UNSAFE_KEYS.has(sid) &&
        Array.isArray(transferTargetsConfig[sid])
      ) {
        s = new Set(transferTargetsConfig[sid].map(String));
      } else {
        const all = getAllGiftTargetsRaw();
        s = new Set();
        for (const t of all) {
          if (String(t.id) === sid) continue;
          if (t.isGroup) continue;
          s.add(String(t.id));
        }
      }
      if (enabledIdsCache.size >= ENABLED_IDS_CACHE_MAX) {
        const oldestKey = enabledIdsCache.keys().next().value;
        enabledIdsCache.delete(oldestKey);
      }
      enabledIdsCache.set(sid, s);
      return s;
    }

    // ================= 通用工具 =================
    function buildCharMap() {
      if (charMapCache) return charMapCache;
      const charMap = new Map();
      try {
        const characters = ctx.data.characters.list() || [];
        characters.forEach((c) => charMap.set(String(c.id), c));
      } catch (_) {}
      charMapCache = charMap;
      return charMap;
    }

    function resolveGroupDisplayName(s) {
      if (!s || typeof s !== "object") return "群聊";

      const directFields = [
        s.title,
        s.name,
        s.groupName,
        s.group_name,
        s.displayName,
        s.display_name,
        s.contactName,
        s.contact_name,
      ];
      for (const c of directFields) {
        if (c && typeof c === "string" && c.trim()) {
          return c.trim().slice(0, 40);
        }
      }

      const nested = [s.contact, s.group, s.meta];
      for (const o of nested) {
        if (o && typeof o === "object") {
          const n = o.name || o.title || o.displayName;
          if (n && typeof n === "string" && n.trim()) {
            return n.trim().slice(0, 40);
          }
        }
      }

      const cid = s.contactId || s.contact_id;
      if (cid) {
        try {
          const contact = ctx.data.contacts?.get?.(cid);
          if (contact) {
            const n = contact.name || contact.title || contact.displayName;
            if (n && typeof n === "string" && n.trim()) {
              return n.trim().slice(0, 40);
            }
          }
        } catch (_) {}
        try {
          const contacts = ctx.data.contacts?.list?.() || [];
          for (const c of contacts) {
            const id = String(c.id || c.contactId || c.contact_id || "");
            if (id !== String(cid)) continue;
            const n = c.name || c.title || c.displayName;
            if (n && typeof n === "string" && n.trim()) {
              return n.trim().slice(0, 40);
            }
          }
        } catch (_) {}
      }

      return "群聊";
    }

    function buildSessionTarget(s, charMap) {
      const sid = s.id || s.sessionId;
      if (!sid) return null;
      const isGroup = s.isGroup === true;

      let name;
      if (isGroup) {
        name = resolveGroupDisplayName(s);
      } else {
        const matchedChar =
          (s.characterId && charMap.get(String(s.characterId))) ||
          (s.contactId && charMap.get(String(s.contactId)));
        name = matchedChar ? matchedChar.name : s.title || s.name || "角色";
      }

      return {
        id: sid,
        name: isGroup ? `【${name}】的礼物堆` : `【${name}】的背包`,
        rawName: name || (isGroup ? "群聊" : "角色"),
        sessionId: sid,
        isUser: false,
        isGroup,
      };
    }

    function getAllGiftTargets() {
      if (targetsCache) return targetsCache;
      const targets = [
        { id: "user", name: "我的背包", rawName: "我的背包", isUser: true },
      ];

      try {
        const sessions = ctx.data.sessions.list() || [];
        const charMap = buildCharMap();
        sessions.forEach((s) => {
          if (!s) return;
          const t = buildSessionTarget(s, charMap);
          if (t) targets.push(t);
        });
      } catch (_) {}

      targetsCache = targets;
      return targets;
    }

    function getAllGiftTargetsRaw() {
      if (rawTargetsCache) return rawTargetsCache;
      const all = getAllGiftTargets();
      const list = [];
      for (let i = 0; i < all.length; i++) {
        if (!all[i].isUser) list.push(all[i]);
      }
      rawTargetsCache = list;
      return list;
    }

    function formatTime(timestamp) {
      if (!timestamp) return "近期";
      try {
        const d = new Date(timestamp);
        if (isNaN(d.getTime())) return String(timestamp);
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const hh = String(d.getHours()).padStart(2, "0");
        const min = String(d.getMinutes()).padStart(2, "0");
        return `${mm}/${dd} ${hh}:${min}`;
      } catch (_) {
        return "近期";
      }
    }

    function parseDateToTimestamp(str) {
      if (!str || typeof str !== "string") return 0;
      const m = str
        .trim()
        .match(/^(\d{1,2})[\/\-月](\d{1,2})[日]?\s*(\d{1,2})[:：](\d{1,2})/);
      if (!m) return 0;
      const month = parseInt(m[1], 10) - 1;
      const day = parseInt(m[2], 10);
      const hh = parseInt(m[3], 10);
      const min = parseInt(m[4], 10);
      if (
        month < 0 ||
        month > 11 ||
        day < 1 ||
        day > 31 ||
        hh < 0 ||
        hh > 23 ||
        min < 0 ||
        min > 59
      ) {
        return 0;
      }
      const now = new Date();
      let year = now.getFullYear();
      if (month - now.getMonth() > 6) year -= 1;
      let d = new Date(year, month, day, hh, min);
      let t = d.getTime();
      if (isNaN(t)) return 0;
      /* 跨年保护：若解析结果比现在晚超过一年，回退一年 */
      if (t > now.getTime() + 365 * 86400 * 1000) {
        year -= 1;
        d = new Date(year, month, day, hh, min);
        t = d.getTime();
      }
      return isNaN(t) ? 0 : t;
    }

    /* 从 msgId（形如 msg_<13位毫秒>_<随机>）里抠出时间戳 */
    function extractTsFromMsgId(msgId) {
      if (!msgId) return 0;
      const m = String(msgId).match(/_(\d{10,13})_/);
      if (!m) return 0;
      let n = Number(m[1]);
      if (!Number.isFinite(n) || n <= 0) return 0;
      if (n < 1e12) n *= 1000;
      if (n > Date.now() + 86400 * 1000) return 0;
      return n;
    }

    function compressImageFile(file, maxWidth = 200, maxHeight = 200) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            let w = img.width;
            let h = img.height;
            if (w > maxWidth || h > maxHeight) {
              if (w / h > maxWidth / maxHeight) {
                h = Math.round((h * maxWidth) / w);
                w = maxWidth;
              } else {
                w = Math.round((w * maxHeight) / h);
                h = maxHeight;
              }
            }
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const cctx = canvas.getContext("2d");
            const isPng = file.type === "image/png";
            if (!isPng) {
              cctx.fillStyle = "#ffffff";
              cctx.fillRect(0, 0, w, h);
            }
            cctx.drawImage(img, 0, 0, w, h);
            const outType = isPng ? "image/png" : "image/jpeg";
            const outQuality = isPng ? undefined : 0.85;
            resolve(canvas.toDataURL(outType, outQuality));
          };
          img.onerror = reject;
          img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    // ================= 存储 =================
    const STORAGE_KEY = "backpack_gifts_v1";
    let giftsCache = null;
    let giftsCacheAt = 0;
    let cacheEpoch = 0;

    async function loadGiftsFromStorage() {
      try {
        const data = await ctx.system.storage.get(STORAGE_KEY);
        return Array.isArray(data) ? data : [];
      } catch (e) {
        logError("backpack load storage error", e);
        return [];
      }
    }

    async function getGlobalGifts() {
      if (giftsCache) return giftsCache.slice();
      const epoch = cacheEpoch;
      const data = await loadGiftsFromStorage();
      if (epoch !== cacheEpoch) {
        return giftsCache ? giftsCache.slice() : data;
      }
      giftsCache = data;
      giftsCacheAt = Date.now();
      return giftsCache.slice();
    }

    let writeChain = Promise.resolve();

    function enqueueWrite(task) {
      const run = writeChain.then(task, task);
      writeChain = run.catch(() => {});
      return run;
    }

    const CACHE_FRESH_MS = 2000;

    async function mutateGifts(mutator) {
      return enqueueWrite(async () => {
        const now = Date.now();
        const fresh =
          giftsCache && now - giftsCacheAt < CACHE_FRESH_MS
            ? giftsCache.slice()
            : await loadGiftsFromStorage();

        let result;
        try {
          result = (await mutator(fresh)) || {};
        } catch (e) {
          logError("backpack mutator error", e);
          result = { changed: false };
        }

        if (!result.changed) {
          giftsCache = fresh;
          giftsCacheAt = Date.now();
          cacheEpoch++;
          return fresh;
        }

        const deduped = dedupGifts(result.gifts || fresh);
        try {
          await ctx.system.storage.set(STORAGE_KEY, deduped);
        } catch (e) {
          logError("backpack storage set error", e);
        }
        giftsCache = deduped;
        giftsCacheAt = Date.now();
        cacheEpoch++;
        schedulePromptSync(result.changedSessionIds);
        return deduped;
      });
    }

    function dedupGifts(list) {
      const map = new Map();
      for (const g of list) {
        if (!g || !g.id) continue;
        if (!map.has(g.id)) {
          map.set(g.id, g);
        } else {
          const prev = map.get(g.id);
          map.set(g.id, {
            ...prev,
            ...g,
            title: g.title || prev.title,
            source: g.source && g.source !== "未标注" ? g.source : prev.source,
            value: g.value && g.value !== "--" ? g.value : prev.value,
            date: g.date && g.date !== "近期" ? g.date : prev.date,
            note: g.note !== undefined ? g.note : prev.note,
            customImage:
              g.customImage !== undefined ? g.customImage : prev.customImage,
            sessionId: g.sessionId || prev.sessionId,
            recipient: g.recipient || prev.recipient,
            giver: g.giver !== undefined ? g.giver : prev.giver,
            giverRole: g.giverRole !== undefined ? g.giverRole : prev.giverRole,
            isManual: g.isManual !== undefined ? g.isManual : prev.isManual,
            isRoleAdded:
              g.isRoleAdded !== undefined ? g.isRoleAdded : prev.isRoleAdded,
            injected: g.injected !== undefined ? g.injected : prev.injected,
            visibleTo:
              g.visibleTo !== undefined ? g.visibleTo : prev.visibleTo,
            userEdited: !!(prev.userEdited || g.userEdited),
            timestamp: g.timestamp || prev.timestamp,
          });
        }
      }
      return Array.from(map.values());
    }

    async function replaceGiftById(id, patch, opts = {}) {
      return mutateGifts((all) => {
        const idx = all.findIndex((g) => g.id === id);
        if (idx < 0) return { changed: false };
        const prev = all[idx];
        const oldSid = prev.sessionId;
        const oldVisibleTo = Array.isArray(prev.visibleTo)
          ? prev.visibleTo.slice()
          : [];
        const prevRecipient = prev.recipient;

        const updated = { ...prev, ...patch, id };
        if (opts.userEdited !== undefined) {
          updated.userEdited = opts.userEdited;
        }
        /* 仅在调用方明确改 recipient 且未指定 visibleTo 时才清空 */
        if (
          patch.recipient !== undefined &&
          updated.recipient === "character" &&
          patch.visibleTo === undefined
        ) {
          updated.visibleTo = [];
        }
        if (prevRecipient === "group" && updated.recipient !== "group") {
          delete updated.giver;
          delete updated.giverRole;
        }
        all[idx] = updated;

        const newSid = updated.sessionId;
        const newVisibleTo = Array.isArray(updated.visibleTo)
          ? updated.visibleTo
          : [];
        const sids = new Set();
        if (updated.recipient === "character" || prevRecipient === "character") {
          if (oldSid) sids.add(sidStr(oldSid));
          if (newSid) sids.add(sidStr(newSid));
        }
        if (updated.recipient === "group" || prevRecipient === "group") {
          if (oldSid) sids.add(sidStr(oldSid));
          if (newSid) sids.add(sidStr(newSid));
        }
        if (
          updated.recipient === "user" ||
          prevRecipient === "user" ||
          updated.recipient === "group" ||
          prevRecipient === "group"
        ) {
          oldVisibleTo.forEach((s) => s && sids.add(sidStr(s)));
          newVisibleTo.forEach((s) => s && sids.add(sidStr(s)));
        }

        return {
          gifts: all,
          changed: true,
          changedSessionIds: [...sids],
        };
      });
    }

    // ============ 提示词注入 ============
    let pendingChangedSids = new Set();
    let pendingFullSync = false;
    let promptSyncTimer = null;

    function schedulePromptSync(changedSessionIds) {
      if (changedSessionIds === null || changedSessionIds === undefined) {
        pendingFullSync = true;
      } else if (
        Array.isArray(changedSessionIds) &&
        changedSessionIds.length > 0
      ) {
        for (const sid of changedSessionIds) {
          if (sid) pendingChangedSids.add(sidStr(sid));
        }
      } else {
        return;
      }

      if (promptSyncTimer) return;
      promptSyncTimer = later(runPromptSync, 300);
    }

    async function runPromptSync() {
      promptSyncTimer = null;
      const sids = [...pendingChangedSids];
      pendingChangedSids.clear();
      const full = pendingFullSync;
      pendingFullSync = false;

      try {
        const gifts = await getGlobalGifts();
        if (full) {
          syncCharacterPrompts(gifts, null);
        } else if (sids.length > 0) {
          syncCharacterPrompts(gifts, sids);
        }
      } catch (e) {
        logError("backpack prompt sync error", e);
      }
    }

    async function syncSessionPrompt(sid) {
      if (!sid) return;
      try {
        const gifts = await getGlobalGifts();
        syncCharacterPrompts(gifts, [sid]);
      } catch (e) {
        logError("backpack syncSessionPrompt error", e);
      }
    }

    function buildItemLine(g) {
      const extras = [];
      if (g.value && g.value !== "--") {
        extras.push(`价值: ${sanitizePromptField(g.value, 40)}`);
      }
      if (g.source && g.source !== "未标注") {
        extras.push(`来自: ${sanitizePromptField(g.source, 40)}`);
      }
      const extraStr = extras.length > 0 ? `（${extras.join("，")}）` : "";
      let text = `【${sanitizePromptField(g.title, 80)}】${extraStr}`;
      if (g.note && String(g.note).trim()) {
        text += `[物品说明/背景备注: ${sanitizePromptField(g.note, 240)}]`;
      }
      return text;
    }

    const PROMPT_CHAR_ITEM_LIMIT = 50;
    const PROMPT_USER_ITEM_LIMIT = 30;
    const PROMPT_GROUP_ITEM_LIMIT = 30;
    const PROMPT_TRANSFER_TARGET_LIMIT = 20;
    const PROMPT_TOTAL_CHAR_LIMIT = 8000;

    function limitListWithNotice(list, limit, name) {
      if (!Array.isArray(list)) return { items: [], notice: "" };
      if (list.length <= limit) return { items: list, notice: "" };
      return {
        items: list.slice(0, limit),
        notice: `（共${list.length}件，此处仅列出最近${limit}件）`,
      };
    }

    function buildSessionPromptText(charGifts, sid, userGifts, groupGifts) {
      if (isGroupSession(sid)) {
        return buildGroupSessionPromptText(
          sid,
          charGifts,
          userGifts,
          groupGifts
        );
      }
      return buildPrivateSessionPromptText(sid, charGifts, userGifts);
    }

    function buildCommonFormatRules() {
      return (
        `【时间字段格式要求（很重要）】\n` +
        `- 时间必须写成具体的"月/日 时:分"格式，例如 09/12 14:30、11/03 08:05，中间有一个空格。\n` +
        `- 严禁使用"今天""昨天""刚才""刚刚""上午""下午""晚上""凌晨""刚才不久"等相对或模糊的时间描述。\n` +
        `- 若只想记录日期，也要写成 09/12 12:00 这样带具体小时分钟的形式；不确定小时分钟就写 12:00。\n\n` +
        `【其它格式要求】\n` +
        `- 各字段之间用英文分号 ; 分隔（不要用竖线 |、顿号、逗号等其它符号）。\n` +
        `- 新增物品示例：[新增物品:草莓味棒棒糖;城南糖果铺;3.50;09/12 14:30;她上次提到喜欢这个口味，我特意买的]\n` +
        `- 新增物品时必须给出全部五项，不能用省略号或用"无"占位，要写出真实、贴合剧情的内容。\n` +
        `- 物品名称必须与背包列表中的名称完全一致，直接写物品名即可，不要额外加【】、书名号或引号。\n` +
        `- 备注标记中的等号必须保留，等号左侧是物品名，右侧是新的备注内容（可以是长句，可以是中文标点）。\n` +
        `- 标记要自然地融入对话，不要解释标记本身，也不要向用户复述标记内容。\n` +
        `- 只有在剧情确实需要时才使用这些标记，不要滥用。`
      );
    }

    function buildPrivateSessionPromptText(sid, charGifts, userGifts) {
      const charLim = limitListWithNotice(
        charGifts,
        PROMPT_CHAR_ITEM_LIMIT,
        "背包"
      );
      const itemListText =
        charLim.items.length === 0
          ? "（目前你的背包是空的）"
          : charLim.items.map(buildItemLine).join("、") + charLim.notice;

      let text =
        `【随身背包物品】\n` +
        `你的随身背包里拥有以下物品：${itemListText}。\n` +
        `请根据物品说明与背景，在日常交谈或相关情境中自然提及或使用。\n\n` +
        `【背包操作能力】\n` +
        `你可以主动操作你和用户各自的背包物品。操作方式是：在回复文本中写入下列特殊标记，系统会自动执行并把标记从聊天记录中抹掉，用户看不到标记本身。\n` +
        `1. 把自己背包里的某件物品送给用户 —— 写入：[给予用户:物品名称]\n` +
        `2. 从用户背包中拿走某件物品放进自己背包 —— 写入：[拿取:物品名称]\n` +
        `3. 修改自己背包中某件物品的备注 —— 写入：[背包备注:物品名称=新的备注内容]\n` +
        `4. 往自己的背包里新增一件物品 —— 写入：[新增物品:名称;来源;价值;时间;备注]\n` +
        `5. 修改自己背包里物品的信息（来源、价值、时间、备注）—— 写入：[修改物品:名称;来源;价值;时间;备注]\n` +
        `   —— 只填要修改的字段，不想改的字段留空即可（分号要保留）。例如只改时间：[修改物品:草莓棒棒糖;;;09/12 14:30;]\n` +
        `6. 丢弃自己背包里的某件物品 —— 写入：[丢弃:物品名称]\n` +
        `   —— 该物品会从你的背包中彻底移除，系统不再保留任何记录。只有剧情确实需要（如物品损坏、用尽、丢失、送还他人等）才使用。\n\n`;

      if (Array.isArray(userGifts) && userGifts.length > 0) {
        const lim = limitListWithNotice(
          userGifts,
          PROMPT_USER_ITEM_LIMIT,
          "用户背包"
        );
        text +=
          `【用户背包物品】\n` +
          `你留意到用户的背包里有以下物品：${lim.items
            .map(buildItemLine)
            .join("、")}${lim.notice}。\n` +
          `（这些是用户自己拥有的物品，你可以自然地在对话中提及或使用，也可以使用上面的[拿取:物品名称]把它们放进你的背包）\n\n`;
      }

      text += buildCommonFormatRules();

      try {
        const enabled = getEnabledTargetIdsForSource(sid);
        const allTargets = getAllGiftTargets();
        const others = allTargets
          .filter((t) => {
            if (t.isUser) return false;
            if (String(t.id) === String(sid)) return false;
            if (t.isGroup) return false;
            return enabled.has(String(t.id));
          })
          .slice(0, PROMPT_TRANSFER_TARGET_LIMIT);

        if (others.length > 0) {
          text +=
            `\n\n【转赠物品给其他角色的能力】\n` +
            `你可以把自己背包里的物品转赠给以下角色（物品会从你的背包转移到对方那里，你就不再拥有它）：\n` +
            others
              .map((t) => `- ${sanitizePromptField(t.rawName, 40)}`)
              .join("\n") +
            `\n写入：[赠送给角色:角色名;物品名称]\n` +
            `- 角色名必须与上方列表中的名称完全一致；物品名称必须与你背包中的物品名称一致。\n` +
            `- 转赠是真实发生的交接，只有剧情确实需要时才使用，不要滥用。`;
        }
      } catch (_) {}

      if (text.length > PROMPT_TOTAL_CHAR_LIMIT) {
        text =
          text.slice(0, PROMPT_TOTAL_CHAR_LIMIT) +
          "\n（提示词过长，已截断后续内容）";
      }
      return text;
    }

    function buildGroupSessionPromptText(sid, charGifts, userGifts, groupGifts) {
      const charLim = limitListWithNotice(
        charGifts,
        PROMPT_CHAR_ITEM_LIMIT,
        "背包"
      );
      const itemListText =
        charLim.items.length === 0
          ? "（目前你的随身背包是空的）"
          : charLim.items.map(buildItemLine).join("、") + charLim.notice;

      let text =
        `【随身背包物品】\n` +
        `你的随身背包里拥有以下物品：${itemListText}。\n` +
        `请根据物品说明与背景，在日常交谈或相关情境中自然提及或使用。\n\n`;

      if (Array.isArray(groupGifts) && groupGifts.length > 0) {
        const lim = limitListWithNotice(
          groupGifts,
          PROMPT_GROUP_ITEM_LIMIT,
          "群礼物堆"
        );
        const lines = lim.items.map((g) => {
          const giver = sanitizePromptField(g.giver || "群友", 30);
          return `${buildItemLine(g)}（由 ${giver} 放入）`;
        });
        text +=
          `【群礼物堆（公共区域）】\n` +
          `这个群里累积了一些公共礼物，属于所有群成员共有的区域，明细如下：\n` +
          lines.map((l) => `- ${l}`).join("\n") +
          (lim.notice ? `\n${lim.notice}` : "") +
          `\n（这些物品属于群公共区域，不是某个人的私人物品。你可以在对话中自然提及它们；若剧情确实需要，也可以使用下面的标记取走，或往群里放入新的公共物品）\n\n`;
      } else {
        text +=
          `【群礼物堆（公共区域）】\n` +
          `这个群目前还没有人放入公共礼物。你可以在剧情需要时往群里放入一件公共物品。\n\n`;
      }

      if (Array.isArray(userGifts) && userGifts.length > 0) {
        const lim = limitListWithNotice(
          userGifts,
          PROMPT_USER_ITEM_LIMIT,
          "用户背包"
        );
        text +=
          `【用户背包物品】\n` +
          `你留意到用户的背包里有以下物品：${lim.items
            .map(buildItemLine)
            .join("、")}${lim.notice}。\n\n`;
      }

      text +=
        `【群聊内的物品操作能力】\n` +
        `在群聊里，除了可以操作自己背包里的物品，你还可以操作群礼物堆这个公共区域。操作方式是：在回复文本中写入下列特殊标记，系统会自动执行并把标记从聊天记录中抹掉，用户看不到标记本身。\n` +
        `1. 从群礼物堆里取走某件物品放进自己的背包 —— 写入：[拿取:物品名称]\n` +
        `   —— 物品名称必须与群礼物堆明细中的名称完全一致。取走后这件物品就归你所有，不再留在群里。\n` +
        `2. 往群礼物堆里放入一件新的公共物品 —— 写入：[新增物品:名称;来源;价值;时间;备注]\n` +
        `   —— 表示你往群里添置了一件对所有群成员公开的物品。只有当剧情里确实发生了"往群里放东西"这件事时才使用，不要滥用。\n` +
        `3. 从自己背包中拿一件物品送给用户 —— 写入：[给予用户:物品名称]\n` +
        `4. 从用户背包中拿走某件物品放进自己背包 —— 写入：[拿取:物品名称]\n` +
        `5. 修改自己背包中某件物品的备注 —— 写入：[背包备注:物品名称=新的备注内容]\n` +
        `6. 修改自己背包里物品的信息（来源、价值、时间、备注）—— 写入：[修改物品:名称;来源;价值;时间;备注]\n` +
        `   —— 只填要修改的字段，不想改的字段留空即可（分号要保留）。例如只改时间：[修改物品:草莓棒棒糖;;;09/12 14:30;]\n` +
        `7. 丢弃自己背包里的某件物品 —— 写入：[丢弃:物品名称]\n\n` +
        `（注意：群聊里不要把私人背包物品直接"转赠"给其他会话的角色，也不要把群礼物堆当成你自己可以随意处置的私产。）\n\n`;

      text += buildCommonFormatRules();

      if (text.length > PROMPT_TOTAL_CHAR_LIMIT) {
        text =
          text.slice(0, PROMPT_TOTAL_CHAR_LIMIT) +
          "\n（提示词过长，已截断后续内容）";
      }
      return text;
    }

    const promptTextCache = new Map();
    const PROMPT_CACHE_MAX = 200;

    function cacheSetPromptText(sid, text) {
      if (promptTextCache.has(sid)) promptTextCache.delete(sid);
      promptTextCache.set(sid, text);
      while (promptTextCache.size > PROMPT_CACHE_MAX) {
        const oldestKey = promptTextCache.keys().next().value;
        promptTextCache.delete(oldestKey);
      }
    }

    /* 供外部（app.ready / session.opened）强制刷新缓存 */
    function invalidatePromptCache(sid) {
      if (sid === undefined || sid === null) {
        promptTextCache.clear();
      } else {
        promptTextCache.delete(sidStr(sid));
      }
    }

    /* 单遍遍历 gifts，同时建立 char/user/group 三个 bySession 索引。
       避免了旧版 O(sessions × gifts) 的多次全表 filter。
       - sessionIds 为数组时：只对指定 sid 建索引（增量更新用）
       - sessionIds 为 null 时：全量建索引 */
    function syncCharacterPrompts(gifts, sessionIds) {
      try {
        let allSids;
        let targetSet = null;

        if (Array.isArray(sessionIds)) {
          allSids = sessionIds.map((s) => sidStr(s)).filter(Boolean);
          targetSet = new Set(allSids);
        } else {
          const sessions = ctx.data.sessions.list() || [];
          allSids = sessions
            .map((s) => sidStr(s.id || s.sessionId))
            .filter(Boolean);
        }

        const bySession = new Map();
        const userBySession = new Map();
        const groupBySession = new Map();

        function pushTo(map, key, val) {
          const arr = map.get(key);
          if (arr) arr.push(val);
          else map.set(key, [val]);
        }

        /* 单遍遍历 gifts */
        for (const g of gifts) {
          if (!g) continue;
          const rec = g.recipient;

          if (rec === "character" && g.injected === true) {
            const sid = sidStr(g.sessionId);
            if (sid && (!targetSet || targetSet.has(sid))) {
              pushTo(bySession, sid, g);
            }
            continue;
          }

          if (rec === "user") {
            const vis = Array.isArray(g.visibleTo) ? g.visibleTo : [];
            if (vis.length === 0) continue;
            for (const s of vis) {
              const sstr = sidStr(s);
              if (!sstr) continue;
              if (targetSet && !targetSet.has(sstr)) continue;
              pushTo(userBySession, sstr, g);
            }
            continue;
          }

          if (rec === "group") {
            const vis = Array.isArray(g.visibleTo) ? g.visibleTo : [];
            if (vis.length === 0) continue;
            for (const s of vis) {
              const sstr = sidStr(s);
              if (!sstr) continue;
              if (targetSet && !targetSet.has(sstr)) continue;
              pushTo(groupBySession, sstr, g);
            }
          }
        }

        for (const sid of allSids) {
          if (!sid) continue;
          const charGifts = bySession.get(sid) || [];
          const userGifts = userBySession.get(sid) || [];
          const groupGifts = groupBySession.get(sid) || [];
          try {
            const text = buildSessionPromptText(
              charGifts,
              sid,
              userGifts,
              groupGifts
            );
            if (promptTextCache.get(sid) === text) continue;
            cacheSetPromptText(sid, text);
            ctx.prompts.set(text, { sessionId: sid });
          } catch (e) {
            logError("backpack prompts.set error", e);
          }
        }
      } catch (e) {
        logError("backpack syncCharacterPrompts error", e);
      }
    }

    /* ---- 第 1 段结束 ---- */

    // ================= 指令解析工具 =================
    function normalizeItemName(s) {
      return String(s || "")
        .trim()
        .replace(/^[\s【\[「『（(]+/g, "")
        .replace(/[\s】\]」』）)]+$/g, "")
        .replace(/\s+/g, "")
        .toLowerCase();
    }

    function normalizeTargetName(s) {
      return String(s || "")
        .trim()
        .replace(/[【】\[\]「」『』（）()《》\s]/g, "")
        .replace(/的背包$/, "")
        .replace(/的礼物堆$/, "")
        .toLowerCase();
    }

    /* 归一化标题缓存：Symbol 键不会被 JSON 序列化，不会污染存储 */
    const NORM_TITLE = Symbol("bpNormTitle");
    function getNormTitle(g) {
      if (!g) return "";
      if (g[NORM_TITLE] !== undefined) return g[NORM_TITLE];
      const n = normalizeItemName(g.title);
      try {
        g[NORM_TITLE] = n;
      } catch (_) {}
      return n;
    }

    function findGiftByTitle(allGifts, sid, name, recipient) {
      if (!Array.isArray(allGifts) || !name || sid === null || sid === undefined) {
        return -1;
      }
      const rawName = String(name).trim();
      if (!rawName) return -1;
      const normName = normalizeItemName(rawName);
      if (!normName) return -1;
      const sidS = sidStr(sid);
      const canContains = normName.length >= 2;

      let exactHit = -1;
      let normHit = -1;
      let containsHit = -1;

      for (let i = 0; i < allGifts.length; i++) {
        const g = allGifts[i];
        if (!g) continue;
        if (sidS && sidStr(g.sessionId) !== sidS) continue;
        if (recipient && g.recipient !== recipient) continue;
        if (exactHit < 0 && g.title === rawName) {
          exactHit = i;
          break;
        }
        const n = getNormTitle(g);
        if (normHit < 0 && n === normName) normHit = i;
        if (
          canContains &&
          containsHit < 0 &&
          n &&
          n.length >= 2 &&
          (n.includes(normName) || normName.includes(n))
        ) {
          containsHit = i;
        }
      }
      if (exactHit >= 0) return exactHit;
      if (normHit >= 0) return normHit;
      return containsHit;
    }

    function findTargetByRawName(targets, name) {
      const raw = String(name || "").trim();
      if (!raw) return null;
      const norm = normalizeTargetName(raw);
      if (!norm) return null;

      for (const t of targets) {
        if (!t || t.isUser) continue;
        if (t.rawName === raw) return t;
      }
      for (const t of targets) {
        if (!t || t.isUser) continue;
        if (normalizeTargetName(t.rawName) === norm) return t;
      }
      for (const t of targets) {
        if (!t || t.isUser) continue;
        const n = normalizeTargetName(t.rawName);
        if (!n) continue;
        if (n.includes(norm) || norm.includes(n)) return t;
      }
      for (const t of targets) {
        if (!t || t.isUser) continue;
        if (String(t.id) === raw || String(t.sessionId) === raw) return t;
      }
      return null;
    }

    function extractNoteMarkerParts(body) {
      if (!body) return null;
      const raw = String(body).trim();
      if (!raw) return null;

      let m = raw.match(/^([\s\S]*?)\s*[=＝]\s*([\s\S]*)$/);
      if (m) {
        const name = m[1].trim();
        const content = m[2].trim();
        if (name) return { name, content };
      }
      m = raw.match(/^([^:：]*?)\s*[:：]\s*([\s\S]*)$/);
      if (m) {
        const name = m[1].trim();
        const content = m[2].trim();
        if (name) return { name, content };
      }
      m = raw.match(/^(\S+)\s+([\s\S]*)$/);
      if (m) {
        const name = m[1].trim();
        const content = m[2].trim();
        if (name) return { name, content };
      }
      return null;
    }

    function parseNewItemBody(body) {
      if (!body) return null;
      const raw = String(body).trim();
      if (!raw) return null;
      const parts = raw.split(/[;；]/).map((x) => x.trim());
      if (parts.length < 5) return null;
      const title = parts[0] || "";
      const source = parts[1] || "";
      const value = parts[2] || "";
      const date = parts[3] || "";
      const note = parts.slice(4).join(";").trim();
      if (!title) return null;
      return {
        title,
        source: source || "未标注",
        value: value || "--",
        date: date || "",
        note: note || "",
      };
    }

    function parseEditItemBody(body) {
      if (!body) return null;
      const raw = String(body).trim();
      if (!raw) return null;
      const parts = raw.split(/[;；]/).map((x) => x.trim());
      if (parts.length === 1) {
        const title = parts[0] || "";
        if (!title) return null;
        return { title, source: "", value: "", date: "", note: "", _noop: true };
      }
      const title = parts[0] || "";
      if (!title) return null;
      return {
        title,
        source: parts.length > 1 ? parts[1] : "",
        value: parts.length > 2 ? parts[2] : "",
        date: parts.length > 3 ? parts[3] : "",
        note: parts.length > 4 ? parts.slice(4).join(";").trim() : "",
      };
    }

    function parseGiveToCharacterBody(body) {
      if (!body) return null;
      const raw = String(body).trim();
      if (!raw) return null;

      const sepIdx = raw.search(/[;；]/);
      if (sepIdx >= 0) {
        const targetName = raw.slice(0, sepIdx).trim();
        const itemName = raw.slice(sepIdx + 1).trim();
        if (targetName && itemName) return { targetName, itemName };
        return null;
      }

      const m = raw.match(/^([^=＝:：]+)\s*[=＝:：]\s*([\s\S]+)$/);
      if (m) {
        const targetName = m[1].trim();
        const itemName = m[2].trim();
        if (targetName && itemName) return { targetName, itemName };
      }
      return null;
    }

    function hasAnyMarker(text) {
      return /\[(给予用户|赠送给角色|拿取|背包备注|新增物品|修改物品|丢弃)\s*[:：]/.test(
        text
      );
    }

    /* 清理标记 */
    const CLEAN_RE_GIVE = /\[给予用户\s*[:：][\s\S]*?\]/g;
    const CLEAN_RE_GIVE_CHAR = /\[赠送给角色\s*[:：][\s\S]*?\]/g;
    const CLEAN_RE_TAKE = /\[拿取\s*[:：][\s\S]*?\]/g;
    const CLEAN_RE_NOTE = /\[背包备注\s*[:：][\s\S]*?\]/g;
    const CLEAN_RE_ADD = /\[新增物品\s*[:：][\s\S]*?\]/g;
    const CLEAN_RE_EDIT = /\[修改物品\s*[:：][\s\S]*?\]/g;
    const CLEAN_RE_DROP = /\[丢弃\s*[:：][\s\S]*?\]/g;

    function cleanMarkers(text) {
      return text
        .replace(CLEAN_RE_GIVE, "")
        .replace(CLEAN_RE_GIVE_CHAR, "")
        .replace(CLEAN_RE_TAKE, "")
        .replace(CLEAN_RE_NOTE, "")
        .replace(CLEAN_RE_ADD, "")
        .replace(CLEAN_RE_EDIT, "")
        .replace(CLEAN_RE_DROP, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    // ================= llm.response 拦截 =================
    ctx.hooks.transform(
      "llm.response",
      async (p) => {
        if (!p || typeof p.text !== "string" || !p.text) return p;
        if (!hasAnyMarker(p.text)) return p;

        const sid = p.sessionId || "";
        if (!sid) {
          p.text = cleanMarkers(p.text);
          return p;
        }

        let text = p.text;
        const changedSids = new Set();
        let mutated = false;
        const inGroup = isGroupSession(sid);

        await mutateGifts((allGifts) => {
          const GIVE_RE = /\[给予用户\s*[:：]\s*([\s\S]*?)\s*\]/g;
          text = text.replace(GIVE_RE, (_full, nameRaw) => {
            const name = String(nameRaw || "").trim();
            if (name) {
              const idx = findGiftByTitle(allGifts, sid, name, "character");
              if (idx >= 0) {
                allGifts[idx].recipient = "user";
                allGifts[idx].visibleTo = [];
                changedSids.add(sidStr(sid));
                mutated = true;
              }
            }
            return "";
          });

          const GIVE_CHAR_RE = /\[赠送给角色\s*[:：]\s*([\s\S]*?)\s*\]/g;
          text = text.replace(GIVE_CHAR_RE, (_full, body) => {
            const parsed = parseGiveToCharacterBody(body);
            if (!parsed) return "";
            const enabled = getEnabledTargetIdsForSource(sid);
            const allTargets = getAllGiftTargets();
            const candidates = allTargets.filter((t) => {
              if (t.isUser) return false;
              if (String(t.id) === String(sid)) return false;
              return enabled.has(String(t.id));
            });
            const target = findTargetByRawName(candidates, parsed.targetName);
            if (!target || !target.sessionId) return "";
            if (String(target.sessionId) === String(sid)) return "";
            const idx = findGiftByTitle(
              allGifts,
              sid,
              parsed.itemName,
              "character"
            );
            if (idx < 0) return "";
            allGifts[idx].recipient = "character";
            allGifts[idx].sessionId = target.sessionId;
            allGifts[idx].visibleTo = [];
            changedSids.add(sidStr(sid));
            changedSids.add(sidStr(target.sessionId));
            mutated = true;
            return "";
          });

          const TAKE_RE = /\[拿取\s*[:：]\s*([\s\S]*?)\s*\]/g;
          text = text.replace(TAKE_RE, (_full, nameRaw) => {
            const name = String(nameRaw || "").trim();
            if (!name) return "";

            if (inGroup) {
              const gidx = findGiftByTitle(allGifts, sid, name, "group");
              if (gidx >= 0) {
                allGifts[gidx].recipient = "character";
                allGifts[gidx].visibleTo = [];
                delete allGifts[gidx].giver;
                delete allGifts[gidx].giverRole;
                changedSids.add(sidStr(sid));
                mutated = true;
                return "";
              }
            }

            const idx = findGiftByTitle(allGifts, sid, name, "user");
            if (idx >= 0) {
              const oldVis = Array.isArray(allGifts[idx].visibleTo)
                ? allGifts[idx].visibleTo
                : [];
              allGifts[idx].recipient = "character";
              allGifts[idx].sessionId = sid;
              allGifts[idx].visibleTo = [];
              changedSids.add(sidStr(sid));
              oldVis.forEach((s) => s && changedSids.add(sidStr(s)));
              mutated = true;
            }
            return "";
          });

          const NOTE_RE = /\[背包备注\s*[:：]\s*([\s\S]*?)\s*\]/g;
          text = text.replace(NOTE_RE, (_full, body) => {
            const parts = extractNoteMarkerParts(body);
            if (!parts || !parts.name) return "";
            const idx = findGiftByTitle(allGifts, sid, parts.name, "character");
            if (idx >= 0) {
              allGifts[idx].note = parts.content;
              allGifts[idx].userEdited = true;
              changedSids.add(sidStr(sid));
              mutated = true;
            }
            return "";
          });

          const ADD_RE = /\[新增物品\s*[:：]\s*([\s\S]*?)\s*\]/g;
          text = text.replace(ADD_RE, (_full, body) => {
            const parsed = parseNewItemBody(body);
            if (!parsed) return "";
            const newItem = {
              id: `role_add_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 7)}`,
              title: parsed.title,
              source: parsed.source,
              value: parsed.value,
              date: parsed.date || formatTime(Date.now()),
              note: parsed.note,
              customImage: "",
              sessionId: sid,
              recipient: inGroup ? "group" : "character",
              injected: inGroup
                ? false
                : ctx.system.settings.get("defaultInjected") !== false,
              visibleTo: [],
              isManual: false,
              isRoleAdded: true,
              userEdited: true,
              timestamp: Date.now(),
            };
            if (inGroup) {
              newItem.giver = "群友";
              newItem.giverRole = "assistant";
            }
            allGifts.unshift(newItem);
            changedSids.add(sidStr(sid));
            mutated = true;
            return "";
          });

          const EDIT_RE = /\[修改物品\s*[:：]\s*([\s\S]*?)\s*\]/g;
          text = text.replace(EDIT_RE, (_full, body) => {
            const parsed = parseEditItemBody(body);
            if (!parsed || !parsed.title) return "";
            if (parsed._noop) {
              logError(
                "backpack edit marker missing fields:",
                String(body).slice(0, 200)
              );
              return "";
            }
            const idx = findGiftByTitle(
              allGifts,
              sid,
              parsed.title,
              "character"
            );
            if (idx >= 0) {
              if (parsed.source) allGifts[idx].source = parsed.source;
              if (parsed.value) allGifts[idx].value = parsed.value;
              if (parsed.date) allGifts[idx].date = parsed.date;
              if (parsed.note) allGifts[idx].note = parsed.note;
              allGifts[idx].userEdited = true;
              changedSids.add(sidStr(sid));
              mutated = true;
            }
            return "";
          });

          const DROP_RE = /\[丢弃\s*[:：]\s*([\s\S]*?)\s*\]/g;
          text = text.replace(DROP_RE, (_full, nameRaw) => {
            const name = String(nameRaw || "").trim();
            if (name) {
              const idx = findGiftByTitle(allGifts, sid, name, "character");
              if (idx >= 0) {
                allGifts.splice(idx, 1);
                changedSids.add(sidStr(sid));
                mutated = true;
              }
            }
            return "";
          });

          return {
            gifts: allGifts,
            changed: mutated,
            changedSessionIds: [...changedSids],
          };
        });

        p.text = cleanMarkers(text);
        return p;
      },
      { timeoutMs: 30000 }
    );

    ctx.hooks.transform("message.beforePersist", (p) => {
      try {
        const msg = p && p.message;
        if (!msg || typeof msg.content !== "string") return p;
        if (!hasAnyMarker(msg.content)) return p;
        msg.content = cleanMarkers(msg.content);
      } catch (_) {}
      return p;
    });

    ctx.hooks.transform("user.beforeSend", (p) => {
      if (!p || typeof p.text !== "string") return p;
      if (hasAnyMarker(p.text)) {
        const cleaned = cleanMarkers(p.text);
        if (cleaned !== p.text) {
          p.text = cleaned;
          try {
            ctx.ui.toast("已移除消息中的背包标记");
          } catch (_) {}
        }
      }
      return p;
    });

    // ================= 卡片提取引擎 =================
    /* 已删 cardSource（无消费方）。title 兜底选择器排除主标题本身 */
    function extractCardFromDOM(rootEl) {
      if (!rootEl) return null;

      let title =
        rootEl.querySelector(".chat-gift-card-title")?.textContent?.trim() || "";

      if (!title) {
        const titleCandidates = [
          "物品",
          "名称",
          "礼物",
          "商品",
          "品名",
          "礼品",
          "标题",
        ];
        rootEl.querySelectorAll(".chat-gift-card-cell").forEach((cell) => {
          if (title) return;
          const label =
            cell
              .querySelector(".chat-gift-card-cell-label")
              ?.textContent?.trim() || "";
          const val =
            cell
              .querySelector(".chat-gift-card-cell-value")
              ?.textContent?.trim() || "";
          if (val && titleCandidates.some((k) => label.includes(k))) title = val;
        });
      }

      if (!title) {
        try {
          const anyTitles = rootEl.querySelectorAll(
            '[class*="title"],[class*="Title"]'
          );
          for (const el of anyTitles) {
            if (el.classList.contains("chat-gift-card-title")) continue;
            const t = el.textContent?.trim() || "";
            if (t && t.length < 80) {
              title = t;
              break;
            }
          }
        } catch (_) {}
      }

      let valueFromCell = "";
      let dateFromCell = "";
      let receiverFromCell = "";

      rootEl.querySelectorAll(".chat-gift-card-cell").forEach((cell) => {
        const label =
          cell
            .querySelector(".chat-gift-card-cell-label")
            ?.textContent?.trim() || "";
        const val =
          cell
            .querySelector(".chat-gift-card-cell-value")
            ?.textContent?.trim() || "";
        if (!val || !label) return;

        if (
          !receiverFromCell &&
          (label === "收礼人" ||
            label.includes("收礼") ||
            label.includes("接收") ||
            label === "送给" ||
            label.includes("赠送对象"))
        ) {
          receiverFromCell = val;
          return;
        }

        if (label === "编号" || label.includes("编号")) return;

        if (
          !valueFromCell &&
          (label === "礼物值" ||
            label === "价值" ||
            label.includes("价值") ||
            label.includes("金额") ||
            label.includes("价格") ||
            label.includes("礼物值"))
        ) {
          valueFromCell = val;
        } else if (
          !dateFromCell &&
          (label === "送出" ||
            label === "时间" ||
            label.includes("时间") ||
            label.includes("日期") ||
            label.includes("送出"))
        ) {
          dateFromCell = val;
        }
      });

      return {
        title,
        value: valueFromCell,
        date: dateFromCell,
        receiver: receiverFromCell,
      };
    }

    function resolveReceiverToSession(name) {
      if (!name) return null;
      if (!receiverToSessionCache) {
        receiverToSessionCache = new Map();
        try {
          const sessions = ctx.data.sessions.list() || [];
          const charMap = buildCharMap();
          for (const s of sessions) {
            if (!s || s.isGroup === true) continue;
            const t = buildSessionTarget(s, charMap);
            if (!t) continue;
            const key = normalizeTargetName(t.rawName);
            if (key && !receiverToSessionCache.has(key)) {
              receiverToSessionCache.set(key, t.sessionId);
            }
          }
        } catch (_) {}
      }
      const norm = normalizeTargetName(name);
      if (!norm) return null;
      return receiverToSessionCache.get(norm) || null;
    }

    function isReceiverUser(name) {
      if (!name) return false;
      const n = String(name).trim().toLowerCase();
      return (
        n === "用户" || n === "我" || n === "you" || n === "me" || n === "自己"
      );
    }

    /* 时间戳优先级：卡片 date > msgId 抠 > 传入属性 ts > now */
    function resolveItemTimestamp(extractedDate, msgId, fallbackTs) {
      let ts = 0;
      if (extractedDate && extractedDate !== "近期") {
        ts = parseDateToTimestamp(extractedDate);
      }
      if (!ts && msgId) ts = extractTsFromMsgId(msgId);
      if (!ts && fallbackTs) ts = fallbackTs;
      if (!ts) ts = Date.now();
      return ts;
    }

    function buildItemFromExtracted(extracted, opts) {
      const {
        role,
        msgId,
        idSuffix,
        explicitSessionId,
        msgTimestamp,
        receiverName,
        giverName,
      } = opts;

      if (!extracted || !extracted.title) return null;
      if (!explicitSessionId) return null;
      const title = extracted.title;
      if (!title || title === "Gift Card" || title === "Selected Gift") {
        return null;
      }

      let date = extracted.date;
      if (!date || date === "近期") {
        const tsGuess = resolveItemTimestamp(
          "",
          msgId,
          msgTimestamp || Date.now()
        );
        date = formatTime(tsGuess);
      }

      const isGroup = isGroupSession(explicitSessionId);
      const isUser = role === "user";
      const senderName = isUser ? "用户" : giverName || "角色";

      let recipient;
      let targetSessionId = explicitSessionId;
      let giver = "";
      let giverRole = "";

      const finalReceiver = (extracted.receiver || receiverName || "").trim();

      if (isGroup) {
        if (finalReceiver && isReceiverUser(finalReceiver)) {
          recipient = "user";
          targetSessionId = "";
        } else if (finalReceiver) {
          const matchedSid = resolveReceiverToSession(finalReceiver);
          if (matchedSid) {
            recipient = "character";
            targetSessionId = matchedSid;
          } else {
            recipient = "group";
            targetSessionId = explicitSessionId;
            giver = senderName;
            giverRole = isUser ? "user" : "assistant";
          }
        } else {
          recipient = "group";
          targetSessionId = explicitSessionId;
          giver = senderName;
          giverRole = isUser ? "user" : "assistant";
        }
      } else {
        recipient = isUser ? "character" : "user";
        targetSessionId = explicitSessionId;
      }

      const baseId =
        msgId || `gift_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const realId = idSuffix ? `${baseId}${idSuffix}` : baseId;

      const item = {
        id: realId,
        title,
        source: senderName,
        value: extracted.value || "--",
        date: date || "近期",
        sessionId: targetSessionId,
        recipient,
        injected:
          recipient === "character"
            ? ctx.system.settings.get("defaultInjected") !== false
            : false,
        visibleTo: [],
        isManual: false,
        note: "",
        customImage: "",
        timestamp: resolveItemTimestamp(date, msgId, msgTimestamp),
      };

      if (recipient === "group") {
        item.giver = giver;
        item.giverRole = giverRole;
      }

      return item;
    }

    function parseAnyGiftSource(
      source,
      role,
      msgId,
      explicitSessionId,
      msgTimestamp,
      receiverName,
      giverName
    ) {
      const list = parseAllGiftSources(
        source,
        role,
        msgId,
        explicitSessionId,
        msgTimestamp,
        receiverName,
        giverName
      );
      return list.length > 0 ? list[0] : null;
    }

    function parseAllGiftSources(
      source,
      role,
      msgId,
      explicitSessionId,
      msgTimestamp,
      receiverName,
      giverName
    ) {
      if (!source || !explicitSessionId) return [];

      if (typeof source === "string") {
        if (source.length > 32 * 1024) return [];
        const trimmed = source.trim();
        if (!trimmed) return [];

        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          try {
            const parsed = JSON.parse(trimmed);
            return parseAllGiftSources(
              parsed,
              role,
              msgId,
              explicitSessionId,
              msgTimestamp,
              receiverName,
              giverName
            );
          } catch (_) {
            return [];
          }
        }

        const hasCardClass = trimmed.includes("chat-gift-card");
        const simpleMatch =
          !hasCardClass &&
          /(?:\[|【)(?:礼物|赠礼|送礼)[:：]/.test(trimmed);

        if (!hasCardClass && !simpleMatch) return [];

        if (hasCardClass) {
          try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(trimmed, "text/html");
            const cardEls = doc.querySelectorAll(".chat-gift-card");
            if (cardEls.length === 0) return [];
            const results = [];
            let idx = 0;
            cardEls.forEach((cardEl) => {
              const res = extractCardFromDOM(cardEl);
              if (!res || !res.title) return;
              const suffix = idx === 0 ? "" : `_${idx}`;
              const item = buildItemFromExtracted(res, {
                role,
                msgId,
                idSuffix: suffix,
                explicitSessionId,
                msgTimestamp,
                receiverName,
                giverName,
              });
              if (item) results.push(item);
              idx++;
            });
            return results;
          } catch (_) {
            return [];
          }
        }

        const m = trimmed.match(
          /(?:\[|【)(?:礼物|赠礼|送礼)[:：]\s*([^\]】]+?)(?:\]|】)/
        );
        if (!m || !m[1]) return [];
        const item = buildItemFromExtracted(
          { title: m[1].trim(), value: "", date: "", receiver: "" },
          {
            role,
            msgId,
            idSuffix: "",
            explicitSessionId,
            msgTimestamp,
            receiverName,
            giverName,
          }
        );
        return item ? [item] : [];
      }

      if (isElementLike(source)) {
        const cardEls =
          source.classList && source.classList.contains("chat-gift-card")
            ? [source]
            : Array.from(source.querySelectorAll(".chat-gift-card"));
        if (cardEls.length === 0) return [];
        const results = [];
        let idx = 0;
        cardEls.forEach((cardEl) => {
          const res = extractCardFromDOM(cardEl);
          if (!res || !res.title) return;
          const suffix = idx === 0 ? "" : `_${idx}`;
          const item = buildItemFromExtracted(res, {
            role,
            msgId,
            idSuffix: suffix,
            explicitSessionId,
            msgTimestamp,
            receiverName,
            giverName,
          });
          if (item) results.push(item);
          idx++;
        });
        return results;
      }

      if (source && typeof source === "object") {
        const looksLikeGift =
          source.giftId !== undefined ||
          source.giftName !== undefined ||
          source.cardTitle !== undefined ||
          source.type === "gift" ||
          source.kind === "gift" ||
          source.cardType === "gift" ||
          source.mediaType === "gift" ||
          (source.title !== undefined &&
            (source.giftValue !== undefined ||
              source.sourceShop !== undefined ||
              source.giftDate !== undefined));

        if (!looksLikeGift) {
          if (source.data && typeof source.data === "object") {
            return parseAllGiftSources(
              source.data,
              role,
              msgId,
              explicitSessionId,
              msgTimestamp,
              receiverName,
              giverName
            );
          }
          return [];
        }

        const title =
          source.giftName || source.cardTitle || source.title || source.name || "";
        const value =
          source.giftValue !== undefined
            ? source.giftValue
            : source.value || source.price || source.amount || "";
        const date = source.giftDate || source.date || source.time || "";
        const extraReceiver =
          source.receiverName ||
          source.receiver ||
          source.recipientName ||
          source.to ||
          "";

        if (!title && source.data && typeof source.data === "object") {
          return parseAllGiftSources(
            source.data,
            role,
            msgId,
            explicitSessionId,
            msgTimestamp,
            receiverName,
            giverName
          );
        }

        const item = buildItemFromExtracted(
          { title, value, date, receiver: extraReceiver },
          {
            role,
            msgId,
            idSuffix: "",
            explicitSessionId,
            msgTimestamp,
            receiverName,
            giverName,
          }
        );
        return item ? [item] : [];
      }

      return [];
    }

    // ================= DOM 扫描 =================
    async function scanCardsFromDOM() {
      const detected = detectCurrentSessionId();
      const scanSessionId = detected || currentSessionId;
      if (!scanSessionId) return 0;

      const cards = document.querySelectorAll(".chat-gift-card");
      if (cards.length === 0) return 0;

      const newItems = [];
      const cardIndexInMsg = new Map();

      cards.forEach((cardEl) => {
        const bubbleWithId = cardEl.closest("[data-msg-id]");
        const wrapper =
          (bubbleWithId && bubbleWithId.closest(".chat-msg-wrapper")) ||
          cardEl.closest(".chat-msg-wrapper") ||
          bubbleWithId;

        let msgId = "";
        if (bubbleWithId) msgId = bubbleWithId.getAttribute("data-msg-id") || "";
        if (!msgId && wrapper && wrapper.id && wrapper.id.startsWith("message-")) {
          msgId = wrapper.id.slice("message-".length);
        }
        if (!msgId) return;

        /* role 解析：data-role 优先，其次 data-ui="bubble-user|bubble-assistant" */
        let role = "";
        if (wrapper) {
          const dr = wrapper.getAttribute("data-role");
          if (dr === "user" || dr === "assistant") role = dr;
        }
        if (!role && bubbleWithId) {
          const dr = bubbleWithId.getAttribute("data-role");
          if (dr === "user" || dr === "assistant") role = dr;
        }
        if (!role && bubbleWithId) {
          const ui = bubbleWithId.getAttribute("data-ui") || "";
          if (ui.startsWith("bubble-")) {
            const r = ui.slice(7);
            if (r === "user" || r === "assistant") role = r;
          }
        }
        if (!role && wrapper) {
          const ui = wrapper.getAttribute("data-ui") || "";
          if (ui.startsWith("bubble-")) {
            const r = ui.slice(7);
            if (r === "user" || r === "assistant") role = r;
          }
        }
        if (!role) role = "assistant";

        let msgTimestamp = 0;
        const tsSources = [bubbleWithId, wrapper];
        for (const node of tsSources) {
          if (!node) continue;
          const tsAttr =
            node.getAttribute("data-msg-timestamp") ||
            node.getAttribute("data-created-at") ||
            node.getAttribute("data-timestamp");
          if (!tsAttr) continue;
          const n0 = Number(tsAttr);
          if (Number.isFinite(n0) && n0 > 0) {
            msgTimestamp = n0 < 1e12 ? n0 * 1000 : n0;
            break;
          }
        }
        /* msgId 里编码的时间戳作为二级兜底 */
        if (!msgTimestamp) {
          const fromId = extractTsFromMsgId(msgId);
          if (fromId) msgTimestamp = fromId;
        }
        if (!msgTimestamp) msgTimestamp = Date.now();

        const extracted = extractCardFromDOM(cardEl);
        if (!extracted || !extracted.title) return;

        const idx = cardIndexInMsg.get(msgId) || 0;
        cardIndexInMsg.set(msgId, idx + 1);
        const itemId = idx === 0 ? msgId : `${msgId}_${idx}`;

        const isGroup = isGroupSession(scanSessionId);
        const isUser = role === "user";
        const finalReceiver = (extracted.receiver || "").trim();

        let senderName = isUser ? "用户" : "角色";
        if (!isUser && wrapper) {
          const cid =
            wrapper.getAttribute("data-character-id") ||
            (bubbleWithId && bubbleWithId.getAttribute("data-character-id"));
          if (cid) {
            try {
              const char = ctx.data.characters.get?.(cid);
              if (char && char.name) senderName = String(char.name).slice(0, 30);
            } catch (_) {}
          }
          if (senderName === "角色") {
            const dn =
              wrapper.getAttribute("data-name") ||
              wrapper.getAttribute("data-sender") ||
              wrapper.getAttribute("data-character-name");
            if (dn) senderName = String(dn).slice(0, 30);
          }
          if (senderName === "角色" && !isGroup) {
            const cn = resolveCharacterNameBySession(scanSessionId);
            if (cn) senderName = cn;
          }
        }

        let recipient;
        let targetSessionId = scanSessionId;
        let giver = "";
        let giverRole = "";

        if (isGroup) {
          if (finalReceiver && isReceiverUser(finalReceiver)) {
            recipient = "user";
            targetSessionId = "";
          } else if (finalReceiver) {
            const matchedSid = resolveReceiverToSession(finalReceiver);
            if (matchedSid) {
              recipient = "character";
              targetSessionId = matchedSid;
            } else {
              recipient = "group";
              targetSessionId = scanSessionId;
              giver = senderName;
              giverRole = isUser ? "user" : "assistant";
            }
          } else {
            recipient = "group";
            targetSessionId = scanSessionId;
            giver = senderName;
            giverRole = isUser ? "user" : "assistant";
          }
        } else {
          recipient = isUser ? "character" : "user";
          targetSessionId = scanSessionId;
        }

        const date = extracted.date || formatTime(msgTimestamp);
        const item = {
          id: itemId,
          title: extracted.title,
          source: senderName,
          value: extracted.value || "--",
          date,
          sessionId: targetSessionId,
          recipient,
          injected:
            recipient === "character"
              ? ctx.system.settings.get("defaultInjected") !== false
              : false,
          visibleTo: [],
          isManual: false,
          note: "",
          customImage: "",
          timestamp: resolveItemTimestamp(extracted.date, msgId, msgTimestamp),
        };
        if (recipient === "group") {
          item.giver = giver;
          item.giverRole = giverRole;
        }

        newItems.push(item);
      });

      if (newItems.length === 0) return 0;

      let addedCount = 0;
      await mutateGifts((allGifts) => {
        const existing = new Set(allGifts.map((g) => g.id));
        const toAdd = newItems.filter((g) => !existing.has(g.id));
        if (toAdd.length === 0) return { changed: false };
        allGifts.unshift(...toAdd);
        addedCount = toAdd.length;
        return {
          gifts: allGifts,
          changed: true,
          changedSessionIds: [
            ...new Set(toAdd.map((g) => sidStr(g.sessionId)).filter(Boolean)),
          ],
        };
      });
      return addedCount;
    }

    let domScanTimer = null;

    function scheduleDomScan(delay = 300) {
      cancelTimer(domScanTimer);
      domScanTimer = later(() => {
        domScanTimer = null;
        scanCardsFromDOM().catch((e) => logError("backpack dom scan error", e));
      }, delay);
    }

    // ================= 数据层扫描 =================
    let hasScannedOnce = false;

    const scannedMsgIds = new Set();
    const SCANNED_MSG_IDS_MAX = 5000;

    function rememberScannedId(id) {
      if (!id) return;
      scannedMsgIds.add(id);
      if (scannedMsgIds.size > SCANNED_MSG_IDS_MAX) {
        const trimCount = Math.floor(SCANNED_MSG_IDS_MAX / 10);
        const iter = scannedMsgIds.values();
        for (let i = 0; i < trimCount; i++) {
          const v = iter.next();
          if (v.done) break;
          scannedMsgIds.delete(v.value);
        }
      }
    }

    const SCAN_BATCH_SIZE = 250;

    let _yieldChannel = null;
    function yieldToMain() {
      if (typeof MessageChannel === "function") {
        return new Promise((resolve) => {
          if (!_yieldChannel) _yieldChannel = new MessageChannel();
          const port = _yieldChannel.port1;
          port.onmessage = () => {
            port.onmessage = null;
            resolve();
          };
          _yieldChannel.port2.postMessage(0);
        });
      }
      return new Promise((resolve) => later(resolve, 0));
    }

    /* ===== 扫描进度持久化（断点续扫） ===== */
    const SCAN_PROGRESS_KEY = "backpack_scan_progress_v1";
    let scanProgressCache = null;

    async function loadScanProgress() {
      if (scanProgressCache) return scanProgressCache;
      try {
        const data = await ctx.system.storage.get(SCAN_PROGRESS_KEY);
        if (data && typeof data === "object" && !Array.isArray(data)) {
          scanProgressCache = {
            doneSids: new Set(
              Array.isArray(data.doneSids) ? data.doneSids.map(String) : []
            ),
            completed: data.completed === true,
          };
        } else {
          scanProgressCache = { doneSids: new Set(), completed: false };
        }
      } catch (_) {
        scanProgressCache = { doneSids: new Set(), completed: false };
      }
      return scanProgressCache;
    }

    function saveScanProgress() {
      if (!scanProgressCache) return;
      try {
        ctx.system.storage.set(SCAN_PROGRESS_KEY, {
          doneSids: [...scanProgressCache.doneSids],
          completed: scanProgressCache.completed,
        });
      } catch (_) {}
    }

    /* 极廉价的疑似礼物卡预检：命中才进 parseAllGiftSources，
       未命中的普通消息直接跳过，避免上万条消息时每条都走函数调用 */
    const QUICK_GIFT_RE = /(?:\[|【)(?:礼物|赠礼|送礼)[:：]/;
    function mightContainGift(raw) {
      if (typeof raw !== "string") return false;
      if (raw.length === 0) return false;
      if (raw.length > 32 * 1024) return false;
      if (raw.indexOf("chat-gift-card") >= 0) return true;
      return QUICK_GIFT_RE.test(raw);
    }

    async function scanAllGifts(force = false) {
      if (hasScannedOnce && !force) return 0;
      if (scanningAllGifts) return 0;
      scanningAllGifts = true;
      try {
        if (force) {
          scannedMsgIds.clear();
          scanProgressCache = { doneSids: new Set(), completed: false };
          try {
            await ctx.system.storage.remove(SCAN_PROGRESS_KEY);
          } catch (_) {}
        }

        const progress = await loadScanProgress();
        if (progress.completed && !force) {
          hasScannedOnce = true;
          return 0;
        }

        const sessions = ctx.data.sessions.list() || [];
        const sessionIds = sessions
          .map((s) => s.id || s.sessionId)
          .filter(Boolean);

        const candidates = [];
        let processed = 0;

        for (const sid of sessionIds) {
          const sidS = sidStr(sid);
          if (progress.doneSids.has(sidS)) continue;

          let msgs = [];
          try {
            msgs = ctx.data.messages.list(sid) || [];
          } catch (_) {
            progress.doneSids.add(sidS);
            continue;
          }
          for (const msg of msgs) {
            if (!msg || !msg.id) continue;
            const midStr = String(msg.id);
            if (scannedMsgIds.has(midStr)) continue;

            if (isForeignPluginCard(msg)) {
              rememberScannedId(midStr);
              continue;
            }

            /* 廉价预检：三条路径都先看一遍，全都不像礼物就直接跳过 */
            const hasContent = mightContainGift(msg.content);
            const hasMedia = mightContainGift(
              typeof msg.mediaData === "string"
                ? msg.mediaData
                : msg.mediaData && typeof msg.mediaData === "object"
                ? JSON.stringify(msg.mediaData).slice(0, 4096)
                : ""
            );
            const hasExtra = mightContainGift(
              typeof msg.extra === "string" ? msg.extra : ""
            );

            if (!hasContent && !hasMedia && !hasExtra) {
              processed++;
              if (processed % SCAN_BATCH_SIZE === 0) await yieldToMain();
              continue;
            }

            const giverName = resolveSenderName(msg, msg.role, sid);

            let found = [];
            if (hasContent) {
              found = parseAllGiftSources(
                msg.content,
                msg.role,
                msg.id,
                sid,
                msg.createdAt,
                "",
                giverName
              );
            }
            if (found.length === 0 && hasMedia) {
              found = parseAllGiftSources(
                msg.mediaData,
                msg.role,
                msg.id,
                sid,
                msg.createdAt,
                "",
                giverName
              );
            }
            if (found.length === 0 && hasExtra) {
              found = parseAllGiftSources(
                msg.extra,
                msg.role,
                msg.id,
                sid,
                msg.createdAt,
                "",
                giverName
              );
            }
            for (const it of found) candidates.push(it);

            if (found.length > 0) rememberScannedId(midStr);

            processed++;
            if (processed % SCAN_BATCH_SIZE === 0) {
              await yieldToMain();
            }
          }

          progress.doneSids.add(sidS);
          /* 每个会话处理完落一次盘，供下次中断续扫 */
          saveScanProgress();
        }

        let newCount = 0;
        await mutateGifts((allGifts) => {
          const giftMap = new Map(allGifts.map((g) => [g.id, g]));
          let changed = false;
          const changedSids = new Set();

          for (const gift of candidates) {
            if (!giftMap.has(gift.id)) {
              giftMap.set(gift.id, gift);
              changedSids.add(sidStr(gift.sessionId));
              newCount++;
              changed = true;
            } else {
              const prev = giftMap.get(gift.id);
              if (
                sidStr(prev.sessionId) !== sidStr(gift.sessionId) &&
                !prev.isManual &&
                !prev.userEdited
              ) {
                prev.sessionId = gift.sessionId;
                if (gift.recipient) prev.recipient = gift.recipient;
                if (gift.giver) prev.giver = gift.giver;
                if (gift.giverRole) prev.giverRole = gift.giverRole;
                if (gift.source && gift.source !== prev.source && !prev.isManual) {
                  prev.source = gift.source;
                }
                changedSids.add(sidStr(prev.sessionId));
                changed = true;
              }
            }
          }

          if (!changed) return { changed: false };

          const sorted = Array.from(giftMap.values()).sort(
            (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
          );

          return {
            gifts: sorted,
            changed: true,
            changedSessionIds: [...changedSids].filter(Boolean),
          };
        });

        progress.completed = true;
        saveScanProgress();

        hasScannedOnce = true;
        return newCount;
      } finally {
        scanningAllGifts = false;
      }
    }

    // ================= 新消息落库兜底 =================
    let pendingGifts = [];
    let persistFlushTimer = null;

    function flushPendingGifts() {
      persistFlushTimer = null;
      if (pendingGifts.length === 0) return;
      const batch = pendingGifts;
      pendingGifts = [];

      mutateGifts((allGifts) => {
        const ids = new Set(allGifts.map((g) => g.id));
        const toAdd = batch.filter((g) => !ids.has(g.id));
        if (toAdd.length === 0) return { changed: false };
        toAdd.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        const merged = mergeDescSorted(allGifts, toAdd);
        return {
          gifts: merged,
          changed: true,
          changedSessionIds: [
            ...new Set(toAdd.map((g) => sidStr(g.sessionId)).filter(Boolean)),
          ],
        };
      }).catch((e) => logError("backpack flush pending gifts error", e));
    }

    ctx.hooks.on("message.persisted", ({ message }) => {
      if (!message || !message.sessionId) return;
      if (isForeignPluginCard(message)) return;

      if (msgToSessionCache && message.id) {
        msgToSessionCache.set(String(message.id), message.sessionId);
      }

      const giverName = resolveSenderName(
        message,
        message.role,
        message.sessionId
      );

      let found = [];
      if (message.content) {
        found = parseAllGiftSources(
          message.content,
          message.role,
          message.id,
          message.sessionId,
          message.createdAt,
          "",
          giverName
        );
      }
      if (found.length === 0 && message.mediaData) {
        found = parseAllGiftSources(
          message.mediaData,
          message.role,
          message.id,
          message.sessionId,
          message.createdAt,
          "",
          giverName
        );
      }
      if (found.length === 0) return;

      /* 只有确实命中礼物才把 id 加入"已扫"，避免先扫后改漏掉 */
      if (message.id) rememberScannedId(String(message.id));

      for (const g of found) pendingGifts.push(g);
      if (!persistFlushTimer) {
        persistFlushTimer = later(flushPendingGifts, 400);
      }
    });

    /* 消息被编辑：清掉 id 缓存，下次扫描重新识别；不主动删已入库的礼物，
       避免误删用户手动修改过的条目 */
    ctx.hooks.on("message.updated", ({ id }) => {
      if (!id) return;
      scannedMsgIds.delete(String(id));
      if (msgToSessionCache) msgToSessionCache.delete(String(id));
    });

    ctx.hooks.on("message.deleted", ({ id }) => {
      if (!msgToSessionCache || !id) return;
      msgToSessionCache.delete(String(id));
    });

    // ================= 图标渲染 =================
    function renderItemIconContent(customImage) {
      if (
        customImage &&
        typeof customImage === "string" &&
        isValidImageUrl(customImage)
      ) {
        return `<img src="${esc(
          customImage
        )}" class="backpack-custom-thumb" alt="icon" referrerpolicy="no-referrer" loading="lazy" />`;
      }
      return ICONS.gift;
    }

    // ================= 可见角色编辑器 =================
    function openVisibleRolesEditor(options) {
      const { titleText, hintText, presetIds, excludeIds, parentEl } = options;

      return new Promise((resolve) => {
        let settled = false;
        let mo = null;

        const wrap = document.createElement("div");
        wrap.className = "bp-floating-overlay";
        wrap.style.cssText =
          "position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:120;padding:20px;";

        const finish = (result) => {
          if (settled) return;
          settled = true;
          if (mo) {
            try {
              mo.disconnect();
            } catch (_) {}
            mo = null;
          }
          try {
            wrap.remove();
          } catch (_) {}
          unregisterFloatingOverlay(wrap);
          resolve(result);
        };

        const candidates = getAllGiftTargetsRaw().filter((t) => {
          if (t.isGroup) return false;
          if (excludeIds && excludeIds.has(String(t.id))) return false;
          return true;
        });
        let selected = new Set((presetIds || []).map(String));

        wrap.innerHTML = `
    <div style="background:var(--c-page-body-bg,#fff);border-radius:12px;width:100%;max-width:340px;overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,0.3);display:flex;flex-direction:column;max-height:80vh;">
      <div style="padding:12px 14px;border-bottom:1px solid rgba(128,128,128,0.12);">
        <div style="font-weight:600;font-size:13px;color:var(--c-text);">${esc(
          titleText || "让哪些角色知道"
        )}</div>
        <div style="font-size:10px;color:var(--c-icon);margin-top:3px;">${esc(
          hintText || ""
        )}</div>
      </div>
      <div class="bp-visible-list" style="flex:1;overflow-y:auto;padding:6px;"></div>
      <div style="padding:8px 12px;border-top:1px solid rgba(128,128,128,0.12);display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <button class="bp-visible-all" style="border:none;background:transparent;color:var(--bp-accent);font-size:12px;padding:0;cursor:pointer;">全选</button>
        <div style="display:flex;gap:8px;">
          <button class="bp-visible-cancel" style="border:none;background:rgba(128,128,128,0.12);color:var(--c-text);padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;">
            取消
          </button>
          <button class="bp-visible-save" style="border:none;background:var(--bp-accent);color:#ffffff;padding:6px 16px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;">
            保存
          </button>
        </div>
      </div>
    </div>
  `;

        const listEl = wrap.querySelector(".bp-visible-list");
        const allBtn = wrap.querySelector(".bp-visible-all");

        function updateAllBtn() {
          const allSelected =
            candidates.length > 0 &&
            candidates.every((t) => selected.has(String(t.id)));
          allBtn.textContent = allSelected ? "取消全选" : "全选";
        }

        function render() {
          if (candidates.length === 0) {
            listEl.innerHTML = `
        <div style="padding:24px 12px;text-align:center;font-size:12px;color:var(--c-icon);">
          暂无可选角色
        </div>
      `;
            allBtn.textContent = "全选";
            return;
          }
          const frag = document.createDocumentFragment();
          candidates.forEach((t) => {
            const row = document.createElement("label");
            row.className = "bp-target-edit-item";
            row.setAttribute("data-target-id", String(t.id));
            row.innerHTML = `
        <input type="checkbox" ${
          selected.has(String(t.id)) ? "checked" : ""
        } style="width:16px;height:16px;accent-color:var(--bp-accent);cursor:pointer;flex-shrink:0;">
        <div style="flex:1;min-width:0;">
          <span style="font-size:13px;color:var(--c-text);word-break:break-word;">${esc(
            t.rawName || t.name
          )}</span>
        </div>
      `;
            frag.appendChild(row);
          });
          listEl.innerHTML = "";
          listEl.appendChild(frag);
          updateAllBtn();
        }

        listEl.addEventListener("change", (e) => {
          const cb = e.target;
          if (!cb || cb.type !== "checkbox") return;
          const row = cb.closest(".bp-target-edit-item");
          if (!row) return;
          const id = row.getAttribute("data-target-id");
          if (!id) return;
          if (cb.checked) selected.add(String(id));
          else selected.delete(String(id));
          updateAllBtn();
        });

        allBtn.addEventListener("click", () => {
          const allSelected =
            candidates.length > 0 &&
            candidates.every((t) => selected.has(String(t.id)));
          selected = allSelected
            ? new Set()
            : new Set(candidates.map((t) => String(t.id)));
          render();
        });

        wrap.querySelector(".bp-visible-cancel").addEventListener("click", () => {
          finish({ saved: false, ids: [] });
        });

        wrap.addEventListener("click", (e) => {
          if (e.target === wrap) {
            finish({ saved: false, ids: [] });
          }
        });

        wrap.querySelector(".bp-visible-save").addEventListener("click", () => {
          const ids = [...selected];
          finish({ saved: true, ids });
        });

        render();

        try {
          (parentEl || document.body).appendChild(wrap);
        } catch (e) {
          logError("backpack visible editor append error", e);
          finish({ saved: false, ids: [] });
          return;
        }

        registerFloatingOverlay(wrap, () => {
          finish({ saved: false, ids: [] });
        });

        try {
          const parent = wrap.parentNode;
          if (parent) {
            mo = new MutationObserver(() => {
              if (!wrap.isConnected) {
                finish({ saved: false, ids: [] });
              }
            });
            mo.observe(parent, { childList: true });
          }
        } catch (_) {}
      });
    }

    // ================= 物品详情/编辑弹窗 =================
    function getSourceIdForItem(it) {
      if (!it || !it.recipient || it.recipient === "user") return "user";
      return String(it.sessionId || "");
    }

    function buildSourceFieldHTML(item) {
      const sourceValue = item.source === "未标注" ? "" : item.source || "";
      return `
  <div style="display:flex;flex-direction:column;gap:3px;">
    <span style="font-size:11px;color:var(--c-icon);">来源 / 赠予人</span>
    <input type="text" id="bp-item-source-input" class="bp-input-field" placeholder="例如：穆叶" value="${esc(
      sourceValue
    )}" />
  </div>
`;
    }

    function openItemEditModal(
      item,
      isNew = false,
      targetSessionId = null,
      isUser = false,
      onSaveCallback
    ) {
      ctx.ui.openModal((detailEl, { close: closeDetail }) => {
        let tempCustomImage = item.customImage || "";
        const canEditTitle =
          isNew || item.isManual === true || item.isRoleAdded === true;
        const canEditDate =
          isNew || item.isManual === true || item.isRoleAdded === true;

        const targetIsGroup =
          !isUser && targetSessionId && isGroupSession(targetSessionId);
        const isUserItem = !isNew && item.recipient === "user";
        const isGroupItem = isNew ? !!targetIsGroup : item.recipient === "group";

        const currentVisibleTo = Array.isArray(item.visibleTo)
          ? item.visibleTo.map(String).filter(Boolean)
          : [];
        let editingVisibleTo = currentVisibleTo.slice();

        const titleFieldHTML = canEditTitle
          ? `<input type="text" id="bp-item-title-input" class="bp-input-field" placeholder="例如：冻干草莓脆" value="${esc(
              item.title || ""
            )}" style="font-weight:600;font-size:13px;" />`
          : `<div class="bp-readonly-value">${esc(item.title || "")}</div>
       <div class="bp-readonly-hint">名称来自卡片，如需修改请在聊天中调整卡片内容</div>`;

        const sourceFieldHTML = buildSourceFieldHTML(item);

        detailEl.innerHTML = `
    <div style="position:relative;display:flex;flex-direction:column;width:min(92vw, 450px);background:var(--c-page-body-bg,#ffffff);color:var(--c-text,#1f2937);border-radius:16px;overflow:hidden;box-shadow:0 16px 40px rgba(0,0,0,0.22);font-family:inherit;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid rgba(128,128,128,0.12);">
        <span style="font-weight:600;font-size:14px;color:var(--c-text);">
          ${isNew ? "添加物品到背包" : "物品详情与修改"}
        </span>
        <button id="bp-detail-close" style="border:none;background:transparent;color:var(--c-text);padding:2px;cursor:pointer;display:flex;opacity:0.75;">
          ${ICONS.close}
        </button>
      </div>

      <div style="padding:16px 18px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;max-height:70vh;">
        <div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px;background:rgba(128,128,128,0.05);border:1px solid rgba(128,128,128,0.1);">
          <div id="bp-detail-icon-btn" style="position:relative;width:44px;height:44px;border-radius:10px;background:var(--bp-accent-light);color:var(--bp-accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;overflow:hidden;" title="点击更换图片">
            <div id="bp-detail-icon-inner" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
              ${renderItemIconContent(tempCustomImage)}
            </div>
            <div id="bp-detail-icon-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.38);display:flex;align-items:center;justify-content:center;color:#fff;opacity:0;transition:opacity 0.2s;">
              ${ICONS.camera}
            </div>
          </div>
          <div style="min-width:0;flex:1;display:flex;flex-direction:column;gap:4px;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:11px;color:var(--c-icon);">物品名称</span>
              <button id="bp-open-img-bar-btn" style="border:none;background:transparent;color:var(--bp-accent);font-size:11px;padding:0;cursor:pointer;">
                更换图片
              </button>
            </div>
            ${titleFieldHTML}
          </div>
        </div>

        <div id="bp-img-control-box" style="display:none;flex-direction:column;gap:10px;padding:12px;border-radius:10px;background:rgba(128,128,128,0.06);border:1px solid rgba(128,128,128,0.12);">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:12px;font-weight:600;color:var(--c-text);">更换物品图片</span>
            <button id="bp-reset-img-btn" style="border:none;background:transparent;color:#9ca3af;font-size:11px;padding:0;cursor:pointer;">
              恢复默认图标
            </button>
          </div>

          <div style="display:flex;align-items:center;gap:8px;">
            <input type="file" id="bp-img-file-input" accept="image/*" style="display:none;" />
            <button id="bp-trigger-upload-btn" style="border:none;background:rgba(128,128,128,0.15);color:var(--c-text);padding:6px 10px;border-radius:6px;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;">
              ${ICONS.upload}
              <span>上传本地图片</span>
            </button>
            <span style="font-size:10px;color:var(--c-icon);">自动轻量压缩</span>
          </div>

          <div style="display:flex;gap:6px;">
            <input type="text" id="bp-img-url-input" class="bp-input-field" placeholder="输入图片链接 (URL)..." value="${esc(
              tempCustomImage.startsWith("data:") ? "" : tempCustomImage
            )}" style="flex:1;font-size:11px;padding:5px 8px;" />
            <button id="bp-apply-url-btn" style="border:none;background:rgba(128,128,128,0.15);color:var(--c-text);padding:5px 12px;border-radius:6px;font-size:11px;cursor:pointer;">
              应用
            </button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;">
          ${sourceFieldHTML}
          <div style="display:flex;flex-direction:column;gap:3px;">
            <span style="font-size:11px;color:var(--c-icon);">价值</span>
            <input type="text" id="bp-item-value-input" class="bp-input-field" placeholder="例如：29.90" value="${esc(
              item.value === "--" ? "" : item.value || ""
            )}" />
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:3px;">
          <span style="font-size:11px;color:var(--c-icon);">送出时间 / 记录时间</span>
          ${
            canEditDate
              ? `<div style="display:flex;gap:6px;align-items:stretch;">
                   <input type="text" id="bp-item-date-input" class="bp-input-field" placeholder="例如：09/12 14:30" value="${esc(
                     item.date && item.date !== "近期"
                       ? item.date
                       : formatTime(Date.now())
                   )}" style="flex:1;" />
                   <button type="button" id="bp-item-date-now-btn" title="填入当前时间" style="border:1px solid rgba(128,128,128,0.2);background:rgba(128,128,128,0.08);color:var(--c-text);padding:0 12px;border-radius:8px;font-size:11px;cursor:pointer;white-space:nowrap;font-family:inherit;flex-shrink:0;">现在</button>
                 </div>`
              : `<div style="font-size:12px;color:var(--c-text);padding:7px 10px;background:rgba(128,128,128,0.06);border-radius:8px;border:1px solid rgba(128,128,128,0.12);user-select:text;">${esc(
                  item.date || "近期"
                )}</div>`
          }
        </div>

        <div style="display:flex;flex-direction:column;gap:5px;">
          <span style="font-size:12px;font-weight:600;color:var(--c-text);">物品备注</span>
          <textarea id="bp-item-note-input" placeholder="填写物品备注说明（可不填）..." style="width:100%;height:78px;padding:8px 10px;font-size:12px;border-radius:8px;border:1px solid rgba(128,128,128,0.2);background:var(--c-page-body-bg,#fff);color:var(--c-text);outline:none;resize:none;box-sizing:border-box;font-family:inherit;">${esc(
            item.note || ""
          )}</textarea>
        </div>
      </div>

      <div style="display:flex;gap:8px;align-items:center;padding:12px 18px;background:rgba(128,128,128,0.04);border-top:1px solid rgba(128,128,128,0.1);flex-wrap:wrap;">
        ${
          isNew
            ? ""
            : `<button id="bp-detail-transfer-btn" style="border:1px solid rgba(128,128,128,0.25);background:transparent;color:var(--c-text);padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">
                 ${isGroupItem ? "从礼物堆拿出…" : "放入到…"}
               </button>`
        }
        ${
          isUserItem || isGroupItem
            ? `<button id="bp-detail-visible-btn" style="border:1px solid rgba(59,130,246,0.35);background:rgba(59,130,246,0.08);color:#3b82f6;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">
                 可见角色
               </button>`
            : ""
        }
        <div style="flex:1"></div>
        <button id="bp-detail-cancel-btn" style="border:none;background:rgba(128,128,128,0.12);color:var(--c-text);padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;">
          取消
        </button>
        <button id="bp-detail-save-btn" style="border:none;background:var(--bp-accent);color:#ffffff;padding:6px 16px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;">
          保存
        </button>
      </div>

      <div id="bp-transfer-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.45);display:none;align-items:center;justify-content:center;z-index:50;padding:20px;">
        <div style="background:var(--c-page-body-bg,#fff);border-radius:12px;width:100%;max-width:320px;overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,0.3);">
          <div style="padding:12px 14px;border-bottom:1px solid rgba(128,128,128,0.12);display:flex;align-items:center;justify-content:space-between;">
            <span style="font-weight:600;font-size:13px;color:var(--c-text);">${
              isGroupItem ? "从礼物堆拿出到…" : "放入到"
            }</span>
            <button id="bp-transfer-edit-btn" style="border:none;background:transparent;color:var(--bp-accent);font-size:12px;padding:0;cursor:pointer;">编辑</button>
          </div>
          <div id="bp-transfer-list" style="max-height:280px;overflow-y:auto;padding:6px;"></div>
          <div style="padding:8px 12px;border-top:1px solid rgba(128,128,128,0.12);display:flex;justify-content:flex-end;">
            <button id="bp-transfer-cancel" style="border:none;background:rgba(128,128,128,0.12);color:var(--c-text);padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;">
              取消
            </button>
          </div>
        </div>
      </div>

      <div id="bp-target-edit-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.45);display:none;align-items:center;justify-content:center;z-index:60;padding:20px;">
        <div style="background:var(--c-page-body-bg,#fff);border-radius:12px;width:100%;max-width:340px;overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,0.3);display:flex;flex-direction:column;max-height:80vh;">
          <div style="padding:12px 14px;border-bottom:1px solid rgba(128,128,128,0.12);">
            <div style="font-weight:600;font-size:13px;color:var(--c-text);">编辑转送列表</div>
            <div id="bp-target-edit-hint" style="font-size:10px;color:var(--c-icon);margin-top:3px;"></div>
          </div>
          <div id="bp-target-edit-list" style="flex:1;overflow-y:auto;padding:6px;"></div>
          <div style="padding:8px 12px;border-top:1px solid rgba(128,128,128,0.12);display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <button id="bp-target-edit-selectall" style="border:none;background:transparent;color:var(--bp-accent);font-size:12px;padding:0;cursor:pointer;">全选</button>
            <div style="display:flex;gap:8px;">
              <button id="bp-target-edit-cancel" style="border:none;background:rgba(128,128,128,0.12);color:var(--c-text);padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;">
                取消
              </button>
              <button id="bp-target-edit-save" style="border:none;background:var(--bp-accent);color:#ffffff;padding:6px 16px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;">
                保存
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

        const iconInner = detailEl.querySelector("#bp-detail-icon-inner");
        const iconOverlay = detailEl.querySelector("#bp-detail-icon-overlay");
        const imgControlBox = detailEl.querySelector("#bp-img-control-box");
        const fileInput = detailEl.querySelector("#bp-img-file-input");
        const urlInput = detailEl.querySelector("#bp-img-url-input");

        if (iconOverlay) {
          iconOverlay.addEventListener("mouseenter", () => {
            iconOverlay.style.opacity = "1";
          });
          iconOverlay.addEventListener("mouseleave", () => {
            iconOverlay.style.opacity = "0";
          });
        }

        const toggleImgBox = () => {
          const isShow = imgControlBox.style.display === "flex";
          imgControlBox.style.display = isShow ? "none" : "flex";
        };
        detailEl
          .querySelector("#bp-detail-icon-btn")
          .addEventListener("click", toggleImgBox);
        detailEl
          .querySelector("#bp-open-img-bar-btn")
          .addEventListener("click", toggleImgBox);

        detailEl
          .querySelector("#bp-trigger-upload-btn")
          .addEventListener("click", () => {
            fileInput.click();
          });

        fileInput.addEventListener("change", async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            ctx.ui.toast("正在处理图片...");
            const compressed = await compressImageFile(file, 200, 200);
            if (compressed.length > MAX_IMAGE_LEN) {
              ctx.ui.toast("图片过大，请换一张");
              return;
            }
            tempCustomImage = compressed;
            iconInner.innerHTML = renderItemIconContent(tempCustomImage);
            ctx.ui.toast("预览已更新，点击保存即可生效");
          } catch (err) {
            logError("backpack image compress error", err);
            ctx.ui.toast("图片读取失败");
          }
        });

        detailEl.querySelector("#bp-apply-url-btn").addEventListener("click", () => {
          const url = urlInput.value.trim();
          if (!url) {
            ctx.ui.toast("请输入有效的图片 URL");
            return;
          }
          if (!isValidImageUrl(url)) {
            ctx.ui.toast("图片链接无效或过大，仅支持 http/https/data:image");
            return;
          }
          tempCustomImage = url;
          iconInner.innerHTML = renderItemIconContent(tempCustomImage);
          ctx.ui.toast("预览已更新，点击保存即可生效");
        });

        detailEl.querySelector("#bp-reset-img-btn").addEventListener("click", () => {
          tempCustomImage = "";
          urlInput.value = "";
          fileInput.value = "";
          iconInner.innerHTML = renderItemIconContent(tempCustomImage);
          ctx.ui.toast("已恢复默认图标");
        });

        detailEl.querySelector("#bp-detail-close").addEventListener("click", closeDetail);
        detailEl
          .querySelector("#bp-detail-cancel-btn")
          .addEventListener("click", closeDetail);

        const dateNowBtn = detailEl.querySelector("#bp-item-date-now-btn");
        if (dateNowBtn) {
          dateNowBtn.addEventListener("click", () => {
            const dateInput = detailEl.querySelector("#bp-item-date-input");
            if (!dateInput) return;
            dateInput.value = formatTime(Date.now());
            dateInput.focus();
            try {
              const len = dateInput.value.length;
              dateInput.setSelectionRange(len, len);
            } catch (_) {}
          });
        }

        const transferOverlay = detailEl.querySelector("#bp-transfer-overlay");
        const transferList = detailEl.querySelector("#bp-transfer-list");
        const targetEditOverlay = detailEl.querySelector("#bp-target-edit-overlay");
        const targetEditList = detailEl.querySelector("#bp-target-edit-list");
        const targetEditSelectAllBtn = detailEl.querySelector(
          "#bp-target-edit-selectall"
        );
        const targetEditHint = detailEl.querySelector("#bp-target-edit-hint");

        const itemSourceId = isNew
          ? isUser
            ? "user"
            : String(targetSessionId || "")
          : getSourceIdForItem(item);

        function getSourceEnabledIds() {
          return getEnabledTargetIdsForSource(itemSourceId);
        }

        function getTransferTargets() {
          const all = getAllGiftTargets();
          const enabled = getSourceEnabledIds();
          const result = [];
          if (itemSourceId === "user") {
            for (const t of all) {
              if (t.isUser) continue;
              if (!enabled.has(String(t.id))) continue;
              result.push(t);
            }
          } else {
            for (const t of all) {
              if (t.isUser) {
                result.push(t);
                continue;
              }
              if (String(t.id) === itemSourceId) continue;
              if (!enabled.has(String(t.id))) continue;
              result.push(t);
            }
          }
          return result;
        }

        function renderTransferList() {
          const list = getTransferTargets();
          if (list.length === 0) {
            transferList.innerHTML = `
        <div style="padding:24px 12px;text-align:center;font-size:12px;color:var(--c-icon);">
          没有可放入的目标<br/>可点右上角「编辑」勾选
        </div>
      `;
            return;
          }
          transferList.innerHTML = list
            .map(
              (t) => `
        <div class="bp-transfer-item" data-target-id="${esc(t.id)}">
          ${esc(t.name)}
        </div>
      `
            )
            .join("");
        }

        let editingSelected = new Set();

        function getTargetEditCandidates() {
          const all = getAllGiftTargetsRaw();
          return all.filter((t) => {
            if (t.isGroup) return false;
            if (itemSourceId !== "user" && String(t.id) === itemSourceId) {
              return false;
            }
            return true;
          });
        }

        function updateTargetEditSelectAllLabel(candidates) {
          const allSelected =
            candidates.length > 0 &&
            candidates.every((t) => editingSelected.has(String(t.id)));
          targetEditSelectAllBtn.textContent = allSelected ? "取消全选" : "全选";
        }

        function renderTargetEditor(candidates) {
          if (!candidates || candidates.length === 0) {
            targetEditList.innerHTML = `
        <div style="padding:24px 12px;text-align:center;font-size:12px;color:var(--c-icon);">
          暂无可转送的角色
        </div>
      `;
            targetEditSelectAllBtn.textContent = "全选";
            return;
          }
          const frag = document.createDocumentFragment();
          candidates.forEach((t) => {
            const row = document.createElement("label");
            row.className = "bp-target-edit-item";
            row.setAttribute("data-target-id", String(t.id));
            row.innerHTML = `
        <input type="checkbox" ${
          editingSelected.has(String(t.id)) ? "checked" : ""
        } style="width:16px;height:16px;accent-color:var(--bp-accent);cursor:pointer;flex-shrink:0;">
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">
          <span style="font-size:13px;color:var(--c-text);word-break:break-word;">${esc(
            t.rawName || t.name
          )}</span>
        </div>
      `;
            frag.appendChild(row);
          });
          targetEditList.innerHTML = "";
          targetEditList.appendChild(frag);
          updateTargetEditSelectAllLabel(candidates);
        }

        function openTargetEditor() {
          const candidates = getTargetEditCandidates();
          editingSelected = new Set();
          const enabled = getSourceEnabledIds();
          candidates.forEach((t) => {
            if (enabled.has(String(t.id))) editingSelected.add(String(t.id));
          });

          if (itemSourceId === "user") {
            targetEditHint.textContent = "配置「我的背包」的物品可以放入到哪些角色";
          } else {
            const all = getAllGiftTargets();
            const self = all.find((t) => String(t.id) === itemSourceId);
            const selfName = self ? self.rawName || self.name : "该来源";
            const selfKind = self && self.isGroup ? "群礼物堆" : "角色背包";
            targetEditHint.textContent = `配置「${selfName}」的${selfKind}物品可以放入到哪些角色`;
          }

          renderTargetEditor(candidates);
          targetEditOverlay.style.display = "flex";
        }

        targetEditList.addEventListener("change", (e) => {
          const cb = e.target;
          if (!cb || cb.type !== "checkbox") return;
          const row = cb.closest(".bp-target-edit-item");
          if (!row) return;
          const id = row.getAttribute("data-target-id");
          if (!id) return;
          if (cb.checked) editingSelected.add(String(id));
          else editingSelected.delete(String(id));
          updateTargetEditSelectAllLabel(getTargetEditCandidates());
        });

        targetEditSelectAllBtn.addEventListener("click", () => {
          const candidates = getTargetEditCandidates();
          const allSelected =
            candidates.length > 0 &&
            candidates.every((t) => editingSelected.has(String(t.id)));
          editingSelected = allSelected
            ? new Set()
            : new Set(candidates.map((t) => String(t.id)));
          renderTargetEditor(candidates);
        });

        detailEl
          .querySelector("#bp-target-edit-cancel")
          .addEventListener("click", () => {
            targetEditOverlay.style.display = "none";
          });

        targetEditOverlay.addEventListener("click", (e) => {
          if (e.target === targetEditOverlay)
            targetEditOverlay.style.display = "none";
        });

        detailEl
          .querySelector("#bp-target-edit-save")
          .addEventListener("click", async () => {
            const btn = detailEl.querySelector("#bp-target-edit-save");
            if (btn.disabled) return;
            btn.disabled = true;
            try {
              await saveTransferTargetsConfigForSource(itemSourceId, [
                ...editingSelected,
              ]);
              targetEditOverlay.style.display = "none";
              renderTransferList();
              ctx.ui.toast("转送列表已更新");
              if (onSaveCallback) onSaveCallback();
            } catch (err) {
              logError("backpack save transfer targets error", err);
              ctx.ui.toast("保存失败");
            } finally {
              btn.disabled = false;
            }
          });

        let transferring = false;
        transferList.addEventListener("click", async (e) => {
          if (transferring) return;
          const row = e.target.closest(".bp-transfer-item");
          if (!row) return;
          const targetId = row.getAttribute("data-target-id");
          if (!targetId) return;

          const isTargetUser = targetId === "user";
          const now = Date.now();

          const targetIsGroup = isGroupSession(targetId);
          const patch = {
            recipient: isTargetUser
              ? "user"
              : targetIsGroup
              ? "group"
              : "character",
            sessionId: isTargetUser ? item.sessionId || "" : targetId,
            date: formatTime(now),
            timestamp: now,
          };
          if (targetIsGroup) {
            patch.giver = "用户";
            patch.giverRole = "user";
          }

          transferring = true;
          try {
            await replaceGiftById(item.id, patch, { userEdited: true });
            transferOverlay.style.display = "none";
            const tip = isTargetUser
              ? "已放入到我的背包"
              : targetIsGroup
              ? "已放入到群礼物堆"
              : "已放入到该角色背包";
            ctx.ui.toast(tip);
            if (onSaveCallback) onSaveCallback();
            closeDetail();
          } catch (err) {
            logError("backpack transfer error", err);
            ctx.ui.toast("放入失败");
          } finally {
            transferring = false;
          }
        });

        const transferBtn = detailEl.querySelector("#bp-detail-transfer-btn");
        if (transferBtn) {
          transferBtn.addEventListener("click", () => {
            renderTransferList();
            transferOverlay.style.display = "flex";
          });
        }

        detailEl
          .querySelector("#bp-transfer-edit-btn")
          .addEventListener("click", () => {
            openTargetEditor();
          });

        detailEl.querySelector("#bp-transfer-cancel").addEventListener("click", () => {
          transferOverlay.style.display = "none";
        });

        transferOverlay.addEventListener("click", (e) => {
          if (e.target === transferOverlay)
            transferOverlay.style.display = "none";
        });

        const visibleBtn = detailEl.querySelector("#bp-detail-visible-btn");
        if (visibleBtn) {
          visibleBtn.addEventListener("click", async () => {
            const hint =
              editingVisibleTo.length === 0
                ? "（当前没有任何角色知道这件物品）"
                : `当前让 ${editingVisibleTo.length} 个角色知道`;
            const res = await openVisibleRolesEditor({
              titleText: isGroupItem
                ? "让哪些角色知道这件礼物"
                : "让哪些角色知道这件物品",
              hintText: hint,
              presetIds: editingVisibleTo,
              parentEl: detailEl,
            });
            if (!res.saved) return;

            visibleBtn.disabled = true;
            try {
              await replaceGiftById(
                item.id,
                { visibleTo: res.ids.slice() },
                { userEdited: true }
              );
              editingVisibleTo = res.ids.slice();
              visibleBtn.textContent =
                editingVisibleTo.length > 0
                  ? `可见角色(${editingVisibleTo.length})`
                  : "可见角色";
              ctx.ui.toast(
                editingVisibleTo.length > 0
                  ? `已让 ${editingVisibleTo.length} 个角色知道这件物品`
                  : "已设为仅自己知道"
              );
              if (onSaveCallback) onSaveCallback();
            } catch (err) {
              logError("backpack visible update error", err);
              ctx.ui.toast("设置失败");
            } finally {
              visibleBtn.disabled = false;
            }
          });
        }

        const saveBtn = detailEl.querySelector("#bp-detail-save-btn");
        saveBtn.addEventListener("click", async () => {
          if (saveBtn.disabled) return;

          const sourceInput = detailEl.querySelector("#bp-item-source-input");
          const newSource = sourceInput
            ? sourceInput.value.trim()
            : item.source || "未标注";
          const newValue = detailEl
            .querySelector("#bp-item-value-input")
            .value.trim();
          const newNote = detailEl
            .querySelector("#bp-item-note-input")
            .value.trim();

          let newTitle = item.title || "";
          if (canEditTitle) {
            const titleInput = detailEl.querySelector("#bp-item-title-input");
            if (titleInput) newTitle = titleInput.value.trim();
            if (!newTitle) {
              ctx.ui.toast("请输入物品名称");
              return;
            }
          }

          let newDate = item.date;
          if (canEditDate) {
            const dateInput = detailEl.querySelector("#bp-item-date-input");
            if (dateInput) newDate = dateInput.value.trim();
          }

          if (tempCustomImage && !isValidImageUrl(tempCustomImage)) {
            tempCustomImage = "";
          }

          try {
            const allGiftsForQuota = await getGlobalGifts();
            const usedBytes = computeInlineImageBytes(allGiftsForQuota, item.id);
            if (
              usedBytes + (tempCustomImage?.length || 0) >
              MAX_TOTAL_IMAGE_BYTES
            ) {
              ctx.ui.toast("背包图片总量已满，请先删除部分图片");
              return;
            }
          } catch (_) {}

          saveBtn.disabled = true;
          try {
            if (isNew) {
              const isUserItem2 = isUser === true;
              const finalRecipient = isUserItem2
                ? "user"
                : targetIsGroup
                ? "group"
                : "character";
              const newItem = {
                id: `manual_${Date.now()}_${Math.random()
                  .toString(36)
                  .slice(2, 6)}`,
                title: newTitle,
                source: newSource || "心意手作",
                value: newValue || "--",
                date: newDate || formatTime(Date.now()),
                note: newNote,
                customImage: tempCustomImage,
                sessionId:
                  finalRecipient === "user" ? "" : targetSessionId || "",
                recipient: finalRecipient,
                injected:
                  finalRecipient === "character"
                    ? ctx.system.settings.get("defaultInjected") !== false
                    : false,
                visibleTo: [],
                isManual: true,
                userEdited: true,
                timestamp: Date.now(),
              };
              if (finalRecipient === "group") {
                newItem.giver = "用户";
                newItem.giverRole = "user";
              }
              await mutateGifts((all) => {
                all.unshift(newItem);
                const sids =
                  newItem.sessionId && finalRecipient !== "user"
                    ? [sidStr(newItem.sessionId)]
                    : [];
                return {
                  gifts: all,
                  changed: true,
                  changedSessionIds: sids,
                };
              });
              ctx.ui.toast("已添加物品到背包");
            } else {
              const patch = {
                value: newValue || "--",
                note: newNote,
                customImage: tempCustomImage,
              };
              patch.source = newSource || "未标注";
              if (item.recipient === "group") {
                patch.giver = newSource || item.giver || "群友";
              }
              if (canEditTitle) patch.title = newTitle;
              if (canEditDate) {
                patch.date = newDate || "近期";
                if (newDate && newDate !== item.date) {
                  const t = parseDateToTimestamp(newDate);
                  if (t) patch.timestamp = t;
                }
              }
              if (item.recipient === "user" || item.recipient === "group") {
                patch.visibleTo = editingVisibleTo.slice();
              }
              await replaceGiftById(item.id, patch, { userEdited: true });
              ctx.ui.toast("已保存物品修改");
            }

            if (onSaveCallback) onSaveCallback();
            closeDetail();
          } catch (err) {
            logError("backpack save error", err);
            ctx.ui.toast("保存失败");
            saveBtn.disabled = false;
          }
        });

        return () => {};
      });
    }

    /* ---- 第 2 段结束 ---- */

    // ================= 背包主弹窗 =================
    function openBackpackModal() {
      if (bpModalOpen) return;
      bpModalOpen = true;

      let opened = false;
      try {
        const detected = detectCurrentSessionId();
        if (detected) currentSessionId = detected;
      } catch (_) {}

      invalidateTargetCaches();

      try {
        ctx.ui.openModal((modalEl, { close }) => {
          opened = true;

          /* 卸载检测：只做 700ms 一次的轻量轮询，
             不再挂 document.body MutationObserver，避免被流式回复高频唤醒 */
          let detachTimer = null;

          const stopDetachWatch = () => {
            if (detachTimer) {
              try {
                detachTimer();
              } catch (_) {}
              detachTimer = null;
            }
          };

          const closeModal = () => {
            stopDetachWatch();
            if (!bpModalOpen) {
              try {
                close();
              } catch (_) {}
              return;
            }
            bpModalOpen = false;
            try {
              close();
            } catch (_) {}
          };

          later(() => {
            if (!modalEl || !modalEl.isConnected) {
              if (bpModalOpen) bpModalOpen = false;
              return;
            }
            try {
              detachTimer = ctx.system.timers.setInterval(() => {
                if (!modalEl.isConnected) {
                  stopDetachWatch();
                  bpModalOpen = false;
                }
              }, 700);
            } catch (_) {}
          }, 200);

          const targets = getAllGiftTargets();
          let currentTargetId = "user";

          let isManageMode = false;
          const selectedIds = new Set();
          let renderToken = 0;

          modalEl.innerHTML = `
            <div class="backpack-modal-box">
              <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:14px 18px;border-bottom:1px solid rgba(128,128,128,0.12);">
                <button id="bp-burger-btn" style="justify-self:start;border:none;background:transparent;color:var(--c-text);padding:4px;cursor:pointer;display:flex;align-items:center;opacity:0.75;border-radius:4px;" title="菜单">
                  ${ICONS.descendingMenu}
                </button>
                <span style="font-weight:600;font-size:15px;color:var(--c-text);">背包</span>
                <button id="bp-close-btn" style="justify-self:end;border:none;background:transparent;color:var(--c-text);padding:4px;cursor:pointer;display:flex;opacity:0.75;">
                  ${ICONS.close}
                </button>
              </div>

              <div id="bp-dropdown" class="backpack-dropdown-menu">
                <button class="backpack-menu-action" id="menu-add-btn">
                  ${ICONS.plus}<span>添加物品</span>
                </button>
                <button class="backpack-menu-action" id="menu-rescan-btn">
                  ${ICONS.refresh}<span>重新扫描</span>
                </button>
                <button class="backpack-menu-action" id="menu-batch-btn">
                  ${ICONS.manageList}<span>批量管理</span>
                </button>
              </div>

              <div class="backpack-select-bar">
                <span style="font-size:12px;color:var(--c-icon);white-space:nowrap;">正在查看</span>
                <select id="bp-target-selector" class="backpack-role-select">
                  ${targets
                    .map(
                      (t) =>
                        `<option value="${esc(t.id)}" ${
                          String(t.id) === currentTargetId ? "selected" : ""
                        }>${esc(t.name)}</option>`
                    )
                    .join("")}
                </select>
              </div>

              <div id="bp-list-container" class="backpack-scroll-content"></div>

              <div id="bp-batch-bar" class="backpack-batch-bar">
                <div style="display:flex;align-items:center;justify-content:space-between;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <button id="bp-select-all-btn" style="border:none;background:transparent;color:var(--bp-accent);font-size:12px;padding:0;cursor:pointer;font-weight:500;">全选</button>
                    <span style="font-size:11px;opacity:0.4;">|</span>
                    <span id="bp-select-count" style="font-size:12px;color:var(--c-text);opacity:0.8;">已选 0 项</span>
                  </div>
                  <button id="bp-exit-batch-btn" style="border:none;background:transparent;color:var(--c-text);font-size:12px;padding:0;cursor:pointer;opacity:0.75;">退出管理</button>
                </div>

                <div id="bp-op-buttons" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
                  <button id="bp-inject-confirm-btn" class="backpack-batch-btn" style="background:var(--bp-accent-light);color:var(--bp-accent);">
                    ${ICONS.sparkles}<span>注入记忆</span>
                  </button>
                  <button id="bp-uninject-btn" class="backpack-batch-btn" style="background:rgba(128,128,128,0.12);color:var(--c-text);">
                    ${ICONS.ban}<span>取消注入</span>
                  </button>
                  <button id="bp-visible-btn" class="backpack-batch-btn" style="background:rgba(59,130,246,0.12);color:#3b82f6;display:none;">
                    ${ICONS.eye}<span>可见角色</span>
                  </button>
                  <button id="bp-confirm-del-btn" class="backpack-batch-btn" style="background:rgba(239,68,68,0.12);color:#ef4444;">
                    ${ICONS.trash}<span>删除</span>
                  </button>
                </div>
              </div>
            </div>
          `;

          const listContainer = modalEl.querySelector("#bp-list-container");
          const targetSelector = modalEl.querySelector("#bp-target-selector");
          const burgerBtn = modalEl.querySelector("#bp-burger-btn");
          const dropdown = modalEl.querySelector("#bp-dropdown");
          const batchBar = modalEl.querySelector("#bp-batch-bar");
          const selectCountLabel = modalEl.querySelector("#bp-select-count");
          const selectAllBtn = modalEl.querySelector("#bp-select-all-btn");
          const opButtons = modalEl.querySelector("#bp-op-buttons");

          function updateBatchBar() {
            selectCountLabel.textContent = `已选 ${selectedIds.size} 项`;
          }

          function resetSelectAllLabel() {
            selectAllBtn.textContent = "全选";
          }

          function filterByTarget(gifts) {
            if (currentTargetId === "user") {
              return gifts.filter((g) => g.recipient === "user");
            }
            const sid = String(currentTargetId);
            const isGrp = isGroupSession(sid);
            if (isGrp) {
              return gifts.filter(
                (g) => g.recipient === "group" && sidStr(g.sessionId) === sid
              );
            }
            return gifts.filter(
              (g) => g.recipient === "character" && sidStr(g.sessionId) === sid
            );
          }

          async function renderList() {
            const myToken = ++renderToken;
            const gifts = await getGlobalGifts();
            if (myToken !== renderToken) return;
            const filtered = filterByTarget(gifts);

            const isViewingUser = currentTargetId === "user";
            const isViewingGroup =
              !isViewingUser && isGroupSession(currentTargetId);

            if (opButtons) {
              const injectBtnEl = modalEl.querySelector("#bp-inject-confirm-btn");
              const uninjectBtnEl = modalEl.querySelector("#bp-uninject-btn");
              const visibleBtnEl = modalEl.querySelector("#bp-visible-btn");
              if (isViewingUser) {
                opButtons.style.gridTemplateColumns = "1fr 1fr";
                if (injectBtnEl) injectBtnEl.style.display = "none";
                if (uninjectBtnEl) uninjectBtnEl.style.display = "none";
                if (visibleBtnEl) visibleBtnEl.style.display = "flex";
              } else if (isViewingGroup) {
                opButtons.style.gridTemplateColumns = "1fr 1fr";
                if (injectBtnEl) injectBtnEl.style.display = "none";
                if (uninjectBtnEl) uninjectBtnEl.style.display = "none";
                if (visibleBtnEl) visibleBtnEl.style.display = "flex";
              } else {
                opButtons.style.gridTemplateColumns = "1fr 1fr 1fr";
                if (injectBtnEl) injectBtnEl.style.display = "flex";
                if (uninjectBtnEl) uninjectBtnEl.style.display = "flex";
                if (visibleBtnEl) visibleBtnEl.style.display = "none";
              }
            }

            if (filtered.length === 0) {
              const emptyHint = isViewingGroup
                ? "群里还没有礼物。群成员送出的礼物卡会自动出现在这里"
                : "背包空空如也，点击左上菜单「添加物品」或「重新扫描」";
              listContainer.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 0;opacity:0.6;gap:8px;">
                  ${ICONS.emptyBox}
                  <div style="font-size:12px;color:var(--c-text);text-align:center;max-width:280px;">${esc(
                    emptyHint
                  )}</div>
                </div>
              `;
              return;
            }

            const frag = document.createDocumentFragment();
            filtered.forEach((item) => {
              const card = document.createElement("div");
              card.className = `backpack-card-item ${
                selectedIds.has(item.id) ? "selected" : ""
              }`;

              const checkHTML = isManageMode
                ? `<input type="checkbox" class="bp-item-check" data-id="${esc(
                    item.id
                  )}" ${
                    selectedIds.has(item.id) ? "checked" : ""
                  } style="width:16px;height:16px;cursor:pointer;margin-right:2px;accent-color:var(--bp-accent);">`
                : "";

              let iconBadgeHTML = "";
              if (item.recipient === "character" && item.injected) {
                iconBadgeHTML = `<div class="backpack-icon-sparkle-badge">✓</div>`;
              } else if (item.recipient === "user") {
                const visCount = Array.isArray(item.visibleTo)
                  ? item.visibleTo.filter(Boolean).length
                  : 0;
                if (visCount > 0) {
                  iconBadgeHTML = `<div class="backpack-icon-sparkle-badge bp-eye-badge" title="${visCount}个角色可见">${visCount}</div>`;
                }
              } else if (item.recipient === "group") {
                const visCount = Array.isArray(item.visibleTo)
                  ? item.visibleTo.filter(Boolean).length
                  : 0;
                const badgeText = visCount > 0 ? String(visCount) : "群";
                iconBadgeHTML = `<div class="backpack-icon-sparkle-badge bp-group-badge" title="群礼物堆${
                  visCount > 0 ? ` · ${visCount}个角色可见` : ""
                }">${esc(badgeText)}</div>`;
              }

              let subText;
              const noteText = item.note && String(item.note).trim();
              if (item.recipient === "group") {
                const giverName = item.giver || item.source || "群友";
                subText = noteText
                  ? `由 ${giverName} 赠予 · ${noteText}`
                  : `由 ${giverName} 赠予`;
              } else {
                subText = noteText ? noteText : item.source || "未标注";
              }

              if (item.recipient === "user" && !isManageMode) {
                const visCount = Array.isArray(item.visibleTo)
                  ? item.visibleTo.filter(Boolean).length
                  : 0;
                if (visCount === 0 && !noteText) {
                  subText = "尚未让任何角色知道 · 点开可设置";
                }
              }

              card.innerHTML = `
                ${checkHTML}
                <div class="backpack-icon-wrap">
                  ${renderItemIconContent(item.customImage)}
                  ${iconBadgeHTML}
                </div>
                <div class="backpack-card-body">
                  <div style="font-size:14px;font-weight:600;color:var(--c-text);word-break:break-word;line-height:1.3;">
                    ${esc(item.title)}
                  </div>
                  <div style="font-size:11px;color:var(--c-icon);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    ${esc(subText)}
                  </div>
                </div>
              `;

              card.addEventListener("click", (e) => {
                if (isManageMode) {
                  const chk = card.querySelector(".bp-item-check");
                  if (e.target !== chk) chk.checked = !chk.checked;
                  if (chk.checked) selectedIds.add(item.id);
                  else selectedIds.delete(item.id);
                  card.classList.toggle("selected", chk.checked);
                  updateBatchBar();
                } else {
                  openItemEditModal(
                    item,
                    false,
                    item.sessionId,
                    item.recipient === "user",
                    () => {
                      renderList();
                    }
                  );
                }
              });

              if (isManageMode) {
                const chk = card.querySelector(".bp-item-check");
                chk.addEventListener("change", (e) => {
                  if (e.target.checked) selectedIds.add(item.id);
                  else selectedIds.delete(item.id);
                  card.classList.toggle("selected", e.target.checked);
                  updateBatchBar();
                });
              }

              frag.appendChild(card);
            });
            listContainer.innerHTML = "";
            listContainer.appendChild(frag);
          }

          targetSelector.addEventListener("change", (e) => {
            currentTargetId = e.target.value;
            selectedIds.clear();
            updateBatchBar();
            resetSelectAllLabel();
            renderList();
          });

          burgerBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            dropdown.classList.toggle("show");
          });

          modalEl.addEventListener("click", () => {
            dropdown.classList.remove("show");
          });

          modalEl.querySelector("#menu-add-btn").addEventListener("click", () => {
            dropdown.classList.remove("show");
            const isUser = currentTargetId === "user";
            const curSid = String(currentTargetId);
            const isGrp = !isUser && isGroupSession(curSid);
            const defaultSession = isUser ? "" : curSid;
            if (isGrp) {
              openItemEditModal({}, true, defaultSession, false, () => {
                renderList();
              });
            } else {
              openItemEditModal({}, true, defaultSession, isUser, () => {
                renderList();
              });
            }
          });

          modalEl
            .querySelector("#menu-rescan-btn")
            .addEventListener("click", async () => {
              dropdown.classList.remove("show");
              msgToSessionCache = null;
              msgToSessionCacheTime = 0;
              const domCount = await scanCardsFromDOM().catch((e) => {
                logError("backpack rescan dom error", e);
                return 0;
              });
              const dataCount = await scanAllGifts(true).catch((e) => {
                logError("backpack rescan data error", e);
                return 0;
              });
              const total = (domCount || 0) + (dataCount || 0);
              ctx.ui.toast(
                total > 0 ? `扫描收录了 ${total} 件新物品` : "已同步全部背包物品"
              );
              await renderList();
            });

          modalEl.querySelector("#menu-batch-btn").addEventListener("click", () => {
            dropdown.classList.remove("show");
            isManageMode = true;
            selectedIds.clear();
            batchBar.classList.add("show");
            updateBatchBar();
            resetSelectAllLabel();
            renderList();
          });

          selectAllBtn.addEventListener("click", async () => {
            const gifts = await getGlobalGifts();
            const filtered = filterByTarget(gifts);

            if (filtered.length > 0 && selectedIds.size === filtered.length) {
              selectedIds.clear();
              resetSelectAllLabel();
            } else {
              filtered.forEach((g) => selectedIds.add(g.id));
              selectAllBtn.textContent = "取消全选";
            }
            updateBatchBar();
            renderList();
          });

          modalEl
            .querySelector("#bp-exit-batch-btn")
            .addEventListener("click", () => {
              isManageMode = false;
              selectedIds.clear();
              batchBar.classList.remove("show");
              resetSelectAllLabel();
              renderList();
            });

          const injectBtn = modalEl.querySelector("#bp-inject-confirm-btn");
          injectBtn.addEventListener("click", async () => {
            if (injectBtn.disabled) return;
            if (selectedIds.size === 0) {
              ctx.ui.toast("未勾选任何物品");
              return;
            }
            injectBtn.disabled = true;
            try {
              const sids = new Set();
              await mutateGifts((all) => {
                let changed = false;
                all.forEach((g) => {
                  if (
                    selectedIds.has(g.id) &&
                    g.recipient === "character" &&
                    !g.injected
                  ) {
                    g.injected = true;
                    if (g.sessionId) sids.add(sidStr(g.sessionId));
                    changed = true;
                  }
                });
                return { gifts: all, changed, changedSessionIds: [...sids] };
              });
              ctx.ui.toast(
                `已将选中的 ${selectedIds.size} 件物品注入角色背包记忆`
              );
              renderList();
            } finally {
              injectBtn.disabled = false;
            }
          });

          const uninjectBtn = modalEl.querySelector("#bp-uninject-btn");
          uninjectBtn.addEventListener("click", async () => {
            if (uninjectBtn.disabled) return;
            if (selectedIds.size === 0) {
              ctx.ui.toast("未勾选任何物品");
              return;
            }
            uninjectBtn.disabled = true;
            try {
              const sids = new Set();
              await mutateGifts((all) => {
                let changed = false;
                all.forEach((g) => {
                  if (
                    selectedIds.has(g.id) &&
                    g.recipient === "character" &&
                    g.injected
                  ) {
                    g.injected = false;
                    if (g.sessionId) sids.add(sidStr(g.sessionId));
                    changed = true;
                  }
                });
                return { gifts: all, changed, changedSessionIds: [...sids] };
              });
              ctx.ui.toast(`已取消选中的 ${selectedIds.size} 件物品记忆`);
              renderList();
            } finally {
              uninjectBtn.disabled = false;
            }
          });

          const visibleBtn = modalEl.querySelector("#bp-visible-btn");
          visibleBtn.addEventListener("click", async () => {
            if (visibleBtn.disabled) return;
            if (selectedIds.size === 0) {
              ctx.ui.toast("未勾选任何物品");
              return;
            }
            const gifts = await getGlobalGifts();
            const selectedVisibleItems = gifts.filter(
              (g) =>
                selectedIds.has(g.id) &&
                (g.recipient === "user" || g.recipient === "group")
            );
            if (selectedVisibleItems.length === 0) {
              ctx.ui.toast("请勾选「我的背包」或「群礼物堆」里的物品");
              return;
            }

            let preset = null;
            for (const it of selectedVisibleItems) {
              const vis = Array.isArray(it.visibleTo)
                ? it.visibleTo.map(String).filter(Boolean).sort()
                : [];
              if (preset === null) {
                preset = vis;
              } else if (preset.join("|") !== vis.join("|")) {
                preset = [];
                break;
              }
            }

            const res = await openVisibleRolesEditor({
              titleText: `让哪些角色知道（共 ${selectedVisibleItems.length} 件物品）`,
              hintText: "保存后，选中的物品会对这些角色可见",
              presetIds: preset || [],
              parentEl: modalEl,
            });
            if (!res.saved) return;

            visibleBtn.disabled = true;
            try {
              const sids = new Set();
              const newIds = res.ids.slice();
              await mutateGifts((all) => {
                let changed = false;
                all.forEach((g) => {
                  if (
                    selectedIds.has(g.id) &&
                    (g.recipient === "user" || g.recipient === "group")
                  ) {
                    const oldVis = Array.isArray(g.visibleTo) ? g.visibleTo : [];
                    oldVis.forEach((s) => s && sids.add(sidStr(s)));
                    newIds.forEach((s) => s && sids.add(sidStr(s)));
                    g.visibleTo = newIds.slice();
                    g.userEdited = true;
                    changed = true;
                  }
                });
                return { gifts: all, changed, changedSessionIds: [...sids] };
              });
              ctx.ui.toast(
                `已更新 ${selectedVisibleItems.length} 件物品的可见角色`
              );
              await renderList();
            } catch (err) {
              logError("backpack batch visible error", err);
              ctx.ui.toast("设置失败");
            } finally {
              visibleBtn.disabled = false;
            }
          });

          const delBtn = modalEl.querySelector("#bp-confirm-del-btn");
          delBtn.addEventListener("click", async () => {
            if (delBtn.disabled) return;
            if (selectedIds.size === 0) {
              ctx.ui.toast("未勾选任何物品");
              return;
            }
            delBtn.disabled = true;
            try {
              const sids = new Set();
              await mutateGifts((all) => {
                const removed = [];
                const remaining = all.filter((g) => {
                  if (selectedIds.has(g.id)) {
                    removed.push(g);
                    return false;
                  }
                  return true;
                });
                if (removed.length === 0) return { changed: false };
                removed.forEach((g) => {
                  if (g.sessionId) sids.add(sidStr(g.sessionId));
                  if (Array.isArray(g.visibleTo)) {
                    g.visibleTo.forEach((s) => s && sids.add(sidStr(s)));
                  }
                });
                return {
                  gifts: remaining,
                  changed: true,
                  changedSessionIds: [...sids],
                };
              });
              ctx.ui.toast(`已从背包中移除 ${selectedIds.size} 件物品`);
              selectedIds.clear();
              updateBatchBar();
              resetSelectAllLabel();
              await renderList();
            } finally {
              delBtn.disabled = false;
            }
          });

          modalEl.querySelector("#bp-close-btn").addEventListener("click", closeModal);

          renderList();
          scanCardsFromDOM()
            .then(() => renderList())
            .catch((e) => logError("backpack dom scan error", e));
          if (!hasScannedOnce) {
            scanAllGifts()
              .then(() => renderList())
              .catch((e) => logError("backpack full scan error", e));
          }

          return () => {
            stopDetachWatch();
            bpModalOpen = false;
          };
        });
      } catch (e) {
        logError("backpack open modal error", e);
        if (!opened) bpModalOpen = false;
      }
    }

    // ================= 面板按钮挂载 =================
    function buildButtonNode() {
      const btn = document.createElement("div");
      btn.className =
        "chat-plus-menu-item flex flex-col items-center gap-1.5 cursor-pointer";
      btn.style.cursor = "pointer";
      btn.setAttribute("data-plugin-item", "gift-backpack");
      btn.innerHTML = `
        <div class="chat-plus-icon-box">
          ${ICONS.backpack}
        </div>
        <span class="ts-11 text-[var(--c-text)]">背包</span>
      `;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        openBackpackModal();
      });
      return btn;
    }

    function findMenuItemByLabel(menu, label) {
      const items = menu.querySelectorAll(".chat-plus-menu-item");
      for (const item of items) {
        if (item.getAttribute("data-plugin-item") === "gift-backpack") continue;
        const span = item.querySelector("span");
        if (span && span.textContent.trim() === label) return item;
      }
      return null;
    }

    function insertBackpackButton() {
      const menus = document.querySelectorAll(".chat-plus-menu");
      if (!menus || menus.length === 0) return;

      menus.forEach((menu) => {
        const existing = menu.querySelector('[data-plugin-item="gift-backpack"]');
        if (existing) return;

        const items = menu.querySelectorAll(".chat-plus-menu-item");
        if (items.length === 0) return;

        const anchorAfter = findMenuItemByLabel(menu, "礼物");
        const anchorBefore = findMenuItemByLabel(menu, "位置");
        const btn = buildButtonNode();

        if (anchorAfter) anchorAfter.insertAdjacentElement("afterend", btn);
        else if (anchorBefore)
          anchorBefore.insertAdjacentElement("beforebegin", btn);
        else menu.appendChild(btn);
      });
    }

    let buttonScheduled = false;

    function scheduleInsertButton() {
      if (buttonScheduled) return;
      buttonScheduled = true;
      later(() => {
        buttonScheduled = false;
        try {
          insertBackpackButton();
        } catch (e) {
          logError("backpack insert button error", e);
        }
      }, 300);
    }

    function nodeIsInteresting(el) {
      if (!el || el.nodeType !== 1) return false;

      const cl = el.classList;
      if (cl) {
        if (cl.contains("chat-plus-menu")) return true;
        if (cl.contains("chat-plus-menu-item")) return true;
        if (cl.contains("chat-gift-card")) return true;
      }

      const childCount = el.childElementCount;
      if (childCount === 0 || childCount > 40) return false;

      const first = el.firstElementChild;
      if (!first) return false;
      const fcl = first.classList;
      if (fcl) {
        if (fcl.contains("chat-plus-menu")) return true;
        if (fcl.contains("chat-gift-card")) return true;
      }

      const g = first.firstElementChild;
      if (!g) return false;
      const gcl = g.classList;
      if (gcl) {
        if (gcl.contains("chat-plus-menu")) return true;
        if (gcl.contains("chat-gift-card")) return true;
      }

      return false;
    }

    let observerRafPending = false;
    let observerRafFallback = null;

    function releaseObserverPending() {
      observerRafPending = false;
      if (observerRafFallback) {
        cancelTimer(observerRafFallback);
        observerRafFallback = null;
      }
    }

    const observer = new MutationObserver((mutations) => {
      if (document.hidden) return;
      if (buttonScheduled) return;
      if (observerRafPending) return;

      let interesting = false;
      for (let mi = 0; mi < mutations.length && !interesting; mi++) {
        const nodes = mutations[mi].addedNodes;
        if (!nodes || nodes.length === 0) continue;
        for (let i = 0; i < nodes.length; i++) {
          if (nodeIsInteresting(nodes[i])) {
            interesting = true;
            break;
          }
        }
      }
      if (!interesting) return;

      observerRafPending = true;
      observerRafFallback = later(() => {
        observerRafFallback = null;
        if (observerRafPending) {
          observerRafPending = false;
          scheduleInsertButton();
        }
      }, 100);

      try {
        requestAnimationFrame(() => {
          if (observerRafFallback) {
            cancelTimer(observerRafFallback);
            observerRafFallback = null;
          }
          observerRafPending = false;
          scheduleInsertButton();
        });
      } catch (_) {
        releaseObserverPending();
        scheduleInsertButton();
      }
    });

    try {
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) {
      logError("backpack observer error", e);
    }

    scheduleInsertButton();

    ctx.hooks.on("session.opened", ({ sessionId }) => {
      if (!sessionId) return;
      currentSessionId = sessionId;
      invalidateTargetCaches();
      invalidatePromptCache(sessionId);
      msgToSessionCache = null;
      msgToSessionCacheTime = 0;
      /* 直接防抖扫描，不再叠加定时器 */
      scheduleDomScan(200);
      syncSessionPrompt(sessionId);
    });

    ctx.hooks.on("app.ready", () => {
      scheduleInsertButton();
      later(() => scheduleDomScan(500), 400);
      /* 强制刷新提示词缓存，避免宿主重置后插件跳过写入 */
      invalidatePromptCache();
      schedulePromptSync(null);
    });

    try {
      ctx.system.settings.onChange((key) => {
        if (key === "defaultInjected") {
          schedulePromptSync(null);
        }
      });
    } catch (_) {}

    // ============ 一次性数据迁移 ============
    const MIGRATION_KEY = "backpack_migration_v1_user_edited";
    const MIGRATION_KEY_SOURCE = "backpack_migration_v3_24_1_source_to_sender";
    const MIGRATION_KEY_SOURCE_FIX = "backpack_migration_v3_24_2_fix_sender_name";

    async function runMigrations() {
      try {
        const done = await ctx.system.storage.get(MIGRATION_KEY);
        if (done !== true) {
          await mutateGifts((all) => {
            let changed = false;
            for (const g of all) {
              if (
                g &&
                g.recipient === "character" &&
                !g.isManual &&
                g.isRoleAdded !== true &&
                !g.userEdited
              ) {
                g.userEdited = true;
                changed = true;
              }
            }
            return { gifts: all, changed, changedSessionIds: [] };
          });
          await ctx.system.storage.set(MIGRATION_KEY, true);
        }

        const doneSource = await ctx.system.storage.get(MIGRATION_KEY_SOURCE);
        if (doneSource !== true) {
          await mutateGifts((all) => {
            let changed = false;
            for (const g of all) {
              if (!g) continue;

              const expected = (() => {
                if (g.recipient === "user") return "你";
                if (g.recipient === "group") return g.giver || "";
                return resolveCharacterNameBySession(g.sessionId);
              })();

              if (!expected) continue;
              if (g.source === expected) continue;

              if (
                g.isManual === true &&
                g.source &&
                g.source !== "未标注" &&
                g.source !== "心意手作"
              ) {
                continue;
              }

              g.source = expected;
              changed = true;
            }
            return { gifts: all, changed, changedSessionIds: [] };
          });
          await ctx.system.storage.set(MIGRATION_KEY_SOURCE, true);
        }

        const doneSourceFix = await ctx.system.storage.get(
          MIGRATION_KEY_SOURCE_FIX
        );
        if (doneSourceFix !== true) {
          await mutateGifts((all) => {
            let changed = false;
            for (const g of all) {
              if (!g) continue;
              if (g.isManual === true) continue;
              if (g.recipient !== "user") continue;
              if (!g.source || g.source !== "角色") continue;
              const sid = sidStr(g.sessionId);
              if (!sid) continue;
              if (isGroupSession(sid)) continue;
              const name = resolveCharacterNameBySession(sid);
              if (!name || name === "角色") continue;
              g.source = name;
              changed = true;
            }
            return { gifts: all, changed, changedSessionIds: [] };
          });
          await ctx.system.storage.set(MIGRATION_KEY_SOURCE_FIX, true);
        }
      } catch (e) {
        logError("backpack migration error", e);
      }
    }

    loadTransferTargetsConfig()
      .then(() => {
        if (transferTargetsLoaded) schedulePromptSync(null);
        runMigrations().catch((e) => logError("backpack migrate error", e));
      })
      .catch((e) => logError("backpack load targets error", e));

    schedulePromptSync(null);

    // ================= 清理 =================
    return () => {
      buttonScheduled = false;
      observerRafPending = false;
      if (observerRafFallback) {
        cancelTimer(observerRafFallback);
        observerRafFallback = null;
      }

      bpModalOpen = false;
      scanningAllGifts = false;
      promptSyncTimer = null;
      domScanTimer = null;
      persistFlushTimer = null;
      pendingGifts = [];

      promptTextCache.clear();
      scannedMsgIds.clear();

      targetsCache = null;
      rawTargetsCache = null;
      enabledIdsCache = null;
      groupSessionCache = null;
      receiverToSessionCache = null;
      sessionCharNameCache = null;
      charMapCache = null;
      msgToSessionCache = null;
      msgToSessionCacheTime = 0;
      giftsCache = null;
      giftsCacheAt = 0;
      cacheEpoch++;
      scanProgressCache = null;

      cleanupAllFloatingOverlays();

      try {
        document
          .querySelectorAll(".bp-floating-overlay")
          .forEach((el) => el.remove());
      } catch (_) {}

      /* 用 cancelTimer 统一处理 function / number handle */
      for (const c of [...managedTimers]) {
        cancelTimer(c);
      }
      managedTimers.clear();

      try {
        observer.disconnect();
      } catch (_) {}
      document
        .querySelectorAll('[data-plugin-item="gift-backpack"]')
        .forEach((el) => el.remove());
    };
  },
};


