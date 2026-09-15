export default {
  manifest: {
    id: "focus-notes-floating-ball",
    name: "一刻清单悬浮球",
    apiVersion: 1,
    version: "1.17.0",
    author: "koi",
    description: "显示一刻清单计时，并向用户授权的单聊角色追加一刻上下文。",
    permissions: ["chat.read", "ui", "storage"]
  },
  setup(ctx) {
    const CHANNEL = "focus-notes-floating-v1";
    const SIZE = 62;
    let state = ctx.system.storage.get("timer");
    let context = ctx.system.storage.get("context");
    let expired = ctx.system.storage.get("expired");
    let immersive = false;
    if (state) {
      state.pending = false;
      state.focusPolicy = "strict";
    }
    let position = ctx.system.storage.get("position") || { x: 1, y: 0.82 };
    let drag = null;
    let ignoreClick = false;

    const ball = document.createElement("button");
    ball.type = "button";
    ball.className = "focus-notes-global-ball";
    ball.setAttribute("aria-label", "暂停计时");
    const timeText = document.createElement("span");
    const statusIcon = document.createElement("span");
    timeText.className = "focus-notes-global-ball__time";
    statusIcon.className = "focus-notes-global-ball__state";
    timeText.textContent = "00:00:00";
    statusIcon.dataset.state = "running";
    ball.append(timeText, statusIcon);
    document.body.appendChild(ball);

    ctx.ui.injectCSS(`
      .focus-notes-global-ball{position:fixed;z-index:2147482000;width:${SIZE}px;height:${SIZE}px;padding:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:4px;touch-action:none;border:2px solid #dedede;border-radius:50%;background:radial-gradient(circle at center,#fff 0 66%,#fafafa 82%,#f0f0f0 100%);color:#090909;box-shadow:0 10px 28px rgba(0,0,0,.16);cursor:grab}
      .focus-notes-global-ball__time{font:700 9px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}
      .focus-notes-global-ball__state{position:relative;display:block;width:12px;height:10px}
      .focus-notes-global-ball__state[hidden]{display:none}
      .focus-notes-global-ball__state[data-state="running"]:before{content:"";position:absolute;top:1px;left:3px;width:2px;height:8px;background:#090909;box-shadow:4px 0 #090909}
      .focus-notes-global-ball__state[data-state="paused"]:before{content:"";position:absolute;top:1px;left:3px;border-top:4px solid transparent;border-bottom:4px solid transparent;border-left:7px solid #090909}
      .focus-notes-global-ball.landscape>span{transform:rotate(90deg)}
      .focus-notes-global-ball:active{cursor:grabbing}
    `);

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, Number(value) || 0));
    }

    function phone() {
      return document.querySelector('[data-ui="phone-screen"]');
    }

    function appFrames() {
      return Array.from(document.querySelectorAll('iframe[title="一刻清单"]'));
    }

    function requestContext() {
      appFrames().forEach(frame => frame.contentWindow.postMessage({ source: CHANNEL, type: "context-request", appId: "focus.notes" }, "*"));
    }

    function safe(value) {
      return String(value == null ? "" : value).replace(/\s+/g, " ").replace(/[<>&]/g, char => ({ "<": "＜", ">": "＞", "&": "＆" })[char]).slice(0, 160);
    }

    const SNAPSHOT_FIELDS = ["更新时间", "当前计时", "最近计时结果", "过去7天概况", "过去7天计时结果", "未来7天安排", "逾期安排", "未绑定清单", "全部未完成清单", "月年专注概况", "最近计时记录"];

    function contextPrompt(snapshot, useLiveTimer = true) {
      const modeNames = { stopwatch: "正计时", pomodoro: "番茄", countdown: "倒计时" };
      const timer = { ...(snapshot.timer || {}) };
      if (useLiveTimer && timer.active && state && (!timer.sessionId || timer.sessionId === state.sessionId) && (!expired || expired.sessionId !== state.sessionId)) {
        timer.running = state.running;
        timer.mode = state.mode;
        timer.seconds = Math.round(valueNow());
        timer.status = state.running ? "进行中" : "已暂停";
        timer.focusPolicy = state.focusPolicy === "relaxed" ? "轻松" : "严格";
      }
      const linked = timer.linked === true || (timer.linked == null && Boolean(timer.title));
      const timerLine = !timer.active
        ? "当前计时：没有正在进行或暂停中的计时。"
        : `当前计时：${linked ? `已绑定清单“${safe(timer.title)}”` : "明确未绑定任何清单"}；${modeNames[timer.mode] || "计时"}；${safe(timer.phase)}；${safe(timer.status)}；${timer.mode === "stopwatch" ? "已进行" : "剩余"}${format(timer.seconds)}；${safe(timer.focusPolicy)}模式。`;
      const focus = snapshot.focus || {};
      const checklist = Array.isArray(snapshot.checklist) ? snapshot.checklist.filter(item => !item.done) : [];
      const checklistLines = checklist.map(item => {
        const dates = Array.isArray(item.completedDates) && item.completedDates.length ? `；重复项已完成日期=${item.completedDates.join("、")}` : "";
        return `- ${safe(item.title)}｜${item.unbound ? "未绑定日期" : `日期=${safe(item.scheduledDate)}`}｜重复=${safe(item.repeat || "否")}｜累计专注=${Number(item.focusCount) || 0}次/${Number(item.focusMinutes) || 0}分钟${dates}`;
      });
      const latest = snapshot.lastTimerOutcome;
      const latestLine = latest ? `最近计时结果：${safe(latest.title)}；${safe(latest.type)}；实际${format(latest.seconds)}；结束于${safe(latest.endedAt)}。` : "最近还没有计时结果。";
      const week = snapshot.week || {};
      const weekSummary = week.summary || focus.week || {};
      const outcomeLines = (Array.isArray(snapshot.recentOutcomes) ? snapshot.recentOutcomes : []).slice(0, 12).map(item => `- ${safe(item.endedAt)}｜${safe(item.title)}｜${safe(item.type)}｜${format(item.seconds)}`);
      const upcomingLines = (Array.isArray(snapshot.upcoming) ? snapshot.upcoming : []).map(item => `- ${safe(item.date)}｜${safe(item.title)}${item.repeat ? `｜${safe(item.repeat)}` : ""}`);
      const overdueLines = (Array.isArray(snapshot.overdue) ? snapshot.overdue : []).map(item => `- ${safe(item.date)}｜${safe(item.title)}`);
      const unbound = Array.isArray(snapshot.unbound) ? snapshot.unbound : [];
      const records = Array.isArray(snapshot.recentRecords) ? snapshot.recentRecords : [];
      const recordLines = records.map(item => `- ${safe(item.startedAt)}｜${safe(item.title)}｜${modeNames[item.mode] || "计时"}｜${safe(item.reason || "完成")}｜${Number(item.minutes) || 0}分钟`);
      const todaySummary = focus.today || {};
      const monthSummary = focus.month || {};
      const yearSummary = focus.year || {};
      const sections = {
        更新时间: `数据更新时间：${safe(snapshot.updatedAt)}`,
        当前计时: timerLine,
        最近计时结果: latestLine,
        过去7天概况: `专注概况：今天${Number(todaySummary.count) || 0}次/${Number(todaySummary.minutes) || 0}分钟；过去7天${Number(weekSummary.count) || 0}次/${Number(weekSummary.minutes) || 0}分钟，完成${Number(weekSummary.completedItems) || 0}项清单。`,
        过去7天计时结果: [`过去7天的重要计时结果（${outcomeLines.length}条）：`, ...(outcomeLines.length ? outcomeLines : ["- 暂无重要结果"])].join("\n"),
        未来7天安排: [`未来7天安排（${upcomingLines.length}项）：`, ...(upcomingLines.length ? upcomingLines : ["- 暂无已绑定安排"])].join("\n"),
        逾期安排: [`逾期安排（${overdueLines.length}项）：`, ...(overdueLines.length ? overdueLines : ["- 暂无逾期安排"])].join("\n"),
        未绑定清单: `未绑定清单（${unbound.length}项）：${unbound.length ? unbound.map(safe).join("、") : "暂无"}`,
        全部未完成清单: [`全部未完成清单索引（${checklist.length}项）：`, ...(checklistLines.length ? checklistLines : ["- 暂无清单项"])].join("\n"),
        月年专注概况: `长期专注概况：本月${Number(monthSummary.count) || 0}次/${Number(monthSummary.minutes) || 0}分钟；今年${Number(yearSummary.count) || 0}次/${Number(yearSummary.minutes) || 0}分钟。`,
        最近计时记录: [`最近计时记录（${records.length}条）：`, ...(recordLines.length ? recordLines : ["- 暂无计时记录"])].join("\n")
      };
      const content = SNAPSHOT_FIELDS.map(field => sections[field]).join("\n\n");
      const behavior = timer.active && linked && timer.running
        ? `- 当前计时明确绑定“${safe(timer.title)}”：这是 {{user}} 此刻正在做的事情。直接把它视为当前活动，不要再询问 {{user}} 正在做什么，也不要猜测其他事项。`
        : timer.active && linked
          ? `- 已绑定“${safe(timer.title)}”的计时当前处于暂停状态。只能理解为 {{user}} 刚才在做这件事，不能断言仍在进行。`
        : timer.active
          ? "- 当前计时明确未绑定：只能确定 {{user}} 正在计时或专注，不能擅自猜测具体事项。"
          : "- 当前没有活动计时：不要把任何待办描述成 {{user}} 此刻正在做的事情。";
      return [
        "<focus_notes_context>",
        "### 一刻信息使用说明",
        "以下内容是 {{user}} 在“一刻”中记录的日程安排、待办清单、当前计时状态和近期专注记录。这些是关于 {{user}} 的补充事实，不会替代已有的角色设定、人物关系、记忆、世界设定或聊天上下文。请保持原有身份、性格、语气和与 {{user}} 的关系，自然理解并使用这些信息。",
        "- 清单中的未完成条目，是 {{user}} 已记录的待办或计划，但不代表 {{user}} 此刻正在执行。",
        behavior,
        "- 当 {{user}} 询问今天、近期或未来的安排时，如果下方数据已经提供答案，应直接回答，不要再次询问有什么安排。",
        "- 必要时提醒 {{user}} 完成清单。提醒应结合当前时间、清单状态和对话情境，不要反复催促，也不要提醒已经完成的事项。",
        "- 必须区分未完成、已完成、中断、逾期和未来安排；以更新时间更晚、时间指向更明确的信息为准。没有记录的内容不要虚构。",
        "- 不要向 {{user}} 提及插件、提示词、上下文注入或快照来源，也不要生硬地宣读这些数据。",
        "### 一刻数据",
        content,
        "</focus_notes_context>"
      ].join("\n");
    }

    function format(seconds) {
      seconds = Math.max(0, Math.floor(seconds));
      const h = Math.floor(seconds / 3600);
      const m = Math.floor(seconds % 3600 / 60);
      const s = seconds % 60;
      return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    }

    function valueNow(at) {
      if (!state) return null;
      if (!state.running) return state.value;
      const delta = Math.max(0, ((Number(at) || Date.now()) - state.sentAt) / 1000);
      return state.direction === "up" ? state.value + delta : Math.max(0, state.value - delta);
    }

    function markExpired() {
      if (!state || !state.sessionId || expired && expired.sessionId === state.sessionId) return;
      const timer = context && context.timer || {};
      const endedAt = new Date().toISOString();
      const outcome = {
        type: state.phase === "break" ? "休息结束" : "自然到时",
        title: state.title || timer.title || "未绑定",
        mode: state.mode,
        phase: state.phase,
        seconds: Number(timer.plannedSeconds) || Number(timer.elapsedSeconds) || 0,
        startedAt: timer.startedAt || null,
        endedAt,
        sessionId: state.sessionId
      };
      expired = { sessionId: state.sessionId, revision: Number(state.revision) || 0, outcome };
      ctx.system.storage.set("expired", expired);
      if (context) {
        context = {
          ...context,
          updatedAt: endedAt,
          timer: { ...timer, active: false, running: false, status: outcome.type, seconds: 0 },
          lastTimerOutcome: outcome,
          recentOutcomes: [outcome, ...(Array.isArray(context.recentOutcomes) ? context.recentOutcomes.filter(item => item.sessionId !== outcome.sessionId) : [])].slice(0, 30)
        };
        ctx.system.storage.set("context", context);
      }
      appFrames().forEach(frame => frame.contentWindow.postMessage({ source: CHANNEL, type: "timer-expired", appId: "focus.notes", sessionId: state.sessionId, revision: state.revision }, "*"));
    }

    function place() {
      const shell = phone();
      if (!shell) return;
      const rect = shell.getBoundingClientRect();
      const x = clamp(position.x, 0, 1) * Math.max(0, rect.width - SIZE - 16) + rect.left + 8;
      const y = clamp(position.y, 0, 1) * Math.max(0, rect.height - SIZE - 16) + rect.top + 8;
      ball.style.left = x + "px";
      ball.style.top = y + "px";
    }

    function render() {
      const shell = phone();
      if (appFrames().length === 0) {
        immersive = false;
        ball.classList.remove("landscape");
      }
      const value = valueNow();
      if (state && state.running && state.direction === "down" && value <= 0) {
        markExpired();
        state.running = false;
        state.visible = false;
        state.pending = false;
        ctx.system.storage.set("timer", state);
        ball.style.display = "none";
        return;
      }
      if (!shell || immersive || value === null || !state.visible || state.enabled === false) {
        ball.style.display = "none";
        return;
      }
      const interactive = state.focusPolicy === "relaxed";
      timeText.textContent = format(value);
      statusIcon.dataset.state = state.running ? "running" : "paused";
      statusIcon.hidden = !interactive;
      ball.setAttribute("aria-disabled", interactive ? "false" : "true");
      ball.setAttribute("aria-label", interactive ? (state.running ? "暂停计时" : "继续计时") : "严格模式计时，仅可拖动");
      ball.style.display = "flex";
      place();
    }

    function sendControl(target) {
      const sentAt = Date.now();
      const value = valueNow(sentAt);
      if (value === null || !target) return;
      state.value = value;
      state.sentAt = sentAt;
      target.postMessage({
        source: CHANNEL,
        type: "control",
        appId: "focus.notes",
        running: state.running,
        mode: state.mode,
        direction: state.direction,
        value: state.value,
        sentAt: state.sentAt,
        revision: Number(state.revision) || 0,
        commandAt: Number(state.lastActionAt) || Date.now()
      }, "*");
    }

    function receive(event) {
      const data = event.data;
      if (!data || data.source !== CHANNEL || data.appId !== "focus.notes") return;
      const fromFrame = appFrames().some(frame => frame.contentWindow === event.source);
      if (!fromFrame) return;
      if (data.type === "immersive") {
        immersive = data.active === true;
        render();
        return;
      }
      if (data.type === "orientation") {
        ball.classList.toggle("landscape", data.landscape === true);
        return;
      }
      if (data.type === "context-preview-request") {
        const previews = (Array.isArray(data.snapshots) ? data.snapshots : []).slice(0, 3).filter(snapshot => snapshot && snapshot.snapshotId).map(snapshot => ({ snapshotId: snapshot.snapshotId, prompt: contextPrompt(snapshot, false) }));
        event.source.postMessage({ source: CHANNEL, type: "context-preview", appId: "focus.notes", previews }, "*");
        return;
      }
      if (data.type === "context-sync") {
        const snapshot = data.snapshot;
        if (!snapshot || !Array.isArray(snapshot.awareCharacterIds) || !Array.isArray(snapshot.checklist)) return;
        if (expired && snapshot.timer && snapshot.timer.active && snapshot.timer.sessionId === expired.sessionId) {
          context = { ...snapshot, timer: { ...snapshot.timer, active: false, running: false, status: expired.outcome.type, seconds: 0 }, lastTimerOutcome: expired.outcome, recentOutcomes: [expired.outcome, ...(Array.isArray(snapshot.recentOutcomes) ? snapshot.recentOutcomes.filter(item => item.sessionId !== expired.sessionId) : [])].slice(0, 30) };
        } else {
          context = snapshot;
          if (expired && (!snapshot.timer || !snapshot.timer.active || snapshot.timer.sessionId !== expired.sessionId)) {
            expired = null;
            ctx.system.storage.remove("expired");
          }
        }
        ctx.system.storage.set("context", context);
        return;
      }
      if (data.type === "control-ack") {
        if (state && Number(data.lastActionAt) >= (Number(state.lastActionAt) || 0)) {
          state.pending = false;
          state.revision = Math.max(Number(state.revision) || 0, Number(data.revision) || 0);
          state.lastActionAt = Math.max(Number(state.lastActionAt) || 0, Number(data.lastActionAt) || 0);
          if (data.accepted === false) {
            state.visible = data.visible === true;
            state.running = data.running === true;
            state.mode = ["stopwatch", "pomodoro", "countdown"].includes(data.mode) ? data.mode : "countdown";
            state.direction = data.direction === "up" ? "up" : "down";
            state.focusPolicy = data.focusPolicy === "relaxed" ? "relaxed" : "strict";
            state.value = clamp(data.value, 0, 3599999);
            state.sentAt = clamp(data.sentAt, 1, Date.now() + 60000);
          }
          ctx.system.storage.set("timer", state);
          render();
        }
        return;
      }
      if (data.type !== "timer") return;
      if (state && state.pending) {
        if ((Number(data.lastActionAt) || 0) > (Number(state.lastActionAt) || 0)) {
          state.pending = false;
        } else {
          sendControl(event.source);
          return;
        }
      }
      const previous = state;
      state = {
        enabled: data.enabled !== false,
        visible: data.visible === true,
        running: data.running === true,
        mode: ["stopwatch", "pomodoro", "countdown"].includes(data.mode) ? data.mode : "countdown",
        phase: data.phase === "break" ? "break" : "focus",
        direction: data.direction === "up" ? "up" : "down",
        focusPolicy: data.focusPolicy === "relaxed" ? "relaxed" : "strict",
        sessionId: String(data.sessionId || ""),
        title: String(data.title || ""),
        value: clamp(data.value, 0, 3599999),
        sentAt: clamp(data.sentAt, 1, Date.now() + 60000),
        revision: Number(data.revision) || 0,
        lastActionAt: Number(data.lastActionAt) || 0,
        pending: false
      };
      if (!previous || previous.enabled !== state.enabled || previous.visible !== state.visible || previous.running !== state.running || previous.mode !== state.mode || previous.direction !== state.direction || previous.focusPolicy !== state.focusPolicy || previous.sessionId !== state.sessionId) {
        ctx.system.storage.set("timer", state);
      }
      render();
    }

    function toggleTimer() {
      if (ignoreClick) {
        ignoreClick = false;
        return;
      }
      const actionAt = Date.now();
      const value = valueNow(actionAt);
      if (value === null) return;
      if (state.enabled === false) return;
      if (state.focusPolicy !== "relaxed") return;
      state.value = value;
      state.sentAt = actionAt;
      state.running = !state.running;
      state.visible = true;
      state.pending = true;
      state.revision = (Number(state.revision) || 0) + 1;
      state.lastActionAt = actionAt;
      ctx.system.storage.set("timer", state);
      appFrames().forEach(frame => sendControl(frame.contentWindow));
      render();
      ctx.ui.toast(state.running ? "继续计时" : "已暂停");
    }

    ball.addEventListener("click", toggleTimer);
    ball.addEventListener("pointerdown", event => {
      const rect = ball.getBoundingClientRect();
      drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, startX: event.clientX, startY: event.clientY, moved: false };
      ball.setPointerCapture(event.pointerId);
    });
    ball.addEventListener("pointermove", event => {
      if (!drag) return;
      const shell = phone();
      if (!shell) return;
      const rect = shell.getBoundingClientRect();
      const maxX = Math.max(1, rect.width - SIZE - 16);
      const maxY = Math.max(1, rect.height - SIZE - 16);
      const x = clamp(event.clientX - rect.left - drag.dx - 8, 0, maxX);
      const y = clamp(event.clientY - rect.top - drag.dy - 8, 0, maxY);
      if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) > 4) drag.moved = true;
      position = { x: x / maxX, y: y / maxY };
      place();
    });
    ball.addEventListener("pointerup", () => {
      if (drag && drag.moved) {
        ignoreClick = true;
        ctx.system.storage.set("position", position);
      }
      drag = null;
    });

    window.addEventListener("message", receive);
    window.addEventListener("resize", place);
    ctx.hooks.transform("prompt.system", payload => {
      if (payload.isGroup || !context || !Array.isArray(context.awareCharacterIds) || !context.awareCharacterIds.map(String).includes(String(payload.characterId || ""))) return payload;
      payload.hint = [payload.hint, contextPrompt(context)].filter(Boolean).join("\n\n");
      return payload;
    }, { priority: 100 });
    ctx.hooks.on("session.opened", payload => { if (!payload.isGroup) requestContext(); });
    ctx.system.timers.setInterval(render, 250);
    ctx.system.timers.setTimeout(requestContext, 300);
    render();

    return () => {
      window.removeEventListener("message", receive);
      window.removeEventListener("resize", place);
      ball.remove();
    };
  }
};
