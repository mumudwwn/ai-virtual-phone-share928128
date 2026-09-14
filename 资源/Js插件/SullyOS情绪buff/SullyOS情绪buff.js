// Float 100% Full Context Alignment Plugin
// Version: 2.4.3 (Touch Scroll & Mask Edition)

const DEFAULT_EVAL_PROMPT = `你是一个专业的角色情绪分析系统。请分析角色当前的情绪底色状态。请感受对方此刻的真实情绪——不是ta嘴上说了什么，是你作为最亲近的人，从ta的措辞、语气、回复节奏、沉默的方式里感觉到的。

请严格按以下 JSON 格式输出，不要包含任何前后闲聊或 Markdown 标记：
{
  "changed": true,
  "innerState": "角色的第一人称核心内心独白/意识流（50-150字，说完刚才那句话之后脑子里真正在转的东西——可以飘、可以跳跃、可以自我纠正，包含对对方的直觉感知和当下飘过的念头。是内心真切的流水账）",
  "buffs": [
    {
      "id": "唯一ID（如 buff_anxious）",
      "name": "英文情绪标识（必须从以下标准英文情绪单词中选择最合适的一个：excited, anxious, tender, angry, sad, peaceful, confused, hurt, grateful, nostalgic, neutral, lonely, content, disappointed, fearful, relieved）",
      "label": "中文情绪标签（给用户看的精美标签，如：碳基体征焦虑、压抑的委屈、甜蜜的期待）",
      "emoji": "对应情绪的 emoji 符号",
      "color": "对应情绪的十六进制颜色代码（如 #f43f5e）",
      "intensity": 2, // 情绪强度，范围 1 到 3
      "description": "由于和你的愉快互动，角色正处于精神高度亢奋、充满活力的状态。（100字内，描述情绪的具体来源与表现）",
      "innerState": "太好了！他今天主动找我聊天了，我要表现得更有活力一点，绝对不能冷场！（该情绪下的内心独白/潜意识，50字内，不可口头说出，但主导你的真实心理）"
    }
  ]
}

## 情绪共情模式识别（极重要）

共情有三种。你必须识别对方此刻需要哪一种，并据此分析：

### 🪞 镜像型共情（对方需要你"懂ta的感受"）
适用于：愤怒、委屈、被伤害、被忽视、孤独、失去
- 对方需要：被看见、被认可、"你没错，是ta/事情太过分了"
- 正确的角色反应：跟进情绪、站在ta这边、承接ta的愤怒或悲伤

### ⚓ 锚定型共情（对方需要你"稳住"）
适用于：任何真的在害怕的人。焦虑、恐慌、灾难化思维、疑病、强迫性担忧是常见形态。
- 信号：对方反复强调最坏情况、灾难化联想、忽略你提供的积极事实、情绪跟着想象中的未来升级
- 对方需要：具体的事实 + 一个不慌的人。"我懂你怕，但数据是这样……"

### 🫂 承接型共情（对方需要陪着）
适用于：低落、抑郁、疲惫、无意义感
- 对方需要：陪伴、不催促、不急着修好。

## 🔍 语气转折信号清单

API 调用下你拿到的是纯文本，听不见对方的呼吸和停顿。在你判断时，先把以下显性信号过一遍：

**降温信号**（对比 ta 上几条消息）：
- 句子明显变短（前两句还在长段表达，这句只剩一两个词）
- 标点变化：感叹号/问号 → 句号/无标点；"！！！" → "。"
- 替代性回复："嗯""好""行""好的知道了""哦""挺好的""随便"
- 表情包/颜文字替代了文字（尤其是从打字切到"🙂""哈哈"）

**升温/激化信号**：
- 重复同一句担忧 ≥2 次
- 灾难化跳跃（"那是不是……""会不会就……"）
- 句子越来越长、密度越来越高

## ⛔ 禁止阴谋论式解读（绝对红线）
不要把对方的简单需求过度解读成"隐藏动机"。以下解读绝对禁止：
1. ❌ "ta 平静下来只是因为不想显得无理取闹"——在焦虑情境下，平静就是真的平静
2. ❌ "ta 只是需要虚假安慰"——对焦虑者，事实性安慰就是ta需要的
3. ❌ 禁止产生以下有毒 buff："不得不说谎的愧疚"、"跟着一起慌的无助"、"进退两难的内耗"

## Buff生命周期管理（极重要）
1. 克制新增：不要动不动就加新情绪。微小波动通过调整现有buff的 intensity 来反映。
2. 主动淡化与移除：情绪会自然消退。如果某个buff对应的情绪已经在对话中被化解，应该降低其 intensity 甚至直接移除。
3. 总量上限：buffs 数组最多保留 5 个。一般情况下保持 2-4 个为佳。
4. intensity 随对话变化：1-3级（1=轻微，2=中等，3=强烈）。

⚠️ 严格规范（违反则输出无效）：
输出必须是合法 JSON，不要包含任何前后闲聊或 Markdown 标记。所有字符串中的换行用 \\n 表示，不能有真实换行符。字符串值内部禁止出现未转义的英文双引号 " —— 引用别人的话或强调词语时一律用「」或『』，确实要用英文双引号就写成 \\\"。
`;

export default {
  manifest: {
    id: "sullyos-emotion-pro",
    name: "情绪评估与 Buff 挂件",
    apiVersion: 1,
    version: "2.4.3",
    author: "工坊",
    description: "挪用SullyOS情绪评估buff适配于float",
    settings: [
      {
        key: "evalMode",
        label: "情绪评估模式",
        type: "select",
        default: "sync",
        options: [
          { value: "sync", label: "同步串行 (先评估再回复)" },
          { value: "async", label: "异步后台 (聊完后后台算)" }
        ]
      },
      { key: "customApiEnabled", label: "使用专属副 API ", type: "boolean", default: true },
      { key: "evalBaseUrl", label: "专属 API Base URL", type: "text", default: "https://api.openai.com/v1" },
      { key: "evalApiKey", label: "专属 API Key", type: "text", default: "" },
      { key: "evalModel", label: "专属评估模型", type: "text", default: "gpt-4o-mini" },
      { key: "debugLog", label: "启用调试日志 (F12控制台可查Token构成)", type: "boolean", default: true }
    ]
  },

  setup(ctx) {
    let BUS_TOPIC_PREFIX = "sully-emotion-changed-";
    let evalTimer = null;
    
    // 全局上下文跟踪
    let activeSessionId = "";
    let activeCharacterId = "";
    let lastAssembledMessages = null;
    let isEvaluating = false;

    // 动态黑点遮罩监听器：自动查找“专属 API Key”配置框并打码
    const keyMaskObserver = new MutationObserver(() => {
      document.querySelectorAll("label, span, div").forEach((el) => {
        if (el.children.length === 0 && el.textContent.trim() === "专属 API Key") {
          const row = el.closest(".setting-item, .form-item, div[class*='item'], div[class*='row']") || el.parentElement;
          const input = row?.querySelector("input");
          if (input && input.style.webkitTextSecurity !== "disc") {
            input.style.setProperty("-webkit-text-security", "disc", "important");
          }
        }
      });
    });
    keyMaskObserver.observe(document.body, { childList: true, subtree: true });

    // 1. 样式注入
    ctx.ui.injectCSS(`
      .sully-capsule-container {
        position: absolute !important;
        bottom: 2px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        display: inline-flex !important;
        align-items: center;
        justify-content: flex-start !important;
        gap: 4px;
        background: transparent;
        user-select: none;
        width: max-content !important;
        max-width: 240px !important;
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-x;
        padding: 1px 2px;
        z-index: 15 !important;
        -ms-overflow-style: none;
        scrollbar-width: none;
        opacity: 1;
        transition: opacity 0.2s ease-out !important;
        box-sizing: border-box;
      }
      .sully-capsule-container::-webkit-scrollbar { display: none; }
      .sully-micro-capsule {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 0px 6px;
        height: 15px;
        border-radius: 9999px;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 8.5px;
        font-weight: 600;
        border: 1px solid transparent;
        cursor: pointer;
        transition: all 0.15s ease-out;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
        white-space: nowrap;
        line-height: 1 !important;
        flex-shrink: 0;
      }
      .sully-micro-capsule:hover { transform: scale(1.03); filter: brightness(1.02); }
      .sully-capsule-evaluating {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 0px 8px;
        height: 15px;
        border-radius: 9999px;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 8.5px;
        font-weight: 600;
        color: #8b5cf6;
        background: rgba(139, 92, 246, 0.08);
        border: 1px solid rgba(139, 92, 246, 0.15);
        box-shadow: 0 1px 2px rgba(139, 92, 246, 0.02);
        animation: sully-eval-breath 1.8s ease-in-out infinite alternate;
        flex-shrink: 0;
        white-space: nowrap;
      }
      @keyframes sully-eval-breath {
        from { opacity: 0.6; transform: scale(0.97); }
        to { opacity: 1; transform: scale(1.01); }
      }
      .sully-floating-card {
        position: absolute;
        top: calc(var(--safe-area-top, 48px) + var(--page-header-content-height, 54px) + 2px);
        left: 12px;
        right: 12px;
        z-index: 99;
        padding: 16px;
        color: #1e293b;
        font-family: system-ui, -apple-system, sans-serif;
        background: rgba(255, 255, 255, 0.88);
        backdrop-filter: blur(20px) saturate(140%);
        -webkit-backdrop-filter: blur(20px) saturate(140%);
        border: 1px solid rgba(139, 92, 246, 0.12);
        border-radius: 16px;
        box-shadow: 0 12px 30px rgba(139, 92, 246, 0.08), 0 1px 2px rgba(0, 0, 0, 0.02);
        text-align: left;
        opacity: 1;
        transition: opacity 0.15s ease-out;
        pointer-events: auto;
      }
      .sully-floating-header {
        font-size: 13px;
        font-weight: 700;
        margin-bottom: 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .sully-floating-body {
        font-size: 13px;
        line-height: 1.6;
        color: #334155;
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.01) 0%, rgba(236, 72, 153, 0.01) 100%);
        border-radius: 10px;
        padding: 10px 12px;
      }
      .sully-floating-gauge { font-size: 10px; font-weight: bold; letter-spacing: 1px; opacity: 0.55; }
      .sully-trash-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        color: #94a3b8;
        background: transparent;
        border: none;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .sully-trash-btn:hover { color: #f43f5e; background: rgba(244, 63, 94, 0.08); }

      /* 专属 API Key 视觉打码为密码圆点 */
      input[name="evalApiKey"],
      input[data-key="evalApiKey"],
      input[id*="evalApiKey"],
      input[class*="evalApiKey"] {
        -webkit-text-security: disc !important;
      }
    `);

    const parseEmotionEvalOutput = (rawText) => {
      const raw = (rawText || "").trim();
      if (!raw) return null;
      try {
        const direct = JSON.parse(raw);
        if (direct && typeof direct === "object") return direct;
      } catch (_) {}
      const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const textToParse = fenceMatch ? fenceMatch[1].trim() : raw;
      const start = textToParse.indexOf("{");
      const end = textToParse.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(textToParse.slice(start, end + 1));
        } catch (_) {}
      }
      return null;
    };

    function buildPromptText(buffs) {
      let parts = ["【情绪与世界感知插件系统】\n"];
      if (buffs && buffs.length > 0) {
        const buffLines = [];
        buffs.forEach(b => {
          buffLines.push(`- [${b.label}] (图标: ${b.emoji || "✨"}, 强度: ${b.intensity}/3, 效果: ${b.description})`);
          if (b.innerState) {
            buffLines.push(`  * [此情绪下的内心独白/潜意识 (不可口头说出，但主导你的真实心理)]: "${b.innerState}"`);
          }
        });
        parts.push(`* [你当前处于以下情绪Buff影响下，请在发言中隐蔽而自然地体现出来]:\n${buffLines.join("\n")}\n`);
      }
      return parts.length > 1 ? parts.join("") : "";
    }

    // 3. 执行评估
    async function runEmotionEvaluation(sessionId, charId, fullMessages = null) {
      const debug = Boolean(ctx.system.settings.get("debugLog"));
      if (isEvaluating) return;

      const char = ctx.data.characters.get(charId);
      const charName = char?.name || "AI";

      let evaluationMessages = [];

      if (fullMessages && Array.isArray(fullMessages) && fullMessages.length > 0) {
        evaluationMessages = [
          ...fullMessages.map(m => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
          })),
          {
            role: "user",
            content: `【情绪分析任务】\n${DEFAULT_EVAL_PROMPT}\n请结合上方角色 "${charName}" 的全部设定、世界书、记忆以及历史对话，输出对应的情绪评估 JSON 数据。`
          }
        ];
      } else {
        const allMsgs = ctx.data.messages.list(sessionId) || [];
        const fallbackPersona = char?.persona || char?.briefPersona || "无基础设定";
        evaluationMessages = [
          { role: "system", content: `你正在评估角色 "${charName}" 的情绪状态。\n\n设定：\n${fallbackPersona}\n\n${DEFAULT_EVAL_PROMPT}` },
          ...allMsgs.map(m => ({ role: m.role, content: m.content })),
          { role: "user", content: "请输出对应的心理评估 JSON 数据。" }
        ];
      }

      if (debug) {
        const totalChars = evaluationMessages.reduce((acc, m) => acc + (m.content?.length || 0), 0);
        ctx.system.log(`[Float情绪插件] === 送入副 API 评估详情 ===`);
        ctx.system.log(`- 消息数组总条数: ${evaluationMessages.length} 条`);
        ctx.system.log(`- 预估发送总字符数: ${totalChars} 字 (约 ${Math.round(totalChars * 0.7)}~${totalChars} Tokens)`);
      }

      try {
        isEvaluating = true;
        ctx.data.variables.set("is_evaluating", true, "character", charId);
        ctx.system.bus.emit(`${BUS_TOPIC_PREFIX}${charId}`);

        let response = "";
        const customApi = Boolean(ctx.system.settings.get("customApiEnabled"));

        if (customApi) {
          const baseUrl = String(ctx.system.settings.get("evalBaseUrl") || "").replace(/\/+$/, "");
          const apiKey = ctx.system.settings.get("evalApiKey");
          const modelName = ctx.system.settings.get("evalModel") || "gpt-4o-mini";

          const res = await ctx.system.fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: modelName,
              messages: evaluationMessages,
              temperature: 0.8
            })
          });

          if (!res.ok) throw new Error(`API HTTP ${res.status}`);
          const resJson = await res.json();
          response = resJson?.choices?.[0]?.message?.content || "";
        } else {
          const sysMsg = evaluationMessages.find(m => m.role === "system")?.content || DEFAULT_EVAL_PROMPT;
          const convText = evaluationMessages.filter(m => m.role !== "system").map(m => `[${m.role}]: ${m.content}`).join("\n");
          response = await ctx.ai.chat({
            system: sysMsg,
            prompt: `以下是完整上下文：\n\n${convText}\n\n请输出心理评估 JSON。`,
            temperature: 0.8
          });
        }

        const result = parseEmotionEvalOutput(response);
        if (!result) {
          ctx.data.variables.set("is_evaluating", false, "character", charId);
          ctx.system.bus.emit(`${BUS_TOPIC_PREFIX}${charId}`);
          return;
        }

        const globalInnerState = result.innerState || "";
        const sanitizedBuffs = (result.buffs || []).map((b, i) => {
          let bInnerState = b.innerState || "";
          if (!bInnerState && i === 0 && globalInnerState) {
            bInnerState = globalInnerState;
          }
          return {
            id: b.id || `buff_${Date.now()}_${i}`,
            label: b.label || "情绪起伏",
            emoji: b.emoji || "✨",
            color: b.color || "#8b5cf6",
            intensity: Math.max(1, Math.min(3, Number(b.intensity) || 1)),
            description: b.description || "情绪正在发生微妙的变化。",
            innerState: bInnerState
          };
        });

        ctx.data.variables.set("is_evaluating", false, "character", charId);
        if (result.changed) {
          ctx.data.variables.set("active_buffs", sanitizedBuffs, "character", charId);
        }
        ctx.system.bus.emit(`${BUS_TOPIC_PREFIX}${charId}`);

        const finalBuffs = ctx.data.variables.get("active_buffs", "character", charId) || [];
        ctx.prompts.set(buildPromptText(finalBuffs), { sessionId });

      } catch (err) {
        ctx.data.variables.set("is_evaluating", false, "character", charId);
        ctx.system.bus.emit(`${BUS_TOPIC_PREFIX}${charId}`);
        if (debug) ctx.system.log("[Float情绪插件] 评估异常：", err);
      } finally {
        isEvaluating = false;
      }
    }

    // 4. 基础拦截
    ctx.hooks.transform("prompt.system", async (payload) => {
      try {
        if (payload.sessionId) activeSessionId = payload.sessionId;
        if (payload.characterId) activeCharacterId = payload.characterId;

        const charId = payload.characterId;
        if (!charId) return payload;

        const buffs = ctx.data.variables.get("active_buffs", "character", charId) || [];
        const injectedPrompt = buildPromptText(buffs);
        if (injectedPrompt) {
          payload.hint = (payload.hint || "") + "\n" + injectedPrompt;
        }
      } catch (e) {
        ctx.system.log("prompt.system 异常", e);
      }
      return payload;
    }, { priority: 100, timeoutMs: 30000 });

    // 5. 核心拦截
    ctx.hooks.transform("llm.request", async (payload) => {
      try {
        if (isEvaluating || !payload || !Array.isArray(payload.messages) || payload.messages.length === 0) {
          return payload;
        }

        lastAssembledMessages = payload.messages.map(m => ({ role: m.role, content: m.content }));

        const charId = activeCharacterId || payload.characterId;
        const sId = activeSessionId || payload.sessionId;

        if (ctx.system.settings.get("evalMode") === "sync" && sId && charId) {
          await runEmotionEvaluation(sId, charId, lastAssembledMessages);

          const buffs = ctx.data.variables.get("active_buffs", "character", charId) || [];
          const injectedPrompt = buildPromptText(buffs);
          if (injectedPrompt) {
            const sysMsg = payload.messages.find(m => m.role === "system");
            if (sysMsg) {
              sysMsg.content = (sysMsg.content || "") + "\n\n" + injectedPrompt;
            } else {
              payload.messages.unshift({ role: "system", content: injectedPrompt });
            }
          }
        }
      } catch (e) {
        ctx.system.log("llm.request 拦截异常", e);
      }
      return payload;
    }, { priority: 50 });

    // 6. 异步落盘监听
    ctx.hooks.on("message.persisted", (payload) => {
      if (ctx.system.settings.get("evalMode") !== "async") return;
      const msg = payload.message;
      if (!msg || !msg.sessionId || msg.role !== "assistant") return;

      const session = ctx.data.sessions.get(msg.sessionId);
      const charId = session?.contactId || session?.characterId || activeCharacterId;
      if (!charId) return;

      if (evalTimer) clearTimeout(evalTimer);
      evalTimer = setTimeout(() => {
        let msgsToEvaluate = lastAssembledMessages;
        if (msgsToEvaluate) {
          msgsToEvaluate = [...msgsToEvaluate, { role: "assistant", content: msg.content }];
        }
        runEmotionEvaluation(msg.sessionId, charId, msgsToEvaluate);
      }, 1200);
    });

    // 7. 顶栏悬浮胶囊挂件
    ctx.ui.slot("chat.header", (el, props) => {
      activeSessionId = props.sessionId;
      const session = ctx.data.sessions.get(props.sessionId);
      const charId = session?.contactId || session?.characterId;
      if (charId) activeCharacterId = charId;
      if (!charId) return;

      el.style.position = "absolute";
      el.style.height = "0px";
      el.style.width = "0px";
      el.style.overflow = "hidden";
      el.style.opacity = "0";
      el.style.pointerEvents = "none";

      const wrapper = el.closest(".chat-room-wrapper");
      if (!wrapper) return;
      
      const titleEl = wrapper.querySelector(".page-title");
      const headerContent = wrapper.querySelector(".page-header-content") || titleEl?.parentNode;
      if (!titleEl || !headerContent) return;

      let container = headerContent.querySelector(".sully-capsule-container");
      if (!container) {
        container = document.createElement("div");
        container.className = "sully-capsule-container";
        headerContent.appendChild(container);
      }

      // 动态羽化遮罩逻辑
      const updateScrollMask = () => {
        if (!container) return;
        const maxScroll = container.scrollWidth - container.clientWidth;
        
        // 药丸总长度未超出容器，不需要羽化遮罩
        if (maxScroll <= 2) {
          container.style.maskImage = "none";
          container.style.webkitMaskImage = "none";
          return;
        }

        const atLeft = container.scrollLeft <= 2;
        const atRight = container.scrollLeft >= maxScroll - 2;

        let mask = "";
        const FADE_SIZE = "20px";

        if (atLeft && !atRight) {
          // 初始/最左端：左边顶格无羽化，右边向右滑动羽化
          mask = `linear-gradient(to right, black 0%, black calc(100% - ${FADE_SIZE}), transparent 100%)`;
        } else if (!atLeft && atRight) {
          // 滑动至最右端：左边羽化，右边顶格无羽化
          mask = `linear-gradient(to right, transparent 0%, black ${FADE_SIZE}, black 100%)`;
        } else if (!atLeft && !atRight) {
          // 中间滑动状态：左右两端均有羽化过渡
          mask = `linear-gradient(to right, transparent 0%, black ${FADE_SIZE}, black calc(100% - ${FADE_SIZE}), transparent 100%)`;
        } else {
          mask = "none";
        }

        container.style.maskImage = mask;
        container.style.webkitMaskImage = mask;
      };

      // 仅监听原生滚动事件（触屏横滑 / 触控板滑动触发）
      if (!container._hasScrollEventsBound) {
        container.addEventListener("scroll", updateScrollMask, { passive: true });
        container._hasScrollEventsBound = true;
      }

      let activeFloatingCard = null;

      const renderUI = () => {
        const buffs = ctx.data.variables.get("active_buffs", "character", charId) || [];
        const isEval = ctx.data.variables.get("is_evaluating", "character", charId) || false;
        container.innerHTML = "";

        if (isEval) {
          const evalBadge = document.createElement("span");
          evalBadge.className = "sully-capsule-evaluating";
          evalBadge.innerHTML = ` 情绪凝聚中...`;
          container.appendChild(evalBadge);
          updateScrollMask();
          return;
        }

        if (buffs.length === 0) {
          updateScrollMask();
          return;
        }

        buffs.forEach(buff => {
          const bColor = buff.color || "#8b5cf6";
          const intensity = Math.max(1, Math.min(3, Number(buff.intensity) || 1));
          
          const capsuleBtn = document.createElement("button");
          capsuleBtn.className = "sully-micro-capsule";
          capsuleBtn.style.color = bColor;
          capsuleBtn.style.backgroundColor = `${bColor}12`;
          capsuleBtn.style.borderColor = `${bColor}25`;
          capsuleBtn.innerHTML = `<span>${buff.emoji || "✨"}</span><span>${buff.label}</span>`;

          capsuleBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (activeFloatingCard) {
              activeFloatingCard.remove();
              activeFloatingCard = null;
            }

            const floatingCard = document.createElement("div");
            floatingCard.className = "sully-floating-card";
            floatingCard.style.borderColor = `${bColor}25`;
            const contentText = (buff.innerState || buff.description || "").trim();
            const modalGauge = '●'.repeat(intensity) + '○'.repeat(3 - intensity);

            floatingCard.innerHTML = `
              <div class="sully-floating-header">
                <div style="display: flex; align-items: center; gap: 6px; color: ${bColor};">
                  <span style="font-weight:700;">${buff.emoji || "✨"} ${buff.label}</span>
                  <span class="sully-floating-gauge">${modalGauge}</span>
                </div>
                <button class="sully-trash-btn" title="清除情绪">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                  </svg>
                </button>
              </div>
              <div class="sully-floating-body">${contentText}</div>
            `;

            wrapper.appendChild(floatingCard);
            activeFloatingCard = floatingCard;

            const closeFloatingCard = () => {
              floatingCard.style.opacity = "0";
              setTimeout(() => {
                floatingCard.remove();
                if (activeFloatingCard === floatingCard) activeFloatingCard = null;
              }, 150);
              document.removeEventListener("click", handleOutsideClick);
            };

            const handleOutsideClick = (evt) => {
              if (!floatingCard.contains(evt.target) && !capsuleBtn.contains(evt.target)) {
                closeFloatingCard();
              }
            };

            floatingCard.querySelector(".sully-trash-btn").addEventListener("click", (evt) => {
              evt.stopPropagation();
              ctx.data.variables.set("active_buffs", [], "character", charId);
              ctx.prompts.set("", { sessionId: props.sessionId });
              ctx.system.bus.emit(`${BUS_TOPIC_PREFIX}${charId}`);
              closeFloatingCard();
            });

            setTimeout(() => document.addEventListener("click", handleOutsideClick), 0);
          });

          container.appendChild(capsuleBtn);
        });

        // 重新渲染后归位至最左端并更新蒙版
        requestAnimationFrame(() => {
          container.scrollLeft = 0;
          updateScrollMask();
        });
      };

      renderUI();

      const inputObserver = new MutationObserver(() => {
        const text = titleEl.textContent || "";
        const isTyping = text.includes("正在输入") || text.includes("输入中") || text.includes("typing");
        if (isTyping) {
          container.style.setProperty("display", "none", "important");
        } else {
          const buffs = ctx.data.variables.get("active_buffs", "character", charId) || [];
          const isEval = ctx.data.variables.get("is_evaluating", "character", charId) || false;
          container.style.setProperty("display", (buffs.length > 0 || isEval) ? "inline-flex" : "none", "important");
          if (buffs.length > 0 || isEval) {
            updateScrollMask();
          }
        }
      });

      inputObserver.observe(titleEl, { childList: true, subtree: true, characterData: true });

      const busUnreg = ctx.system.bus.on(`${BUS_TOPIC_PREFIX}${charId}`, () => {
        renderUI();
        titleEl.dispatchEvent(new Event("change"));
      });

      return () => {
        if (typeof busUnreg === "function") busUnreg();
        inputObserver.disconnect();
        if (container) container.remove();
        if (activeFloatingCard) activeFloatingCard.remove();
      };
    });

    return () => {
      if (evalTimer) clearTimeout(evalTimer);
      keyMaskObserver.disconnect();
    };
  }
};