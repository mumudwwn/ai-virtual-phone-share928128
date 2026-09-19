export default {
  manifest: {
    id: "message-time-delta",
    name: "时间流逝啦",
    apiVersion: 1,
    version: "1.0.1",
    author: "koi",
    description: "在原聊天上下文的每次用户发送和每次完整 AI 回复前临时添加紧凑的 [Δ时间] 标签。",
    permissions: ["chat.read"],
  },

  setup(ctx) {
    const instruction = "消息前的[Δ时间]表示它距离上一条逻辑消息经过的真实时间；同一次AI回复拆出的多个气泡属于一条逻辑消息。";
    const taggedPrefix = /\[Δ(?:\d+d)?(?:\d+h)?(?:\d+m)?(?:\d+s)?\]\s*$/;

    function timestamp(value) {
      const parsed = typeof value === "number" ? value : Date.parse(value || "");
      return Number.isFinite(parsed) ? parsed : null;
    }

    function formatDelta(milliseconds) {
      let seconds = Math.max(0, Math.floor(milliseconds / 1000));
      const days = Math.floor(seconds / 86400);
      seconds %= 86400;
      const hours = Math.floor(seconds / 3600);
      seconds %= 3600;
      const minutes = Math.floor(seconds / 60);
      seconds %= 60;
      return `${days ? `${days}d` : ""}${hours ? `${hours}h` : ""}${minutes ? `${minutes}m` : ""}${seconds || (!days && !hours && !minutes) ? `${seconds}s` : ""}`;
    }

    function assistantBatchKey(message) {
      if (message.role !== "assistant") return "";
      if (message.responseBatchId) return `batch:${message.responseBatchId}`;
      if (message.responseRoundId) {
        return `round:${message.responseRoundId}:character:${message.senderCharacterId || "unknown"}`;
      }
      return "";
    }

    function buildTurns(messages) {
      const turns = [];
      for (const message of messages) {
        if (message.role !== "user" && message.role !== "assistant") continue;
        const createdAt = timestamp(message.createdAt);
        if (createdAt === null) continue;

        const batchKey = assistantBatchKey(message);
        const previous = turns[turns.length - 1];
        if (batchKey && previous?.role === "assistant" && previous.batchKey === batchKey) {
          if (typeof message.content === "string" && message.content.trim()) {
            previous.candidates.push(message.content.trim());
          }
          continue;
        }

        turns.push({
          role: message.role,
          batchKey,
          createdAt,
          candidates: typeof message.content === "string" && message.content.trim()
            ? [message.content.trim()]
            : [],
        });
      }
      return turns;
    }

    function textSlots(messages) {
      const slots = [];
      messages.forEach((message, messageIndex) => {
        const debug = message?._debugMeta;
        const isHistory = debug?._fromHistory === true || /History \[\d+\]/.test(String(debug?.marker || ""));
        if (!isHistory) return;

        if (typeof message.content === "string") {
          slots.push({
            role: message.role,
            get: () => message.content,
            set: value => { messages[messageIndex] = { ...message, content: value }; message = messages[messageIndex]; },
          });
          return;
        }

        if (!Array.isArray(message.content)) return;
        message.content.forEach((part, partIndex) => {
          if (part?.type !== "text" || typeof part.text !== "string") return;
          slots.push({
            role: message.role,
            get: () => messages[messageIndex].content[partIndex].text,
            set: value => {
              const parts = messages[messageIndex].content.map((item, index) => index === partIndex ? { ...item, text: value } : item);
              messages[messageIndex] = { ...messages[messageIndex], content: parts };
            },
          });
        });
      });
      return slots;
    }

    function addInstruction(messages) {
      if (messages.some(message => typeof message.content === "string" && message.content.includes(instruction))) return;
      const index = messages.findIndex(message => message.role === "system" && typeof message.content === "string");
      if (index >= 0) {
        messages[index] = { ...messages[index], content: `${messages[index].content}\n\n${instruction}`.trim() };
      } else {
        messages.unshift({ role: "system", content: instruction });
      }
    }

    function injectDeltas(payload) {
      if (!payload.sessionId || !Array.isArray(payload.messages) || !["chat", "group_chat"].includes(payload.purpose)) return payload;

      const storedMessages = ctx.data.messages.list(payload.sessionId);
      const turns = buildTurns(storedMessages);
      if (turns.length === 0) return payload;

      const messages = payload.messages.map(message => ({ ...message }));
      const slots = textSlots(messages);
      let slotIndex = 0;
      let offset = 0;
      let tagged = 0;

      turns.forEach((turn, turnIndex) => {
        const previous = turns[turnIndex - 1];
        const delta = previous ? turn.createdAt - previous.createdAt : 0;
        const tag = `[Δ${formatDelta(delta)}] `;

        for (let index = slotIndex; index < slots.length; index += 1) {
          const slot = slots[index];
          if (slot.role !== turn.role) continue;
          const text = slot.get();
          const start = index === slotIndex ? offset : 0;
          const matches = turn.candidates
            .map(candidate => ({ candidate, position: text.indexOf(candidate, start) }))
            .filter(match => match.position >= 0)
            .sort((a, b) => a.position - b.position || b.candidate.length - a.candidate.length);
          if (matches.length === 0) continue;

          const match = matches[0];
          const before = text.slice(0, match.position);
          if (!taggedPrefix.test(before)) {
            slot.set(`${before}${tag}${text.slice(match.position)}`);
            offset = match.position + tag.length + match.candidate.length;
            tagged += 1;
          } else {
            offset = match.position + match.candidate.length;
          }
          slotIndex = index;
          return;
        }
      });

      if (tagged > 0) addInstruction(messages);
      payload.messages = messages;
      return payload;
    }

    return ctx.hooks.transform("llm.request", injectDeltas, { priority: 50 });
  },
};
