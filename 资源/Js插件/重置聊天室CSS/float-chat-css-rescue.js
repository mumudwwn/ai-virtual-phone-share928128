// Float Chat CSS Rescue
// Emergency per-session customCSS recovery tool for Float chat plugin API v1.

export default {
  manifest: {
    id: "auren.float-chat-css-rescue",
    name: "聊天室 CSS 急救",
    version: "1.0.0",
    apiVersion: 1,
    author: "Auren & Chloe",
    description: "无需进入故障聊天室，查看、备份、清空或恢复单个会话的自定义 CSS。仅修改 ChatSession.customCSS。",
    permissions: ["chat.read", "chat.write", "ui", "storage"],
  },

  setup(ctx) {
    if (typeof window === "undefined" || typeof indexedDB === "undefined") {
      throw new Error("当前环境不支持 IndexedDB，无法使用聊天室 CSS 急救。");
    }

    const DB_NAME = "AiPhoneChatDB";
    const STORE_NAME = "sessions";
    const BACKUP_PREFIX = "session-css-backup:";

    ctx.ui.injectCSS(`
      .fcr-open {
        border: 0;
        border-radius: 10px;
        padding: 9px 12px;
        background: var(--c-input, #eee);
        color: var(--c-text, #222);
        cursor: pointer;
      }
      .fcr-panel {
        color: var(--c-text, #222);
        background: var(--c-card, #fff);
        width: min(620px, calc(100vw - 28px));
        max-height: 84dvh;
        overflow: auto;
        border-radius: 22px;
        padding: 20px;
        box-sizing: border-box;
        font: 14px/1.6 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .fcr-panel h2 { margin: 0; font-size: 20px; }
      .fcr-panel p { margin: 7px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
      .fcr-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 12px 0; }
      .fcr-card { border: 1px solid var(--c-border, #ddd); border-radius: 14px; padding: 14px; margin: 12px 0; }
      .fcr-panel select,
      .fcr-panel textarea {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid var(--c-border, #ddd);
        border-radius: 10px;
        background: var(--c-input, #f5f5f5);
        color: inherit;
        padding: 10px;
        font: inherit;
      }
      .fcr-panel textarea { min-height: 150px; resize: vertical; }
      .fcr-panel button {
        border: 0;
        border-radius: 10px;
        padding: 9px 12px;
        background: var(--c-input, #eee);
        color: var(--c-text, #222);
        cursor: pointer;
      }
      .fcr-panel button:disabled { opacity: .5; cursor: wait; }
      .fcr-primary { background: var(--c-success, #3a83f7) !important; color: #fff !important; }
      .fcr-danger { background: var(--c-danger, #c93c3c) !important; color: #fff !important; }
      .fcr-muted { opacity: .65; font-size: 12px; }
      .fcr-good { color: var(--c-success, #258a55); }
      .fcr-bad { color: var(--c-danger, #b42318); }
      .fcr-code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
    `);

    function el(tag, text, className) {
      const node = document.createElement(tag);
      if (text != null) node.textContent = text;
      if (className) node.className = className;
      return node;
    }

    function button(label, action, className = "") {
      const node = el("button", label, className);
      node.type = "button";
      node.onclick = async () => {
        if (node.disabled) return;
        node.disabled = true;
        try {
          await action();
        } catch (error) {
          ctx.ui.toast(error instanceof Error ? error.message : String(error));
        } finally {
          node.disabled = false;
        }
      };
      return node;
    }

    function openDb() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error(`无法打开 ${DB_NAME}`));
        req.onblocked = () => reject(new Error(`${DB_NAME} 被其它页面占用，请关闭其它 Float 标签页后重试。`));
      });
    }

    async function getAllSessionsFromDb() {
      const db = await openDb();
      try {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          throw new Error(`${DB_NAME} 中不存在 ${STORE_NAME} 数据表。`);
        }
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, "readonly");
          const req = tx.objectStore(STORE_NAME).getAll();
          req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
          req.onerror = () => reject(req.error || new Error("读取会话失败"));
        });
      } finally {
        db.close();
      }
    }

    async function getSessionFromDb(sessionId) {
      const db = await openDb();
      try {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          throw new Error(`${DB_NAME} 中不存在 ${STORE_NAME} 数据表。`);
        }
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, "readonly");
          const req = tx.objectStore(STORE_NAME).get(sessionId);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error || new Error("读取会话失败"));
        });
      } finally {
        db.close();
      }
    }

    async function putSessionToDb(session) {
      const db = await openDb();
      try {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          throw new Error(`${DB_NAME} 中不存在 ${STORE_NAME} 数据表。`);
        }
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, "readwrite");
          tx.objectStore(STORE_NAME).put(session);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error("写入会话失败"));
          tx.onabort = () => reject(tx.error || new Error("写入会话被中止"));
        });
      } finally {
        db.close();
      }
    }

    function sessionLabel(session) {
      if (session.isGroup) return `群聊 · ${session.groupName || session.alias || session.id}`;
      const character = ctx.data.characters.get(session.contactId);
      const name = session.alias || character?.name || session.contactId || "未知角色";
      return `${name} · ${session.id.slice(-8)}`;
    }

    function backupKey(sessionId) {
      return BACKUP_PREFIX + sessionId;
    }

    function readBackup(sessionId) {
      return ctx.system.storage.get(backupKey(sessionId));
    }

    function writeBackup(session) {
      const record = {
        savedAt: new Date().toISOString(),
        sessionId: session.id,
        contactId: session.contactId,
        customCSS: typeof session.customCSS === "string" ? session.customCSS : "",
      };
      ctx.system.storage.set(backupKey(session.id), record);
      return record;
    }

    function reloadSoon(message) {
      ctx.ui.toast(message || "已写入，正在重新载入 Float…", { durationMs: 0 });
      window.setTimeout(() => window.location.reload(), 450);
    }

    function openRescue() {
      ctx.ui.openModal((container, api) => {
        container.className = "fcr-panel";
        container.setAttribute("role", "dialog");
        container.setAttribute("aria-label", "聊天室 CSS 急救");

        let sessions = [];
        let selectedId = "";
        let selectedSession = null;

        const render = async () => {
          container.replaceChildren();

          const header = el("div", null, "fcr-row");
          header.append(el("h2", "聊天室 CSS 急救"), button("关闭", () => api.close()));
          container.append(header);
          container.append(
            el(
              "p",
              "用于修复因单个聊天室自定义 CSS 导致的页面异常。此工具只修改该会话的 customCSS 字段，不会删除聊天记录、角色、记忆、朋友圈或图片资源。",
              "fcr-muted",
            ),
          );

          try {
            sessions = await getAllSessionsFromDb();
          } catch (error) {
            container.append(el("p", error instanceof Error ? error.message : String(error), "fcr-bad"));
            return;
          }

          sessions.sort((a, b) => sessionLabel(a).localeCompare(sessionLabel(b), "zh-CN"));
          if (!sessions.length) {
            container.append(el("p", "没有找到聊天会话。", "fcr-bad"));
            return;
          }

          if (!selectedId || !sessions.some(s => s.id === selectedId)) selectedId = sessions[0].id;
          selectedSession = sessions.find(s => s.id === selectedId) || null;

          const select = el("select");
          select.setAttribute("aria-label", "选择要修复的聊天室");
          for (const session of sessions) {
            const option = el("option", sessionLabel(session));
            option.value = session.id;
            option.selected = session.id === selectedId;
            select.append(option);
          }
          select.onchange = () => {
            selectedId = select.value;
            void render();
          };
          container.append(select);

          const css = typeof selectedSession?.customCSS === "string" ? selectedSession.customCSS : "";
          const backup = selectedSession ? readBackup(selectedSession.id) : null;

          const info = el("div", null, "fcr-card");
          info.append(el("p", `Session ID：${selectedSession?.id || "-"}`, "fcr-code"));
          info.append(el("p", css ? `当前 customCSS：已设置 · ${css.length.toLocaleString()} 字符` : "当前 customCSS：空（默认样式）", css ? "fcr-bad" : "fcr-good"));
          if (backup && typeof backup === "object") {
            const backupCss = typeof backup.customCSS === "string" ? backup.customCSS : "";
            const when = backup.savedAt ? new Date(backup.savedAt).toLocaleString() : "未知时间";
            info.append(el("p", `急救备份：${when} · ${backupCss.length.toLocaleString()} 字符`, "fcr-muted"));
          } else {
            info.append(el("p", "急救备份：暂无", "fcr-muted"));
          }
          container.append(info);

          if (css) {
            const details = el("details", null, "fcr-card");
            details.append(el("summary", "查看当前 CSS（只读）"));
            const preview = el("textarea", null, "fcr-code");
            preview.readOnly = true;
            preview.value = css;
            details.append(preview);
            const copyRow = el("div", null, "fcr-row");
            copyRow.append(button("复制当前 CSS", async () => {
              await navigator.clipboard.writeText(css);
              ctx.ui.toast("当前 CSS 已复制");
            }));
            details.append(copyRow);
            container.append(details);
          }

          const actions = el("div", null, "fcr-row");
          actions.append(
            button("清空 CSS 并重载 Float", async () => {
              if (!selectedSession) return;
              const latest = await getSessionFromDb(selectedSession.id);
              if (!latest) throw new Error("会话已不存在，请刷新列表后重试。");
              const latestCss = typeof latest.customCSS === "string" ? latest.customCSS : "";
              if (!latestCss) {
                if (!window.confirm("这个会话当前已经没有自定义 CSS。仍然重新载入 Float？")) return;
                reloadSoon("当前 CSS 已经是空的，正在重新载入 Float…");
                return;
              }
              if (!window.confirm(`确认清空“${sessionLabel(latest)}”的自定义 CSS？\n\n清空前会自动保存一份急救备份。聊天记录和媒体不会被修改。`)) return;
              writeBackup(latest);
              await putSessionToDb({ ...latest, customCSS: "" });
              try {
                window.dispatchEvent(new CustomEvent("chat-session-css-updated", { detail: { sessionId: latest.id, css: "" } }));
              } catch { /* ignore */ }
              reloadSoon("CSS 已清空并备份，正在重新载入 Float…");
            }, "fcr-danger"),
          );

          if (backup && typeof backup === "object" && typeof backup.customCSS === "string") {
            actions.append(
              button("恢复急救备份 CSS", async () => {
                if (!selectedSession) return;
                const latest = await getSessionFromDb(selectedSession.id);
                if (!latest) throw new Error("会话已不存在，请刷新列表后重试。");
                if (!window.confirm(`确认把“${sessionLabel(latest)}”恢复为上一次急救前的 CSS？\n\n如果那份 CSS 本身就是导致页面异常的版本，恢复后问题可能重新出现。`)) return;
                await putSessionToDb({ ...latest, customCSS: backup.customCSS });
                reloadSoon("急救备份 CSS 已恢复，正在重新载入 Float…");
              }),
            );
          }

          actions.append(button("刷新会话列表", () => render()));
          container.append(actions);
          container.append(el("p", "建议优先使用“清空 CSS 并重载 Float”。恢复后再进入对应聊天室，从正常的自定义 CSS 页面载入正确方案并应用。", "fcr-muted"));
        };

        void render();
      });
    }

    ctx.ui.slot("settings.section", (container) => {
      const node = button("打开聊天室 CSS 急救", openRescue, "fcr-open");
      container.append(node);
      return () => node.remove();
    });
  },
};
