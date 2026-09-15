const PLUGIN_ID = "float-interface-skins";
const STORAGE_KEY = "state-v3";
const LIVE_STYLE_DB_NAME = "FloatInterfaceSkinsDB";
const LIVE_STYLE_STORE_NAME = "settings";
const LIVE_STYLE_RECORD_ID = "live-styles-v1";
const LIVE_STYLE_FALLBACK_KEY = `${PLUGIN_ID}:${LIVE_STYLE_RECORD_ID}`;
const MAX_FONT_FILE_BYTES = 25 * 1024 * 1024;

const REGION_DEFS = [
  { key: "appBackground", label: "背景", hint: "同一张图片可用于五个主界面，并可覆盖聊天自带背景", overflow: false, targets: [["messages", "消息"], ["contacts", "联系人"], ["feeds", "动态"], ["me", "主页"], ["chatRoom", "聊天"]] },
  { key: "topBar", label: "顶部栏", hint: "同一张图片可分别用于五个界面的顶部栏", overflow: true, targets: [["me", "主页"], ["feeds", "动态"], ["contacts", "联系人"], ["messages", "消息"], ["chatRoom", "聊天"]] },
  { key: "bottomBar", label: "底部栏", hint: "同一张图片可分别调节聊天界面和主界面", overflow: true, targets: [["inputBar", "聊天界面"], ["tabBar", "主界面"]] },
  { key: "inputField", label: "图片", hint: "同一张图片可用于聊天、消息和联系人输入框", targets: [["chatInput", "聊天"], ["searchInput", "消息"], ["formInput", "联系人"]] },
];

const IMAGE_REGION_DEFS = REGION_DEFS.filter(def => def.key !== "inputField");

const BASE_TARGETS = [
  ["messages", "消息"],
  ["contacts", "联系人"],
  ["feeds", "动态"],
  ["me", "主页"],
  ["chatRoom", "聊天"],
];

const COLOR_TARGETS = [
  { key: "activeIcon", label: "激活图标" },
  { key: "icon", label: "普通图标" },
  { key: "title", label: "标题文字" },
  { key: "text", label: "正文文字" },
  { key: "metaText", label: "辅助文字" },
];

const BUTTON_STYLE_TARGETS = [
  ["accent", "高亮"],
  ["capsule", "常态"],
];

const FONT_TARGETS = [
  { key: "title", label: "标题文字" },
  { key: "text", label: "正文文字" },
  { key: "metaText", label: "辅助文字" },
  { key: "button", label: "按钮文字" },
  { key: "input", label: "输入框文字" },
  { key: "navText", label: "图标文字" },
];

const INPUT_STYLE_TARGETS = [
  ["chatInput", "聊天"],
  ["searchInput", "消息"],
  ["formInput", "联系人"],
];

const AVATAR_TARGETS = [
  ["me", "主页"],
  ["feeds", "动态"],
  ["contacts", "联系人"],
  ["messages", "消息"],
  ["chatRoom", "聊天"],
];

const ONLINE_TOOLBAR_ICON_DEFS = [
  ["offline", "位置"],
  ["emoji", "表情"],
  ["plus", "加号"],
  ["send", "发送"],
  ["generate", "星星"],
];
const OFFLINE_TOOLBAR_ICON_DEFS = [
  ["offlineReturn", "返回线上"],
  ["offlineEmoji", "线下表情"],
  ["offlineSend", "线下发送"],
];
const TOOLBAR_ICON_DEFS = [...ONLINE_TOOLBAR_ICON_DEFS, ...OFFLINE_TOOLBAR_ICON_DEFS];
const toolbarIconSuffix = key => key.replace(/[A-Z]/g, letter => "-" + letter.toLowerCase());

function makeToolbarIconSettings() {
  const items = {};
  for (const [key] of TOOLBAR_ICON_DEFS) items[key] = { visible: true, offsetX: 0, offsetY: 0 };
  return items;
}

function colorRuleId() {
  return "color-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

function themeId() {
  return "theme-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function fontRuleId() {
  return "font-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

function themeSnapshot(source) {
  return JSON.parse(JSON.stringify({
    version: 53,
    colorsEnabled: source.colorsEnabled,
    imagesEnabled: source.imagesEnabled,
    baseStyle: source.baseStyle,
    colorRules: source.colorRules,
    inputStyle: source.inputStyle,
    buttonStyle: source.buttonStyle,
    interfaceStyle: source.interfaceStyle,
    avatarStyle: source.avatarStyle,
    thoughtStyle: source.thoughtStyle,
    translationStyle: source.translationStyle,
    toolbarStyle: source.toolbarStyle,
    fontsEnabled: source.fontsEnabled,
    fontRules: source.fontRules,
    regions: source.regions,
  }));
}

function makeRegion(def) {
  const region = {
    enabled: true,
    image: "",
    fileName: "",
    scale: 1,
    blur: 0,
    positionX: 50,
    positionY: 50,
    opacity: 1,
    overflowY: 0,
    applyTargets: def.targets ? def.targets.map(([key]) => key) : undefined,
  };
  if (def.key === "bottomBar") {
    region.targetSettings = {
      inputBar: { scale: 1, blur: 0, positionX: 50, positionY: 50, overflowY: 0 },
      tabBar: { scale: 1, blur: 0, positionX: 50, positionY: 50, overflowY: 0 },
    };
  }
  return region;
}

function defaultState() {
  const regions = {};
  for (const def of REGION_DEFS) regions[def.key] = makeRegion(def);
  return {
    version: 53,
    colorsEnabled: true,
    imagesEnabled: true,
    floatingButtonEnabled: true,
    floatingButtonTop: null,
    baseStyle: {
      enabled: false,
      color: "#ffffff",
      glassColor: "#ffffff",
      glassOpacity: 72,
      toolIconBackground: "#ffffff",
      applyTargets: BASE_TARGETS.map(([key]) => key),
    },
    inputStyle: {
      enabled: false,
      radius: 14,
      borderless: false,
      borderWidth: 1,
      chatWidth: 100,
      positionEnabled: false,
      offsetX: 0,
      offsetY: 0,
      borderColor: "#dadbdf",
      backgroundMode: "color",
      backgroundColor: "#ebecef",
      backgroundOpacity: 100,
      applyTargets: INPUT_STYLE_TARGETS.map(([key]) => key),
    },
    buttonStyle: {
      enabled: false,
      accentColor: "#246bfd",
      accentOpacity: 100,
      capsuleColor: "#ebebeb",
      capsuleOpacity: 100,
      radius: 12,
      borderless: true,
      borderWidth: 1,
      borderColor: "#dadbdf",
      applyTargets: BUTTON_STYLE_TARGETS.map(([key]) => key),
    },
    interfaceStyle: {
      cardsEnabled: false,
      radius: 28,
      borderless: true,
      borderWidth: 1,
      borderColor: "#dadbdf",
      backgroundColor: "#ffffff",
      backgroundOpacity: 100,
    },
    avatarStyle: {
      enabled: false,
      radius: 50,
      applyTargets: AVATAR_TARGETS.map(([key]) => key),
      headerAvatarVisible: false,
      headerUserAvatarVisible: false,
      headerTitleAlign: "center",
      headerAvatarSize: 28,
      headerAvatarOffsetX: 0,
      headerAvatarOffsetY: -24,
      headerUserAvatarOffsetX: 42,
      headerUserAvatarOffsetY: 0,
      chatUserVisible: true,
      chatRoleVisible: true,
      borderEnabled: false,
      borderWidth: 1,
      borderColor: "#ffffff",
    },
    thoughtStyle: {
      enabled: false,
      backgroundColor: "#fdf3e0",
      backgroundOpacity: 100,
      radius: 12,
      titleColor: "#c9a96e",
      textColor: "#5a4a3a",
      borderVisible: true,
      borderWidth: 1,
      borderColor: "#deb887",
      tapeVisible: true,
      tapeLeftColor: "#ffb6c1",
      tapeRightColor: "#add8e6",
      valueTrackColor: "#eadfce",
      valueFillColor: "#a17fc0",
      iconColor: "#a58be8",
      iconOffsetX: 0,
      iconOffsetY: 0,
    },
    translationStyle: {
      enabled: false,
      alwaysVisible: true,
      layoutMode: "outside",
      dividerVisible: false,
      bold: true,
      color: "#163b8f",
      shadowEnabled: true,
      shadowColor: "#ffffff",
      backgroundEnabled: false,
      backgroundColor: "#ffffff",
      backgroundRadius: 8,
      size: 100,
      offsetX: 0,
      offsetY: 0,
      voiceBackgroundEnabled: false,
      voiceBackgroundColor: "#ffffff",
      voiceBackgroundRadius: 8,
      voiceOffsetX: 0,
      voiceOffsetY: 0,
    },
    toolbarStyle: {
      enabled: true,
      mergeExpressions: true,
      hideBuiltinEmojis: false,
      items: makeToolbarIconSettings(),
    },
    fontsEnabled: true,
    fontRules: [],
    colorRules: [{ id: colorRuleId(), color: "#8f76b8", targets: [] }],
    regions,
    themes: {},
    dayNightSchedule: {
      enabled: false,
      dayThemeId: "",
      nightThemeId: "",
      fallbackSnapshot: null,
    },
  };
}

function clamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function normalizeState(raw) {
  const state = defaultState();
  if (!raw || typeof raw !== "object") return state;
  state.colorsEnabled = raw.colorsEnabled !== false;
  state.imagesEnabled = raw.imagesEnabled !== false;
  state.floatingButtonEnabled = raw.floatingButtonEnabled !== false;
  state.floatingButtonTop = raw.floatingButtonTop != null && Number.isFinite(Number(raw.floatingButtonTop)) ? Math.max(8, Number(raw.floatingButtonTop)) : null;
  if (raw.baseStyle && typeof raw.baseStyle === "object") {
    state.baseStyle.enabled = raw.baseStyle.enabled === true;
    state.baseStyle.color = /^#[0-9a-f]{6}$/i.test(String(raw.baseStyle.color || "")) ? String(raw.baseStyle.color).toLowerCase() : "#ffffff";
    state.baseStyle.glassColor = /^#[0-9a-f]{6}$/i.test(String(raw.baseStyle.glassColor || "")) ? String(raw.baseStyle.glassColor).toLowerCase() : "#ffffff";
    state.baseStyle.glassOpacity = clamp(raw.baseStyle.glassOpacity, 72, 0, 100);
    state.baseStyle.toolIconBackground = /^#[0-9a-f]{6}$/i.test(String(raw.baseStyle.toolIconBackground || "")) ? String(raw.baseStyle.toolIconBackground).toLowerCase() : "#ffffff";
    if (Array.isArray(raw.baseStyle.applyTargets)) {
      const allowed = BASE_TARGETS.map(([key]) => key);
      state.baseStyle.applyTargets = [...new Set(raw.baseStyle.applyTargets.filter(key => allowed.includes(key)))];
    }
  }
  state.fontsEnabled = raw.fontsEnabled !== false;
  if (raw.inputStyle && typeof raw.inputStyle === "object") {
    state.inputStyle.enabled = raw.inputStyle.enabled === true;
    state.inputStyle.radius = clamp(raw.inputStyle.radius, 14, 0, 50);
    state.inputStyle.borderless = raw.inputStyle.borderless === true;
    state.inputStyle.borderWidth = clamp(raw.inputStyle.borderWidth, 1, 0.5, 6);
    state.inputStyle.chatWidth = clamp(raw.inputStyle.chatWidth, 100, 40, 100);
    state.inputStyle.positionEnabled = raw.inputStyle.positionEnabled === true;
    state.inputStyle.offsetX = clamp(raw.inputStyle.offsetX, 0, -120, 120);
    state.inputStyle.offsetY = clamp(raw.inputStyle.offsetY, 0, -120, 120);
    state.inputStyle.borderColor = /^#[0-9a-f]{6}$/i.test(String(raw.inputStyle.borderColor || "")) ? String(raw.inputStyle.borderColor).toLowerCase() : "#dadbdf";
    state.inputStyle.backgroundColor = /^#[0-9a-f]{6}$/i.test(String(raw.inputStyle.backgroundColor || "")) ? String(raw.inputStyle.backgroundColor).toLowerCase() : "#ebecef";
    state.inputStyle.backgroundOpacity = clamp(raw.inputStyle.backgroundOpacity, 100, 0, 100);
    if (["none", "color", "image"].includes(raw.inputStyle.backgroundMode)) state.inputStyle.backgroundMode = raw.inputStyle.backgroundMode;
    if (Array.isArray(raw.inputStyle.applyTargets)) {
      const allowed = INPUT_STYLE_TARGETS.map(([key]) => key);
      state.inputStyle.applyTargets = [...new Set(raw.inputStyle.applyTargets.filter(key => allowed.includes(key)))];
    }
  }
  if (raw.buttonStyle && typeof raw.buttonStyle === "object") {
    state.buttonStyle.enabled = raw.buttonStyle.enabled === true;
    state.buttonStyle.accentColor = state.buttonStyle.enabled && /^#[0-9a-f]{6}$/i.test(String(raw.buttonStyle.accentColor || "")) ? String(raw.buttonStyle.accentColor).toLowerCase() : "#246bfd";
    state.buttonStyle.accentOpacity = state.buttonStyle.enabled ? clamp(raw.buttonStyle.accentOpacity, 100, 0, 100) : 100;
    state.buttonStyle.capsuleColor = state.buttonStyle.enabled && /^#[0-9a-f]{6}$/i.test(String(raw.buttonStyle.capsuleColor || "")) ? String(raw.buttonStyle.capsuleColor).toLowerCase() : "#ebebeb";
    state.buttonStyle.capsuleOpacity = state.buttonStyle.enabled ? clamp(raw.buttonStyle.capsuleOpacity, 100, 0, 100) : 100;
    state.buttonStyle.radius = clamp(raw.buttonStyle.radius, 12, 0, 50);
    state.buttonStyle.borderless = raw.buttonStyle.borderless === true;
    state.buttonStyle.borderWidth = clamp(raw.buttonStyle.borderWidth, 1, 0.5, 6);
    state.buttonStyle.borderColor = /^#[0-9a-f]{6}$/i.test(String(raw.buttonStyle.borderColor || "")) ? String(raw.buttonStyle.borderColor).toLowerCase() : "#dadbdf";
    if (Array.isArray(raw.buttonStyle.applyTargets)) {
      const allowed = BUTTON_STYLE_TARGETS.map(([key]) => key);
      state.buttonStyle.applyTargets = [...new Set(raw.buttonStyle.applyTargets.filter(key => allowed.includes(key)))];
    }
  }
  if (raw.interfaceStyle && typeof raw.interfaceStyle === "object") {
    state.interfaceStyle.cardsEnabled = raw.interfaceStyle.cardsEnabled === true;
    state.interfaceStyle.radius = clamp(raw.interfaceStyle.radius, 28, 0, 50);
    state.interfaceStyle.borderless = raw.interfaceStyle.borderless === true;
    state.interfaceStyle.borderWidth = clamp(raw.interfaceStyle.borderWidth, 1, 0.5, 6);
    state.interfaceStyle.borderColor = /^#[0-9a-f]{6}$/i.test(String(raw.interfaceStyle.borderColor || "")) ? String(raw.interfaceStyle.borderColor).toLowerCase() : "#dadbdf";
    state.interfaceStyle.backgroundColor = /^#[0-9a-f]{6}$/i.test(String(raw.interfaceStyle.backgroundColor || "")) ? String(raw.interfaceStyle.backgroundColor).toLowerCase() : "#ffffff";
    state.interfaceStyle.backgroundOpacity = clamp(raw.interfaceStyle.backgroundOpacity, 100, 0, 100);
  }
  if (raw.avatarStyle && typeof raw.avatarStyle === "object") {
    state.avatarStyle.enabled = raw.avatarStyle.enabled === true;
    state.avatarStyle.radius = clamp(raw.avatarStyle.radius, 50, 0, 50);
    state.avatarStyle.headerAvatarVisible = raw.avatarStyle.headerAvatarVisible === true;
    state.avatarStyle.headerUserAvatarVisible = raw.avatarStyle.headerUserAvatarVisible === true;
    state.avatarStyle.headerTitleAlign = raw.avatarStyle.headerTitleAlign === "left" ? "left" : "center";
    state.avatarStyle.headerAvatarSize = clamp(raw.avatarStyle.headerAvatarSize, 28, 20, 40);
    state.avatarStyle.headerAvatarOffsetX = clamp(raw.avatarStyle.headerAvatarOffsetX, 0, -400, 400);
    state.avatarStyle.headerAvatarOffsetY = clamp(raw.avatarStyle.headerAvatarOffsetY, -24, -160, 160);
    state.avatarStyle.headerUserAvatarOffsetX = clamp(raw.avatarStyle.headerUserAvatarOffsetX, 42, -400, 400);
    state.avatarStyle.headerUserAvatarOffsetY = clamp(raw.avatarStyle.headerUserAvatarOffsetY, 0, -160, 160);
    state.avatarStyle.chatUserVisible = raw.avatarStyle.chatUserVisible !== false;
    state.avatarStyle.chatRoleVisible = raw.avatarStyle.chatRoleVisible !== false;
    state.avatarStyle.borderEnabled = raw.avatarStyle.borderEnabled === true;
    state.avatarStyle.borderWidth = clamp(raw.avatarStyle.borderWidth, 1, 0, 8);
    state.avatarStyle.borderColor = /^#[0-9a-f]{6}$/i.test(String(raw.avatarStyle.borderColor || "")) ? String(raw.avatarStyle.borderColor).toLowerCase() : "#ffffff";
    if (Array.isArray(raw.avatarStyle.applyTargets)) {
      const allowed = AVATAR_TARGETS.map(([key]) => key);
      state.avatarStyle.applyTargets = [...new Set(raw.avatarStyle.applyTargets.filter(key => allowed.includes(key)))];
    }
  }
  if (raw.thoughtStyle && typeof raw.thoughtStyle === "object") {
    state.thoughtStyle.enabled = raw.thoughtStyle.enabled === true;
    state.thoughtStyle.backgroundColor = /^#[0-9a-f]{6}$/i.test(String(raw.thoughtStyle.backgroundColor || "")) ? String(raw.thoughtStyle.backgroundColor).toLowerCase() : "#fdf3e0";
    state.thoughtStyle.backgroundOpacity = clamp(raw.thoughtStyle.backgroundOpacity, 100, 0, 100);
    state.thoughtStyle.radius = clamp(raw.thoughtStyle.radius, 12, 0, 50);
    state.thoughtStyle.titleColor = /^#[0-9a-f]{6}$/i.test(String(raw.thoughtStyle.titleColor || "")) ? String(raw.thoughtStyle.titleColor).toLowerCase() : "#c9a96e";
    state.thoughtStyle.textColor = /^#[0-9a-f]{6}$/i.test(String(raw.thoughtStyle.textColor || "")) ? String(raw.thoughtStyle.textColor).toLowerCase() : "#5a4a3a";
    state.thoughtStyle.borderVisible = raw.thoughtStyle.borderVisible !== false;
    state.thoughtStyle.borderWidth = clamp(raw.thoughtStyle.borderWidth, 1, 0.5, 8);
    state.thoughtStyle.borderColor = /^#[0-9a-f]{6}$/i.test(String(raw.thoughtStyle.borderColor || "")) ? String(raw.thoughtStyle.borderColor).toLowerCase() : "#deb887";
    state.thoughtStyle.tapeVisible = raw.thoughtStyle.tapeVisible !== false;
    state.thoughtStyle.tapeLeftColor = /^#[0-9a-f]{6}$/i.test(String(raw.thoughtStyle.tapeLeftColor || "")) ? String(raw.thoughtStyle.tapeLeftColor).toLowerCase() : "#ffb6c1";
    state.thoughtStyle.tapeRightColor = /^#[0-9a-f]{6}$/i.test(String(raw.thoughtStyle.tapeRightColor || "")) ? String(raw.thoughtStyle.tapeRightColor).toLowerCase() : "#add8e6";
    state.thoughtStyle.valueTrackColor = /^#[0-9a-f]{6}$/i.test(String(raw.thoughtStyle.valueTrackColor || "")) ? String(raw.thoughtStyle.valueTrackColor).toLowerCase() : "#eadfce";
    state.thoughtStyle.valueFillColor = /^#[0-9a-f]{6}$/i.test(String(raw.thoughtStyle.valueFillColor || "")) ? String(raw.thoughtStyle.valueFillColor).toLowerCase() : "#a17fc0";
    state.thoughtStyle.iconColor = /^#[0-9a-f]{6}$/i.test(String(raw.thoughtStyle.iconColor || "")) ? String(raw.thoughtStyle.iconColor).toLowerCase() : "#a58be8";
    state.thoughtStyle.iconOffsetX = clamp(raw.thoughtStyle.iconOffsetX, 0, -400, 400);
    state.thoughtStyle.iconOffsetY = clamp(raw.thoughtStyle.iconOffsetY, 0, -160, 160);
  }
  if (raw.translationStyle && typeof raw.translationStyle === "object") {
    state.translationStyle.enabled = raw.translationStyle.enabled === true;
    state.translationStyle.alwaysVisible = raw.translationStyle.alwaysVisible !== false;
    state.translationStyle.layoutMode = raw.translationStyle.layoutMode === "inside" ? "inside" : "outside";
    state.translationStyle.dividerVisible = raw.translationStyle.dividerVisible === true;
    state.translationStyle.bold = raw.translationStyle.bold !== false;
    state.translationStyle.color = /^#[0-9a-f]{6}$/i.test(String(raw.translationStyle.color || "")) ? String(raw.translationStyle.color).toLowerCase() : "#163b8f";
    state.translationStyle.shadowEnabled = raw.translationStyle.shadowEnabled !== false;
    state.translationStyle.shadowColor = /^#[0-9a-f]{6}$/i.test(String(raw.translationStyle.shadowColor || "")) ? String(raw.translationStyle.shadowColor).toLowerCase() : "#ffffff";
    state.translationStyle.backgroundEnabled = raw.translationStyle.backgroundEnabled === true;
    state.translationStyle.backgroundColor = /^#[0-9a-f]{6}$/i.test(String(raw.translationStyle.backgroundColor || "")) ? String(raw.translationStyle.backgroundColor).toLowerCase() : "#ffffff";
    state.translationStyle.backgroundRadius = clamp(raw.translationStyle.backgroundRadius, 8, 0, 50);
    state.translationStyle.size = clamp(raw.translationStyle.size, 100, 60, 160);
    state.translationStyle.offsetX = clamp(raw.translationStyle.offsetX, 0, -400, 400);
    state.translationStyle.offsetY = clamp(raw.translationStyle.offsetY, 0, -160, 160);
    state.translationStyle.voiceBackgroundEnabled = raw.translationStyle.voiceBackgroundEnabled === true;
    state.translationStyle.voiceBackgroundColor = /^#[0-9a-f]{6}$/i.test(String(raw.translationStyle.voiceBackgroundColor || "")) ? String(raw.translationStyle.voiceBackgroundColor).toLowerCase() : "#ffffff";
    state.translationStyle.voiceBackgroundRadius = clamp(raw.translationStyle.voiceBackgroundRadius, 8, 0, 50);
    state.translationStyle.voiceOffsetX = clamp(raw.translationStyle.voiceOffsetX, 0, -400, 400);
    state.translationStyle.voiceOffsetY = clamp(raw.translationStyle.voiceOffsetY, 0, -160, 160);
  }
  if (raw.toolbarStyle && typeof raw.toolbarStyle === "object") {
    state.toolbarStyle.enabled = raw.toolbarStyle.enabled !== false;
    state.toolbarStyle.mergeExpressions = raw.toolbarStyle.mergeExpressions !== false;
    state.toolbarStyle.hideBuiltinEmojis = raw.toolbarStyle.hideBuiltinEmojis === true;
    const sourceItems = raw.toolbarStyle.items && typeof raw.toolbarStyle.items === "object" ? raw.toolbarStyle.items : {};
    for (const [key] of TOOLBAR_ICON_DEFS) {
      const source = sourceItems[key];
      if (!source || typeof source !== "object") continue;
      state.toolbarStyle.items[key].visible = source.visible !== false;
      state.toolbarStyle.items[key].offsetX = clamp(source.offsetX, 0, -400, 400);
      state.toolbarStyle.items[key].offsetY = clamp(source.offsetY, 0, -120, 120);
    }
    for (const [offlineKey, onlineKey] of [["offlineReturn", "offline"], ["offlineEmoji", "emoji"], ["offlineSend", "send"]]) {
      if (sourceItems[offlineKey] && typeof sourceItems[offlineKey] === "object") continue;
      state.toolbarStyle.items[offlineKey].visible = true;
      state.toolbarStyle.items[offlineKey].offsetX = state.toolbarStyle.items[onlineKey].offsetX;
      state.toolbarStyle.items[offlineKey].offsetY = state.toolbarStyle.items[onlineKey].offsetY;
    }
  }
  if (Array.isArray(raw.fontRules)) {
    state.fontRules = raw.fontRules.slice(0, 10).map(rule => ({
      id: String(rule && rule.id || fontRuleId()),
      name: String(rule && rule.name || "自定义字体"),
      data: typeof (rule && rule.data) === "string" ? rule.data : "",
      targets: [...new Set((Array.isArray(rule && rule.targets) ? rule.targets : []).filter(key => FONT_TARGETS.some(target => target.key === key)))],
    })).filter(rule => rule.data);
  }
  const claimedFontTargets = new Set();
  for (const rule of state.fontRules) {
    rule.targets = rule.targets.filter(key => {
      if (claimedFontTargets.has(key)) return false;
      claimedFontTargets.add(key); return true;
    });
  }
  if (Array.isArray(raw.colorRules)) {
    state.colorRules = raw.colorRules.slice(0, 10).map(rule => ({
      id: String(rule && rule.id || colorRuleId()),
      color: /^#[0-9a-f]{6}$/i.test(String(rule && rule.color || "")) ? String(rule.color).toLowerCase() : "#8f76b8",
      targets: [...new Set((Array.isArray(rule && rule.targets) ? rule.targets : []).filter(key => COLOR_TARGETS.some(target => target.key === key)))],
    }));
  }
  const claimedTargets = new Set();
  for (const rule of state.colorRules) {
    rule.targets = rule.targets.filter(key => {
      if (claimedTargets.has(key)) return false;
      claimedTargets.add(key);
      return true;
    });
  }
  for (const def of REGION_DEFS) {
    const source = raw.regions && raw.regions[def.key];
    if (!source || typeof source !== "object") continue;
    const region = state.regions[def.key];
    region.enabled = source.enabled !== false;
    region.image = typeof source.image === "string" ? source.image : "";
    region.fileName = typeof source.fileName === "string" ? source.fileName : "";
    region.scale = clamp(source.scale, 1, 0.1, 3);
    region.blur = clamp(source.blur, 0, 0, 30);
    region.positionX = clamp(source.positionX, 50, 0, 100);
    region.positionY = clamp(source.positionY, 50, 0, 100);
    if (def.targets) {
      const allowed = def.targets.map(([key]) => key);
      const sourceTargets = source.applyTargets;
      if (Array.isArray(sourceTargets)) region.applyTargets = [...new Set(sourceTargets.filter(key => allowed.includes(key)))];
    }
    region.opacity = clamp(source.opacity, 1, 0.05, 1);
    region.overflowY = clamp(Math.abs(Number(source.overflowY)), 0, 0, 300);
    if (def.key === "bottomBar" && source.targetSettings && typeof source.targetSettings === "object") {
      for (const key of ["inputBar", "tabBar"]) {
        const sourceSettings = source.targetSettings[key];
        if (!sourceSettings || typeof sourceSettings !== "object") continue;
        const settings = region.targetSettings[key];
        settings.scale = clamp(sourceSettings.scale, 1, 0.1, 3);
        settings.blur = clamp(sourceSettings.blur, 0, 0, 30);
        settings.positionX = clamp(sourceSettings.positionX, 50, 0, 100);
        settings.positionY = clamp(sourceSettings.positionY, 50, 0, 100);
        settings.overflowY = clamp(sourceSettings.overflowY, 0, 0, 300);
      }
    }
  }
  const inputRegion = state.regions.inputField;
  inputRegion.enabled = true;
  inputRegion.applyTargets = [...state.inputStyle.applyTargets];
  if (raw.themes && typeof raw.themes === "object") {
    for (const [rawId, value] of Object.entries(raw.themes)) {
      const id = String(value && value.id || rawId || themeId());
      const snapshot = value && value.snapshot;
      if (!id || !snapshot || typeof snapshot !== "object") continue;
      const normalized = normalizeState({ ...snapshot, themes: {} });
      state.themes[id] = {
        id,
        name: String(value.name || "未命名主题"),
        snapshot: themeSnapshot(normalized),
      };
    }
  }
  if (raw.dayNightSchedule && typeof raw.dayNightSchedule === "object") {
    const source = raw.dayNightSchedule;
    state.dayNightSchedule.enabled = source.enabled === true;
    state.dayNightSchedule.dayThemeId = state.themes[String(source.dayThemeId || "")] ? String(source.dayThemeId) : "";
    state.dayNightSchedule.nightThemeId = state.themes[String(source.nightThemeId || "")] ? String(source.nightThemeId) : "";
    if (source.fallbackSnapshot && typeof source.fallbackSnapshot === "object") {
      state.dayNightSchedule.fallbackSnapshot = themeSnapshot(normalizeState({ ...source.fallbackSnapshot, themes: {}, dayNightSchedule: undefined }));
    }
  }
  return state;
}

function cssUrl(value) {
  return `url("${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]/g, "")}")`;
}

function blurImageDataUrl(source, blur) {
  return new Promise(resolve => {
    if (!source || blur <= 0) { resolve(source); return; }
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, image.naturalWidth || image.width);
        canvas.height = Math.max(1, image.naturalHeight || image.height);
        const context = canvas.getContext("2d");
        if (!context) { resolve(source); return; }
        const padding = Math.ceil(blur * 2);
        context.filter = `blur(${blur}px)`;
        context.drawImage(image, -padding, -padding, canvas.width + padding * 2, canvas.height + padding * 2);
        resolve(canvas.toDataURL("image/png"));
      } catch (_) { resolve(source); }
    };
    image.onerror = () => resolve(source);
    image.src = source;
  });
}

function imageSizeCss(def, scale) {
  const percent = Math.round(scale * 10000) / 100;
  return def.key === "appBackground" ? `auto ${percent}%` : `${percent}% auto`;
}

function colorWithOpacity(hex, opacity) {
  const matched = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex));
  if (!matched) return hex;
  const alpha = clamp(opacity, 100, 0, 100) / 100;
  return `rgba(${parseInt(matched[1], 16)},${parseInt(matched[2], 16)},${parseInt(matched[3], 16)},${alpha})`;
}

function fontFamilyName(id) {
  return "FISFont_" + String(id).replace(/[^a-z0-9_-]/gi, "_");
}

const BASE_CSS = `
.fis-settings{margin-top:10px;padding:12px;border:1px solid rgba(120,140,165,.24);border-radius:13px;color:var(--c-text-title,#334155)}
.fis-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:12px}.fis-head .fis-toolbar{margin-left:auto}.fis-page-tabs{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.fis-settings .fis-page-tab{min-height:34px;padding:7px 13px;border:1px solid #cbd5e1;border-radius:999px;background:#fff;color:#52677f;font-size:12px;line-height:1.2;cursor:pointer}.fis-settings .fis-page-tab.active{border-color:#6f8fb5;background:#6f8fb5;color:#fff}
.fis-toolbar{display:flex!important;justify-content:flex-end;gap:7px;flex-wrap:wrap;margin:0}.fis-settings .fis-btn{display:inline-flex!important;align-items:center;justify-content:center;visibility:visible!important;min-height:34px;padding:7px 10px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#52677f;font-size:12px;line-height:1.2;cursor:pointer;opacity:1!important}.fis-settings .fis-btn.primary{background:#6f8fb5!important;border-color:#6f8fb5!important;color:#fff!important}.fis-settings .fis-btn.danger{color:#b42318}.fis-settings .fis-btn:disabled{opacity:.45!important}.fis-settings input[type="file"][hidden]{display:none!important}.fis-settings .fis-icon-btn{display:grid!important;place-items:center;width:36px;height:36px;min-height:36px;padding:0;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#52677f;cursor:pointer}.fis-settings .fis-icon-btn svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.fis-settings .fis-icon-btn.primary{background:#6f8fb5;border-color:#6f8fb5;color:#fff}.fis-settings .fis-icon-btn.danger{color:#b42318}
.fis-region{margin:8px 0;border:1px solid rgba(120,140,165,.2);border-radius:11px;background:rgba(255,255,255,.82);overflow:hidden}.fis-region-summary{display:grid;grid-template-columns:22px 42px minmax(0,1fr) auto;align-items:center;gap:8px;padding:9px}.fis-region-enabled{width:18px;height:18px}.fis-thumb{width:42px;height:42px;border-radius:8px;background-color:#eef2f6;background-position:center;background-size:cover;background-repeat:no-repeat;border:1px solid rgba(120,140,165,.18)}.fis-region-name{font-size:13px;font-weight:650}.fis-region-hint{margin-top:2px;font-size:10px;color:#8a98a9}.fis-region-actions,.fis-color-head-actions{display:flex!important;visibility:visible!important;align-items:center;gap:6px}.fis-region-actions .fis-btn{min-height:32px;padding:6px 9px}
.fis-panel{display:block;padding:10px;border-top:1px solid #e7ebf0}.fis-row{display:grid;grid-template-columns:74px minmax(0,1fr);align-items:center;gap:8px;margin:8px 0}.fis-label{font-size:11px;color:#68788d}.fis-file-row{display:flex;align-items:center;gap:7px;min-width:0}.fis-file-name{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:#68788d}.fis-select,.fis-number{width:100%;min-height:34px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#334155;padding:6px 8px;font-size:12px}.fis-range-pair{display:grid;grid-template-columns:minmax(0,1fr) 58px;gap:7px;align-items:center}.fis-range{width:100%;height:4px;margin:8px 0;border:0;border-radius:999px;outline:0;appearance:none;-webkit-appearance:none;accent-color:#6f8fb5;background:linear-gradient(to right,#6f8fb5 0 var(--fis-range-progress,50%),#d7e0ea var(--fis-range-progress,50%) 100%)!important}.fis-range::-webkit-slider-runnable-track{height:4px;border:0;border-radius:999px;background:transparent}.fis-range::-webkit-slider-thumb{width:16px;height:16px;margin-top:-6px;border:2px solid #fff;border-radius:50%;background:#6f8fb5;box-shadow:0 1px 4px rgba(50,75,105,.28);appearance:none;-webkit-appearance:none}.fis-range::-moz-range-track{height:4px;border:0;border-radius:999px;background:#d7e0ea}.fis-range::-moz-range-progress{height:4px;border-radius:999px;background:#6f8fb5}.fis-range::-moz-range-thumb{width:14px;height:14px;border:2px solid #fff;border-radius:50%;background:#6f8fb5;box-shadow:0 1px 4px rgba(50,75,105,.28)}.fis-empty{padding:13px 4px;text-align:center;color:#8a98a9;font-size:11px}.fis-input-targets{display:flex;align-items:center;gap:7px 12px;flex-wrap:wrap;padding:7px 9px;border:1px solid #d7e0ea;border-radius:8px;background:#fff}.fis-input-target{display:flex;align-items:center;gap:5px;font-size:11px;color:#607086;white-space:nowrap}
.fis-input-style-card{padding:10px;border:1px solid rgba(120,140,165,.2);border-radius:11px;background:rgba(255,255,255,.82)}.fis-input-style-head{display:flex;align-items:center;gap:7px;margin-bottom:8px}.fis-input-style-body.disabled{opacity:.55}.fis-color-pair{display:grid;grid-template-columns:42px minmax(0,1fr);gap:7px;align-items:center}.fis-color-pair input[type=color]{width:42px;height:34px;padding:2px;border:1px solid #cbd5e1;border-radius:8px;background:#fff}.fis-color-pair .fis-number{text-transform:uppercase}
.fis-theme-list{display:flex;flex-direction:column;gap:8px}.fis-theme-card{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding:10px;border:1px solid rgba(120,140,165,.2);border-radius:11px;background:rgba(255,255,255,.82)}.fis-theme-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:650}.fis-theme-hint{margin-top:2px;color:#8a98a9;font-size:10px}.fis-theme-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}@media(max-width:560px){.fis-theme-card{grid-template-columns:1fr}.fis-theme-actions{justify-content:flex-start}}
.fis-day-night-dialog{display:flex;flex-direction:column;gap:8px;margin-top:10px}.fis-day-night-dialog .fis-row{grid-template-columns:42px minmax(0,1fr);margin:3px 0}.fis-day-night-dialog .fis-switch-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 0 9px;border-bottom:1px solid rgba(182,161,203,.25)}.fis-day-night-hint{color:#897b96;font-size:10px;line-height:1.45}
.fis-subtab-bar{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;min-width:0;border-bottom:1px solid rgba(120,140,165,.24)}.fis-subtab-strip{display:flex;align-items:flex-end;gap:6px;min-width:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}.fis-subtab-strip::-webkit-scrollbar{display:none}.fis-subtab-switch{display:flex;align-items:center;justify-content:center;flex:0 0 auto;height:48px;padding:0 5px 8px}.fis-switch{position:relative;display:inline-flex;width:46px;height:26px;cursor:pointer}.fis-switch input{position:absolute;width:1px;height:1px;opacity:0}.fis-switch-track{position:absolute;inset:0;border-radius:999px;background:#cbd5e1;transition:background .18s}.fis-switch-track::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(43,58,78,.24);transition:transform .18s}.fis-switch input:checked+.fis-switch-track{background:#6f8fb5}.fis-switch input:checked+.fis-switch-track::after{transform:translateX(20px)}.fis-color-workspace.disabled>.fis-color-panel,.fis-color-workspace.disabled>.fis-color-actions{opacity:.55}.fis-color-tabs{flex-wrap:wrap;overflow:visible}.fis-color-tab{position:relative;display:grid;place-items:center;flex:0 0 42px;width:42px;height:44px;padding:4px 4px 0;border:1px solid transparent;border-bottom:0;border-radius:10px 10px 0 0;background:transparent;cursor:pointer}.fis-color-tab.active{z-index:1;border-color:rgba(120,140,165,.24);background:rgba(255,255,255,.9);margin-bottom:-1px}.fis-color-heart{font-size:28px;line-height:1;color:var(--fis-heart-color);text-shadow:0 1px 1px rgba(45,55,72,.08)}.fis-color-tab-mark{display:none;position:absolute;right:1px;top:2px;width:15px;height:15px;align-items:center;justify-content:center;border:1px solid #b8c4d1;border-radius:50%;background:#fff;color:#fff;font-size:9px}.fis-color-tabs.delete-mode .fis-color-tab-mark{display:inline-flex}.fis-color-tab.selected .fis-color-tab-mark{border-color:#b42318;background:#b42318}.fis-color-tab.selected{background:rgba(180,35,24,.05)}.fis-color-panel{padding:14px;border:1px solid rgba(120,140,165,.24);border-top:0;border-radius:0 0 11px 11px;background:rgba(255,255,255,.82)}.fis-color-actions{display:flex;align-items:center;justify-content:center;gap:7px;padding-top:9px}.fis-inline-color-editor{display:grid;grid-template-columns:38px minmax(90px,150px);align-items:center;gap:8px;margin-bottom:7px}.fis-inline-color-editor input[type=color]{width:38px;height:34px;padding:2px;border:1px solid #cbd5e1;border-radius:8px;background:#fff}.fis-inline-color-editor input[type=text]{width:100%;min-height:34px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#52677f;font-size:11px;text-transform:uppercase}.fis-target-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 8px}.fis-target-option{display:flex;align-items:center;gap:5px;min-width:0;padding:4px 2px;font-size:11px;color:#607086}.fis-target-option span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fis-image-workspace.disabled>.fis-region{opacity:.55}.fis-image-tab{flex:0 0 auto;min-height:40px;padding:8px 14px;border:1px solid transparent;border-bottom:0;border-radius:11px 11px 0 0;background:transparent;color:#607086;font-size:12px;cursor:pointer}.fis-image-tab.active{z-index:1;border-color:rgba(120,140,165,.24);background:rgba(255,255,255,.9);margin-bottom:-1px;color:#42566f}.fis-image-workspace>.fis-region{margin:0;border-top:0;border-radius:0 0 11px 11px}
.fis-font-tabs{flex-wrap:wrap;overflow:visible}.fis-font-tab{display:block;max-width:120px;min-height:40px;padding:8px 12px;border:1px solid transparent;border-bottom:0;border-radius:10px 10px 0 0;background:transparent;color:#607086;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}.fis-font-tab.active{z-index:1;margin-bottom:-1px;border-color:rgba(120,140,165,.24);background:rgba(255,255,255,.9);color:#42566f}
.fis-interface-workspace>.fis-subtab-bar{padding:0;border:0;border-bottom:1px solid rgba(120,140,165,.24);border-radius:0;background:transparent}.fis-interface-workspace>.fis-input-style-card{padding-top:10px;padding-bottom:10px;border-top:0;border-radius:0 0 11px 11px}.fis-interface-workspace>.fis-input-style-card>.fis-row:first-child{margin-top:0}.fis-interface-workspace>.fis-input-style-card>.fis-input-feature:first-child{margin-top:0}.fis-interface-workspace .fis-card-feature{border:0;border-radius:0;background:transparent}
.fis-settings-toggle-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px;padding:12px 4px;color:var(--c-text-title,#334155)}.fis-library-title{font-size:14px;font-weight:700;color:#42566f}.fis-library-toggle-label{font-size:12px;color:#5f536c;white-space:nowrap}.fis-floating-button{position:fixed;right:18px;bottom:86px;z-index:2147483000;display:grid;place-items:center;width:48px;height:48px;padding:0;border:1px solid rgba(108,132,162,.24);border-radius:50%;background:#6f8fb5;color:#fff;box-shadow:0 6px 20px rgba(54,74,101,.28);cursor:pointer}.fis-floating-button svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.fis-floating-button[hidden],.fis-floating-panel[hidden]{display:none!important}.fis-floating-panel{position:fixed;right:14px;bottom:144px;z-index:2147482999;width:min(540px,calc(100vw - 28px));max-height:min(74vh,720px);margin:0;padding:10px;overflow:auto;overscroll-behavior:contain;border:1px solid rgba(108,132,162,.28);border-radius:15px;background:rgba(250,252,255,.96);box-shadow:0 14px 42px rgba(42,57,78,.3);backdrop-filter:blur(16px)}.fis-floating-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}.fis-floating-head .fis-page-tabs{min-width:0;overflow-x:auto;flex-wrap:nowrap;scrollbar-width:none}.fis-floating-head .fis-page-tabs::-webkit-scrollbar{display:none}.fis-floating-close{flex:0 0 auto;width:34px;height:34px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#607086;font-size:20px;line-height:1;cursor:pointer}.fis-floating-body{min-width:0}.fis-input-feature{margin-top:10px;border:1px solid rgba(120,140,165,.2);border-radius:10px;background:rgba(255,255,255,.62);overflow:hidden}.fis-input-feature-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px}.fis-input-feature-body{padding:2px 10px 8px;border-top:1px solid #e7ebf0}.fis-input-feature-body.disabled{opacity:.5}.fis-input-image-pick{display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 0}.fis-input-image-pick .fis-region-actions{justify-content:flex-end}@media(max-width:560px){.fis-floating-button{right:14px;bottom:78px;width:46px;height:46px}.fis-floating-panel{left:10px;right:10px;bottom:134px;width:auto;max-height:calc(100dvh - 155px)}.fis-subtab-bar{gap:6px}.fis-subtab-switch{padding-left:2px;padding-right:2px}.fis-target-options{grid-template-columns:repeat(2,minmax(0,1fr))}.fis-input-image-pick{grid-template-columns:42px minmax(0,1fr)}.fis-input-image-pick .fis-region-actions{grid-column:1/-1;justify-content:flex-end}}
.fis-library-title{font-size:14px;font-weight:700;color:#42566f}.fis-library-controls{display:flex;align-items:center;gap:8px}.fis-library-toggle-label{font-size:11px;color:#68788d;white-space:nowrap}.fis-floating-button{position:fixed;right:18px;bottom:86px;z-index:2147483000;display:grid;place-items:center;width:48px;height:48px;padding:0;border:1px solid rgba(108,132,162,.24);border-radius:50%;background:#6f8fb5;color:#fff;box-shadow:0 6px 20px rgba(54,74,101,.28);cursor:pointer}.fis-floating-button svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.fis-floating-button[hidden],.fis-floating-panel[hidden]{display:none!important}.fis-floating-panel{position:fixed;right:14px;bottom:144px;z-index:2147482999;width:min(540px,calc(100vw - 28px));max-height:min(74vh,720px);margin:0;padding:10px;overflow:auto;overscroll-behavior:contain;border:1px solid rgba(108,132,162,.28);border-radius:15px;background:rgba(250,252,255,.96);box-shadow:0 14px 42px rgba(42,57,78,.3);backdrop-filter:blur(16px)}.fis-floating-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}.fis-floating-head .fis-page-tabs{min-width:0;overflow-x:auto;flex-wrap:nowrap;scrollbar-width:none}.fis-floating-head .fis-page-tabs::-webkit-scrollbar{display:none}.fis-floating-head-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto}.fis-floating-close{flex:0 0 auto;width:34px;height:34px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#607086;font-size:20px;line-height:1;cursor:pointer}.fis-floating-body{min-width:0}.fis-input-feature{margin-top:10px;border:1px solid rgba(120,140,165,.2);border-radius:10px;background:rgba(255,255,255,.62);overflow:hidden}.fis-input-feature-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px}.fis-input-feature-body{padding:2px 10px 8px;border-top:1px solid #e7ebf0}.fis-input-feature-body.disabled{opacity:.5}.fis-input-image-pick{display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 0}.fis-input-image-pick .fis-region-actions{justify-content:flex-end}@media(max-width:560px){.fis-floating-button{right:14px;bottom:78px;width:46px;height:46px}.fis-floating-panel{left:10px;right:10px;bottom:134px;width:auto;max-height:calc(100dvh - 155px)}.fis-subtab-bar{gap:6px}.fis-subtab-switch{padding-left:2px;padding-right:2px}.fis-target-options{grid-template-columns:repeat(2,minmax(0,1fr))}.fis-input-image-pick{grid-template-columns:42px minmax(0,1fr)}.fis-input-image-pick .fis-region-actions{grid-column:1/-1;justify-content:flex-end}}

/* 贴边侧栏与半透明毛玻璃设置面板 */
.fis-floating-button{right:0!important;top:38vh;bottom:auto!important;width:24px!important;height:64px!important;min-height:64px;padding:0!important;border:1px solid rgba(255,255,255,.55)!important;border-right:0!important;border-radius:12px 0 0 12px!important;background:linear-gradient(180deg,rgba(184,162,216,.78),rgba(145,119,184,.74))!important;box-shadow:-3px 5px 16px rgba(83,62,112,.24)!important;backdrop-filter:blur(12px) saturate(1.14);-webkit-backdrop-filter:blur(12px) saturate(1.14);cursor:grab;touch-action:none;user-select:none}
.fis-floating-button:active{cursor:grabbing}.fis-floating-button svg{width:15px!important;height:15px!important}
.fis-floating-panel{right:32px!important;top:38vh;bottom:auto;width:min(470px,calc(100vw - 44px))!important;max-height:min(78vh,720px);margin:0!important;padding:0!important;display:grid;grid-template-columns:92px minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);overflow:hidden!important;border:1px solid rgba(194,175,214,.6)!important;border-radius:16px!important;background:rgba(247,242,251,.78)!important;box-shadow:0 16px 44px rgba(72,53,93,.24),inset 0 1px 0 rgba(255,255,255,.75)!important;backdrop-filter:blur(22px) saturate(1.16)!important;-webkit-backdrop-filter:blur(22px) saturate(1.16)!important}
.fis-floating-panel[hidden]{display:none!important}
.fis-floating-head{grid-column:1;grid-row:1/3;min-width:0;height:100%;box-sizing:border-box;margin:0!important;padding:11px 7px;display:flex;flex-direction:column;align-items:stretch;gap:10px;border-right:1px solid rgba(183,163,205,.38);background:linear-gradient(160deg,rgba(235,225,245,.74),rgba(217,201,234,.58))}
.fis-floating-head .fis-page-tabs{display:flex;flex:0 0 auto;flex-direction:column;align-items:stretch;gap:6px;overflow:visible!important}
.fis-floating-head .fis-page-tab{width:100%;min-height:38px!important;padding:8px 9px!important;border:1px solid transparent!important;border-radius:10px!important;background:rgba(255,255,255,.4)!important;color:#665775!important;text-align:left;white-space:normal}
.fis-floating-head .fis-page-tab.active{border-color:rgba(144,116,176,.5)!important;background:linear-gradient(135deg,rgba(170,145,201,.92),rgba(139,111,174,.9))!important;color:#fff!important;box-shadow:0 4px 12px rgba(105,78,137,.2)}
.fis-floating-head-actions{grid-column:2;grid-row:1;margin:0;display:flex;align-items:center;justify-content:flex-end;gap:6px;padding:9px 12px 0}.fis-floating-head-actions .fis-icon-btn,.fis-floating-close{width:38px!important;height:34px!important;min-height:34px!important;background:rgba(255,255,255,.6)!important;border-color:rgba(182,162,204,.48)!important;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.fis-floating-body{grid-column:2;grid-row:2;min-width:0;overflow:auto;overscroll-behavior:contain;padding:10px 12px 12px}
.fis-floating-panel .fis-row{grid-template-columns:50px minmax(0,1fr);gap:6px}.fis-choice-chips{display:flex!important;align-items:center;gap:5px!important;flex-wrap:wrap;padding:4px!important}.fis-choice-chips :is(.fis-input-target,.fis-target-option){position:relative;display:inline-flex;align-items:center;justify-content:center;min-width:0;padding:5px 9px;border:1px solid rgba(182,161,203,.42);border-radius:999px;background:rgba(255,255,255,.56);color:#675977;line-height:1.15;cursor:pointer}.fis-choice-chips :is(.fis-input-target,.fis-target-option):has(input:checked){border-color:#a17fc0;background:#a17fc0;color:#fff;box-shadow:0 3px 9px rgba(112,82,144,.18)}.fis-choice-chips :is(.fis-input-target,.fis-target-option) input{position:absolute;width:1px!important;height:1px!important;margin:0;opacity:0;pointer-events:none}.fis-choice-chips .fis-target-option span{overflow:visible;text-overflow:clip}
.fis-floating-panel :is(.fis-region,.fis-input-style-card,.fis-color-panel,.fis-theme-card){background:rgba(255,255,255,.5)!important;border-color:rgba(182,161,203,.36)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.6);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px)}
.fis-floating-panel :is(.fis-input-targets,.fis-select,.fis-number,.fis-color-pair input,.fis-inline-color-editor input){background:rgba(255,255,255,.69)!important;border-color:rgba(184,164,204,.43)!important}
.fis-floating-panel .fis-subtab-bar{border-bottom-color:rgba(172,149,196,.36)}
.fis-floating-panel .fis-image-tab.active,.fis-floating-panel .fis-font-tab.active,.fis-floating-panel .fis-color-tab.active{background:rgba(255,255,255,.67)!important;border-color:rgba(178,156,200,.4)!important}
.fis-floating-panel :is(input[type=checkbox],input[type=radio]){accent-color:#9b78ba}.fis-floating-panel .fis-switch input:checked+.fis-switch-track{background:#a17fc0}.fis-floating-panel .fis-range{accent-color:#9b78ba;background:linear-gradient(to right,#a17fc0 0 var(--fis-range-progress,50%),rgba(211,199,223,.82) var(--fis-range-progress,50%) 100%)!important}.fis-floating-panel .fis-range::-webkit-slider-thumb,.fis-floating-panel .fis-range::-moz-range-thumb{background:#9b78ba}.fis-floating-panel .fis-btn.primary,.fis-floating-panel .fis-icon-btn.primary{background:#9b78ba!important;border-color:#9b78ba!important;color:#fff!important}
.fis-settings .fis-page-tab.active,.fis-settings .fis-btn.primary,.fis-settings .fis-icon-btn.primary,.fis-floating-panel .fis-btn.primary,.fis-floating-panel .fis-icon-btn.primary{background:#a17fc0!important;border-color:#a17fc0!important;color:#fff!important}.fis-settings .fis-switch input:checked+.fis-switch-track,.fis-settings-toggle-row .fis-switch input:checked+.fis-switch-track,.fis-dialog-actions .fis-btn.primary{background:#a17fc0!important;border-color:#a17fc0!important}
.fis-settings-toggle-row+.fis-settings:not(.fis-floating-panel){display:none!important}
.fis-floating-panel.fis-theme-library-mode{width:min(390px,calc(100vw - 44px))!important;height:min(72vh,680px);grid-template-columns:minmax(0,1fr)}.fis-floating-panel.fis-theme-library-mode .fis-floating-body{grid-column:1}.fis-theme-library-body{display:flex;flex-direction:column;min-height:0;overflow:hidden!important}.fis-theme-library-heading{flex:0 0 auto;padding:2px 3px 11px;color:#4d3f5c;font-size:15px;font-weight:700}.fis-theme-library-list{flex:1;min-height:0;overflow-y:auto;padding:1px 2px 10px}.fis-theme-library-tools{display:flex;flex:0 0 auto;align-items:center;justify-content:center;gap:12px;margin-top:auto;padding:8px;border:1px solid rgba(182,161,203,.36);border-radius:12px;background:rgba(255,255,255,.48);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}.fis-theme-library-card{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;margin-bottom:8px;padding:10px;border:1px solid rgba(182,161,203,.36);border-radius:11px;background:rgba(255,255,255,.5);box-shadow:inset 0 1px 0 rgba(255,255,255,.62)}.fis-theme-library-card.selecting{grid-template-columns:22px minmax(0,1fr);cursor:pointer}.fis-theme-library-card.selecting.selected{border-color:#a17fc0;background:rgba(161,127,192,.14);box-shadow:0 0 0 1px rgba(161,127,192,.2)}.fis-theme-library-card input{width:18px;height:18px}.fis-theme-library-actions{display:flex;gap:6px}.fis-theme-library-empty{display:grid;place-items:center;min-height:160px;color:#897b96;font-size:12px;text-align:center}@media(max-width:560px){.fis-floating-panel.fis-theme-library-mode{width:calc(100vw - 40px)!important}.fis-theme-library-tools{gap:8px}.fis-theme-library-card{padding:8px}}
.fis-floating-panel.fis-theme-library-mode{grid-template-rows:minmax(0,1fr)}.fis-floating-panel.fis-theme-library-mode .fis-floating-body{grid-row:1}
@media(max-width:560px){.fis-floating-button{right:0!important;width:22px!important;height:58px!important;min-height:58px}.fis-floating-panel{left:auto!important;right:28px!important;bottom:auto;width:calc(100vw - 40px)!important;grid-template-columns:80px minmax(0,1fr);max-height:78vh}.fis-floating-head{padding:9px 6px}.fis-floating-head .fis-page-tab{padding:7px 6px!important;font-size:11px!important}.fis-floating-body{padding:8px 9px 9px}.fis-floating-head-actions{padding:7px 9px 0}.fis-floating-head-actions .fis-icon-btn,.fis-floating-close{width:34px!important}}

.fis-dialog-overlay{position:fixed;inset:0;z-index:2147483005;display:grid;place-items:center;padding:18px;background:rgba(30,41,59,.22);backdrop-filter:blur(3px)}.fis-dialog-card{width:min(360px,calc(100vw - 36px));padding:16px;border:1px solid rgba(108,132,162,.28);border-radius:14px;background:rgba(248,252,255,.88);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);color:#334155;box-shadow:0 16px 46px rgba(42,57,78,.3)}.fis-dialog-title{font-size:15px;font-weight:700}.fis-dialog-message{margin-top:7px;color:#68788d;font-size:12px;line-height:1.55}.fis-dialog-input{box-sizing:border-box;width:100%;min-height:38px;margin-top:12px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:9px;background:rgba(255,255,255,.72);color:#334155;font-size:13px;outline:none}.fis-dialog-input:focus{border-color:#6f8fb5;box-shadow:0 0 0 3px rgba(111,143,181,.14)}.fis-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.fis-dialog-actions .fis-btn{display:inline-flex!important;align-items:center;justify-content:center;min-height:34px;padding:7px 13px;border:1px solid #cbd5e1;border-radius:9px;background:rgba(255,255,255,.7);color:#52677f;font-size:12px;cursor:pointer}.fis-dialog-actions .fis-btn.primary{border-color:#6f8fb5;background:#6f8fb5;color:#fff}.fis-dialog-actions .fis-btn.danger{border-color:#d92d20;background:#d92d20;color:#fff}

/* 按钮与胶囊使用独立样式，不再占用主题配色规则。 */
html[data-fis-view-scope="1"][data-fis-button-accent="1"] .chat-app .ui-btn-primary,
html[data-fis-view-scope="1"][data-fis-button-accent="1"] .chat-app .ui-btn-action,
html[data-fis-view-scope="1"][data-fis-button-accent="1"] .chat-app .chat-list-tab.active,
html[data-fis-view-scope="1"][data-fis-button-accent="1"] .chat-app .minimal-unread-count,
html[data-fis-view-scope="1"][data-fis-button-accent="1"] .chat-app [class~="bg-[var(--c-action-blue,#246bfd)]"]{background:var(--fis-button-accent-background)!important;border:var(--fis-button-border-width) solid var(--fis-button-border-color)!important;border-radius:var(--fis-button-radius)!important}
html[data-fis-view-scope="1"][data-fis-button-accent="1"] .chat-app .ui-btn-primary,
html[data-fis-view-scope="1"][data-fis-button-accent="1"] .chat-app .ui-btn-action{box-shadow:0 4px 14px color-mix(in srgb,var(--fis-button-accent-background) 35%,transparent)!important}
html[data-fis-view-scope="1"][data-fis-button-accent="1"] .chat-app .ui-btn-ghost{color:var(--fis-button-accent-background)!important;border-radius:var(--fis-button-radius)!important}

/* 主页与设置页的大块菜单卡片，排除按钮、输入框和浮动窗口。 */
html[data-fis-view-scope="1"][data-fis-interface-cards="1"] .chat-app:not([data-room-active]) [class~="mx-4"][class~="rounded-2xl"][class~="bg-[var(--c-card)]"]{background:var(--fis-interface-background)!important;border:var(--fis-interface-border-width) solid var(--fis-interface-border-color)!important;border-radius:var(--fis-interface-radius)!important;overflow:hidden}

html[data-fis-view-scope="1"][data-fis-font-title="1"] .chat-app:not([data-room-active]) :is(.page-title,.settings-menu-section-title,.appearance-menu-section-title,.card-section-label,.menu-label,.feed-post-author-name,.feed-comment-author,.feed-comment-reply-target,[class~="text-[var(--c-text-title)]"]),
html[data-fis-view-scope="1"][data-fis-font-title="1"] .chat-app .chat-room-wrapper .page-header .page-title{font-family:var(--fis-font-title),sans-serif!important}
html[data-fis-view-scope="1"][data-fis-font-text="1"] .chat-app:not([data-room-active]) :is(.menu-desc,.feed-profile-signature,.feed-profile-signature-text,.feed-post-content,.feed-post-location,.feed-like-summary,.feed-comment-body,[class~="text-[var(--c-text)]"]),
html[data-fis-view-scope="1"][data-fis-font-text="1"] .chat-app :is(.feed-profile-signature,.feed-profile-signature-text,.feed-post-content,.feed-post-location,.feed-like-summary,.feed-comment-body){font-family:var(--fis-font-text),sans-serif!important}
html[data-fis-view-scope="1"][data-fis-font-meta-text="1"] .chat-app:not([data-room-active]) :is(.ts-10,.ts-11,.feed-post-time,.feed-comment-meta,.feed-inline-translation,.contact-letter-header,.minimal-list-item [class~="text-[var(--c-icon)]"]){font-family:var(--fis-font-meta-text),sans-serif!important}
html[data-fis-view-scope="1"][data-fis-font-button="1"] .chat-app:not([data-room-active]) :is(.ui-btn-primary,.ui-btn-primary *,.ui-btn-action,.ui-btn-action *,.ui-btn-ghost,.ui-btn-ghost *,.chat-list-tab,.chat-list-tab *,.minimal-unread-count){font-family:var(--fis-font-button),sans-serif!important}
html[data-fis-view-scope="1"][data-fis-font-input="1"] .chat-app :is(input,textarea,select):not(.font-mono),
html[data-fis-view-scope="1"][data-fis-font-input="1"] .chat-app .chat-search-input,
html[data-fis-view-scope="1"][data-fis-font-input="1"] .chat-app .chat-search-input::placeholder{font-family:var(--fis-font-input),sans-serif!important}
html[data-fis-view-scope="1"][data-fis-font-nav-text="1"] .chat-app .chat-tab-bar,
html[data-fis-view-scope="1"][data-fis-font-nav-text="1"] .chat-app .chat-tab-bar *{font-family:var(--fis-font-nav-text),sans-serif!important}

/* 文字不再覆盖 Float 的全局变量：按界面语义精确着色，避免污染弹窗、气泡与富媒体小组件。 */
html[data-fis-view-scope="1"][data-fis-color-title="1"] .chat-app:not([data-room-active]) .page-title,
html[data-fis-view-scope="1"][data-fis-color-title="1"] .chat-app:not([data-room-active]) .settings-menu-section-title,
html[data-fis-view-scope="1"][data-fis-color-title="1"] .chat-app:not([data-room-active]) .appearance-menu-section-title,
html[data-fis-view-scope="1"][data-fis-color-title="1"] .chat-app:not([data-room-active]) .card-section-label,
html[data-fis-view-scope="1"][data-fis-color-title="1"] .chat-app:not([data-room-active]) .menu-label,
html[data-fis-view-scope="1"][data-fis-color-title="1"] .chat-app:not([data-room-active]) [class~="text-[var(--c-text-title)]"],
html[data-fis-view-scope="1"][data-fis-color-title="1"] .chat-app:not([data-room-active]) .contact-letter-header,
html[data-fis-view-scope="1"][data-fis-color-title="1"] .chat-app:not([data-room-active]) .contact-alpha-letter,
html[data-fis-view-scope="1"][data-fis-color-title="1"] .chat-app .chat-room-wrapper .page-title{color:var(--fis-color-title)!important}

html[data-fis-view-scope="1"][data-fis-color-text="1"] .chat-app:not([data-room-active]) .menu-desc,
html[data-fis-view-scope="1"][data-fis-color-text="1"] .chat-app:not([data-room-active]) [class~="text-[var(--c-text)]"],
html[data-fis-view-scope="1"][data-fis-color-text="1"] .chat-app:not([data-room-active]) .chat-search-input,
html[data-fis-view-scope="1"][data-fis-color-text="1"] .chat-app:not([data-room-active]) .chat-search-input::placeholder,
html[data-fis-view-scope="1"][data-fis-color-text="1"] .chat-app:not([data-room-active]) .feed-profile-signature,
html[data-fis-view-scope="1"][data-fis-color-text="1"] .chat-app:not([data-room-active]) .feed-post-content,
html[data-fis-view-scope="1"][data-fis-color-text="1"] .chat-app:not([data-room-active]) .feed-post-location,
html[data-fis-view-scope="1"][data-fis-color-text="1"] .chat-app:not([data-room-active]) .feed-like-summary,
html[data-fis-view-scope="1"][data-fis-color-text="1"] .chat-app:not([data-room-active]) .feed-comment-body{color:var(--fis-color-text)!important}

/* 动态页的独有语义不依赖会话状态，避免 Float 保留旧会话时漏改。 */
html[data-fis-view-scope="1"][data-fis-color-text="1"] .chat-app .feed-profile-signature,
html[data-fis-view-scope="1"][data-fis-color-text="1"] .chat-app .feed-profile-signature-text,
html[data-fis-view-scope="1"][data-fis-color-text="1"] .chat-app .feed-profile-signature-input,
html[data-fis-view-scope="1"][data-fis-color-text="1"] .chat-app .feed-post-content,
html[data-fis-view-scope="1"][data-fis-color-text="1"] .chat-app .feed-post-location,
html[data-fis-view-scope="1"][data-fis-color-text="1"] .chat-app .feed-like-summary,
html[data-fis-view-scope="1"][data-fis-color-text="1"] .chat-app .feed-comment-body{color:var(--fis-color-text)!important}

html[data-fis-view-scope="1"][data-fis-color-title="1"] .chat-app:not([data-room-active]) .feed-post-author-name,
html[data-fis-view-scope="1"][data-fis-color-title="1"] .chat-app:not([data-room-active]) .feed-comment-author,
html[data-fis-view-scope="1"][data-fis-color-title="1"] .chat-app:not([data-room-active]) .feed-comment-reply-target,
html[data-fis-view-scope="1"][data-fis-color-title="1"] .chat-app:not([data-room-active]) .feed-profile-stats,
html[data-fis-view-scope="1"][data-fis-color-title="1"] .chat-app:not([data-room-active]) .feed-profile-stat-value{color:var(--fis-color-title)!important}

html[data-fis-view-scope="1"][data-fis-color-meta-text="1"] .chat-app:not([data-room-active]) .minimal-list-item [class~="text-[var(--c-icon)]"],
html[data-fis-view-scope="1"][data-fis-color-meta-text="1"] .chat-app:not([data-room-active]) .page-header .ts-10,
html[data-fis-view-scope="1"][data-fis-color-meta-text="1"] .chat-app .chat-room-wrapper .page-header .ts-10,
html[data-fis-view-scope="1"][data-fis-color-meta-text="1"] .chat-app .feed-post-time,
html[data-fis-view-scope="1"][data-fis-color-meta-text="1"] .chat-app:not([data-room-active]) .feed-comment-meta,
html[data-fis-view-scope="1"][data-fis-color-meta-text="1"] .chat-app .chat-bilingual-toggle,
html[data-fis-view-scope="1"][data-fis-color-meta-text="1"] .chat-app .chat-bilingual-section-translation,
html[data-fis-view-scope="1"][data-fis-color-meta-text="1"] .chat-app .chat-bilingual-section-translation .chat-markdown,
html[data-fis-view-scope="1"][data-fis-color-meta-text="1"] .chat-app .chat-quote-bar>div:first-child,
html[data-fis-view-scope="1"][data-fis-color-meta-text="1"] .chat-app .chat-quote-preview,
html[data-fis-view-scope="1"][data-fis-color-meta-text="1"] .chat-app .feed-inline-translation{color:var(--fis-color-meta-text)!important}

/* 普通图标只处理明确的图标容器，不再借 --c-icon 影响时间、分类和说明文字。 */
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app .page-back-btn,
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app .page-header-right button,
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app:not([data-room-active]) .menu-icon,
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app:not([data-room-active]) .menu-right svg,
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app:not([data-room-active]) .chat-search-bar>svg,
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app:not([data-room-active]) .feed-profile-avatar-fallback,
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app:not([data-room-active]) .user-profile-page-root .lucide-user,
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app:not([data-room-active]) .feed-post-more-btn,
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app:not([data-room-active]) .feed-like-summary-icon,
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app:not([data-room-active]) .feed-comment-icon-button,
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app .chat-tab:not(.chat-tab-active),
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app .chat-tab:not(.chat-tab-active)>span{color:var(--fis-color-icon)!important}
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app:not([data-room-active]) .menu-icon svg,
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app:not([data-room-active]) .menu-right svg,
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app:not([data-room-active]) .chat-search-bar>svg{color:var(--fis-color-icon)!important;stroke:var(--fis-color-icon)!important}
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app .feed-post-actions button,
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app .feed-post-actions button svg,
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app .user-profile-page-root .lucide-user,
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app .user-profile-page-root svg[class~="text-[var(--c-icon)]"]{color:var(--fis-color-icon)!important;stroke:var(--fis-color-icon)!important}

html[data-fis-view-scope="1"][data-fis-color-active-icon="1"] .chat-app .chat-tab-active{color:var(--fis-color-active-icon)!important}

/* 聊天输入区的线性工具图标统一归入普通图标。 */
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app .chat-input-actions .ui-bare-btn,
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app .chat-plus-menu-item:not([data-active]) .chat-plus-icon-box,
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app .chat-plus-menu-item:not([data-active])>span{color:var(--fis-color-icon)!important}
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app .chat-plus-menu-item:not([data-active]) .chat-plus-icon-box svg{color:var(--fis-color-icon)!important;stroke:var(--fis-color-icon)!important}
html[data-fis-view-scope="1"][data-fis-color-icon="1"] .chat-app .chat-plus-menu-item:not([data-active]) .chat-plus-icon-box svg text{fill:var(--fis-color-icon)!important;stroke:none!important}
html[data-fis-view-scope="1"][data-fis-color-active-icon="1"] .chat-app .chat-plus-menu-item[data-active] .chat-plus-icon-box{color:var(--fis-color-active-icon)!important}
html[data-fis-view-scope="1"][data-fis-color-active-icon="1"] .chat-app .chat-plus-menu-item[data-active] .chat-plus-icon-box svg{color:var(--fis-color-active-icon)!important;stroke:var(--fis-color-active-icon)!important}

/* 浮动窗口保留 Float 自己的文字体系。 */
html[data-fis-view-scope="1"][data-fis-colors="1"] .chat-app :is([data-ui="modal"],.modal-overlay) .menu-label,
html[data-fis-view-scope="1"][data-fis-colors="1"] .chat-app :is([data-ui="modal"],.modal-overlay) [class~="text-[var(--c-text-title)]"]{color:var(--c-text-title)!important}
html[data-fis-view-scope="1"][data-fis-colors="1"] .chat-app :is([data-ui="modal"],.modal-overlay) .menu-desc,
html[data-fis-view-scope="1"][data-fis-colors="1"] .chat-app :is([data-ui="modal"],.modal-overlay) [class~="text-[var(--c-text)]"]{color:var(--c-text)!important}
html[data-fis-view-scope="1"][data-fis-colors="1"] .chat-app :is([data-ui="modal"],.modal-overlay) [class~="text-[var(--c-icon)]"]{color:var(--c-icon)!important}
html[data-fis-view-scope="1"][data-fis-colors="1"] .chat-app :is([data-ui="modal"],.modal-overlay) :is(.ui-btn-primary,.ui-btn-action){background:var(--c-icon-active)!important;box-shadow:0 4px 14px color-mix(in srgb,var(--c-icon-active) 35%,transparent)!important}
html[data-fis-view-scope="1"][data-fis-colors="1"] .chat-app :is([data-ui="modal"],.modal-overlay) .ui-btn-ghost{color:var(--c-icon-active)!important}
html[data-fis-view-scope="1"][data-fis-input-color-chat="1"] .chat-app .chat-room-wrapper .chat-input-textarea{background:var(--fis-input-background-color)!important}
html[data-fis-view-scope="1"][data-fis-input-color-search="1"] .chat-app .chat-search-bar{background:var(--fis-input-background-color)!important}
html[data-fis-view-scope="1"][data-fis-input-color-form="1"] .chat-app .ui-input:not(.ui-input-inline):not(.font-mono),html[data-fis-view-scope="1"][data-fis-input-color-form="1"] .chat-app .ui-textarea:not(.ui-input-inline):not(.font-mono),html[data-fis-view-scope="1"][data-fis-input-color-form="1"] .chat-app .ui-select:not(.font-mono){background:var(--fis-input-background-color)!important}
html[data-fis-view-scope="1"][data-fis-button-capsule="1"] .chat-app .chat-list-tab:not(.active){background:var(--fis-button-capsule-background)!important;border:var(--fis-button-border-width) solid var(--fis-button-border-color)!important;border-radius:var(--fis-button-radius)!important}
html[data-fis-view-scope="1"][data-fis-color-text="1"] .chat-app .chat-list-tab:not(.active){color:var(--fis-color-text)!important}
html[data-fis-view-scope="1"][data-fis-color-title="1"] .chat-app .chat-list-tab.active{color:var(--fis-color-title)!important}

/* 背景按页面根节点独立绘制，不再依赖可能被缓存页面误导的全局 activeView。 */
html[data-fis-app-background="1"][data-fis-background-target-chat-room="1"] .chat-app .chat-room-wrapper,
html[data-fis-app-background="1"][data-fis-background-target-messages="1"] .chat-app .page-shell:has(.chat-list-tabs),
html[data-fis-app-background="1"][data-fis-background-target-contacts="1"] .chat-app .page-shell:has(input[placeholder='Search contacts...'],.contacts-page-root),
html[data-fis-app-background="1"][data-fis-background-target-feeds="1"] .chat-app .page-shell:has(.feed-cover-shell),
html[data-fis-app-background="1"][data-fis-background-target-me="1"] .chat-app .user-profile-page-root{background-color:transparent!important;background-image:var(--fis-app-background-image)!important;background-size:var(--fis-app-background-size)!important;background-repeat:var(--fis-app-background-repeat)!important;background-position:var(--fis-app-background-position)!important}
html[data-fis-app-background="1"][data-fis-background-target-chat-room="1"] .chat-app .chat-room-wrapper :is(.chat-main-content,.page-body),
html[data-fis-app-background="1"][data-fis-background-target-messages="1"] .chat-app .page-shell:has(.chat-list-tabs) :is(.chat-main-content,.page-body),
html[data-fis-app-background="1"][data-fis-background-target-contacts="1"] .chat-app .page-shell:has(input[placeholder='Search contacts...'],.contacts-page-root) :is(.chat-main-content,.page-body),
html[data-fis-app-background="1"][data-fis-background-target-feeds="1"] .chat-app .page-shell:has(.feed-cover-shell) :is(.chat-main-content,.page-body),
html[data-fis-app-background="1"][data-fis-background-target-me="1"] .chat-app .user-profile-page-root :is(.chat-main-content,.page-body){background-color:transparent!important}

html[data-fis-view-scope="1"][data-fis-input-image-chat="1"] .chat-app .chat-room-wrapper .chat-input-textarea,html[data-fis-view-scope="1"][data-fis-input-image-search="1"] .chat-app .chat-search-bar,html[data-fis-view-scope="1"][data-fis-input-image-form="1"] .chat-app .ui-input:not(.ui-input-inline):not(.font-mono),html[data-fis-view-scope="1"][data-fis-input-image-form="1"] .chat-app .ui-textarea:not(.ui-input-inline):not(.font-mono),html[data-fis-view-scope="1"][data-fis-input-image-form="1"] .chat-app .ui-select:not(.font-mono){background-color:transparent!important;background-image:var(--fis-input-field-image)!important;background-size:var(--fis-input-field-size)!important;background-repeat:var(--fis-input-field-repeat)!important;background-position:var(--fis-input-field-position)!important;box-shadow:none}

html[data-fis-view-scope="1"][data-fis-input-style-chat="1"] .chat-app .chat-room-wrapper .chat-input-textarea,
html[data-fis-view-scope="1"][data-fis-input-style-search="1"] .chat-app .chat-search-bar,
html[data-fis-view-scope="1"][data-fis-input-style-form="1"] .chat-app .ui-input:not(.ui-input-inline):not(.font-mono),
html[data-fis-view-scope="1"][data-fis-input-style-form="1"] .chat-app .ui-textarea:not(.ui-input-inline):not(.font-mono),
html[data-fis-view-scope="1"][data-fis-input-style-form="1"] .chat-app .ui-select:not(.font-mono){border:var(--fis-input-border-width) solid var(--fis-input-border-color)!important;border-radius:var(--fis-input-radius)!important}
html[data-fis-view-scope="1"][data-fis-input-style-chat="1"] .chat-app .chat-room-wrapper .chat-input-textarea{width:var(--fis-chat-input-width,100%)!important;max-width:var(--fis-chat-input-width,100%)!important;min-width:0!important;flex:0 1 var(--fis-chat-input-width,100%)!important;margin-inline:auto!important}

/* 基础色先铺在页面根层；图片层启用时仍可在其上正常显示。 */
html[data-fis-base-color="1"][data-fis-base-target-chat-room="1"] .chat-app .chat-room-wrapper,
html[data-fis-base-color="1"][data-fis-base-target-messages="1"] .chat-app .page-shell:has(.chat-list-tabs),
html[data-fis-base-color="1"][data-fis-base-target-contacts="1"] .chat-app .page-shell:has(input[placeholder='Search contacts...'],.contacts-page-root),
html[data-fis-base-color="1"][data-fis-base-target-feeds="1"] .chat-app .page-shell:has(.feed-cover-shell),
html[data-fis-base-color="1"][data-fis-base-target-me="1"] .chat-app .user-profile-page-root{--c-page-body-bg:var(--fis-base-color)!important;background-color:var(--fis-base-color)!important}
html[data-fis-base-color="1"][data-fis-base-target-chat-room="1"] .chat-app .chat-room-wrapper :is(.chat-main-content,.page-body),
html[data-fis-base-color="1"][data-fis-base-target-messages="1"] .chat-app .page-shell:has(.chat-list-tabs) :is(.chat-main-content,.page-body),
html[data-fis-base-color="1"][data-fis-base-target-contacts="1"] .chat-app .page-shell:has(input[placeholder='Search contacts...'],.contacts-page-root) :is(.chat-main-content,.page-body),
html[data-fis-base-color="1"][data-fis-base-target-feeds="1"] .chat-app .page-shell:has(.feed-cover-shell) :is(.chat-main-content,.page-body),
html[data-fis-base-color="1"][data-fis-base-target-me="1"] .chat-app .user-profile-page-root :is(.chat-main-content,.page-body){--c-page-body-bg:var(--fis-base-color)!important;background-color:transparent!important}

/* 默认栏位共用可调色毛玻璃；对应图片启用时，两者严格互斥。 */
html[data-fis-base-color="1"][data-fis-base-target-chat-room="1"] .chat-app .chat-room-wrapper>.page-header,
html[data-fis-base-color="1"][data-fis-base-target-messages="1"] .chat-app .page-shell:has(.chat-list-tabs)>.page-header,
html[data-fis-base-color="1"][data-fis-base-target-contacts="1"] .chat-app .page-shell:has(input[placeholder='Search contacts...'],.contacts-page-root)>.page-header{--c-header-bg:var(--fis-base-glass)!important;background:var(--fis-base-glass)!important;backdrop-filter:blur(18px) saturate(1.12)!important;-webkit-backdrop-filter:blur(18px) saturate(1.12)!important}
html[data-fis-base-color="1"][data-fis-base-target-chat-room="1"]:not([data-fis-bottom-image-input="1"]) .chat-app .chat-room-wrapper .chat-input-bar,
html[data-fis-base-color="1"][data-fis-base-target-chat-room="1"][data-fis-bottom-image-input="1"] .chat-app .chat-room-wrapper .chat-input-bar:is(:has(.chat-plus-menu),:has(>[class~="h-[220px]"])){background:var(--fis-base-glass)!important;backdrop-filter:blur(18px) saturate(1.12)!important;-webkit-backdrop-filter:blur(18px) saturate(1.12)!important}
html[data-fis-view-scope="1"][data-fis-active-view="messages"][data-fis-base-target-messages="1"]:not([data-fis-bottom-image-tab="1"]) .chat-app .chat-tab-bar,
html[data-fis-view-scope="1"][data-fis-active-view="contacts"][data-fis-base-target-contacts="1"]:not([data-fis-bottom-image-tab="1"]) .chat-app .chat-tab-bar,
html[data-fis-view-scope="1"][data-fis-active-view="feeds"][data-fis-base-target-feeds="1"]:not([data-fis-bottom-image-tab="1"]) .chat-app .chat-tab-bar,
html[data-fis-view-scope="1"][data-fis-active-view="me"][data-fis-base-target-me="1"]:not([data-fis-bottom-image-tab="1"]) .chat-app .chat-tab-bar{background:var(--fis-base-glass)!important;border-top-color:var(--fis-base-glass)!important;box-shadow:none!important;backdrop-filter:blur(18px) saturate(1.12)!important;-webkit-backdrop-filter:blur(18px) saturate(1.12)!important}
html[data-fis-base-color="1"][data-fis-base-target-chat-room="1"] .chat-app .chat-room-wrapper .chat-plus-menu{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
html[data-fis-base-color="1"][data-fis-base-target-chat-room="1"] .chat-app .chat-room-wrapper .chat-plus-menu-item .chat-plus-icon-box{background:var(--fis-tool-icon-background)!important}

/* 文字图片、系统指令、红包、转账、位置等富功能弹窗保持 Float 原样。 */
html[data-fis-view-scope="1"][data-fis-colors="1"] .chat-app .modal-overlay .ui-input:not(.ui-input-inline),
html[data-fis-view-scope="1"][data-fis-colors="1"] .chat-app .modal-overlay .ui-textarea:not(.ui-input-inline),
html[data-fis-view-scope="1"][data-fis-colors="1"] .chat-app .modal-overlay .ui-select,
html[data-fis-view-scope="1"][data-fis-input-image-form="1"] .chat-app .modal-overlay .ui-input:not(.ui-input-inline),
html[data-fis-view-scope="1"][data-fis-input-image-form="1"] .chat-app .modal-overlay .ui-textarea:not(.ui-input-inline),
html[data-fis-view-scope="1"][data-fis-input-image-form="1"] .chat-app .modal-overlay .ui-select,
html[data-fis-view-scope="1"][data-fis-input-color-form="1"] .chat-app .modal-overlay .ui-input:not(.ui-input-inline),
html[data-fis-view-scope="1"][data-fis-input-color-form="1"] .chat-app .modal-overlay .ui-textarea:not(.ui-input-inline),
html[data-fis-view-scope="1"][data-fis-input-color-form="1"] .chat-app .modal-overlay .ui-select{background-color:var(--c-input)!important;background-image:none!important;background-size:auto!important;background-repeat:initial!important;background-position:initial!important;box-shadow:initial}

html[data-fis-view-scope="1"][data-fis-top-target-chat-room="1"] .chat-app .chat-room-wrapper>.page-header,
html[data-fis-view-scope="1"][data-fis-top-target-messages="1"] .chat-app .page-shell:has(.chat-list-tabs)>.page-header,
html[data-fis-view-scope="1"][data-fis-top-target-contacts="1"] .chat-app .page-shell:has(input[placeholder='Search contacts...'])>.page-header,
html[data-fis-view-scope="1"][data-fis-top-target-feeds="1"] .chat-app .page-shell:has(.feed-cover-shell)>.page-header,
html[data-fis-view-scope="1"][data-fis-top-target-me="1"] .chat-app .user-profile-page-root>.page-header,
html[data-fis-view-scope="1"][data-fis-bottom-image-input="1"] .chat-app .chat-room-wrapper .chat-input-bar:not(:has(.chat-plus-menu)):not(:has(>[class~="h-[220px]"])),
html[data-fis-view-scope="1"][data-fis-bottom-image-tab="1"] .chat-app .chat-tab-bar{isolation:isolate;overflow:visible!important;background:transparent!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
html[data-fis-view-scope="1"][data-fis-bottom-image-input="1"] .chat-app .chat-room-wrapper .chat-input-bar:not(:has(.chat-plus-menu)):not(:has(>[class~="h-[220px]"])){border-top:0!important;border-top-color:transparent!important}
html[data-fis-view-scope="1"][data-fis-bottom-image-tab="1"] .chat-app .chat-tab-bar{border-top:0!important;border-top-color:transparent!important}
html[data-fis-view-scope="1"][data-fis-top-target-chat-room="1"] .chat-app .chat-room-wrapper>.page-header::before,
html[data-fis-view-scope="1"][data-fis-top-target-messages="1"] .chat-app .page-shell:has(.chat-list-tabs)>.page-header::before,
html[data-fis-view-scope="1"][data-fis-top-target-contacts="1"] .chat-app .page-shell:has(input[placeholder='Search contacts...'])>.page-header::before,
html[data-fis-view-scope="1"][data-fis-top-target-feeds="1"] .chat-app .page-shell:has(.feed-cover-shell)>.page-header::before,
html[data-fis-view-scope="1"][data-fis-top-target-me="1"] .chat-app .user-profile-page-root>.page-header::before{content:"";position:absolute;top:calc(-1px * var(--fis-top-bar-over-top,0));right:0;bottom:calc(-1px * var(--fis-top-bar-over-bottom,0));left:0;z-index:-1;pointer-events:none;background-color:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background-image:var(--fis-top-bar-image)!important;background-size:var(--fis-top-bar-size)!important;background-repeat:var(--fis-top-bar-repeat)!important;background-position:var(--fis-top-bar-position)!important}
html[data-fis-view-scope="1"][data-fis-bottom-image-input="1"] .chat-app .chat-room-wrapper .chat-input-bar:not(:has(.chat-plus-menu)):not(:has(>[class~="h-[220px]"]))::before{content:"";position:absolute;top:calc(-1px * var(--fis-bottom-bar-input-over-top,0));right:0;bottom:calc(-1px * var(--fis-bottom-bar-input-over-bottom,0));left:0;z-index:-1;pointer-events:none;background-color:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background-image:var(--fis-bottom-bar-input-image)!important;background-size:var(--fis-bottom-bar-input-size)!important;background-repeat:no-repeat!important;background-position:var(--fis-bottom-bar-input-position)!important}
html[data-fis-view-scope="1"][data-fis-bottom-image-tab="1"] .chat-app .chat-tab-bar::before{content:"";position:absolute;top:calc(-1px * var(--fis-bottom-bar-tab-over-top,0));right:0;bottom:calc(-1px * var(--fis-bottom-bar-tab-over-bottom,0));left:0;z-index:-1;pointer-events:none;background-color:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background-image:var(--fis-bottom-bar-tab-image)!important;background-size:var(--fis-bottom-bar-tab-size)!important;background-repeat:no-repeat!important;background-position:var(--fis-bottom-bar-tab-position)!important}

/* 头像圆角按页面范围生效；仅命中已确认的头像容器。 */
html[data-fis-avatar-style="1"][data-fis-avatar-target-messages="1"] .chat-app .page-shell:has(.chat-list-tabs,.messages-page-root) :is(.minimal-avatar-wrapper,[class~="w-[36px]"][class~="h-[36px]"]),
html[data-fis-avatar-style="1"][data-fis-avatar-target-contacts="1"] .chat-app .page-shell:has(input[placeholder='Search contacts...'],.contacts-page-root) :is(.minimal-avatar-wrapper,.freq-avatar,.freq-detail-avatar),
html[data-fis-avatar-style="1"][data-fis-avatar-target-feeds="1"] .chat-app :is(.feed-profile-avatar,.feed-post-author-avatar,.feed-comment-avatar),
html[data-fis-avatar-style="1"][data-fis-avatar-target-me="1"] .chat-app .user-profile-page-root [class~="w-[84px]"][class~="h-[84px]"],
html[data-fis-avatar-style="1"][data-fis-avatar-target-chat-room="1"] .chat-app .chat-room-wrapper :is(.chat-msg-avatar>[class~="w-[40px]"][class~="h-[40px]"],.chat-msg-wrapper>.chat-msg-avatar[class~="w-[40px]"][class~="h-[40px]"],.chat-offline-avatar){border-radius:var(--fis-avatar-radius)!important}
html[data-fis-avatar-style="1"] .chat-app :is(.minimal-avatar-wrapper,.freq-avatar,.freq-detail-avatar,.feed-profile-avatar,.feed-post-author-avatar,.feed-comment-avatar,.chat-offline-avatar,[class~="w-[84px]"][class~="h-[84px]"],.chat-msg-avatar>[class~="w-[40px]"][class~="h-[40px]"],.chat-msg-wrapper>.chat-msg-avatar[class~="w-[40px]"][class~="h-[40px]"])>img{border-radius:inherit!important}

/* 聊天顶部的角色名、角色头像与用户头像彼此独立。两个头像以顶部栏中心为原点自由移动，不参与标题布局。 */
html[data-fis-avatar-style="1"][data-fis-avatar-target-chat-room="1"][data-fis-chat-header-align="left"] .chat-app .chat-room-wrapper>.page-header .page-title{text-align:left!important;justify-self:stretch}
html[data-fis-avatar-style="1"][data-fis-avatar-target-chat-room="1"] .chat-app .chat-room-wrapper>.page-header .page-header-content{position:relative}
html[data-fis-avatar-style="1"][data-fis-avatar-target-chat-room="1"][data-fis-chat-header-avatar="1"] .chat-app .chat-room-wrapper>.page-header .page-header-content::before,
html[data-fis-avatar-style="1"][data-fis-avatar-target-chat-room="1"][data-fis-chat-header-user-avatar="1"] .chat-app .chat-room-wrapper>.page-header .page-header-content::after{content:"";position:absolute;z-index:1;left:50%;top:50%;display:block;width:var(--fis-chat-header-avatar-size);height:var(--fis-chat-header-avatar-size);box-sizing:border-box;border-radius:var(--fis-avatar-radius);background-size:cover;background-position:center;background-repeat:no-repeat;pointer-events:none}
html[data-fis-avatar-style="1"][data-fis-avatar-target-chat-room="1"][data-fis-chat-header-avatar="1"] .chat-app .chat-room-wrapper>.page-header .page-header-content::before{background-image:var(--fis-chat-header-avatar);transform:translate(calc(-50% + var(--fis-chat-header-avatar-x)),calc(-50% + var(--fis-chat-header-avatar-y)))}
html[data-fis-avatar-style="1"][data-fis-avatar-target-chat-room="1"][data-fis-chat-header-user-avatar="1"] .chat-app .chat-room-wrapper>.page-header .page-header-content::after{background-image:var(--fis-chat-header-user-avatar);transform:translate(calc(-50% + var(--fis-chat-header-user-avatar-x)),calc(-50% + var(--fis-chat-header-user-avatar-y)))}
html[data-fis-avatar-style="1"][data-fis-avatar-target-chat-room="1"][data-fis-chat-header-align="left"] .chat-app .chat-room-wrapper>.page-header .chat-typing-indicator{left:0;transform:none}

/* 用户与角色消息头像分别隐藏；角色占位同时收起，静默想法图标保留。 */
html[data-fis-avatar-style="1"][data-fis-avatar-target-chat-room="1"][data-fis-hide-chat-user-avatar="1"] .chat-app .chat-room-wrapper .chat-msg-wrapper[data-role="user"]>.chat-msg-avatar{display:none!important}
html[data-fis-avatar-style="1"][data-fis-avatar-target-chat-room="1"][data-fis-hide-chat-user-avatar="1"] .chat-app .chat-room-wrapper :is(.chat-msg-wrapper,.chat-offline-entry)[data-role="user"]>[class~="w-[40px]"][class~="shrink-0"],
html[data-fis-avatar-style="1"][data-fis-avatar-target-chat-room="1"][data-fis-hide-chat-user-avatar="1"] .chat-app .chat-room-wrapper .chat-offline-entry[data-role="user"]>.chat-offline-avatar{display:none!important}
html[data-fis-avatar-style="1"][data-fis-avatar-target-chat-room="1"][data-fis-hide-chat-role-avatar="1"] .chat-app .chat-room-wrapper .chat-msg-wrapper[data-role="assistant"]>.chat-msg-avatar,
html[data-fis-avatar-style="1"][data-fis-avatar-target-chat-room="1"][data-fis-hide-chat-role-avatar="1"] .chat-app .chat-room-wrapper .chat-msg-wrapper[data-role="assistant"]>[class~="w-[40px]"][class~="shrink-0"]:not(.chat-monologue-heart),
html[data-fis-avatar-style="1"][data-fis-avatar-target-chat-room="1"][data-fis-hide-chat-role-avatar="1"] .chat-app .chat-room-wrapper .chat-offline-entry[data-role="assistant"]>.chat-offline-avatar{display:none!important}

/* 自定义头像边框直接覆盖主页、动态原生边框，避免叠成双层。 */
html[data-fis-avatar-border="1"][data-fis-avatar-target-messages="1"] .chat-app .page-shell:has(.chat-list-tabs,.messages-page-root) :is(.minimal-avatar-wrapper,[class~="w-[36px]"][class~="h-[36px]"]),
html[data-fis-avatar-border="1"][data-fis-avatar-target-contacts="1"] .chat-app .page-shell:has(input[placeholder='Search contacts...'],.contacts-page-root) :is(.minimal-avatar-wrapper,.freq-avatar,.freq-detail-avatar),
html[data-fis-avatar-border="1"][data-fis-avatar-target-feeds="1"] .chat-app :is(.feed-profile-avatar,.feed-post-author-avatar,.feed-comment-avatar),
html[data-fis-avatar-border="1"][data-fis-avatar-target-me="1"] .chat-app .user-profile-page-root [class~="w-[84px]"][class~="h-[84px]"],
html[data-fis-avatar-border="1"][data-fis-avatar-target-chat-room="1"] .chat-app .chat-room-wrapper :is(.chat-msg-avatar>[class~="w-[40px]"][class~="h-[40px]"],.chat-msg-wrapper>.chat-msg-avatar[class~="w-[40px]"][class~="h-[40px]"],.chat-offline-avatar){box-sizing:border-box!important;border:var(--fis-avatar-border-width) solid var(--fis-avatar-border-color)!important}
html[data-fis-avatar-border="1"][data-fis-avatar-target-chat-room="1"][data-fis-chat-header-avatar="1"] .chat-app .chat-room-wrapper>.page-header .page-header-content::before,
html[data-fis-avatar-border="1"][data-fis-avatar-target-chat-room="1"][data-fis-chat-header-user-avatar="1"] .chat-app .chat-room-wrapper>.page-header .page-header-content::after{border:var(--fis-avatar-border-width) solid var(--fis-avatar-border-color)}

/* 心声便利贴与状态数值条。关闭功能后不覆盖 Float 原生样式。 */
html[data-fis-thought-style="1"] .chat-app .chat-room-wrapper .chat-thought-card{background:var(--fis-thought-background)!important;border-radius:var(--fis-thought-radius)!important}
html[data-fis-thought-style="1"][data-fis-thought-border="1"] .chat-app .chat-room-wrapper .chat-thought-card{border:var(--fis-thought-border-width) solid var(--fis-thought-border-color)!important}
html[data-fis-thought-style="1"]:not([data-fis-thought-border="1"]) .chat-app .chat-room-wrapper .chat-thought-card{border:0!important}
html[data-fis-thought-style="1"] .chat-app .chat-room-wrapper .chat-thought-title,
html[data-fis-thought-style="1"] .chat-app .chat-room-wrapper .chat-thought-sig{color:var(--fis-thought-title-color)!important}
html[data-fis-thought-style="1"] .chat-app .chat-room-wrapper .chat-thought-body,
html[data-fis-thought-style="1"] .chat-app .chat-room-wrapper .chat-thought-body :is(.chat-bilingual-section-translation,.chat-bilingual-toggle){color:var(--fis-thought-text-color)!important}
html[data-fis-thought-style="1"] .chat-app .chat-room-wrapper .chat-thought-tape-left{background:var(--fis-thought-tape-left)!important}
html[data-fis-thought-style="1"] .chat-app .chat-room-wrapper .chat-thought-tape-right{background:var(--fis-thought-tape-right)!important}
html[data-fis-thought-style="1"]:not([data-fis-thought-tape="1"]) .chat-app .chat-room-wrapper :is(.chat-thought-tape-left,.chat-thought-tape-right){display:none!important}
html[data-fis-thought-style="1"] .chat-app .chat-room-wrapper .state-bar-track{background:var(--fis-thought-value-track)!important}
html[data-fis-thought-style="1"] .chat-app .chat-room-wrapper .state-bar-fill{background:var(--fis-thought-value-fill)!important}
html[data-fis-thought-style="1"] .chat-app .chat-room-wrapper :is(button,div).chat-monologue-heart{position:relative!important;left:var(--fis-thought-icon-x)!important;top:var(--fis-thought-icon-y)!important;display:flex!important;align-items:center!important;justify-content:center!important;background:transparent!important;color:var(--fis-thought-icon-color)!important;box-shadow:none!important;overflow:visible!important}
html[data-fis-thought-style="1"] .chat-app .chat-room-wrapper :is(button,div).chat-monologue-heart>span.chat-monologue-heart{color:inherit!important}

/* iMessage 风格译文：紧跟原文、去除默认留白，可独立设色、粗细、字号与位置。 */
html[data-fis-translation-style="1"] .chat-app .chat-room-wrapper .chat-bilingual-block{gap:0!important}
html[data-fis-translation-style="1"] .chat-app .chat-room-wrapper .chat-bilingual-section-translation{position:relative;left:var(--fis-translation-x);top:var(--fis-translation-y);margin-top:1px;color:var(--fis-translation-color)!important;font-size:var(--fis-translation-size)!important;font-weight:var(--fis-translation-weight)!important;font-style:normal!important;opacity:1!important}
html[data-fis-translation-style="1"] .chat-app .chat-room-wrapper .chat-bilingual-section-translation .chat-markdown{color:inherit!important;font-size:inherit!important;font-weight:inherit!important;font-style:inherit!important;opacity:1!important}
html[data-fis-translation-style="1"] .chat-app .chat-room-wrapper .chat-bilingual-section-translation .chat-markdown :is(p,.chat-markdown-paragraph,li,blockquote){color:inherit!important;font-size:inherit!important;font-weight:inherit!important;font-style:normal!important;opacity:1!important}
html[data-fis-translation-style="1"] .chat-app .chat-room-wrapper .chat-thought-body .chat-bilingual-section-translation{color:var(--fis-translation-color)!important;font-size:var(--fis-translation-size)!important;font-weight:var(--fis-translation-weight)!important;font-style:normal!important}
html[data-fis-translation-style="1"]:not([data-fis-translation-divider="1"]) .chat-app .chat-room-wrapper .chat-bilingual-divider{display:none!important}
html[data-fis-translation-style="1"][data-fis-translation-always="1"] .chat-app .chat-room-wrapper .chat-bilingual-toggle{display:none!important}
html[data-fis-translation-outside="1"][data-fis-translation-shadow="1"] .chat-app .chat-room-wrapper .chat-bilingual-section-translation{text-shadow:-1px -1px 0 var(--fis-translation-shadow),1px -1px 0 var(--fis-translation-shadow),-1px 1px 0 var(--fis-translation-shadow),1px 1px 0 var(--fis-translation-shadow),0 1px 3px var(--fis-translation-shadow)!important}
html[data-fis-translation-style="1"][data-fis-translation-background="1"] .chat-app .chat-room-wrapper .chat-bilingual-section-translation{width:fit-content!important;max-width:100%!important;box-sizing:border-box!important;padding:4px 8px!important;background:var(--fis-translation-background)!important;border-radius:var(--fis-translation-background-radius)!important}

/* 语音转写：翻译开启时仅显示译文，提示词与原文不再叠在译文下方。 */
html[data-fis-translation-style="1"] .chat-app .chat-room-wrapper .voice-msg-text-bubble{padding:0!important;min-height:0!important;background:transparent!important;background-image:none!important;border:0!important;border-radius:0!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;overflow:visible!important}
html[data-fis-translation-style="1"] .chat-app .chat-room-wrapper .voice-msg-text-bubble .chat-bilingual-section:first-child,
html[data-fis-translation-style="1"] .chat-app .chat-room-wrapper .voice-msg-text-bubble .chat-bilingual-toggle,
html[data-fis-translation-style="1"] .chat-app .chat-room-wrapper .voice-msg-text-bubble .chat-bilingual-divider{display:none!important}
html[data-fis-translation-style="1"] .chat-app .chat-room-wrapper .voice-msg-text-bubble .chat-bilingual-section-translation{left:var(--fis-voice-translation-x)!important;top:var(--fis-voice-translation-y)!important;margin-top:0!important;width:auto!important;max-width:100%!important;padding:0!important;background:transparent!important;border-radius:0!important}
html[data-fis-translation-style="1"][data-fis-voice-translation-background="1"] .chat-app .chat-room-wrapper .voice-msg-text-bubble .chat-bilingual-section-translation{width:fit-content!important;padding:4px 8px!important;background:var(--fis-voice-translation-background)!important;border-radius:var(--fis-voice-translation-background-radius)!important}

/* 与九宫格气泡插件协作：角色译文不参与气泡图片的尺寸计算。 */
html[data-fis-translation-outside="1"] .chat-app .chat-room-wrapper [data-nine-slice-bubble-skin="1"][data-nine-slice-bubble-role="assistant"]:has(>.chat-bilingual-block){padding:0!important;min-width:0!important;min-height:0!important}
html[data-fis-translation-outside="1"] .chat-app .chat-room-wrapper [data-nine-slice-bubble-skin="1"][data-nine-slice-bubble-role="assistant"]:has(>.chat-bilingual-block)::after{display:none!important}
html[data-fis-translation-outside="1"] .chat-app .chat-room-wrapper [data-nine-slice-bubble-skin="1"][data-nine-slice-bubble-role="assistant"]>.chat-bilingual-block>.chat-bilingual-section:first-child{position:relative!important;isolation:isolate!important;align-self:flex-start!important;width:fit-content!important;max-width:100%!important;box-sizing:border-box!important;padding:var(--nsb-pad-top) var(--nsb-pad-right) var(--nsb-pad-bottom) var(--nsb-pad-left)!important;min-width:calc(var(--nsb-edge-left) + var(--nsb-edge-right))!important;min-height:calc(var(--nsb-edge-top) + var(--nsb-edge-bottom))!important;color:var(--nsb-text-color)!important}
html[data-fis-translation-outside="1"] .chat-app .chat-room-wrapper [data-nine-slice-bubble-skin="1"][data-nine-slice-bubble-role="assistant"]>.chat-bilingual-block>.chat-bilingual-section:first-child::after{content:""!important;display:block!important;position:absolute!important;inset:0!important;z-index:-1!important;pointer-events:none!important;box-sizing:border-box!important;border-style:solid!important;border-color:transparent!important;border-width:var(--nsb-edge-top) var(--nsb-edge-right) var(--nsb-edge-bottom) var(--nsb-edge-left)!important;border-image-source:var(--nsb-image)!important;border-image-slice:var(--nsb-slice-top) var(--nsb-slice-right) var(--nsb-slice-bottom) var(--nsb-slice-left) fill!important;border-image-width:var(--nsb-edge-top) var(--nsb-edge-right) var(--nsb-edge-bottom) var(--nsb-edge-left)!important;border-image-repeat:stretch!important;opacity:var(--nsb-image-opacity,1)!important;background:transparent!important;transform:scaleX(-1)!important;transform-origin:center center!important}
/* 引用消息的预览与双语正文是同级节点；让两者叠在同一网格起点，引用留在原文气泡内，译文仍在下一行。 */
html[data-fis-translation-outside="1"] .chat-app .chat-room-wrapper .chat-quote-message[data-nine-slice-bubble-skin="1"][data-nine-slice-bubble-role="assistant"]:has(>.chat-quote-preview){display:grid!important;grid-template-columns:minmax(0,1fr)!important}
html[data-fis-translation-outside="1"] .chat-app .chat-room-wrapper .chat-quote-message[data-nine-slice-bubble-skin="1"][data-nine-slice-bubble-role="assistant"]:has(>.chat-quote-preview)>.chat-quote-preview{grid-area:1/1!important;align-self:start!important;z-index:2!important;min-width:0!important;width:auto!important;margin:var(--nsb-pad-top) var(--nsb-pad-right) 0 var(--nsb-pad-left)!important;box-sizing:border-box!important}
html[data-fis-translation-outside="1"] .chat-app .chat-room-wrapper .chat-quote-message[data-nine-slice-bubble-skin="1"][data-nine-slice-bubble-role="assistant"]:has(>.chat-quote-preview)>.chat-bilingual-block{grid-area:1/1!important;min-width:0!important}
html[data-fis-translation-outside="1"] .chat-app .chat-room-wrapper .chat-quote-message[data-nine-slice-bubble-skin="1"][data-nine-slice-bubble-role="assistant"]:has(>.chat-quote-preview)>.chat-bilingual-block>.chat-bilingual-section:first-child{align-self:stretch!important;width:100%!important;padding-top:calc(var(--nsb-pad-top) + 34px)!important}

/* 聊天输入框只移动自身，不改变底部栏和工具按钮的布局。 */
html[data-fis-input-position-chat="1"] .chat-app .chat-room-wrapper .chat-input-bar>.chat-input-textarea{position:relative!important;left:var(--fis-chat-input-offset-x)!important;top:var(--fis-chat-input-offset-y)!important}

/* 固定工具栏的基准布局；按钮位移使用独立合成层，避免 iPad 恢复前台后 relative/left 基准漂移。 */
html[data-fis-toolbar-style="1"] .chat-app .chat-room-wrapper .chat-input-actions{display:flex!important;justify-content:center!important;align-items:center!important;gap:32px!important;width:100%!important;box-sizing:border-box!important}
html[data-fis-toolbar-style="1"] .chat-app .chat-room-wrapper .chat-input-actions>[data-fis-tool-icon]{position:relative!important;left:0!important;top:0!important;translate:none!important;will-change:transform}
html[data-fis-toolbar-style="1"] .chat-app .chat-room-wrapper [data-fis-tool-icon="offline"]{transform:translate3d(var(--fis-tool-offline-x),var(--fis-tool-offline-y),0)!important}
html[data-fis-toolbar-style="1"] .chat-app .chat-room-wrapper [data-fis-tool-icon="emoji"]{transform:translate3d(var(--fis-tool-emoji-x),var(--fis-tool-emoji-y),0)!important}
html[data-fis-toolbar-style="1"] .chat-app .chat-room-wrapper [data-fis-tool-icon="plus"]{transform:translate3d(var(--fis-tool-plus-x),var(--fis-tool-plus-y),0)!important}
html[data-fis-toolbar-style="1"] .chat-app .chat-room-wrapper [data-fis-tool-icon="send"]{transform:translate3d(var(--fis-tool-send-x),var(--fis-tool-send-y),0)!important}
html[data-fis-toolbar-style="1"] .chat-app .chat-room-wrapper [data-fis-tool-icon="generate"]{transform:translate3d(var(--fis-tool-generate-x),var(--fis-tool-generate-y),0)!important}
html[data-fis-toolbar-style="1"] .chat-app .chat-room-wrapper [data-fis-tool-icon="offlineReturn"]{transform:translate3d(var(--fis-tool-offline-return-x),var(--fis-tool-offline-return-y),0)!important}
html[data-fis-toolbar-style="1"] .chat-app .chat-room-wrapper [data-fis-tool-icon="offlineEmoji"]{transform:translate3d(var(--fis-tool-offline-emoji-x),var(--fis-tool-offline-emoji-y),0)!important}
html[data-fis-toolbar-style="1"] .chat-app .chat-room-wrapper [data-fis-tool-icon="offlineSend"]{transform:translate3d(var(--fis-tool-offline-send-x),var(--fis-tool-offline-send-y),0)!important}
html[data-fis-toolbar-style="1"][data-fis-tool-offline-hidden="1"] .chat-app [data-fis-tool-icon="offline"],
html[data-fis-toolbar-style="1"][data-fis-tool-emoji-hidden="1"] .chat-app [data-fis-tool-icon="emoji"],
html[data-fis-toolbar-style="1"][data-fis-tool-plus-hidden="1"] .chat-app [data-fis-tool-icon="plus"],
html[data-fis-toolbar-style="1"][data-fis-tool-send-hidden="1"] .chat-app [data-fis-tool-icon="send"]:not([aria-label^="停止"]),
html[data-fis-toolbar-style="1"][data-fis-tool-generate-hidden="1"] .chat-app [data-fis-tool-icon="generate"],
html[data-fis-toolbar-style="1"][data-fis-tool-offline-return-hidden="1"] .chat-app [data-fis-tool-icon="offlineReturn"],
html[data-fis-toolbar-style="1"][data-fis-tool-offline-emoji-hidden="1"] .chat-app [data-fis-tool-icon="offlineEmoji"],
html[data-fis-toolbar-style="1"][data-fis-tool-offline-send-hidden="1"] .chat-app [data-fis-tool-icon="offlineSend"],
html[data-fis-toolbar-style="1"][data-fis-merge-expressions="1"] .chat-app [data-fis-tool-icon="sticker"]{display:none!important}
/* Float 生成时会卸载星星按钮。纸飞机可见时保留星星占位；纸飞机隐藏时，让停止按钮直接接管星星的位置。 */
html[data-fis-toolbar-style="1"]:not([data-fis-tool-send-hidden="1"]):not([data-fis-tool-generate-hidden="1"]) .chat-app .chat-room-wrapper .chat-input-actions:not(:has(>[data-fis-tool-icon="generate"]))::after{content:"";display:block;flex:0 0 24px;width:24px;height:24px;pointer-events:none}
html[data-fis-toolbar-style="1"][data-fis-tool-send-hidden="1"]:not([data-fis-tool-generate-hidden="1"]) .chat-app .chat-room-wrapper [data-fis-tool-icon="send"][aria-label^="停止"]{transform:translate3d(var(--fis-tool-generate-x),var(--fis-tool-generate-y),0)!important}

/* 自带分类与导入表情包共用同一行；隐藏自带时仅保留“特效”。 */
html[data-fis-hide-builtin-emojis="1"] .fis-expression-panel[data-fis-expression-kind="emoji"] .emoji-category-pill:not(.fis-expression-proxy):not([data-fis-expression-effect]){display:none!important}
html[data-fis-hide-builtin-emojis="1"] .fis-expression-panel[data-fis-expression-kind="emoji"]>.grid-cols-8{display:none!important}
`;

export default {
  manifest: {
    id: PLUGIN_ID,
    name: "自定义聊天主题",
    apiVersion: 1,
    version: "1.0.26",
    author: "NEEN&GPT",
    description: "用 PNG、主题色、字体、卡片、按钮、输入框、头像与工具栏设置自定义聊天界面",
  },

  setup(ctx) {
    let state = normalizeState(ctx.system.storage.get(STORAGE_KEY));
    const root = document.documentElement;
    const style = document.createElement("style");
    style.dataset.floatInterfaceSkins = "1";
    const refreshStyleSheet = () => {
      const fontFaces = state.fontRules.map(rule => `\n@font-face{font-family:"${fontFamilyName(rule.id)}";src:${cssUrl(rule.data)};font-display:swap}`).join("");
      style.textContent = BASE_CSS + fontFaces;
    };
    refreshStyleSheet();
    document.head.appendChild(style);
    const refreshers = new Set();
    const blurredImageCache = new Map();
    const blurTimers = new Map();
    const imageObjectUrls = new Map();
    let disposed = false;
    let activeSessionId = "";
    let lastUserHeaderAvatar = "";
    let userHeaderAvatarProbe = null;
    let userHeaderAvatarProbeSession = "";
    let expressionBuiltinLabels = [];
    let expressionPackLabels = [];
    let expressionPackProbeComplete = false;
    let expressionProbeStage = "";
    let expressionProbeDeadline = 0;
    let expressionProbeTimer = 0;
    let pendingBuiltinIndex = null;
    let pendingPackIndex = null;
    let dayNightTimer = 0;
    let lastDayNightKey = "";
    const translationTogglePending = new WeakSet();

    let liveStyleDbPromise = null;
    const openLiveStyleDb = () => {
      if (liveStyleDbPromise) return liveStyleDbPromise;
      liveStyleDbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
        const request = indexedDB.open(LIVE_STYLE_DB_NAME, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(LIVE_STYLE_STORE_NAME)) {
            request.result.createObjectStore(LIVE_STYLE_STORE_NAME, { keyPath: "id" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
      });
      return liveStyleDbPromise;
    };
    const writeLiveStyleFallback = payload => {
      try { localStorage.setItem(LIVE_STYLE_FALLBACK_KEY, JSON.stringify(payload)); } catch (_) {}
    };
    const readLiveStyleFallback = () => {
      try {
        const value = localStorage.getItem(LIVE_STYLE_FALLBACK_KEY);
        return value ? JSON.parse(value) : null;
      } catch (_) {
        return null;
      }
    };
    const persistLightweightStyles = () => {
      const payload = {
        id: LIVE_STYLE_RECORD_ID,
        thoughtStyle: JSON.parse(JSON.stringify(state.thoughtStyle)),
        translationStyle: JSON.parse(JSON.stringify(state.translationStyle)),
      };
      void openLiveStyleDb().then(db => new Promise((resolve, reject) => {
        const transaction = db.transaction(LIVE_STYLE_STORE_NAME, "readwrite");
        transaction.objectStore(LIVE_STYLE_STORE_NAME).put(payload);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error("IndexedDB write failed"));
      })).catch(error => {
        writeLiveStyleFallback(payload);
        ctx.system.log("[自定义聊天主题] 轻量样式保存已切换到备用存储", error);
      });
    };
    const loadLightweightStyles = () => openLiveStyleDb().then(db => new Promise((resolve, reject) => {
      const transaction = db.transaction(LIVE_STYLE_STORE_NAME, "readonly");
      const request = transaction.objectStore(LIVE_STYLE_STORE_NAME).get(LIVE_STYLE_RECORD_ID);
      request.onsuccess = () => resolve(request.result || readLiveStyleFallback());
      request.onerror = () => reject(request.error || new Error("IndexedDB read failed"));
    })).catch(error => {
      ctx.system.log("[自定义聊天主题] 轻量样式读取已切换到备用存储", error);
      return readLiveStyleFallback();
    });
    const persist = () => {
      ctx.system.storage.set(STORAGE_KEY, state);
      persistLightweightStyles();
    };
    const attributeName = key => "data-fis-" + key.replace(/[A-Z]/g, letter => "-" + letter.toLowerCase());

    function imageSourceForCss(source) {
      const value = String(source || "");
      if (!value.startsWith("data:")) return value;
      const cached = imageObjectUrls.get(value);
      if (cached) return cached;
      try {
        const comma = value.indexOf(",");
        if (comma < 0) return value;
        const header = value.slice(5, comma);
        const payload = value.slice(comma + 1);
        const mime = (header.split(";")[0] || "application/octet-stream").trim();
        const bytesText = header.includes(";base64") ? atob(payload) : decodeURIComponent(payload);
        const bytes = new Uint8Array(bytesText.length);
        for (let index = 0; index < bytesText.length; index += 1) bytes[index] = bytesText.charCodeAt(index);
        const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
        imageObjectUrls.set(value, objectUrl);
        return objectUrl;
      } catch (_) {
        return value;
      }
    }

    function applyImageSource(cacheKey, source, blur, prefix, isCurrent) {
      const cached = blurredImageCache.get(cacheKey);
      const initialSource = cached && cached.source === source && cached.blur === blur ? cached.result : source;
      root.style.setProperty(prefix + "-image", cssUrl(imageSourceForCss(initialSource)));
      if (!source || blur <= 0 || (cached && cached.source === source && cached.blur === blur)) return;
      if (blurTimers.has(cacheKey)) clearTimeout(blurTimers.get(cacheKey));
      blurTimers.set(cacheKey, setTimeout(async () => {
        blurTimers.delete(cacheKey);
        const result = await blurImageDataUrl(source, blur);
        if (disposed || !isCurrent()) return;
        blurredImageCache.set(cacheKey, { source, blur, result });
        root.style.setProperty(prefix + "-image", cssUrl(imageSourceForCss(result)));
      }, 120));
    }

    function applyRegionImage(def, region, prefix) {
      const source = region.image;
      const blur = region.blur;
      applyImageSource(def.key, source, blur, prefix, () => {
        const current = state.regions[def.key];
        return !!current && current.enabled && current.image === source && current.blur === blur;
      });
    }

    function currentChatSession() {
      if (activeSessionId) {
        const active = ctx.data.sessions.get(activeSessionId);
        if (active) return active;
      }
      const wrapper = document.querySelector(".chat-app .chat-room-wrapper");
      if (!wrapper) return null;
      const session = ctx.data.sessions.list().find(item => wrapper.classList.contains("session-" + item.id)) || null;
      if (session) activeSessionId = session.id;
      return session;
    }

    function probeStoredUserHeaderAvatar() {
      if (typeof indexedDB === "undefined") return;
      const session = currentChatSession();
      const characterId = session && session.contactId ? String(session.contactId) : "";
      const sessionKey = session && session.id ? String(session.id) : characterId;
      if (userHeaderAvatarProbe && userHeaderAvatarProbeSession === sessionKey) return;
      userHeaderAvatarProbeSession = sessionKey;
      const probe = new Promise(resolve => {
        const request = indexedDB.open("AiPhoneKvDB");
        request.onerror = () => resolve("");
        request.onsuccess = () => {
          try {
            const db = request.result;
            const transaction = db.transaction("entries", "readonly");
            const store = transaction.objectStore("entries");
            const identitiesRequest = store.get("ai_phone_user_identities_v1");
            const bindingsRequest = store.get("ai_phone_bindings_v1");
            transaction.onerror = () => resolve("");
            transaction.oncomplete = () => {
              try {
                const identities = JSON.parse(identitiesRequest.result && identitiesRequest.result.value || "[]");
                const bindings = JSON.parse(bindingsRequest.result && bindingsRequest.result.value || "{}");
                if (!Array.isArray(identities) || !identities.length) return resolve("");
                let identityId = bindings && bindings.globalDefaults && bindings.globalDefaults.userIdentityId;
                const characterBinding = characterId && Array.isArray(bindings.characterBindings)
                  ? bindings.characterBindings.find(item => item && String(item.characterId) === characterId)
                  : null;
                const slots = [
                  characterBinding && characterBinding.defaults,
                  bindings && bindings.appDefaults && bindings.appDefaults.chat,
                  characterBinding && characterBinding.appOverrides && characterBinding.appOverrides.chat,
                ];
                for (const slot of slots) if (slot && slot.userIdentityId) identityId = slot.userIdentityId;
                const identity = identities.find(item => item && item.id === identityId) || identities[0];
                resolve(identity && typeof identity.avatarUrl === "string" ? identity.avatarUrl : "");
              } catch (_) { resolve(""); }
            };
          } catch (_) { resolve(""); }
        };
      });
      userHeaderAvatarProbe = probe;
      probe.then(source => {
        if (userHeaderAvatarProbe !== probe) return source;
        if (source) {
          lastUserHeaderAvatar = String(source);
          if (!disposed) syncChatHeaderAvatar();
        }
        return source;
      });
    }

    function syncChatHeaderAvatar() {
      const headerEnabled = state.avatarStyle.enabled && state.avatarStyle.applyTargets.includes("chatRoom");
      if (headerEnabled && state.avatarStyle.headerAvatarVisible) {
        const session = currentChatSession();
        const characterId = session && session.isGroup
          ? (Array.isArray(session.participantIds) ? session.participantIds[0] : "")
          : (session && session.contactId);
        const character = characterId ? ctx.data.characters.get(characterId) : null;
        const avatar = character && typeof character.avatar === "string" && character.avatar
          ? character.avatar
          : "/images/default-moment-avatar.png";
        root.setAttribute("data-fis-chat-header-avatar", "1");
        root.style.setProperty("--fis-chat-header-avatar", cssUrl(imageSourceForCss(avatar)));
      } else {
        root.removeAttribute("data-fis-chat-header-avatar");
        root.style.removeProperty("--fis-chat-header-avatar");
      }

      if (headerEnabled && state.avatarStyle.headerUserAvatarVisible) {
        const wrapper = document.querySelector(".chat-app .chat-room-wrapper");
        const userImage = wrapper && wrapper.querySelector(".chat-msg-wrapper[data-role='user']>.chat-msg-avatar img,.chat-offline-entry[data-role='user']>.chat-offline-avatar img,img[alt='Me']");
        const source = userImage && (userImage.currentSrc || userImage.getAttribute("src") || userImage.src);
        if (source) lastUserHeaderAvatar = String(source);
        if (!lastUserHeaderAvatar) probeStoredUserHeaderAvatar();
        if (lastUserHeaderAvatar) {
          root.setAttribute("data-fis-chat-header-user-avatar", "1");
          root.style.setProperty("--fis-chat-header-user-avatar", cssUrl(imageSourceForCss(lastUserHeaderAvatar)));
        } else {
          root.removeAttribute("data-fis-chat-header-user-avatar");
          root.style.removeProperty("--fis-chat-header-user-avatar");
        }
      } else {
        root.removeAttribute("data-fis-chat-header-user-avatar");
        root.style.removeProperty("--fis-chat-header-user-avatar");
      }
    }

    function syncExpressionProxyButtons(bar, kind, labels, onSelect) {
      const existing = [...bar.children].filter(node => node instanceof HTMLElement && node.classList.contains("fis-expression-proxy"));
      const signature = `${kind}:${labels.join("\u0001")}`;
      if (existing.map(node => node.getAttribute("data-fis-proxy-signature")).join("|") === labels.map((_, index) => `${signature}:${index}`).join("|")) return;
      existing.forEach(node => node.remove());
      const nativeAnchor = [...bar.children].find(node => node instanceof HTMLElement && node.classList.contains("emoji-category-pill")) || null;
      labels.forEach((labelText, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "emoji-category-pill fis-expression-proxy";
        button.textContent = labelText;
        button.setAttribute("data-fis-proxy-signature", `${signature}:${index}`);
        button.addEventListener("click", event => { event.stopPropagation(); onSelect(index); });
        if (kind === "builtin") bar.insertBefore(button, nativeAnchor); else bar.append(button);
      });
    }

    function scheduleExpressionSync(delay = 80) {
      if (expressionProbeTimer) clearTimeout(expressionProbeTimer);
      expressionProbeTimer = setTimeout(() => {
        expressionProbeTimer = 0;
        if (!disposed) syncToolbarDom();
      }, delay);
    }

    function setToolbarIcon(button, key, enabled) {
      if (!(button instanceof HTMLElement)) return;
      if (!enabled || !key) {
        if (button.hasAttribute("data-fis-tool-icon")) button.removeAttribute("data-fis-tool-icon");
      }
      else if (button.getAttribute("data-fis-tool-icon") !== key) button.setAttribute("data-fis-tool-icon", key);
    }

    function syncToolbarDom() {
      const enabled = state.toolbarStyle.enabled;
      for (const actions of document.querySelectorAll(".chat-app .chat-room-wrapper .chat-input-actions")) {
        const buttons = [...actions.children].filter(node => node instanceof HTMLElement && node.tagName === "BUTTON");
        const offlineButton = actions.querySelector(":scope>.chat-offline-toggle");
        const returnOnlineButton = buttons.find(button => (button.getAttribute("aria-label") || "") === "返回线上模式") || null;
        if (!offlineButton) {
          if (!returnOnlineButton) {
            buttons.forEach(button => setToolbarIcon(button, "", false));
            continue;
          }
          const offlineEmojiButton = buttons.find(button => (button.getAttribute("aria-label") || "") === "表情") || null;
          const offlineSendButton = buttons.find(button => /^(?:发送|停止)/.test(button.getAttribute("aria-label") || "")) || null;
          const offlineAssignments = new Map([
            [returnOnlineButton, "offlineReturn"],
            [offlineEmojiButton, "offlineEmoji"],
            [offlineSendButton, "offlineSend"],
          ]);
          buttons.forEach(button => {
            const key = offlineAssignments.get(button) || "";
            setToolbarIcon(button, key, enabled);
          });
          continue;
        }
        const sendButton = buttons.find(button => /^(?:发送|停止)/.test(button.getAttribute("aria-label") || "")) || null;
        const generateButton = buttons.find(button => button !== sendButton && /触发\s*AI|主动回复|发送输入框内容并触发回复/.test(button.getAttribute("title") || "")) || null;
        const fixedButtons = buttons.filter(button => button !== offlineButton && button !== sendButton && button !== generateButton);
        const assignments = new Map([
          [offlineButton, "offline"],
          [fixedButtons[0], "emoji"],
          [fixedButtons[1], "sticker"],
          [fixedButtons[2], "plus"],
          [sendButton, "send"],
          [generateButton, "generate"],
        ]);
        buttons.forEach(button => setToolbarIcon(button, assignments.get(button) || "", enabled));

        const inputBar = actions.closest(".chat-input-bar");
        if (!inputBar) continue;
        const emojiButton = actions.querySelector('[data-fis-tool-icon="emoji"]');
        const stickerButton = actions.querySelector('[data-fis-tool-icon="sticker"]');
        const panels = [...inputBar.children].filter(node => node instanceof HTMLElement && node.classList.contains("h-[220px]") && node.classList.contains("flex-col"));
        for (const panel of panels) {
          const isStickerPanel = !!panel.querySelector(".grid-cols-5");
          const kind = isStickerPanel ? "sticker" : "emoji";
          if (panel.getAttribute("data-fis-expression-kind") !== kind) panel.setAttribute("data-fis-expression-kind", kind);
          if (!panel.classList.contains("fis-expression-panel")) panel.classList.add("fis-expression-panel");
          const categoryBar = [...panel.children].find(node => node instanceof HTMLElement && node.querySelector(":scope>.emoji-category-pill"));
          if (!categoryBar) {
            if (isStickerPanel && expressionProbeStage === "collect") {
              if (Date.now() < expressionProbeDeadline) {
                scheduleExpressionSync();
              } else {
                expressionPackLabels = [];
                expressionPackProbeComplete = true;
                expressionProbeStage = "return";
                setTimeout(() => { if (emojiButton?.isConnected) emojiButton.click(); }, 0);
              }
            }
            continue;
          }
          const nativeButtons = [...categoryBar.children].filter(node => node instanceof HTMLElement && node.classList.contains("emoji-category-pill") && !node.classList.contains("fis-expression-proxy"));

          if (!isStickerPanel) {
            expressionBuiltinLabels = nativeButtons.map(button => button.textContent || "");
            nativeButtons.forEach(button => {
              const isEffect = (button.textContent || "") === "特效";
              if (isEffect && !button.hasAttribute("data-fis-expression-effect")) button.setAttribute("data-fis-expression-effect", "");
              if (!isEffect && button.hasAttribute("data-fis-expression-effect")) button.removeAttribute("data-fis-expression-effect");
            });
            if (enabled && state.toolbarStyle.mergeExpressions) {
              syncExpressionProxyButtons(categoryBar, "pack", expressionPackLabels, index => {
                pendingPackIndex = index;
                stickerButton?.click();
              });
              if (!expressionPackProbeComplete && !expressionProbeStage && stickerButton) {
                expressionProbeStage = "collect";
                expressionProbeDeadline = Date.now() + 1500;
                setTimeout(() => { if (stickerButton.isConnected) stickerButton.click(); }, 0);
              } else if (expressionProbeStage === "return") {
                expressionProbeStage = "";
                expressionProbeDeadline = 0;
              }
            }
            if (pendingBuiltinIndex != null) {
              const target = nativeButtons[pendingBuiltinIndex];
              pendingBuiltinIndex = null;
              target?.click();
            }
            if (enabled && state.toolbarStyle.hideBuiltinEmojis) {
              const effectButton = nativeButtons.find(button => (button.textContent || "") === "特效");
              if (effectButton && !effectButton.hasAttribute("data-active")) effectButton.click();
              else if (!effectButton && expressionPackLabels.length && !expressionProbeStage) stickerButton?.click();
            }
          } else {
            expressionPackLabels = nativeButtons.map(button => button.textContent || "");
            expressionPackProbeComplete = true;
            if (expressionProbeStage === "collect") {
              expressionProbeStage = "return";
              expressionProbeDeadline = 0;
              setTimeout(() => { if (emojiButton?.isConnected) emojiButton.click(); }, 0);
              continue;
            }
            if (enabled && state.toolbarStyle.mergeExpressions) {
              const builtinLabels = state.toolbarStyle.hideBuiltinEmojis
                ? expressionBuiltinLabels.filter(label => label === "特效")
                : expressionBuiltinLabels;
              syncExpressionProxyButtons(categoryBar, "builtin", builtinLabels, index => {
                const actualIndex = state.toolbarStyle.hideBuiltinEmojis
                  ? expressionBuiltinLabels.findIndex(label => label === builtinLabels[index])
                  : index;
                pendingBuiltinIndex = actualIndex;
                emojiButton?.click();
              });
            }
            if (pendingPackIndex != null) {
              const target = nativeButtons[pendingPackIndex];
              pendingPackIndex = null;
              target?.click();
            }
          }
        }
      }
      if (!enabled || !state.toolbarStyle.mergeExpressions) {
        document.querySelectorAll(".fis-expression-proxy").forEach(node => node.remove());
      }
    }

    function previewRegionGeometry(def, region, key, customPrefix = "") {
      const prefix = customPrefix || `--fis-${def.key.replace(/[A-Z]/g, letter => "-" + letter.toLowerCase())}`;
      if (key === "scale") root.style.setProperty(prefix + "-size", imageSizeCss(def, region.scale));
      if (key === "positionX" || key === "positionY") root.style.setProperty(prefix + "-position", `${region.positionX}% ${region.positionY}%`);
      if (key === "overflowY" && def.overflow) {
        root.style.setProperty(prefix + "-over-top", String(region.overflowY));
        root.style.setProperty(prefix + "-over-bottom", String(region.overflowY));
      }
    }

    function resyncBottomBarGeometry() {
      const def = REGION_DEFS.find(item => item.key === "bottomBar");
      const region = state.regions.bottomBar;
      if (!def || !state.imagesEnabled || !region || !region.enabled || !region.image) return;
      for (const [targetKey, suffix] of [["inputBar", "input"], ["tabBar", "tab"]]) {
        const settings = region.targetSettings && region.targetSettings[targetKey];
        if (!settings) continue;
        const prefix = `--fis-bottom-bar-${suffix}`;
        root.style.setProperty(prefix + "-size", imageSizeCss(def, settings.scale));
        root.style.setProperty(prefix + "-position", `${settings.positionX}% ${settings.positionY}%`);
        root.style.setProperty(prefix + "-over-top", String(settings.overflowY));
        root.style.setProperty(prefix + "-over-bottom", String(settings.overflowY));
      }
    }

    function previewButtonStyle(buttonStyle, key) {
      if (key === "accentColor") root.style.setProperty("--fis-button-accent-background", colorWithOpacity(buttonStyle.accentColor, buttonStyle.accentOpacity));
      if (key === "capsuleColor") root.style.setProperty("--fis-button-capsule-background", colorWithOpacity(buttonStyle.capsuleColor, buttonStyle.capsuleOpacity));
      if (key === "borderColor") root.style.setProperty("--fis-button-border-color", buttonStyle.borderColor);
      if (key === "accentOpacity") root.style.setProperty("--fis-button-accent-background", colorWithOpacity(buttonStyle.accentColor, buttonStyle.accentOpacity));
      if (key === "capsuleOpacity") root.style.setProperty("--fis-button-capsule-background", colorWithOpacity(buttonStyle.capsuleColor, buttonStyle.capsuleOpacity));
      if (key === "radius") root.style.setProperty("--fis-button-radius", `${buttonStyle.radius}px`);
      if (key === "borderWidth") root.style.setProperty("--fis-button-border-width", buttonStyle.borderless ? "0px" : `${buttonStyle.borderWidth}px`);
    }

    function previewCardStyle(interfaceStyle, key) {
      if (key === "borderColor") root.style.setProperty("--fis-interface-border-color", interfaceStyle.borderColor);
      if (key === "backgroundColor") root.style.setProperty("--fis-interface-background", colorWithOpacity(interfaceStyle.backgroundColor, interfaceStyle.backgroundOpacity));
      if (key === "radius") root.style.setProperty("--fis-interface-radius", `${interfaceStyle.radius}px`);
      if (key === "borderWidth") root.style.setProperty("--fis-interface-border-width", interfaceStyle.borderless ? "0px" : `${interfaceStyle.borderWidth}px`);
      if (key === "backgroundOpacity") root.style.setProperty("--fis-interface-background", colorWithOpacity(interfaceStyle.backgroundColor, interfaceStyle.backgroundOpacity));
    }

    function previewInputStyle(inputStyle, key) {
      if (key === "backgroundColor") root.style.setProperty("--fis-input-background-color", colorWithOpacity(inputStyle.backgroundColor, inputStyle.backgroundOpacity));
      if (key === "borderColor") root.style.setProperty("--fis-input-border-color", inputStyle.borderColor);
      if (key === "backgroundOpacity") root.style.setProperty("--fis-input-background-color", colorWithOpacity(inputStyle.backgroundColor, inputStyle.backgroundOpacity));
      if (key === "radius") root.style.setProperty("--fis-input-radius", `${inputStyle.radius}px`);
      if (key === "borderWidth") root.style.setProperty("--fis-input-border-width", inputStyle.borderless ? "0px" : `${inputStyle.borderWidth}px`);
      if (key === "chatWidth") root.style.setProperty("--fis-chat-input-width", `${inputStyle.chatWidth}%`);
    }

    function clearApplied() {
      for (const def of REGION_DEFS) root.removeAttribute(attributeName(def.key));
      root.removeAttribute("data-fis-input-image-chat");
      root.removeAttribute("data-fis-input-image-search");
      root.removeAttribute("data-fis-input-image-form");
      root.removeAttribute("data-fis-input-color-chat");
      root.removeAttribute("data-fis-input-color-search");
      root.removeAttribute("data-fis-input-color-form");
      root.removeAttribute("data-fis-top-image-active");
      for (const key of ["messages", "contacts", "feeds", "me", "chat-room"]) root.removeAttribute("data-fis-top-target-" + key);
      root.removeAttribute("data-fis-active-view");
      root.removeAttribute("data-fis-bottom-image-input");
      root.removeAttribute("data-fis-bottom-image-tab");
      root.removeAttribute("data-fis-input-style-chat");
      root.removeAttribute("data-fis-input-style-search");
      root.removeAttribute("data-fis-input-style-form");
      root.removeAttribute("data-fis-colors");
      root.removeAttribute("data-fis-interface-cards");
      root.removeAttribute("data-fis-avatar-style");
      root.removeAttribute("data-fis-avatar-border");
      for (const key of ["messages", "contacts", "feeds", "me", "chat-room"]) root.removeAttribute("data-fis-avatar-target-" + key);
      root.removeAttribute("data-fis-chat-header-avatar");
      root.removeAttribute("data-fis-chat-header-user-avatar");
      root.removeAttribute("data-fis-chat-header-align");
      root.removeAttribute("data-fis-hide-chat-user-avatar");
      root.removeAttribute("data-fis-hide-chat-role-avatar");
      root.removeAttribute("data-fis-thought-style");
      root.removeAttribute("data-fis-thought-border");
      root.removeAttribute("data-fis-thought-tape");
      root.removeAttribute("data-fis-translation-style");
      root.removeAttribute("data-fis-translation-always");
      root.removeAttribute("data-fis-translation-divider");
      root.removeAttribute("data-fis-translation-outside");
      root.removeAttribute("data-fis-translation-shadow");
      root.removeAttribute("data-fis-translation-background");
      root.removeAttribute("data-fis-voice-translation-background");
      root.removeAttribute("data-fis-input-position-chat");
      root.removeAttribute("data-fis-toolbar-style");
      root.removeAttribute("data-fis-merge-expressions");
      root.removeAttribute("data-fis-hide-builtin-emojis");
      for (const [key] of TOOLBAR_ICON_DEFS) root.removeAttribute("data-fis-tool-" + toolbarIconSuffix(key) + "-hidden");
      root.removeAttribute("data-fis-base-color");
      for (const key of ["messages", "contacts", "feeds", "me", "chat-room"]) root.removeAttribute("data-fis-base-target-" + key);
      for (const target of FONT_TARGETS) root.removeAttribute("data-fis-font-" + target.key.replace(/[A-Z]/g, letter => "-" + letter.toLowerCase()));
      for (const target of COLOR_TARGETS) {
        root.removeAttribute("data-fis-color-" + target.key.replace(/[A-Z]/g, letter => "-" + letter.toLowerCase()));
      }
      for (const [key] of BUTTON_STYLE_TARGETS) root.removeAttribute("data-fis-button-" + key);
      root.removeAttribute("data-fis-background-scope");
      for (const key of ["messages", "contacts", "feeds", "me", "chat-room"]) root.removeAttribute("data-fis-background-target-" + key);
      for (const name of [...root.style]) {
        if (name.startsWith("--fis-")) root.style.removeProperty(name);
      }
    }

    function syncThoughtStyle() {
      root.removeAttribute("data-fis-thought-style");
      root.removeAttribute("data-fis-thought-border");
      root.removeAttribute("data-fis-thought-tape");
      if (!state.thoughtStyle.enabled) return;
      root.setAttribute("data-fis-thought-style", "1");
      if (state.thoughtStyle.borderVisible) root.setAttribute("data-fis-thought-border", "1");
      if (state.thoughtStyle.tapeVisible) root.setAttribute("data-fis-thought-tape", "1");
      root.style.setProperty("--fis-thought-background", colorWithOpacity(state.thoughtStyle.backgroundColor, state.thoughtStyle.backgroundOpacity));
      root.style.setProperty("--fis-thought-radius", `${state.thoughtStyle.radius}px`);
      root.style.setProperty("--fis-thought-title-color", state.thoughtStyle.titleColor);
      root.style.setProperty("--fis-thought-text-color", state.thoughtStyle.textColor);
      root.style.setProperty("--fis-thought-border-width", `${state.thoughtStyle.borderWidth}px`);
      root.style.setProperty("--fis-thought-border-color", state.thoughtStyle.borderColor);
      root.style.setProperty("--fis-thought-tape-left", state.thoughtStyle.tapeLeftColor);
      root.style.setProperty("--fis-thought-tape-right", state.thoughtStyle.tapeRightColor);
      root.style.setProperty("--fis-thought-value-track", state.thoughtStyle.valueTrackColor);
      root.style.setProperty("--fis-thought-value-fill", state.thoughtStyle.valueFillColor);
      root.style.setProperty("--fis-thought-icon-color", state.thoughtStyle.iconColor);
      root.style.setProperty("--fis-thought-icon-x", `${state.thoughtStyle.iconOffsetX}px`);
      root.style.setProperty("--fis-thought-icon-y", `${state.thoughtStyle.iconOffsetY}px`);
    }

    function syncTranslationDom() {
      const buttons = document.querySelectorAll(".chat-app .chat-room-wrapper .chat-bilingual-toggle");
      for (const button of buttons) {
        if (!(button instanceof HTMLElement)) continue;
        const expanded = button.getAttribute("aria-expanded") === "true";
        const isVoiceTranscript = !!button.closest(".voice-msg-text-bubble");
        const shouldExpand = state.translationStyle.enabled && (state.translationStyle.alwaysVisible || isVoiceTranscript);
        if (shouldExpand) {
          if (!expanded && !translationTogglePending.has(button)) {
            button.setAttribute("data-fis-auto-expanded", "1");
            translationTogglePending.add(button);
            button.click();
            queueMicrotask(() => requestAnimationFrame(() => {
              translationTogglePending.delete(button);
              if (!disposed) syncTranslationDom();
            }));
          }
        } else if (button.hasAttribute("data-fis-auto-expanded")) {
          button.removeAttribute("data-fis-auto-expanded");
          if (expanded && !translationTogglePending.has(button)) {
            translationTogglePending.add(button);
            button.click();
            queueMicrotask(() => requestAnimationFrame(() => translationTogglePending.delete(button)));
          }
        }
      }
    }

    function syncTranslationStyle() {
      root.removeAttribute("data-fis-translation-style");
      root.removeAttribute("data-fis-translation-always");
      root.removeAttribute("data-fis-translation-divider");
      root.removeAttribute("data-fis-translation-outside");
      root.removeAttribute("data-fis-translation-shadow");
      root.removeAttribute("data-fis-translation-background");
      root.removeAttribute("data-fis-voice-translation-background");
      if (state.translationStyle.enabled) {
        root.setAttribute("data-fis-translation-style", "1");
        if (state.translationStyle.alwaysVisible) root.setAttribute("data-fis-translation-always", "1");
        if (state.translationStyle.dividerVisible) root.setAttribute("data-fis-translation-divider", "1");
        if (state.translationStyle.layoutMode === "outside") root.setAttribute("data-fis-translation-outside", "1");
        if (state.translationStyle.shadowEnabled) root.setAttribute("data-fis-translation-shadow", "1");
        if (state.translationStyle.backgroundEnabled) root.setAttribute("data-fis-translation-background", "1");
        if (state.translationStyle.voiceBackgroundEnabled) root.setAttribute("data-fis-voice-translation-background", "1");
        root.style.setProperty("--fis-translation-color", state.translationStyle.color);
        root.style.setProperty("--fis-translation-shadow", state.translationStyle.shadowColor);
        root.style.setProperty("--fis-translation-background", state.translationStyle.backgroundColor);
        root.style.setProperty("--fis-translation-background-radius", `${state.translationStyle.backgroundRadius}px`);
        root.style.setProperty("--fis-translation-size", `${state.translationStyle.size / 100}em`);
        root.style.setProperty("--fis-translation-weight", state.translationStyle.bold ? "700" : "400");
        root.style.setProperty("--fis-translation-x", `${state.translationStyle.offsetX}px`);
        root.style.setProperty("--fis-translation-y", `${state.translationStyle.offsetY}px`);
        root.style.setProperty("--fis-voice-translation-background", state.translationStyle.voiceBackgroundColor);
        root.style.setProperty("--fis-voice-translation-background-radius", `${state.translationStyle.voiceBackgroundRadius}px`);
        root.style.setProperty("--fis-voice-translation-x", `${state.translationStyle.voiceOffsetX}px`);
        root.style.setProperty("--fis-voice-translation-y", `${state.translationStyle.voiceOffsetY}px`);
      }
      syncTranslationDom();
    }

    function commitThoughtStyle() {
      persistLightweightStyles();
      syncThoughtStyle();
    }

    function commitTranslationStyle() {
      persistLightweightStyles();
      syncTranslationStyle();
    }

    function syncThemeScope() {
      const chatApp = document.querySelector(".chat-app");
      const modalOpen = !!document.querySelector(".chat-app .modal-overlay, .chat-app [data-ui='modal'], .chat-app .feed-comment-modal-layer");
      const chatRoom = chatApp && chatApp.querySelector(".chat-room-wrapper");
      let activeView = "";
      if (chatApp && !modalOpen && !chatApp.hasAttribute("data-tabbar-hidden")) {
        if (chatApp.hasAttribute("data-room-active") && chatRoom) {
          if (!chatRoom.hasAttribute("data-settings-open")) activeView = "chatRoom";
        } else {
          if (chatApp.querySelector(".user-profile-page-root")) activeView = "me";
          else if (chatApp.querySelector(".feed-cover-shell")) activeView = "feeds";
          else if (chatApp.querySelector("input[placeholder='Search contacts...'], .contacts-page-root")) activeView = "contacts";
          else if (chatApp.querySelector(".chat-list-tabs, .messages-page-root")) activeView = "messages";
        }
      }
      if (activeView) {
        root.setAttribute("data-fis-view-scope", "1");
        root.setAttribute("data-fis-active-view", activeView);
      } else {
        root.removeAttribute("data-fis-view-scope");
        root.removeAttribute("data-fis-active-view");
      }
      syncChatHeaderAvatar();
      syncToolbarDom();
      syncTranslationDom();
    }

    function apply() {
      clearApplied();
      if (state.baseStyle.enabled && state.baseStyle.applyTargets.length) {
        root.setAttribute("data-fis-base-color", "1");
        root.style.setProperty("--fis-base-color", state.baseStyle.color);
        root.style.setProperty("--fis-base-glass", colorWithOpacity(state.baseStyle.glassColor, state.baseStyle.glassOpacity));
        root.style.setProperty("--fis-tool-icon-background", state.baseStyle.toolIconBackground);
        for (const target of state.baseStyle.applyTargets) {
          const suffix = target === "chatRoom" ? "chat-room" : target;
          root.setAttribute("data-fis-base-target-" + suffix, "1");
        }
      }
      if (state.colorsEnabled && state.colorRules.some(rule => rule.targets.length)) root.setAttribute("data-fis-colors", "1");
      if (state.colorsEnabled) {
        for (const rule of state.colorRules) {
          for (const key of rule.targets) {
            const suffix = key.replace(/[A-Z]/g, letter => "-" + letter.toLowerCase());
            root.setAttribute("data-fis-color-" + suffix, "1");
            root.style.setProperty("--fis-color-" + suffix, rule.color);
          }
        }
      }
      if (state.buttonStyle.enabled) {
        for (const key of state.buttonStyle.applyTargets) root.setAttribute("data-fis-button-" + key, "1");
        root.style.setProperty("--fis-button-accent-background", colorWithOpacity(state.buttonStyle.accentColor, state.buttonStyle.accentOpacity));
        root.style.setProperty("--fis-button-capsule-background", colorWithOpacity(state.buttonStyle.capsuleColor, state.buttonStyle.capsuleOpacity));
        root.style.setProperty("--fis-button-radius", `${state.buttonStyle.radius}px`);
        root.style.setProperty("--fis-button-border-width", state.buttonStyle.borderless ? "0px" : `${state.buttonStyle.borderWidth}px`);
        root.style.setProperty("--fis-button-border-color", state.buttonStyle.borderColor);
      }
      if (state.interfaceStyle.cardsEnabled) {
        root.setAttribute("data-fis-interface-cards", "1");
        root.style.setProperty("--fis-interface-radius", `${state.interfaceStyle.radius}px`);
        root.style.setProperty("--fis-interface-border-width", state.interfaceStyle.borderless ? "0px" : `${state.interfaceStyle.borderWidth}px`);
        root.style.setProperty("--fis-interface-border-color", state.interfaceStyle.borderColor);
        root.style.setProperty("--fis-interface-background", colorWithOpacity(state.interfaceStyle.backgroundColor, state.interfaceStyle.backgroundOpacity));
      }
      if (state.avatarStyle.enabled) {
        root.setAttribute("data-fis-avatar-style", "1");
        root.style.setProperty("--fis-avatar-radius", `${state.avatarStyle.radius}%`);
        root.style.setProperty("--fis-chat-header-avatar-size", `${state.avatarStyle.headerAvatarSize}px`);
        root.style.setProperty("--fis-chat-header-avatar-x", `${state.avatarStyle.headerAvatarOffsetX}px`);
        root.style.setProperty("--fis-chat-header-avatar-y", `${state.avatarStyle.headerAvatarOffsetY}px`);
        root.style.setProperty("--fis-chat-header-user-avatar-x", `${state.avatarStyle.headerUserAvatarOffsetX}px`);
        root.style.setProperty("--fis-chat-header-user-avatar-y", `${state.avatarStyle.headerUserAvatarOffsetY}px`);
        if (state.avatarStyle.borderEnabled) {
          root.setAttribute("data-fis-avatar-border", "1");
          root.style.setProperty("--fis-avatar-border-width", `${state.avatarStyle.borderWidth}px`);
          root.style.setProperty("--fis-avatar-border-color", state.avatarStyle.borderColor);
        }
        for (const target of state.avatarStyle.applyTargets) {
          const suffix = target === "chatRoom" ? "chat-room" : target;
          root.setAttribute("data-fis-avatar-target-" + suffix, "1");
        }
        if (state.avatarStyle.applyTargets.includes("chatRoom")) {
          root.setAttribute("data-fis-chat-header-align", state.avatarStyle.headerTitleAlign);
          if (state.avatarStyle.headerAvatarVisible) root.setAttribute("data-fis-chat-header-avatar", "1");
          if (!state.avatarStyle.chatUserVisible) root.setAttribute("data-fis-hide-chat-user-avatar", "1");
          if (!state.avatarStyle.chatRoleVisible) root.setAttribute("data-fis-hide-chat-role-avatar", "1");
        }
      }
      syncThoughtStyle();
      syncTranslationStyle();
      if (state.fontsEnabled) {
        for (const rule of state.fontRules) {
          for (const key of rule.targets) {
            const suffix = key.replace(/[A-Z]/g, letter => "-" + letter.toLowerCase());
            root.setAttribute("data-fis-font-" + suffix, "1");
            root.style.setProperty("--fis-font-" + suffix, `"${fontFamilyName(rule.id)}"`);
          }
        }
      }
      if (state.inputStyle.enabled) {
        if (state.inputStyle.applyTargets.includes("chatInput")) root.setAttribute("data-fis-input-style-chat", "1");
        if (state.inputStyle.applyTargets.includes("searchInput")) root.setAttribute("data-fis-input-style-search", "1");
        if (state.inputStyle.applyTargets.includes("formInput")) root.setAttribute("data-fis-input-style-form", "1");
        root.style.setProperty("--fis-input-radius", `${state.inputStyle.radius}px`);
        root.style.setProperty("--fis-input-border-width", state.inputStyle.borderless ? "0px" : `${state.inputStyle.borderWidth}px`);
        root.style.setProperty("--fis-input-border-color", state.inputStyle.borderColor);
        root.style.setProperty("--fis-chat-input-width", `${state.inputStyle.chatWidth}%`);
      }
      if (state.inputStyle.positionEnabled && state.inputStyle.applyTargets.includes("chatInput")) {
        root.setAttribute("data-fis-input-position-chat", "1");
        root.style.setProperty("--fis-chat-input-offset-x", `${state.inputStyle.offsetX}px`);
        root.style.setProperty("--fis-chat-input-offset-y", `${state.inputStyle.offsetY}px`);
      }
      if (state.toolbarStyle.enabled) {
        root.setAttribute("data-fis-toolbar-style", "1");
        if (state.toolbarStyle.mergeExpressions) root.setAttribute("data-fis-merge-expressions", "1");
        if (state.toolbarStyle.hideBuiltinEmojis) root.setAttribute("data-fis-hide-builtin-emojis", "1");
        for (const [key] of TOOLBAR_ICON_DEFS) {
          const item = state.toolbarStyle.items[key];
          const suffix = toolbarIconSuffix(key);
          root.style.setProperty(`--fis-tool-${suffix}-x`, `${item.offsetX}px`);
          root.style.setProperty(`--fis-tool-${suffix}-y`, `${item.offsetY}px`);
          if (!item.visible) root.setAttribute("data-fis-tool-" + suffix + "-hidden", "1");
        }
      }
      if (state.inputStyle.backgroundMode === "color") {
        if (state.inputStyle.applyTargets.includes("chatInput")) root.setAttribute("data-fis-input-color-chat", "1");
        if (state.inputStyle.applyTargets.includes("searchInput")) root.setAttribute("data-fis-input-color-search", "1");
        if (state.inputStyle.applyTargets.includes("formInput")) root.setAttribute("data-fis-input-color-form", "1");
        root.style.setProperty("--fis-input-background-color", colorWithOpacity(state.inputStyle.backgroundColor, state.inputStyle.backgroundOpacity));
      }
      for (const def of REGION_DEFS) {
        const region = state.regions[def.key];
        if (def.key === "inputField") {
          if (state.inputStyle.backgroundMode !== "image" || !region.image) continue;
          if (state.inputStyle.applyTargets.includes("chatInput")) root.setAttribute("data-fis-input-image-chat", "1");
          if (state.inputStyle.applyTargets.includes("searchInput")) root.setAttribute("data-fis-input-image-search", "1");
          if (state.inputStyle.applyTargets.includes("formInput")) root.setAttribute("data-fis-input-image-form", "1");
        } else {
          if (!state.imagesEnabled || !region.enabled || !region.image) continue;
        }
        if (def.key === "bottomBar") {
          if (region.applyTargets.includes("inputBar")) root.setAttribute("data-fis-bottom-image-input", "1");
          if (region.applyTargets.includes("tabBar")) root.setAttribute("data-fis-bottom-image-tab", "1");
          for (const [targetKey, suffix] of [["inputBar", "input"], ["tabBar", "tab"]]) {
            const settings = region.targetSettings[targetKey];
            const prefix = `--fis-bottom-bar-${suffix}`;
            const source = region.image;
            const blur = settings.blur;
            applyImageSource(`bottomBar:${targetKey}`, source, blur, prefix, () => {
              const current = state.regions.bottomBar;
              const currentSettings = current && current.targetSettings && current.targetSettings[targetKey];
              return !!current && current.enabled && current.image === source && !!currentSettings && currentSettings.blur === blur;
            });
            root.style.setProperty(prefix + "-size", imageSizeCss(def, settings.scale));
            root.style.setProperty(prefix + "-position", `${settings.positionX}% ${settings.positionY}%`);
            root.style.setProperty(prefix + "-over-top", String(settings.overflowY));
            root.style.setProperty(prefix + "-over-bottom", String(settings.overflowY));
          }
          continue;
        } else root.setAttribute(attributeName(def.key), "1");
        if (def.key === "topBar") {
          for (const target of region.applyTargets) {
            const suffix = target === "chatRoom" ? "chat-room" : target;
            root.setAttribute("data-fis-top-target-" + suffix, "1");
          }
        }
        if (def.key === "appBackground") {
          for (const target of region.applyTargets) {
            const suffix = target === "chatRoom" ? "chat-room" : target;
            root.setAttribute("data-fis-background-target-" + suffix, "1");
          }
        }
        const prefix = `--fis-${def.key.replace(/[A-Z]/g, letter => "-" + letter.toLowerCase())}`;
        const imageSize = imageSizeCss(def, region.scale);
        applyRegionImage(def, region, prefix);
        root.style.setProperty(prefix + "-size", imageSize);
        root.style.setProperty(prefix + "-repeat", "no-repeat");
        root.style.setProperty(prefix + "-position", `${region.positionX}% ${region.positionY}%`);
        const overflowY = def.overflow ? region.overflowY : 0;
        root.style.setProperty(prefix + "-over-top", String(overflowY));
        root.style.setProperty(prefix + "-over-right", "0");
        root.style.setProperty(prefix + "-over-bottom", String(overflowY));
        root.style.setProperty(prefix + "-over-left", "0");
      }
      refreshStyleSheet();
      syncThemeScope();
      syncToolbarDom();
    }

    function refreshAll() {
      apply();
      for (const refresh of refreshers) {
        try { refresh(); } catch (error) { ctx.system.log("[自定义聊天主题] 设置界面刷新失败", error); }
      }
    }

    function replaceActiveTheme(snapshot) {
      const savedThemes = state.themes;
      const savedSchedule = state.dayNightSchedule;
      const floatingButtonEnabled = state.floatingButtonEnabled;
      const floatingButtonTop = state.floatingButtonTop;
      const next = normalizeState(snapshot);
      next.themes = savedThemes;
      next.dayNightSchedule = savedSchedule;
      next.floatingButtonEnabled = floatingButtonEnabled;
      next.floatingButtonTop = floatingButtonTop;
      state = next;
    }

    function currentDayNightPeriod(now = new Date()) {
      const hour = now.getHours();
      return hour >= 6 && hour < 18 ? "day" : "night";
    }

    function applyDayNightSchedule(force = false) {
      const schedule = state.dayNightSchedule;
      if (!schedule.enabled) { lastDayNightKey = ""; return false; }
      if (!force && floatingMode === "editor") return false;
      const period = currentDayNightPeriod();
      const selectedId = period === "day" ? schedule.dayThemeId : schedule.nightThemeId;
      const selectedTheme = selectedId ? state.themes[selectedId] : null;
      const snapshot = selectedTheme ? selectedTheme.snapshot : schedule.fallbackSnapshot;
      const key = `${period}:${selectedTheme ? selectedTheme.id : "current"}`;
      if (!snapshot || (!force && key === lastDayNightKey)) return false;
      lastDayNightKey = key;
      replaceActiveTheme(snapshot);
      persist();
      refreshAll();
      return true;
    }

    const floatingButton = document.createElement("button");
    floatingButton.type = "button";
    floatingButton.className = "fis-floating-button";
    floatingButton.title = "打开自定义聊天主题设置";
    floatingButton.setAttribute("aria-label", "打开自定义聊天主题设置");
    floatingButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M7 14v6"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>';
    const floatingPanel = document.createElement("div");
    floatingPanel.className = "fis-settings fis-floating-panel";
    floatingPanel.setAttribute("role", "dialog");
    floatingPanel.setAttribute("aria-label", "自定义聊天主题实时设置");
    const floatingHost = document.body || document.documentElement;
    floatingHost.append(floatingButton, floatingPanel);

    let floatingOpen = false;
    let floatingPage = "images";
    let floatingInterfacePage = "inputs";
    let floatingColorRuleId = "";
    let floatingFontRuleId = "";
    let floatingImageRegionKey = "base";
    let floatingToolbarIconKey = "offline";
    let floatingDeleteMode = false;
    const floatingDeleteSelection = new Set();
    let floatingMode = "library";
    let editingThemeId = "";
    let editingThemeName = "";
    const themeDeleteSelection = new Set();
    let themeDeleteMode = false;

    const clampFloatingTop = value => {
      const height = floatingButton.offsetHeight || (window.innerWidth <= 560 ? 58 : 64);
      return Math.max(8, Math.min(window.innerHeight - height - 8, Number(value) || 8));
    };
    if (state.floatingButtonTop != null) floatingButton.style.top = `${clampFloatingTop(state.floatingButtonTop)}px`;

    function positionFloatingPanel() {
      if (!floatingOpen) return;
      const rect = floatingButton.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      if (rect.top > viewportHeight * 0.48) {
        floatingPanel.style.top = "auto";
        floatingPanel.style.bottom = `${Math.max(8, viewportHeight - rect.bottom)}px`;
        floatingPanel.style.maxHeight = `${Math.min(viewportHeight * 0.78, Math.max(220, rect.bottom - 16))}px`;
      } else {
        const top = Math.max(8, rect.top);
        floatingPanel.style.bottom = "auto";
        floatingPanel.style.top = `${top}px`;
        floatingPanel.style.maxHeight = `${Math.min(viewportHeight * 0.78, Math.max(220, viewportHeight - top - 8))}px`;
      }
    }

    const onFloatingResize = () => {
      const top = clampFloatingTop(floatingButton.getBoundingClientRect().top);
      floatingButton.style.top = `${top}px`;
      if (state.floatingButtonTop != null) state.floatingButtonTop = top;
      positionFloatingPanel();
      syncThemeScope();
    };
    window.addEventListener("resize", onFloatingResize);

    const resumeTimers = new Set();
    const scheduleResumeSync = () => {
      if (document.visibilityState === "hidden") return;
      applyDayNightSchedule(false);
      for (const timer of resumeTimers) clearTimeout(timer);
      resumeTimers.clear();
      if (expressionProbeTimer) {
        clearTimeout(expressionProbeTimer);
        expressionProbeTimer = 0;
      }
      expressionProbeStage = "";
      expressionProbeDeadline = 0;
      expressionPackProbeComplete = false;
      for (const delay of [0, 120, 420, 1100]) {
        const timer = setTimeout(() => {
          resumeTimers.delete(timer);
          if (disposed || document.visibilityState === "hidden") return;
          requestAnimationFrame(() => {
            if (disposed) return;
            syncThemeScope();
            resyncBottomBarGeometry();
            for (const bar of document.querySelectorAll(".chat-app .chat-room-wrapper .chat-input-bar")) {
              if (bar instanceof HTMLElement) void bar.getBoundingClientRect();
            }
          });
        }, delay);
        resumeTimers.add(timer);
      }
    };
    const onVisibilityResume = () => {
      if (document.visibilityState === "visible") scheduleResumeSync();
    };
    document.addEventListener("visibilitychange", onVisibilityResume);
    window.addEventListener("pageshow", scheduleResumeSync);

    const liveIcons = {
      dayNight: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7"/><circle cx="12" cy="12" r="4"/><path d="M15.5 15.5a5 5 0 0 0 3.9-7.9 6.7 6.7 0 0 1-3.9 7.9Z"/></svg>',
      themePlus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"/><path d="M12 7v6M9 10h6"/></svg>',
      plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
      trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>',
      upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M8 8l4-4 4 4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg>',
      download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12M8 12l4 4 4-4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg>',
      check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
      pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.2-1 10.6-10.6a2 2 0 0 0-2.8-2.8L5.4 16.2zM14.5 7.1l2.8 2.8"/></svg>',
      settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M14 4v6M4 17h2M10 17h10M6 14v6"/></svg>',
    };

    const liveButton = (text, className, onClick) => {
      const node = document.createElement("button"); node.type = "button";
      node.className = "fis-btn" + (className ? " " + className : ""); node.textContent = text;
      node.addEventListener("click", event => { event.stopPropagation(); onClick(); });
      return node;
    };

    const liveIconButton = (icon, label, onClick, className = "") => {
      const node = document.createElement("button"); node.type = "button";
      node.className = "fis-icon-btn" + (className ? " " + className : ""); node.innerHTML = liveIcons[icon];
      node.title = label; node.setAttribute("aria-label", label);
      node.addEventListener("click", event => { event.stopPropagation(); onClick(); });
      return node;
    };

    const liveSwitch = (checked, label, onChange) => {
      const wrapper = document.createElement("label"); wrapper.className = "fis-switch"; wrapper.title = label;
      const input = document.createElement("input"); input.type = "checkbox"; input.checked = checked; input.setAttribute("aria-label", label);
      const track = document.createElement("span"); track.className = "fis-switch-track";
      input.addEventListener("change", () => onChange(input.checked)); wrapper.append(input, track);
      return wrapper;
    };

    const openFloatingDialog = ({ title, message = "", inputValue, inputPlaceholder = "", confirmLabel = "确定", danger = false, onConfirm }) => {
      const existing = document.querySelector(".fis-dialog-overlay");
      if (existing) existing.remove();
      const overlay = document.createElement("div"); overlay.className = "fis-dialog-overlay";
      const dialog = document.createElement("section"); dialog.className = "fis-dialog-card"; dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true");
      const heading = document.createElement("div"); heading.className = "fis-dialog-title"; heading.textContent = title;
      dialog.appendChild(heading);
      if (message) {
        const copy = document.createElement("div"); copy.className = "fis-dialog-message"; copy.textContent = message; dialog.appendChild(copy);
      }
      let input = null;
      if (inputValue !== undefined) {
        input = document.createElement("input"); input.type = "text"; input.className = "fis-dialog-input";
        input.value = String(inputValue); input.placeholder = inputPlaceholder; dialog.appendChild(input);
      }
      const actions = document.createElement("div"); actions.className = "fis-dialog-actions";
      const close = () => overlay.remove();
      const cancel = liveButton("取消", "", close);
      const confirmButton = liveButton(confirmLabel, danger ? "danger" : "primary", () => {
        const result = onConfirm ? onConfirm(input ? input.value : undefined) : undefined;
        if (result !== false) close();
      });
      actions.append(cancel, confirmButton); dialog.appendChild(actions); overlay.appendChild(dialog);
      (document.body || document.documentElement).appendChild(overlay);
      if (input) {
        input.addEventListener("keydown", event => { if (event.key === "Enter") confirmButton.click(); });
        setTimeout(() => { input.focus?.(); input.select?.(); }, 0);
      }
      return overlay;
    };

    const liveRange = (target, key, min, max, step, suffix, deferred = false, preview = null, commitAction = null) => {
      const pair = document.createElement("div"); pair.className = "fis-range-pair";
      const range = document.createElement("input"); range.type = "range"; range.className = "fis-range";
      range.min = String(min); range.max = String(max); range.step = String(step); range.value = String(target[key]);
      const number = document.createElement("input"); number.type = "number"; number.className = "fis-number";
      number.min = String(min); number.max = String(max); number.step = String(step); number.value = String(target[key]); number.title = suffix;
      const updateProgress = () => {
        const progress = max === min ? 0 : ((Number(range.value) - min) / (max - min)) * 100;
        range.style.setProperty("--fis-range-progress", `${Math.min(100, Math.max(0, progress))}%`);
      };
      const sync = (source, other, commit = true) => {
        const value = clamp(source.value, target[key], min, max);
        target[key] = value; source.value = String(value); other.value = String(value); updateProgress();
        if (preview) preview(value);
        if (commit) {
          if (commitAction) commitAction();
          else { persist(); apply(); }
        }
      };
      updateProgress();
      range.addEventListener("input", () => sync(range, number, !deferred));
      if (deferred) range.addEventListener("change", () => sync(range, number, true));
      number.addEventListener(deferred ? "change" : "input", () => sync(number, range, true));
      pair.append(range, number); return pair;
    };

    const liveRow = (panel, labelText, control) => {
      const row = document.createElement("div"); row.className = "fis-row";
      const label = document.createElement("div"); label.className = "fis-label"; label.textContent = labelText;
      row.append(label, control); panel.appendChild(row);
    };

    function openDayNightDialog() {
      document.querySelector(".fis-dialog-overlay")?.remove();
      const overlay = document.createElement("div"); overlay.className = "fis-dialog-overlay";
      const dialog = document.createElement("section"); dialog.className = "fis-dialog-card";
      dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); dialog.setAttribute("aria-label", "日夜切换设置");
      const heading = document.createElement("div"); heading.className = "fis-dialog-title"; heading.textContent = "日夜切换";
      const content = document.createElement("div"); content.className = "fis-day-night-dialog";
      const switchRow = document.createElement("div"); switchRow.className = "fis-switch-row";
      const switchLabel = document.createElement("div"); switchLabel.className = "fis-label"; switchLabel.textContent = "自动切换";
      switchRow.append(switchLabel, liveSwitch(state.dayNightSchedule.enabled, "根据系统时间自动切换主题", checked => {
        if (checked && !state.dayNightSchedule.enabled) state.dayNightSchedule.fallbackSnapshot = themeSnapshot(state);
        state.dayNightSchedule.enabled = checked;
        lastDayNightKey = "";
        persist();
        if (checked) applyDayNightSchedule(true);
        renderFloating();
      }));
      const makeThemeSelect = key => {
        const select = document.createElement("select"); select.className = "fis-select";
        const current = document.createElement("option"); current.value = ""; current.textContent = "当前使用"; select.appendChild(current);
        for (const theme of Object.values(state.themes)) {
          const option = document.createElement("option"); option.value = theme.id; option.textContent = theme.name; select.appendChild(option);
        }
        select.value = state.dayNightSchedule[key];
        select.addEventListener("change", () => {
          if (!select.value && state.dayNightSchedule.enabled) state.dayNightSchedule.fallbackSnapshot = themeSnapshot(state);
          state.dayNightSchedule[key] = select.value;
          lastDayNightKey = "";
          persist();
          if (state.dayNightSchedule.enabled) applyDayNightSchedule(true);
        });
        return select;
      };
      content.appendChild(switchRow);
      liveRow(content, "日间", makeThemeSelect("dayThemeId"));
      liveRow(content, "夜间", makeThemeSelect("nightThemeId"));
      const hint = document.createElement("div"); hint.className = "fis-day-night-hint";
      hint.textContent = "按本机时间：06:00 切换日间，18:00 切换夜间；未指定时沿用开启时的当前主题。";
      content.appendChild(hint);
      const actions = document.createElement("div"); actions.className = "fis-dialog-actions";
      actions.appendChild(liveButton("完成", "primary", () => overlay.remove()));
      dialog.append(heading, content, actions); overlay.appendChild(dialog);
      (document.body || document.documentElement).appendChild(overlay);
    }

    function syncFloatingUi() {
      if (!state.floatingButtonEnabled) floatingOpen = false;
      floatingButton.hidden = !state.floatingButtonEnabled;
      floatingPanel.hidden = !state.floatingButtonEnabled || !floatingOpen;
      floatingButton.setAttribute("aria-expanded", floatingOpen ? "true" : "false");
      if (floatingOpen) requestAnimationFrame(positionFloatingPanel);
    }

    function loadThemeIntoEditor(theme) {
      replaceActiveTheme(theme ? theme.snapshot : defaultState());
      editingThemeId = theme ? theme.id : themeId();
      editingThemeName = theme ? theme.name : editingThemeName;
      floatingMode = "editor";
      floatingPage = "images";
      floatingDeleteMode = false;
      floatingDeleteSelection.clear();
      persist();
      apply();
      renderFloating();
    }

    const archiveEncoder = new TextEncoder();
    const archiveDecoder = new TextDecoder();
    const archiveCrcTable = (() => {
      const table = new Uint32Array(256);
      for (let index = 0; index < 256; index++) {
        let value = index;
        for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
        table[index] = value >>> 0;
      }
      return table;
    })();

    const archiveCrc32 = bytes => {
      let value = 0xffffffff;
      for (const byte of bytes) value = archiveCrcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
      return (value ^ 0xffffffff) >>> 0;
    };

    const dataUrlBytes = value => {
      const matched = /^data:([^;,]+)?;base64,([\s\S]*)$/i.exec(String(value || ""));
      if (!matched) throw new Error("资源格式无效");
      const binary = atob(matched[2]);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      return { mime: matched[1] || "application/octet-stream", bytes };
    };

    const bytesDataUrl = (bytes, mime) => {
      const chunks = [];
      for (let index = 0; index < bytes.length; index += 0x8000) chunks.push(String.fromCharCode(...bytes.subarray(index, index + 0x8000)));
      return `data:${mime || "application/octet-stream"};base64,${btoa(chunks.join(""))}`;
    };

    const archiveExtension = (mime, originalName = "") => {
      const byMime = {
        "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
        "font/ttf": "ttf", "font/otf": "otf", "font/woff": "woff", "font/woff2": "woff2",
        "application/font-woff": "woff", "application/font-sfnt": "ttf",
      };
      if (byMime[mime]) return byMime[mime];
      const matched = /\.([a-z0-9]{2,5})$/i.exec(String(originalName));
      return matched ? matched[1].toLowerCase() : "bin";
    };

    const safeArchiveName = value => String(value || "asset").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "asset";

    const createStoredZip = files => {
      const localChunks = [];
      const records = [];
      let offset = 0;
      for (const file of files) {
        const name = archiveEncoder.encode(file.name);
        const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
        const crc = archiveCrc32(data);
        const header = new Uint8Array(30 + name.length);
        const view = new DataView(header.buffer);
        view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true);
        view.setUint16(8, 0, true); view.setUint16(10, 0, true); view.setUint16(12, 33, true);
        view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true);
        view.setUint16(26, name.length, true); view.setUint16(28, 0, true); header.set(name, 30);
        localChunks.push(header, data); records.push({ name, data, crc, offset }); offset += header.length + data.length;
      }
      const centralChunks = [];
      let centralSize = 0;
      for (const record of records) {
        const header = new Uint8Array(46 + record.name.length);
        const view = new DataView(header.buffer);
        view.setUint32(0, 0x02014b50, true); view.setUint16(4, 20, true); view.setUint16(6, 20, true);
        view.setUint16(8, 0x0800, true); view.setUint16(10, 0, true); view.setUint16(12, 0, true); view.setUint16(14, 33, true);
        view.setUint32(16, record.crc, true); view.setUint32(20, record.data.length, true); view.setUint32(24, record.data.length, true);
        view.setUint16(28, record.name.length, true); view.setUint16(30, 0, true); view.setUint16(32, 0, true);
        view.setUint16(34, 0, true); view.setUint16(36, 0, true); view.setUint32(38, 0, true); view.setUint32(42, record.offset, true);
        header.set(record.name, 46); centralChunks.push(header); centralSize += header.length;
      }
      const end = new Uint8Array(22);
      const endView = new DataView(end.buffer);
      endView.setUint32(0, 0x06054b50, true); endView.setUint16(4, 0, true); endView.setUint16(6, 0, true);
      endView.setUint16(8, records.length, true); endView.setUint16(10, records.length, true);
      endView.setUint32(12, centralSize, true); endView.setUint32(16, offset, true); endView.setUint16(20, 0, true);
      return new Blob([...localChunks, ...centralChunks, end], { type: "application/zip" });
    };

    const readStoredZip = async file => {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer); const view = new DataView(buffer);
      let endOffset = -1;
      for (let index = Math.max(0, bytes.length - 65557); index <= bytes.length - 22; index++) {
        if (view.getUint32(index, true) === 0x06054b50) endOffset = index;
      }
      if (endOffset < 0) throw new Error("ZIP 目录无效");
      const count = view.getUint16(endOffset + 10, true);
      let cursor = view.getUint32(endOffset + 16, true);
      const entries = new Map();
      for (let index = 0; index < count; index++) {
        if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("ZIP 文件项无效");
        const method = view.getUint16(cursor + 10, true);
        const compressedSize = view.getUint32(cursor + 20, true);
        const size = view.getUint32(cursor + 24, true);
        const nameLength = view.getUint16(cursor + 28, true);
        const extraLength = view.getUint16(cursor + 30, true);
        const commentLength = view.getUint16(cursor + 32, true);
        const localOffset = view.getUint32(cursor + 42, true);
        const name = archiveDecoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
        if (method !== 0 || compressedSize !== size) throw new Error("暂不支持压缩过的资源文件");
        if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("ZIP 本地文件项无效");
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
        const data = bytes.slice(dataOffset, dataOffset + size);
        if (archiveCrc32(data) !== view.getUint32(cursor + 16, true)) throw new Error("ZIP 资源校验失败");
        entries.set(name, data);
        cursor += 46 + nameLength + extraLength + commentLength;
      }
      return entries;
    };

    function exportThemeConfig() {
      const exported = JSON.parse(JSON.stringify(state));
      const files = [];
      const reusedAssets = new Map();
      let assetIndex = 0;
      const addAsset = (dataUrl, folder, stem, originalName) => {
        if (reusedAssets.has(dataUrl)) return reusedAssets.get(dataUrl);
        const decoded = dataUrlBytes(dataUrl);
        const extension = archiveExtension(decoded.mime, originalName);
        const path = `${folder}/${safeArchiveName(stem)}-${++assetIndex}.${extension}`;
        files.push({ name: path, data: decoded.bytes });
        const reference = { path, mime: decoded.mime };
        reusedAssets.set(dataUrl, reference); return reference;
      };
      const externalizeRegions = (regions, prefix) => {
        for (const [key, region] of Object.entries(regions || {})) {
          if (!region || typeof region.image !== "string" || !region.image.startsWith("data:")) continue;
          const reference = addAsset(region.image, "images", `${prefix}-${key}`, region.fileName);
          region.image = ""; region.assetPath = reference.path; region.assetMime = reference.mime;
        }
      };
      const externalizeFonts = (rules, prefix) => {
        for (const rule of rules || []) {
          if (!rule || typeof rule.data !== "string" || !rule.data.startsWith("data:")) continue;
          const reference = addAsset(rule.data, "fonts", `${prefix}-${rule.id}`, rule.name);
          rule.data = ""; rule.assetPath = reference.path; rule.assetMime = reference.mime;
        }
      };
      externalizeRegions(exported.regions, "current"); externalizeFonts(exported.fontRules, "current");
      for (const theme of Object.values(exported.themes || {})) {
        if (!theme || !theme.snapshot) continue;
        const prefix = `theme-${safeArchiveName(theme.id)}`;
        externalizeRegions(theme.snapshot.regions, prefix); externalizeFonts(theme.snapshot.fontRules, prefix);
      }
      const fallback = exported.dayNightSchedule && exported.dayNightSchedule.fallbackSnapshot;
      if (fallback) {
        externalizeRegions(fallback.regions, "day-night-current");
        externalizeFonts(fallback.fontRules, "day-night-current");
      }
      const settings = { format: "float-interface-skin-archive", archiveVersion: 1, state: exported };
      files.unshift({ name: "settings.json", data: archiveEncoder.encode(JSON.stringify(settings, null, 2)) });
      const blob = createStoredZip(files);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = "float-interface-skin-backup.zip"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function importThemeConfig(file) {
      const entries = await readStoredZip(file);
      const settingsBytes = entries.get("settings.json");
      if (!settingsBytes) throw new Error("缺少 settings.json");
      const archive = JSON.parse(archiveDecoder.decode(settingsBytes));
      if (!archive || archive.format !== "float-interface-skin-archive" || !archive.state) throw new Error("设置文件无效");
      const imported = archive.state;
      const restoreRegions = regions => {
        for (const region of Object.values(regions || {})) {
          if (!region || !region.assetPath) continue;
          const bytes = entries.get(region.assetPath); if (!bytes) throw new Error(`缺少资源：${region.assetPath}`);
          region.image = bytesDataUrl(bytes, region.assetMime); delete region.assetPath; delete region.assetMime;
        }
      };
      const restoreFonts = rules => {
        for (const rule of rules || []) {
          if (!rule || !rule.assetPath) continue;
          const bytes = entries.get(rule.assetPath); if (!bytes) throw new Error(`缺少资源：${rule.assetPath}`);
          rule.data = bytesDataUrl(bytes, rule.assetMime); delete rule.assetPath; delete rule.assetMime;
        }
      };
      restoreRegions(imported.regions); restoreFonts(imported.fontRules);
      for (const theme of Object.values(imported.themes || {})) {
        if (!theme || !theme.snapshot) continue;
        restoreRegions(theme.snapshot.regions); restoreFonts(theme.snapshot.fontRules);
      }
      const fallback = imported.dayNightSchedule && imported.dayNightSchedule.fallbackSnapshot;
      if (fallback) { restoreRegions(fallback.regions); restoreFonts(fallback.fontRules); }
      state = normalizeState(imported); themeDeleteMode = false; themeDeleteSelection.clear();
      lastDayNightKey = "";
      persist();
      if (!state.dayNightSchedule.enabled || !applyDayNightSchedule(true)) refreshAll();
      ctx.ui.toast("自定义聊天主题已导入");
    }

    function renderFloating() {
      syncFloatingUi();
      floatingPanel.textContent = "";
      floatingPanel.classList.toggle("fis-theme-library-mode", floatingMode === "library");

      if (floatingMode === "library") {
        const body = document.createElement("div"); body.className = "fis-floating-body fis-theme-library-body";
        const heading = document.createElement("div"); heading.className = "fis-theme-library-heading"; heading.textContent = "主题库";
        const list = document.createElement("div"); list.className = "fis-theme-library-list";
        const themes = Object.values(state.themes);
        for (const theme of themes) {
          const card = document.createElement("section");
          card.className = "fis-theme-library-card" + (themeDeleteMode ? " selecting" : "") + (themeDeleteSelection.has(theme.id) ? " selected" : "");
          if (themeDeleteMode) {
            const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = themeDeleteSelection.has(theme.id);
            const toggle = () => {
              if (themeDeleteSelection.has(theme.id)) themeDeleteSelection.delete(theme.id);
              else themeDeleteSelection.add(theme.id);
              renderFloating();
            };
            checkbox.addEventListener("click", event => { event.stopPropagation(); toggle(); });
            card.addEventListener("click", toggle);
            const copy = document.createElement("div");
            const name = document.createElement("div"); name.className = "fis-theme-name"; name.textContent = theme.name;
            copy.appendChild(name); card.append(checkbox, copy);
          } else {
            const copy = document.createElement("div");
            const name = document.createElement("div"); name.className = "fis-theme-name"; name.textContent = theme.name;
            const hint = document.createElement("div"); hint.className = "fis-theme-hint";
            const imageCount = Object.values(theme.snapshot.regions || {}).filter(region => region && region.image).length;
            hint.textContent = imageCount ? `包含 ${imageCount} 张图片` : "未包含图片";
            copy.append(name, hint);
            const actions = document.createElement("div"); actions.className = "fis-theme-library-actions";
            actions.append(
              liveIconButton("check", `应用主题：${theme.name}`, () => {
                replaceActiveTheme(theme.snapshot); persist(); refreshAll(); ctx.ui.toast(`已应用主题：${theme.name}`);
              }, "primary"),
              liveIconButton("settings", `编辑主题：${theme.name}`, () => loadThemeIntoEditor(theme)),
              liveIconButton("pencil", `重命名主题：${theme.name}`, () => {
                openFloatingDialog({
                  title: "重命名主题", inputValue: theme.name, inputPlaceholder: "主题名称", confirmLabel: "保存",
                  onConfirm: value => {
                    const nextName = String(value || "").trim(); if (!nextName) return false;
                    theme.name = nextName;
                    if (editingThemeId === theme.id) editingThemeName = nextName;
                    persist(); renderFloating(); ctx.ui.toast("主题已改名");
                  },
                });
              })
            );
            card.append(copy, actions);
          }
          list.appendChild(card);
        }
        if (!themes.length) {
          const empty = document.createElement("div"); empty.className = "fis-theme-library-empty";
          empty.textContent = "还没有主题，请点击下方＋新建主题"; list.appendChild(empty);
        }

        const importInput = document.createElement("input"); importInput.type = "file"; importInput.accept = "application/zip,.zip"; importInput.hidden = true;
        importInput.addEventListener("change", async () => {
          const file = importInput.files && importInput.files[0]; if (!file) return;
          try { await importThemeConfig(file); }
          catch (error) { ctx.ui.toast(`导入失败：${error && error.message ? error.message : "压缩包无效"}`); }
          importInput.value = "";
        });
        const tools = document.createElement("div"); tools.className = "fis-theme-library-tools";
        tools.append(
          liveIconButton("dayNight", "日夜切换", openDayNightDialog, state.dayNightSchedule.enabled ? "primary" : ""),
          liveIconButton("upload", "导入主题配置", () => importInput.click()),
          liveIconButton("download", "导出主题配置", () => {
            openFloatingDialog({ title: "导出配置", message: "将设置、图片和字体完整保存为 ZIP 压缩包", confirmLabel: "继续导出", onConfirm: exportThemeConfig });
          }),
          liveIconButton("plus", "新建主题", () => {
            openFloatingDialog({
              title: "新建主题", inputValue: "", inputPlaceholder: "主题名称", confirmLabel: "新建",
              onConfirm: value => {
                const name = String(value || "").trim(); if (!name) return false;
                editingThemeName = name; loadThemeIntoEditor(null);
              },
            });
          }, "primary"),
          liveIconButton("trash", themeDeleteMode ? "确认删除所选主题" : "选择要删除的主题", () => {
            if (!themeDeleteMode) { themeDeleteMode = true; themeDeleteSelection.clear(); renderFloating(); return; }
            if (!themeDeleteSelection.size) { themeDeleteMode = false; renderFloating(); return; }
            const ids = [...themeDeleteSelection];
            openFloatingDialog({
              title: "删除主题", message: `确定删除选中的 ${ids.length} 个主题吗？`, confirmLabel: "删除", danger: true,
              onConfirm: () => {
                for (const id of ids) delete state.themes[id];
                if (ids.includes(state.dayNightSchedule.dayThemeId)) state.dayNightSchedule.dayThemeId = "";
                if (ids.includes(state.dayNightSchedule.nightThemeId)) state.dayNightSchedule.nightThemeId = "";
                lastDayNightKey = "";
                themeDeleteMode = false; themeDeleteSelection.clear(); persist(); renderFloating();
              },
            });
          }, themeDeleteMode ? "primary" : "danger"),
          importInput
        );
        body.append(heading, list, tools); floatingPanel.appendChild(body);
        return;
      }

      const head = document.createElement("div"); head.className = "fis-floating-head";
      const tabs = document.createElement("div"); tabs.className = "fis-page-tabs";
      const pageTab = (text, page) => {
        const tab = document.createElement("button"); tab.type = "button";
        tab.className = "fis-page-tab" + (floatingPage === page ? " active" : ""); tab.textContent = text;
        tab.addEventListener("click", () => { floatingPage = page; floatingDeleteMode = false; floatingDeleteSelection.clear(); renderFloating(); });
        return tab;
      };
      tabs.append(pageTab("主体", "images"), pageTab("组件", "interface"), pageTab("配色", "colors"), pageTab("字体", "fonts"));
      const headActions = document.createElement("div"); headActions.className = "fis-floating-head-actions";
      const saveTheme = liveIconButton("themePlus", "保存主题", () => {
        if (!editingThemeId || !editingThemeName) return;
        state.themes[editingThemeId] = { id: editingThemeId, name: editingThemeName, snapshot: themeSnapshot(state) };
        persist();
        floatingMode = "library";
        themeDeleteMode = false;
        themeDeleteSelection.clear();
        renderFloating();
        ctx.ui.toast("主题已保存");
      }, "primary");
      const close = document.createElement("button"); close.type = "button"; close.className = "fis-floating-close"; close.textContent = "×";
      close.title = "返回主题库"; close.setAttribute("aria-label", "返回主题库");
      close.addEventListener("click", () => { floatingMode = "library"; applyDayNightSchedule(false); renderFloating(); });
      headActions.append(saveTheme, close); head.appendChild(tabs); floatingPanel.append(head, headActions);
      const body = document.createElement("div"); body.className = "fis-floating-body"; floatingPanel.appendChild(body);

      if (floatingPage === "colors") {
        if (!state.colorRules.some(rule => rule.id === floatingColorRuleId)) floatingColorRuleId = state.colorRules[0]?.id || "";
        const workspace = document.createElement("div"); workspace.className = "fis-color-workspace" + (state.colorsEnabled ? "" : " disabled");
        const bar = document.createElement("div"); bar.className = "fis-subtab-bar";
        const colorTabs = document.createElement("div"); colorTabs.className = "fis-subtab-strip fis-color-tabs" + (floatingDeleteMode ? " delete-mode" : "");
        for (const rule of state.colorRules) {
          const tab = document.createElement("button"); tab.type = "button"; tab.dataset.ruleId = rule.id;
          tab.className = "fis-color-tab" + (rule.id === floatingColorRuleId && !floatingDeleteMode ? " active" : "") + (floatingDeleteSelection.has(rule.id) ? " selected" : "");
          tab.title = floatingDeleteMode ? `选择删除 ${rule.color.toUpperCase()}` : `切换至 ${rule.color.toUpperCase()}`;
          const mark = document.createElement("span"); mark.className = "fis-color-tab-mark"; mark.textContent = floatingDeleteSelection.has(rule.id) ? "✓" : "";
          const heart = document.createElement("span"); heart.className = "fis-color-heart"; heart.textContent = "♥"; heart.style.color = rule.color;
          tab.append(mark, heart);
          tab.addEventListener("click", () => {
            if (floatingDeleteMode) floatingDeleteSelection.has(rule.id) ? floatingDeleteSelection.delete(rule.id) : floatingDeleteSelection.add(rule.id);
            else floatingColorRuleId = rule.id;
            renderFloating();
          });
          colorTabs.appendChild(tab);
        }
        const switchBox = document.createElement("div"); switchBox.className = "fis-subtab-switch";
        switchBox.appendChild(liveSwitch(state.colorsEnabled, "启用全部配色", checked => {
          state.colorsEnabled = checked; persist(); apply(); renderFloating();
        }));
        bar.append(colorTabs, switchBox); workspace.appendChild(bar);

        const activeRule = state.colorRules.find(rule => rule.id === floatingColorRuleId);
        if (activeRule && !floatingDeleteMode) {
          const panel = document.createElement("div"); panel.className = "fis-color-panel";
          const editor = document.createElement("div"); editor.className = "fis-inline-color-editor";
          const picker = document.createElement("input"); picker.type = "color"; picker.value = activeRule.color;
          const colorText = document.createElement("input"); colorText.type = "text"; colorText.maxLength = 7; colorText.value = activeRule.color.toUpperCase();
          const updateColor = (value, commit = true) => {
            if (!/^#[0-9a-f]{6}$/i.test(value)) return;
            activeRule.color = value.toLowerCase(); picker.value = activeRule.color; colorText.value = activeRule.color.toUpperCase();
            const activeTab = [...colorTabs.children].find(node => node.dataset.ruleId === activeRule.id);
            if (activeTab) activeTab.querySelector(".fis-color-heart").style.color = activeRule.color;
            for (const key of activeRule.targets) root.style.setProperty("--fis-color-" + key.replace(/[A-Z]/g, letter => "-" + letter.toLowerCase()), activeRule.color);
            if (commit) { persist(); apply(); }
          };
          picker.addEventListener("input", () => updateColor(picker.value, false));
          picker.addEventListener("change", () => updateColor(picker.value, true));
          colorText.addEventListener("change", () => updateColor(colorText.value));
          colorText.addEventListener("blur", () => { colorText.value = activeRule.color.toUpperCase(); });
          editor.append(picker, colorText); panel.appendChild(editor);
          const options = document.createElement("div"); options.className = "fis-target-options fis-choice-chips";
          for (const target of COLOR_TARGETS) {
            const option = document.createElement("label"); option.className = "fis-target-option";
            const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = activeRule.targets.includes(target.key);
            checkbox.addEventListener("change", () => {
              if (checkbox.checked) {
                for (const otherRule of state.colorRules) otherRule.targets = otherRule.targets.filter(key => key !== target.key);
                if (!activeRule.targets.includes(target.key)) activeRule.targets.push(target.key);
              } else activeRule.targets = activeRule.targets.filter(key => key !== target.key);
              persist(); apply(); renderFloating();
            });
            const label = document.createElement("span"); label.textContent = target.label;
            option.append(checkbox, label); options.appendChild(option);
          }
          panel.appendChild(options); workspace.appendChild(panel);
        }
        if (!state.colorRules.length) {
          const empty = document.createElement("div"); empty.className = "fis-color-panel fis-empty"; empty.textContent = "尚未添加主题颜色"; workspace.appendChild(empty);
        }
        const actions = document.createElement("div"); actions.className = "fis-color-actions";
        const add = liveIconButton("plus", "新增颜色", () => {
          if (state.colorRules.length >= 10) return;
          const rule = { id: colorRuleId(), color: "#8f76b8", targets: [] };
          state.colorRules.push(rule); floatingColorRuleId = rule.id; persist(); renderFloating();
        });
        add.disabled = floatingDeleteMode || state.colorRules.length >= 10;
        add.title = state.colorRules.length >= 10 ? "最多保存 10 个颜色" : "新增颜色";
        const removeLabel = floatingDeleteMode
          ? (floatingDeleteSelection.size ? `删除选中的 ${floatingDeleteSelection.size} 个颜色` : "取消删除")
          : "删除颜色";
        const remove = liveIconButton("trash", removeLabel, () => {
          if (!floatingDeleteMode) { floatingDeleteMode = true; floatingDeleteSelection.clear(); renderFloating(); return; }
          if (!floatingDeleteSelection.size) { floatingDeleteMode = false; renderFloating(); return; }
          const count = floatingDeleteSelection.size;
          openFloatingDialog({
            title: "删除颜色", message: `确定删除选中的 ${count} 种颜色吗？`, confirmLabel: "删除", danger: true,
            onConfirm: () => {
              state.colorRules = state.colorRules.filter(rule => !floatingDeleteSelection.has(rule.id));
              floatingDeleteSelection.clear(); floatingDeleteMode = false; persist(); apply(); renderFloating();
            },
          });
        });
        actions.append(add, remove); workspace.appendChild(actions); body.appendChild(workspace);
      }

      if (floatingPage === "fonts") {
        if (!state.fontRules.some(rule => rule.id === floatingFontRuleId)) floatingFontRuleId = state.fontRules[0]?.id || "";
        const workspace = document.createElement("div"); workspace.className = "fis-color-workspace" + (state.fontsEnabled ? "" : " disabled");
        const bar = document.createElement("div"); bar.className = "fis-subtab-bar";
        const fontTabs = document.createElement("div"); fontTabs.className = "fis-subtab-strip fis-font-tabs";
        for (const rule of state.fontRules) {
          const tab = document.createElement("button"); tab.type = "button"; tab.className = "fis-font-tab" + (rule.id === floatingFontRuleId ? " active" : "");
          tab.textContent = rule.name; tab.title = rule.name;
          tab.addEventListener("click", () => { floatingFontRuleId = rule.id; renderFloating(); }); fontTabs.appendChild(tab);
        }
        const switchBox = document.createElement("div"); switchBox.className = "fis-subtab-switch";
        switchBox.appendChild(liveSwitch(state.fontsEnabled, "启用全部字体设置", checked => { state.fontsEnabled = checked; persist(); apply(); renderFloating(); }));
        bar.append(fontTabs, switchBox); workspace.appendChild(bar);

        const loadFont = (file, replaceRule = null) => {
          if (!file) return;
          if (file.size > MAX_FONT_FILE_BYTES) { ctx.ui.toast("字体文件不能超过 25 MB"); return; }
          const reader = new FileReader(); reader.onload = () => {
            const data = String(reader.result || ""); if (!data) return;
            if (replaceRule) { replaceRule.data = data; replaceRule.name = file.name; floatingFontRuleId = replaceRule.id; }
            else {
              const rule = { id: fontRuleId(), name: file.name, data, targets: [] };
              state.fontRules.push(rule); floatingFontRuleId = rule.id;
            }
            state.fontsEnabled = true; persist(); apply(); renderFloating(); ctx.ui.toast("字体已载入");
          }; reader.readAsDataURL(file);
        };

        const activeRule = state.fontRules.find(rule => rule.id === floatingFontRuleId);
        if (activeRule) {
          const panel = document.createElement("div"); panel.className = "fis-color-panel";
          const replaceInput = document.createElement("input"); replaceInput.type = "file"; replaceInput.accept = ".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"; replaceInput.hidden = true;
          replaceInput.addEventListener("change", () => loadFont(replaceInput.files && replaceInput.files[0], activeRule));
          const fileRow = document.createElement("div"); fileRow.className = "fis-file-row";
          const fileName = document.createElement("div"); fileName.className = "fis-file-name"; fileName.textContent = activeRule.name;
          const fileActions = document.createElement("div"); fileActions.className = "fis-region-actions";
          fileActions.append(liveButton("替换", "primary", () => replaceInput.click()), replaceInput); fileRow.append(fileName, fileActions);
          liveRow(panel, "字体文件", fileRow);
          const options = document.createElement("div"); options.className = "fis-target-options fis-choice-chips";
          for (const target of FONT_TARGETS) {
            const option = document.createElement("label"); option.className = "fis-target-option";
            const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = activeRule.targets.includes(target.key);
            checkbox.addEventListener("change", () => {
              if (checkbox.checked) {
                for (const otherRule of state.fontRules) otherRule.targets = otherRule.targets.filter(key => key !== target.key);
                if (!activeRule.targets.includes(target.key)) activeRule.targets.push(target.key);
              } else activeRule.targets = activeRule.targets.filter(key => key !== target.key);
              persist(); apply(); renderFloating();
            });
            const label = document.createElement("span"); label.textContent = target.label;
            option.append(checkbox, label); options.appendChild(option);
          }
          panel.appendChild(options); workspace.appendChild(panel);
        } else {
          const empty = document.createElement("div"); empty.className = "fis-color-panel fis-empty"; empty.textContent = "尚未上传字体"; workspace.appendChild(empty);
        }

        const actions = document.createElement("div"); actions.className = "fis-color-actions";
        const addInput = document.createElement("input"); addInput.type = "file"; addInput.accept = ".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"; addInput.hidden = true;
        addInput.addEventListener("change", () => loadFont(addInput.files && addInput.files[0]));
        const add = liveIconButton("plus", state.fontRules.length >= 10 ? "最多上传 10 个字体" : "上传字体", () => addInput.click());
        add.disabled = state.fontRules.length >= 10;
        const remove = liveIconButton("trash", "删除当前字体", () => {
          if (!activeRule) return;
          openFloatingDialog({
            title: "删除字体",
            message: `确定删除“${activeRule.name}”吗？`,
            confirmLabel: "删除",
            danger: true,
            onConfirm: () => {
              state.fontRules = state.fontRules.filter(rule => rule.id !== activeRule.id);
              floatingFontRuleId = state.fontRules[0]?.id || ""; persist(); apply(); renderFloating();
            },
          });
        });
        remove.disabled = !activeRule;
        actions.append(add, remove, addInput); workspace.appendChild(actions); body.appendChild(workspace);
      }

      let interfaceWorkspace = null;
      if (floatingPage === "interface") {
        interfaceWorkspace = document.createElement("div"); interfaceWorkspace.className = "fis-interface-workspace";
        const bar = document.createElement("div"); bar.className = "fis-subtab-bar";
        const strip = document.createElement("div"); strip.className = "fis-subtab-strip";
        const interfaceTab = (text, page) => {
          const tab = document.createElement("button"); tab.type = "button";
          tab.className = "fis-image-tab" + (floatingInterfacePage === page ? " active" : ""); tab.textContent = text;
          tab.addEventListener("click", () => { floatingInterfacePage = page; renderFloating(); });
          return tab;
        };
        strip.append(interfaceTab("输入框", "inputs"), interfaceTab("工具栏", "toolbar"), interfaceTab("按钮", "buttons"), interfaceTab("主页部件", "cards"), interfaceTab("头像", "avatars"), interfaceTab("心声", "thought"), interfaceTab("翻译", "translation"));
        bar.appendChild(strip); interfaceWorkspace.appendChild(bar); body.appendChild(interfaceWorkspace);
      }

      if (floatingPage === "interface" && floatingInterfacePage === "avatars") {
        const avatarStyle = state.avatarStyle;
        const card = document.createElement("section"); card.className = "fis-input-style-card";
        liveRow(card, "开关", liveSwitch(avatarStyle.enabled, "头像设置开关", checked => {
          avatarStyle.enabled = checked; persist(); apply(); renderFloating();
        }));
        const panel = document.createElement("div"); panel.className = "fis-input-style-body" + (avatarStyle.enabled ? "" : " disabled");

        const targets = document.createElement("div"); targets.className = "fis-input-targets fis-choice-chips";
        for (const [key, labelText] of AVATAR_TARGETS) {
          const option = document.createElement("label"); option.className = "fis-input-target";
          const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = avatarStyle.applyTargets.includes(key);
          checkbox.addEventListener("change", () => {
            if (checkbox.checked && !avatarStyle.applyTargets.includes(key)) avatarStyle.applyTargets.push(key);
            if (!checkbox.checked) avatarStyle.applyTargets = avatarStyle.applyTargets.filter(item => item !== key);
            persist(); apply();
          });
          option.append(checkbox, document.createTextNode(labelText)); targets.appendChild(option);
        }
        liveRow(panel, "范围", targets);
        liveRow(panel, "圆角", liveRange(avatarStyle, "radius", 0, 50, 1, "%", true, value => {
          root.style.setProperty("--fis-avatar-radius", `${value}%`);
        }));

        const borderFeature = document.createElement("section"); borderFeature.className = "fis-input-feature";
        const borderHead = document.createElement("div"); borderHead.className = "fis-input-feature-head";
        const borderTitle = document.createElement("div"); borderTitle.className = "fis-region-name"; borderTitle.textContent = "边框";
        borderHead.append(borderTitle, liveSwitch(avatarStyle.borderEnabled, "启用头像边框", checked => {
          avatarStyle.borderEnabled = checked; persist(); apply(); renderFloating();
        }));
        const borderBody = document.createElement("div"); borderBody.className = "fis-input-feature-body" + (avatarStyle.borderEnabled ? "" : " disabled");
        liveRow(borderBody, "粗细", liveRange(avatarStyle, "borderWidth", 0, 8, 0.5, "px", true, value => {
          root.style.setProperty("--fis-avatar-border-width", `${value}px`);
        }));
        const avatarBorderPair = document.createElement("div"); avatarBorderPair.className = "fis-color-pair";
        const avatarBorderPicker = document.createElement("input"); avatarBorderPicker.type = "color"; avatarBorderPicker.value = avatarStyle.borderColor;
        const avatarBorderText = document.createElement("input"); avatarBorderText.type = "text"; avatarBorderText.className = "fis-number"; avatarBorderText.maxLength = 7; avatarBorderText.value = avatarStyle.borderColor.toUpperCase();
        const updateAvatarBorder = (color, commit = true) => {
          if (!/^#[0-9a-f]{6}$/i.test(color)) return;
          avatarStyle.borderColor = color.toLowerCase(); avatarBorderPicker.value = avatarStyle.borderColor; avatarBorderText.value = avatarStyle.borderColor.toUpperCase();
          root.style.setProperty("--fis-avatar-border-color", avatarStyle.borderColor);
          if (commit) { persist(); apply(); }
        };
        avatarBorderPicker.addEventListener("input", () => updateAvatarBorder(avatarBorderPicker.value, false));
        avatarBorderPicker.addEventListener("change", () => updateAvatarBorder(avatarBorderPicker.value, true));
        avatarBorderText.addEventListener("change", () => updateAvatarBorder(avatarBorderText.value));
        avatarBorderText.addEventListener("blur", () => { avatarBorderText.value = avatarStyle.borderColor.toUpperCase(); });
        avatarBorderPair.append(avatarBorderPicker, avatarBorderText); liveRow(borderBody, "颜色", avatarBorderPair);
        borderFeature.append(borderHead, borderBody); panel.appendChild(borderFeature);

        const headerFeature = document.createElement("section"); headerFeature.className = "fis-input-feature";
        const headerHead = document.createElement("div"); headerHead.className = "fis-input-feature-head";
        const headerTitle = document.createElement("div"); headerTitle.className = "fis-region-name"; headerTitle.textContent = "顶部栏";
        headerHead.appendChild(headerTitle);
        const headerBody = document.createElement("div"); headerBody.className = "fis-input-feature-body";
        const alignSelect = document.createElement("div"); alignSelect.className = "fis-input-targets fis-choice-chips";
        for (const [value, labelText] of [["center", "居中"], ["left", "靠左"]]) {
          const option = document.createElement("label"); option.className = "fis-input-target";
          const radio = document.createElement("input"); radio.type = "radio"; radio.name = "fis-chat-header-align"; radio.value = value; radio.checked = avatarStyle.headerTitleAlign === value;
          radio.addEventListener("change", () => {
            if (!radio.checked) return;
            avatarStyle.headerTitleAlign = value; persist(); apply();
          });
          option.append(radio, document.createTextNode(labelText)); alignSelect.appendChild(option);
        }
        liveRow(headerBody, "角色名", alignSelect);
        const sizeRow = document.createElement("div"); sizeRow.className = avatarStyle.headerAvatarVisible || avatarStyle.headerUserAvatarVisible ? "" : "disabled";
        liveRow(sizeRow, "大小", liveRange(avatarStyle, "headerAvatarSize", 20, 40, 1, "px", true, value => {
          root.style.setProperty("--fis-chat-header-avatar-size", `${value}px`);
        }));
        headerBody.appendChild(sizeRow);

        liveRow(headerBody, "角色头像", liveSwitch(avatarStyle.headerAvatarVisible, "显示顶部栏角色头像", checked => {
          avatarStyle.headerAvatarVisible = checked; persist(); apply(); renderFloating();
        }));
        const rolePosition = document.createElement("div"); rolePosition.className = avatarStyle.headerAvatarVisible ? "" : "disabled";
        liveRow(rolePosition, "角色水平", liveRange(avatarStyle, "headerAvatarOffsetX", -400, 400, 1, "px", true, value => {
          root.style.setProperty("--fis-chat-header-avatar-x", `${value}px`);
        }));
        liveRow(rolePosition, "角色垂直", liveRange(avatarStyle, "headerAvatarOffsetY", -160, 160, 1, "px", true, value => {
          root.style.setProperty("--fis-chat-header-avatar-y", `${value}px`);
        }));
        headerBody.appendChild(rolePosition);

        liveRow(headerBody, "用户头像", liveSwitch(avatarStyle.headerUserAvatarVisible, "显示顶部栏用户头像", checked => {
          avatarStyle.headerUserAvatarVisible = checked; persist(); apply(); renderFloating();
        }));
        const userPosition = document.createElement("div"); userPosition.className = avatarStyle.headerUserAvatarVisible ? "" : "disabled";
        liveRow(userPosition, "用户水平", liveRange(avatarStyle, "headerUserAvatarOffsetX", -400, 400, 1, "px", true, value => {
          root.style.setProperty("--fis-chat-header-user-avatar-x", `${value}px`);
        }));
        liveRow(userPosition, "用户垂直", liveRange(avatarStyle, "headerUserAvatarOffsetY", -160, 160, 1, "px", true, value => {
          root.style.setProperty("--fis-chat-header-user-avatar-y", `${value}px`);
        }));
        headerBody.appendChild(userPosition);
        headerFeature.append(headerHead, headerBody); panel.appendChild(headerFeature);

        const chatFeature = document.createElement("section"); chatFeature.className = "fis-input-feature";
        const chatHead = document.createElement("div"); chatHead.className = "fis-input-feature-head";
        const chatTitle = document.createElement("div"); chatTitle.className = "fis-region-name"; chatTitle.textContent = "聊天";
        chatHead.appendChild(chatTitle);
        const chatBody = document.createElement("div"); chatBody.className = "fis-input-feature-body";
        const visibleTargets = document.createElement("div"); visibleTargets.className = "fis-input-targets fis-choice-chips";
        for (const [key, labelText] of [["chatUserVisible", "用户"], ["chatRoleVisible", "角色"]]) {
          const option = document.createElement("label"); option.className = "fis-input-target";
          const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = avatarStyle[key];
          checkbox.addEventListener("change", () => { avatarStyle[key] = checkbox.checked; persist(); apply(); });
          option.append(checkbox, document.createTextNode(labelText)); visibleTargets.appendChild(option);
        }
        liveRow(chatBody, "显示", visibleTargets); chatFeature.append(chatHead, chatBody); panel.appendChild(chatFeature);
        card.appendChild(panel); interfaceWorkspace.appendChild(card);
      }

      if (floatingPage === "interface" && floatingInterfacePage === "thought") {
        const thoughtStyle = state.thoughtStyle;
        const card = document.createElement("section"); card.className = "fis-input-style-card";
        liveRow(card, "开关", liveSwitch(thoughtStyle.enabled, "心声设置开关", checked => {
          thoughtStyle.enabled = checked; commitThoughtStyle(); renderFloating();
        }));
        const panel = document.createElement("div"); panel.className = "fis-input-style-body" + (thoughtStyle.enabled ? "" : " disabled");

        const appendThoughtColor = (target, label, key, cssVariable, previewValue = null) => {
          const pair = document.createElement("div"); pair.className = "fis-color-pair";
          const picker = document.createElement("input"); picker.type = "color"; picker.value = target[key];
          const textInput = document.createElement("input"); textInput.type = "text"; textInput.className = "fis-number"; textInput.maxLength = 7; textInput.value = target[key].toUpperCase();
          const update = (color, commit = true) => {
            if (!/^#[0-9a-f]{6}$/i.test(color)) return;
            target[key] = color.toLowerCase(); picker.value = target[key]; textInput.value = target[key].toUpperCase();
            root.style.setProperty(cssVariable, previewValue ? previewValue(target[key]) : target[key]);
            if (commit) commitThoughtStyle();
          };
          picker.addEventListener("input", () => update(picker.value, false));
          picker.addEventListener("change", () => update(picker.value, true));
          textInput.addEventListener("change", () => update(textInput.value));
          textInput.addEventListener("blur", () => { textInput.value = target[key].toUpperCase(); });
          pair.append(picker, textInput); liveRow(panel, label, pair);
        };

        appendThoughtColor(thoughtStyle, "背景", "backgroundColor", "--fis-thought-background", color => colorWithOpacity(color, thoughtStyle.backgroundOpacity));
        liveRow(panel, "透明", liveRange(thoughtStyle, "backgroundOpacity", 0, 100, 1, "%", true, value => {
          root.style.setProperty("--fis-thought-background", colorWithOpacity(thoughtStyle.backgroundColor, value));
        }, commitThoughtStyle));
        liveRow(panel, "圆角", liveRange(thoughtStyle, "radius", 0, 50, 1, "px", true, value => {
          root.style.setProperty("--fis-thought-radius", `${value}px`);
        }, commitThoughtStyle));
        appendThoughtColor(thoughtStyle, "标题", "titleColor", "--fis-thought-title-color");
        appendThoughtColor(thoughtStyle, "文字", "textColor", "--fis-thought-text-color");

        const borderFeature = document.createElement("section"); borderFeature.className = "fis-input-feature";
        const borderHead = document.createElement("div"); borderHead.className = "fis-input-feature-head";
        const borderTitle = document.createElement("div"); borderTitle.className = "fis-region-name"; borderTitle.textContent = "边框";
        borderHead.append(borderTitle, liveSwitch(thoughtStyle.borderVisible, "显示心声边框", checked => {
          thoughtStyle.borderVisible = checked; commitThoughtStyle(); renderFloating();
        }));
        const borderBody = document.createElement("div"); borderBody.className = "fis-input-feature-body" + (thoughtStyle.borderVisible ? "" : " disabled");
        liveRow(borderBody, "粗细", liveRange(thoughtStyle, "borderWidth", 0.5, 8, 0.5, "px", true, value => {
          root.style.setProperty("--fis-thought-border-width", `${value}px`);
        }, commitThoughtStyle));
        const appendNestedColor = (container, label, key, cssVariable) => {
          const pair = document.createElement("div"); pair.className = "fis-color-pair";
          const picker = document.createElement("input"); picker.type = "color"; picker.value = thoughtStyle[key];
          const textInput = document.createElement("input"); textInput.type = "text"; textInput.className = "fis-number"; textInput.maxLength = 7; textInput.value = thoughtStyle[key].toUpperCase();
          const update = (color, commit = true) => {
            if (!/^#[0-9a-f]{6}$/i.test(color)) return;
            thoughtStyle[key] = color.toLowerCase(); picker.value = thoughtStyle[key]; textInput.value = thoughtStyle[key].toUpperCase();
            root.style.setProperty(cssVariable, thoughtStyle[key]);
            if (commit) commitThoughtStyle();
          };
          picker.addEventListener("input", () => update(picker.value, false));
          picker.addEventListener("change", () => update(picker.value, true));
          textInput.addEventListener("change", () => update(textInput.value));
          textInput.addEventListener("blur", () => { textInput.value = thoughtStyle[key].toUpperCase(); });
          pair.append(picker, textInput); liveRow(container, label, pair);
        };
        appendNestedColor(borderBody, "颜色", "borderColor", "--fis-thought-border-color");
        borderFeature.append(borderHead, borderBody); panel.appendChild(borderFeature);

        const tapeFeature = document.createElement("section"); tapeFeature.className = "fis-input-feature";
        const tapeHead = document.createElement("div"); tapeHead.className = "fis-input-feature-head";
        const tapeTitle = document.createElement("div"); tapeTitle.className = "fis-region-name"; tapeTitle.textContent = "胶带";
        tapeHead.append(tapeTitle, liveSwitch(thoughtStyle.tapeVisible, "显示心声胶带", checked => {
          thoughtStyle.tapeVisible = checked; commitThoughtStyle(); renderFloating();
        }));
        const tapeBody = document.createElement("div"); tapeBody.className = "fis-input-feature-body" + (thoughtStyle.tapeVisible ? "" : " disabled");
        appendNestedColor(tapeBody, "左侧", "tapeLeftColor", "--fis-thought-tape-left");
        appendNestedColor(tapeBody, "右侧", "tapeRightColor", "--fis-thought-tape-right");
        tapeFeature.append(tapeHead, tapeBody); panel.appendChild(tapeFeature);

        const valuesFeature = document.createElement("section"); valuesFeature.className = "fis-input-feature";
        const valuesHead = document.createElement("div"); valuesHead.className = "fis-input-feature-head";
        const valuesTitle = document.createElement("div"); valuesTitle.className = "fis-region-name"; valuesTitle.textContent = "数值条";
        valuesHead.appendChild(valuesTitle);
        const valuesBody = document.createElement("div"); valuesBody.className = "fis-input-feature-body";
        appendNestedColor(valuesBody, "轨道", "valueTrackColor", "--fis-thought-value-track");
        appendNestedColor(valuesBody, "数值", "valueFillColor", "--fis-thought-value-fill");
        valuesFeature.append(valuesHead, valuesBody); panel.appendChild(valuesFeature);

        const iconFeature = document.createElement("section"); iconFeature.className = "fis-input-feature";
        const iconHead = document.createElement("div"); iconHead.className = "fis-input-feature-head";
        const iconTitle = document.createElement("div"); iconTitle.className = "fis-region-name"; iconTitle.textContent = "心声符号";
        iconHead.appendChild(iconTitle);
        const iconBody = document.createElement("div"); iconBody.className = "fis-input-feature-body";
        appendNestedColor(iconBody, "颜色", "iconColor", "--fis-thought-icon-color");
        liveRow(iconBody, "水平", liveRange(thoughtStyle, "iconOffsetX", -400, 400, 1, "px", true, value => {
          root.style.setProperty("--fis-thought-icon-x", `${value}px`);
        }, commitThoughtStyle));
        liveRow(iconBody, "垂直", liveRange(thoughtStyle, "iconOffsetY", -160, 160, 1, "px", true, value => {
          root.style.setProperty("--fis-thought-icon-y", `${value}px`);
        }, commitThoughtStyle));
        iconFeature.append(iconHead, iconBody); panel.appendChild(iconFeature);

        card.appendChild(panel); interfaceWorkspace.appendChild(card);
      }

      if (floatingPage === "interface" && floatingInterfacePage === "translation") {
        const translationStyle = state.translationStyle;
        const card = document.createElement("section"); card.className = "fis-input-style-card";
        liveRow(card, "开关", liveSwitch(translationStyle.enabled, "翻译显示设置开关", checked => {
          translationStyle.enabled = checked; commitTranslationStyle(); renderFloating();
        }));
        const panel = document.createElement("div"); panel.className = "fis-input-style-body" + (translationStyle.enabled ? "" : " disabled");
        const appendTranslationColor = (container, label, key, cssVariable) => {
          const pair = document.createElement("div"); pair.className = "fis-color-pair";
          const picker = document.createElement("input"); picker.type = "color"; picker.value = translationStyle[key];
          const textInput = document.createElement("input"); textInput.type = "text"; textInput.className = "fis-number"; textInput.maxLength = 7; textInput.value = translationStyle[key].toUpperCase();
          const update = (color, commit = true) => {
            if (!/^#[0-9a-f]{6}$/i.test(color)) return;
            translationStyle[key] = color.toLowerCase(); picker.value = translationStyle[key]; textInput.value = translationStyle[key].toUpperCase();
            root.style.setProperty(cssVariable, translationStyle[key]);
            if (commit) commitTranslationStyle();
          };
          picker.addEventListener("input", () => update(picker.value, false));
          picker.addEventListener("change", () => update(picker.value, true));
          textInput.addEventListener("change", () => update(textInput.value));
          textInput.addEventListener("blur", () => { textInput.value = translationStyle[key].toUpperCase(); });
          pair.append(picker, textInput); liveRow(container, label, pair);
        };
        liveRow(panel, "常显", liveSwitch(translationStyle.alwaysVisible, "始终展开中文翻译", checked => {
          translationStyle.alwaysVisible = checked; commitTranslationStyle(); renderFloating();
        }));
        const layoutSelect = document.createElement("div"); layoutSelect.className = "fis-input-targets fis-choice-chips";
        for (const [value, labelText] of [["inside", "气泡内"], ["outside", "气泡外"]]) {
          const option = document.createElement("label"); option.className = "fis-input-target";
          const radio = document.createElement("input"); radio.type = "radio"; radio.name = "fis-translation-layout"; radio.value = value; radio.checked = translationStyle.layoutMode === value;
          radio.addEventListener("change", () => {
            if (!radio.checked) return;
            translationStyle.layoutMode = value; commitTranslationStyle();
          });
          option.append(radio, document.createTextNode(labelText)); layoutSelect.appendChild(option);
        }
        liveRow(panel, "模式", layoutSelect);
        liveRow(panel, "分隔线", liveSwitch(translationStyle.dividerVisible, "显示原文与译文分隔线", checked => {
          translationStyle.dividerVisible = checked; commitTranslationStyle();
        }));
        liveRow(panel, "粗体", liveSwitch(translationStyle.bold, "翻译使用粗体", checked => {
          translationStyle.bold = checked; commitTranslationStyle();
        }));

        const colorPair = document.createElement("div"); colorPair.className = "fis-color-pair";
        const colorPicker = document.createElement("input"); colorPicker.type = "color"; colorPicker.value = translationStyle.color;
        const colorText = document.createElement("input"); colorText.type = "text"; colorText.className = "fis-number"; colorText.maxLength = 7; colorText.value = translationStyle.color.toUpperCase();
        const updateTranslationColor = (color, commit = true) => {
          if (!/^#[0-9a-f]{6}$/i.test(color)) return;
          translationStyle.color = color.toLowerCase(); colorPicker.value = translationStyle.color; colorText.value = translationStyle.color.toUpperCase();
          root.style.setProperty("--fis-translation-color", translationStyle.color);
          if (commit) commitTranslationStyle();
        };
        colorPicker.addEventListener("input", () => updateTranslationColor(colorPicker.value, false));
        colorPicker.addEventListener("change", () => updateTranslationColor(colorPicker.value, true));
        colorText.addEventListener("change", () => updateTranslationColor(colorText.value));
        colorText.addEventListener("blur", () => { colorText.value = translationStyle.color.toUpperCase(); });
        colorPair.append(colorPicker, colorText); liveRow(panel, "颜色", colorPair);
        liveRow(panel, "阴影", liveSwitch(translationStyle.shadowEnabled, "显示译文文字阴影", checked => {
          translationStyle.shadowEnabled = checked; commitTranslationStyle();
        }));
        const shadowPair = document.createElement("div"); shadowPair.className = "fis-color-pair";
        const shadowPicker = document.createElement("input"); shadowPicker.type = "color"; shadowPicker.value = translationStyle.shadowColor;
        const shadowText = document.createElement("input"); shadowText.type = "text"; shadowText.className = "fis-number"; shadowText.maxLength = 7; shadowText.value = translationStyle.shadowColor.toUpperCase();
        const updateTranslationShadow = (color, commit = true) => {
          if (!/^#[0-9a-f]{6}$/i.test(color)) return;
          translationStyle.shadowColor = color.toLowerCase(); shadowPicker.value = translationStyle.shadowColor; shadowText.value = translationStyle.shadowColor.toUpperCase();
          root.style.setProperty("--fis-translation-shadow", translationStyle.shadowColor);
          if (commit) commitTranslationStyle();
        };
        shadowPicker.addEventListener("input", () => updateTranslationShadow(shadowPicker.value, false));
        shadowPicker.addEventListener("change", () => updateTranslationShadow(shadowPicker.value, true));
        shadowText.addEventListener("change", () => updateTranslationShadow(shadowText.value));
        shadowText.addEventListener("blur", () => { shadowText.value = translationStyle.shadowColor.toUpperCase(); });
        shadowPair.append(shadowPicker, shadowText); liveRow(panel, "阴影色", shadowPair);
        liveRow(panel, "大小", liveRange(translationStyle, "size", 60, 160, 1, "%", true, value => {
          root.style.setProperty("--fis-translation-size", `${value / 100}em`);
        }, commitTranslationStyle));
        liveRow(panel, "水平", liveRange(translationStyle, "offsetX", -400, 400, 1, "px", true, value => {
          root.style.setProperty("--fis-translation-x", `${value}px`);
        }, commitTranslationStyle));
        liveRow(panel, "垂直", liveRange(translationStyle, "offsetY", -160, 160, 1, "px", true, value => {
          root.style.setProperty("--fis-translation-y", `${value}px`);
        }, commitTranslationStyle));

        const backgroundFeature = document.createElement("section"); backgroundFeature.className = "fis-input-feature";
        const backgroundHead = document.createElement("div"); backgroundHead.className = "fis-input-feature-head";
        const backgroundTitle = document.createElement("div"); backgroundTitle.className = "fis-region-name"; backgroundTitle.textContent = "背景";
        backgroundHead.append(backgroundTitle, liveSwitch(translationStyle.backgroundEnabled, "显示译文背景", checked => {
          translationStyle.backgroundEnabled = checked; commitTranslationStyle(); renderFloating();
        }));
        const backgroundBody = document.createElement("div"); backgroundBody.className = "fis-input-feature-body" + (translationStyle.backgroundEnabled ? "" : " disabled");
        appendTranslationColor(backgroundBody, "颜色", "backgroundColor", "--fis-translation-background");
        liveRow(backgroundBody, "圆角", liveRange(translationStyle, "backgroundRadius", 0, 50, 1, "px", true, value => {
          root.style.setProperty("--fis-translation-background-radius", `${value}px`);
        }, commitTranslationStyle));
        backgroundFeature.append(backgroundHead, backgroundBody); panel.appendChild(backgroundFeature);

        const voiceFeature = document.createElement("section"); voiceFeature.className = "fis-input-feature";
        const voiceHead = document.createElement("div"); voiceHead.className = "fis-input-feature-head";
        const voiceTitle = document.createElement("div"); voiceTitle.className = "fis-region-name"; voiceTitle.textContent = "语音";
        voiceHead.appendChild(voiceTitle);
        const voiceBody = document.createElement("div"); voiceBody.className = "fis-input-feature-body";
        liveRow(voiceBody, "背景", liveSwitch(translationStyle.voiceBackgroundEnabled, "显示语音译文背景", checked => {
          translationStyle.voiceBackgroundEnabled = checked; commitTranslationStyle(); renderFloating();
        }));
        const voiceBackgroundBody = document.createElement("div"); voiceBackgroundBody.className = "fis-input-feature-body" + (translationStyle.voiceBackgroundEnabled ? "" : " disabled");
        appendTranslationColor(voiceBackgroundBody, "颜色", "voiceBackgroundColor", "--fis-voice-translation-background");
        liveRow(voiceBackgroundBody, "圆角", liveRange(translationStyle, "voiceBackgroundRadius", 0, 50, 1, "px", true, value => {
          root.style.setProperty("--fis-voice-translation-background-radius", `${value}px`);
        }, commitTranslationStyle));
        voiceBody.appendChild(voiceBackgroundBody);
        liveRow(voiceBody, "水平", liveRange(translationStyle, "voiceOffsetX", -400, 400, 1, "px", true, value => {
          root.style.setProperty("--fis-voice-translation-x", `${value}px`);
        }, commitTranslationStyle));
        liveRow(voiceBody, "垂直", liveRange(translationStyle, "voiceOffsetY", -160, 160, 1, "px", true, value => {
          root.style.setProperty("--fis-voice-translation-y", `${value}px`);
        }, commitTranslationStyle));
        voiceFeature.append(voiceHead, voiceBody); panel.appendChild(voiceFeature);
        const hint = document.createElement("div"); hint.className = "fis-region-hint"; hint.textContent = "常显会自动展开译文；文字阴影仅在气泡外模式生效。"; panel.appendChild(hint);
        card.appendChild(panel); interfaceWorkspace.appendChild(card);
      }

      if (floatingPage === "interface" && floatingInterfacePage === "toolbar") {
        const toolbarStyle = state.toolbarStyle;
        if (!toolbarStyle.items[floatingToolbarIconKey]) floatingToolbarIconKey = TOOLBAR_ICON_DEFS[0][0];
        const item = toolbarStyle.items[floatingToolbarIconKey];
        const card = document.createElement("section"); card.className = "fis-input-style-card";
        liveRow(card, "开关", liveSwitch(toolbarStyle.enabled, "工具栏设置开关", checked => {
          toolbarStyle.enabled = checked; persist(); apply(); renderFloating();
        }));
        const panel = document.createElement("div"); panel.className = "fis-input-style-body" + (toolbarStyle.enabled ? "" : " disabled");
        liveRow(panel, "合并表情", liveSwitch(toolbarStyle.mergeExpressions, "合并自带与导入表情", checked => {
          toolbarStyle.mergeExpressions = checked; persist(); apply(); renderFloating();
        }));
        liveRow(panel, "隐藏自带", liveSwitch(toolbarStyle.hideBuiltinEmojis, "隐藏特效以外的自带表情", checked => {
          toolbarStyle.hideBuiltinEmojis = checked; persist(); apply(); renderFloating();
        }));
        const hint = document.createElement("div"); hint.className = "fis-region-hint"; hint.textContent = "导入分组接在自带分类后；隐藏自带时保留特效。"; panel.appendChild(hint);
        const appendIconTabs = (label, defs) => {
          const iconTabs = document.createElement("div"); iconTabs.className = "fis-input-targets fis-choice-chips";
          for (const [key, labelText] of defs) {
            const option = document.createElement("label"); option.className = "fis-input-target";
            const radio = document.createElement("input"); radio.type = "radio"; radio.name = "fis-toolbar-icon"; radio.checked = key === floatingToolbarIconKey;
            radio.addEventListener("change", () => { if (radio.checked) { floatingToolbarIconKey = key; renderFloating(); } });
            option.append(radio, document.createTextNode(labelText)); iconTabs.appendChild(option);
          }
          liveRow(panel, label, iconTabs);
        };
        appendIconTabs("线上", ONLINE_TOOLBAR_ICON_DEFS);
        appendIconTabs("线下", OFFLINE_TOOLBAR_ICON_DEFS);
        liveRow(panel, "显示", liveSwitch(item.visible, "显示当前图标", checked => {
          item.visible = checked; persist(); apply(); renderFloating();
        }));
        liveRow(panel, "水平", liveRange(item, "offsetX", -400, 400, 1, "px", true, value => {
          root.style.setProperty(`--fis-tool-${toolbarIconSuffix(floatingToolbarIconKey)}-x`, `${value}px`);
        }));
        liveRow(panel, "垂直", liveRange(item, "offsetY", -120, 120, 1, "px", true, value => {
          root.style.setProperty(`--fis-tool-${toolbarIconSuffix(floatingToolbarIconKey)}-y`, `${value}px`);
        }));
        card.appendChild(panel); interfaceWorkspace.appendChild(card);
      }

      if (floatingPage === "interface" && floatingInterfacePage === "buttons") {
        const buttonStyle = state.buttonStyle;
        const card = document.createElement("section"); card.className = "fis-input-style-card";
        liveRow(card, "开关", liveSwitch(buttonStyle.enabled, "按钮开关", checked => {
          buttonStyle.enabled = checked; persist(); apply(); renderFloating();
        }));
        const panel = document.createElement("div"); panel.className = "fis-input-style-body" + (buttonStyle.enabled ? "" : " disabled");
        const targets = document.createElement("div"); targets.className = "fis-input-targets fis-choice-chips";
        for (const [key, labelText] of BUTTON_STYLE_TARGETS) {
          const option = document.createElement("label"); option.className = "fis-input-target";
          const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = buttonStyle.applyTargets.includes(key);
          checkbox.addEventListener("change", () => {
            if (checkbox.checked && !buttonStyle.applyTargets.includes(key)) buttonStyle.applyTargets.push(key);
            if (!checkbox.checked) buttonStyle.applyTargets = buttonStyle.applyTargets.filter(item => item !== key);
            persist(); apply();
          });
          const label = document.createElement("span"); label.textContent = labelText;
          option.append(checkbox, label); targets.appendChild(option);
        }
        liveRow(panel, "范围", targets);

        const borderOptions = document.createElement("div"); borderOptions.className = "fis-input-targets";
        const borderlessOption = document.createElement("label"); borderlessOption.className = "fis-input-target";
        const borderless = document.createElement("input"); borderless.type = "checkbox"; borderless.checked = buttonStyle.borderless;
        borderless.addEventListener("change", () => { buttonStyle.borderless = borderless.checked; persist(); apply(); renderFloating(); });
        borderlessOption.append(borderless, document.createTextNode("无边框")); borderOptions.appendChild(borderlessOption);
        liveRow(panel, "边框", borderOptions);
        liveRow(panel, "粗细", liveRange(buttonStyle, "borderWidth", 0.5, 6, 0.5, "px", true, () => previewButtonStyle(buttonStyle, "borderWidth")));
        liveRow(panel, "圆角", liveRange(buttonStyle, "radius", 0, 50, 1, "px", true, () => previewButtonStyle(buttonStyle, "radius")));

        const borderPair = document.createElement("div"); borderPair.className = "fis-color-pair";
        const borderPicker = document.createElement("input"); borderPicker.type = "color"; borderPicker.value = buttonStyle.borderColor;
        const borderText = document.createElement("input"); borderText.type = "text"; borderText.className = "fis-number"; borderText.maxLength = 7; borderText.value = buttonStyle.borderColor.toUpperCase();
        const updateBorder = (color, commit = true) => {
          if (!/^#[0-9a-f]{6}$/i.test(color)) return;
          buttonStyle.borderColor = color.toLowerCase(); borderPicker.value = buttonStyle.borderColor; borderText.value = buttonStyle.borderColor.toUpperCase();
          previewButtonStyle(buttonStyle, "borderColor");
          if (commit) { persist(); apply(); }
        };
        borderPicker.addEventListener("input", () => updateBorder(borderPicker.value, false));
        borderPicker.addEventListener("change", () => updateBorder(borderPicker.value, true));
        borderText.addEventListener("change", () => updateBorder(borderText.value));
        borderText.addEventListener("blur", () => { borderText.value = buttonStyle.borderColor.toUpperCase(); });
        borderPair.append(borderPicker, borderText); liveRow(panel, "边框", borderPair);

        const appendBackgroundControl = (label, colorKey, opacityKey) => {
          const pair = document.createElement("div"); pair.className = "fis-color-pair";
          const picker = document.createElement("input"); picker.type = "color"; picker.value = buttonStyle[colorKey];
          const textInput = document.createElement("input"); textInput.type = "text"; textInput.className = "fis-number"; textInput.maxLength = 7; textInput.value = buttonStyle[colorKey].toUpperCase();
          const update = (color, commit = true) => {
            if (!/^#[0-9a-f]{6}$/i.test(color)) return;
            buttonStyle[colorKey] = color.toLowerCase(); picker.value = buttonStyle[colorKey]; textInput.value = buttonStyle[colorKey].toUpperCase();
            previewButtonStyle(buttonStyle, colorKey);
            if (commit) { persist(); apply(); }
          };
          picker.addEventListener("input", () => update(picker.value, false));
          picker.addEventListener("change", () => update(picker.value, true));
          textInput.addEventListener("change", () => update(textInput.value));
          textInput.addEventListener("blur", () => { textInput.value = buttonStyle[colorKey].toUpperCase(); });
          pair.append(picker, textInput); liveRow(panel, label, pair);
          liveRow(panel, "透明", liveRange(buttonStyle, opacityKey, 0, 100, 1, "%", true, () => previewButtonStyle(buttonStyle, opacityKey)));
        };
        appendBackgroundControl("高亮", "accentColor", "accentOpacity");
        appendBackgroundControl("常态", "capsuleColor", "capsuleOpacity");
        card.appendChild(panel); interfaceWorkspace.appendChild(card);
      }

      if (floatingPage === "interface" && floatingInterfacePage === "cards") {
        const interfaceStyle = state.interfaceStyle;
        const card = document.createElement("section"); card.className = "fis-input-style-card";

        const cardFeature = document.createElement("section"); cardFeature.className = "fis-input-feature fis-card-feature";
        const cardFeatureHead = document.createElement("div"); cardFeatureHead.className = "fis-input-feature-head";
        const cardFeatureTitle = document.createElement("div"); cardFeatureTitle.className = "fis-region-name"; cardFeatureTitle.textContent = "开关";
        cardFeatureHead.append(cardFeatureTitle, liveSwitch(interfaceStyle.cardsEnabled, "主页部件开关", checked => {
          interfaceStyle.cardsEnabled = checked; persist(); apply(); renderFloating();
        }));
        const cardFeatureBody = document.createElement("div"); cardFeatureBody.className = "fis-input-feature-body" + (interfaceStyle.cardsEnabled ? "" : " disabled");
        const borderOptions = document.createElement("div"); borderOptions.className = "fis-input-targets";
        const borderlessOption = document.createElement("label"); borderlessOption.className = "fis-input-target";
        const borderless = document.createElement("input"); borderless.type = "checkbox"; borderless.checked = interfaceStyle.borderless;
        borderless.addEventListener("change", () => { interfaceStyle.borderless = borderless.checked; persist(); apply(); renderFloating(); });
        borderlessOption.append(borderless, document.createTextNode("无边框")); borderOptions.appendChild(borderlessOption);
        liveRow(cardFeatureBody, "边框", borderOptions);
        liveRow(cardFeatureBody, "粗细", liveRange(interfaceStyle, "borderWidth", 0.5, 6, 0.5, "px", true, () => previewCardStyle(interfaceStyle, "borderWidth")));
        liveRow(cardFeatureBody, "圆角", liveRange(interfaceStyle, "radius", 0, 50, 1, "px", true, () => previewCardStyle(interfaceStyle, "radius")));
        const borderPair = document.createElement("div"); borderPair.className = "fis-color-pair";
        const borderPicker = document.createElement("input"); borderPicker.type = "color"; borderPicker.value = interfaceStyle.borderColor;
        const borderText = document.createElement("input"); borderText.type = "text"; borderText.className = "fis-number"; borderText.maxLength = 7; borderText.value = interfaceStyle.borderColor.toUpperCase();
        const updateBorder = (color, commit = true) => {
          if (!/^#[0-9a-f]{6}$/i.test(color)) return;
          interfaceStyle.borderColor = color.toLowerCase(); borderPicker.value = interfaceStyle.borderColor; borderText.value = interfaceStyle.borderColor.toUpperCase();
          previewCardStyle(interfaceStyle, "borderColor");
          if (commit) { persist(); apply(); }
        };
        borderPicker.addEventListener("input", () => updateBorder(borderPicker.value, false));
        borderPicker.addEventListener("change", () => updateBorder(borderPicker.value, true));
        borderText.addEventListener("change", () => updateBorder(borderText.value));
        borderText.addEventListener("blur", () => { borderText.value = interfaceStyle.borderColor.toUpperCase(); });
        borderPair.append(borderPicker, borderText); liveRow(cardFeatureBody, "边框", borderPair);
        const backgroundPair = document.createElement("div"); backgroundPair.className = "fis-color-pair";
        const backgroundPicker = document.createElement("input"); backgroundPicker.type = "color"; backgroundPicker.value = interfaceStyle.backgroundColor;
        const backgroundText = document.createElement("input"); backgroundText.type = "text"; backgroundText.className = "fis-number"; backgroundText.maxLength = 7; backgroundText.value = interfaceStyle.backgroundColor.toUpperCase();
        const updateBackground = (color, commit = true) => {
          if (!/^#[0-9a-f]{6}$/i.test(color)) return;
          interfaceStyle.backgroundColor = color.toLowerCase(); backgroundPicker.value = interfaceStyle.backgroundColor; backgroundText.value = interfaceStyle.backgroundColor.toUpperCase();
          previewCardStyle(interfaceStyle, "backgroundColor");
          if (commit) { persist(); apply(); }
        };
        backgroundPicker.addEventListener("input", () => updateBackground(backgroundPicker.value, false));
        backgroundPicker.addEventListener("change", () => updateBackground(backgroundPicker.value, true));
        backgroundText.addEventListener("change", () => updateBackground(backgroundText.value));
        backgroundText.addEventListener("blur", () => { backgroundText.value = interfaceStyle.backgroundColor.toUpperCase(); });
        backgroundPair.append(backgroundPicker, backgroundText); liveRow(cardFeatureBody, "背景", backgroundPair);
        liveRow(cardFeatureBody, "透明", liveRange(interfaceStyle, "backgroundOpacity", 0, 100, 1, "%", true, () => previewCardStyle(interfaceStyle, "backgroundOpacity")));
        cardFeature.append(cardFeatureHead, cardFeatureBody); card.appendChild(cardFeature);

        interfaceWorkspace.appendChild(card);
      }

      if (floatingPage === "interface" && floatingInterfacePage === "inputs") {
        const inputStyle = state.inputStyle;
        const inputRegion = state.regions.inputField;
        const inputDef = REGION_DEFS.find(def => def.key === "inputField");
        const card = document.createElement("section"); card.className = "fis-input-style-card";
        const targets = document.createElement("div"); targets.className = "fis-input-targets fis-choice-chips";
        for (const [key, labelText] of INPUT_STYLE_TARGETS) {
          const option = document.createElement("label"); option.className = "fis-input-target";
          const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = inputStyle.applyTargets.includes(key);
          checkbox.addEventListener("change", () => {
            if (checkbox.checked && !inputStyle.applyTargets.includes(key)) inputStyle.applyTargets.push(key);
            if (!checkbox.checked) inputStyle.applyTargets = inputStyle.applyTargets.filter(item => item !== key);
            inputRegion.applyTargets = [...inputStyle.applyTargets];
            persist(); apply();
          });
          option.append(checkbox, document.createTextNode(labelText)); targets.appendChild(option);
        }
        liveRow(card, "范围", targets);

        const colorFeature = document.createElement("section"); colorFeature.className = "fis-input-feature";
        const colorFeatureHead = document.createElement("div"); colorFeatureHead.className = "fis-input-feature-head";
        const colorFeatureTitle = document.createElement("div"); colorFeatureTitle.className = "fis-region-name"; colorFeatureTitle.textContent = "颜色";
        colorFeatureHead.append(colorFeatureTitle, liveSwitch(inputStyle.backgroundMode === "color", "启用颜色", checked => {
          inputStyle.backgroundMode = checked ? "color" : (inputStyle.backgroundMode === "color" ? "none" : inputStyle.backgroundMode);
          persist(); apply(); renderFloating();
        }));
        const colorFeatureBody = document.createElement("div"); colorFeatureBody.className = "fis-input-feature-body" + (inputStyle.backgroundMode === "color" ? "" : " disabled");
        const backgroundColorPair = document.createElement("div"); backgroundColorPair.className = "fis-color-pair";
        const backgroundColorPicker = document.createElement("input"); backgroundColorPicker.type = "color"; backgroundColorPicker.value = inputStyle.backgroundColor;
        const backgroundColorText = document.createElement("input"); backgroundColorText.type = "text"; backgroundColorText.className = "fis-number"; backgroundColorText.maxLength = 7; backgroundColorText.value = inputStyle.backgroundColor.toUpperCase();
        const updateBackgroundColor = (color, commit = true) => {
          if (!/^#[0-9a-f]{6}$/i.test(color)) return;
          inputStyle.backgroundColor = color.toLowerCase(); backgroundColorPicker.value = inputStyle.backgroundColor; backgroundColorText.value = inputStyle.backgroundColor.toUpperCase();
          previewInputStyle(inputStyle, "backgroundColor");
          if (commit) { persist(); apply(); }
        };
        backgroundColorPicker.addEventListener("input", () => updateBackgroundColor(backgroundColorPicker.value, false));
        backgroundColorPicker.addEventListener("change", () => updateBackgroundColor(backgroundColorPicker.value, true));
        backgroundColorText.addEventListener("change", () => updateBackgroundColor(backgroundColorText.value));
        backgroundColorText.addEventListener("blur", () => { backgroundColorText.value = inputStyle.backgroundColor.toUpperCase(); });
        backgroundColorPair.append(backgroundColorPicker, backgroundColorText); liveRow(colorFeatureBody, "背景", backgroundColorPair);
        liveRow(colorFeatureBody, "透明", liveRange(inputStyle, "backgroundOpacity", 0, 100, 1, "%", true, () => previewInputStyle(inputStyle, "backgroundOpacity")));
        colorFeature.append(colorFeatureHead, colorFeatureBody); card.appendChild(colorFeature);

        const imageFeature = document.createElement("section"); imageFeature.className = "fis-input-feature";
        const imageFeatureHead = document.createElement("div"); imageFeatureHead.className = "fis-input-feature-head";
        const imageFeatureTitle = document.createElement("div"); imageFeatureTitle.className = "fis-region-name"; imageFeatureTitle.textContent = "图片";
        imageFeatureHead.append(imageFeatureTitle, liveSwitch(inputStyle.backgroundMode === "image", "启用图片", checked => {
          inputStyle.backgroundMode = checked ? "image" : (inputStyle.backgroundMode === "image" ? "none" : inputStyle.backgroundMode);
          persist(); apply(); renderFloating();
        }));
        const imageFeatureBody = document.createElement("div"); imageFeatureBody.className = "fis-input-feature-body" + (inputStyle.backgroundMode === "image" ? "" : " disabled");
        const imagePick = document.createElement("div"); imagePick.className = "fis-input-image-pick";
        const thumb = document.createElement("div"); thumb.className = "fis-thumb"; if (inputRegion.image) thumb.style.backgroundImage = cssUrl(inputRegion.image);
        const imageName = document.createElement("div"); imageName.className = "fis-file-name"; imageName.textContent = inputRegion.image ? (inputRegion.fileName || "已上传图片") : "尚未选择图片";
        const fileInput = document.createElement("input"); fileInput.type = "file"; fileInput.accept = "image/png,image/webp,image/jpeg"; fileInput.hidden = true;
        fileInput.addEventListener("change", () => {
          const file = fileInput.files && fileInput.files[0]; if (!file) return;
          const reader = new FileReader(); reader.onload = () => {
            inputRegion.image = String(reader.result || ""); inputRegion.fileName = file.name; inputStyle.backgroundMode = "image";
            persist(); apply(); renderFloating();
          }; reader.readAsDataURL(file);
        });
        const imageActions = document.createElement("div"); imageActions.className = "fis-region-actions";
        imageActions.append(liveButton("选择", "primary", () => fileInput.click()), liveButton("清除", "danger", () => {
          inputRegion.image = ""; inputRegion.fileName = ""; if (inputStyle.backgroundMode === "image") inputStyle.backgroundMode = "none";
          persist(); apply(); renderFloating();
        }), fileInput);
        imagePick.append(thumb, imageName, imageActions); imageFeatureBody.appendChild(imagePick);
        liveRow(imageFeatureBody, "缩放", liveRange(inputRegion, "scale", 0.1, 3, 0.05, "×", true, () => previewRegionGeometry(inputDef, inputRegion, "scale")));
        liveRow(imageFeatureBody, "模糊", liveRange(inputRegion, "blur", 0, 30, 1, "px", true));
        liveRow(imageFeatureBody, "水平", liveRange(inputRegion, "positionX", 0, 100, 1, "%", true, () => previewRegionGeometry(inputDef, inputRegion, "positionX")));
        liveRow(imageFeatureBody, "垂直", liveRange(inputRegion, "positionY", 0, 100, 1, "%", true, () => previewRegionGeometry(inputDef, inputRegion, "positionY")));
        imageFeature.append(imageFeatureHead, imageFeatureBody); card.appendChild(imageFeature);

        const shapeFeature = document.createElement("section"); shapeFeature.className = "fis-input-feature";
        const shapeFeatureHead = document.createElement("div"); shapeFeatureHead.className = "fis-input-feature-head";
        const shapeFeatureTitle = document.createElement("div"); shapeFeatureTitle.className = "fis-region-name"; shapeFeatureTitle.textContent = "样式";
        shapeFeatureHead.append(shapeFeatureTitle, liveSwitch(inputStyle.enabled, "启用样式", checked => {
          inputStyle.enabled = checked; persist(); apply(); renderFloating();
        }));
        const panel = document.createElement("div"); panel.className = "fis-input-feature-body" + (inputStyle.enabled ? "" : " disabled");
        const borderOptions = document.createElement("div"); borderOptions.className = "fis-input-targets";
        const borderlessOption = document.createElement("label"); borderlessOption.className = "fis-input-target";
        const borderless = document.createElement("input"); borderless.type = "checkbox"; borderless.checked = inputStyle.borderless;
        borderless.addEventListener("change", () => { inputStyle.borderless = borderless.checked; persist(); apply(); renderFloating(); });
        borderlessOption.append(borderless, document.createTextNode("无边框")); borderOptions.appendChild(borderlessOption);
        liveRow(panel, "边框", borderOptions);
        liveRow(panel, "粗细", liveRange(inputStyle, "borderWidth", 0.5, 6, 0.5, "px", true, () => previewInputStyle(inputStyle, "borderWidth")));
        liveRow(panel, "圆角", liveRange(inputStyle, "radius", 0, 50, 1, "px", true, () => previewInputStyle(inputStyle, "radius")));
        liveRow(panel, "宽度", liveRange(inputStyle, "chatWidth", 40, 100, 1, "%", true, () => previewInputStyle(inputStyle, "chatWidth")));
        const colorPair = document.createElement("div"); colorPair.className = "fis-color-pair";
        const colorPicker = document.createElement("input"); colorPicker.type = "color"; colorPicker.value = inputStyle.borderColor;
        const colorText = document.createElement("input"); colorText.type = "text"; colorText.className = "fis-number"; colorText.maxLength = 7; colorText.value = inputStyle.borderColor.toUpperCase();
        const updateBorderColor = (color, commit = true) => {
          if (!/^#[0-9a-f]{6}$/i.test(color)) return;
          inputStyle.borderColor = color.toLowerCase(); colorPicker.value = inputStyle.borderColor; colorText.value = inputStyle.borderColor.toUpperCase();
          previewInputStyle(inputStyle, "borderColor");
          if (commit) { persist(); apply(); }
        };
        colorPicker.addEventListener("input", () => updateBorderColor(colorPicker.value, false));
        colorPicker.addEventListener("change", () => updateBorderColor(colorPicker.value, true));
        colorText.addEventListener("change", () => updateBorderColor(colorText.value));
        colorText.addEventListener("blur", () => { colorText.value = inputStyle.borderColor.toUpperCase(); });
        colorPair.append(colorPicker, colorText); liveRow(panel, "边框", colorPair);
        shapeFeature.append(shapeFeatureHead, panel); card.appendChild(shapeFeature);

        const positionFeature = document.createElement("section"); positionFeature.className = "fis-input-feature";
        const positionHead = document.createElement("div"); positionHead.className = "fis-input-feature-head";
        const positionTitle = document.createElement("div"); positionTitle.className = "fis-region-name"; positionTitle.textContent = "位置";
        positionHead.append(positionTitle, liveSwitch(inputStyle.positionEnabled, "启用聊天输入框位置", checked => {
          inputStyle.positionEnabled = checked; persist(); apply(); renderFloating();
        }));
        const positionBody = document.createElement("div"); positionBody.className = "fis-input-feature-body" + (inputStyle.positionEnabled ? "" : " disabled");
        liveRow(positionBody, "水平", liveRange(inputStyle, "offsetX", -120, 120, 1, "px", true, value => {
          root.style.setProperty("--fis-chat-input-offset-x", `${value}px`);
        }));
        liveRow(positionBody, "垂直", liveRange(inputStyle, "offsetY", -120, 120, 1, "px", true, value => {
          root.style.setProperty("--fis-chat-input-offset-y", `${value}px`);
        }));
        positionFeature.append(positionHead, positionBody); card.appendChild(positionFeature); interfaceWorkspace.appendChild(card);
      }

      if (floatingPage === "images") {
        const imageSectionKeys = ["base", ...IMAGE_REGION_DEFS.map(def => def.key)];
        if (!imageSectionKeys.includes(floatingImageRegionKey)) floatingImageRegionKey = "base";
        const baseSelected = floatingImageRegionKey === "base";
        const sectionEnabled = baseSelected ? state.baseStyle.enabled : state.imagesEnabled;
        const workspace = document.createElement("div"); workspace.className = "fis-image-workspace" + (sectionEnabled ? "" : " disabled");
        const bar = document.createElement("div"); bar.className = "fis-subtab-bar";
        const imageTabs = document.createElement("div"); imageTabs.className = "fis-subtab-strip";
        const labels = { base: "基础", appBackground: "背景", topBar: "顶部栏", bottomBar: "底部栏" };
        for (const key of imageSectionKeys) {
          const tab = document.createElement("button"); tab.type = "button"; tab.className = "fis-image-tab" + (key === floatingImageRegionKey ? " active" : ""); tab.textContent = labels[key];
          tab.addEventListener("click", () => { floatingImageRegionKey = key; renderFloating(); }); imageTabs.appendChild(tab);
        }
        const switchBox = document.createElement("div"); switchBox.className = "fis-subtab-switch";
        switchBox.appendChild(baseSelected
          ? liveSwitch(state.baseStyle.enabled, "启用基础色", checked => { state.baseStyle.enabled = checked; persist(); apply(); renderFloating(); })
          : liveSwitch(state.imagesEnabled, "启用全部图片设置", checked => { state.imagesEnabled = checked; persist(); apply(); renderFloating(); }));
        bar.append(imageTabs, switchBox); workspace.appendChild(bar);
        if (baseSelected) {
          const card = document.createElement("section"); card.className = "fis-region";
          const panel = document.createElement("div"); panel.className = "fis-panel";
          const colorPair = document.createElement("div"); colorPair.className = "fis-color-pair";
          const colorPicker = document.createElement("input"); colorPicker.type = "color"; colorPicker.value = state.baseStyle.color;
          const colorText = document.createElement("input"); colorText.type = "text"; colorText.className = "fis-number"; colorText.maxLength = 7; colorText.value = state.baseStyle.color.toUpperCase();
          const updateBaseColor = (color, commit = true) => {
            if (!/^#[0-9a-f]{6}$/i.test(color)) return;
            state.baseStyle.color = color.toLowerCase(); colorPicker.value = state.baseStyle.color; colorText.value = state.baseStyle.color.toUpperCase();
            root.style.setProperty("--fis-base-color", state.baseStyle.color);
            if (commit) { persist(); apply(); }
          };
          colorPicker.addEventListener("input", () => updateBaseColor(colorPicker.value, false));
          colorPicker.addEventListener("change", () => updateBaseColor(colorPicker.value, true));
          colorText.addEventListener("change", () => updateBaseColor(colorText.value));
          colorText.addEventListener("blur", () => { colorText.value = state.baseStyle.color.toUpperCase(); });
          colorPair.append(colorPicker, colorText); liveRow(panel, "颜色", colorPair);
          const glassPair = document.createElement("div"); glassPair.className = "fis-color-pair";
          const glassPicker = document.createElement("input"); glassPicker.type = "color"; glassPicker.value = state.baseStyle.glassColor;
          const glassText = document.createElement("input"); glassText.type = "text"; glassText.className = "fis-number"; glassText.maxLength = 7; glassText.value = state.baseStyle.glassColor.toUpperCase();
          const updateGlassColor = (color, commit = true) => {
            if (!/^#[0-9a-f]{6}$/i.test(color)) return;
            state.baseStyle.glassColor = color.toLowerCase(); glassPicker.value = state.baseStyle.glassColor; glassText.value = state.baseStyle.glassColor.toUpperCase();
            root.style.setProperty("--fis-base-glass", colorWithOpacity(state.baseStyle.glassColor, state.baseStyle.glassOpacity));
            if (commit) { persist(); apply(); }
          };
          glassPicker.addEventListener("input", () => updateGlassColor(glassPicker.value, false));
          glassPicker.addEventListener("change", () => updateGlassColor(glassPicker.value, true));
          glassText.addEventListener("change", () => updateGlassColor(glassText.value));
          glassText.addEventListener("blur", () => { glassText.value = state.baseStyle.glassColor.toUpperCase(); });
          glassPair.append(glassPicker, glassText); liveRow(panel, "毛玻璃", glassPair);
          liveRow(panel, "透明", liveRange(state.baseStyle, "glassOpacity", 0, 100, 1, "%", true, () => {
            root.style.setProperty("--fis-base-glass", colorWithOpacity(state.baseStyle.glassColor, state.baseStyle.glassOpacity));
          }));
          const iconBackgroundPair = document.createElement("div"); iconBackgroundPair.className = "fis-color-pair";
          const iconBackgroundPicker = document.createElement("input"); iconBackgroundPicker.type = "color"; iconBackgroundPicker.value = state.baseStyle.toolIconBackground;
          const iconBackgroundText = document.createElement("input"); iconBackgroundText.type = "text"; iconBackgroundText.className = "fis-number"; iconBackgroundText.maxLength = 7; iconBackgroundText.value = state.baseStyle.toolIconBackground.toUpperCase();
          const updateIconBackground = (color, commit = true) => {
            if (!/^#[0-9a-f]{6}$/i.test(color)) return;
            state.baseStyle.toolIconBackground = color.toLowerCase(); iconBackgroundPicker.value = state.baseStyle.toolIconBackground; iconBackgroundText.value = state.baseStyle.toolIconBackground.toUpperCase();
            root.style.setProperty("--fis-tool-icon-background", state.baseStyle.toolIconBackground);
            if (commit) { persist(); apply(); }
          };
          iconBackgroundPicker.addEventListener("input", () => updateIconBackground(iconBackgroundPicker.value, false));
          iconBackgroundPicker.addEventListener("change", () => updateIconBackground(iconBackgroundPicker.value, true));
          iconBackgroundText.addEventListener("change", () => updateIconBackground(iconBackgroundText.value));
          iconBackgroundText.addEventListener("blur", () => { iconBackgroundText.value = state.baseStyle.toolIconBackground.toUpperCase(); });
          iconBackgroundPair.append(iconBackgroundPicker, iconBackgroundText); liveRow(panel, "图标背景", iconBackgroundPair);
          const targets = document.createElement("div"); targets.className = "fis-input-targets fis-choice-chips";
          for (const [key, labelText] of BASE_TARGETS) {
            const option = document.createElement("label"); option.className = "fis-input-target";
            const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = state.baseStyle.applyTargets.includes(key);
            checkbox.addEventListener("change", () => {
              if (checkbox.checked && !state.baseStyle.applyTargets.includes(key)) state.baseStyle.applyTargets.push(key);
              if (!checkbox.checked) state.baseStyle.applyTargets = state.baseStyle.applyTargets.filter(item => item !== key);
              persist(); apply();
            });
            option.append(checkbox, document.createTextNode(labelText)); targets.appendChild(option);
          }
          liveRow(panel, "范围", targets); card.appendChild(panel); workspace.appendChild(card);
        }
        const def = IMAGE_REGION_DEFS.find(item => item.key === floatingImageRegionKey);
        if (def) {
          const region = state.regions[def.key];
          const card = document.createElement("section"); card.className = "fis-region";
          const summary = document.createElement("div"); summary.className = "fis-region-summary";
          const enabled = document.createElement("input"); enabled.type = "checkbox"; enabled.className = "fis-region-enabled"; enabled.checked = region.enabled; enabled.title = "启用区域";
          enabled.addEventListener("change", () => { region.enabled = enabled.checked; persist(); apply(); });
          const thumb = document.createElement("div"); thumb.className = "fis-thumb"; if (region.image) thumb.style.backgroundImage = cssUrl(region.image);
          const copy = document.createElement("div");
          const name = document.createElement("div"); name.className = "fis-region-name"; name.textContent = def.label;
          const hint = document.createElement("div"); hint.className = "fis-region-hint"; hint.textContent = region.image ? (region.fileName || "已上传图片") : def.hint;
          copy.append(name, hint);
          const fileInput = document.createElement("input"); fileInput.type = "file"; fileInput.accept = "image/png,image/webp,image/jpeg"; fileInput.hidden = true;
          fileInput.addEventListener("change", () => {
            const file = fileInput.files && fileInput.files[0]; if (!file) return;
            const reader = new FileReader(); reader.onload = () => { region.image = String(reader.result || ""); region.fileName = file.name; persist(); apply(); renderFloating(); }; reader.readAsDataURL(file);
          });
          const actions = document.createElement("div"); actions.className = "fis-region-actions";
          actions.append(liveButton("选择", "primary", () => fileInput.click()), liveButton("清除", "danger", () => { region.image = ""; region.fileName = ""; persist(); apply(); renderFloating(); }), fileInput);
          summary.append(enabled, thumb, copy, actions); card.appendChild(summary);
          const panel = document.createElement("div"); panel.className = "fis-panel";
          if (def.targets) {
            const targets = document.createElement("div"); targets.className = "fis-input-targets fis-choice-chips";
            for (const [key, labelText] of def.targets) {
              const option = document.createElement("label"); option.className = "fis-input-target";
              const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = region.applyTargets.includes(key);
              checkbox.addEventListener("change", () => {
                if (checkbox.checked && !region.applyTargets.includes(key)) region.applyTargets.push(key);
                if (!checkbox.checked) region.applyTargets = region.applyTargets.filter(item => item !== key);
                persist(); apply();
                if (def.key === "bottomBar") renderFloating();
              });
              option.append(checkbox, document.createTextNode(labelText)); targets.appendChild(option);
            }
            liveRow(panel, "范围", targets);
          }
          if (def.key === "bottomBar") {
            for (const [targetKey, labelText, suffix] of [["inputBar", "聊天界面", "input"], ["tabBar", "主界面", "tab"]]) {
              const feature = document.createElement("section"); feature.className = "fis-input-feature";
              const featureHead = document.createElement("div"); featureHead.className = "fis-input-feature-head";
              const featureTitle = document.createElement("div"); featureTitle.className = "fis-region-name"; featureTitle.textContent = labelText;
              featureHead.appendChild(featureTitle);
              const settings = region.targetSettings[targetKey];
              const featureBody = document.createElement("div"); featureBody.className = "fis-input-feature-body" + (region.applyTargets.includes(targetKey) ? "" : " disabled");
              const prefix = `--fis-bottom-bar-${suffix}`;
              liveRow(featureBody, "缩放", liveRange(settings, "scale", 0.1, 3, 0.05, "×", true, () => previewRegionGeometry(def, settings, "scale", prefix)));
              liveRow(featureBody, "模糊", liveRange(settings, "blur", 0, 30, 1, "px", true));
              liveRow(featureBody, "水平", liveRange(settings, "positionX", 0, 100, 1, "%", true, () => previewRegionGeometry(def, settings, "positionX", prefix)));
              liveRow(featureBody, "垂直", liveRange(settings, "positionY", 0, 100, 1, "%", true, () => previewRegionGeometry(def, settings, "positionY", prefix)));
              liveRow(featureBody, "超界", liveRange(settings, "overflowY", 0, 300, 1, "px", true, () => previewRegionGeometry(def, settings, "overflowY", prefix)));
              feature.append(featureHead, featureBody); panel.appendChild(feature);
            }
          } else {
            liveRow(panel, "缩放", liveRange(region, "scale", 0.1, 3, 0.05, "×", true, () => previewRegionGeometry(def, region, "scale")));
            liveRow(panel, "模糊", liveRange(region, "blur", 0, 30, 1, "px", true));
            liveRow(panel, "水平", liveRange(region, "positionX", 0, 100, 1, "%", true, () => previewRegionGeometry(def, region, "positionX")));
            liveRow(panel, "垂直", liveRange(region, "positionY", 0, 100, 1, "%", true, () => previewRegionGeometry(def, region, "positionY")));
            if (def.overflow) liveRow(panel, "超界", liveRange(region, "overflowY", 0, 300, 1, "px", true, () => previewRegionGeometry(def, region, "overflowY")));
          }
          card.appendChild(panel); workspace.appendChild(card);
        }
        body.appendChild(workspace);
      }
    }

    let floatingDragStartY = null;
    let floatingDragStartTop = 0;
    let floatingDragMoved = false;
    let suppressFloatingClick = false;
    floatingButton.addEventListener("pointerdown", event => {
      floatingDragStartY = event.clientY;
      floatingDragStartTop = floatingButton.getBoundingClientRect().top;
      floatingDragMoved = false;
      try { floatingButton.setPointerCapture(event.pointerId); } catch (_) {}
    });
    floatingButton.addEventListener("pointermove", event => {
      if (floatingDragStartY == null) return;
      const delta = event.clientY - floatingDragStartY;
      if (Math.abs(delta) > 5) floatingDragMoved = true;
      if (!floatingDragMoved) return;
      floatingButton.style.top = `${clampFloatingTop(floatingDragStartTop + delta)}px`;
      positionFloatingPanel();
    });
    floatingButton.addEventListener("pointerup", () => {
      if (floatingDragMoved) {
        state.floatingButtonTop = clampFloatingTop(floatingButton.getBoundingClientRect().top);
        floatingButton.style.top = `${state.floatingButtonTop}px`;
        persist();
        suppressFloatingClick = true;
      }
      floatingDragStartY = null;
    });
    floatingButton.addEventListener("pointercancel", () => { floatingDragStartY = null; });
    floatingButton.addEventListener("click", () => {
      if (suppressFloatingClick) { suppressFloatingClick = false; return; }
      floatingOpen = !floatingOpen;
      if (floatingOpen) renderFloating(); else syncFloatingUi();
    });
    refreshers.add(renderFloating);
    renderFloating();

    let scopeSyncFrame = 0;
    const scopeObserver = new MutationObserver(records => {
      const relevant = records.some(record => {
        const target = record.target;
        return target !== floatingPanel && !floatingPanel.contains(target) && target !== floatingButton && !floatingButton.contains(target);
      });
      if (!relevant || scopeSyncFrame) return;
      scopeSyncFrame = requestAnimationFrame(() => {
        scopeSyncFrame = 0;
        syncThemeScope();
      });
    });
    if (document.body) {
      scopeObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-settings-open", "class", "style", "hidden", "aria-hidden", "title", "aria-label", "disabled"],
      });
    }

    ctx.ui.slot("settings.section", el => {
      let alive = true;
      const colorDeleteSelection = new Set();
      let colorDeleteMode = false;
      let activeColorRuleId = "";
      let activeImageRegionKey = "appBackground";
      let activeSettingsPage = "themes";
      const floatingToggleRow = document.createElement("div");
      floatingToggleRow.className = "fis-settings-toggle-row";
      const box = document.createElement("div");
      box.className = "fis-settings";
      el.append(floatingToggleRow, box);

      const button = (text, className, onClick) => {
        const node = document.createElement("button");
        node.type = "button";
        node.className = "fis-btn" + (className ? " " + className : "");
        node.textContent = text;
        node.addEventListener("click", event => { event.stopPropagation(); onClick(); });
        return node;
      };

      const icons = {
        themePlus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"/><path d="M12 7v6M9 10h6"/></svg>',
        upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M8 8l4-4 4 4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg>',
        download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12M8 12l4 4 4-4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg>',
        trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>',
        check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
        save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h12l2 2v14H5Z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></svg>',
        pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.2-1 10.6-10.6a2 2 0 0 0-2.8-2.8L5.4 16.2zM14.5 7.1l2.8 2.8"/></svg>',
      };

      const iconButton = (icon, label, onClick, className = "") => {
        const node = document.createElement("button"); node.type = "button";
        node.className = "fis-icon-btn" + (className ? " " + className : "");
        node.innerHTML = icons[icon]; node.title = label; node.setAttribute("aria-label", label);
        node.addEventListener("click", event => { event.stopPropagation(); onClick(); });
        return node;
      };

      const switchControl = (checked, label, onChange) => {
        const wrapper = document.createElement("label"); wrapper.className = "fis-switch"; wrapper.title = label;
        const input = document.createElement("input"); input.type = "checkbox"; input.checked = checked; input.setAttribute("aria-label", label);
        const track = document.createElement("span"); track.className = "fis-switch-track";
        input.addEventListener("change", () => onChange(input.checked));
        wrapper.append(input, track);
        return wrapper;
      };

      const rangeControl = (region, key, min, max, step, suffix, deferred = false) => {
        const pair = document.createElement("div");
        pair.className = "fis-range-pair";
        const range = document.createElement("input");
        range.type = "range"; range.className = "fis-range";
        range.min = String(min); range.max = String(max); range.step = String(step); range.value = String(region[key]);
        const updateProgress = () => {
          const progress = max === min ? 0 : ((Number(range.value) - min) / (max - min)) * 100;
          range.style.setProperty("--fis-range-progress", `${Math.min(100, Math.max(0, progress))}%`);
        };
        updateProgress();
        const number = document.createElement("input");
        number.type = "number"; number.className = "fis-number";
        number.min = String(min); number.max = String(max); number.step = String(step); number.value = String(region[key]);
        const sync = (source, target, commit = true) => {
          const value = clamp(source.value, region[key], min, max);
          region[key] = value; source.value = String(value); target.value = String(value); updateProgress();
          if (commit) { persist(); apply(); }
        };
        range.addEventListener("input", () => sync(range, number, !deferred));
        if (deferred) range.addEventListener("change", () => sync(range, number, true));
        number.addEventListener(deferred ? "change" : "input", () => sync(number, range, true));
        number.title = suffix;
        pair.append(range, number);
        return pair;
      };

      const addRow = (panel, labelText, control) => {
        const row = document.createElement("div"); row.className = "fis-row";
        const label = document.createElement("div"); label.className = "fis-label"; label.textContent = labelText;
        row.append(label, control); panel.appendChild(row);
      };

      const render = () => {
        if (!alive) return;
        floatingToggleRow.textContent = "";
        box.textContent = "";
        const head = document.createElement("div"); head.className = "fis-head";
        const pageTabs = document.createElement("div"); pageTabs.className = "fis-page-tabs";
        const libraryTitle = document.createElement("div"); libraryTitle.className = "fis-library-title"; libraryTitle.textContent = "主题库";
        const floatingLabel = document.createElement("span"); floatingLabel.className = "fis-library-toggle-label"; floatingLabel.textContent = "显示主题设置侧边栏";
        const floatingSwitch = switchControl(state.floatingButtonEnabled, "显示设置按钮", checked => {
          state.floatingButtonEnabled = checked; persist(); syncFloatingUi(); renderFloating(); render();
        });
        floatingToggleRow.append(floatingLabel, floatingSwitch);
        pageTabs.append(libraryTitle);

        const importInput = document.createElement("input"); importInput.type = "file"; importInput.accept = "application/zip,.zip"; importInput.hidden = true;
        importInput.addEventListener("change", async () => {
          const file = importInput.files && importInput.files[0]; if (!file) return;
          try { await importThemeConfig(file); }
          catch (error) { ctx.ui.toast(`导入失败：${error && error.message ? error.message : "压缩包无效"}`); }
          importInput.value = "";
        });
        const toolbar = document.createElement("div"); toolbar.className = "fis-toolbar";
        toolbar.append(
          iconButton("upload", "导入配置", () => importInput.click()),
          iconButton("download", "导出配置", () => {
            openFloatingDialog({
              title: "导出配置",
              message: "将设置、图片和字体完整保存为 ZIP 压缩包",
              confirmLabel: "继续导出",
              onConfirm: exportThemeConfig,
            });
          }),
          importInput
        );
        head.append(pageTabs, toolbar); box.appendChild(head);

        if (activeSettingsPage === "colors") {
        if (!state.colorRules.some(rule => rule.id === activeColorRuleId)) activeColorRuleId = state.colorRules[0]?.id || "";
        const colorWorkspace = document.createElement("div"); colorWorkspace.className = "fis-color-workspace" + (state.colorsEnabled ? "" : " disabled");
        const subtabBar = document.createElement("div"); subtabBar.className = "fis-subtab-bar";
        const colorTabs = document.createElement("div"); colorTabs.className = "fis-subtab-strip fis-color-tabs" + (colorDeleteMode ? " delete-mode" : "");
        for (const rule of state.colorRules) {
          const tab = document.createElement("button"); tab.type = "button";
          tab.dataset.ruleId = rule.id;
          tab.className = "fis-color-tab" + (rule.id === activeColorRuleId && !colorDeleteMode ? " active" : "") + (colorDeleteSelection.has(rule.id) ? " selected" : "");
          tab.title = colorDeleteMode ? `选择删除 ${rule.color.toUpperCase()}` : `切换至 ${rule.color.toUpperCase()}`;
          tab.setAttribute("aria-label", tab.title);
          const mark = document.createElement("span"); mark.className = "fis-color-tab-mark"; mark.textContent = colorDeleteSelection.has(rule.id) ? "✓" : "";
          const heart = document.createElement("span"); heart.className = "fis-color-heart"; heart.textContent = "♥"; heart.style.color = rule.color;
          tab.append(mark, heart);
          tab.addEventListener("click", () => {
            if (colorDeleteMode) {
              colorDeleteSelection.has(rule.id) ? colorDeleteSelection.delete(rule.id) : colorDeleteSelection.add(rule.id);
            } else activeColorRuleId = rule.id;
            render();
          });
          colorTabs.appendChild(tab);
        }
        const switchBox = document.createElement("div"); switchBox.className = "fis-subtab-switch";
        switchBox.appendChild(switchControl(state.colorsEnabled, "启用全部配色", checked => {
          state.colorsEnabled = checked; persist(); apply(); render();
        }));
        subtabBar.append(colorTabs, switchBox); colorWorkspace.appendChild(subtabBar);

        const activeRule = state.colorRules.find(rule => rule.id === activeColorRuleId);
        if (activeRule && !colorDeleteMode) {
          const panel = document.createElement("div"); panel.className = "fis-color-panel";
          const colorEditor = document.createElement("div"); colorEditor.className = "fis-inline-color-editor";
          const picker = document.createElement("input"); picker.type = "color"; picker.value = activeRule.color;
          const colorText = document.createElement("input"); colorText.type = "text"; colorText.maxLength = 7; colorText.value = activeRule.color.toUpperCase();
          const updateColor = value => {
            if (!/^#[0-9a-f]{6}$/i.test(value)) return;
            activeRule.color = value.toLowerCase(); picker.value = activeRule.color; colorText.value = activeRule.color.toUpperCase();
            const activeTab = [...colorTabs.children].find(node => node.dataset.ruleId === activeRule.id);
            if (activeTab) {
              activeTab.querySelector(".fis-color-heart").style.color = activeRule.color;
              activeTab.title = `切换至 ${activeRule.color.toUpperCase()}`;
              activeTab.setAttribute("aria-label", activeTab.title);
            }
            persist(); apply();
          };
          picker.addEventListener("input", () => updateColor(picker.value));
          colorText.addEventListener("change", () => updateColor(colorText.value));
          colorText.addEventListener("blur", () => { colorText.value = activeRule.color.toUpperCase(); });
          colorEditor.append(picker, colorText); panel.appendChild(colorEditor);

          const options = document.createElement("div"); options.className = "fis-target-options fis-choice-chips";
          for (const target of COLOR_TARGETS) {
            const option = document.createElement("label"); option.className = "fis-target-option";
            const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = activeRule.targets.includes(target.key);
            checkbox.addEventListener("change", () => {
              if (checkbox.checked) {
                for (const otherRule of state.colorRules) otherRule.targets = otherRule.targets.filter(key => key !== target.key);
                if (!activeRule.targets.includes(target.key)) activeRule.targets.push(target.key);
              } else activeRule.targets = activeRule.targets.filter(key => key !== target.key);
              persist(); apply(); render();
            });
            const label = document.createElement("span"); label.textContent = target.label;
            option.append(checkbox, label); options.appendChild(option);
          }
          panel.appendChild(options); colorWorkspace.appendChild(panel);
        }
        if (!state.colorRules.length) {
          const empty = document.createElement("div"); empty.className = "fis-color-panel fis-empty"; empty.textContent = "尚未添加主题颜色"; colorWorkspace.appendChild(empty);
        }
        const colorActions = document.createElement("div"); colorActions.className = "fis-color-actions";
        const addColor = button("＋ 新增颜色", "primary", () => {
          if (state.colorRules.length >= 10) return;
          const rule = { id: colorRuleId(), color: "#8f76b8", targets: [] };
          state.colorRules.push(rule); activeColorRuleId = rule.id;
          persist(); render();
        });
        addColor.disabled = colorDeleteMode || state.colorRules.length >= 10;
        addColor.title = state.colorRules.length >= 10 ? "最多保存 10 个颜色" : "新增颜色";
        const deleteColor = button(colorDeleteMode ? (colorDeleteSelection.size ? `删除 (${colorDeleteSelection.size})` : "取消删除") : "删除颜色", "danger", () => {
          if (!colorDeleteMode) {
            colorDeleteMode = true; colorDeleteSelection.clear(); render(); return;
          }
          if (!colorDeleteSelection.size) {
            colorDeleteMode = false; render(); return;
          }
          const count = colorDeleteSelection.size;
          openFloatingDialog({
            title: "删除颜色", message: `确定删除选中的 ${count} 种颜色吗？`, confirmLabel: "删除", danger: true,
            onConfirm: () => {
              state.colorRules = state.colorRules.filter(rule => !colorDeleteSelection.has(rule.id));
              if (!state.colorRules.some(rule => rule.id === activeColorRuleId)) activeColorRuleId = state.colorRules[0]?.id || "";
              colorDeleteSelection.clear(); colorDeleteMode = false; persist(); apply(); render();
            },
          });
        });
        colorActions.append(addColor, deleteColor); colorWorkspace.appendChild(colorActions);
        box.appendChild(colorWorkspace);
        }

        if (activeSettingsPage === "inputs") {
          const inputStyle = state.inputStyle;
          const card = document.createElement("section"); card.className = "fis-input-style-card";
          const inputHead = document.createElement("div"); inputHead.className = "fis-input-style-head";
          const enabled = document.createElement("input"); enabled.type = "checkbox"; enabled.className = "fis-color-enabled"; enabled.checked = inputStyle.enabled;
          enabled.title = "启用输入框样式";
          const heading = document.createElement("div"); heading.className = "fis-region-name"; heading.textContent = "输入框样式";
          inputHead.append(enabled, heading); card.appendChild(inputHead);

          const body = document.createElement("div"); body.className = "fis-input-style-body" + (inputStyle.enabled ? "" : " disabled");
          const targets = document.createElement("div"); targets.className = "fis-input-targets fis-choice-chips";
          for (const [key, labelText] of INPUT_STYLE_TARGETS) {
            const option = document.createElement("label"); option.className = "fis-input-target";
            const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = inputStyle.applyTargets.includes(key);
            checkbox.addEventListener("change", () => {
              if (checkbox.checked && !inputStyle.applyTargets.includes(key)) inputStyle.applyTargets.push(key);
              if (!checkbox.checked) inputStyle.applyTargets = inputStyle.applyTargets.filter(item => item !== key);
              persist(); apply();
            });
            option.append(checkbox, document.createTextNode(labelText)); targets.appendChild(option);
          }
          addRow(body, "范围", targets);

          const borderOptions = document.createElement("div"); borderOptions.className = "fis-input-targets";
          const borderlessOption = document.createElement("label"); borderlessOption.className = "fis-input-target";
          const borderless = document.createElement("input"); borderless.type = "checkbox"; borderless.checked = inputStyle.borderless;
          borderless.addEventListener("change", () => { inputStyle.borderless = borderless.checked; persist(); apply(); render(); });
          borderlessOption.append(borderless, document.createTextNode("无边框")); borderOptions.appendChild(borderlessOption);
          addRow(body, "边框", borderOptions);
          addRow(body, "粗细", rangeControl(inputStyle, "borderWidth", 0.5, 6, 0.5, "px"));
          addRow(body, "圆角", rangeControl(inputStyle, "radius", 0, 50, 1, "px"));
          addRow(body, "宽度", rangeControl(inputStyle, "chatWidth", 40, 100, 1, "%"));

          const colorPair = document.createElement("div"); colorPair.className = "fis-color-pair";
          const colorPicker = document.createElement("input"); colorPicker.type = "color"; colorPicker.value = inputStyle.borderColor;
          const colorText = document.createElement("input"); colorText.type = "text"; colorText.className = "fis-number"; colorText.maxLength = 7; colorText.value = inputStyle.borderColor.toUpperCase();
          const updateBorderColor = color => {
            if (!/^#[0-9a-f]{6}$/i.test(color)) return;
            inputStyle.borderColor = color.toLowerCase(); colorPicker.value = inputStyle.borderColor; colorText.value = inputStyle.borderColor.toUpperCase();
            persist(); apply();
          };
          colorPicker.addEventListener("input", () => updateBorderColor(colorPicker.value));
          colorText.addEventListener("change", () => updateBorderColor(colorText.value));
          colorText.addEventListener("blur", () => { colorText.value = inputStyle.borderColor.toUpperCase(); });
          colorPair.append(colorPicker, colorText); addRow(body, "边框", colorPair);

          enabled.addEventListener("change", () => { inputStyle.enabled = enabled.checked; persist(); apply(); render(); });
          card.appendChild(body); box.appendChild(card);
        }

        if (activeSettingsPage === "themes") {
          const list = document.createElement("div"); list.className = "fis-theme-list";
          const themes = Object.values(state.themes);
          for (const theme of themes) {
            const card = document.createElement("section"); card.className = "fis-theme-card";
            const copy = document.createElement("div");
            const name = document.createElement("div"); name.className = "fis-theme-name"; name.textContent = theme.name;
            const hint = document.createElement("div"); hint.className = "fis-theme-hint";
            const imageCount = Object.values(theme.snapshot.regions || {}).filter(region => region && region.image).length;
            copy.appendChild(name);
            if (imageCount) { hint.textContent = `包含 ${imageCount} 张图片`; copy.appendChild(hint); }

            const actions = document.createElement("div"); actions.className = "fis-theme-actions";
            actions.append(
              iconButton("check", `应用主题：${theme.name}`, () => {
                replaceActiveTheme(theme.snapshot); persist(); refreshAll(); ctx.ui.toast(`已应用主题：${theme.name}`);
              }, "primary"),
              iconButton("save", `用当前设置覆盖：${theme.name}`, () => {
                openFloatingDialog({
                  title: "覆盖主题",
                  message: `确定用当前设置覆盖“${theme.name}”吗？`,
                  confirmLabel: "覆盖",
                  onConfirm: () => { theme.snapshot = themeSnapshot(state); persist(); render(); ctx.ui.toast("主题已更新"); },
                });
              }),
              iconButton("pencil", `重命名主题：${theme.name}`, () => {
                openFloatingDialog({
                  title: "重命名主题",
                  inputValue: theme.name,
                  inputPlaceholder: "主题名称",
                  confirmLabel: "保存",
                  onConfirm: value => {
                    const nextName = String(value || "").trim();
                    if (!nextName) return false;
                    theme.name = nextName; persist(); render();
                  },
                });
              }),
              iconButton("trash", `删除主题：${theme.name}`, () => {
                openFloatingDialog({
                  title: "删除主题",
                  message: `确定删除“${theme.name}”吗？此操作无法撤销。`,
                  confirmLabel: "删除",
                  danger: true,
                  onConfirm: () => {
                    delete state.themes[theme.id];
                    if (state.dayNightSchedule.dayThemeId === theme.id) state.dayNightSchedule.dayThemeId = "";
                    if (state.dayNightSchedule.nightThemeId === theme.id) state.dayNightSchedule.nightThemeId = "";
                    lastDayNightKey = "";
                    persist(); render();
                  },
                });
              }, "danger")
            );
            card.append(copy, actions); list.appendChild(card);
          }
          if (!themes.length) {
            const empty = document.createElement("div"); empty.className = "fis-empty";
            empty.textContent = "还没有保存主题，请打开悬浮设置并点击书签＋图标保存";
            list.appendChild(empty);
          }
          box.appendChild(list);
        }

        if (activeSettingsPage === "images") {
        if (!IMAGE_REGION_DEFS.some(def => def.key === activeImageRegionKey)) activeImageRegionKey = IMAGE_REGION_DEFS[0].key;
        const imageWorkspace = document.createElement("div"); imageWorkspace.className = "fis-image-workspace" + (state.imagesEnabled ? "" : " disabled");
        const imageBar = document.createElement("div"); imageBar.className = "fis-subtab-bar";
        const imageTabs = document.createElement("div"); imageTabs.className = "fis-subtab-strip";
        const imageTabLabels = { appBackground: "背景", topBar: "顶部栏", bottomBar: "底部栏" };
        for (const tabDef of IMAGE_REGION_DEFS) {
          const tab = document.createElement("button"); tab.type = "button";
          tab.className = "fis-image-tab" + (tabDef.key === activeImageRegionKey ? " active" : "");
          tab.textContent = imageTabLabels[tabDef.key];
          tab.addEventListener("click", () => { activeImageRegionKey = tabDef.key; render(); });
          imageTabs.appendChild(tab);
        }
        const imageSwitchBox = document.createElement("div"); imageSwitchBox.className = "fis-subtab-switch";
        imageSwitchBox.appendChild(switchControl(state.imagesEnabled, "启用全部图片设置", checked => {
          state.imagesEnabled = checked; persist(); apply(); render();
        }));
        imageBar.append(imageTabs, imageSwitchBox); imageWorkspace.appendChild(imageBar);

        const def = IMAGE_REGION_DEFS.find(item => item.key === activeImageRegionKey);
        if (def) {
          const region = state.regions[def.key];
          const card = document.createElement("section"); card.className = "fis-region";
          const summary = document.createElement("div"); summary.className = "fis-region-summary";
          const enabled = document.createElement("input"); enabled.type = "checkbox"; enabled.className = "fis-region-enabled"; enabled.checked = region.enabled;
          enabled.title = "启用区域";
          enabled.addEventListener("change", () => { region.enabled = enabled.checked; persist(); apply(); });
          const thumb = document.createElement("div"); thumb.className = "fis-thumb"; if (region.image) thumb.style.backgroundImage = cssUrl(region.image);
          const copy = document.createElement("div");
          const name = document.createElement("div"); name.className = "fis-region-name"; name.textContent = def.label;
          const hint = document.createElement("div"); hint.className = "fis-region-hint"; hint.textContent = region.image ? (region.fileName || "已上传图片") : def.hint;
          copy.append(name, hint);
          const fileInput = document.createElement("input"); fileInput.type = "file"; fileInput.accept = "image/png,image/webp,image/jpeg"; fileInput.hidden = true;
          fileInput.addEventListener("change", () => {
            const file = fileInput.files && fileInput.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = () => { region.image = String(reader.result || ""); region.fileName = file.name; persist(); apply(); render(); };
            reader.readAsDataURL(file);
          });
          const actions = document.createElement("div"); actions.className = "fis-region-actions";
          actions.append(button("选择", "primary", () => fileInput.click()), button("清除", "danger", () => { region.image = ""; region.fileName = ""; persist(); apply(); render(); }), fileInput);
          summary.append(enabled, thumb, copy, actions);
          card.appendChild(summary);

          const panel = document.createElement("div"); panel.className = "fis-panel";
          if (def.targets) {
            const targets = document.createElement("div"); targets.className = "fis-input-targets fis-choice-chips";
            for (const [key, labelText] of def.targets) {
              const option = document.createElement("label"); option.className = "fis-input-target";
              const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = region.applyTargets.includes(key);
              checkbox.addEventListener("change", () => {
                if (checkbox.checked && !region.applyTargets.includes(key)) region.applyTargets.push(key);
                if (!checkbox.checked) region.applyTargets = region.applyTargets.filter(item => item !== key);
                persist(); apply();
              });
              option.append(checkbox, document.createTextNode(labelText)); targets.appendChild(option);
            }
            addRow(panel, "范围", targets);
          }
          addRow(panel, "缩放", rangeControl(region, "scale", 0.1, 3, 0.05, "×"));
          addRow(panel, "模糊", rangeControl(region, "blur", 0, 30, 1, "px", true));
          addRow(panel, "水平", rangeControl(region, "positionX", 0, 100, 1, "%"));
          addRow(panel, "垂直", rangeControl(region, "positionY", 0, 100, 1, "%"));
          if (def.overflow) addRow(panel, "超界", rangeControl(region, "overflowY", 0, 300, 1, "px"));
          card.appendChild(panel); imageWorkspace.appendChild(card);
        }
        box.appendChild(imageWorkspace);
        }
      };

      refreshers.add(render); render();
      return () => { alive = false; refreshers.delete(render); floatingToggleRow.remove(); box.remove(); };
    });

    apply();
    if (state.dayNightSchedule.enabled) applyDayNightSchedule(true);
    dayNightTimer = window.setInterval(() => applyDayNightSchedule(false), 30000);
    void loadLightweightStyles().then(saved => {
      if (disposed || !saved || typeof saved !== "object") return;
      const normalized = normalizeState(saved);
      if (saved.thoughtStyle && typeof saved.thoughtStyle === "object") state.thoughtStyle = normalized.thoughtStyle;
      if (saved.translationStyle && typeof saved.translationStyle === "object") state.translationStyle = normalized.translationStyle;
      syncThoughtStyle();
      syncTranslationStyle();
      for (const refresh of refreshers) {
        try { refresh(); } catch (error) { ctx.system.log("[自定义聊天主题] 轻量样式界面刷新失败", error); }
      }
    });
    ctx.hooks.on("app.ready", apply);
    ctx.hooks.on("session.opened", payload => {
      activeSessionId = payload && payload.sessionId ? String(payload.sessionId) : "";
      lastUserHeaderAvatar = "";
      userHeaderAvatarProbe = null;
      userHeaderAvatarProbeSession = "";
      expressionBuiltinLabels = [];
      expressionPackLabels = [];
      expressionPackProbeComplete = false;
      expressionProbeStage = "";
      expressionProbeDeadline = 0;
      if (expressionProbeTimer) {
        clearTimeout(expressionProbeTimer);
        expressionProbeTimer = 0;
      }
      pendingBuiltinIndex = null;
      pendingPackIndex = null;
      apply();
    });

    return () => {
      disposed = true;
      for (const timer of blurTimers.values()) clearTimeout(timer);
      blurTimers.clear();
      blurredImageCache.clear();
      for (const objectUrl of imageObjectUrls.values()) URL.revokeObjectURL(objectUrl);
      imageObjectUrls.clear();
      window.removeEventListener("resize", onFloatingResize);
      document.removeEventListener("visibilitychange", onVisibilityResume);
      window.removeEventListener("pageshow", scheduleResumeSync);
      for (const timer of resumeTimers) clearTimeout(timer);
      resumeTimers.clear();
      if (dayNightTimer) clearInterval(dayNightTimer);
      if (expressionProbeTimer) clearTimeout(expressionProbeTimer);
      scopeObserver.disconnect();
      if (scopeSyncFrame) cancelAnimationFrame(scopeSyncFrame);
      root.removeAttribute("data-fis-view-scope");
      root.removeAttribute("data-fis-background-scope");
      clearApplied();
      document.querySelectorAll("[data-fis-tool-icon]").forEach(node => node.removeAttribute("data-fis-tool-icon"));
      document.querySelectorAll(".fis-expression-switch").forEach(node => node.remove());
      document.querySelectorAll(".fis-expression-proxy").forEach(node => node.remove());
      document.querySelectorAll(".fis-expression-panel").forEach(node => {
        node.classList.remove("fis-expression-panel");
        node.removeAttribute("data-fis-expression-kind");
        node.querySelectorAll("[data-fis-expression-effect]").forEach(button => button.removeAttribute("data-fis-expression-effect"));
      });
      floatingButton.remove();
      floatingPanel.remove();
      document.querySelector(".fis-dialog-overlay")?.remove();
      style.remove();
      refreshers.clear();
    };
  },
};
