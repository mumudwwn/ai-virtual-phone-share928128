/**
 * 朋友圈智能锁脸插件（精准分流 · 零提示词污染版）
 * 功能：
 * 1. 露脸自拍/人物出镜：自动开启参考图锁脸；
 * 2. 纯风景/静物/第一人称POV/仅拍手拍脚等局部肢体：坚决关闭参考图，不冒人脸；
 * 3. 绝不修改或追加任何提示词，完全保留原始描述，侧脸、回眸、动作随心所欲。
 * 格式：ES Module (apiVersion: 1)
 */

export default {
  manifest: {
    id: "moments-auto-face-lock",
    name: "朋友圈智能锁脸（精准分流版）",
    apiVersion: 1,
    version: "5.0.0",
    author: "工坊驻场工程师 · 小坊",
    description: "精准识别露脸自拍与第一人称/风景视角，只在有脸时锁脸，局部特写与风景绝不误塞人像，零提示词污染。",
    permissions: ["chat.read"],
  },

  setup(ctx) {
    // 1. 明确是【第一人称视角 / 局部肢体 / 不露脸特写】的特征（优先级最高，一票否决）
    const FIRST_PERSON_OR_BODY_PART_REGEX =
      /(?:第一人称|主观视角|pov|视角|只拍|特写|一只手|单手|双手|手指|指尖|手握|手拿|手里拿|手里握|手里捧|手端|手拿着|脚踩|脚下|鞋子|鞋头|裤脚|桌面|键盘|屏幕|电脑前|方向盘)/i;

    // 2. 明确是【人脸 / 自拍 / 人像出镜】的核心特征
    const FACE_OR_PORTRAIT_REGEX =
      /(?:自拍|对镜|正脸|侧脸|侧颜|面容|容貌|五官|眉眼|眼神|眼眸|眸子|笑颜|微表情|看向镜头|看着镜头|对视|回眸|肖像|半身照|半身像|人像照|全身照|写真|模特|单人照)/i;

    // 3. 角色本人作为画面主体人物的动作/穿搭描述
    const PERSON_SUBJECT_REGEX =
      /(?:我(?:站在|坐在|躺在|靠在|走在|回过头|侧过身|身穿|穿着|披着)|少年|少女|青年|男人|女人|他|她)(?:站在|坐在|走在|看向|回眸|侧影|正脸)/i;

    /**
     * 精准判断一段图片描述是否真正需要开启人脸参考图
     */
    function isFaceVisibleInPhoto(desc) {
      if (!desc || typeof desc !== "string") return false;
      const text = desc.trim();
      if (!text) return false;

      // 规则 A：如果带有明显的第一人称/仅手部脚部特写（如“一只手拿着笔”、“第一人称脚踩滑板”）
      // 且完全没有提到“正脸/侧脸/自拍/眼神”等面部词汇 -> 判定为无脸，不使用参考图
      if (FIRST_PERSON_OR_BODY_PART_REGEX.test(text) && !FACE_OR_PORTRAIT_REGEX.test(text)) {
        return false;
      }

      // 规则 B：明确包含自拍、人脸、五官、侧颜、肖像等面部特征 -> 必须使用参考图
      if (FACE_OR_PORTRAIT_REGEX.test(text)) {
        return true;
      }

      // 规则 C：明确以人物为主体的出镜描写 -> 使用参考图
      if (PERSON_SUBJECT_REGEX.test(text)) {
        return true;
      }

      // 规则 D：其余所有纯景物、动物、食物、未提及人物的描述 -> 一律不使用参考图
      return false;
    }

    /**
     * 仅改动 [照片:使用参考图:原描述] 开关，后方原描述一字不改、原汁原味
     */
    function processPhotoDirectives(content) {
      if (!content || typeof content !== "string") return content;

      return content.replace(
        /\[照片([:：])\s*(?:(?:使用参考图|不使用参考图)[:：]\s*)?([\s\S]*?)\]/g,
        (_match, colon, originalDesc) => {
          const rawDesc = (originalDesc || "").trim();
          if (!rawDesc) return _match;

          const needReference = isFaceVisibleInPhoto(rawDesc);
          const flag = needReference ? "使用参考图" : "不使用参考图";

          // 原样拼接，绝不往 rawDesc 里塞任何额外字符
          return `[照片${colon}${flag}${colon}${rawDesc}]`;
        }
      );
    }

    // 拦截 LLM 回复中的朋友圈发帖指令
    ctx.hooks.transform(
      "llm.response",
      async (payload) => {
        if (!payload.text || typeof payload.text !== "string") return payload;

        const isMoments =
          payload.purpose === "moments" ||
          payload.text.includes("[朋友圈]") ||
          /\["[^"]+"朋友圈\]/.test(payload.text);

        if (!isMoments) return payload;

        // 1. 单人朋友圈：[朋友圈]...[/朋友圈]
        if (payload.text.includes("[朋友圈]")) {
          payload.text = payload.text.replace(
            /(\[朋友圈\])([\s\S]*?)(\[\/朋友圈\])/g,
            (_all, openTag, body, closeTag) => {
              return `${openTag}${processPhotoDirectives(body)}${closeTag}`;
            }
          );
        } else if (/\["[^"]+"朋友圈\]/.test(payload.text)) {
          // 2. 群聊角色发朋友圈：["角色名"朋友圈]...[/朋友圈]
          payload.text = payload.text.replace(
            /(\["[^"]+"朋友圈\])([\s\S]*?)(\[\/朋友圈\])/g,
            (_all, openTag, body, closeTag) => {
              return `${openTag}${processPhotoDirectives(body)}${closeTag}`;
            }
          );
        } else if (payload.purpose === "moments") {
          // 3. 后台独立发帖
          payload.text = processPhotoDirectives(payload.text);
        }

        return payload;
      },
      { priority: 1 }
    );
  },
};
