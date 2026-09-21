/* DOM compatibility adapter: the documented API has no built-in toolbar actions.
   Uses only existing visible controls; never accesses React internals or message storage.
   Disabling removes all added UI and observers. */
export default {
 manifest: {
  id: "retro-camera-toolbar",
  name: "复古相机工具栏",
  apiVersion: 1,
  version: "1.3.0",
  description: "相机按钮展开工具小窗，保留原发送、表情、贴纸、加号和 AI 回复功能。需搭配复古 v10 CSS。",
  permissions: ["chat.read"],
  settings: [{key:"mode",label:"启用范围",type:"select",default:"all",options:[{value:"all",label:"全部聊天室"},{value:"selected",label:"仅勾选的聊天室"},{value:"off",label:"全部关闭"}]}]
 },
 setup(ctx) {
  const states = new Map();
  function enabled(bar) {
    const mode = ctx.system.settings.get('mode') || 'all';
    if(mode === 'off') return false;
    if(mode === 'all') return true;
    const room = bar.closest('.chat-room-wrapper');
    const session = ctx.data.sessions.list().find(s => room?.classList.contains('session-' + s.id));
    return !!session && (ctx.system.storage.get('selectedRooms') || []).includes(session.id);
  }
  ctx.ui.slot('settings.section', el => {
    const render = () => {
      el.replaceChildren();
      el.style.cssText='padding:14px;background:#e3ebf5;border:1px solid #859bb6;border-radius:8px;color:#294765';
      const title=document.createElement('h3');title.textContent='相机工具栏 · 启用聊天室';el.append(title);
      for(const [mode,label] of [['all','全部开启'],['off','全部关闭'],['selected','仅开启已勾选']]) {
        const b=document.createElement('button');b.textContent=label;b.type='button';b.style.cssText='margin:4px;padding:8px;border-radius:5px;background:#315e8b;color:white';
        b.onclick=()=>{ctx.system.settings.set('mode',mode);scan();render();};el.append(b);
      }
      const selected=ctx.system.storage.get('selectedRooms') || [];
      const mode=ctx.system.settings.get('mode') || 'all';
      const status=document.createElement('p');status.textContent='当前：'+({all:'全部开启',off:'全部关闭',selected:'仅开启已勾选'}[mode]);el.append(status);
      const details=document.createElement('details');
      const summary=document.createElement('summary');summary.textContent='展开选择聊天室（已勾选 '+selected.length+'）';summary.style.cssText='cursor:pointer;padding:10px 0';details.append(summary);el.append(details);
      for(const session of ctx.data.sessions.list()) {
        const label=document.createElement('label');label.style.cssText='display:flex;gap:10px;align-items:center;padding:8px';
        const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selected.includes(session.id);
        const character=session.contactId ? ctx.data.characters.get(session.contactId) : null;
        const text=document.createElement('span');text.textContent=session.groupName || session.alias || character?.name || '聊天室 '+session.id;
        checkbox.onchange=()=>{const next=new Set(ctx.system.storage.get('selectedRooms') || []);checkbox.checked?next.add(session.id):next.delete(session.id);ctx.system.storage.set('selectedRooms',[...next]);ctx.system.settings.set('mode','selected');scan();render();el.querySelector('details').open=true;};
        label.append(checkbox,text);details.append(label);
      }
    };
    render();
    return ctx.system.settings.onChange(render);
  });
  ctx.system.settings.onChange(() => scan());
  const cameraSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/></svg>';
  function setup(bar) {
    const actions = bar.querySelector(':scope > .chat-input-actions');
    if (!actions?.querySelector('.chat-offline-toggle') || states.has(bar) || !enabled(bar)) return;
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'retro-camera-toggle';
    toggle.setAttribute('aria-label', '打开工具菜单');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = cameraSvg;
    const panel = document.createElement('div');
    panel.className = 'retro-camera-popup'; panel.hidden = true;
    panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', '聊天工具');
    const close = () => { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); };
    toggle.addEventListener('click', () => {
      if (!panel.hidden) return close();
      panel.replaceChildren();
      const originals = [...actions.children].filter(el => el.tagName === 'BUTTON');
      const choices = originals.slice(0, 4).map((button, i) => ({button, label:['线下模式','表情','贴纸','更多 ＋'][i]}));
      const storeOnly = originals.find(b => b.getAttribute('aria-label') === '发送');
      if (storeOnly) choices.push({button:storeOnly,label:'仅发送，不触发回复'});
      for (const {button:original,label} of choices) {
        const item = document.createElement('button'); item.type = 'button';
        item.disabled = original.disabled;
        const icon = original.querySelector('svg'); if (icon) item.append(icon.cloneNode(true));
        const text = document.createElement('span'); text.textContent = label; item.append(text);
        item.addEventListener('click', () => { close(); if (original.isConnected && !original.disabled) original.click(); });
        panel.append(item);
      }
      panel.hidden = false; toggle.setAttribute('aria-expanded', 'true');
      panel.querySelector('button:not(:disabled)')?.focus();
    });
    bar.append(toggle, panel); bar.classList.add('retro-camera-ready');
    states.set(bar, {toggle,panel,close});
  }
  function scan() {
    for (const [bar, state] of states) {
      if (!bar.isConnected || !bar.querySelector('.chat-offline-toggle') || !enabled(bar)) {
        state.toggle.remove(); state.panel.remove(); bar.classList.remove('retro-camera-ready'); states.delete(bar);
      }
    }
    document.querySelectorAll('.chat-room-wrapper .chat-input-bar').forEach(setup);
  }
  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return; pending = true;
    queueMicrotask(() => { pending = false; scan(); });
  });
  const outside = event => { for (const {toggle,panel,close} of states.values()) if (!panel.contains(event.target) && !toggle.contains(event.target)) close(); };
  const escape = event => { if(event.key === 'Escape') for (const {toggle,panel,close} of states.values()) if (!panel.hidden) {close();toggle.focus();} };
  document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
  observer.observe(document.body, {childList:true,subtree:true}); scan();
  return () => {
    observer.disconnect(); document.removeEventListener('pointerdown',outside); document.removeEventListener('keydown',escape);
    for(const [bar,{toggle,panel}] of states) { toggle.remove();panel.remove();bar.classList.remove('retro-camera-ready'); }
    states.clear();
  };

 }
};
