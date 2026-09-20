export default {
  manifest: {
    id: "universal-voice-input-pro",
    name: "硅基流动语音转写",
    apiVersion: 1,
    version: "3.6.0",
    permissions: ["chat.read", "network"],
    settings: [
      { key: "apiKey", label: "API Key", type: "text", default: "" },
      { key: "modelName", label: "模型", type: "text", default: "FunAudioLLM/SenseVoiceSmall" },
      { key: "showFab", label: "显示悬浮球", type: "boolean", default: true },
      { key: "autoSend", label: "直接发送", type: "boolean", default: false }
    ]
  },
  setup(ctx) {
    const API = "https://api.siliconflow.cn/v1/audio/transcriptions";
    const WARM = "https://api.siliconflow.cn/v1/models";
    const TIMEOUT = 90000;
    let sessionId = null;
    let rec = null;
    let chunks = [];
    let tick = null;
    let phase = "idle";
    let startT = 0;
    let target = null;

    function log() {
      try {
        var a = [].slice.call(arguments);
        ctx.system.log.apply(ctx.system, ["[语音]"].concat(a));
      } catch (e) {}
    }
    function now() { return Date.now(); }
    function getKey() {
      var raw = (ctx.system.settings.get("apiKey") || "").trim();
      return raw.replace(/^Bearer\s+/i, "").replace(/[\s"']/g, "");
    }
    function getModel() {
      return (ctx.system.settings.get("modelName") || "FunAudioLLM/SenseVoiceSmall").trim();
    }

    var css = [
      ".xfv{position:fixed;width:44px;height:44px;border-radius:50%;",
      "background:rgba(30,41,59,.92);color:#e2e8f0;display:none;",
      "align-items:center;justify-content:center;font-size:22px;",
      "box-shadow:0 6px 18px rgba(0,0,0,.35);",
      "border:1px solid rgba(255,255,255,.22);",
      "z-index:2147483647;touch-action:none;user-select:none;",
      "-webkit-tap-highlight-color:transparent;}",
      ".xfv.on{display:flex}",
      ".xfv.rec{background:rgba(220,38,38,.95)!important;color:#fff!important}",
      ".xfv.start{background:rgba(245,158,11,.9)!important;color:#fff!important}",
      ".xfv-cap{position:fixed;top:55px;left:50%;",
      "transform:translateX(-50%);background:rgba(24,24,28,.94);",
      "color:#f4f4f5;padding:8px 16px;border-radius:99px;",
      "display:none;z-index:2147483646;font-size:13px;",
      "pointer-events:none;max-width:90vw;white-space:nowrap;",
      "overflow:hidden;text-overflow:ellipsis}",
      ".xfv-cap.on{display:block}"
    ].join("");
    ctx.ui.injectCSS(css);

    var cap = document.createElement("div");
    cap.className = "xfv-cap";
    document.body.appendChild(cap);

    var fab = document.createElement("div");
    fab.className = "xfv";
    fab.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>';
    document.body.appendChild(fab);

    var fx = window.innerWidth - 56;
    var fy = window.innerHeight - 170;
    var pos = ctx.system.storage.get("p");
    if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
      fx = pos.x; fy = pos.y;
    }
    function clamp() {
      fx = Math.max(8, Math.min(window.innerWidth - 60, fx));
      fy = Math.max(50, Math.min(window.innerHeight - 68, fy));
      fab.style.left = fx + "px";
      fab.style.top = fy + "px";
    }
    clamp();

    // ============ 设置页：网络诊断 ============
    ctx.ui.slot("settings.section", function (container) {
      container.style.cssText = "margin-top:14px;padding:14px;background:rgba(125,125,125,0.08);border-radius:12px;border:1px solid rgba(125,125,125,0.15);";
      container.innerHTML = '<div style="font-size:13px;font-weight:600;margin-bottom:6px;">🌐 网络诊断（测 3 次）</div><div style="font-size:12px;opacity:.75;margin-bottom:8px;">点一下，会连续请求 3 次极轻量接口。看每次耗时是稳定快、稳定慢、还是忽快忽慢。</div><button id="xf-diag" style="width:100%;padding:9px;border-radius:6px;background:#2563eb;color:#fff;border:none;font-size:12px;font-weight:600;cursor:pointer;">开始诊断</button><pre id="xf-diag-out" style="margin-top:10px;padding:10px;background:rgba(0,0,0,.3);border-radius:8px;font-size:12px;white-space:pre-wrap;word-break:break-all;color:#e2e8f0;display:none;"></pre>';
      var btn = container.querySelector("#xf-diag");
      var out = container.querySelector("#xf-diag-out");
      btn.onclick = async function () {
        var k = getKey();
        out.style.display = "block";
        if (!k) { out.textContent = "请先填写 API Key"; return; }
        out.textContent = "测试中，请稍等…\n";
        for (var i = 0; i < 3; i++) {
          var t0 = now();
          try {
            var r = await fetch(WARM + "?_=" + now(), {
              headers: { Authorization: "Bearer " + k },
              cache: "no-store"
            });
            var ms = now() - t0;
            out.textContent += "第" + (i + 1) + "次: status=" + r.status + "  耗时=" + ms + "ms\n";
            log("诊断 第" + (i + 1) + "次 status=", r.status, "耗时=", ms + "ms");
          } catch (e) {
            var ms2 = now() - t0;
            out.textContent += "第" + (i + 1) + "次: 失败 " + (e && e.message) + "  耗时=" + ms2 + "ms\n";
            log("诊断 第" + (i + 1) + "次 失败：", e && e.message, "耗时=", ms2 + "ms");
          }
        }
        out.textContent += "\n判读：\n- 3次都<500ms → 链路OK，慢在转写接口（服务器排队）\n- 3次都>5s → 手机到硅基流动链路慢\n- 忽快忽慢 → 中间节点抖动，换网络/换时段";
      };
    });

    fab.addEventListener("pointerdown", function (e) {
      if (e.button) return;
      e.stopPropagation();
      e.preventDefault();
      var pid = e.pointerId;
      var sx = e.clientX;
      var sy = e.clientY;
      var bx = fx;
      var by = fy;
      var moved = false;
      try { fab.setPointerCapture(pid); } catch (x) {}
      function mv(ev) {
        if (ev.pointerId !== pid) return;
        var dx = ev.clientX - sx;
        var dy = ev.clientY - sy;
        if (!moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) moved = true;
        if (moved) { fx = bx + dx; fy = by + dy; clamp(); }
      }
      function up(ev) {
        if (ev.pointerId !== pid) return;
        fab.removeEventListener("pointermove", mv);
        fab.removeEventListener("pointerup", up);
        fab.removeEventListener("pointercancel", up);
        try { fab.releasePointerCapture(pid); } catch (x) {}
        if (moved) {
          ctx.system.storage.set("p", { x: fx, y: fy });
          return;
        }
        if (phase === "idle") start();
        else if (phase === "recording") stop();
      }
      fab.addEventListener("pointermove", mv);
      fab.addEventListener("pointerup", up);
      fab.addEventListener("pointercancel", up);
    });

    function updateVis() {
      var w = ctx.system.settings.get("showFab") !== false;
      fab.classList.toggle("on", w);
      if (w) clamp();
    }
    updateVis();
    ctx.system.timers.setInterval(updateVis, 1000);

    function findInput() {
      var el = document.querySelector(".chat-input-textarea");
      if (el) return el;
      var all = document.querySelectorAll("textarea, input[type='text']");
      for (var i = 0; i < all.length; i++) {
        var e = all[i];
        if (e.closest && e.closest(".settings-container, .plugin-settings, .modal")) continue;
        var r = e.getBoundingClientRect();
        if (r.width > 40 && r.height > 10) return e;
      }
      return null;
    }

    async function start() {
      if (phase !== "idle") return;
      phase = "starting";
      fab.classList.add("start");
      if (!getKey()) {
        phase = "idle";
        fab.classList.remove("start");
        ctx.ui.toast("请填写 API Key");
        return;
      }
      target = findInput();
      try {
        var stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { sampleRate: 16000, noiseSuppression: true, echoCancellation: true }
          });
        } catch (e) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        if (phase !== "starting") {
          stream.getTracks().forEach(function (t) { t.stop(); });
          return;
        }
        chunks = [];
        var types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
        var mime = "";
        for (var i = 0; i < types.length; i++) {
          if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(types[i])) {
            mime = types[i];
            break;
          }
        }
        var opts = { audioBitsPerSecond: 12000 };
        if (mime) opts.mimeType = mime;
        try { rec = new MediaRecorder(stream, opts); }
        catch (e2) {
          rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        }
        rec.ondataavailable = function (e) {
          if (e.data && e.data.size) chunks.push(e.data);
        };
        rec.onstop = async function () {
          var tStop = now();
          stream.getTracks().forEach(function (t) { t.stop(); });
          clearInterval(tick);
          phase = "idle";
          fab.classList.remove("rec", "start");
          cap.classList.remove("on");
          var size = 0;
          for (var j = 0; j < chunks.length; j++) size += chunks[j].size;
          var dur = tStop - startT;
          log("录音结束 时长=", dur + "ms", "字节=", size);
          if (startT && dur > 300 && size > 0) {
            var blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
            await transcribe(blob, tStop, dur);
          } else {
            ctx.ui.toast("录音太短或为空");
          }
        };
        rec.start(100);
        startT = now();
        phase = "recording";
        fab.classList.remove("start");
        fab.classList.add("rec");
        cap.textContent = "录音中…再点停止";
        cap.classList.add("on");
        tick = setInterval(function () {
          if (phase !== "recording") return;
          var s = Math.floor((now() - startT) / 1000);
          cap.textContent = "录音中 " + s + "s · 再点停止";
          if (s >= 60) stop();
        }, 500);
      } catch (err) {
        phase = "idle";
        fab.classList.remove("start", "rec");
        cap.classList.remove("on");
        log("麦克风失败", err);
        ctx.ui.toast("麦克风失败，检查权限");
      }
    }

    function stop() {
      if (phase !== "recording") return;
      phase = "stopping";
      clearInterval(tick);
      if (rec && rec.state !== "inactive") rec.stop();
      else phase = "idle";
    }

    async function postAudio(url, fd, key) {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, TIMEOUT);
      var t0 = now();
      try {
        var res = await fetch(url, {
          method: "POST",
          headers: { Authorization: "Bearer " + key },
          body: fd,
          signal: ctrl.signal
        });
        clearTimeout(timer);
        log("上传返回 status=", res.status, "网络=", (now() - t0) + "ms");
        return res;
      } catch (e) {
        clearTimeout(timer);
        log("上传失败：", e && e.message, "耗时=", (now() - t0) + "ms");
        throw e;
      }
    }

    async function transcribe(blob, tStop, durMs) {
      var k = getKey();
      var model = getModel();
      var auto = ctx.system.settings.get("autoSend") === true;
      var toast = ctx.ui.toast("识别中…", { durationMs: 0 });
      var step = "准备";
      try {
        var mime = blob.type || "audio/webm";
        var ext = "webm";
        if (mime.indexOf("mp4") !== -1) { ext = "m4a"; mime = "audio/mp4"; }
        else if (mime.indexOf("ogg") !== -1) { ext = "ogg"; mime = "audio/ogg"; }
        log("转写开始 字节=", blob.size, "模型=", model);

        var fd = new FormData();
        fd.append("file", new File([new Blob([blob], { type: mime })], "s." + ext, { type: mime }));
        fd.append("model", model);

        step = "上传中";
        var res = await postAudio(API, fd, k);
        step = "读取响应";
        var t = await res.text();
        if (!res.ok) throw new Error("[HTTP " + res.status + "] " + t.slice(0, 150));

        var d;
        try { d = JSON.parse(t); } catch (e) { d = { text: t }; }
        var text = ((d.text || d.result || "") + "").replace(/<\|.*?\|>/g, "").trim();
        if (!text) { ctx.ui.toast("没听清"); return; }

        var totalMs = now() - tStop;
        log("★ 录音" + durMs + "ms 音频 → 网络" + totalMs + "ms 出字");

        if (auto && sessionId) {
          ctx.data.messages.push({ sessionId: sessionId, role: "user", content: text });
          ctx.ui.toast("已发送");
        } else {
          var el = (target && document.contains(target)) ? target : null;
          if (!el) {
            var ae = document.activeElement;
            if (ae && ae.tagName === "TEXTAREA") el = ae;
            else el = findInput();
          }
          if (el) {
            var old = el.value || "";
            var val = old ? old + " " + text : text;
            var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
            setter.call(el, val);
            el.dispatchEvent(new Event("input", { bubbles: true }));
          }
          var sec = (totalMs / 1000).toFixed(1);
          ctx.ui.toast("✓ 共" + sec + "s " + text.slice(0, 18));
        }
      } catch (err) {
        var msg = (err && err.message) || String(err);
        log("转写失败[" + step + "]：", msg);
        if (/abort/i.test(msg)) ctx.ui.toast("超时（90秒）");
        else if (/Failed to fetch|Network/i.test(msg)) ctx.ui.toast("网络被拦截");
        else if (/30014|invalid/i.test(msg)) ctx.ui.toast("API Key 无效，去官网重拿");
        else ctx.ui.toast("失败(" + step + "): " + msg.slice(0, 50));
      } finally {
        try { toast.close(); } catch (e) {}
      }
    }

    ctx.hooks.on("session.opened", function (p) {
      if (p && p.sessionId) sessionId = p.sessionId;
    });

    return function () {
      if (fab.parentElement) fab.parentElement.removeChild(fab);
      if (cap.parentElement) cap.parentElement.removeChild(cap);
      clearInterval(tick);
      if (rec && rec.state !== "inactive") { try { rec.stop(); } catch (e) {} }
    };
  }
};