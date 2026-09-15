export default {
  manifest: {
    id: "floating-translator",
    name: "随身翻译球 (🌸地道粤语全覆盖版)",
    apiVersion: 1,
    version: "2.9.0",
    author: "小卷",
    description: "全面覆盖日常粤语口语语法、韩日语长短句全句畅翻。0消耗不扣API额度。",
    permissions: ["chat.read"],
    settings: [
      {
        key: "defaultLang",
        label: "全局默认语种",
        type: "select",
        default: "none",
        options: [
          { value: "none", label: "🚫 默认不翻译 (保持正常中文)" },
          { value: "韩语", label: "🇰🇷 韩语 (한국어)" },
          { value: "粤语", label: "🇭🇰 粤语口语 (廣東話)" },
          { value: "日语", label: "🇯🇵 日语 (日本語)" },
          { value: "英语", label: "🇺🇸 英语 (English)" },
          { value: "法语", label: "🇫🇷 法语 (Français)" },
          { value: "德语", label: "🇩🇪 德语 (Deutsch)" },
          { value: "西班牙语", label: "🇪🇸 西班牙语 (Español)" },
          { value: "俄语", label: "🇷🇺 俄语 (Русский)" },
          { value: "繁体中文", label: "🇭🇰 繁体中文 (繁體)" },
        ],
      },
      {
        key: "autoTranslateSend",
        label: "开启发送自动翻译（仅对设置了外语的角色生效）",
        type: "boolean",
        default: true,
      },
      {
        key: "bilingualMode",
        label: "启用 [外语 | 中文] 极简双语格式",
        type: "boolean",
        default: true,
      },
    ],
  },
setup(ctx) {
    let currentSessionId = null;
const LANG_OPTIONS = [
      { value: "韩语", label: "🇰🇷 韩语" },
      { value: "粤语", label: "🇭🇰 粤语口语" },
      { value: "日语", label: "🇯🇵 日语" },
      { value: "英语", label: "🇺🇸 英语" },
      { value: "法语", label: "🇫🇷 法语" },
      { value: "德语", label: "🇩🇪 德语" },
      { value: "西班牙语", label: "🇪🇸 西班牙语" },
      { value: "俄语", label: "🇷🇺 俄语" },
      { value: "繁体中文", label: "🇭🇰 繁体中文" },
    ];
const CODE_MAP = {
      "韩语": "ko",
      "日语": "ja",
      "英语": "en",
      "法语": "fr",
      "德语": "de",
      "西班牙语": "es",
      "俄语": "ru",
      "繁体中文": "zh-TW",
    };
// 1. 高频亲昵词典（毫秒级精准直出）
    const QUICK_DICT = {
      "哥哥": { "韩语": "오빠", "粤语": "阿哥", "日语": "お兄ちゃん", "英语": "Oppa" },
      "欧巴": { "韩语": "오빠", "粤语": "欧巴", "日语": "オッパ", "英语": "Oppa" },
      "姐姐": { "韩语": "언니", "粤语": "家姐", "日语": "お姉ちゃん", "英语": "Sister" },
      "弟弟": { "韩语": "남동생", "粤语": "细佬", "日语": "弟", "英语": "Brother" },
      "妹妹": { "韩语": "여동생", "粤语": "细妹", "日语": "妹", "英语": "Sister" },
      "宝贝": { "韩语": "자기야", "粤语": "BB", "日语": "ベイビー", "英语": "Baby" },
      "宝": { "韩语": "자기야", "粤语": "BB", "日语": "ベイビー", "英语": "Babe" },
      "好想你": { "韩语": "너무 보고 싶어", "粤语": "好挂住你呀", "日语": "すごく会いたい", "英语": "I miss you so much" },
      "想你了": { "韩语": "보고 싶어", "粤语": "好挂住你呀", "日语": "会いたいな", "英语": "I miss you" },
      "晚安": { "韩语": "잘 자✨", "粤语": "早啲训啦，早抖✨", "日语": "おやすみ✨", "英语": "Good night✨" },
      "早安": { "韩语": "좋은 아침", "粤语": "早晨呀", "日语": "おはよう", "英语": "Good morning" },
    };
// 2. 深度地道粤语口语语法转换矩阵（按词长由长到短严格排序匹配，避免漏翻）
    const CANTONESE_RULES = [
      // 4字及以上长词组
      [/今天一天也辛苦啦/g, "今日成日都辛苦晒啦"],
      [/记得吃顿好吃的晚餐/g, "记得食餐好嘅晚饭"],
      [/记得吃好吃的/g, "记得食好嘢"],
      [/吃好吃的/g, "食好嘢"],
      [/我一会儿到家/g, "我等阵返到屋企啦"],
      [/一会儿到家/g, "等阵返到屋企啦"],
      [/你吃饭了吗|你吃饭了没/g, "你食咗饭未呀？"],
      [/吃饭了吗|吃饭了没/g, "食咗饭未呀？"],
      [/在干什么呢|在干嘛呢/g, "喺度做紧咩呀？"],
      [/在干什么|在干嘛|在做什么/g, "喺度做紧咩呀？"],
      [/什么时候回家/g, "几时返屋企呀"],
      [/什么时候/g, "几时"],
      [/下课了路上慢点/g, "落堂啦路上小心啲呀"],
      [/路上慢点/g, "路上小心啲呀"],
      [/明天一起去/g, "听日一齐去"],
      [/发生什么事了|发生什么事/g, "发生咩事呀"],
      [/怎么回事|怎么了/g, "做咩事呀"],
      [/不知道/g, "唔知"],
      [/没关系|不要紧/g, "冇紧要"],
// 3字词组
      [/一会儿|等一会儿|等一下|等会儿|过一会儿/g, "等阵"],
      [/到家了|到家啦|回到家了/g, "返到屋企啦"],
      [/到家|回到家/g, "返到屋企"],
      [/回家了|回家啦/g, "返屋企啦"],
      [/回家/g, "返屋企"],
      [/在家|在家里/g, "喺屋企"],
      [/吃过了|吃了/g, "食咗啦"],
      [/还没吃|没吃呢/g, "仲未食呀"],
      [/还没呢|还没/g, "仲未呀"],
      [/下课了/g, "落堂啦"],
      [/下班了/g, "收工啦"],
      [/上班了/g, "返工啦"],
      [/睡觉了/g, "训觉啦"],
      [/去睡觉/g, "去训觉"],
      [/看电影/g, "睇戏"],
      [/看电视/g, "睇电视"],
      [/玩手机/g, "玩手机"],
      [/行不行|可以吗/g, "得唔得呀"],
      [/好不好/g, "好唔好呀"],
      [/是不是/g, "系唔系"],
      [/对不对/g, "啱唔啱"],
      [/在哪里|在什么地方/g, "喺边度"],
      [/去哪里/g, "去边度"],
      [/多少钱/g, "几多钱"],
      [/太棒了/g, "好犀利呀"],
      [/骗你的/g, "呃你嘅"],
      [/真开心/g, "好开心"],
      [/看一看/g, "睇下"],
      [/想一想/g, "谂下"],
      [/试一试/g, "试下"],
// 2字词组
      [/刚刚|方才/g, "啱啱"],
      [/刚才/g, "头先"],
      [/现在|如今/g, "依家"],
      [/今天/g, "今日"],
      [/明天/g, "听日"],
      [/昨天/g, "琴日"],
      [/后天/g, "后日"],
      [/睡觉/g, "训觉"],
      [/起床/g, "起身"],
      [/下课/g, "落堂"],
      [/上课/g, "上堂"],
      [/下班/g, "收工"],
      [/上班/g, "返工"],
      [/吃饭/g, "食饭"],
      [/喝水/g, "饮水"],
      [/喝茶/g, "饮茶"],
      [/买单|结账/g, "埋单"],
      [/聊天/g, "倾偈"],
      [/漂亮|好看/g, "靓"],
      [/帅气/g, "靓仔"],
      [/喜欢/g, "中意"],
      [/想念/g, "挂住"],
      [/为什么/g, "点解"],
      [/怎么/g, "点样"],
      [/什么/g, "咩"],
      [/哪里/g, "边度"],
      [/这里/g, "呢度"],
      [/那里/g, "嗰度"],
      [/这个/g, "呢个"],
      [/那个/g, "嗰个"],
      [/这些/g, "呢啲"],
      [/那些/g, "嗰啲"],
      [/不要|别/g, "唔好"],
      [/不是/g, "唔系"],
      [/没有/g, "冇"],
      [/不会/g, "唔识"],
      [/不用/g, "唔使"],
      [/不行|不可/g, "唔得"],
      [/很累|好累/g, "好攰"],
      [/好困|犯困/g, "好眼训"],
      [/哥哥/g, "阿哥"],
      [/姐姐/g, "家姐"],
      [/弟弟/g, "细佬"],
      [/妹妹/g, "细妹"],
      [/我们/g, "我哋"],
      [/你们/g, "你哋"],
      [/他们|她们/g, "佢哋"],
      [/一点|一点点/g, "少少"],
      [/非常|特别/g, "好"],
      [/真的/g, "真系"],
      [/晚安/g, "早抖"],
      [/早安|早上好/g, "早晨"],
      [/东西(?=[^南北])/g, "嘢"],
// 单字与语气词转换
      [/吃/g, "食"],
      [/喝/g, "饮"],
      [/看/g, "睇"],
      [/说/g, "讲"],
      [/给/g, "畀"],
      [/找/g, "搵"],
      [/买/g, "买"],
      [/想/g, "谂"],
      [/的/g, "嘅"],
      [/很/g, "好"],
      [/没/g, "冇"],
      [/他|她/g, "佢"],
      [/吗[？?]?$/g, "呀？"],
      [/呢[？?]?$/g, "呀？"],
      [/了$/g, "啦"],
      [/([食睇讲听玩行买做去到])了/g, "$1咗"],
    ];
function convertToColloquialCantonese(text) {
      let result = text;
      for (const [reg, rep] of CANTONESE_RULES) {
        result = result.replace(reg, rep);
      }
      return result;
    }
// 3. 网络多通道超时请求
    async function fetchWithTimeout(url, timeoutMs = 3800) {
      const fetchFn = (ctx.system && ctx.system.fetch) ? ctx.system.fetch : window.fetch;
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchFn(url, { signal: controller.signal });
        clearTimeout(id);
        return response;
      } catch (e) {
        clearTimeout(id);
        throw e;
      }
    }
// 核心翻译路由
    async function translateSmart(text, targetLang) {
      if (!text || !text.trim() || targetLang === "none") return "";
      const raw = text.trim();
// 1. 精准高频词直出
      const dictMatch = QUICK_DICT[raw] || QUICK_DICT[raw.replace(/[。！？，~\s]/g, "")];
      if (dictMatch && dictMatch[targetLang]) {
        return dictMatch[targetLang];
      }
// 2. 粤语口语深度引擎转换
      if (targetLang === "粤语") {
        return convertToColloquialCantonese(raw);
      }
const targetCode = CODE_MAP[targetLang] || "en";
// 3. 多通道外语翻译引擎
      try {
        const urlA = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetCode}&dt=t&q=${encodeURIComponent(raw)}`;
        const resA = await fetchWithTimeout(urlA, 3500);
        const dataA = await resA.json();
        if (dataA && dataA[0]) {
          const transA = dataA[0].map((item) => item[0]).filter(Boolean).join("").trim();
          if (transA) return transA;
        }
      } catch (e) {
        ctx.system.log("通道A切换:", e);
      }
try {
        const urlB = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(raw)}&langpair=zh-CN|${targetCode}`;
        const resB = await fetchWithTimeout(urlB, 3500);
        const dataB = await resB.json();
        if (dataB?.responseData?.translatedText) {
          let transB = dataB.responseData.translatedText.trim();
          if (transB && !transB.startsWith("MYMEMORY WARNING")) {
            const parser = new DOMParser();
            const dom = parser.parseFromString(transB, "text/html");
            return dom.body.textContent || transB;
          }
        }
      } catch (e) {
        ctx.system.log("通道B切换:", e);
      }
return raw;
    }
// 格式化为 [外语 | 中文]
    function formatBilingualText(foreignText, originText) {
      if (!originText || foreignText === originText) return foreignText;
      return `${foreignText} | ${originText}`;
    }
// 会话侦测
    ctx.hooks.on("session.opened", (p) => {
      if (p?.sessionId) currentSessionId = p.sessionId;
    });
    ctx.hooks.on("message.persisted", (p) => {
      if (p?.message?.sessionId) currentSessionId = p.message.sessionId;
    });
function getActiveSessionId() {
      if (currentSessionId) return currentSessionId;
      try {
        const list = ctx.data.sessions.list();
        if (list && list.length > 0) {
          return list[0].id || list[0].sessionId;
        }
      } catch (e) {}
      return null;
    }
function getSessionTargetLang(sessionId) {
      const sid = sessionId || getActiveSessionId();
      if (!sid) return ctx.system.settings.get("defaultLang") || "none";
      const sess = ctx.data.sessions.get(sid);
      const targetId = sess?.contactId || sess?.characterId || sid;
      const custom = ctx.system.storage.get("lang_char_" + targetId);
      if (custom && custom !== "inherit") {
        return custom;
      }
      return ctx.system.settings.get("defaultLang") || "none";
    }
function getCurrentTargetInfo() {
      const sid = getActiveSessionId();
      if (!sid) return { name: "全局", id: null };
      const sess = ctx.data.sessions.get(sid);
      if (!sess) return { name: "当前会话", id: sid };
      const charId = sess.contactId || sess.characterId;
      if (charId) {
        const char = ctx.data.characters.get(charId);
        if (char) return { name: char.name || "当前角色", id: charId };
      }
      return { name: sess.name || "当前会话", id: sid };
    }
// 注入 UI 样式
    ctx.ui.injectCSS(`
      /* 🌸 纯净樱花花瓣悬浮球 */
      .ft-pure-sakura {
        position: fixed;
        width: 38px;
        height: 38px;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 9999;
        user-select: none;
        touch-action: none;
        font-size: 30px;
        filter: drop-shadow(0 2px 8px rgba(255, 105, 135, 0.45));
        transition: transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.3s ease;
      }
      .ft-pure-sakura:hover {
        transform: scale(1.15) rotate(10deg);
      }
      .ft-pure-sakura:active {
        transform: scale(0.95);
      }
      .ft-pure-sakura.dock-left.is-collapsed {
        transform: translateX(-50%) rotate(-25deg);
        opacity: 0.5;
      }
      .ft-pure-sakura.dock-left.is-collapsed:hover {
        transform: translateX(0) rotate(0);
        opacity: 1;
      }
      .ft-pure-sakura.dock-right.is-collapsed {
        transform: translateX(50%) rotate(25deg);
        opacity: 0.5;
      }
      .ft-pure-sakura.dock-right.is-collapsed:hover {
        transform: translateX(0) rotate(0);
        opacity: 1;
      }
/* 弹窗面板 */
      .ft-panel-mask {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(4px);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        box-sizing: border-box;
      }
      .ft-panel {
        width: 100%;
        max-width: 360px;
        background: #ffffff;
        border-radius: 22px;
        padding: 18px;
        box-shadow: 0 20px 40px rgba(255, 154, 158, 0.25);
        display: flex;
        flex-direction: column;
        gap: 11px;
        box-sizing: border-box;
        animation: ftFadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes ftFadeIn {
        from { opacity: 0; transform: scale(0.92) translateY(10px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      .ft-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .ft-title-box {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 15px;
        font-weight: 700;
        color: #334155;
      }
      .ft-free-tag {
        font-size: 10.5px;
        background: #ecfdf5;
        color: #059669;
        padding: 2px 6px;
        border-radius: 6px;
        border: 1px solid #a7f3d0;
        font-weight: 500;
      }
      .ft-close-btn {
        border: none;
        background: #f8fafc;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        font-size: 13px;
        color: #94a3b8;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
.ft-role-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #fff5f7;
        border: 1px solid #ffe4e8;
        border-radius: 12px;
        padding: 7px 10px;
        font-size: 12.5px;
        color: #64748b;
      }
      .ft-role-tag {
        font-weight: 600;
        color: #ff6b8b;
        max-width: 110px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .ft-select-sm {
        padding: 4px 7px;
        border-radius: 8px;
        border: 1px solid #ffd1dc;
        background: #fff;
        font-size: 12px;
        color: #475569;
        outline: none;
      }
.ft-textarea {
        width: 100%;
        height: 66px;
        padding: 9px;
        border-radius: 12px;
        border: 1px solid #ffd1dc;
        background: #fffafb;
        font-size: 13.5px;
        color: #1e293b;
        box-sizing: border-box;
        resize: none;
        outline: none;
      }
      .ft-textarea:focus {
        border-color: #ff758c;
        background: #fff;
      }
      .ft-btn-primary {
        background: linear-gradient(135deg, #ff758c, #ff7eb3);
        color: #fff;
        border: none;
        padding: 9px 14px;
        border-radius: 12px;
        font-size: 13.5px;
        font-weight: 600;
        cursor: pointer;
        text-align: center;
        box-shadow: 0 4px 12px rgba(255, 117, 140, 0.3);
      }
      .ft-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
      
      .ft-result-box {
        background: #fffafb;
        border-radius: 12px;
        padding: 10px;
        font-size: 13px;
        color: #334155;
        min-height: 48px;
        max-height: 110px;
        overflow-y: auto;
        white-space: pre-wrap;
        word-break: break-word;
        border: 1px dashed #ffb7c5;
      }
      .ft-btn-row {
        display: flex;
        gap: 8px;
      }
      .ft-btn-sub {
        flex: 1;
        padding: 7px 10px;
        background: #fff5f7;
        border: 1px solid #ffd1dc;
        border-radius: 10px;
        font-size: 12.5px;
        font-weight: 600;
        color: #ff6b8b;
        cursor: pointer;
      }
      .ft-btn-sub:active { background: #ffe4e8; }
      
      .ft-toggle-area {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-top: 4px;
        border-top: 1px solid #f8fafc;
        font-size: 12px;
        color: #64748b;
      }
      .ft-switch-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
    `);
// 1. 樱花花瓣悬浮球
    const ball = document.createElement("div");
    ball.className = "ft-pure-sakura";
    ball.innerHTML = "🌸";
    ball.title = "随身翻译球";
const savedPos = ctx.system.storage.get("ballPos") || { side: "right", top: 220 };
    ball.style.top = savedPos.top + "px";
    if (savedPos.side === "left") {
      ball.style.left = "4px";
      ball.classList.add("dock-left");
    } else {
      ball.style.right = "4px";
      ball.classList.add("dock-right");
    }
    document.body.appendChild(ball);
let idleTimer = null;
    function scheduleCollapse() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (!panelMask) {
          ball.classList.add("is-collapsed");
        }
      }, 2500);
    }
    function wakeBall() {
      ball.classList.remove("is-collapsed");
      scheduleCollapse();
    }
    scheduleCollapse();
let isDragging = false;
    let startX = 0, startY = 0;
    let initialX = 0, initialY = 0;
    let hasMoved = false;
function onPointerDown(e) {
      isDragging = true;
      hasMoved = false;
      wakeBall();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      startX = clientX;
      startY = clientY;
const rect = ball.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;
ball.classList.remove("dock-left", "dock-right", "is-collapsed");
      ball.style.left = initialX + "px";
      ball.style.right = "auto";
      ball.style.top = initialY + "px";
    }
function onPointerMove(e) {
      if (!isDragging) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = clientX - startX;
      const dy = clientY - startY;
if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        hasMoved = true;
      }
let curX = initialX + dx;
      let curY = initialY + dy;
curX = Math.max(0, Math.min(window.innerWidth - 38, curX));
      curY = Math.max(20, Math.min(window.innerHeight - 58, curY));
ball.style.left = curX + "px";
      ball.style.top = curY + "px";
      if (e.cancelable) e.preventDefault();
    }
function onPointerUp() {
      if (!isDragging) return;
      isDragging = false;
      const rect = ball.getBoundingClientRect();
      const centerX = rect.left + 19;
      const snapToLeft = centerX < window.innerWidth / 2;
      const topPos = Math.max(20, Math.min(window.innerHeight - 58, rect.top));
ball.style.top = topPos + "px";
      if (snapToLeft) {
        ball.style.left = "4px";
        ball.style.right = "auto";
        ball.classList.add("dock-left");
        ctx.system.storage.set("ballPos", { side: "left", top: topPos });
      } else {
        ball.style.left = "auto";
        ball.style.right = "4px";
        ball.classList.add("dock-right");
        ctx.system.storage.set("ballPos", { side: "right", top: topPos });
      }
      scheduleCollapse();
    }
ball.addEventListener("mousedown", onPointerDown);
    ball.addEventListener("touchstart", onPointerDown, { passive: false });
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("touchmove", onPointerMove, { passive: false });
    window.addEventListener("mouseup", onPointerUp);
    window.addEventListener("touchend", onPointerUp);
// 2. 悬浮窗面板
    let panelMask = null;
    let lastResult = "";
function openPanel() {
      if (panelMask) return;
      wakeBall();
panelMask = document.createElement("div");
      panelMask.className = "ft-panel-mask";
const targetInfo = getCurrentTargetInfo();
      const curEffectiveLang = getSessionTargetLang();
      const customCharLang = targetInfo.id ? (ctx.system.storage.get("lang_char_" + targetInfo.id) || "inherit") : "inherit";
const isAutoSend = ctx.system.settings.get("autoTranslateSend") !== false;
      const isBilingual = ctx.system.settings.get("bilingualMode") !== false;
      const defaultQuickLang = (curEffectiveLang && curEffectiveLang !== "none") ? curEffectiveLang : "粤语";
panelMask.innerHTML = `
        <div class="ft-panel">
          <div class="ft-header">
            <div class="ft-title-box">
              <span>🌸 随身翻译助手</span>
              <span class="ft-free-tag">地道粤语</span>
            </div>
            <button class="ft-close-btn" id="ftClose">✕</button>
          </div>
<!-- 角色专属设置 -->
          <div class="ft-role-bar">
            <span>当前角色: <span class="ft-role-tag">${targetInfo.name}</span></span>
            <select class="ft-select-sm" id="ftCharLangSelect">
              <option value="inherit">跟随全局 (保持中文)</option>
              <option value="none" ${customCharLang === "none" ? "selected" : ""}>🚫 保持中文 (不翻译)</option>
              <option disabled>──────────</option>
              ${LANG_OPTIONS.map(o => `<option value="${o.value}" ${customCharLang === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
            </select>
          </div>
<!-- 手动即时翻译 -->
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:12px; color:#64748b;">手动翻译为:</span>
            <select class="ft-select-sm" id="ftQuickLang">
              ${LANG_OPTIONS.map(o => `<option value="${o.value}" ${defaultQuickLang === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
            </select>
          </div>
<textarea class="ft-textarea" id="ftInput" placeholder="输入你想翻译的中文（如：我一会儿到家）..."></textarea>
          <button class="ft-btn-primary" id="ftRunTranslate">⚡ 立即翻译 (0消耗)</button>
<div class="ft-result-box" id="ftResultBox">翻译结果将在这里展示...</div>
<div class="ft-btn-row">
            <button class="ft-btn-sub" id="ftCopy">📋 复制</button>
            <button class="ft-btn-sub" id="ftSend">💬 发送到聊天</button>
          </div>
<div class="ft-toggle-area">
            <div class="ft-switch-row">
              <span>⚡ 聊天输入自动翻译 (仅对设置了外语的角色生效)</span>
              <input type="checkbox" id="ftAutoSend" ${isAutoSend ? "checked" : ""} />
            </div>
            <div class="ft-switch-row">
              <span>📜 [外语 | 中文] 极简双语格式</span>
              <input type="checkbox" id="ftBilingual" ${isBilingual ? "checked" : ""} />
            </div>
          </div>
        </div>
      `;
document.body.appendChild(panelMask);
const closeBtn = panelMask.querySelector("#ftClose");
      const charLangSelect = panelMask.querySelector("#ftCharLangSelect");
      const quickLang = panelMask.querySelector("#ftQuickLang");
      const inputEl = panelMask.querySelector("#ftInput");
      const runBtn = panelMask.querySelector("#ftRunTranslate");
      const resultBox = panelMask.querySelector("#ftResultBox");
      const copyBtn = panelMask.querySelector("#ftCopy");
      const sendBtn = panelMask.querySelector("#ftSend");
      const autoSendCb = panelMask.querySelector("#ftAutoSend");
      const bilingualCb = panelMask.querySelector("#ftBilingual");
panelMask.addEventListener("click", (e) => {
        if (e.target === panelMask) closePanel();
      });
      closeBtn.addEventListener("click", closePanel);
charLangSelect.addEventListener("change", (e) => {
        const val = e.target.value;
        if (targetInfo.id) {
          ctx.system.storage.set("lang_char_" + targetInfo.id, val);
          const langName = val === "inherit" || val === "none" ? "保持中文" : val;
          ctx.ui.toast(`已将 [${targetInfo.name}] 设置为: ${langName} 🌸`);
        }
      });
autoSendCb.addEventListener("change", (e) => {
        ctx.system.settings.set("autoTranslateSend", e.target.checked);
      });
      bilingualCb.addEventListener("change", (e) => {
        ctx.system.settings.set("bilingualMode", e.target.checked);
      });
// 执行翻译
      runBtn.addEventListener("click", async () => {
        const text = inputEl.value.trim();
        if (!text) {
          ctx.ui.toast("请输入中文内容~");
          return;
        }
        runBtn.disabled = true;
        runBtn.textContent = "翻译中...";
        resultBox.textContent = "正在地道翻译中...";
        try {
          const res = await translateSmart(text, quickLang.value);
          lastResult = res;
          resultBox.textContent = res || "(无内容)";
        } catch (e) {
          resultBox.textContent = "翻译遇到问题，请重试。";
        } finally {
          runBtn.disabled = false;
          runBtn.textContent = "⚡ 立即翻译 (0消耗)";
        }
      });
copyBtn.addEventListener("click", () => {
        if (!lastResult) {
          ctx.ui.toast("暂无翻译结果~");
          return;
        }
        if (navigator.clipboard) {
          navigator.clipboard.writeText(lastResult);
        }
        ctx.ui.toast("已复制到剪贴板！📋");
      });
sendBtn.addEventListener("click", () => {
        if (!lastResult) {
          ctx.ui.toast("请先点击翻译生成结果~");
          return;
        }
        const sid = getActiveSessionId();
        if (!sid) {
          ctx.ui.toast("当前没有可发送的聊天会话~");
          return;
        }
const origin = inputEl.value.trim();
        const isBilingual = ctx.system.settings.get("bilingualMode") !== false;
        const finalContent = isBilingual ? formatBilingualText(lastResult, origin) : lastResult;
ctx.data.messages.push({
          sessionId: sid,
          role: "user",
          content: finalContent,
        });
        ctx.ui.toast("已发送到聊天！🌸");
        closePanel();
      });
setTimeout(() => inputEl.focus(), 50);
    }
function closePanel() {
      if (panelMask) {
        panelMask.remove();
        panelMask = null;
        scheduleCollapse();
      }
    }
ball.addEventListener("click", () => {
      if (hasMoved) return;
      if (panelMask) closePanel();
      else openPanel();
    });
// 3. 用户消息发送前自动翻译
    ctx.hooks.transform("user.beforeSend", async (payload) => {
      const isAuto = ctx.system.settings.get("autoTranslateSend") !== false;
      if (!isAuto || !payload.text || !payload.text.trim()) return payload;
const targetLang = getSessionTargetLang(payload.sessionId);
      if (!targetLang || targetLang === "none" || targetLang === "不翻译") {
        return payload;
      }
if (payload.text.includes(" | ") || !/[\u4e00-\u9fa5]/.test(payload.text)) {
        return payload;
      }
const isBilingual = ctx.system.settings.get("bilingualMode") !== false;
try {
        const originText = payload.text.trim();
        const translated = await translateSmart(originText, targetLang);
        if (translated && translated !== originText) {
          if (isBilingual) {
            payload.text = formatBilingualText(translated, originText);
          } else {
            payload.text = translated;
          }
        }
      } catch (err) {
        ctx.system.log("自动翻译失败:", err);
      }
return payload;
    }, { priority: 90, timeoutMs: 5000 });
// 卸载与清理
    return () => {
      clearTimeout(idleTimer);
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("touchmove", onPointerMove);
      window.removeEventListener("mouseup", onPointerUp);
      window.removeEventListener("touchend", onPointerUp);
      ball.remove();
      closePanel();
    };
  },
};
