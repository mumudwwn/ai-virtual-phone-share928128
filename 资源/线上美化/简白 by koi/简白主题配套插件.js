export default {
  manifest: {
    id: "koi-thought-avatar",
    name: "简白主题配套插件",
    apiVersion: 1,
    version: "2.5.0",
    author: "koi",
    description: "适配内心活动头像、头像单击操作与语音引用预览。",
    permissions: ["chat.read", "chat.write", "ui"],
  },
  setup(ctx) {
    const fallback = "https://img.remit.ee/i/LTIFiVQK7rcd";
    const avatarKey = "--koi-thought-avatar";
    const avatarClickStates = new Map();
    let voiceQuotePending = false;
    let quoteBarSeen = false;
    let frame = 0;

    const previousMessageRow = element => {
      let row = element.previousElementSibling;
      while (row && !row.classList.contains("chat-msg-wrapper")) row = row.previousElementSibling;
      return row;
    };

    const applyAvatars = () => {
      document.querySelectorAll(".chat-thought-card").forEach(card => {
        const row = previousMessageRow(card);
        const image = row?.querySelector(".chat-msg-avatar img");
        const source = image?.currentSrc || image?.getAttribute("src") || fallback;
        card.style.setProperty(avatarKey, `url(${JSON.stringify(source)})`);
        card.dataset.koiThoughtAvatar = "";
      });
    };

    const getAvatar = target => target instanceof Element
      ? target.closest('.chat-msg-wrapper[data-role="assistant"] .chat-msg-avatar > div')
      : null;
    const clearAvatarClick = avatar => {
      const state = avatarClickStates.get(avatar);
      if (state?.singleTimer) window.clearTimeout(state.singleTimer);
      if (state?.doubleFallback) window.clearTimeout(state.doubleFallback);
      avatarClickStates.delete(avatar);
    };
    const handleAvatarClick = event => {
      const avatar = getAvatar(event.target);
      if (!avatar) return;
      const pending = avatarClickStates.get(avatar);
      if (pending?.singleTimer) {
        window.clearTimeout(pending.singleTimer);
        pending.singleTimer = 0;
        pending.doubleFallback = window.setTimeout(() => {
          pending.doubleFallback = 0;
          avatar.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, view: window }));
          avatarClickStates.delete(avatar);
        }, 60);
        return;
      }
      if (pending?.doubleFallback) return;
      const heart = avatar.closest('.chat-msg-wrapper')?.querySelector('button.chat-monologue-heart');
      if (!heart) return;
      const state = { singleTimer: 0, doubleFallback: 0 };
      state.singleTimer = window.setTimeout(() => {
        avatarClickStates.delete(avatar);
        heart.click();
      }, 180);
      avatarClickStates.set(avatar, state);
    };
    const handleAvatarDoubleClick = event => {
      const avatar = getAvatar(event.target);
      if (avatar) clearAvatarClick(avatar);
    };

    const findMessage = (sessionId, messageId) => sessionId && messageId
      ? ctx.data.messages.list(sessionId).find(message => message.id === messageId)
      : null;
    const findMessageAnywhere = messageId => {
      for (const session of ctx.data.sessions.list()) {
        const message = findMessage(session.id, messageId);
        if (message) return message;
      }
      return null;
    };
    const isAudioQuote = message => {
      const target = findMessage(message?.sessionId, message?.mediaData?.quoteMessageId);
      return target?.mediaType === "audio";
    };
    const applyVoiceQuotes = () => {
      const bar = document.querySelector(".chat-quote-bar");
      if (bar) {
        quoteBarSeen = true;
        if (voiceQuotePending) bar.dataset.koiVoiceQuote = "";
        else delete bar.dataset.koiVoiceQuote;
      } else if (quoteBarSeen) {
        voiceQuotePending = false;
        quoteBarSeen = false;
      }
      document.querySelectorAll(".chat-quote-message:not(:has(.chat-quote-preview))").forEach(quote => {
        const messageId = quote.closest("[data-msg-id]")?.dataset.msgId;
        const message = messageId ? findMessageAnywhere(messageId) : null;
        if (!message || !isAudioQuote(message)) return;
        const preview = document.createElement("div");
        preview.className = "chat-quote-preview koi-voice-quote-preview";
        preview.textContent = "语音";
        quote.prepend(preview);
      });
    };
    const applyOfflineMenuItem = () => {
      const menu = document.querySelector(".chat-plus-menu");
      const offline = document.querySelector(".chat-offline-toggle");
      if (!menu || !offline || menu.querySelector(".koi-offline-menu-item")) return;
      const template = Array.from(menu.children).find(item => item.textContent?.trim() === "位置") || menu.children[9];
      if (!template) return;
      const item = template.cloneNode(true);
      item.classList.add("koi-offline-menu-item");
      const label = item.querySelector("span:last-child");
      if (label) label.textContent = "线下模式";
      item.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        offline.click();
      }, { once: true });
      menu.append(item);
    };
    const handleQuoteClick = event => {
      const button = event.target instanceof Element ? event.target.closest("button") : null;
      if (!button) return;
      if (button.closest(".chat-quote-bar")) {
        voiceQuotePending = false;
        schedule();
        return;
      }
      if (!button.classList.contains("ctx-menu-btn") || button.textContent?.trim() !== "引用") return;
      voiceQuotePending = !!button.closest(".chat-msg-wrapper")?.querySelector(".voice-msg-bubble");
      schedule();
    };

    const offQuotePersist = ctx.hooks.transform("message.beforePersist", payload => {
      const message = payload.message;
      if (message.mediaType === "quote" && !message.mediaData?.quotePreview && isAudioQuote(message)) {
        message.mediaData = { ...message.mediaData, quotePreview: "语音" };
      }
      return payload;
    });

    const refresh = () => {
      frame = 0;
      applyAvatars();
      applyVoiceQuotes();
      applyOfflineMenuItem();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(refresh);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["src"] });
    window.addEventListener("resize", schedule);
    document.addEventListener("click", handleAvatarClick);
    document.addEventListener("click", handleQuoteClick);
    document.addEventListener("dblclick", handleAvatarDoubleClick);
    schedule();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      document.removeEventListener("click", handleAvatarClick);
      document.removeEventListener("click", handleQuoteClick);
      document.removeEventListener("dblclick", handleAvatarDoubleClick);
      avatarClickStates.forEach(state => {
        if (state.singleTimer) window.clearTimeout(state.singleTimer);
        if (state.doubleFallback) window.clearTimeout(state.doubleFallback);
      });
      avatarClickStates.clear();
      offQuotePersist();
      if (frame) cancelAnimationFrame(frame);
      document.querySelectorAll("[data-koi-thought-avatar]").forEach(element => {
        element.style.removeProperty(avatarKey);
        delete element.dataset.koiThoughtAvatar;
      });
      document.querySelectorAll(".koi-offline-menu-item").forEach(element => element.remove());
    };
  },
};
