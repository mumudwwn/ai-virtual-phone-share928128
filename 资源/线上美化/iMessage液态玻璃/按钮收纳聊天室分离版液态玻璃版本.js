export default {
  manifest: {
    id: "collapse-bottom-toolbar",
    name: "聊天底栏按钮收纳",
    apiVersion: 1,
    version: "1.1.0",
    author: "初智齿",
    description: "多开安全版：支持自定义应用范围，可精确选择在哪些聊天室启用底栏收纳。",
  },
  setup(ctx) {
    // 1. 注入 CSS（含收纳菜单与设置面板样式）
    ctx.ui.injectCSS(`
      .chat-input-actions button.chat-btn-folded-hide { display: none !important; }
      .chat-input-actions button.chat-btn-hijacked svg { display: none !important; }
      .chat-input-actions button.chat-btn-hijacked::after {
        content: "⋯"; font-size: 22px; font-weight: bold;
        color: var(--c-text); line-height: 1; margin-top: -4px;
      }
      .chat-folded-popover {
        position: fixed !important; display: flex !important; align-items: center !important; gap: 8px !important;
        padding: 6px 8px !important; border-radius: 22px !important; z-index: 99999 !important;
        background: rgba(32, 33, 40, 0.75) !important;
        backdrop-filter: blur(28px) saturate(200%) !important;
        -webkit-backdrop-filter: blur(28px) saturate(200%) !important;
        border: 0.5px solid rgba(255, 255, 255, 0.18) !important;
        box-shadow: 0 12px 32px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.2), inset 0 0.5px 0.5px rgba(255,255,255,0.3) !important;
        animation: iMessagePopoverSpring 0.24s cubic-bezier(0.175, 0.885, 0.32, 1.2) forwards !important;
        transform-origin: bottom left !important; touch-action: manipulation !important;
      }
      @keyframes iMessagePopoverSpring {
        0% { opacity: 0; transform: translateY(8px) scale(0.88); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
      .chat-folded-popover button {
        display: inline-flex !important; align-items: center !important; justify-content: center !important;
        width: 36px !important; height: 36px !important; padding: 0 !important; border-radius: 50% !important;
        border: 0.5px solid rgba(255, 255, 255, 0.08) !important;
        background: rgba(255, 255, 255, 0.08) !important;
        color: #ffffff !important; cursor: pointer !important; flex-shrink: 0 !important;
        transition: all 0.18s cubic-bezier(0.25, 1, 0.5, 1) !important;
      }
      .chat-folded-popover button:hover {
        background: rgba(255, 255, 255, 0.16) !important;
        border-color: rgba(255, 255, 255, 0.22) !important;
        transform: translateY(-1px);
      }
      .chat-folded-popover button:active {
        background: rgba(255, 255, 255, 0.24) !important;
        transform: scale(0.92) !important;
      }
      .chat-folded-popover button svg {
        width: 18px !important; height: 18px !important; stroke: #ffffff !important;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.25)) !important;
      }

      /* 设置面板样式 */
      .cb-settings-box {
        padding: 12px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        border-top: 1px solid color-mix(in srgb, var(--c-card-border, #ccc) 20%, transparent);
      }
      .cb-scope-row {
        display: flex;
        gap: 8px;
      }
      .cb-scope-btn {
        flex: 1;
        padding: 6px 10px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        border: 1px solid var(--c-border, rgba(0,0,0,0.15));
        background: var(--c-input, rgba(0,0,0,0.04));
        color: var(--c-text);
        transition: all 0.15s ease;
      }
      .cb-scope-btn.active {
        background: var(--c-primary, #8b5cf6);
        color: #fff;
        border-color: var(--c-primary, #8b5cf6);
      }
      .cb-session-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 220px;
        overflow-y: auto;
        padding: 4px 2px;
      }
      .cb-session-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 10px;
        background: var(--c-input, rgba(0,0,0,0.04));
        cursor: pointer;
        user-select: none;
      }
      .cb-session-item:hover {
        background: color-mix(in srgb, var(--c-primary, #8b5cf6) 12%, var(--c-input, rgba(0,0,0,0.04)));
      }
      .cb-session-item input[type="checkbox"] {
        cursor: pointer;
        width: 16px;
        height: 16px;
      }
      .cb-session-name {
        font-size: 13px;
        font-weight: 500;
        color: var(--c-text);
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cb-session-type {
        font-size: 11px;
        opacity: 0.6;
        color: var(--c-text);
      }
      .cb-actions-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
      }
      .cb-link-btn {
        background: none;
        border: none;
        color: var(--c-primary, #8b5cf6);
        cursor: pointer;
        font-size: 12px;
        padding: 0;
      }
    `);

    // 2. 状态管理与存储读取
    let popoverEl = null;
    let bypassClickEl = null;
    const hijackedMap = new WeakMap();

    const getApplyScope = () => ctx.system.storage.get("applyScope") || "selected"; // 'all' | 'selected'
    const getTargetSessions = () => ctx.system.storage.get("targetSessions") || [];

    const isSessionActive = (sessionId) => {
      if (getApplyScope() === "all") return true;
      if (!sessionId) return false;
      const targets = getTargetSessions();
      return Array.isArray(targets) && targets.includes(sessionId);
    };

    const getSessionIdFromElement = (el) => {
      const roomWrapper = el.closest(".chat-room-wrapper");
      if (!roomWrapper) return null;
      const match = roomWrapper.className.match(/\bsession-([^\s]+)/);
      return match ? match[1] : null;
    };

    const closePopover = () => {
      if (popoverEl) {
        popoverEl.remove();
        popoverEl = null;
      }
    };

    // 全局点击遮罩外关闭弹窗
    const handleGlobalClick = (e) => {
      if (!popoverEl) return;
      if (!popoverEl.contains(e.target) && !e.target.closest(".chat-btn-hijacked")) {
        closePopover();
      }
    };
    document.addEventListener("pointerdown", handleGlobalClick, true);

    // 劫持点击事件
    const captureClickListener = (e) => {
      const btn = e.currentTarget;
      if (bypassClickEl === btn) {
        bypassClickEl = null;
        return;
      }
      e.stopPropagation();
      e.preventDefault();

      if (popoverEl) {
        closePopover();
        return;
      }

      const foldedData = hijackedMap.get(btn);
      if (!foldedData) return;

      const rect = btn.getBoundingClientRect();
      popoverEl = document.createElement("div");
      popoverEl.className = "chat-folded-popover";
      popoverEl.style.bottom = `${window.innerHeight - rect.top + 12}px`;
      popoverEl.style.left = `${Math.max(12, rect.left)}px`;

      foldedData.forEach((data) => {
        const clone = document.createElement("button");
        clone.type = "button";
        clone.title = data.title;
        clone.innerHTML = data.html;
        clone.disabled = data.el.disabled;
        if (data.el.style.opacity) clone.style.opacity = data.el.style.opacity;

        clone.addEventListener("click", (ev) => {
          ev.stopPropagation();
          closePopover();
          if (data.el === btn) {
            bypassClickEl = btn;
          }
          data.el.click();
        });
        popoverEl.appendChild(clone);
      });

      document.body.appendChild(popoverEl);
    };

    // 核心处理函数：根据白名单状态决定收纳或恢复
    const processInputActions = () => {
      const actionBars = document.querySelectorAll(".chat-input-actions");

      actionBars.forEach((actionsBar) => {
        const buttons = Array.from(actionsBar.querySelectorAll(":scope > button.ui-bare-btn"));
        if (buttons.length === 0) return;

        const sessionId = getSessionIdFromElement(actionsBar);
        const enabled = isSessionActive(sessionId);

        // 如果未对该会话启用，完全还原按钮状态
        if (!enabled) {
          buttons.forEach((btn) => {
            btn.classList.remove("chat-btn-folded-hide", "chat-btn-hijacked");
            btn.removeEventListener("click", captureClickListener, true);
          });
          return;
        }

        const currentFolded = [];

        // 分拣按钮
        buttons.forEach((btn) => {
          const title = btn.getAttribute("title") || btn.getAttribute("aria-label") || "";
          const html = btn.innerHTML;
          const isSendOrStop = title.includes("发送") || title.includes("停止") || html.includes("<polygon");
          const isTriggerAI = html.includes("M9.937") || html.includes("M20 3v4");

          if (!isSendOrStop && !isTriggerAI) {
            currentFolded.push({ el: btn, html, title });
          } else {
            btn.classList.remove("chat-btn-folded-hide", "chat-btn-hijacked");
            btn.removeEventListener("click", captureClickListener, true);
          }
        });

        if (currentFolded.length === 0) return;

        const targetBtn = currentFolded[0].el;
        hijackedMap.set(targetBtn, currentFolded);

        targetBtn.removeEventListener("click", captureClickListener, true);
        targetBtn.addEventListener("click", captureClickListener, true);

        currentFolded.forEach((data, idx) => {
          if (idx === 0) {
            data.el.classList.add("chat-btn-hijacked");
            data.el.classList.remove("chat-btn-folded-hide");
          } else {
            data.el.classList.add("chat-btn-folded-hide");
            data.el.classList.remove("chat-btn-hijacked");
            data.el.removeEventListener("click", captureClickListener, true);
          }
        });
      });
    };

    // 3. 注册设置页自定义渲染面板（UI 坑位 settings.section）
    ctx.ui.slot("settings.section", (el) => {
      const render = () => {
        el.innerHTML = "";
        const container = document.createElement("div");
        container.className = "cb-settings-box";

        const currentScope = getApplyScope();
        const selectedList = getTargetSessions();

        // 范围切换按钮区
        const scopeRow = document.createElement("div");
        scopeRow.className = "cb-scope-row";

        const btnSelected = document.createElement("button");
        btnSelected.type = "button";
        btnSelected.className = `cb-scope-btn ${currentScope === "selected" ? "active" : ""}`;
        btnSelected.textContent = "仅勾选的聊天室";
        btnSelected.onclick = () => {
          ctx.system.storage.set("applyScope", "selected");
          render();
          processInputActions();
        };

        const btnAll = document.createElement("button");
        btnAll.type = "button";
        btnAll.className = `cb-scope-btn ${currentScope === "all" ? "active" : ""}`;
        btnAll.textContent = "全部聊天室";
        btnAll.onclick = () => {
          ctx.system.storage.set("applyScope", "all");
          render();
          processInputActions();
        };

        scopeRow.appendChild(btnSelected);
        scopeRow.appendChild(btnAll);
        container.appendChild(scopeRow);

        // 如果是按勾选模式，显示聊天室列表选择
        if (currentScope === "selected") {
          const sessions = ctx.data.sessions.list() || [];

          const actionsBar = document.createElement("div");
          actionsBar.className = "cb-actions-bar";
          actionsBar.innerHTML = `<span style="opacity:0.75; font-size:12px;">已选 ${selectedList.length}/${sessions.length} 个聊天室</span>`;

          const btnGroup = document.createElement("div");
          btnGroup.style.display = "flex";
          btnGroup.style.gap = "10px";

          const btnSelectAll = document.createElement("button");
          btnSelectAll.type = "button";
          btnSelectAll.className = "cb-link-btn";
          btnSelectAll.textContent = "全选";
          btnSelectAll.onclick = () => {
            ctx.system.storage.set("targetSessions", sessions.map(s => s.id));
            render();
            processInputActions();
          };

          const btnClear = document.createElement("button");
          btnClear.type = "button";
          btnClear.className = "cb-link-btn";
          btnClear.textContent = "清空";
          btnClear.onclick = () => {
            ctx.system.storage.set("targetSessions", []);
            render();
            processInputActions();
          };

          btnGroup.appendChild(btnSelectAll);
          btnGroup.appendChild(btnClear);
          actionsBar.appendChild(btnGroup);
          container.appendChild(actionsBar);

          const listEl = document.createElement("div");
          listEl.className = "cb-session-list";

          if (sessions.length === 0) {
            listEl.innerHTML = `<div style="text-align:center; opacity:0.5; font-size:12px; padding:12px;">暂无聊天会话</div>`;
          } else {
            sessions.forEach(sess => {
              let name = sess.alias || "";
              let typeLabel = "单聊";
              if (sess.isGroup) {
                name = sess.groupName || "群聊";
                typeLabel = "群聊";
              } else {
                const char = ctx.data.characters.get(sess.contactId);
                name = name || char?.name || `联系人 (${sess.contactId.slice(-4)})`;
              }

              const isChecked = selectedList.includes(sess.id);

              const item = document.createElement("label");
              item.className = "cb-session-item";

              const checkbox = document.createElement("input");
              checkbox.type = "checkbox";
              checkbox.checked = isChecked;
              checkbox.onchange = (e) => {
                const current = new Set(getTargetSessions());
                if (e.target.checked) current.add(sess.id);
                else current.delete(sess.id);
                ctx.system.storage.set("targetSessions", Array.from(current));
                render();
                processInputActions();
              };

              const nameSpan = document.createElement("span");
              nameSpan.className = "cb-session-name";
              nameSpan.textContent = name;

              const typeSpan = document.createElement("span");
              typeSpan.className = "cb-session-type";
              typeSpan.textContent = typeLabel;

              item.appendChild(checkbox);
              item.appendChild(nameSpan);
              item.appendChild(typeSpan);
              listEl.appendChild(item);
            });
          }

          container.appendChild(listEl);
        }

        el.appendChild(container);
      };

      render();
    });

    // 4. 监听 DOM 变化
    const observer = new MutationObserver(() => {
      processInputActions();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    processInputActions();

    // 5. 卸载/禁用清理
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", handleGlobalClick, true);
      closePopover();
      document.querySelectorAll(".chat-btn-hijacked").forEach(el => {
        el.removeEventListener("click", captureClickListener, true);
        el.classList.remove("chat-btn-hijacked");
      });
      document.querySelectorAll(".chat-btn-folded-hide").forEach(el => {
        el.classList.remove("chat-btn-folded-hide");
      });
    };
  }
};