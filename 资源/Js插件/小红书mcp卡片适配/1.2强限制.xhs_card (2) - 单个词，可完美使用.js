export default {
  manifest: {
    id: "xhs-real-card",
    name: "小红书真·流光卡片",
    apiVersion: 1,
    version: "10.0.0",
    author: "SullyOS x Customized",
    description: "高拟真小红书图文流卡片，支持多链接自动解析、骨架微光与深度交互",
    permissions: ["chat.read"],
    settings: [
      { key: "mcpUrl", label: "MCP 地址 (如 https://xxx.vercel.app/api/xhs-mcp)(https://xxx.netlify/functions/xhs-mcp)", type: "text", default: "" }
    ]
  },

  setup(ctx) {
    const XHS_REGEX_GLOBAL = /(https?:\/\/(?:www\.)?(?:xiaohongshu\.com\/(?:explore|discovery\/item)\/[a-zA-Z0-9]+(?:\?[^\s"'<>]+)?|xhslink\.(?:cn|com)\/[a-zA-Z0-9_/?&=]+))/gi;

    // 1. 注入小红书专属高拟真现代卡片样式
    ctx.ui.injectCSS(`
      .xhs-card-container {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin: 6px 0;
        width: 100%;
        max-width: 320px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .xhs-card-box {
        position: relative;
        background: #ffffff;
        border-radius: 14px;
        overflow: hidden;
        border: 1px solid rgba(0, 0, 0, 0.06);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02);
        text-decoration: none;
        display: block;
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;
        -webkit-tap-highlight-color: transparent;
      }
      .xhs-card-box:active {
        transform: scale(0.975);
      }
      .xhs-card-body {
        display: flex;
        padding: 12px;
        gap: 12px;
        align-items: center;
      }
      .xhs-card-content {
        flex: 1;
        min-width: 0;
      }
      .xhs-card-title {
        font-size: 13.5px;
        font-weight: 600;
        color: #222222;
        line-height: 1.42;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        word-break: break-all;
      }
      .xhs-card-author {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 11.5px;
        color: #666666;
        margin-top: 5px;
      }
      .xhs-card-stats {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 10.5px;
        color: #999999;
        margin-top: 6px;
      }
      .xhs-card-cover {
        width: 68px;
        height: 68px;
        border-radius: 9px;
        background: #f6f7f9;
        flex-shrink: 0;
        overflow: hidden;
        position: relative;
      }
      .xhs-card-cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .xhs-card-footer {
        border-top: 1px solid #f8f8f9;
        background: #fafafa;
        padding: 6px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .xhs-badge-brand {
        display: inline-flex;
        align-items: center;
        gap: 4.5px;
      }
      .xhs-brand-icon {
        width: 14px;
        height: 14px;
        background: #ff2442;
        border-radius: 3.5px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 8.5px;
        color: #fff;
        font-weight: 900;
        line-height: 1;
      }
      .xhs-brand-text {
        font-size: 10.5px;
        font-weight: 500;
        color: #888888;
      }
      .xhs-open-action {
        font-size: 10.5px;
        color: #ff2442;
        font-weight: 500;
      }
      /* 骨架屏流光效果 */
      @keyframes xhsShimmer {
        0% { background-position: -200px 0; }
        100% { background-position: calc(200px + 100%) 0; }
      }
      .xhs-loading-skeleton {
        background: linear-gradient(90deg, #f0f0f2 25%, #e6e6e8 50%, #f0f0f2 75%);
        background-size: 200px 100%;
        animation: xhsShimmer 1.4s infinite ease-in-out;
      }
    `);

    function fmtNum(n) {
      if (!n && n !== 0) return "0";
      const num = Number(n);
      if (num >= 10000) return (num / 10000).toFixed(1) + "w";
      if (num >= 1000) return (num / 1000).toFixed(1) + "k";
      return String(num);
    }

    function buildSingleCard(data) {
      const mcpBase = (ctx.system.settings.get("mcpUrl") || "").trim().replace(/\/+$/, '');
      const coverUrl = data.coverUrl ? `${mcpBase}?img=${encodeURIComponent(data.coverUrl)}` : "";
      const title = data.title || "小红书精彩笔记";
      const author = data.author || "红薯星人";
      const targetUrl = data.link || "";

      // 状态 A: 骨架屏载入态
      if (data.loading) {
        return `
          <div class="xhs-card-box" style="pointer-events:none;">
            <div class="xhs-card-body">
              <div class="xhs-card-content">
                <div class="xhs-loading-skeleton" style="height:14px;border-radius:4px;width:82%;margin-bottom:6px;"></div>
                <div class="xhs-loading-skeleton" style="height:12px;border-radius:4px;width:45%;margin-bottom:8px;"></div>
                <div class="xhs-loading-skeleton" style="height:10px;border-radius:4px;width:60%;"></div>
              </div>
              <div class="xhs-card-cover xhs-loading-skeleton"></div>
            </div>
            <div class="xhs-card-footer">
              <span class="xhs-badge-brand">
                <span class="xhs-brand-icon">红</span>
                <span class="xhs-brand-text">小红书</span>
              </span>
              <span style="font-size:10px;color:#bbb;">正在同步真实笔记数据...</span>
            </div>
          </div>
        `;
      }

      // 状态 B: 捕获到凭空造假的链接或解析异常态
      if (data.error) {
        return `
          <a href="${targetUrl}" target="_blank" rel="noopener noreferrer" class="xhs-card-box" style="border-color:#ffe3e6;background:#fffafb;">
            <div class="xhs-card-body" style="padding:10px 12px;">
              <div class="xhs-card-content">
                <div style="font-size:12.5px;font-weight:600;color:#c0271f;line-height:1.4;">${title}</div>
                <div style="font-size:11px;color:#e0646c;margin-top:2px;">${data.error}</div>
              </div>
              <div class="xhs-brand-icon" style="width:28px;height:28px;font-size:14px;border-radius:6px;">红</div>
            </div>
          </a>
        `;
      }

      // 状态 C: 满血完整卡片
      return `
        <a href="${targetUrl}" target="_blank" rel="noopener noreferrer" class="xhs-card-box">
          <div class="xhs-card-body">
            <div class="xhs-card-content">
              <div class="xhs-card-title">${title}</div>
              <div class="xhs-card-author">
                <span style="color:#ff2442;font-size:11px;line-height:1;">✦</span>
                <span style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">@${author}</span>
              </div>
              <div class="xhs-card-stats">
                <span>♡ ${fmtNum(data.likedCount)}</span>
                <span>💬 ${fmtNum(data.commentCount)}</span>
                <span>⭐ ${fmtNum(data.collectedCount)}</span>
              </div>
            </div>
            <div class="xhs-card-cover">
              ${coverUrl 
                ? `<img src="${coverUrl}" loading="lazy" onerror="this.parentElement.style.background='#f0f0f2';this.style.display='none'"/>` 
                : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#fff1f3;color:#ff2442;font-size:12px;font-weight:bold;">小红书</div>`
              }
            </div>
          </div>
          <div class="xhs-card-footer">
            <span class="xhs-badge-brand">
              <span class="xhs-brand-icon">红</span>
              <span class="xhs-brand-text">小红书</span>
            </span>
            <span class="xhs-open-action">查看笔记 →</span>
          </div>
        </a>
      `;
    }

    function renderAllCards(el, cards) {
      el.innerHTML = `
        <div class="xhs-card-container">
          ${cards.map(c => buildSingleCard(c)).join('')}
        </div>
      `;
      el.style.cssText = "padding:0;margin:0;background:transparent;";
    }

    // 2. 注册自定义消息类型组件
    ctx.ui.messageKind("xhs-real-card", (el, msg) => {
      let node = el.parentElement;
      for (let i = 0; i < 8 && node; i++) {
        if ((node.className || "").indexOf("chat-bubble-role-user") !== -1 || (node.className || "").indexOf("chat-bubble-role-assistant") !== -1) {
          node.classList.add("chat-bubble-media");
          node.style.padding = "0";
          node.style.background = "transparent";
          node.style.border = "none";
          node.style.boxShadow = "none";
          break;
        }
        node = node.parentElement;
      }
      el.setAttribute("data-message-id", msg.id);
      const cards = Array.isArray(msg.mediaData?.cards) ? msg.mediaData.cards : [msg.mediaData || {}];
      renderAllCards(el, cards);
    });

    // 3. 增强引导提示词（高优先级封死造假）
    ctx.prompts.set(
      "【小红书工具执行铁律】\n" +
      "1. 当用户需要寻找、推荐或分享小红书内容时，你【绝对禁止】在未调用工具的情况下凭空手写任何链接或假装在后台搜过！\n" +
      "2. 你的唯一动作是直接发起 `xhs_search` 工具调用（Tool Call）。搜索关键词必须极其简炼（单个核心词，如‘日出’，严禁带空格或长句）。\n" +
      "3. 只有工具实际返回真实笔记后，才挑出 1~2 条将链接单独占一行输出；若未搜到内容，请如实告知，严禁伪造！"
    );

    // 4. 消息入库前拦截提取链接转为多卡片载荷
    ctx.hooks.transform("message.beforePersist", (payload) => {
      const msg = payload.message;
      if (!msg || !msg.content) return payload;
      if (msg.role !== "user" && msg.role !== "assistant") return payload;

      const matches = msg.content.match(XHS_REGEX_GLOBAL);
      if (matches && matches.length > 0) {
        msg.mediaType = "plugin:xhs-real-card";
        msg.mediaData = {
          cards: matches.map(url => ({ loading: true, link: url }))
        };
      }
      return payload;
    });

    // 5. 消息落地后异步解析真实元数据
    ctx.hooks.on("message.persisted", async ({ message }) => {
      if (message.mediaType !== "plugin:xhs-real-card" || !message.mediaData?.cards) return;

      const msgId = message.id;
      const mcpBase = (ctx.system.settings.get("mcpUrl") || "").trim().replace(/\/+$/, '');
      if (!mcpBase) return;

      const currentCards = [...message.mediaData.cards];

      for (let i = 0; i < currentCards.length; i++) {
        const targetUrl = currentCards[i].link;
        try {
          const res = await ctx.system.fetch(`${mcpBase}?resolve_share=${encodeURIComponent(targetUrl)}`);
          const json = await res.json();
          // 如果拿到了真实有内容的笔记
          if (json.ok && json.note && (json.note.likedCount > 0 || json.note.title !== "小红书笔记")) {
            currentCards[i] = { 
              loading: false, 
              noteId: json.noteId, 
              ...json.note, 
              link: targetUrl
            };
          } else {
            // 后端解析不到真实数据，判定为 AI 凭空编造的虚假链接
            currentCards[i] = { 
              loading: false, 
              link: targetUrl, 
              title: "无效笔记链接", 
              error: "AI 编造的虚假链接或笔记已失效" 
            };
          }
        } catch (e) {
          currentCards[i] = { loading: false, link: targetUrl, error: "网络连接超时" };
        }

        // 流式增量刷新当前 DOM
        const cardEl = document.querySelector(`[data-message-id="${msgId}"]`);
        if (cardEl) renderAllCards(cardEl, currentCards);
      }

      ctx.data.messages.update(msgId, { mediaData: { cards: currentCards } });
    });

    // 6. 拓展消息长按快捷指令：快速复制链接
    ctx.ui.messageAction({
      id: "copy-xhs-links",
      label: "复制小红书链接",
      filter: (msg) => msg.mediaType === "plugin:xhs-real-card",
      onSelect: (msg, { toast }) => {
        const cards = msg.mediaData?.cards || [];
        const links = cards.map(c => c.link).filter(Boolean).join("\n");
        if (links) {
          navigator.clipboard.writeText(links).then(() => {
            toast("小红书链接已复制到剪贴板");
          });
        }
      }
    });

    ctx.system.log("[小红书真·流光卡片] v10.0.0 拟真现代版已装载");
  }
};