export default {
  manifest: {
    id: "lexicon-builder",
    name: "词库构建器",
    apiVersion: 1,
    version: "2.0.0",
    author: "你",
    description: "从聊天记录提取规则词库，三档精度可选，支持本地保存与 JSON 导入导出",
    permissions: ["chat.read", "ai"],
    settings: [],
  },

  setup(ctx) {
    const STORAGE_KEY = "lexicon_data_v2";
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

    /* ========== 获取会话真实名称（优先联系人/角色名） ========== */
    function getSessionName(session) {
      if (!session) return "未命名会话";
      if (session.name && session.name !== session.id) return session.name;
      if (session.contactName) return session.contactName;
      if (session.title) return session.title;
      // 通过 contactId 查联系人/角色
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

    /* ========== 时间戳格式化 ========== */
    function formatTime(ts) {
      if (!ts) return "未知时间";
      let d;
      if (typeof ts === "number") {
        // 兼容秒级和毫秒级时间戳
        d = new Date(ts < 1e12 ? ts * 1000 : ts);
      } else {
        d = new Date(ts);
      }
      if (isNaN(d.getTime())) return String(ts);
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    /* ========== 从消息对象提取时间戳 ========== */
    function getMessageTime(msg) {
      return msg.timestamp || msg.createdAt || msg.time || msg.date || msg.created_at || msg.sendTime || null;
    }

    /* ========== 把各种时间戳转成毫秒 ========== */
    function getTimeMs(ts) {
      if (!ts) return null;
      if (typeof ts === "number") return ts < 1e12 ? ts * 1000 : ts;
      const d = new Date(ts);
      return isNaN(d.getTime()) ? null : d.getTime();
    }

    /* ========== 按时间范围过滤消息 ========== */
    function filterMessagesByTime(messages, startTimeMs, endTimeMs) {
      if (!startTimeMs && !endTimeMs) return messages;
      // 结束时间多加 59 秒缓冲，因为 datetime-local 只到分钟，避免丢掉最后一分钟内的消息
      const endBuffer = endTimeMs ? endTimeMs + 59999 : null;
      return messages.filter((m) => {
        const ms = getTimeMs(getMessageTime(m));
        if (!ms) return true; // 没有时间戳的消息保留
        if (startTimeMs && ms < startTimeMs) return false;
        if (endBuffer && ms > endBuffer) return false;
        return true;
      });
    }

    /* ========== 判断是否为代码内容 ========== */
    function isCodeLike(text) {
      if (!text) return false;
      if (text.includes("```")) return true;
      // 代码符号占比超过 15% 判定为代码
      const codeChars = (text.match(/[{};=<>()[\]\/\\+*&|#@$%^~`]/g) || []).length;
      const total = text.replace(/\s/g, "").length;
      if (total > 0 && codeChars / total > 0.15) return true;
      // 常见代码关键词命中
      const codeKeywords = [
        "function", "const ", "let ", "var ", "return ", "import ", "export ",
        "console.log", "document.", "window.", "undefined", "null",
        "=>", "====", "===", "!==", "typeof", "instanceof",
        "def ", "print(", "if __name", "pip install", "npm install",
        "localhost", "http://", "https://", "api/", ".json", ".js", ".ts",
        "SELECT ", "INSERT ", "UPDATE ", "DELETE FROM", "CREATE TABLE",
        "git ", "docker ", "sudo ", "mkdir ", "cd ", "ls ",
      ];
      const lower = text.toLowerCase();
      for (const kw of codeKeywords) {
        if (lower.includes(kw.toLowerCase())) return true;
      }
      // 检测典型代码行：以分号结尾，或包含 = 赋值且长度>15
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

    /* ========== 去掉标点和空白 ========== */
    function stripPunct(text) {
      return text.replace(/[，。！？、；：""''（）【】《》\s,.!?;:'"()\[\]<>~…—\-]+/g, "");
    }

    /* ========== 字符级相似度（Jaccard） ========== */
    function charSimilarity(a, b) {
      const setA = new Set(a);
      const setB = new Set(b);
      let intersection = 0;
      for (const c of setA) {
        if (setB.has(c)) intersection++;
      }
      const union = new Set([...setA, ...setB]).size;
      return union === 0 ? 0 : intersection / union;
    }

    /* ========== 判断回复是否"不像人"（客服腔/书面体/系统消息） ========== */
    function isUnnaturalReply(text) {
      if (!text || text.trim().length < 1) return true;
      const t = text.trim();
      // 客服/模板腔
      const servicePatterns = [
        "请问有什么可以帮", "很高兴为您服务", "为您服务", "感谢您的",
        "请问还有什么", "您好，请问", "您好!请问", "有什么可以帮您",
        "我是您的智能助手", "很高兴为你服务", "请问有什么需要",
        "如果您还有其他", "欢迎随时咨询", "祝您生活愉快",
        "请问您需要什么帮助", "好的，我明白了", "收到，我会",
      ];
      for (const p of servicePatterns) {
        if (t.includes(p)) return true;
      }
      // 书面公文体
      const formalPatterns = [
        "特此", "兹有", "综上所述", "鉴于", "予以", "如下所述",
        "据此", "综上", "鉴于此", "特此通知", "特此说明",
      ];
      for (const p of formalPatterns) {
        if (t.includes(p)) return true;
      }
      // 系统消息/标签格式
      if (/^【.*】$/.test(t)) return true;
      if (/^(系统提示|助手|system|System)[:：]/.test(t)) return true;
      // 太长：真人聊天回复一般不超过 200 字
      if (t.length > 200) return true;
      // 纯符号/纯标点
      if (stripPunct(t).length < 1) return true;
      return false;
    }

    /* ========== 提取问答对 ========== */
    function extractQAPairs(messages) {
      // 先按时间正序排序，确保配对正确（防止消息倒序把用户话当成角色回复）
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
          if (next.role === "assistant") {
            reply = next;
            break;
          }
          if (next.role === "user") break;
        }
        if (!reply) continue;
        const q = String(msg.content || "").trim();
        const a = String(reply.content || "").trim();
        if (q.length < 1 || a.length < 1) continue;
        if (/^[嗯哦啊哈诶唉唔呃好的是的对没错]+[。！？~…]*$/.test(q)) continue;
        // 跳过代码内容
        if (isCodeLike(q) || isCodeLike(a)) continue;
        // 跳过角色重复/模仿用户的情况（保持角色自己的说话风格）
        const qClean = stripPunct(q);
        const aClean = stripPunct(a);
        if (qClean === aClean) continue; // 去标点后完全相同
        if (qClean.length > 3 && aClean.startsWith(qClean) && aClean.length - qClean.length < 6) continue; // 角色复述用户的话
        if (qClean.length > 5 && aClean.length > 5 && charSimilarity(qClean, aClean) > 0.85) continue; // 高度相似
        // 过滤掉客服腔/书面体/系统消息等"不像人"的回复
        if (isUnnaturalReply(a)) continue;
        pairs.push({ q, a });
      }
      return pairs;
    }

    /* ========== 模式一：简单提取 ========== */
    // 每条用户消息整句 = 一个触发词，1 对 1，不切分不合并
    function buildSimple(pairs) {
      const intents = [];
      const seen = new Set();
      for (const pair of pairs) {
        if (seen.has(pair.q)) continue; // 完全相同的问句去重
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

    /* ========== 模式二：详细提取 ========== */
    // 按标点切分关键词，相同问句合并回复，多触发词
    function buildDetailed(pairs) {
      const intents = [];
      const qMap = new Map();

      function splitPatterns(text) {
        // 标点 + 代码符号统一作为分隔符
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
          splitPatterns(pair.q).forEach((p) => {
            if (!intent.patterns.includes(p)) intent.patterns.push(p);
          });
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

    /* ========== 模式三：精确提取（AI 归纳） ========== */
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

【选人标准——这是最重要的】
- 回复必须是答方原话，一个字都不要改、不要润色、不要缩写、不要"优化"
- 挑"有体温"的：带情绪、带口语、有语气词、像朋友发微信，不要挑像客服、像百科、像作文的句子
- 跳过这些：复述用户原话的、太长的小作文、书面公文腔、客服模板句（"请问有什么可以帮您"那种）、过于完美规整的句子
- 长度要参差：短的两三个字也行，长的三四句也行，别每条都差不多长
- 宁可挑一条不完美但很真实的，也不要挑一条完美但很假的

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
                responses: Array.isArray(it.responses) ? it.responses.filter((r) => r && r.length > 0) : [],
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

    /* ========== 导出（通用简洁格式） ========== */
    function exportLexicon(lex) {
      // 只导出纯回复内容，每行一条，去重，最后再过一遍代码和机械内容过滤
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
      const content = lines.join("\n");
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `词库_${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /* ========== 导出聊天记录（纯备份） ========== */
    function exportChatLog(sessionId, sessionName, format, startTimeMs, endTimeMs) {
      format = format || "json";
      let messages = ctx.data.messages.list(sessionId);
      // 按时间范围过滤
      if (startTimeMs || endTimeMs) {
        messages = filterMessagesByTime(messages, startTimeMs, endTimeMs);
      }

      // 按时间排序（兼容秒级/毫秒级/字符串时间戳）
      messages = [...messages].sort((a, b) => {
        const ta = getMessageTime(a);
        const tb = getMessageTime(b);
        if (!ta && !tb) return 0;
        if (!ta) return 1;
        if (!tb) return -1;
        const da = typeof ta === "number" ? (ta < 1e12 ? ta * 1000 : ta) : new Date(ta).getTime();
        const db = typeof tb === "number" ? (tb < 1e12 ? tb * 1000 : tb) : new Date(tb).getTime();
        return da - db;
      });

      const roleName = (role) => {
        if (role === "user") return "我";
        if (role === "assistant") return sessionName || "对方";
        if (role === "system") return "系统";
        return role || "未知";
      };

      let content, mimeType, ext;
      if (format === "txt") {
        const lines = [];
        lines.push("===== 聊天记录导出 =====");
        lines.push(`会话：${sessionName || sessionId}`);
        lines.push(`导出时间：${formatTime(Date.now())}`);
        lines.push(`消息总数：${messages.length}`);
        lines.push("========================");
        lines.push("");
        for (const m of messages) {
          const t = formatTime(getMessageTime(m));
          const name = roleName(m.role);
          const text = m.content || "";
          lines.push(`[${t}] ${name}：${text}`);
          lines.push("");
        }
        content = lines.join("\n");
        mimeType = "text/plain;charset=utf-8";
        ext = "txt";
      } else {
        const out = {
          type: "chat_log",
          sessionId: sessionId,
          sessionName: sessionName || "",
          exportedAt: new Date().toISOString(),
          messageCount: messages.length,
          messages: messages.map((m) => ({
            role: m.role,
            roleName: roleName(m.role),
            content: m.content || "",
            timestamp: getMessageTime(m),
            timeText: formatTime(getMessageTime(m)),
          })),
        };
        content = JSON.stringify(out, null, 2);
        mimeType = "application/json";
        ext = "json";
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (sessionName || "聊天记录").replace(/[\\/:*?"<>|]/g, "_");
      a.download = `${safeName}_聊天记录_${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /* ========== 导入（宽松兼容多种格式） ========== */
    function importLexicon(callback) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.style.display = "none";
      document.body.appendChild(input);
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) {
          document.body.removeChild(input);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          document.body.removeChild(input);
          try {
            let text = reader.result;
            // 去掉 BOM 头
            if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
            const data = JSON.parse(text);
            const intents = [];

            // 兼容多种顶层结构
            let rawIntents = [];
            if (Array.isArray(data)) rawIntents = data;
            else if (Array.isArray(data.intents)) rawIntents = data.intents;
            else if (Array.isArray(data.rules)) rawIntents = data.rules;
            else if (Array.isArray(data.data)) rawIntents = data.data;
            else if (Array.isArray(data.词库)) rawIntents = data.词库;
            else {
              for (const k of Object.keys(data)) {
                if (Array.isArray(data[k])) {
                  rawIntents = data[k];
                  break;
                }
              }
            }

            for (const it of rawIntents) {
              if (!it || typeof it !== "object") continue;
              const patterns =
                it.patterns ||
                it.triggers ||
                it.trigger ||
                it.keywords ||
                it.ask ||
                it.问 ||
                it.input ||
                it.question ||
                [];
              const responses =
                it.responses ||
                it.reply ||
                it.replies ||
                it.answer ||
                it.answers ||
                it.答 ||
                it.output ||
                [];
              const patArr = Array.isArray(patterns) ? patterns : patterns ? [String(patterns)] : [];
              const resArr = Array.isArray(responses) ? responses : responses ? [String(responses)] : [];
              if (patArr.length === 0) continue;
              // 导入时也过滤代码内容
              const patText = patArr.join(" ");
              const resText = resArr.join(" ");
              if (isCodeLike(patText) || isCodeLike(resText)) continue;
              intents.push({
                id: genId(),
                name: it.name || it.tag || String(patArr[0]).slice(0, 20),
                patterns: patArr.filter((p) => p && String(p).trim()).map(String),
                responses: resArr.filter((r) => r && String(r).trim()).map(String),
                matchMode: "contains",
              });
            }

            if (intents.length === 0) {
              callback(new Error("未识别到有效的词库条目"));
              return;
            }
            callback(null, {
              intents,
              defaultResponse: data.defaultResponse || "我没太听懂，能换个说法吗？",
            });
          } catch (err) {
            callback(err);
          }
        };
        reader.onerror = () => {
          document.body.removeChild(input);
          callback(new Error("文件读取失败"));
        };
        reader.readAsText(file);
      };
      // 必须挂载后再 click
      setTimeout(() => {
        input.click();
      }, 0);
    }

    /* ========== 匹配测试 ========== */
    function matchIntent(text, intent) {
      const t = text.toLowerCase();
      if (intent.matchMode === "exact") return intent.patterns.some((p) => p.toLowerCase() === t);
      if (intent.matchMode === "regex") {
        return intent.patterns.some((p) => {
          try {
            return new RegExp(p, "i").test(text);
          } catch (e) {
            return false;
          }
        });
      }
      return intent.patterns.some((p) => t.includes(p.toLowerCase()));
    }

    /* ========== UI 管理浮层 ========== */
    function openLexiconModal() {
      ctx.ui.openModal((el, { close }) => {
        let lexicon = loadLexicon();
        let sessions = [];
        try {
          sessions = ctx.data.sessions.list();
        } catch (e) {}

        el.style.cssText =
          "width:680px;max-height:82vh;display:flex;flex-direction:column;font-family:system-ui,sans-serif;background:#fff;border-radius:12px;overflow:hidden;";

        const style = document.createElement("style");
        style.textContent = `
          .lb-header{padding:14px 18px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;background:#fafbfc;}
          .lb-title{font-size:16px;font-weight:600;margin:0;}
          .lb-close{background:none;border:none;font-size:20px;cursor:pointer;color:#999;padding:2px 8px;border-radius:4px;}
          .lb-close:hover{color:#333;background:#f0f0f0;}
          .lb-body{flex:1;overflow-y:auto;padding:14px 18px;}
          .lb-stats{display:flex;gap:8px;margin-bottom:12px;}
          .lb-stat{flex:1;background:#f7f8fa;border-radius:8px;padding:10px 6px;text-align:center;}
          .lb-stat-num{font-size:22px;font-weight:700;color:#333;}
          .lb-stat-label{font-size:11px;color:#999;margin-top:2px;}
          .lb-extract-row{display:flex;gap:8px;margin-bottom:10px;}
          .lb-extract-btn{flex:1;padding:10px 8px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer;font-size:13px;text-align:center;transition:all .15s;}
          .lb-extract-btn:hover{border-color:#4a90d9;color:#4a90d9;background:#f0f7ff;}
          .lb-extract-btn.active{border-color:#4a90d9;color:#4a90d9;background:#e8f2ff;box-shadow:0 0 0 2px rgba(74,144,217,.2);}
          .lb-generate-row{display:flex;gap:8px;margin:10px 0 14px;}
          .lb-generate-btn{flex:1;padding:11px;border-radius:8px;border:none;background:linear-gradient(135deg,#4a90d9,#357abd);color:#fff;cursor:pointer;font-size:14px;font-weight:600;}
          .lb-generate-btn:hover{background:linear-gradient(135deg,#3a7bc8,#2d6aa8);}
          .lb-generate-btn:disabled{opacity:.5;cursor:not-allowed;}
          .lb-extract-btn .lb-eb-title{font-weight:600;font-size:14px;margin-bottom:2px;}
          .lb-extract-btn .lb-eb-desc{font-size:11px;color:#999;}
          .lb-actions{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;}
          .lb-btn{padding:6px 12px;border-radius:6px;border:1px solid #ddd;background:#fff;cursor:pointer;font-size:12px;color:#333;}
          .lb-btn:hover{border-color:#4a90d9;color:#4a90d9;}
          .lb-btn-danger{color:#e74c3c;border-color:#e74c3c;}
          .lb-btn-danger:hover{background:#e74c3c;color:#fff;}
          .lb-session-select{width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;margin-bottom:8px;font-size:13px;background:#fff;}
          .lb-time-range{display:flex;gap:8px;margin-bottom:12px;align-items:center;}
          .lb-time-range label{font-size:12px;color:#666;white-space:nowrap;}
          .lb-time-range input{flex:1;padding:6px 8px;border:1px solid #ddd;border-radius:5px;font-size:12px;min-width:0;}
          .lb-time-range input:focus{outline:none;border-color:#4a90d9;}
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
          .lb-intent{border:1px solid #eee;border-radius:8px;margin-bottom:8px;overflow:hidden;}
          .lb-intent-header{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#fafbfc;cursor:pointer;}
          .lb-intent-name{font-weight:600;font-size:13px;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
          .lb-intent-meta{font-size:11px;color:#999;white-space:nowrap;}
          .lb-intent-body{padding:12px;border-top:1px solid #eee;display:none;}
          .lb-intent.open .lb-intent-body{display:block;}
          .lb-field{margin-bottom:10px;}
          .lb-field-label{font-size:11px;color:#666;margin-bottom:4px;font-weight:500;}
          .lb-input{width:100%;padding:6px 9px;border:1px solid #ddd;border-radius:5px;font-size:13px;box-sizing:border-box;}
          .lb-input:focus{outline:none;border-color:#4a90d9;}
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

        const header = document.createElement("div");
        header.className = "lb-header";
        const title = document.createElement("h3");
        title.className = "lb-title";
        title.textContent = "词库管理器";
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

        function escapeHtml(str) {
          const div = document.createElement("div");
          div.textContent = String(str);
          return div.innerHTML;
        }

        function updateFooter() {
          const tp = lexicon.intents.reduce((s, i) => s + i.patterns.length, 0);
          const tr = lexicon.intents.reduce((s, i) => s + i.responses.length, 0);
          footer.innerHTML = `<span>${lexicon.intents.length} 意图 · ${tp} 触发词 · ${tr} 回复</span><span>保存在插件本地</span>`;
        }

        // 时间范围输入框引用（提升到外层，供 doExtract 和导出按钮访问）
        let startTimeInput = null;
        let endTimeInput = null;
        function getTimeRange() {
          const s = startTimeInput && startTimeInput.value ? new Date(startTimeInput.value).getTime() : null;
          const e = endTimeInput && endTimeInput.value ? new Date(endTimeInput.value).getTime() : null;
          return { start: s, end: e };
        }
        // Date 转 datetime-local 格式
        function toDateTimeLocal(d) {
          const pad = (n) => String(n).padStart(2, "0");
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
        // 自动读取会话消息的最早/最晚时间并填充
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
              const minStr = toDateTimeLocal(new Date(minTs));
              startTimeInput.min = minStr;
              endTimeInput.min = minStr;
              startTimeInput.value = minStr;
            } else {
              startTimeInput.min = "";
              endTimeInput.min = "";
            }
            if (maxTs) {
              const maxStr = toDateTimeLocal(new Date(maxTs));
              startTimeInput.max = maxStr;
              endTimeInput.max = maxStr;
              endTimeInput.value = maxStr;
            } else {
              startTimeInput.max = "";
              endTimeInput.max = "";
            }
          } catch (e) {}
        }

        // 当前选中的提取模式（提升到外层，避免 render 后被重置）
        let selectedMode = "detailed";

        async function doExtract(mode) {
          const sid = body.querySelector("select")?.value || currentSessionId;
          if (!sid) {
            ctx.ui.toast("请先选择一个会话");
            return;
          }
          const label = mode === "simple" ? "简单" : mode === "detailed" ? "详细" : "精确";
          let t = ctx.ui.toast(`正在用「${label}」模式提取…`, { durationMs: 0 });
          try {
            let msgs = ctx.data.messages.list(sid);
            const tr = getTimeRange();
            if (tr.start || tr.end) {
              msgs = filterMessagesByTime(msgs, tr.start, tr.end);
            }
            const pairs = extractQAPairs(msgs);
            if (pairs.length === 0) {
              t.close();
              ctx.ui.toast("未找到问答对（需要用户消息+对方回复）");
              return;
            }
            let newLex;
            if (mode === "simple") newLex = buildSimple(pairs);
            else if (mode === "detailed") newLex = buildDetailed(pairs);
            else newLex = await buildPrecise(pairs, (cur, total) => {
              t.close();
              const nt = ctx.ui.toast(`AI 归纳中…第 ${cur}/${total} 批`, { durationMs: 0 });
              // 保存新 toast 引用，下一轮再关
              t = nt;
            });

            if (newLex.intents.length === 0) {
              t.close();
              ctx.ui.toast("未提取出有效意图");
              return;
            }
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
          updateFooter();

          const tp = lexicon.intents.reduce((s, i) => s + i.patterns.length, 0);
          const tr = lexicon.intents.reduce((s, i) => s + i.responses.length, 0);
          const stats = document.createElement("div");
          stats.className = "lb-stats";
          stats.innerHTML = `
            <div class="lb-stat"><div class="lb-stat-num">${lexicon.intents.length}</div><div class="lb-stat-label">意图</div></div>
            <div class="lb-stat"><div class="lb-stat-num">${tp}</div><div class="lb-stat-label">触发词</div></div>
            <div class="lb-stat"><div class="lb-stat-num">${tr}</div><div class="lb-stat-label">回复</div></div>
          `;
          body.appendChild(stats);

          // 会话选择
          if (sessions.length > 0) {
            const select = document.createElement("select");
            select.className = "lb-session-select";
            sessions.forEach((s, idx) => {
              const opt = document.createElement("option");
              opt.value = s.id;
              const sname = getSessionName(s);
              opt.textContent = (s.isGroup ? "[群聊] " : "") + sname;
              if (s.id === currentSessionId) opt.selected = true;
              select.appendChild(opt);
            });
            // 切换会话时自动更新时间范围
            select.onchange = () => {
              autoFillTimeRange(select.value);
            };
            body.appendChild(select);
          }

          // 时间范围选择（对词库提取和聊天记录导出都生效，不填=全部）
          const timeRange = document.createElement("div");
          timeRange.className = "lb-time-range";
          const labelStart = document.createElement("label");
          labelStart.textContent = "开始";
          startTimeInput = document.createElement("input");
          startTimeInput.type = "datetime-local";
          const labelEnd = document.createElement("label");
          labelEnd.textContent = "结束";
          endTimeInput = document.createElement("input");
          endTimeInput.type = "datetime-local";
          timeRange.appendChild(labelStart);
          timeRange.appendChild(startTimeInput);
          timeRange.appendChild(labelEnd);
          timeRange.appendChild(endTimeInput);
          body.appendChild(timeRange);

          // 自动填充当前会话的时间范围
          const initialSid = body.querySelector("select")?.value || currentSessionId;
          autoFillTimeRange(initialSid);

          // ===== 聊天记录导出区域（独立于词库） =====
          const chatExportBox = document.createElement("div");
          chatExportBox.className = "lb-chat-export";
          chatExportBox.innerHTML = `<div class="lb-chat-export-title">聊天记录导出（完整备份）</div>`;
          const exportRow = document.createElement("div");
          exportRow.className = "lb-chat-export-row";
          const formatGroup = document.createElement("div");
          formatGroup.className = "lb-format-group";
          let currentFormat = "txt";
          const btnFmtTxt = document.createElement("button");
          btnFmtTxt.className = "lb-format-btn active";
          btnFmtTxt.textContent = "TXT";
          btnFmtTxt.onclick = () => {
            currentFormat = "txt";
            btnFmtTxt.classList.add("active");
            btnFmtJson.classList.remove("active");
          };
          const btnFmtJson = document.createElement("button");
          btnFmtJson.className = "lb-format-btn";
          btnFmtJson.textContent = "JSON";
          btnFmtJson.onclick = () => {
            currentFormat = "json";
            btnFmtJson.classList.add("active");
            btnFmtTxt.classList.remove("active");
          };
          formatGroup.appendChild(btnFmtTxt);
          formatGroup.appendChild(btnFmtJson);
          const btnDoExport = document.createElement("button");
          btnDoExport.className = "lb-export-chat-btn";
          btnDoExport.textContent = "导出聊天记录";
          btnDoExport.onclick = () => {
            const selectEl = body.querySelector("select");
            const sid = selectEl?.value || currentSessionId;
            if (!sid) {
              ctx.ui.toast("请先选择一个会话");
              return;
            }
            let sname = "";
            if (selectEl && selectEl.selectedOptions[0]) {
              sname = selectEl.selectedOptions[0].textContent.replace(/^\[群聊\]\s*/, "");
            }
            try {
              const tr = getTimeRange();
              exportChatLog(sid, sname, currentFormat, tr.start, tr.end);
              ctx.ui.toast(`聊天记录已导出为 ${currentFormat.toUpperCase()}`);
            } catch (e) {
              ctx.ui.toast("导出失败：" + e.message);
            }
          };
          exportRow.appendChild(formatGroup);
          exportRow.appendChild(btnDoExport);
          chatExportBox.appendChild(exportRow);
          body.appendChild(chatExportBox);

          // 分隔线
          const divider = document.createElement("div");
          divider.className = "lb-section-divider";
          divider.textContent = "词库构建";
          body.appendChild(divider);

          // 三个模式选择按钮（先选后生成）
          const extractRow = document.createElement("div");
          extractRow.className = "lb-extract-row";

          const modeButtons = {};
          const modeConfigs = [
            { key: "simple", title: "简单", desc: "整句触发，1对1" },
            { key: "detailed", title: "详细", desc: "切分关键词，合并回复" },
            { key: "precise", title: "精确", desc: "AI语义归纳，质量高" },
          ];
          modeConfigs.forEach((cfg) => {
            const btn = document.createElement("button");
            btn.className = "lb-extract-btn" + (cfg.key === selectedMode ? " active" : "");
            btn.innerHTML = `<div class="lb-eb-title">${cfg.title}</div><div class="lb-eb-desc">${cfg.desc}</div>`;
            btn.onclick = () => {
              selectedMode = cfg.key;
              Object.values(modeButtons).forEach((b) => b.classList.remove("active"));
              btn.classList.add("active");
            };
            modeButtons[cfg.key] = btn;
            extractRow.appendChild(btn);
          });
          body.appendChild(extractRow);

          // 统一的生成按钮
          const generateRow = document.createElement("div");
          generateRow.className = "lb-generate-row";
          const btnGenerate = document.createElement("button");
          btnGenerate.className = "lb-generate-btn";
          btnGenerate.textContent = "生成词库";
          btnGenerate.onclick = () => {
            btnGenerate.disabled = true;
            btnGenerate.textContent = "生成中…";
            doExtract(selectedMode).finally(() => {
              btnGenerate.disabled = false;
              btnGenerate.textContent = "生成词库";
            });
          };
          generateRow.appendChild(btnGenerate);
          body.appendChild(generateRow);

          // 其他操作
          const actions = document.createElement("div");
          actions.className = "lb-actions";

          const btnExport = document.createElement("button");
          btnExport.className = "lb-btn";
          btnExport.textContent = "导出词库";
          btnExport.onclick = () => {
            if (lexicon.intents.length === 0) {
              ctx.ui.toast("词库为空");
              return;
            }
            exportLexicon(lexicon);
            ctx.ui.toast("词库已导出为 TXT");
          };
          actions.appendChild(btnExport);

          const btnImport = document.createElement("button");
          btnImport.className = "lb-btn";
          btnImport.textContent = "导入 JSON";
          btnImport.onclick = () => {
            importLexicon((err, data) => {
              if (err) {
                ctx.ui.toast("导入失败：" + err.message);
                return;
              }
              // 默认合并追加；想替换就先清空再导入
              lexicon.intents = [...lexicon.intents, ...data.intents];
              if (data.defaultResponse) lexicon.defaultResponse = data.defaultResponse;
              saveLexicon(lexicon);
              ctx.ui.toast(`导入成功：${data.intents.length} 个意图（已合并）`);
              render();
            });
          };
          actions.appendChild(btnImport);

          const btnAdd = document.createElement("button");
          btnAdd.className = "lb-btn";
          btnAdd.textContent = "+ 新增意图";
          btnAdd.onclick = () => {
            lexicon.intents.unshift({
              id: genId(),
              name: "新意图",
              patterns: [],
              responses: [],
              matchMode: "contains",
            });
            saveLexicon(lexicon);
            render();
          };
          actions.appendChild(btnAdd);

          const btnClear = document.createElement("button");
          btnClear.className = "lb-btn lb-btn-danger";
          btnClear.textContent = "清空";
          btnClear.onclick = () => {
            if (lexicon.intents.length === 0) return;
            if (confirm("确定清空所有词库？建议先导出备份。")) {
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
              <span class="lb-intent-meta">输入一句话测试命中结果</span>
            </div>
            <div class="lb-intent-body" style="display:block;padding:10px 12px;">
              <div class="lb-test-row">
                <input class="lb-input" id="lb-ti" placeholder="测试语句，如：你好" />
                <button class="lb-btn" id="lb-tb" style="white-space:nowrap;">测试</button>
              </div>
              <div class="lb-test-result" id="lb-tr"></div>
            </div>
          `;
          body.appendChild(testCard);
          const ti = testCard.querySelector("#lb-ti");
          const resultEl = testCard.querySelector("#lb-tr");
          testCard.querySelector("#lb-tb").onclick = runTest;
          ti.onkeydown = (e) => {
            if (e.key === "Enter") runTest();
          };
          function runTest() {
            const text = ti.value.trim();
            if (!text) {
              resultEl.classList.remove("show");
              return;
            }
            const hits = lexicon.intents.filter((it) => matchIntent(text, it));
            if (hits.length === 0) {
              resultEl.innerHTML = `<strong style="color:#e74c3c;">未命中</strong>，兜底回复：${escapeHtml(lexicon.defaultResponse)}`;
            } else {
              resultEl.innerHTML =
                `<div style="color:#27ae60;margin-bottom:5px;">命中 ${hits.length} 个意图</div>` +
                hits
                  .map((h) => {
                    const resp = h.responses.length > 0 ? h.responses[Math.floor(Math.random() * h.responses.length)] : "(无回复)";
                    return `<div style="margin-bottom:5px;"><strong>${escapeHtml(h.name)}</strong> → ${escapeHtml(resp)}</div>`;
                  })
                  .join("");
            }
            resultEl.classList.add("show");
          }

          // 意图列表
          if (lexicon.intents.length === 0) {
            const empty = document.createElement("div");
            empty.className = "lb-empty";
            empty.textContent = "词库为空 — 选择会话后点击上方「简单 / 详细 / 精确」开始提取";
            body.appendChild(empty);
            return;
          }

          lexicon.intents.forEach((intent, idx) => {
            const card = document.createElement("div");
            card.className = "lb-intent";

            const ih = document.createElement("div");
            ih.className = "lb-intent-header";
            ih.innerHTML = `
              <span class="lb-intent-name">${escapeHtml(intent.name)}</span>
              <span class="lb-intent-meta">${intent.patterns.length} 触发 · ${intent.responses.length} 回复</span>
            `;
            ih.onclick = () => card.classList.toggle("open");
            card.appendChild(ih);

            const ib = document.createElement("div");
            ib.className = "lb-intent-body";

            function refreshMeta() {
              ih.querySelector(".lb-intent-meta").textContent = `${intent.patterns.length} 触发 · ${intent.responses.length} 回复`;
            }

            // 名称
            const nf = document.createElement("div");
            nf.className = "lb-field";
            nf.innerHTML = `<div class="lb-field-label">意图名称</div>`;
            const ni = document.createElement("input");
            ni.className = "lb-input";
            ni.value = intent.name;
            ni.onchange = () => {
              intent.name = ni.value;
              saveLexicon(lexicon);
              ih.querySelector(".lb-intent-name").textContent = intent.name;
            };
            nf.appendChild(ni);
            ib.appendChild(nf);

            // 触发词
            const pf = document.createElement("div");
            pf.className = "lb-field";
            pf.innerHTML = `<div class="lb-field-label">触发词（点 × 删除，回车添加）</div>`;
            const pl = document.createElement("div");
            pl.className = "lb-tag-list";
            function rp() {
              pl.innerHTML = "";
              if (intent.patterns.length === 0) pl.innerHTML = '<span style="color:#bbb;font-size:12px;">暂无</span>';
              intent.patterns.forEach((p, pi) => {
                const tag = document.createElement("span");
                tag.className = "lb-tag";
                tag.innerHTML = `${escapeHtml(p)} <span class="lb-tag-remove">×</span>`;
                tag.querySelector(".lb-tag-remove").onclick = (e) => {
                  e.stopPropagation();
                  intent.patterns.splice(pi, 1);
                  saveLexicon(lexicon);
                  rp();
                  refreshMeta();
                };
                pl.appendChild(tag);
              });
            }
            rp();
            pf.appendChild(pl);
            const pa = document.createElement("div");
            pa.className = "lb-add-input";
            const pi2 = document.createElement("input");
            pi2.className = "lb-input";
            pi2.placeholder = "输入触发词，回车添加";
            pi2.onkeydown = (e) => {
              if (e.key === "Enter" && pi2.value.trim()) {
                const v = pi2.value.trim();
                if (!intent.patterns.includes(v)) intent.patterns.push(v);
                pi2.value = "";
                saveLexicon(lexicon);
                rp();
                refreshMeta();
              }
            };
            pa.appendChild(pi2);
            pf.appendChild(pa);
            ib.appendChild(pf);

            // 回复
            const rf = document.createElement("div");
            rf.className = "lb-field";
            rf.innerHTML = `<div class="lb-field-label">回复（每行一条，命中后随机选一条）</div>`;
            const rt = document.createElement("textarea");
            rt.className = "lb-textarea";
            rt.value = intent.responses.join("\n");
            rt.onchange = () => {
              intent.responses = rt.value.split("\n").map((s) => s.trim()).filter((s) => s);
              saveLexicon(lexicon);
              refreshMeta();
            };
            rf.appendChild(rt);
            ib.appendChild(rf);

            // 删除
            const db = document.createElement("button");
            db.className = "lb-btn lb-btn-danger";
            db.textContent = "删除此意图";
            db.onclick = (e) => {
              e.stopPropagation();
              if (confirm(`删除「${intent.name}」？`)) {
                lexicon.intents.splice(idx, 1);
                saveLexicon(lexicon);
                render();
              }
            };
            ib.appendChild(db);

            card.appendChild(ib);
            body.appendChild(card);
          });
        }

        render();
      });
    }

    /* ========== 入口 ========== */
    ctx.ui.slot("chat.inputToolbar", (el) => {
      el.innerHTML = "";
      const btn = document.createElement("button");
      btn.textContent = "词库";
      btn.title = "打开词库管理器";
      btn.style.cssText =
        "padding:5px 12px;border:1px solid #dcdfe6;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;color:#606266;margin:4px;";
      btn.onmouseenter = () => {
        btn.style.borderColor = "#4a90d9";
        btn.style.color = "#4a90d9";
      };
      btn.onmouseleave = () => {
        btn.style.borderColor = "#dcdfe6";
        btn.style.color = "#606266";
      };
      btn.onclick = openLexiconModal;
      el.appendChild(btn);
    });

    ctx.ui.slot("settings.section", (el) => {
      el.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.style.padding = "8px 0";
      const p = document.createElement("p");
      p.style.cssText = "font-size:13px;color:#666;margin:0 0 10px;";
      p.textContent = "从聊天记录提取规则词库，支持简单/详细/精确三档，可导入导出。";
      const btn = document.createElement("button");
      btn.textContent = "打开词库管理器";
      btn.style.cssText = "padding:8px 18px;border:1px solid #4a90d9;border-radius:6px;background:#4a90d9;color:#fff;cursor:pointer;font-size:14px;";
      btn.onclick = openLexiconModal;
      wrap.appendChild(p);
      wrap.appendChild(btn);
      el.appendChild(wrap);
    });
  },
};
//（注：内容由AI生成）
