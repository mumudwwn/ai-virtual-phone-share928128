// FloatOS 聊天插件：MiniMax 日文汉字假名纠音
// 在不修改聊天原文的前提下，仅改写发往 MiniMax /t2a_v2 的 text 字段。

export default {
  manifest: {
    id: "floatos-japanese-pronunciation",
    name: "MiniMax 日文假名纠音",
    apiVersion: 1,
    version: "1.0.0",
    author: "OpenAI Codex",
    description: "用自定义“汉字=假名”词典纠正 MiniMax 日语朗读，不修改聊天原文。",
    permissions: ["network", "storage", "ui"],
    settings: [
      {
        key: "enabled",
        label: "启用纠音",
        type: "boolean",
        default: true,
        description: "关闭后，MiniMax 请求将原样发送。",
      },
      {
        key: "forceJapanese",
        label: "强制日语识别",
        type: "boolean",
        default: true,
        description: "纠音命中时，将 language_boost 设为 Japanese。",
      },
      {
        key: "showToast",
        label: "显示命中提示",
        type: "boolean",
        default: false,
        description: "每次实际替换读音时显示简短提示。",
      },
    ],
  },

  setup(ctx) {
    const STORAGE_KEY = "dictionaryText";
    const DEFAULT_DICTIONARY = "";

    const getDictionaryText = () => {
      const value = ctx.system.storage.get(STORAGE_KEY);
      return typeof value === "string" ? value : DEFAULT_DICTIONARY;
    };

    const parseDictionary = (source) => {
      const map = new Map();

      String(source || "")
        .split(/\r?\n/)
        .forEach((rawLine) => {
          const line = rawLine.trim();
          if (!line || line.startsWith("#") || line.startsWith("//")) return;

          const match = line.match(/^(.+?)(?:\s*(?:=>|=|→)\s*)(.+)$/);
          if (!match) return;

          const word = match[1].trim();
          const reading = match[2].trim();
          if (!word || !reading || word === reading) return;

          // 同一个词写了多次时，以最后一条为准。
          map.set(word, reading);
        });

      return [...map.entries()]
        .map(([word, reading]) => ({ word, reading }))
        .sort((a, b) => b.word.length - a.word.length);
    };

    const escapeRegExp = (text) =>
      text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const correctText = (text) => {
      const rules = parseDictionary(getDictionaryText());
      if (!rules.length || typeof text !== "string" || !text) {
        return { text, count: 0, matched: [] };
      }

      const readings = new Map(rules.map((rule) => [rule.word, rule.reading]));
      const pattern = new RegExp(
        rules.map((rule) => escapeRegExp(rule.word)).join("|"),
        "gu",
      );
      const matched = [];
      let count = 0;

      const corrected = text.replace(pattern, (word) => {
        count += 1;
        if (!matched.includes(word)) matched.push(word);
        return readings.get(word) ?? word;
      });

      return { text: corrected, count, matched };
    };

    const isEnabled = () => ctx.system.settings.get("enabled") !== false;
    const shouldForceJapanese = () =>
      ctx.system.settings.get("forceJapanese") !== false;
    const shouldShowToast = () =>
      ctx.system.settings.get("showToast") === true;

    // FloatOS 当前没有 tts.beforeRequest 官方 Hook。聊天插件与宿主同环境运行，
    // 因此只包装 MiniMax 的 /t2a_v2 请求，其余 fetch 全部原样放行。
    const previousFetch = window.fetch;
    const wrappedFetch = async function (input, init) {
      if (!isEnabled()) return previousFetch.call(window, input, init);

      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input instanceof Request
              ? input.url
              : String(input);

      const isMiniMaxTts = /\/t2a_v2(?:[?#]|$)/i.test(url);
      if (!isMiniMaxTts || typeof init?.body !== "string") {
        return previousFetch.call(window, input, init);
      }

      try {
        const body = JSON.parse(init.body);
        if (typeof body?.text !== "string") {
          return previousFetch.call(window, input, init);
        }

        const result = correctText(body.text);
        if (result.count === 0) {
          return previousFetch.call(window, input, init);
        }

        body.text = result.text;
        if (shouldForceJapanese()) body.language_boost = "Japanese";

        if (shouldShowToast()) {
          const names = result.matched.slice(0, 3).join("、");
          const more = result.matched.length > 3 ? "等" : "";
          ctx.ui.toast(`日文纠音：已替换 ${result.count} 处（${names}${more}）`);
        }

        return previousFetch.call(window, input, {
          ...init,
          body: JSON.stringify(body),
        });
      } catch (error) {
        ctx.system.log(
          "纠音请求解析失败，已原样放行：",
          error instanceof Error ? error.message : String(error),
        );
        return previousFetch.call(window, input, init);
      }
    };

    window.fetch = wrappedFetch;

    ctx.ui.slot("settings.section", (el) => {
      el.innerHTML = "";
      el.style.cssText =
        "padding:12px;border:1px solid rgba(127,127,127,.22);border-radius:12px;margin-top:10px;";

      const title = document.createElement("div");
      title.textContent = "日文汉字 → 假名词典";
      title.style.cssText = "font-weight:700;margin-bottom:6px;";

      const help = document.createElement("div");
      help.textContent =
        "每行一条，例如：東雲=しののめ。也支持 → 或 =>。长词会优先匹配；以 # 或 // 开头的行视为注释。";
      help.style.cssText =
        "font-size:12px;line-height:1.55;opacity:.72;margin-bottom:8px;";

      const textarea = document.createElement("textarea");
      textarea.value = getDictionaryText();
      textarea.placeholder =
        "東雲=しののめ\n五月雨=さみだれ\n十六夜=いざよい\n御門=みかど";
      textarea.rows = 8;
      textarea.style.cssText =
        "box-sizing:border-box;width:100%;resize:vertical;padding:10px;border:1px solid rgba(127,127,127,.35);border-radius:10px;background:transparent;color:inherit;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;";

      const previewInput = document.createElement("input");
      previewInput.type = "text";
      previewInput.placeholder = "测试原句，例如：東雲は静かに笑った。";
      previewInput.style.cssText =
        "box-sizing:border-box;width:100%;margin-top:8px;padding:9px 10px;border:1px solid rgba(127,127,127,.35);border-radius:10px;background:transparent;color:inherit;";

      const preview = document.createElement("div");
      preview.style.cssText =
        "min-height:20px;margin-top:7px;font-size:12px;line-height:1.5;word-break:break-word;opacity:.8;";
      preview.textContent = "测试结果会显示在这里。";

      const buttons = document.createElement("div");
      buttons.style.cssText =
        "display:flex;gap:8px;flex-wrap:wrap;margin-top:9px;";

      const makeButton = (label) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.style.cssText =
          "appearance:none;border:0;border-radius:9px;padding:8px 12px;background:#6366f1;color:white;font-weight:600;cursor:pointer;";
        return button;
      };

      const saveButton = makeButton("保存词典");
      const testButton = makeButton("测试替换");
      testButton.style.background = "#64748b";

      const save = () => {
        ctx.system.storage.set(STORAGE_KEY, textarea.value);
        const count = parseDictionary(textarea.value).length;
        ctx.ui.toast(`日文纠音词典已保存：${count} 条规则`);
      };

      saveButton.addEventListener("click", save);
      testButton.addEventListener("click", () => {
        // 测试未保存的编辑内容，因此先暂存，用户可以马上试听同一份规则。
        ctx.system.storage.set(STORAGE_KEY, textarea.value);
        const original = previewInput.value;
        if (!original.trim()) {
          preview.textContent = "请先输入测试原句。";
          return;
        }
        const result = correctText(original);
        preview.textContent = result.count
          ? `将提交给 MiniMax：${result.text}（替换 ${result.count} 处）`
          : "没有命中任何规则。";
      });

      buttons.append(saveButton, testButton);
      el.append(title, help, textarea, previewInput, buttons, preview);

      return () => {
        saveButton.removeEventListener("click", save);
      };
    });

    ctx.system.log("MiniMax 日文假名纠音已启用");

    return () => {
      // 只有当全局 fetch 仍是本插件的包装器时才恢复，避免覆盖后加载的其他插件。
      if (window.fetch === wrappedFetch) window.fetch = previousFetch;
    };
  },
};
