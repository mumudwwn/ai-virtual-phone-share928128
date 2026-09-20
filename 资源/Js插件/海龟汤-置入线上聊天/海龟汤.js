export default {
  manifest: {
    id: "turtle-soup",
    name: "海龟汤",
    apiVersion: 1,
    version: "2.0.1",
    author: "koi",
    description: "在单聊或群聊中由角色主持海龟汤，并用题目卡片和汤底卡片展示一轮游戏。",
    permissions: ["chat.read", "chat.write", "ui", "storage"],
  },

  setup(ctx) {
    const STORAGE_KEY = "games";
    const PENDING_KEY = "pendingStarts";
    const REVEAL_KEY = "pendingReveals";
    const STAGED_KEY = "stagedQuestions";
    const CARD_KIND = "turtle-soup-card";
    const CARD_SENTINEL = "TURTLE_SOUP_CARD_READY_6F2A";

    const readGames = () => ctx.system.storage.get(STORAGE_KEY) || {};
    const writeGames = games => ctx.system.storage.set(STORAGE_KEY, games);
    const readPending = () => ctx.system.storage.get(PENDING_KEY) || {};
    const getPending = sessionId => readPending()[sessionId] || null;
    const setPending = (sessionId, host) => {
      const pending = readPending();
      pending[sessionId] = { id: host.id, name: host.name };
      ctx.system.storage.set(PENDING_KEY, pending);
    };
    const clearPending = sessionId => {
      const pending = readPending();
      if (!(sessionId in pending)) return;
      delete pending[sessionId];
      ctx.system.storage.set(PENDING_KEY, pending);
    };
    const queueReveal = (sessionId, reason) => {
      const pending = ctx.system.storage.get(REVEAL_KEY) || {};
      pending[sessionId] = reason;
      ctx.system.storage.set(REVEAL_KEY, pending);
    };
    const getReveal = sessionId => (ctx.system.storage.get(REVEAL_KEY) || {})[sessionId] || "";
    const takeReveal = sessionId => {
      const pending = ctx.system.storage.get(REVEAL_KEY) || {};
      const reason = pending[sessionId];
      if (!reason) return "";
      delete pending[sessionId];
      ctx.system.storage.set(REVEAL_KEY, pending);
      return reason;
    };
    const stageQuestion = (sessionId, host, puzzle) => {
      const staged = ctx.system.storage.get(STAGED_KEY) || {};
      staged[sessionId] = { host: { id: host.id, name: host.name }, puzzle };
      ctx.system.storage.set(STAGED_KEY, staged);
      clearPending(sessionId);
    };
    const takeStagedQuestion = sessionId => {
      const staged = ctx.system.storage.get(STAGED_KEY) || {};
      const question = staged[sessionId] || null;
      if (!question) return null;
      delete staged[sessionId];
      ctx.system.storage.set(STAGED_KEY, staged);
      return question;
    };
    const clean = value => String(value || "").trim();

    function sessionCharacters(session) {
      if (!session) return [];
      const ids = session.isGroup ? (session.participantIds || []) : [session.contactId];
      return ids.map(id => ctx.data.characters.get(id)).filter(Boolean);
    }

    function chooseHost(sessionId, text = "") {
      const session = ctx.data.sessions.get(sessionId);
      const characters = sessionCharacters(session);
      if (!characters.length) return null;
      const named = characters.find(character => character.name && text.includes(character.name));
      return named || characters[Math.floor(Math.random() * characters.length)];
    }

    function looksLikeStart(text) {
      return /(海龟汤|乌龟汤|情境推理|猜汤|玩汤)/i.test(text)
        && /(玩|来|开|开始|出题|主持|一局|一个|一道|换题|再来)/.test(text);
    }

    function wantsReveal(text) {
      return /(放弃|不想玩|不玩了|结束这局|结束本轮)/.test(text)
        || /(?:看|要|说|告诉|公布|揭晓|给我).{0,10}(?:汤底|真相)/.test(text)
        || /(?:汤底|真相).{0,8}(?:是什么|看看|告诉|公布|揭晓)/.test(text)
        || /(公布答案|告诉我答案|直接.{0,6}答案|答案是什么)/.test(text);
    }

    function isClearlySolved(text) {
      if (/(不完全正确|还没答对|没有猜对|不是正解|정답이\s*아니|아직.{0,8}정답|not\s+(?:quite\s+)?correct)/i.test(text)) return false;
      return /(完全正确|完全答对|答对了|猜对了|正解|정답입니다|정답이에요|정답이야|맞혔|맞췄|exactly\s+right|correct\s+answer)/i.test(text);
    }

    function extractPuzzle(text) {
      const begin = text.indexOf("<<<TURTLE_TITLE>>>");
      if (begin < 0) return null;
      const endMarker = "<<<TURTLE_END>>>";
      const endAt = text.indexOf(endMarker, begin);
      const block = text.slice(begin, endAt < 0 ? text.length : endAt + endMarker.length);
      const match = block.match(/<<<TURTLE_TITLE>>>\s*([\s\S]*?)\s*<<<TURTLE_SURFACE>>>\s*([\s\S]*?)\s*<<<TURTLE_ANSWER>>>\s*([\s\S]*?)\s*<<<TURTLE_END>>>/);
      return {
        text: `${text.slice(0, begin)}${endAt < 0 ? "" : text.slice(endAt + endMarker.length)}`.trim(),
        puzzle: match ? { title: clean(match[1]), surface: clean(match[2]), answer: clean(match[3]) } : null,
      };
    }

    function stripRevealTags(text) {
      let reason = "";
      const stripped = text.replace(/<turtle-soup-reveal(?:\s+reason=["']([^"']*)["'])?\s*\/?>(?:\s*<\/turtle-soup-reveal>)?/gi, (_, value) => {
        reason ||= clean(value);
        return "";
      });
      const brokenAt = stripped.search(/<turtle-soup-reveal\b/i);
      return {
        text: (brokenAt < 0 ? stripped : stripped.slice(0, brokenAt)).trim(),
        found: stripped !== text || brokenAt >= 0,
        reason,
      };
    }

    function pushCard(sessionId, host, kind, data) {
      const isQuestion = kind === "question";
      const card = ctx.data.messages.push({
        sessionId,
        role: "assistant",
        content: isQuestion
          ? `【海龟汤·汤面】${data.title}\n${data.surface}`
          : `【海龟汤·汤底】${data.title}\n${data.answer}`,
        mediaType: `plugin:${CARD_KIND}`,
        mediaData: {
          turtleSoupKind: kind,
          turtleSoupTitle: data.title,
          turtleSoupSurface: data.surface,
          turtleSoupAnswer: isQuestion ? undefined : data.answer,
          turtleSoupReason: data.reason,
          turtleSoupHost: host.name,
        },
        senderCharacterId: host.id,
        senderName: host.name,
      });
      window.dispatchEvent(
        new CustomEvent("chat-messages-updated", { detail: { sessionId } }),
      );
      return card;
    }

    function activateGame(sessionId, host, puzzle, questionMessageId) {
      const games = readGames();
      games[sessionId] = {
        status: "active",
        hostId: host.id,
        hostName: host.name,
        ...puzzle,
        questionMessageId,
        turnCount: 0,
        startedAt: Date.now(),
      };
      writeGames(games);
      clearPending(sessionId);
    }

    function revealGame(sessionId, reason) {
      const games = readGames();
      const game = games[sessionId];
      if (!game || game.status === "ended") return;
      const host = ctx.data.characters.get(game.hostId) || { id: game.hostId, name: game.hostName };
      game.status = "ended";
      game.revealReason = reason || "revealed";
      delete game.restoredAfterDelete;
      writeGames(games);
      const card = pushCard(sessionId, host, "answer", { ...game, reason: game.revealReason });
      game.answerMessageId = card.id;
      writeGames(games);
    }

    function reconcileGame(sessionId) {
      const games = readGames();
      const game = games[sessionId];
      if (!game) return "none";
      let restored = false;
      const messages = ctx.data.messages.list(sessionId);
      const questionIndex = messages.findIndex(message => message.id === game.questionMessageId);
      if (questionIndex < 0) {
        delete games[sessionId];
        writeGames(games);
        clearPending(sessionId);
        takeReveal(sessionId);
        takeStagedQuestion(sessionId);
        return "cleared";
      }
      if (game.status === "ended" && !messages.some(message => message.id === game.answerMessageId)) {
        game.status = "active";
        game.restoredAfterDelete = true;
        restored = true;
        delete game.answerMessageId;
        delete game.revealReason;
      }
      if (game.status !== "ended") {
        game.status = "active";
        game.turnCount = messages.slice(questionIndex + 1).filter(message => message.role === "user").length;
      }
      writeGames(games);
      return restored ? "restored" : "unchanged";
    }

    function reasonLabel(reason) {
      if (reason === "solved") return "推理成功";
      if (reason === "give-up") return "玩家放弃";
      return "汤底揭晓";
    }

    function element(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    ctx.ui.injectCSS(`
      .chat-msg-wrapper:has([data-chat-plugin-kind="turtle-soup-card"]){justify-content:center!important;gap:0!important}
      .chat-msg-wrapper:has([data-chat-plugin-kind="turtle-soup-card"])>.chat-msg-avatar{display:none!important}
      .chat-msg-wrapper:has([data-chat-plugin-kind="turtle-soup-card"])>.chat-msg-content-wrap{width:100%;max-width:100%!important;align-items:center!important}
      body .chat-msg-wrapper:has([data-chat-plugin-kind="turtle-soup-card"]) .chat-msg-content-wrap>.chat-group-sender-name{display:none!important;visibility:hidden!important;height:0!important;margin:0!important}
      .chat-msg-wrapper:has([data-chat-plugin-kind="turtle-soup-card"]) [data-msg-id]:has([data-chat-plugin-kind="turtle-soup-card"]){padding:0!important;background:transparent!important;box-shadow:none!important;overflow:visible!important}
      .koi-ts-card{width:min(320px,calc(100vw - 88px));overflow:hidden;color:#2C3440;background:#FFFFFF;border:1px solid #E0E0E0;border-radius:16px;box-shadow:0 5px 16px rgba(44,52,64,.06);font-family:inherit}
      .koi-ts-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 15px;background:#F4F5F6;border-bottom:1px dashed #C9CDD2}
      .koi-ts-brand{display:flex;align-items:center;gap:9px;color:#2C3440;font-size:12px;font-weight:650;letter-spacing:.04em}
      .koi-ts-icon{display:grid;place-items:center;width:26px;height:26px;color:#FFFFFF;background:#7A7C80;border-radius:8px;font-size:11px;font-weight:700;line-height:1}
      .koi-ts-state{flex:none;padding:4px 9px;color:#797E85;background:#ECEEEF;border-radius:999px;font-size:10px}
      .koi-ts-card.is-answer .koi-ts-state{color:#FFFFFF;background:#7A7C80}
      .koi-ts-body{padding:16px}.koi-ts-title{margin:0 0 10px;color:#2C3440;font-size:17px;line-height:1.4;font-weight:700}
      .koi-ts-text{margin:0;color:#4A4A4A;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.75}
      .koi-ts-answer-label{margin:16px 0 8px;padding-top:13px;color:#797E85;border-top:1px dashed #C9CDD2;font-size:11px;font-weight:600;letter-spacing:.04em}
      .koi-ts-card.is-answer .koi-ts-text:last-child{padding:12px;color:#2C3440;background:#F4F5F6;border-radius:12px}
      .koi-ts-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 15px;color:#A0A3A8;background:#FFFFFF;border-top:1px dashed #C9CDD2;font-size:10px}
      @media (max-width:380px){.koi-ts-head,.koi-ts-body,.koi-ts-foot{padding-left:13px;padding-right:13px}}
    `);

    ctx.ui.messageKind(CARD_KIND, (container, message) => {
      const data = message.mediaData || {};
      const isAnswer = data.turtleSoupKind === "answer";
      const card = element("article", `koi-ts-card${isAnswer ? " is-answer" : ""}`);
      card.setAttribute("aria-label", isAnswer ? "海龟汤汤底" : "海龟汤题目");

      const head = element("header", "koi-ts-head");
      const brand = element("div", "koi-ts-brand");
      brand.append(element("span", "koi-ts-icon", isAnswer ? "底" : "汤"), element("span", "", isAnswer ? "海龟汤 · 汤底" : "海龟汤 · 汤面"));
      head.append(brand, element("span", "koi-ts-state", isAnswer ? reasonLabel(data.turtleSoupReason) : "推理中"));

      const body = element("div", "koi-ts-body");
      body.append(element("h3", "koi-ts-title", data.turtleSoupTitle || "未命名谜题"));
      if (isAnswer) {
        body.append(element("p", "koi-ts-text", data.turtleSoupSurface || ""));
        body.append(element("div", "koi-ts-answer-label", "真正发生的是"));
        body.append(element("p", "koi-ts-text", data.turtleSoupAnswer || ""));
      } else {
        body.append(element("p", "koi-ts-text", data.turtleSoupSurface || ""));
      }

      const foot = element("footer", "koi-ts-foot");
      foot.append(
        element("span", "", `主持人 · ${data.turtleSoupHost || message.senderName || "角色"}`),
        element("span", "", isAnswer ? "本轮结束" : "请开始提问"),
      );
      card.append(head, body, foot);
      container.replaceChildren(card);
    });

    ctx.hooks.transform("user.beforeSend", payload => {
      const games = readGames();
      const game = games[payload.sessionId];
      const startRequested = looksLikeStart(payload.text);
      if (!startRequested && getPending(payload.sessionId)) clearPending(payload.sessionId);
      if (game && game.status !== "ended" && getReveal(payload.sessionId) && !wantsReveal(payload.text)) takeReveal(payload.sessionId);
      if (game && game.status !== "ended") {
        game.turnCount = (game.turnCount || 0) + 1;
        writeGames(games);
      }
      if (game && game.status !== "ended" && wantsReveal(payload.text)) {
        queueReveal(payload.sessionId, "give-up");
        ctx.ui.toast("将在消息发送后揭晓汤底");
        return payload;
      }
      if (!startRequested) return payload;
      const host = chooseHost(payload.sessionId, payload.text);
      if (host) {
        setPending(payload.sessionId, host);
        ctx.ui.toast(`海龟汤插件已触发 · ${host.name}主持`);
      }
      return payload;
    });

    ctx.hooks.on("message.persisted", ({ message }) => {
      if (message.role !== "assistant") return;
      if (message.mediaData?.turtleSoupQuestionPending) {
        ctx.system.timers.setTimeout(() => {
          const staged = takeStagedQuestion(message.sessionId);
          if (!staged) return;
          const card = pushCard(message.sessionId, staged.host, "question", staged.puzzle);
          activateGame(message.sessionId, staged.host, staged.puzzle, card.id);
        }, 0);
      }
      const game = readGames()[message.sessionId];
      const session = ctx.data.sessions.get(message.sessionId);
      if (!game || game.status === "ended" || (session?.isGroup && message.senderCharacterId !== game.hostId)) return;
      const queuedReason = getReveal(message.sessionId);
      if (!queuedReason || (queuedReason === "solved" && !isClearlySolved(message.content))) return;
      ctx.system.timers.setTimeout(() => {
        const reason = takeReveal(message.sessionId);
        if (reason) revealGame(message.sessionId, reason);
      }, 0);
    });

    ctx.hooks.on("message.deleted", ({ sessionId }) => {
      if (!sessionId) return;
      const result = reconcileGame(sessionId);
      if (result === "restored") ctx.ui.toast("汤底已删除，本轮恢复为推理中");
    });

    ctx.hooks.on("session.opened", ({ sessionId }) => {
      reconcileGame(sessionId);
    });

    ctx.hooks.transform("prompt.system", payload => {
      const session = ctx.data.sessions.get(payload.sessionId);
      if (!session) return payload;
      const games = readGames();
      const game = games[payload.sessionId];
      const participationProtocol = session.isGroup
        ? "只有主持人知道秘密汤底；群聊中的其他角色必须把上面的‘秘密汤底’视为不可见信息，只能根据聊天中已经公开的线索推理，不能利用、暗示或复述秘密信息。\n群聊中的非主持角色在前三轮每人最多提出一个局部的是非问题，禁止给出完整事件链、抢答或声称猜中；三轮后也只能基于公开线索逐步猜测，不能直接照搬汤底。最终是否猜中只由主持人判断。"
        : "这是单聊。角色只在当前对话中主持、回答和给提示，不得声称把提示或题目发送到了其他会话。";
      const gameProtocol = game && game.status !== "ended" ? `
【当前海龟汤】
主持人：${game.hostName}
汤面：${game.surface}
秘密汤底：${game.answer}
本轮尚未结束，当前是第 ${game.turnCount || 0} 轮提问。
${participationProtocol}
${game.restoredAfterDelete ? "汤底卡片已被删除，本轮已回退到揭晓前；忽略历史中关于本轮已结束或完全正确的表述，继续主持。" : ""}
主持人根据汤底回答玩家的问题，优先使用“是 / 不是 / 无关 / 部分正确”，必要时可补一句不泄底的提示。
如果玩家已基本还原真相，由主持人祝贺并附加 <turtle-soup-reveal reason="solved" />。
如果玩家明确索要汤底或放弃，由主持人回应并附加 <turtle-soup-reveal reason="give-up" />。
除此以外绝不输出 reveal 标签，也绝不在可见文字中直接说出汤底。` : "";
      if (!gameProtocol) return payload;
      payload.hint = `${payload.hint || ""}\n\n${gameProtocol}`.trim();
      return payload;
    });

    ctx.hooks.transform("llm.request", payload => {
      if (!payload.sessionId || !["chat", "group_chat"].includes(payload.purpose)) return payload;
      const host = getPending(payload.sessionId);
      const storedGame = readGames()[payload.sessionId];
      const game = storedGame?.status === "ended" ? null : storedGame;
      if (!host && !game) return payload;
      const session = ctx.data.sessions.get(payload.sessionId);
      const participationRule = session?.isGroup
        ? "群聊中只有主持人可以判断答案；其他角色必须假装不知道汤底，前三轮每人最多问一个局部的是非问题，禁止直接还原完整答案或抢答。"
        : "这是单聊；只在当前对话中主持、回答和给提示，不得声称把内容发送到了其他会话。";
      const instruction = host
        ? `\n\n[海龟汤插件强制输出协议]\n当前用户消息已经触发海龟汤插件。由「${host.name}」主持。若当前聊天提供“搜索”或等价的互联网搜索工具，必须先由「${host.name}」调用它搜索已有的高质量海龟汤题目及可靠汤底，再从结果中选取一题；工具不可用或调用失败时才自行创作。不要在最终可见回复中提及搜索过程或来源。汤面不能泄露答案，汤底必须完整解释汤面。${session?.isGroup ? `群聊只能由「${host.name}」发言，并保留 [${host.name}]: 前缀。` : ""}\n取得题目后，先用符合角色口吻和当前聊天语言的一句话宣布题目准备好了，然后严格原样输出以下标记；标记之间只写对应文字，禁止翻译、代码块或额外说明：\n<<<TURTLE_TITLE>>>\n简短题名\n<<<TURTLE_SURFACE>>>\n展示给玩家的谜面\n<<<TURTLE_ANSWER>>>\n完整汤底\n<<<TURTLE_END>>>`
        : `\n\n[海龟汤主持协议]\n你正在主持海龟汤。${participationRule}正常回复玩家并判断其推理：如果已经完全正确，必须在回复末尾原样附加 <turtle-soup-reveal reason="solved" />；如果玩家明确索要汤底或放弃，必须附加 <turtle-soup-reveal reason="give-up" />。未结束时禁止输出该标签，也不能泄露汤底。`;
      for (let index = payload.messages.length - 1; index >= 0; index -= 1) {
        const message = payload.messages[index];
        if (message.role !== "user") continue;
        if (typeof message.content === "string") message.content += instruction;
        else if (Array.isArray(message.content)) {
          const textPart = message.content.find(part => part?.type === "text" && typeof part.text === "string");
          if (textPart) textPart.text += instruction;
          else message.content.push({ type: "text", text: instruction });
        }
        break;
      }
      return payload;
    }, { priority: 100 });

    ctx.hooks.transform("llm.response", payload => {
      if (!payload.sessionId || typeof payload.text !== "string") return payload;
      const pendingHost = getPending(payload.sessionId);
      const generated = pendingHost ? extractPuzzle(payload.text) : null;
      if (generated) {
        if (generated.puzzle?.title && generated.puzzle.surface && generated.puzzle.answer) {
          stageQuestion(payload.sessionId, pendingHost, generated.puzzle);
          const session = ctx.data.sessions.get(payload.sessionId);
          const intro = generated.text || "题目准备好了，开始提问吧。";
          payload.text = session?.isGroup && !intro.trimStart().startsWith(`[${pendingHost.name}]:`)
            ? `[${pendingHost.name}]: ${intro}\n${CARD_SENTINEL}`
            : `${intro}\n${CARD_SENTINEL}`;
          return payload;
        } else {
          clearPending(payload.sessionId);
          ctx.ui.toast("角色没有按格式完成出题，请再试一次");
        }
      } else if (pendingHost) {
        clearPending(payload.sessionId);
        ctx.ui.toast("海龟汤插件已触发，但角色没有返回题目格式，请再试一次");
      }
      const game = readGames()[payload.sessionId];
      if (!game || game.status === "ended") return payload;
      const reveal = stripRevealTags(generated?.text ?? payload.text);
      if (reveal.found || isClearlySolved(reveal.text)) {
        queueReveal(payload.sessionId, reveal.reason || "solved");
      }
      payload.text = reveal.text;
      return payload;
    });

    ctx.hooks.transform("message.beforePersist", payload => {
      const message = payload.message;
      if (message.role !== "assistant" || !message.content?.includes(CARD_SENTINEL)) return payload;
      message.content = message.content.replace(CARD_SENTINEL, "").trim() || "题目准备好了，开始提问吧。";
      message.mediaData = { ...(message.mediaData || {}), turtleSoupQuestionPending: true };
      return payload;
    });

    ctx.ui.messageAction({
      id: "end-turtle-soup",
      label: "结束并查看汤底",
      filter: message => {
        if (message.mediaType !== `plugin:${CARD_KIND}` || message.mediaData?.turtleSoupKind !== "question") return false;
        const game = readGames()[message.sessionId];
        return game?.status !== "ended" && game?.questionMessageId === message.id;
      },
      onSelect: (message, { toast }) => {
        if (!readGames()[message.sessionId]) return;
        revealGame(message.sessionId, "give-up");
        toast("汤底已揭晓");
      },
    });
  },
};
