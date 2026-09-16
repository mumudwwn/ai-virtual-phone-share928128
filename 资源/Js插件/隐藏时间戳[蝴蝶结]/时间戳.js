export default {
  manifest: {
    id: "hide-timestamp",
    name: "隐藏聊天时间戳",
    apiVersion: 1,
    version: "1.0.0",
    author: "you",
    description: "隐藏气泡旁的时间（12:34）与日期分隔（昨天 / 2024年5月1日），让聊天界面更干净",
    permissions: [],
    settings: [
      { key: "hideBubbleTime", label: "隐藏时间（如 12:34）", type: "boolean", default: true },
      { key: "hideDateDivider", label: "隐藏日期分隔（如 昨天 / 今天 / 5月1日）", type: "boolean", default: true },
      { key: "hideByClass", label: "按元素类名识别（更激进，可能误伤）", type: "boolean", default: true },
      { key: "maxFontSize", label: "只隐藏字号不超过（px）的文本", type: "number", default: 14 },
      { key: "customSelector", label: "自定义 CSS 选择器（高级，可留空）", type: "text", default: "" },
    ],
  },

  setup(ctx) {
    const HIDE_CLASS = "x-hide-timestamp";

    // 常见的时间/日期元素类名（全部小写后做 includes 匹配）
    const CLASS_HINTS = [
      "timestamp", "time-stamp", "msg-time", "msg_time",
      "message-time", "message_time", "bubble-time", "bubble_time",
      "chat-time", "chat_time", "date-divider", "date_divider",
      "datedivider", "time-divider", "time_divider", "timedivider",
      "msgtime", "messagetime", "bubletime", "chattime",
      "msg-date", "msg_date", "message-date", "message_date",
      "msgdate", "messagedate",
    ];

    const TIME_RE =
      /^(?:(?:上午|下午|凌晨|中午|晚上|早上|清晨|傍晚|夜间)\s*)?\d{1,2}\s*[:：]\s*\d{2}(?:\s*[:：]\s*\d{2})?$/;

    const DATE_RE =
      /^(?:(?:\d{4}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}\s*日?|\d{1,2}\s*月\s*\d{1,2}\s*日|昨天|今天|前天|星期[一二三四五六日天]|周[一二三四五六日天])(?:\s*(?:上午|下午|凌晨|中午|晚上|早上|清晨|傍晚|夜间)?\s*\d{1,2}\s*[:：]\s*\d{2})?)$/;

    // 注入隐藏样式
    ctx.ui.injectCSS(`.${HIDE_CLASS}{display:none !important;}`);

    // ---- 读取设置 ----
    function settings() {
      const g = (k, d) => {
        const v = ctx.system.settings.get(k);
        return v === undefined || v === null ? d : v;
      };
      const n = Number(g("maxFontSize", 14));
      return {
        hideBubbleTime: g("hideBubbleTime", true) !== false,
        hideDateDivider: g("hideDateDivider", true) !== false,
        hideByClass: g("hideByClass", true) !== false,
        maxFontSize: isNaN(n) ? 14 : n,
        customSelector: String(g("customSelector", "") || "").trim(),
      };
    }

    // ---- 判定 ----
    function isExcluded(el) {
      if (!el.isConnected) return true;
      const tag = el.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "INPUT" ||
          tag === "TEXTAREA" || tag === "SELECT" || tag === "OPTION") return true;
      if (el.isContentEditable) return true;
      if (el.closest && el.closest("pre, code, [contenteditable='true'], [contenteditable='']")) return true;
      return false;
    }

    function isTimestampLike(el, s) {
      if (el.classList.contains(HIDE_CLASS)) return false;
      if (isExcluded(el)) return false;

      const text = (el.textContent || "").trim();
      if (!text || text.length > 40) return false;

      // 1) 类名直接命中
      if (s.hideByClass) {
        const cls = typeof el.className === "string" ? el.className.toLowerCase() : "";
        if (cls && CLASS_HINTS.some((h) => cls.includes(h))) return true;
      }

      // 2) 文本形态匹配（要求是叶子元素、字号偏小）
      if (el.childElementCount > 0) return false;
      if (text.length > 24) return false;

      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (isNaN(fs) || fs > s.maxFontSize) return false;

      if (s.hideBubbleTime && TIME_RE.test(text)) return true;
      if (s.hideDateDivider && DATE_RE.test(text)) return true;
      return false;
    }

    // ---- 扫描 ----
    function mark(el, s) {
      if (isTimestampLike(el, s)) el.classList.add(HIDE_CLASS);
    }

    function scan(node, s) {
      if (!node || node.nodeType !== 1 || !node.isConnected) return;
      if (node.classList && node.classList.contains(HIDE_CLASS)) return;
      mark(node, s);
      let n;
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT, null);
      while ((n = walker.nextNode())) {
        mark(n, s);
      }
    }

    function applyCustomSelector(s) {
      if (!s.customSelector) return;
      try {
        document.querySelectorAll(s.customSelector).forEach((el) => {
          el.classList.add(HIDE_CLASS);
        });
      } catch (e) {
        // 无效选择器，忽略
      }
    }

    function resetMarks() {
      const els = document.querySelectorAll("." + HIDE_CLASS);
      for (let i = 0; i < els.length; i++) els[i].classList.remove(HIDE_CLASS);
    }

    // ---- 增量监听 ----
    const pending = new Set();
    let scheduled = false;

    function flush() {
      scheduled = false;
      const s = settings();
      const nodes = Array.from(pending);
      pending.clear();
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.isConnected) scan(n, s);
      }
      applyCustomSelector(s);
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      ctx.system.timers.setTimeout(flush, 80);
    }

    const observer = new MutationObserver((records) => {
      let touched = false;
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        if (r.type === "childList") {
          for (let j = 0; j < r.addedNodes.length; j++) {
            const n = r.addedNodes[j];
            if (n.nodeType === 1) {
              pending.add(n);
              touched = true;
            }
          }
        } else if (r.type === "characterData") {
          const p = r.target && r.target.parentElement;
          if (p) {
            pending.add(p);
            touched = true;
          }
        }
      }
      if (touched) schedule();
    });

    function startObserving() {
      if (!document.body) {
        ctx.system.timers.setTimeout(startObserving, 200);
        return;
      }
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      const s = settings();
      scan(document.body, s);
      applyCustomSelector(s);
    }

    startObserving();

    // 新消息落库后再补扫一次，兜底 React 复用节点的情况
    ctx.hooks.on("message.persisted", () => schedule());

    // 设置变化：清掉旧标记后重扫
    ctx.system.settings.onChange(() => {
      resetMarks();
      const s = settings();
      if (document.body) scan(document.body, s);
      applyCustomSelector(s);
    });

    // 额外清理
    return () => {
      observer.disconnect();
      pending.clear();
    };
  },
};