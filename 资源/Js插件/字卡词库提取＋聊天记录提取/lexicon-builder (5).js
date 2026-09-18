export default {
  manifest: {
    id: "lexicon-builder",
    name: "词库构建器",
    apiVersion: 1,
    version: "3.0.0",
    author: "你",
    description: "从聊天记录提取规则词库，支持三档精度、时间筛选、TXT导出、聊天记录备份",
    permissions: ["chat.read", "ai"],
    settings: [],
  },

  setup(ctx) {
    const STORAGE_KEY = "lexicon_data_v3";
    let currentSessionId = null;

    ctx.hooks.on("session.opened", (p) => {
      currentSessionId = p.sessionId;
    });

    /* ========== 词库读写 ========== */
    function loadLexicon() {
      try {
        const raw = ctx.system.storage.get(STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          if (data && Array.isArray(data.intents)) return data;
        }
      } catch (e) {}
      return { intents: [], defaultResponse: "我没太听懂，能换个说法吗？" };
    }
    function saveLexicon(lex) {
      ctx.system.storage.set(STORAGE_KEY, JSON.stringify(lex));
    }
    function genId() {
      return "i_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    /* ========== 会话名称 ========== */
    function getSessionName(session) {
      if (!session) return "未命名会话";
      if (session.name && session.name !== session.id) return session.name;
      if (session.contactName) return session.contactName;
      if (session.title) return session.title;
      const cid = session.contactId || session.characterId;
      if (cid) {
        try {
          const contacts = ctx.data.contacts.list();
          const c = contacts.find((x) => x.id === cid || x.contactId === cid || x.open_id === cid);
          if (c) return c.name || c.nickname || c.remark || c.alias || cid;
        } catch (e) {}
        try {
          const chars = ctx.data.characters.list();
          const ch = chars.find((x) => x.id === cid || x.characterId === cid);
          if (ch) return ch.name || ch.character_name || cid;
        } catch (e) {}
      }
      return session.id || "未命名会话";
    }

    /* ========== 时间工具 ========== */
    function getMessageTime(msg) {
      return msg.timestamp || msg.createdAt || msg.time || msg.date || msg.created_at || msg.sendTime || null;
    }
    function getTimeMs(ts) {
      if (!ts) return null;
      if (typeof ts === "number") return ts < 1e12 ? ts * 1000 : ts;
      const d = new Date(ts);
      return isNaN(d.getTime()) ? null : d.getTime();
    }
    function formatTime(ts) {
      if (!ts) return "未知时间";
      let d;
      if (typeof ts === "number") d = new Date(ts < 1e12 ? ts * 1000 : ts);
      else d = new Date(ts);
      if (isNaN(d.getTime())) return String(ts);
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
    function toDateTimeLocal(d) {
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    function filterMessagesByTime(messages, startTimeMs, endTimeMs) {
      if (!startTimeMs && !endTimeMs) return messages;
      const endBuffer = endTimeMs ? endTimeMs + 59999 : null;
      return messages.filter((m) => {
        const ms = getTimeMs(getMessageTime(m));
        if (!ms) return true;
        if (startTimeMs && ms < startTimeMs) return false;
        if (endBuffer && ms > endBuffer) return false;
        return true;
      });
    }

    /* ========== 文本处理 ========== */
    function stripPunct(text) {
      return text.replace(/[，。！？、；：""''（）【】《》\s,.!?;:'"()\[\]<>~…—\-]+/g, "");
    }
    function charSimilarity(a, b) {
      const setA = new Set(a);
      const setB = new Set(b);
      let intersection = 0;
      for (const c of setA) if (setB.has(c)) intersection++;
      const union = new Set([...setA, ...setB]).size;
      return union === 0 ? 0 : intersection / union;
    }
    function isCodeLike(text) {
      if (!text) return false;
      if (text.includes("```")) return true;
      const codeChars = (text.match(/[{};=<>()[\]\/\\+*&|#@$%^~`]/g) || []).length;
      const total = text.replace(/\s/g, "").length;
      if (total > 0 && codeChars / total > 0.15) return true;
      const codeKeywords = [
        "function", "const ", "let ", "var ", "return ", "import ", "export ",
        "console.log", "document.", "window.", "undefined",
        "=>", "====", "===", "!==", "typeof",
        "def ", "print(", "pip install", "npm install",
        "localhost", "http://", "https://", "api/", ".json", ".js", ".ts",
        "select ", "insert ", "update ", "delete from", "create table",
      ];
      const lower = text.toLowerCase();
      for (const kw of codeKeywords) {
        if (lower.includes(kw.toLowerCase())) return true;
      }
      const lines = text.split("\n");
      let codeLines = 0;
      for (const line of lines) {
        const lt = line.trim();
        if (!lt) continue;
        if (lt.endsWith(";") && lt.length > 10) codeLines++;
        if (/^\s*(const|let|var|def|function|class|import|export)\s/.test(lt)) codeLines++;
        if (/^\s*[\w$]+\s*=\s*.+;?\s*$/.test(lt) && lt.includes("=")) codeLines++;
      }
      if (codeLines >= 2) return true;
      return false;
    }
    function isUnnaturalReply(text) {
      if (!text || text.trim().length < 1) return true;
      const t = text.trim();
      const servicePatterns = [
        "请问有什么可以帮", "很高兴为您服务", "为您服务", "感谢您的",
        "请问还有什么", "您好，请问", "您好!请问", "有什么可以帮您",
        "我是您的智能助手", "请问有什么需要",
        "如果您还有其他", "欢迎随时咨询", "祝您生活愉快",
        "请问您需要什么帮助",
      ];
      for (const p of servicePatterns) {
        if (t.includes(p)) return true;
      }
      const formalPatterns = ["特此", "兹有", "综上所述", "鉴于", "予以", "如下所述", "据此", "综上"];
      for (const p of formalPatterns) {
        if (t.includes(p)) return true;
      }
      if (/^【.*】$/.test(t)) return true;
      if (/^(系统提示|助手|system|System)[:：]/.test(t)) return true;
      if (t.length > 200) return true;
      if (stripPunct(t).length < 1) return true;
      return false;
    }

    /* ========== 提取问答对 ========== */
    function extractQAPairs(messages) {
      const sorted = [...messages].sort((a, b) => {
        const ta = getTimeMs(getMessageTime(a));
        const tb = getTimeMs(getMessageTime(b));
        if (!ta && !tb) return 0;
        if (!ta) return 1;
        if (!tb) return -1;
        return ta - tb;
      });
      const pairs = [];
      for (let i = 0; i < sorted.length; i++) {
        const msg = sorted[i];
        if (!msg || msg.role !== "user") continue;
        let reply = null;
        for (let j = i + 1; j < Math.min(i + 6, sorted.length); j++) {
          const next = sorted[j];
          if (!next) continue;
          if (next.role === "assistant") { reply = next; break; }
          if (next.role === "user") break;
        }
        if (!reply) continue;
        const q = String(msg.content || "").trim();
        const a = String(reply.content || "").trim();
        if (q.length < 1 || a.length < 1) continue;
        if (/^[嗯哦啊哈诶唉唔呃好的是的对没错]+[。！？~…]*$/.test(q)) continue;
        if (isCodeLike(q) || isCodeLike(a)) continue;
        const qClean = stripPunct(q);
        const aClean = stripPunct(a);
        if (qClean === aClean) continue;
        if (qClean.length > 3 && aClean.startsWith(qClean) && aClean.length - qClean.length < 6) continue;
        if (qClean.length > 5 && aClean.length > 5 && charSimilarity(qClean, aClean) > 0.85) continue;
        if (isUnnaturalReply(a)) continue;
        pairs.push({ q, a });
      }
      return pairs;
    }

    /* ========== 简单模式 ========== */
    function buildSimple(pairs) {
      const intents = [];
      const seen = new Set();
      for (const pair of pairs) {
        if (seen.has(pair.q)) continue;
        seen.add(pair.q);
        intents.push({
          id: genId(),
          name: pair.q.length > 20 ? pair.q.slice(0, 20) + "…" : pair.q,
          patterns: [pair.q],
          responses: [pair.a],
          matchMode: "contains",
        });
      }
      return { intents, defaultResponse: "我没太听懂，能换个说法吗？" };
    }

    /* ========== 详细模式 ========== */
    function buildDetailed(pairs) {
      const intents = [];
      const qMap = new Map();
      function splitPatterns(text) {
        const cleaned = text.replace(/[，。！？、；：""''（）【】《》\s,.!?;:'"()\[\]<>~…—\-{}=+*\/\\&|#@$%^`]+/g, "|");
        const parts = cleaned.split("|").filter((p) => p.length >= 2);
        const result = new Set([text]);
        parts.forEach((p) => result.add(p));
        return [...result];
      }
      for (const pair of pairs) {
        if (qMap.has(pair.q)) {
          const idx = qMap.get(pair.q);
          const intent = intents[idx];
          if (!intent.responses.includes(pair.a)) intent.responses.push(pair.a);
          splitPatterns(pair.q).forEach((p) => { if (!intent.patterns.includes(p)) intent.patterns.push(p); });
        } else {
          const intent = {
            id: genId(),
            name: pair.q.length > 20 ? pair.q.slice(0, 20) + "…" : pair.q,
            patterns: splitPatterns(pair.q),
            responses: [pair.a],
            matchMode: "contains",
          };
          qMap.set(pair.q, intents.length);
          intents.push(intent);
        }
      }
      return { intents, defaultResponse: "我没太听懂，能换个说法吗？" };
    }

    /* ========== 精确模式（AI） ========== */
    async function buildPrecise(pairs, onProgress) {
      if (pairs.length === 0) return { intents: [], defaultResponse: "..." };
      const batchSize = 50;
      const totalBatches = Math.ceil(pairs.length / batchSize);
      const allIntents = [];
      for (let i = 0; i < pairs.length; i += batchSize) {
        const batchNum = Math.floor(i / batchSize) + 1;
        if (onProgress) onProgress(batchNum, totalBatches);
        const batch = pairs.slice(i, i + batchSize);
        const qaText = batch.map((p, idx) => `${idx + 1}. 问：${p.q}\n   答：${p.a}`).join("\n\n");
        const prompt = `你在帮一个角色挑选"他平时会怎么回消息"的回复库。从下面的问答对里，挑出最像真人会说的话。

【选人标准】
- 回复必须是答方原话，一个字都不要改、不要润色
- 挑"有体温"的：带情绪、带口语、像朋友发微信，不要挑客服、百科、作文腔
- 跳过：复述用户原话、太长的小作文、书面公文腔、客服模板句
- 长度要参差，别每条都差不多长
- 宁可挑不完美但真实的，也不要完美但假的

【归纳要求】
1. 语义相似的问题归为一类
2. 每类提取 2~5 个简短触发词
3. 每类保留 1~3 条最有角色特色的回复（原话照抄）
4. 只输出严格 JSON，不要任何解释

格式：{"intents":[{"name":"意图名","patterns":["词1","词2"],"responses":["回复1"]}]}

问答对：
${qaText}`;
        try {
          const result = await ctx.ai.chat({ prompt, temperature: 0.2, maxTokens: 4000 });
          const jsonMatch = result.match(/\{[\s\S]*\}/);
          if (!jsonMatch) continue;
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.intents && Array.isArray(parsed.intents)) {
            for (const it of parsed.intents) {
              if (!it.patterns || !Array.isArray(it.patterns) || it.patterns.length === 0) continue;
              allIntents.push({
                id: genId(),
                name: it.name || "未命名",
                patterns: it.patterns.filter((p) => p && p.length > 0),
                responses: Array.isArray(it.responses) ? it.responses.filter((r) => r && r.length > 0 && !isCodeLike(r) && !isUnnaturalReply(r)) : [],
                matchMode: "contains",
              });
            }
          }
        } catch (e) {
          ctx.system.log("AI 归纳批次失败:", e.message);
        }
      }
      return { intents: allIntents, defaultResponse: "我没太听懂，能换个说法吗？" };
    }

    /* ========== HTML 转义 ========== */
    function escapeHtml(s) { const d = document.createElement("div"); d.textContent = String(s); return d.innerHTML; }

    /* ========== 通用文件下载（兼容 Android WebView + 浏览器降级） ========== */
    function downloadFile(content, fileName, mimeType) {
      // 优先尝试 Android WebView 原生下载，必须确认函数真的存在
      if (typeof window !== "undefined" && window.Android && typeof window.Android.captureDownloadName === "function") {
        try {
          window.Android.captureDownloadName(fileName, content);
          return;
        } catch (e) {
          ctx.system.log("Android下载失败，降级浏览器下载:", e.message);
        }
      }
      // 浏览器通用降级下载
      const blob = new Blob([content], { type: mimeType || "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /* ========== 词库导出（纯回复TXT） ========== */
    function exportLexicon(lex) {
      const lines = [];
      const seen = new Set();
      lex.intents.forEach((it) => {
        it.responses.forEach((r) => {
          const trimmed = r.trim();
          if (!trimmed || seen.has(trimmed)) return;
          if (isCodeLike(trimmed)) return;
          if (isUnnaturalReply(trimmed)) return;
          seen.add(trimmed);
          lines.push(trimmed);
        });
      });
      downloadFile(lines.join("\n"), `词库_${new Date().toISOString().slice(0, 10)}.txt`, "text/plain;charset=utf-8");
    }

    /* ========== 聊天记录导出（带预览弹窗） ========== */
    function buildChatLogContent(sessionId, sessionName, format, startTimeMs, endTimeMs) {
      let messages = ctx.data.messages.list(sessionId);
      if (startTimeMs || endTimeMs) {
        messages = filterMessagesByTime(messages, startTimeMs, endTimeMs);
      }
      messages = [...messages].sort((a, b) => {
        const ta = getTimeMs(getMessageTime(a));
        const tb = getTimeMs(getMessageTime(b));
        if (!ta && !tb) return 0;
        if (!ta) return 1;
        if (!tb) return -1;
        return ta - tb;
      });
      const roleName = (role) => {
        if (role === "user") return "我";
        if (role === "assistant") return sessionName || "对方";
        if (role === "system") return "系统";
        return role || "未知";
      };
      if (format === "txt") {
        const lines = [];
        lines.push("===== 聊天记录导出 =====");
        lines.push(`会话：${sessionName || sessionId}`);
        lines.push(`导出时间：${formatTime(Date.now())}`);
        lines.push(`消息总数：${messages.length}`);
        lines.push("========================");
        lines.push("");
        for (const m of messages) {
          lines.push(`[${formatTime(getMessageTime(m))}] ${roleName(m.role)}：${m.content || ""}`);
          lines.push("");
        }
        return { content: lines.join("\n"), mime: "text/plain;charset=utf-8", ext: "txt", count: messages.length };
      } else {
        const out = {
          type: "chat_log",
          sessionId: sessionId,
          sessionName: sessionName || "",
          exportedAt: new Date().toISOString(),
          messageCount: messages.length,
          messages: messages.map((m) => ({
            ...m,
            roleName: roleName(m.role),
            timeText: formatTime(getMessageTime(m)),
          })),
        };
        return { content: JSON.stringify(out, null, 2), mime: "application/json", ext: "json", count: messages.length };
      }
    }

    function showChatLogPreview(sessionId, sessionName, format, startTimeMs, endTimeMs) {
      const result = buildChatLogContent(sessionId, sessionName, format, startTimeMs, endTimeMs);
      // 预览弹窗
      ctx.ui.openModal((el, { close }) => {
        el.style.cssText = "width:720px;max-width:95vw;max-height:85vh;display:flex;flex-direction:column;font-family:system-ui,sans-serif;background:#fff;border-radius:12px;overflow:hidden;";
        const style = document.createElement("style");
        style.textContent = `
          .pv-header{padding:12px 16px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;background:#fafbfc;}
          .pv-title{font-size:15px;font-weight:600;margin:0;}
          .pv-close{background:none;border:none;font-size:20px;cursor:pointer;color:#999;padding:2px 8px;border-radius:4px;line-height:1;}
          .pv-close:hover{color:#333;background:#f0f0f0;}
          .pv-info{padding:8px 16px;font-size:12px;color:#666;background:#f0f7ff;border-bottom:1px solid #e0e8f0;}
          .pv-body{flex:1;overflow-y:auto;padding:12px 16px;background:#f9f9f9;}
          .pv-text{white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.7;color:#333;background:#fff;padding:12px;border-radius:8px;border:1px solid #eee;min-height:200px;}
          .pv-actions{padding:12px 16px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end;background:#fafbfc;}
          .pv-btn{padding:8px 18px;border-radius:6px;cursor:pointer;font-size:13px;border:1px solid #ddd;background:#fff;color:#333;}
          .pv-btn-primary{background:#4a90d9;color:#fff;border-color:#4a90d9;}
          .pv-btn-primary:hover{background:#3a7bc8;}
        `;
        el.appendChild(style);
        const header = document.createElement("div");
        header.className = "pv-header";
        const title = document.createElement("h3");
        title.className = "pv-title";
        title.textContent = "聊天记录预览";
        header.appendChild(title);
        const closeBtn = document.createElement("button");
        closeBtn.className = "pv-close";
        closeBtn.textContent = "×";
        closeBtn.onclick = close;
        header.appendChild(closeBtn);
        el.appendChild(header);
        const info = document.createElement("div");
        info.className = "pv-info";
        info.textContent = `共 ${result.count} 条消息 · 格式：${format.toUpperCase()} · 确认无误后点下载`;
        el.appendChild(info);
        const body = document.createElement("div");
        body.className = "pv-body";
        const textDiv = document.createElement("div");
        textDiv.className = "pv-text";
        // 只预览前5000字符，避免太大
        const previewText = result.content.length > 5000
          ? result.content.slice(0, 5000) + "\n\n……（内容过长，已截断预览，下载文件为完整内容）"
          : result.content;
        textDiv.textContent = previewText;
        body.appendChild(textDiv);
        el.appendChild(body);
        const actions = document.createElement("div");
        actions.className = "pv-actions";
        const cancelBtn = document.createElement("button");
        cancelBtn.className = "pv-btn";
        cancelBtn.textContent = "取消";
        cancelBtn.onclick = close;
        actions.appendChild(cancelBtn);
        const downloadBtn = document.createElement("button");
        downloadBtn.className = "pv-btn pv-btn-primary";
        downloadBtn.textContent = "下载文件";
        downloadBtn.onclick = () => {
          const safeName = (sessionName || "聊天记录").replace(/[\\/:*?"<>|]/g, "_");
          downloadFile(result.content, `${safeName}_聊天记录_${new Date().toISOString().slice(0, 10)}.${result.ext}`, result.mime);
          ctx.ui.toast("已开始下载");
          close();
        };
        actions.appendChild(downloadBtn);
        el.appendChild(actions);
      });
    }

    /* ========== 导入聊天记录（TXT/JSON → 写回会话） ========== */
    function parseChatLogFile(text) {
      // 先尝试 JSON
      let trimmed = text.trim();
      if (trimmed.charCodeAt(0) === 0xfeff) trimmed = trimmed.slice(1);
      if (trimmed.startsWith("{")) {
        try {
          const data = JSON.parse(trimmed);
          if (data.messages && Array.isArray(data.messages)) {
            return data.messages.map((m) => {
              const role = m.role || (m.roleName === "我" ? "user" : m.roleName === "系统" ? "system" : "assistant");
              return {
                role,
                content: String(m.content || ""),
                timeText: m.timeText || "",
                timestamp: m.timestamp || null,
                raw: m,
              };
            });
          }
        } catch (e) { /* 不是合法 JSON，走 TXT 解析 */ }
      }
      // TXT 解析：[时间] 角色：内容
      const lines = text.split("\n");
      const result = [];
      const re = /^\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\]\s*([^：:]+)：(.*)$/;
      for (const line of lines) {
        const m = line.trim();
        if (!m) continue;
        const mm = m.match(re);
        if (!mm) continue;
        const timeText = mm[1].replace(" ", "T");
        const roleName = mm[2].trim();
        const content = mm[3].trim();
        if (!content) continue;
        let role = "assistant";
        if (roleName === "我" || roleName === "用户") role = "user";
        else if (roleName === "系统") role = "system";
        result.push({
          role,
          content,
          timeText: mm[1],
          timestamp: new Date(timeText).getTime(),
        });
      }
      return result;
    }

    function showImportPreview(messages, targetSessionId, targetSessionName) {
      if (messages.length === 0) {
        ctx.ui.toast("文件里没有解析到任何消息");
        return;
      }
      const first = messages[0];
      const last = messages[messages.length - 1];
      ctx.ui.openModal((el, { close }) => {
        el.style.cssText = "width:680px;max-width:95vw;max-height:80vh;display:flex;flex-direction:column;font-family:system-ui,sans-serif;background:#fff;border-radius:12px;overflow:hidden;";
        const style = document.createElement("style");
        style.textContent = `
          .ip-header{padding:14px 18px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;background:#fafbfc;}
          .ip-title{font-size:16px;font-weight:600;margin:0;}
          .ip-close{background:none;border:none;font-size:20px;cursor:pointer;color:#999;padding:2px 8px;border-radius:4px;}
          .ip-close:hover{color:#333;background:#f0f0f0;}
          .ip-info{padding:12px 18px;background:#fff8e6;border-bottom:1px solid #f5e6b8;font-size:13px;color:#8a6d1a;line-height:1.7;}
          .ip-body{flex:1;overflow-y:auto;padding:12px 18px;background:#f9f9f9;}
          .ip-item{background:#fff;border:1px solid #eee;border-radius:6px;padding:8px 10px;margin-bottom:6px;font-size:13px;line-height:1.6;}
          .ip-item .ip-meta{font-size:11px;color:#999;margin-bottom:2px;}
          .ip-item.user{border-left:3px solid #4a90d9;}
          .ip-item.assistant{border-left:3px solid #27ae60;}
          .ip-actions{padding:12px 18px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end;background:#fafbfc;}
          .ip-progress{height:6px;background:#eee;border-radius:3px;margin:0 18px;overflow:hidden;}
          .ip-progress-bar{height:100%;background:#27ae60;width:0;transition:width .2s;border-radius:3px;}
          .ip-btn{padding:8px 18px;border-radius:6px;cursor:pointer;font-size:13px;border:1px solid #ddd;background:#fff;color:#333;}
          .ip-btn-primary{background:#27ae60;color:#fff;border-color:#27ae60;}
          .ip-btn-primary:hover{background:#219a52;}
          .ip-btn-primary:disabled{opacity:.5;cursor:not-allowed;}
          .ip-wipe{display:flex;align-items:center;gap:6px;padding:8px 18px;background:#fff0f0;border-top:1px solid #f5c6c6;font-size:13px;color:#c0392b;cursor:pointer;}
          .ip-wipe input{cursor:pointer;}
          .ip-wipe-label{cursor:pointer;line-height:1.4;}
          .ip-wipe-desc{font-size:11px;color:#e74c3c;opacity:.8;margin-top:2px;}
        `;
        el.appendChild(style);
        const header = document.createElement("div");
        header.className = "ip-header";
        const title = document.createElement("h3");
        title.className = "ip-title";
        title.textContent = "导入聊天记录预览";
        header.appendChild(title);
        const closeBtn = document.createElement("button");
        closeBtn.className = "ip-close";
        closeBtn.textContent = "×";
        closeBtn.onclick = close;
        header.appendChild(closeBtn);
        el.appendChild(header);

        const info = document.createElement("div");
        info.className = "ip-info";
        info.innerHTML = `
          <strong>共 ${messages.length} 条消息</strong><br/>
          时间范围：${first.timeText || "未知"} ~ ${last.timeText || "未知"}<br/>
          将导入到会话：<strong>${escapeHtml(targetSessionName || targetSessionId)}</strong><br/>
          导入的消息会真实写入该会话，重复导入会产生重复消息。确认继续？
        `;
        el.appendChild(info);

        // 删除旧消息选项
        const wipeBox = document.createElement("label");
        wipeBox.className = "ip-wipe";
        const wipeCb = document.createElement("input");
        wipeCb.type = "checkbox";
        wipeBox.appendChild(wipeCb);
        const wipeText = document.createElement("div");
        wipeText.className = "ip-wipe-label";
        wipeText.innerHTML = `导入前先删除该会话在文件时间范围内的旧消息<div class="ip-wipe-desc">⚠️ 勾选后，会先删除目标会话里 ${first.timeText || ""} 到 ${last.timeText || ""} 之间的现有消息，再导入新文件。此操作不可撤销。</div>`;
        wipeBox.appendChild(wipeText);
        el.appendChild(wipeBox);

        const body = document.createElement("div");
        body.className = "ip-body";
        // 预览前20条
        messages.slice(0, 20).forEach((m) => {
          const item = document.createElement("div");
          item.className = "ip-item " + (m.role === "user" ? "user" : "assistant");
          const meta = m.role === "user" ? "我" : (m.role === "system" ? "系统" : (targetSessionName || "对方"));
          item.innerHTML = `<div class="ip-meta">${escapeHtml(m.timeText || "")} · ${escapeHtml(meta)}</div>${escapeHtml(m.content.slice(0, 100))}${m.content.length > 100 ? "…" : ""}`;
          body.appendChild(item);
        });
        if (messages.length > 20) {
          const more = document.createElement("div");
          more.style.cssText = "text-align:center;color:#999;font-size:12px;padding:8px;";
          more.textContent = `…… 还有 ${messages.length - 20} 条 ……`;
          body.appendChild(more);
        }
        el.appendChild(body);

        const progressWrap = document.createElement("div");
        progressWrap.className = "ip-progress";
        const progressBar = document.createElement("div");
        progressBar.className = "ip-progress-bar";
        progressWrap.appendChild(progressBar);
        el.appendChild(progressWrap);

        const actions = document.createElement("div");
        actions.className = "ip-actions";
        const cancelBtn = document.createElement("button");
        cancelBtn.className = "ip-btn";
        cancelBtn.textContent = "取消";
        cancelBtn.onclick = close;
        actions.appendChild(cancelBtn);
        const confirmBtn = document.createElement("button");
        confirmBtn.className = "ip-btn ip-btn-primary";
        confirmBtn.textContent = `开始导入（${messages.length} 条）`;
        confirmBtn.onclick = async () => {
          confirmBtn.disabled = true;
          confirmBtn.textContent = "导入中…";
          // 如果勾选了"先删除"，先删除目标会话在文件时间范围内的旧消息
          if (wipeCb.checked) {
            const fileStartTs = first.timestamp || null;
            const fileEndTs = last.timestamp || null;
            if (!fileStartTs || !fileEndTs) {
              ctx.ui.toast("文件缺少有效时间戳，跳过删除，直接追加导入");
            } else {
            confirmBtn.textContent = "正在删除旧消息…";
            try {
              const oldMsgs = ctx.data.messages.list(targetSessionId);
              let deleted = 0;
              for (const om of oldMsgs) {
                const omTs = getTimeMs(getMessageTime(om));
                if (!omTs) continue;
                if (fileStartTs && omTs < fileStartTs) continue;
                if (fileEndTs && omTs > fileEndTs) continue;
                if (!om.id) continue;
                try {
                  if (typeof ctx.data.messages.remove === "function") {
                    await ctx.data.messages.remove(om.id);
                  } else if (typeof ctx.data.messages.delete === "function") {
                    await ctx.data.messages.delete(om.id);
                  } else if (typeof ctx.data.messages.del === "function") {
                    await ctx.data.messages.del(om.id);
                  } else {
                    continue;
                  }
                  deleted++;
                } catch (e) {
                  ctx.system.log("删除单条旧消息失败:", e.message);
                }
                if (deleted % 5 === 0) {
                  await new Promise((r) => setTimeout(r, 0));
                }
              }
              ctx.system.log("删除旧消息数:", deleted);
            } catch (e) {
              ctx.system.log("读取旧消息失败:", e.message);
            }
            }
          }
          let ok = 0;
          for (let i = 0; i < messages.length; i++) {
            const m = messages[i];
            try {
              if (m.raw) {
                // JSON 导入：用完整原始对象，保留消息类型/特殊字段，覆盖 sessionId
                const raw = { ...m.raw };
                delete raw.id;
                delete raw._id;
                raw.sessionId = targetSessionId;
                raw.role = m.raw.role || m.role;
                if (m.timestamp) {
                  raw.timestamp = m.timestamp;
                  raw.createdAt = m.timestamp;
                  raw.time = m.timestamp;
                }
                await ctx.data.messages.push(raw);
              } else {
                // TXT 导入：按基本字段写入
                await ctx.data.messages.push({
                  sessionId: targetSessionId,
                  role: m.role,
                  content: m.content,
                  timestamp: m.timestamp || Date.now(),
                  createdAt: m.timestamp || Date.now(),
                  time: m.timestamp || Date.now(),
                });
              }
              ok++;
            } catch (e) {
              ctx.system.log("导入单条失败:", e.message);
            }
            // 实时更新进度
            const pct = Math.round(((i + 1) / messages.length) * 100);
            progressBar.style.width = pct + "%";
            confirmBtn.textContent = `导入中… ${i + 1}/${messages.length}（${pct}%）`;
            // 每 5 条让出一次主线程，防止卡死
            if (i % 5 === 4) {
              await new Promise((r) => setTimeout(r, 0));
            }
          }
          ctx.ui.toast(`导入完成：成功 ${ok}/${messages.length} 条`);
          close();
        };
        actions.appendChild(confirmBtn);
        el.appendChild(actions);
      });
    }

    function pickAndImportChatLog(sessionId, sessionName) {
      if (!sessionId) { ctx.ui.toast("请先选择会话"); return; }
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".txt,.json,text/plain,application/json";
      input.style.display = "none";
      document.body.appendChild(input);
      input.onchange = (e) => {
        const file = e.target.files[0];
        document.body.removeChild(input);
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const messages = parseChatLogFile(reader.result);
            showImportPreview(messages, sessionId, sessionName);
          } catch (err) {
            ctx.ui.toast("文件解析失败：" + err.message);
          }
        };
        reader.onerror = () => ctx.ui.toast("文件读取失败");
        reader.readAsText(file);
      };
      setTimeout(() => input.click(), 0);
    }

    /* ========== 导入（宽松兼容） ========== */
    function importLexicon(callback) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.style.display = "none";
      document.body.appendChild(input);
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) { document.body.removeChild(input); return; }
        const reader = new FileReader();
        reader.onload = () => {
          document.body.removeChild(input);
          try {
            let text = reader.result;
            if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
            const data = JSON.parse(text);
            const intents = [];
            let rawIntents = [];
            if (Array.isArray(data)) rawIntents = data;
            else if (Array.isArray(data.intents)) rawIntents = data.intents;
            else if (Array.isArray(data.rules)) rawIntents = data.rules;
            else if (Array.isArray(data.data)) rawIntents = data.data;
            else {
              for (const k of Object.keys(data)) {
                if (Array.isArray(data[k])) { rawIntents = data[k]; break; }
              }
            }
            for (const it of rawIntents) {
              if (!it || typeof it !== "object") continue;
              const patterns = it.patterns || it.triggers || it.keywords || it.问 || it.question || [];
              const responses = it.responses || it.reply || it.replies || it.answer || it.答 || [];
              const patArr = Array.isArray(patterns) ? patterns : patterns ? [String(patterns)] : [];
              const resArr = Array.isArray(responses) ? responses : responses ? [String(responses)] : [];
              if (patArr.length === 0) continue;
              const patText = patArr.join(" ");
              const resText = resArr.join(" ");
              if (isCodeLike(patText) || isCodeLike(resText)) continue;
              intents.push({
                id: genId(),
                name: it.name || it.tag || String(patArr[0]).slice(0, 20),
                patterns: patArr.filter((p) => p && String(p).trim()).map(String),
                responses: resArr.filter((r) => r && String(r).trim() && !isCodeLike(r) && !isUnnaturalReply(r)).map(String),
                matchMode: "contains",
              });
            }
            if (intents.length === 0) { callback(new Error("未识别到有效词库条目")); return; }
            callback(null, { intents, defaultResponse: data.defaultResponse || "我没太听懂" });
          } catch (err) {
            callback(err);
          }
        };
        reader.onerror = () => { document.body.removeChild(input); callback(new Error("文件读取失败")); };
        reader.readAsText(file);
      };
      setTimeout(() => input.click(), 0);
    }

    /* ========== 匹配测试 ========== */
    function matchIntent(text, intent) {
      const t = text.toLowerCase();
      if (intent.matchMode === "exact") return intent.patterns.some((p) => p.toLowerCase() === t);
      if (intent.matchMode === "regex") {
        return intent.patterns.some((p) => { try { return new RegExp(p, "i").test(text); } catch (e) { return false; } });
      }
      return intent.patterns.some((p) => t.includes(p.toLowerCase()));
    }

    /* ========== UI 管理浮层 ========== */
    function openLexiconModal() {
      ctx.ui.openModal((el, { close }) => {
        let lexicon = loadLexicon();
        let sessions = [];
        try { sessions = ctx.data.sessions.list(); } catch (e) {}

        el.style.cssText = "width:680px;max-width:95vw;max-height:82vh;display:flex;flex-direction:column;font-family:system-ui,sans-serif;background:#fff;border-radius:12px;overflow:hidden;";

        const style = document.createElement("style");
        style.textContent = `
          .lb-header{padding:14px 18px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;background:#fafbfc;}
          .lb-title{font-size:16px;font-weight:600;margin:0;}
          .lb-close{background:none;border:none;font-size:20px;cursor:pointer;color:#999;padding:2px 8px;border-radius:4px;line-height:1;}
          .lb-close:hover{color:#333;background:#f0f0f0;}
          .lb-body{flex:1;overflow-y:auto;padding:14px 18px;}
          .lb-stats{display:flex;gap:8px;margin-bottom:12px;}
          .lb-stat{flex:1;background:#f7f8fa;border-radius:8px;padding:10px 6px;text-align:center;}
          .lb-stat-num{font-size:22px;font-weight:700;color:#333;}
          .lb-stat-label{font-size:11px;color:#999;margin-top:2px;}
          .lb-session-select{width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;margin-bottom:8px;font-size:13px;background:#fff;}
          .lb-time-range{display:flex;gap:8px;margin-bottom:12px;align-items:center;}
          .lb-time-range label{font-size:12px;color:#666;white-space:nowrap;}
          .lb-time-range input{flex:1;padding:6px 8px;border:1px solid #ddd;border-radius:5px;font-size:12px;min-width:0;}
          .lb-chat-export{border:1px solid #e0e6ed;border-radius:8px;padding:12px;margin-bottom:14px;background:#f8fafc;}
          .lb-chat-export-title{font-size:13px;font-weight:600;color:#333;margin-bottom:8px;}
          .lb-chat-export-row{display:flex;gap:8px;align-items:center;}
          .lb-format-group{display:flex;gap:4px;}
          .lb-format-btn{padding:6px 14px;border:1px solid #ddd;border-radius:5px;background:#fff;cursor:pointer;font-size:12px;color:#666;}
          .lb-format-btn.active{background:#4a90d9;color:#fff;border-color:#4a90d9;}
          .lb-export-chat-btn{padding:6px 16px;border:1px solid #27ae60;border-radius:5px;background:#27ae60;color:#fff;cursor:pointer;font-size:12px;}
          .lb-export-chat-btn:hover{background:#219a52;}
          .lb-section-divider{text-align:center;color:#bbb;font-size:11px;margin:4px 0 10px;position:relative;}
          .lb-section-divider::before,.lb-section-divider::after{content:"";position:absolute;top:50%;width:40%;height:1px;background:#eee;}
          .lb-section-divider::before{left:0;}
          .lb-section-divider::after{right:0;}
          .lb-extract-row{display:flex;gap:8px;margin-bottom:10px;}
          .lb-extract-btn{flex:1;padding:10px 8px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer;font-size:13px;text-align:center;transition:all .15s;}
          .lb-extract-btn:hover{border-color:#4a90d9;color:#4a90d9;background:#f0f7ff;}
          .lb-extract-btn.active{border-color:#4a90d9;color:#4a90d9;background:#e8f2ff;box-shadow:0 0 0 2px rgba(74,144,217,.2);}
          .lb-extract-btn .lb-eb-title{font-weight:600;font-size:14px;margin-bottom:2px;}
          .lb-extract-btn .lb-eb-desc{font-size:11px;color:#999;}
          .lb-generate-row{display:flex;gap:8px;margin:10px 0 14px;}
          .lb-generate-btn{flex:1;padding:11px;border-radius:8px;border:none;background:linear-gradient(135deg,#4a90d9,#357abd);color:#fff;cursor:pointer;font-size:14px;font-weight:600;}
          .lb-generate-btn:hover{background:linear-gradient(135deg,#3a7bc8,#2d6aa8);}
          .lb-generate-btn:disabled{opacity:.5;cursor:not-allowed;}
          .lb-actions{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;}
          .lb-btn{padding:6px 12px;border-radius:6px;border:1px solid #ddd;background:#fff;cursor:pointer;font-size:12px;color:#333;}
          .lb-btn:hover{border-color:#4a90d9;color:#4a90d9;}
          .lb-btn-danger{color:#e74c3c;border-color:#e74c3c;}
          .lb-btn-danger:hover{background:#e74c3c;color:#fff;}
          .lb-intent{border:1px solid #eee;border-radius:8px;margin-bottom:8px;overflow:hidden;}
          .lb-intent-header{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#fafbfc;cursor:pointer;}
          .lb-intent-name{font-weight:600;font-size:13px;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
          .lb-intent-meta{font-size:11px;color:#999;white-space:nowrap;}
          .lb-intent-body{padding:12px;border-top:1px solid #eee;display:none;}
          .lb-intent.open .lb-intent-body{display:block;}
          .lb-field{margin-bottom:10px;}
          .lb-field-label{font-size:11px;color:#666;margin-bottom:4px;font-weight:500;}
          .lb-input{width:100%;padding:6px 9px;border:1px solid #ddd;border-radius:5px;font-size:13px;box-sizing:border-box;}
          .lb-textarea{width:100%;padding:6px 9px;border:1px solid #ddd;border-radius:5px;font-size:13px;min-height:60px;box-sizing:border-box;resize:vertical;font-family:inherit;line-height:1.5;}
          .lb-tag-list{display:flex;flex-wrap:wrap;gap:4px;}
          .lb-tag{background:#e8f0fe;color:#3a7bc8;padding:2px 7px;border-radius:4px;font-size:12px;display:inline-flex;align-items:center;gap:4px;}
          .lb-tag-remove{cursor:pointer;font-weight:bold;}
          .lb-tag-remove:hover{color:#e74c3c;}
          .lb-add-input{display:flex;gap:6px;margin-top:6px;}
          .lb-add-input input{flex:1;}
          .lb-empty{text-align:center;padding:36px 16px;color:#aaa;font-size:13px;}
          .lb-test-row{display:flex;gap:6px;margin-top:6px;}
          .lb-test-result{margin-top:8px;padding:9px;background:#f7f8fa;border-radius:6px;font-size:12px;color:#555;display:none;}
          .lb-test-result.show{display:block;}
          .lb-footer{padding:10px 18px;border-top:1px solid #eee;background:#fafbfc;font-size:11px;color:#999;display:flex;justify-content:space-between;}
        `;
        el.appendChild(style);

        // header
        const header = document.createElement("div");
        header.className = "lb-header";
        const title = document.createElement("h3");
        title.className = "lb-title";
        title.textContent = "词库管理";
        header.appendChild(title);
        const closeBtn = document.createElement("button");
        closeBtn.className = "lb-close";
        closeBtn.textContent = "×";
        closeBtn.onclick = close;
        header.appendChild(closeBtn);
        el.appendChild(header);

        const body = document.createElement("div");
        body.className = "lb-body";
        el.appendChild(body);
        const footer = document.createElement("div");
        footer.className = "lb-footer";
        el.appendChild(footer);

        // 时间输入框引用（外层作用域）
        let startTimeInput = null;
        let endTimeInput = null;
        function getTimeRange() {
          const s = startTimeInput && startTimeInput.value ? new Date(startTimeInput.value).getTime() : null;
          const e = endTimeInput && endTimeInput.value ? new Date(endTimeInput.value).getTime() : null;
          return { start: s, end: e };
        }
        function autoFillTimeRange(sessionId) {
          if (!sessionId || !startTimeInput || !endTimeInput) return;
          try {
            const msgs = ctx.data.messages.list(sessionId);
            let minTs = null, maxTs = null;
            for (const m of msgs) {
              const ts = getTimeMs(getMessageTime(m));
              if (!ts) continue;
              if (!minTs || ts < minTs) minTs = ts;
              if (!maxTs || ts > maxTs) maxTs = ts;
            }
            if (minTs) {
              const s = toDateTimeLocal(new Date(minTs));
              startTimeInput.min = s; endTimeInput.min = s; startTimeInput.value = s;
            } else {
              startTimeInput.min = ""; endTimeInput.min = "";
            }
            if (maxTs) {
              const e = toDateTimeLocal(new Date(maxTs));
              startTimeInput.max = e; endTimeInput.max = e; endTimeInput.value = e;
            } else {
              startTimeInput.max = ""; endTimeInput.max = "";
            }
          } catch (e) {}
        }

        let selectedMode = "detailed";

        async function doExtract(mode) {
          const sid = body.querySelector("select")?.value || currentSessionId;
          if (!sid) { ctx.ui.toast("请先选择一个会话"); return; }
          const label = mode === "simple" ? "简单" : mode === "detailed" ? "详细" : "精确";
          let t = ctx.ui.toast(`正在用「${label}」模式提取…`, { durationMs: 0 });
          try {
            let msgs = ctx.data.messages.list(sid);
            const tr = getTimeRange();
            if (tr.start || tr.end) msgs = filterMessagesByTime(msgs, tr.start, tr.end);
            const pairs = extractQAPairs(msgs);
            if (pairs.length === 0) { t.close(); ctx.ui.toast("未找到问答对"); return; }
            let newLex;
            if (mode === "simple") newLex = buildSimple(pairs);
            else if (mode === "detailed") newLex = buildDetailed(pairs);
            else newLex = await buildPrecise(pairs, (cur, total) => {
              t.close();
              t = ctx.ui.toast(`AI 归纳中…第 ${cur}/${total} 批`, { durationMs: 0 });
            });
            if (newLex.intents.length === 0) { t.close(); ctx.ui.toast("未提取出有效意图"); return; }
            lexicon.intents = [...lexicon.intents, ...newLex.intents];
            saveLexicon(lexicon);
            t.close();
            ctx.ui.toast(`${label}提取完成：${pairs.length} 对问答 → ${newLex.intents.length} 意图`);
            render();
          } catch (e) {
            t.close();
            ctx.ui.toast("提取失败：" + e.message);
          }
        }

        function render() {
          body.innerHTML = "";
          const tp = lexicon.intents.reduce((s, i) => s + i.patterns.length, 0);
          const tr2 = lexicon.intents.reduce((s, i) => s + i.responses.length, 0);
          footer.innerHTML = `<span>${lexicon.intents.length} 意图 · ${tp} 触发词 · ${tr2} 回复</span><span>保存在插件本地</span>`;

          const stats = document.createElement("div");
          stats.className = "lb-stats";
          stats.innerHTML = `
            <div class="lb-stat"><div class="lb-stat-num">${lexicon.intents.length}</div><div class="lb-stat-label">意图</div></div>
            <div class="lb-stat"><div class="lb-stat-num">${tp}</div><div class="lb-stat-label">触发词</div></div>
            <div class="lb-stat"><div class="lb-stat-num">${tr2}</div><div class="lb-stat-label">回复</div></div>
          `;
          body.appendChild(stats);

          // 会话选择
          if (sessions.length > 0) {
            const select = document.createElement("select");
            select.className = "lb-session-select";
            sessions.forEach((s) => {
              const opt = document.createElement("option");
              opt.value = s.id;
              opt.textContent = (s.isGroup ? "[群聊] " : "") + getSessionName(s);
              if (s.id === currentSessionId) opt.selected = true;
              select.appendChild(opt);
            });
            select.onchange = () => autoFillTimeRange(select.value);
            body.appendChild(select);
          }

          // 时间范围
          const timeRange = document.createElement("div");
          timeRange.className = "lb-time-range";
          const ls = document.createElement("label"); ls.textContent = "开始";
          startTimeInput = document.createElement("input"); startTimeInput.type = "datetime-local";
          const le = document.createElement("label"); le.textContent = "结束";
          endTimeInput = document.createElement("input"); endTimeInput.type = "datetime-local";
          timeRange.appendChild(ls); timeRange.appendChild(startTimeInput);
          timeRange.appendChild(le); timeRange.appendChild(endTimeInput);
          body.appendChild(timeRange);
          const initSid = body.querySelector("select")?.value || currentSessionId;
          autoFillTimeRange(initSid);

          // 聊天记录导出区
          const chatBox = document.createElement("div");
          chatBox.className = "lb-chat-export";
          chatBox.innerHTML = `<div class="lb-chat-export-title">聊天记录导出（先预览再下载）</div>`;
          const chatRow = document.createElement("div");
          chatRow.className = "lb-chat-export-row";
          const fmtGroup = document.createElement("div");
          fmtGroup.className = "lb-format-group";
          let curFormat = "txt";
          const btnT = document.createElement("button");
          btnT.className = "lb-format-btn active"; btnT.textContent = "TXT";
          btnT.onclick = () => { curFormat = "txt"; btnT.classList.add("active"); btnJ.classList.remove("active"); };
          const btnJ = document.createElement("button");
          btnJ.className = "lb-format-btn"; btnJ.textContent = "JSON";
          btnJ.onclick = () => { curFormat = "json"; btnJ.classList.add("active"); btnT.classList.remove("active"); };
          fmtGroup.appendChild(btnT); fmtGroup.appendChild(btnJ);
          const btnExportChat = document.createElement("button");
          btnExportChat.className = "lb-export-chat-btn";
          btnExportChat.textContent = "预览并导出";
          btnExportChat.onclick = () => {
            const sid = body.querySelector("select")?.value || currentSessionId;
            if (!sid) { ctx.ui.toast("请先选择会话"); return; }
            let sname = "";
            const sel = body.querySelector("select");
            if (sel && sel.selectedOptions[0]) sname = sel.selectedOptions[0].textContent.replace(/^\[群聊\]\s*/, "");
            const r = getTimeRange();
            try {
              showChatLogPreview(sid, sname, curFormat, r.start, r.end);
            } catch (e) {
              ctx.ui.toast("导出失败：" + e.message);
            }
          };
          chatRow.appendChild(fmtGroup);
          chatRow.appendChild(btnExportChat);
          const btnImportChat = document.createElement("button");
          btnImportChat.className = "lb-export-chat-btn";
          btnImportChat.style.background = "#8e44ad";
          btnImportChat.style.borderColor = "#8e44ad";
          btnImportChat.textContent = "导入聊天记录";
          btnImportChat.onclick = () => {
            const sid = body.querySelector("select")?.value || currentSessionId;
            if (!sid) { ctx.ui.toast("请先选择要导入到哪个会话"); return; }
            let sname = "";
            const sel = body.querySelector("select");
            if (sel && sel.selectedOptions[0]) sname = sel.selectedOptions[0].textContent.replace(/^\[群聊\]\s*/, "");
            pickAndImportChatLog(sid, sname);
          };
          chatRow.appendChild(btnImportChat);
          chatBox.appendChild(chatRow);
          body.appendChild(chatBox);

          // 分隔线
          const divider = document.createElement("div");
          divider.className = "lb-section-divider";
          divider.textContent = "词库构建";
          body.appendChild(divider);

          // 模式选择
          const extractRow = document.createElement("div");
          extractRow.className = "lb-extract-row";
          const modeBtns = {};
          [
            { key: "simple", title: "简单", desc: "整句触发，1对1" },
            { key: "detailed", title: "详细", desc: "切分关键词，合并回复" },
            { key: "precise", title: "精确", desc: "AI语义归纳" },
          ].forEach((cfg) => {
            const b = document.createElement("button");
            b.className = "lb-extract-btn" + (cfg.key === selectedMode ? " active" : "");
            b.innerHTML = `<div class="lb-eb-title">${cfg.title}</div><div class="lb-eb-desc">${cfg.desc}</div>`;
            b.onclick = () => {
              selectedMode = cfg.key;
              Object.values(modeBtns).forEach((x) => x.classList.remove("active"));
              b.classList.add("active");
            };
            modeBtns[cfg.key] = b;
            extractRow.appendChild(b);
          });
          body.appendChild(extractRow);

          // 生成按钮
          const genRow = document.createElement("div");
          genRow.className = "lb-generate-row";
          const btnGen = document.createElement("button");
          btnGen.className = "lb-generate-btn";
          btnGen.textContent = "生成词库";
          btnGen.onclick = () => {
            btnGen.disabled = true;
            btnGen.textContent = "生成中…";
            doExtract(selectedMode).finally(() => {
              btnGen.disabled = false;
              btnGen.textContent = "生成词库";
            });
          };
          genRow.appendChild(btnGen);
          body.appendChild(genRow);

          // 词库操作
          const actions = document.createElement("div");
          actions.className = "lb-actions";
          const btnExport = document.createElement("button");
          btnExport.className = "lb-btn";
          btnExport.textContent = "导出词库";
          btnExport.onclick = () => {
            if (lexicon.intents.length === 0) { ctx.ui.toast("词库为空"); return; }
            exportLexicon(lexicon);
            ctx.ui.toast("词库已导出为 TXT");
          };
          actions.appendChild(btnExport);
          const btnImport = document.createElement("button");
          btnImport.className = "lb-btn";
          btnImport.textContent = "导入词库";
          btnImport.onclick = () => {
            importLexicon((err, data) => {
              if (err) { ctx.ui.toast("导入失败：" + err.message); return; }
              lexicon.intents = [...lexicon.intents, ...data.intents];
              if (data.defaultResponse) lexicon.defaultResponse = data.defaultResponse;
              saveLexicon(lexicon);
              ctx.ui.toast(`导入成功：${data.intents.length} 个意图`);
              render();
            });
          };
          actions.appendChild(btnImport);
          const btnAdd = document.createElement("button");
          btnAdd.className = "lb-btn";
          btnAdd.textContent = "+ 新增意图";
          btnAdd.onclick = () => {
            lexicon.intents.unshift({ id: genId(), name: "新意图", patterns: [], responses: [], matchMode: "contains" });
            saveLexicon(lexicon);
            render();
          };
          actions.appendChild(btnAdd);
          const btnClear = document.createElement("button");
          btnClear.className = "lb-btn lb-btn-danger";
          btnClear.textContent = "清空";
          btnClear.onclick = () => {
            if (lexicon.intents.length === 0) return;
            if (confirm("确定清空？建议先导出备份。")) {
              lexicon.intents = [];
              saveLexicon(lexicon);
              ctx.ui.toast("已清空");
              render();
            }
          };
          actions.appendChild(btnClear);
          body.appendChild(actions);

          // 匹配测试
          const testCard = document.createElement("div");
          testCard.className = "lb-intent";
          testCard.style.marginBottom = "12px";
          testCard.innerHTML = `
            <div class="lb-intent-header" style="cursor:default;">
              <span class="lb-intent-name">匹配测试</span>
              <span class="lb-intent-meta">输入一句话测试</span>
            </div>
            <div class="lb-intent-body" style="display:block;padding:10px 12px;">
              <div class="lb-test-row">
                <input class="lb-input" id="lb-ti" placeholder="测试语句" />
                <button class="lb-btn" id="lb-tb" style="white-space:nowrap;">测试</button>
              </div>
              <div class="lb-test-result" id="lb-tr"></div>
            </div>
          `;
          body.appendChild(testCard);
          const ti = testCard.querySelector("#lb-ti");
          const resultEl = testCard.querySelector("#lb-tr");
          function runTest() {
            const text = ti.value.trim();
            if (!text) { resultEl.classList.remove("show"); return; }
            const hits = lexicon.intents.filter((it) => matchIntent(text, it));
            if (hits.length === 0) {
              resultEl.innerHTML = `<strong style="color:#e74c3c;">未命中</strong>`;
            } else {
              resultEl.innerHTML = hits.map((h) => {
                const resp = h.responses.length > 0 ? h.responses[Math.floor(Math.random() * h.responses.length)] : "(无回复)";
                return `<div><strong>${escapeHtml(h.name)}</strong> → ${escapeHtml(resp)}</div>`;
              }).join("");
            }
            resultEl.classList.add("show");
          }
          testCard.querySelector("#lb-tb").onclick = runTest;
          ti.onkeydown = (e) => { if (e.key === "Enter") runTest(); };

          // 意图列表
          if (lexicon.intents.length === 0) {
            const empty = document.createElement("div");
            empty.className = "lb-empty";
            empty.textContent = "词库为空 — 选择会话后点「生成词库」";
            body.appendChild(empty);
            return;
          }
          lexicon.intents.forEach((intent, idx) => {
            const card = document.createElement("div");
            card.className = "lb-intent";
            const ih = document.createElement("div");
            ih.className = "lb-intent-header";
            ih.innerHTML = `<span class="lb-intent-name">${escapeHtml(intent.name)}</span><span class="lb-intent-meta">${intent.patterns.length} 触发 · ${intent.responses.length} 回复</span>`;
            ih.onclick = () => card.classList.toggle("open");
            card.appendChild(ih);
            const ib = document.createElement("div");
            ib.className = "lb-intent-body";
            function refreshMeta() {
              ih.querySelector(".lb-intent-meta").textContent = `${intent.patterns.length} 触发 · ${intent.responses.length} 回复`;
            }
            const nf = document.createElement("div");
            nf.className = "lb-field";
            nf.innerHTML = `<div class="lb-field-label">意图名称</div>`;
            const ni = document.createElement("input");
            ni.className = "lb-input"; ni.value = intent.name;
            ni.onchange = () => { intent.name = ni.value; saveLexicon(lexicon); ih.querySelector(".lb-intent-name").textContent = intent.name; };
            nf.appendChild(ni); ib.appendChild(nf);
            const pf = document.createElement("div");
            pf.className = "lb-field";
            pf.innerHTML = `<div class="lb-field-label">触发词（点×删除，回车添加）</div>`;
            const pl = document.createElement("div"); pl.className = "lb-tag-list";
            function rp() {
              pl.innerHTML = "";
              if (intent.patterns.length === 0) pl.innerHTML = '<span style="color:#bbb;font-size:12px;">暂无</span>';
              intent.patterns.forEach((p, pi) => {
                const tag = document.createElement("span");
                tag.className = "lb-tag";
                tag.innerHTML = `${escapeHtml(p)} <span class="lb-tag-remove">×</span>`;
                tag.querySelector(".lb-tag-remove").onclick = (e) => {
                  e.stopPropagation(); intent.patterns.splice(pi, 1); saveLexicon(lexicon); rp(); refreshMeta();
                };
                pl.appendChild(tag);
              });
            }
            rp(); pf.appendChild(pl);
            const pa = document.createElement("div"); pa.className = "lb-add-input";
            const pi2 = document.createElement("input");
            pi2.className = "lb-input"; pi2.placeholder = "输入触发词，回车添加";
            pi2.onkeydown = (e) => {
              if (e.key === "Enter" && pi2.value.trim()) {
                const v = pi2.value.trim();
                if (!intent.patterns.includes(v)) intent.patterns.push(v);
                pi2.value = ""; saveLexicon(lexicon); rp(); refreshMeta();
              }
            };
            pa.appendChild(pi2); pf.appendChild(pa); ib.appendChild(pf);
            const rf = document.createElement("div");
            rf.className = "lb-field";
            rf.innerHTML = `<div class="lb-field-label">回复（每行一条）</div>`;
            const rt = document.createElement("textarea");
            rt.className = "lb-textarea"; rt.value = intent.responses.join("\n");
            rt.onchange = () => {
              intent.responses = rt.value.split("\n").map((s) => s.trim()).filter((s) => s);
              saveLexicon(lexicon); refreshMeta();
            };
            rf.appendChild(rt); ib.appendChild(rf);
            const db = document.createElement("button");
            db.className = "lb-btn lb-btn-danger"; db.textContent = "删除此意图";
            db.onclick = (e) => {
              e.stopPropagation();
              if (confirm(`删除「${intent.name}」？`)) { lexicon.intents.splice(idx, 1); saveLexicon(lexicon); render(); }
            };
            ib.appendChild(db);
            card.appendChild(ib); body.appendChild(card);
          });
        }
        render();
      });
    }

    /* ========== 注册入口 ========== */
    ctx.ui.slot("chat.inputToolbar", (el) => {
      el.innerHTML = "";
      const btn = document.createElement("button");
      btn.textContent = "词库";
      btn.style.cssText = "padding:5px 12px;border:1px solid #dcdfe6;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;color:#606266;margin:4px;";
      btn.onmouseenter = () => { btn.style.borderColor = "#4a90d9"; btn.style.color = "#4a90d9"; };
      btn.onmouseleave = () => { btn.style.borderColor = "#dcdfe6"; btn.style.color = "#606266"; };
      btn.onclick = openLexiconModal;
      el.appendChild(btn);
    });
    ctx.ui.slot("settings.section", (el) => {
      el.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.style.padding = "8px 0";
      const p = document.createElement("p");
      p.style.cssText = "font-size:13px;color:#666;margin:0 0 10px;";
      p.textContent = "从聊天记录提取词库，支持三档精度、时间筛选、聊天记录备份导出。";
      const btn = document.createElement("button");
      btn.textContent = "打开词库管理器";
      btn.style.cssText = "padding:8px 18px;border:1px solid #4a90d9;border-radius:6px;background:#4a90d9;color:#fff;cursor:pointer;font-size:14px;";
      btn.onclick = openLexiconModal;
      wrap.appendChild(p); wrap.appendChild(btn);
      el.appendChild(wrap);
    });
  },
};
//（注：内容由AI生成）
