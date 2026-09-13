export default {
  manifest: {
    id: "moments-auto-face-lock",
    name: "朋友圈自动锁脸（姿态解绑版）",
    apiVersion: 1,
    version: "3.5.0",
    author: "阿念&小坊",
    description: "朋友圈自动锁脸，并解绑参考图姿态束缚，让动作与视角随文案多姿多彩，只锁五官不锁姿势。",
    permissions: ["chat.read"],
    settings: [
      {
        key: "unlockPose",
        label: "姿势动作解绑（只锁五官发型，动作自由发挥）",
        type: "boolean",
        default: true,
      },
    ],
  },

  setup(ctx) {
    // 姿势解绑约束后缀（中英双语，强效打碎姿态模仿）
    const UNLOCK_POSE_HINT =
      "，（仅参考面部五官与发型，肢体动作、构图与镜头视角根据画面描述自由变化，禁止复刻参考图姿势，face and hair reference only, dynamic pose based on prompt）";

    /**
     * 精准将 [照片:...] 转换为使用参考图，并根据设置附加姿势解绑约束
     */
    function forceUseReference(text) {
      if (!text || typeof text !== "string") return text;

      const shouldUnlock = ctx.system.settings.get("unlockPose") !== false;

      return text.replace(
        /\[照片([:：])\s*(?:(?:使用参考图|不使用参考图)[:：]\s*)?([\s\S]*?)\]/g,
        (_match, colon, originalDesc) => {
          let desc = (originalDesc || "").trim();
          
          // 如果开启了姿势解绑，且当前描述里还没有加过解绑后缀
          if (shouldUnlock && !desc.includes("face and hair reference only")) {
            desc = `${desc}${UNLOCK_POSE_HINT}`;
          }

          return `[照片${colon}使用参考图${colon}${desc}]`;
        }
      );
    }

    // 拦截朋友圈任务中的回复
    ctx.hooks.transform(
      "llm.response",
      async (payload) => {
        if (!payload.text || typeof payload.text !== "string") return payload;

        const isMoments =
          payload.purpose === "moments" ||
          payload.text.includes("[朋友圈]") ||
          /\["[^"]+"朋友圈\]/.test(payload.text);

        if (!isMoments) return payload;

        // 单人朋友圈
        if (payload.text.includes("[朋友圈]")) {
          payload.text = payload.text.replace(
            /(\[朋友圈\])([\s\S]*?)(\[\/朋友圈\])/g,
            (_all, openTag, body, closeTag) => {
              return `${openTag}${forceUseReference(body)}${closeTag}`;
            }
          );
        } else if (/\["[^"]+"朋友圈\]/.test(payload.text)) {
          // 群聊角色发朋友圈
          payload.text = payload.text.replace(
            /(\["[^"]+"朋友圈\])([\s\S]*?)(\[\/朋友圈\])/g,
            (_all, openTag, body, closeTag) => {
              return `${openTag}${forceUseReference(body)}${closeTag}`;
            }
          );
        } else if (payload.purpose === "moments") {
          payload.text = forceUseReference(payload.text);
        }

        return payload;
      },
      { priority: 1 }
    );

    // 弹窗辅助打勾
    let observer = null;
    function autoCheckModal() {
      const dialog = document.querySelector(".feed-post-edit-dialog");
      if (!dialog) return;

      const checkbox = dialog.querySelector(".feed-post-edit-check input[type='checkbox']");
      if (checkbox && !checkbox.checked && !checkbox.disabled) {
        checkbox.click();
      }
    }

    if (typeof window !== "undefined" && typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(() => autoCheckModal());
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    };
  },
};
