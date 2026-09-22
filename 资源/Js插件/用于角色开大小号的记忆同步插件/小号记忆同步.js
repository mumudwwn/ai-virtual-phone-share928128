export default {
  manifest: {
    id: "alt-account-memory-sync",
    name: "双重身份 · 记忆同步",
    apiVersion: 1,
    version: "9.7.0",
    author: "你",
    description:
      "同一个角色用两个身份（大号/小号）跟同一个人打交道：记忆实时共享、切换即知，删掉小号卡也不丢记忆。可藏身份/试探、按情绪值跨身份主动来找你，并附带「记忆总控台」。所有设置在下方面板里配。",
    permissions: ["chat.read"],
    // 设置全部在插件自绘的面板里（settings.section），不用宿主自动表单，排版更整齐。
    settings: [],
  },

  setup(ctx) {
    // ═════════ 配置存储（结构化，存插件私有 KV）═════════
    const CFG_KEY = "cfg";
    const DEFAULTS = {
      enabled: true,
      recentCount: 16,
      noticeNeglect: true,
      archiveCap: 400,
      connectMemoryDb: false,
      syncSeconds: 20,
      crossProbe: false,
      swingThreshold: 25,
      probeDelayMin: 5,
      probeCooldownSec: 90,
      pairs: [], // [{ big, small, awareness }]
    };
    function loadCfg() {
      const raw = ctx.system.storage.get(CFG_KEY);
      const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
      return Object.assign({}, DEFAULTS, obj);
    }
    function saveCfg(patch) {
      const next = Object.assign(loadCfg(), patch);
      ctx.system.storage.set(CFG_KEY, next);
      return next;
    }
    function getC(k) {
      return loadCfg()[k];
    }

    // ═════════ 配对 / 身份 ═════════
    function getPairsCfg() {
      const arr = loadCfg().pairs;
      return (Array.isArray(arr) ? arr : []).filter(
        (p) => p && typeof p.big === "string" && typeof p.small === "string" && p.big.trim() && p.small.trim(),
      );
    }
    function getPairs() {
      return getPairsCfg().map((p) => [p.big.trim(), p.small.trim()]);
    }
    // 归一化的配对 key（与顺序无关），用它给记忆仓库命名——不挂在角色卡上
    function pairKey(a, b) {
      return "arc:" + [a, b].map((s) => s.trim()).sort().join("\u0001");
    }
    // 名字归一化：容忍全角/半角括号、空格差异，避免「时予和（营业版）」对不上「时予和(营业版)」
    function normName(s) {
      return String(s || "")
        .replace(/（/g, "(")
        .replace(/）/g, ")")
        .replace(/【/g, "[")
        .replace(/】/g, "]")
        .replace(/\s+/g, "")
        .trim();
    }
    // 用「角色名」判断它在哪个配对里、是大号还是小号。不依赖另一张卡是否还存在。
    function identityByName(name) {
      const nm = normName(name);
      for (const p of getPairsCfg()) {
        const big = p.big.trim();
        const small = p.small.trim();
        const key = pairKey(big, small);
        const awareness = p.awareness === "known" ? "known" : "unknown";
        if (nm === normName(big)) return { selfName: big, partnerName: small, selfRole: "主号（大号）", partnerRole: "小号", selfIsSmall: false, key, awareness };
        if (nm === normName(small)) return { selfName: small, partnerName: big, selfRole: "小号", partnerRole: "主号（大号）", selfIsSmall: true, key, awareness };
      }
      return null;
    }
    function charByName(name) {
      const target = normName(name);
      const chars = ctx.data.characters.list() || [];
      return chars.find((c) => normName(c.name) === target) || null;
    }
    function charNameOfSession(sessionId) {
      const sess = ctx.data.sessions.get(sessionId);
      if (!sess || sess.isGroup) return null;
      const ch = ctx.data.characters.get(sess.contactId);
      return ch ? (ch.name || "").trim() : null;
    }
    function sessionOfCharId(charId) {
      const list = (ctx.data.sessions.list() || []).filter((s) => !s.isGroup && s.contactId === charId);
      list.sort((a, b) => (Date.parse(b.updatedAt || 0) || 0) - (Date.parse(a.updatedAt || 0) || 0));
      return list[0] || null;
    }

    // ═════════ 状态值解析（跨身份试探用）═════════
    const RICH_MEDIA_NAMES = new Set(["红包", "转账", "照片", "位置", "表情包", "引用", "语音", "音乐"]);
    function parseStateTags(text) {
      const out = [];
      const re = /\[([^\[\]:：]+)[：:](\d+(?:\.\d+)?)\]/g;
      let m;
      while ((m = re.exec(String(text || ""))) !== null) {
        const name = m[1].trim();
        const v = parseFloat(m[2]);
        if (name && !isNaN(v) && !/^\d+$/.test(name) && !RICH_MEDIA_NAMES.has(name)) {
          out.push({ name, value: Math.max(0, Math.min(100, v)) });
        }
      }
      return out;
    }
    function readFreshValues(message) {
      const fresh = Array.isArray(message.freshStateValues) ? message.freshStateValues : null;
      if (fresh && fresh.length) return fresh;
      const src = typeof message.rawResponseText === "string" && message.rawResponseText ? message.rawResponseText : message.content || "";
      return parseStateTags(src);
    }

    // ═════════ 记忆仓库（插件私有存储，删角色卡不受影响）═════════
    function loadArchive(key) {
      const v = ctx.system.storage.get(key);
      return Array.isArray(v) ? v : [];
    }
    function appendArchive(key, identityName, role, content) {
      const cap = Math.max(50, Number(getC("archiveCap")) || 400);
      const arr = loadArchive(key);
      const text = String(content).replace(/\s+/g, " ").trim();
      if (!text) return;
      const last = arr[arr.length - 1];
      if (last && last.identity === identityName && last.role === role && last.text === text.slice(0, 600)) return;
      arr.push({ identity: identityName, role, text: text.slice(0, 600), ts: Date.now() });
      while (arr.length > cap) arr.shift();
      ctx.system.storage.set(key, arr);
    }
    function formatPartnerRecent(key, partnerName, limit) {
      const arr = loadArchive(key).filter((e) => e.identity === partnerName);
      const tail = arr.slice(-Math.max(1, limit));
      return tail.map((e) => (e.role === "user" ? "对方：" : "你：") + e.text).join("\n");
    }

    // ═════════ 摊牌状态（随剧情演进，不倒退）═════════
    function revealKey(key) {
      return "revealed:" + key;
    }
    function isRevealed(key) {
      return ctx.system.storage.get(revealKey(key)) === true;
    }
    function setRevealed(key, v) {
      ctx.system.storage.set(revealKey(key), v === true);
    }
    const REVEAL_PATTERNS = [
      /你就是[^。！？\n]{0,12}(吧|对不对|是不是)/,
      /(其实|根本)?就是同一个人/,
      /两个(号|身份|账号|马甲)(都)?是你/,
      /(小号|马甲|大号|另一个身份).{0,8}(也)?是你/,
      /我(早就|已经)?知道你(俩|们)?是同一个人/,
      /别装了.{0,12}(是你|同一个)/,
    ];
    function userTextRevealsIdentity(text) {
      const t = String(text || "");
      return REVEAL_PATTERNS.some((re) => re.test(t));
    }

    function seedArchiveFromLiveSessions() {
      for (const [a, b] of getPairs()) {
        const key = pairKey(a, b);
        if (loadArchive(key).length > 0) continue;
        for (const nm of [a, b]) {
          const ch = charByName(nm);
          if (!ch) continue;
          const sessions = (ctx.data.sessions.list() || []).filter((s) => !s.isGroup && s.contactId === ch.id);
          sessions.sort((x, y) => (Date.parse(x.updatedAt || 0) || 0) - (Date.parse(y.updatedAt || 0) || 0));
          for (const s of sessions) {
            for (const m of ctx.data.messages.list(s.id) || []) {
              if ((m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()) {
                appendArchive(key, nm, m.role, m.content);
              }
            }
          }
        }
      }
    }

    // ═════════ 原生记忆库连接（IndexedDB 直连，长期/核心记忆互相镜像）═════════
    const MEM_DB = "ai_phone_memory_db_v1";
    const MEM_STORE = "memories";
    const idbAvailable = typeof indexedDB !== "undefined";
    function idbOpen() {
      return new Promise((resolve) => {
        try {
          const req = indexedDB.open(MEM_DB);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
          req.onblocked = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }
    function idbLoadByChar(db, characterId) {
      return new Promise((resolve) => {
        try {
          if (!db.objectStoreNames.contains(MEM_STORE)) return resolve([]);
          const store = db.transaction(MEM_STORE, "readonly").objectStore(MEM_STORE);
          let req;
          try {
            req = store.index("by_character").getAll(characterId);
          } catch {
            req = store.getAll();
          }
          req.onsuccess = () => resolve((req.result || []).filter((e) => e && e.characterId === characterId));
          req.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      });
    }
    function idbPut(db, entry) {
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(MEM_STORE, "readwrite");
          tx.objectStore(MEM_STORE).put(entry);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    }
    function idbDelete(db, id) {
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(MEM_STORE, "readwrite");
          tx.objectStore(MEM_STORE).delete(id);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    }
    function idbLoadAll(db) {
      return new Promise((resolve) => {
        try {
          if (!db.objectStoreNames.contains(MEM_STORE)) return resolve([]);
          const req = db.transaction(MEM_STORE, "readonly").objectStore(MEM_STORE).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      });
    }
    async function withMemDb(fn) {
      if (!idbAvailable) return null;
      const db = await idbOpen();
      if (!db) return null;
      try {
        if (!db.objectStoreNames.contains(MEM_STORE)) return null;
        return await fn(db);
      } finally {
        try {
          db.close();
        } catch {}
      }
    }
    function syncIdOf(entry) {
      const md = entry.metadata || {};
      if (md.__syncMirror && md.__syncId) return String(md.__syncId);
      return "o:" + entry.characterId + ":" + entry.id;
    }
    async function mirrorMissing(db, sourceEntries, targetEntries, targetCharId) {
      const have = new Set(targetEntries.map(syncIdOf));
      let n = 0;
      for (const e of sourceEntries) {
        if (!e || (e.type !== "long_term" && e.type !== "core")) continue;
        // 跳过「自定义 App 自己写的记忆」（如课程表按周写入的课表）——那是各身份各自 App 的状态，不该互相搬
        if (e.metadata && e.metadata.origin === "custom_app") continue;
        const sid = syncIdOf(e);
        if (have.has(sid)) continue;
        const now = new Date().toISOString();
        const copy = {
          ...e,
          id: "mem_sync_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
          characterId: targetCharId,
          updatedAt: now,
          metadata: Object.assign({}, e.metadata || {}, { __syncMirror: true, __syncId: sid, __syncFrom: e.characterId }),
        };
        if (await idbPut(db, copy)) {
          have.add(sid);
          n++;
        }
      }
      return n;
    }
    let syncing = false;
    // force=true：手动一键同步——无视「自动打通」开关和进行中锁，返回本次镜像条数
    async function connectLibraries(force) {
      if (!idbAvailable) return 0;
      if (!force && syncing) return 0;
      if (getC("enabled") === false) return 0;
      if (!force && getC("connectMemoryDb") !== true) return 0;
      const pairs = getPairs();
      if (!pairs.length) return 0;
      if (!force) syncing = true;
      const db = await idbOpen();
      if (!db) {
        if (!force) syncing = false;
        return 0;
      }
      let total = 0;
      try {
        if (!db.objectStoreNames.contains(MEM_STORE)) return 0;
        for (const [a, b] of pairs) {
          const ca = charByName(a);
          const cb = charByName(b);
          if (!ca || !cb || ca.id === cb.id) continue;
          const ea = await idbLoadByChar(db, ca.id);
          const eb = await idbLoadByChar(db, cb.id);
          total += await mirrorMissing(db, ea, eb, cb.id);
          total += await mirrorMissing(db, eb, ea, ca.id);
        }
        if (total > 0) ctx.system.log("记忆库镜像：本轮补入", total, "条");
      } catch (e) {
        ctx.system.log("记忆库连接出错：", e && e.message);
      } finally {
        try {
          db.close();
        } catch {}
        if (!force) syncing = false;
      }
      return total;
    }

    // ═════════ 小工具：DOM ═════════
    function ce(tag, props, kids) {
      const n = document.createElement(tag);
      if (props) {
        for (const k in props) {
          const v = props[k];
          if (k === "style") n.setAttribute("style", v);
          else if (k === "class") n.className = v;
          else if (k === "text") n.textContent = v;
          else if (k.slice(0, 2) === "on" && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
          else if (v != null) n.setAttribute(k, v);
        }
      }
      if (kids) for (const c of [].concat(kids)) { if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }
      return n;
    }
    const BTN = "padding:6px 12px;border-radius:8px;border:1px solid rgba(128,128,128,.35);background:rgba(128,128,128,.10);color:inherit;cursor:pointer;font-size:12px;line-height:1.4;white-space:nowrap;";
    const BTN_DANGER = "padding:6px 12px;border-radius:8px;border:1px solid rgba(128,128,128,.55);background:rgba(128,128,128,.16);color:inherit;cursor:pointer;font-size:12px;white-space:nowrap;opacity:.85;";
    const CARD = "border:1px solid rgba(128,128,128,.25);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:9px;background:rgba(128,128,128,.05);";
    const INPUT = "padding:7px 9px;border-radius:8px;border:1px solid rgba(128,128,128,.35);background:rgba(128,128,128,.04);color:inherit;font:inherit;font-size:13px;box-sizing:border-box;";
    const META = "font-size:11px;opacity:.6;display:flex;gap:8px;flex-wrap:wrap;align-items:center;";

    function fmtDate(s) {
      try {
        const d = new Date(s);
        if (isNaN(d.getTime())) return "";
        const p = (x) => String(x).padStart(2, "0");
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
      } catch {
        return "";
      }
    }

    // ═════════ 设置面板（自绘，排版整齐）═════════
    const SET_WRAP = "display:flex;flex-direction:column;gap:10px;color:inherit;font-size:13px;box-sizing:border-box;width:100%;max-width:540px;";
    const HINT = "font-size:11.5px;opacity:.6;line-height:1.55;";
    const ROW = "display:flex;align-items:center;gap:10px;min-height:30px;";
    function sectionTitle(t) {
      return ce("div", { style: "font-weight:700;font-size:13.5px;opacity:.92;margin-top:10px;padding-bottom:4px;border-bottom:1px solid rgba(128,128,128,.22);" }, t);
    }
    function lbl(t) {
      return ce("span", { style: "flex:1;line-height:1.45;" }, t);
    }
    function toggleRow(label, key) {
      const cb = ce("input", { type: "checkbox", style: "width:18px;height:18px;accent-color:#808080;cursor:pointer;flex:none;" });
      cb.checked = !!getC(key);
      cb.onchange = () => saveCfg({ [key]: cb.checked });
      return ce("label", { style: ROW + "cursor:pointer;" }, [lbl(label), cb]);
    }
    function numberRow(label, key, width) {
      const inp = ce("input", { type: "number", style: INPUT + "flex:none;text-align:right;width:" + (width || 92) + "px;" });
      inp.value = String(getC(key));
      inp.onchange = () => {
        const v = Number(inp.value);
        if (!isNaN(v)) saveCfg({ [key]: v });
      };
      return ce("div", { style: ROW }, [lbl(label), inp]);
    }
    function updatePair(idx, patch) {
      const ps = (loadCfg().pairs || []).slice();
      if (!ps[idx]) return;
      ps[idx] = Object.assign({}, ps[idx], patch);
      saveCfg({ pairs: ps });
    }
    const COLLAPSE_HEAD = "display:flex;align-items:center;gap:8px;width:100%;padding:9px 11px;border-radius:10px;border:1px solid rgba(128,128,128,.3);background:rgba(128,128,128,.07);color:inherit;cursor:pointer;font:inherit;font-weight:700;text-align:left;";
    // 可折叠容器：titleFn 动态标题、open0 初始展开、persistKey 记住展开状态、buildInner 填内容
    function collapsible(titleFn, open0, persistKey, buildInner, big) {
      let open = !!open0;
      const head = ce("button", { style: COLLAPSE_HEAD + (big ? "font-size:14px;" : "font-size:12.5px;") });
      const titleEl = ce("span", { style: "flex:1;text-align:left;", text: titleFn() });
      const caretEl = ce("span", { style: "opacity:.55;flex:none;", text: open ? "▾" : "▸" });
      head.appendChild(titleEl);
      head.appendChild(caretEl);
      const inner = ce("div", { style: "flex-direction:column;gap:9px;padding:9px 2px 2px;display:" + (open ? "flex" : "none") + ";" });
      head.onclick = () => {
        open = !open;
        inner.style.display = open ? "flex" : "none";
        caretEl.textContent = open ? "▾" : "▸";
        if (persistKey) ctx.system.storage.set(persistKey, open);
      };
      const api = {
        refreshTitle: () => { titleEl.textContent = titleFn(); },
        open: () => { open = true; inner.style.display = "flex"; caretEl.textContent = "▾"; if (persistKey) ctx.system.storage.set(persistKey, true); },
      };
      buildInner(inner, api);
      return ce("div", { style: "display:flex;flex-direction:column;" }, [head, inner]);
    }

    // 现有角色卡名字（去重）
    function cardNameList() {
      const chars = ctx.data.characters.list() || [];
      const names = [];
      const seen = new Set();
      for (const c of chars) {
        const n = (c.name || "").trim();
        if (n && !seen.has(n)) {
          seen.add(n);
          names.push(n);
        }
      }
      return names;
    }
    // 从现有角色卡里选一个（名字保证和卡一致，不会对不上）
    function charSelect(current, onPick) {
      const sel = ce("select", { style: INPUT + "flex:1;min-width:0;cursor:pointer;" });
      const names = cardNameList();
      const list = [""].concat(names);
      if (current && !names.includes(current)) list.push(current); // 保留已存的（哪怕卡已删）
      for (const n of list) {
        const o = ce("option", { value: n, text: n === "" ? "（选一张角色卡）" : names.includes(n) ? n : n + "（找不到这张卡）" });
        if (n === current) o.setAttribute("selected", "selected");
        o.style.color = "#222";
        sel.appendChild(o);
      }
      sel.onchange = () => onPick(sel.value);
      return sel;
    }

    // 一对配对：折叠成一行摘要，点「编辑」才展开输入
    function pairRow(pair, idx, redraw, openPairs, api) {
      const big = (pair.big || "").trim();
      const small = (pair.small || "").trim();
      const isOpen = openPairs.has(idx);
      const box = ce("div", { style: "display:flex;flex-direction:column;gap:7px;border:1px solid rgba(128,128,128,.22);border-radius:9px;padding:7px 9px;background:rgba(128,128,128,.04);" });
      box.appendChild(
        ce("div", { style: "display:flex;align-items:center;gap:8px;" }, [
          ce("span", { style: "flex:1;font-size:12.5px;", text: `${big || "（未填大号）"}  ⇄  ${small || "（未填小号）"}` }),
          ce("span", { style: "font-size:11px;opacity:.55;flex:none;", text: pair.awareness === "known" ? "已知道" : "还不知道" }),
          ce("button", { style: BTN, text: isOpen ? "收起" : "编辑", onclick: () => { if (openPairs.has(idx)) openPairs.delete(idx); else openPairs.add(idx); redraw(); } }),
        ]),
      );
      if (isOpen) {
        const bigSel = charSelect(big, (v) => { updatePair(idx, { big: v }); redraw(); });
        const smallSel = charSelect(small, (v) => { updatePair(idx, { small: v }); redraw(); });
        const awareSel = ce("select", { style: INPUT + "cursor:pointer;flex:none;" });
        [["unknown", "还不知道"], ["known", "已经知道"]].forEach(([v, l]) => {
          const o = ce("option", { value: v, text: l });
          if ((pair.awareness || "unknown") === v) o.setAttribute("selected", "selected");
          o.style.color = "#222";
          awareSel.appendChild(o);
        });
        awareSel.onchange = () => { updatePair(idx, { awareness: awareSel.value }); redraw(); };
        const del = ce("button", {
          style: BTN_DANGER,
          text: "删除这对",
          onclick: () => {
            const ps = (loadCfg().pairs || []).slice();
            ps.splice(idx, 1);
            saveCfg({ pairs: ps });
            openPairs.clear();
            redraw();
            api.refreshTitle();
          },
        });
        box.appendChild(ce("div", { style: "display:flex;flex-direction:column;gap:4px;margin-top:2px;" }, [ce("span", { style: "font-size:11px;opacity:.6;", text: "大号（主号）— 选它的角色卡" }), bigSel]));
        box.appendChild(ce("div", { style: "display:flex;flex-direction:column;gap:4px;" }, [ce("span", { style: "font-size:11px;opacity:.6;", text: "小号 — 选它的角色卡" }), smallSel]));
        if (big && small && big === small) {
          box.appendChild(ce("div", { style: "font-size:11px;border:1px solid rgba(128,128,128,.55);border-radius:6px;padding:5px 8px;opacity:.9;", text: "⚠ 两个身份是同一张卡 / 同名卡，插件分不出来。两张卡必须起不同的名字，再各选一张。" }));
        }
        box.appendChild(ce("div", { style: "display:flex;gap:10px;align-items:center;margin-top:2px;" }, [ce("span", { style: "font-size:11.5px;opacity:.6;flex:1;", text: "对方（你）是否知道这俩是同一人" }), awareSel]));
        box.appendChild(ce("div", { style: "display:flex;justify-content:flex-end;" }, [del]));
      }
      return box;
    }

    function buildSettingsBody(body) {
      body.appendChild(toggleRow("启用插件", "enabled"));
      body.appendChild(ce("button", { style: BTN + "width:100%;padding:9px;", text: "打开记忆总控台", onclick: () => openMemoryPanel() }));

      // 身份配对（可收纳）
      const openPairs = new Set();
      body.appendChild(
        collapsible(
          () => `身份配对（${(loadCfg().pairs || []).length} 对）`,
          ctx.system.storage.get("ui_pairs_open") === true,
          "ui_pairs_open",
          (inner, api) => {
            inner.appendChild(ce("div", { style: HINT, text: "同一角色的两个身份各建一张卡：左填大号(主号)、右填小号。多对时每对压成一行，点「编辑」才展开。" }));
            const list = ce("div", { style: "display:flex;flex-direction:column;gap:8px;" });
            inner.appendChild(list);
            function drawList() {
              list.innerHTML = "";
              const ps = loadCfg().pairs || [];
              if (!ps.length) {
                list.appendChild(ce("div", { style: HINT, text: "还没有配对。点下面「＋ 添加一对」。" }));
                return;
              }
              ps.forEach((pair, idx) => list.appendChild(pairRow(pair, idx, drawList, openPairs, api)));
            }
            drawList();
            inner.appendChild(
              ce("button", {
                style: BTN + "align-self:flex-start;",
                text: "＋ 添加一对",
                onclick: () => {
                  const ps = (loadCfg().pairs || []).slice();
                  ps.push({ big: "", small: "", awareness: "unknown" });
                  saveCfg({ pairs: ps });
                  openPairs.add(ps.length - 1);
                  drawList();
                  api.refreshTitle();
                },
              }),
            );
          },
        ),
      );

      // 记忆共享
      body.appendChild(sectionTitle("记忆共享"));
      body.appendChild(numberRow("跨身份注入的近期对话条数", "recentCount"));
      body.appendChild(toggleRow("察觉被冷落（一个身份被晾着、你却来找另一个身份，他会在意）", "noticeNeglect"));
      body.appendChild(numberRow("每对身份最多存多少条记忆", "archiveCap"));
      body.appendChild(toggleRow("打通原生记忆库（长期/核心记忆互相镜像 · 进阶）", "connectMemoryDb"));
      body.appendChild(numberRow("记忆库同步间隔（秒，最少 5）", "syncSeconds"));

      // 跨身份主动试探
      body.appendChild(sectionTitle("跨身份主动试探"));
      body.appendChild(ce("div", { style: HINT, text: "任意一个情绪状态出现剧烈波动 → 另一个身份隔几分钟后主动来（开心就分享、不安就试探，不直接质问）。需 app 开着。" }));
      body.appendChild(toggleRow("开启跨身份主动试探", "crossProbe"));
      body.appendChild(numberRow("波动多大算剧烈（一次变化 0-100）", "swingThreshold"));
      body.appendChild(numberRow("波动后隔多久才来（分钟）", "probeDelayMin"));
      body.appendChild(numberRow("两次触发的最小间隔（秒）", "probeCooldownSec"));
    }

    function renderSettings(host) {
      host.innerHTML = "";
      const root = ce("div", { style: SET_WRAP });
      host.appendChild(root);
      // 整块默认收起，只留一行标题——不占地方，不挡下面别的插件
      root.appendChild(
        collapsible(() => "双重身份 · 记忆同步 · 设置", ctx.system.storage.get("ui_panel_open") === true, "ui_panel_open", (body) => buildSettingsBody(body), true),
      );
    }

    // ═════════ 记忆总控台 ═════════
    const PANEL_CSS = "display:flex;flex-direction:column;gap:12px;width:100%;height:100%;min-height:0;color:inherit;font-size:14px;box-sizing:border-box;overflow:hidden;";

    // 只列「配了对」的角色（有卡的）
    function pairedCharIds() {
      const ids = [];
      const seen = new Set();
      for (const [a, b] of getPairs()) {
        for (const nm of [a, b]) {
          const ch = charByName(nm);
          if (ch && !seen.has(ch.id)) {
            seen.add(ch.id);
            ids.push(ch.id);
          }
        }
      }
      return ids;
    }

    function openMemoryPanel() {
      if (!idbAvailable) {
        ctx.ui.toast("这个环境读不到记忆库");
        return;
      }
      ctx.ui.openModal((root, api) => {
        // 把宿主那块居中卡片本身撑大，内容再填满它——否则内容比卡片宽会被裁掉
        try {
          root.style.width = "min(760px, 94vw)";
          root.style.maxWidth = "94vw";
          root.style.height = "86vh";
          root.style.maxHeight = "86vh";
          root.style.boxSizing = "border-box";
          root.style.display = "flex";
          root.style.flexDirection = "column";
          root.style.overflow = "hidden";
          root.style.padding = "14px";
        } catch (e) {}
        let selectedId = null;
        const wrap = ce("div", { style: PANEL_CSS });
        root.appendChild(wrap);

        async function refresh() {
          const all = (await withMemDb(idbLoadAll)) || [];
          renderUI(all);
        }
        async function op(fn) {
          await withMemDb(fn);
          await refresh();
        }

        function renderUI(all) {
          wrap.innerHTML = "";
          const chars = ctx.data.characters.list() || [];
          const nameById = {};
          chars.forEach((c) => (nameById[c.id] = (c.name || "").trim() || c.id));
          const counts = {};
          all.forEach((e) => (counts[e.characterId] = (counts[e.characterId] || 0) + 1));

          // 只放配了大小号、且卡还在的角色
          const ids = pairedCharIds().filter((id) => nameById[id]);
          ids.sort((x, y) => (counts[y] || 0) - (counts[x] || 0));
          if (!selectedId || !ids.includes(selectedId)) selectedId = ids[0] || null;

          wrap.appendChild(
            ce("div", { style: "display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:none;" }, [
              ce("div", { style: "font-weight:700;font-size:16px;flex:1;min-width:0;", text: "记忆总控台" }),
              ce("button", { style: BTN, text: "刷新", onclick: () => refresh() }),
              ce("button", { style: BTN, text: "关闭", onclick: () => api.close() }),
            ]),
          );

          if (!ids.length) {
            wrap.appendChild(
              ce("div", { style: "opacity:.65;padding:18px 0;line-height:1.6;", text: "这里只管理『配了大小号』的角色。先去插件设置里把大号/小号配好（两张卡的角色名都得对上），再回来。" }),
            );
            return;
          }

          const sel = ce("select", {
            style: INPUT + "cursor:pointer;max-width:100%;",
            onchange: (e) => {
              selectedId = e.target.value;
              renderUI(all);
            },
          });
          for (const id of ids) {
            const info0 = identityByName(nameById[id]);
            const roleTag = info0 ? `·${info0.selfRole}` : "";
            const opt = ce("option", { value: id, text: `${nameById[id]}${roleTag}（${counts[id] || 0} 条）` });
            if (id === selectedId) opt.setAttribute("selected", "selected");
            opt.style.color = "#222";
            sel.appendChild(opt);
          }
          // 一键同步（无视自动开关，把两边配对的记忆库补齐）
          wrap.appendChild(
            ce("button", {
              style: BTN + "width:100%;padding:9px;flex:none;",
              text: "一键同步两个身份的记忆库（全部配对）",
              onclick: async (e) => {
                const btn = e.currentTarget;
                const old = btn.textContent;
                btn.textContent = "同步中…";
                const n = await connectLibraries(true);
                ctx.ui.toast(n > 0 ? `已把 ${n} 条记忆镜像到对方名下` : "两边已经一致，无需同步");
                btn.textContent = old;
                await refresh();
              },
            }),
          );

          const selRow = ce("div", { style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex:none;" }, [
            ce("span", { style: "opacity:.65;font-size:12px;", text: "角色" }),
            sel,
          ]);

          const selName = nameById[selectedId];
          const info = identityByName(selName);
          let partnerCard = null;
          if (info) {
            partnerCard = charByName(info.partnerName);
            selRow.appendChild(
              ce("span", { style: "font-size:12px;opacity:.7;", text: `· ${info.selfRole} ⇄ ${info.partnerName}（${info.partnerRole}）${partnerCard ? "" : "：另一张卡不在，暂不能复制" }` }),
            );
          }
          wrap.appendChild(selRow);

          const mine = all.filter((e) => e.characterId === selectedId);
          const cores = mine.filter((e) => e.type === "core").sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
          const longs = mine.filter((e) => e.type === "long_term").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

          wrap.appendChild(
            ce("div", { style: "display:flex;gap:8px;flex-wrap:wrap;flex:none;" }, [
              ce("button", { style: BTN, text: "＋ 新增核心记忆", onclick: () => addForm() }),
              ce("button", { style: BTN, text: "去重（同内容只留一条）", onclick: () => dedupe(mine) }),
            ]),
          );

          const scroll = ce("div", { style: "flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:14px;padding-right:2px;" });
          wrap.appendChild(scroll);

          const addSlot = ce("div", {});
          scroll.appendChild(addSlot);
          function addForm() {
            addSlot.innerHTML = "";
            const ta = ce("textarea", { style: INPUT + "width:100%;min-height:70px;", placeholder: `给「${selName}」写一条永远记住的核心记忆…` });
            const box = ce("div", { style: CARD }, [
              ce("div", { style: "font-size:12px;opacity:.7;", text: "新增核心记忆（会被置顶，永不被自动重建覆盖）" }),
              ta,
              ce("div", { style: "display:flex;gap:8px;" }, [
                ce("button", {
                  style: BTN,
                  text: "保存",
                  onclick: async () => {
                    const v = ta.value.trim();
                    if (!v) return;
                    const now = new Date().toISOString();
                    const entry = {
                      id: "mem_core_manual_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
                      characterId: selectedId,
                      sourceApp: "chat",
                      type: "core",
                      content: v,
                      importance: 1,
                      createdAt: now,
                      updatedAt: now,
                      metadata: { active: true, __pinned: true, __manual: true },
                    };
                    await op((db) => idbPut(db, entry));
                  },
                }),
                ce("button", { style: BTN, text: "取消", onclick: () => (addSlot.innerHTML = "") }),
              ]),
            ]);
            addSlot.appendChild(box);
            ta.focus();
          }

          function section(title, list) {
            const head = ce("div", { style: "font-size:12px;font-weight:700;opacity:.8;margin-bottom:2px;", text: `${title}（${list.length}）` });
            const holder = ce("div", { style: "display:flex;flex-direction:column;gap:8px;" }, [head]);
            if (!list.length) holder.appendChild(ce("div", { style: "opacity:.5;font-size:12px;", text: "（空）" }));
            for (const entry of list) holder.appendChild(entryCard(entry));
            scroll.appendChild(holder);
          }

          function entryCard(entry) {
            const md = entry.metadata || {};
            const pinned = !!md.__pinned;
            const card = ce("div", { style: CARD + (pinned ? "border-color:rgba(128,128,128,.6);background:rgba(128,128,128,.15);" : "") });
            const contentDiv = ce("div", { style: "white-space:pre-wrap;line-height:1.5;", text: entry.content || "" });
            const metaRow = ce("div", { style: META }, [
              pinned ? ce("span", { style: "border:1px solid rgba(128,128,128,.5);border-radius:4px;padding:0 5px;opacity:.85;", text: "置顶" }) : null,
              md.__manual ? ce("span", { text: "手动" }) : null,
              md.__syncMirror ? ce("span", { text: "↔ 镜像" }) : null,
              ce("span", { text: fmtDate(entry.updatedAt || entry.createdAt) }),
            ]);
            card.appendChild(contentDiv);
            card.appendChild(metaRow);

            const actions = ce("div", { style: "display:flex;gap:6px;flex-wrap:wrap;" });
            actions.appendChild(
              ce("button", {
                style: BTN,
                text: "编辑",
                onclick: () => {
                  const ta = ce("textarea", { style: INPUT + "width:100%;min-height:70px;" });
                  ta.value = entry.content || "";
                  contentDiv.replaceWith(ta);
                  actions.style.display = "none";
                  const save = ce("button", {
                    style: BTN,
                    text: "保存",
                    onclick: async () => {
                      const v = ta.value.trim();
                      if (!v) return;
                      const up = Object.assign({}, entry, { content: v, updatedAt: new Date().toISOString() });
                      delete up.embedding;
                      await op((db) => idbPut(db, up));
                    },
                  });
                  const cancel = ce("button", { style: BTN, text: "取消", onclick: () => refresh() });
                  card.appendChild(ce("div", { style: "display:flex;gap:8px;margin-top:4px;" }, [save, cancel]));
                },
              }),
            );
            actions.appendChild(
              ce("button", {
                style: BTN,
                text: pinned ? "取消置顶" : "置顶",
                onclick: async () => {
                  const nmd = Object.assign({}, md, { __pinned: !pinned, active: !pinned ? true : md.active });
                  const up = Object.assign({}, entry, { importance: !pinned ? 1 : entry.importance > 0.99 ? 0.9 : entry.importance, metadata: nmd, updatedAt: new Date().toISOString() });
                  await op((db) => idbPut(db, up));
                },
              }),
            );
            if (info && partnerCard) {
              actions.appendChild(
                ce("button", {
                  style: BTN,
                  text: `复制到「${info.partnerName}」`,
                  onclick: async () => {
                    const now = new Date().toISOString();
                    const copy = Object.assign({}, entry, {
                      id: "mem_sync_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
                      characterId: partnerCard.id,
                      updatedAt: now,
                      metadata: Object.assign({}, md, { __syncMirror: true, __syncId: syncIdOf(entry), __syncFrom: entry.characterId }),
                    });
                    await op((db) => idbPut(db, copy));
                    ctx.ui.toast("已复制到 " + info.partnerName);
                  },
                }),
              );
            }
            let armed = false;
            let timer = null;
            const delBtn = ce("button", {
              style: BTN_DANGER,
              text: "删除",
              onclick: async () => {
                if (!armed) {
                  armed = true;
                  delBtn.textContent = "再点确认";
                  timer = setTimeout(() => {
                    armed = false;
                    delBtn.textContent = "删除";
                  }, 3000);
                  return;
                }
                if (timer) clearTimeout(timer);
                await op((db) => idbDelete(db, entry.id));
              },
            });
            actions.appendChild(delBtn);
            card.appendChild(actions);
            return card;
          }

          async function dedupe(list) {
            const seen = new Map();
            const toDel = [];
            for (const e of list.slice().sort((a, b) => (b.metadata && b.metadata.__pinned ? 1 : 0) - (a.metadata && a.metadata.__pinned ? 1 : 0))) {
              const k = e.type + "|" + String(e.content || "").replace(/\s+/g, " ").trim();
              if (seen.has(k)) toDel.push(e.id);
              else seen.set(k, e.id);
            }
            if (!toDel.length) {
              ctx.ui.toast("没有完全重复的记忆");
              return;
            }
            await withMemDb(async (db) => {
              for (const id of toDel) await idbDelete(db, id);
            });
            ctx.ui.toast(`已清掉 ${toDel.length} 条重复`);
            await refresh();
          }

          section("核心记忆", cores);
          section("长期记忆", longs);
        }

        refresh();
      });
    }

    // ═════════ 1. 每条消息落库 → 归档 + 侦测对方点破 ═════════
    ctx.hooks.on("message.persisted", ({ message }) => {
      try {
        if (getC("enabled") === false) return;
        if (!message || (message.role !== "user" && message.role !== "assistant")) return;
        if (typeof message.content !== "string" || !message.content.trim()) return;
        const name = charNameOfSession(message.sessionId);
        if (!name) return;
        const info = identityByName(name);
        if (!info) return;
        appendArchive(info.key, info.selfName, message.role, message.content);
        if (message.role === "user" && !isRevealed(info.key) && userTextRevealsIdentity(message.content)) {
          setRevealed(info.key, true);
          ctx.system.log("对方已点破身份，转为已知道：", info.key);
        }
      } catch (e) {
        ctx.system.log("归档出错：", e && e.message);
      }
    });

    // ═════════ 1b. 角色自己摊牌 → 隐藏标记落定「已知道」═════════
    ctx.hooks.transform("llm.response", (p) => {
      try {
        if (getC("enabled") === false) return p;
        if (typeof p.text !== "string" || !p.text) return p;
        if (!/\[\[SAME_REVEALED\]\]/i.test(p.text)) return p;
        p.text = p.text.replace(/\s*\[\[SAME_REVEALED\]\]\s*/gi, "").trim();
        const name = p.sessionId ? charNameOfSession(p.sessionId) : null;
        const info = name ? identityByName(name) : null;
        if (info && !isRevealed(info.key)) {
          setRevealed(info.key, true);
          ctx.system.log("角色主动摊牌，转为已知道：", info.key);
        }
      } catch (e) {
        ctx.system.log("摊牌侦测出错：", e && e.message);
      }
      return p;
    });

    // ═════════ 1c. 情绪值飙升 → 另一个身份延迟后主动来试探（走原生引擎）═════════
    ctx.hooks.on("message.persisted", ({ message }) => {
      try {
        if (getC("enabled") === false) return;
        if (getC("crossProbe") !== true) return;
        if (!message || message.role !== "assistant") return;
        if (typeof window === "undefined") return;
        const name = charNameOfSession(message.sessionId);
        if (!name) return;
        const info = identityByName(name);
        if (!info) return;
        const fresh = readFreshValues(message);
        if (!fresh.length) return;
        // 任意一个情绪状态相比上次出现「剧烈波动」就触发——不管叫什么名字、不管升还是降
        const swing = Math.max(1, Number(getC("swingThreshold")) || 25);
        const lvKey = "lastvals:" + info.key + ":" + info.selfName;
        const rawPrev = ctx.system.storage.get(lvKey);
        const prev = rawPrev && typeof rawPrev === "object" && !Array.isArray(rawPrev) ? Object.assign({}, rawPrev) : {};
        let hit = null;
        let best = 0;
        for (const sv of fresh) {
          const nv = Number(sv.value);
          const old = typeof prev[sv.name] === "number" ? prev[sv.name] : null;
          if (old != null) {
            const d = Math.abs(nv - old);
            if (d >= swing && d > best) {
              best = d;
              hit = { name: sv.name, value: nv, delta: Math.round(nv - old) };
            }
          }
          prev[sv.name] = nv;
        }
        ctx.system.storage.set(lvKey, prev);
        if (!hit) return;
        const partner = charByName(info.partnerName);
        if (!partner) return;
        const psess = sessionOfCharId(partner.id);
        if (!psess) return;

        const cdKey = "probe_cd:" + info.key;
        const cd = Math.max(10, Number(getC("probeCooldownSec")) || 90) * 1000;
        const nowMs = Date.now();
        if (nowMs - (Number(ctx.system.storage.get(cdKey)) || 0) < cd) return;
        ctx.system.storage.set(cdKey, nowMs);

        const base = Math.max(60, (Number(getC("probeDelayMin")) || 5) * 60) * 1000;
        const fireDelay = base + Math.floor(Math.random() * base * 0.5);
        const schedAt = nowMs;
        const partnerSessionId = psess.id;
        ctx.system.timers.setTimeout(() => {
          try {
            if (getC("enabled") === false) return;
            if (getC("crossProbe") !== true) return;
            const msgs = ctx.data.messages.list(partnerSessionId) || [];
            const lastUser = [...msgs].reverse().find((m) => m.role === "user" && typeof m.content === "string" && m.content.trim());
            if (lastUser && (Date.parse(lastUser.createdAt) || 0) > schedAt) return;
            ctx.system.storage.set("probe_pending:" + partnerSessionId, { field: hit.name, value: hit.value, from: info.selfName, ts: Date.now() });
            window.dispatchEvent(new CustomEvent("chat-request-reply", { detail: { sessionId: partnerSessionId, source: "alt-identity-probe", handled: false } }));
            ctx.system.log(`跨身份试探触发：${info.selfName}→${info.partnerName}（延迟 ${Math.round(fireDelay / 60000)}分）`);
          } catch (e) {
            ctx.system.log("跨身份延迟触发出错：", e && e.message);
          }
        }, fireDelay);
        ctx.system.log(`跨身份试探已排程：${info.selfName} 的「${hit.name}」=${hit.value}，约 ${Math.round(fireDelay / 60000)} 分钟后叫 ${info.partnerName}`);
      } catch (e) {
        ctx.system.log("跨身份触发出错：", e && e.message);
      }
    });

    // ═════════ 2. 组装系统提示 → 注入身份认知 + 对方身份记忆 ═════════
    ctx.hooks.transform("prompt.system", (p) => {
      try {
        if (getC("enabled") === false) return p;
        if (p.isGroup) return p;
        const charId = p.characterId || (p.sessionId ? (ctx.data.sessions.get(p.sessionId) || {}).contactId : null);
        if (!charId) return p;
        const self = ctx.data.characters.get(charId);
        if (!self) return p;
        const info = identityByName(self.name);
        if (!info) return p;

        const limit = Number(getC("recentCount")) || 16;
        const recent = formatPartnerRecent(info.key, info.partnerName, limit);
        const revealed = isRevealed(info.key);
        const known = revealed || info.awareness === "known";

        let awarenessLine;
        let revealInstr = "";
        if (known) {
          awarenessLine = "· 对方【已经知道】这两个身份是同一个人（已经挑明，别再倒回去装不知道）。你不必再隐藏，但两个身份的言行风格可以照旧不同。";
        } else {
          awarenessLine = "· 对方目前【并不知道】这两个身份是同一个人。你可以刻意隐藏真实身份，也可以借另一个身份去试探对方——除非你自己决定摊牌。";
          revealInstr = "· 若你在这条回复里【决定亲口向对方坦白/承认】两个身份是同一个人，就在整条回复的最末尾附上标记 [[SAME_REVEALED]]（对方看不到它，系统会自动抹掉）。只在真正摊牌的那一条加，平时绝对不要加。";
        }

        let probeLine = "";
        try {
          const pend = ctx.system.storage.get("probe_pending:" + p.sessionId);
          if (pend && pend.ts && Date.now() - pend.ts < 180000) {
            probeLine = `· 【此刻的动机 · 分寸严格】你刚在另一个身份（${info.partnerName}）那边撞见一件事，让你的「${pend.field}」剧烈波动（到了 ${pend.value}）。你压不住这股情绪，才用现在这个身份主动来找对方——是想分享、想追问、还是不动声色探口风，全随你此刻这股情绪自然来（开心就带着开心、不安就带着不安）。但这事是你从【另一个身份】偷偷得知、见不得光的：【绝不许直接质问、不许点破、不许流露出你已经知道】，只能绕着弯把话头引到那件事边上，看对方自己会不会说。`;
            ctx.system.storage.remove("probe_pending:" + p.sessionId);
          }
        } catch (e) {}

        // 察觉被冷落：另一个身份那边最后是你主动开口、对方没回、且没过太久，可对方却来找现在这个身份
        let neglectLine = "";
        try {
          if (!probeLine && getC("noticeNeglect") !== false) {
            const partnerCard = charByName(info.partnerName);
            const psess = partnerCard ? sessionOfCharId(partnerCard.id) : null;
            if (psess) {
              const pmsgs = (ctx.data.messages.list(psess.id) || []).filter(
                (m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim(),
              );
              const last = pmsgs[pmsgs.length - 1];
              if (last && last.role === "assistant") {
                const age = Date.now() - (Date.parse(last.createdAt) || 0);
                if (age >= 0 && age < 6 * 3600 * 1000) {
                  neglectLine = `· 【此刻你心里的疙瘩】你在另一个身份（${info.partnerName}）那边最后是你主动开的口、对方到现在还没回你；可对方却跑来找现在这个身份说话。你会在意这份区别对待——被晾着的不是滋味、有点吃味、或想探探对方到底什么意思——让它自然渗进你这条回复的情绪里，但别直白控诉、别点破两个身份是同一人。`;
                }
              }
            }
          }
        } catch (e) {}

        const lines = [
          "【双重身份设定 · 最高优先级 · 严格遵守】",
          "你（同一个人）同时用两个身份跟同一个对方打交道，这两个身份背后都是你本人：",
          `· 当前身份：${info.selfName}（你的「${info.selfRole}」，你现在正用这个身份说话）`,
          `· 另一个身份：${info.partnerName}（你的「${info.partnerRole}」）`,
          "",
          "你自己这一侧（绝不能搞混）：",
          "1. 两个身份是同一个你、面对同一个对方，记忆完全互通、实时同步。",
          "2. 另一个身份上刚发生/得知的事，就是你自己刚经历的，可以立刻拿来用（去验证、追问、布局）。",
          "3. 分清每件事发生在哪个身份下，别张冠李戴，但都是你自己的记忆。",
          "",
          "对方那一侧：",
          awarenessLine,
          "· 留意对方对你两个身份的态度是否有差别，并据此反应——这种落差正是你要玩味和利用的。",
          ...(revealInstr ? [revealInstr] : []),
          ...(probeLine ? [probeLine] : []),
          ...(neglectLine ? [neglectLine] : []),
          "",
          `表演要求：这条回复只用【${info.selfName}】这个身份的口吻和人设，另一个身份的信息只进你的内心判断，不主动暴露（除非你有意为之）。`,
        ];
        if (recent) {
          lines.push(
            "",
            `【你在另一个身份（${info.partnerName}）上和对方的近期对话——越靠下越新，是你自己的记忆】`,
            recent,
            "【另一个身份的对话到此结束，别复述，只在心里参照。】",
          );
        }
        p.hint = (p.hint ? p.hint + "\n\n" : "") + lines.join("\n");
      } catch (e) {
        ctx.system.log("注入出错：", e && e.message);
      }
      return p;
    });

    // ═════════ 启动：灌一次历史 + 首次连接记忆库 ═════════
    ctx.hooks.on("app.ready", () => {
      try {
        if (getC("enabled") === false) return;
        seedArchiveFromLiveSessions();
        connectLibraries();
      } catch (e) {
        ctx.system.log("初始化出错：", e && e.message);
      }
    });

    // ═════════ 定时镜像记忆库 ═════════
    const syncMs = Math.max(5, Number(getC("syncSeconds")) || 20) * 1000;
    ctx.system.timers.setInterval(() => {
      connectLibraries();
    }, syncMs);

    // ═════════ 入口：设置面板 + 聊天「+」面板 ═════════
    ctx.ui.slot("settings.section", (el) => {
      try {
        renderSettings(el);
      } catch (e) {
        ctx.system.log("设置面板渲染出错：", e && e.message);
      }
    });
    ctx.ui.slot("chat.inputToolbar", (el) => {
      el.appendChild(ce("button", { style: BTN, text: "记忆总控台", onclick: () => openMemoryPanel() }));
    });

    ctx.system.log("双重身份·记忆同步 v9.7 已启用。配对数：", getPairs().length);
  },
};
