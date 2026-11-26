/* 通用 UI：登录、布局、组件、提示 */
(function () {
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function toast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  const STATUS = {
    MASTERED: ['已掌握', 'green'],
    WEAK_ACCURACY: ['薄弱·准确率', 'red'],
    WEAK_TIME: ['薄弱·时间', 'red'],
    INSUFFICIENT: ['证据不足', 'gold'],
    MATCH: ['一致', 'green'],
    CONFLICT: ['冲突', 'red'],
    NONE: ['无自评', 'gray'],
    UNKNOWN: ['待补充', 'gray'],
    PENDING: ['待复核', 'gold'],
    PENDING_REVIEW: ['待复核', 'gold'],
    CONFIRMED: ['已确认', 'green'],
    REJECTED: ['已驳回', 'gray'],
    SERVED: ['已返回', 'green'],
    DEGRADED: ['已降级', 'gold'],
    EMPTY: ['无候选', 'gray'],
    ADOPTED: ['已采纳', 'green'],
    DISMISSED: ['已忽略', 'gray'],
    REQUESTED: ['已请求', 'blue'],
    OVERRIDDEN: ['已改判', 'blue'],
    NONE_REVIEW: ['自动判分', 'gray'],
    ACTIVE: ['已标记', 'red'],
    CANCELLED: ['已取消', 'gray'],
    DONE: ['已完成', 'green'],
    IN_PROGRESS: ['进行中', 'blue']
  };
  function statusTag(s) {
    const x = STATUS[s] || [s || '-', 'gray'];
    return `<span class="tag tag-${x[1]}">${esc(x[0])}</span>`;
  }
  function tag(text, color = 'gray') { return `<span class="tag tag-${color}">${esc(text)}</span>`; }
  function pct(x) { return x == null ? '-' : Math.round(x * 100) + '%'; }
  function fmt(iso) { return iso ? String(iso).slice(0, 16).replace('T', ' ') : '-'; }
  function panel(title, body, extra = '') {
    return `<div class="panel"><h3>${esc(title)}</h3>${extra}${body}</div>`;
  }
  function empty(text, icon = '📭') {
    return `<div class="empty"><div class="icon">${icon}</div>${esc(text)}</div>`;
  }
  function table(headers, rows) {
    if (!rows.length) return empty('暂无数据');
    return `<table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  // ---------- 登录 ----------
  function renderLogin(root, opts) {
    const accounts = window.MockDB.db.users.filter(u => u.role === opts.role);
    root.innerHTML = `
      <div class="login-overlay">
        <div class="login-box">
          <h2>${esc(opts.loginTitle || '登录')}</h2>
          <p class="hint">前端演示模式：选择账号直接进入，无需密码</p>
          <label class="field"><span>账号</span>
            <select id="loginAccount">${accounts.map(u => `<option value="${esc(u.account)}">${esc(u.name)}（${esc(u.account)}）</option>`).join('')}</select>
          </label>
          <button class="btn btn-primary" id="loginBtn">进入${esc(opts.roleName)}</button>
        </div>
      </div>`;
    document.getElementById('loginBtn').onclick = async () => {
      const account = document.getElementById('loginAccount').value;
      try {
        const data = await window.api('POST', '/auth/login', { account, password: '', role: opts.role });
        window.auth.setSession(data.user);
        boot(root, opts);
      } catch (e) { toast(e.message, 'error'); }
    };
  }

  // ---------- 应用框架 ----------
  function boot(root, opts) {
    const user = window.auth.currentUser();
    if (!user || user.role !== opts.role) { renderLogin(root, opts); return; }
    root.innerHTML = `
      <div class="topbar">
        <h1>${esc(opts.title)}</h1>
        <span class="role-badge">${esc(opts.roleName)}</span>
        <span class="spacer"></span>
        <span class="user">${esc(user.name)}（${esc(user.account)}）${user.class_id ? ' · ' + esc(user.class_id) : ''}</span>
        <button class="btn btn-sm" id="logoutBtn">退出</button>
        <a class="back" href="index.html">← 返回门户</a>
      </div>
      <div class="layout">
        <div class="sidebar" id="sidebar"></div>
        <div class="content" id="content"></div>
      </div>`;
    document.getElementById('logoutBtn').onclick = () => {
      window.api('POST', '/auth/logout').catch(() => {});
      window.auth.clearSession();
      boot(root, opts);
    };
    const sidebar = document.getElementById('sidebar');
    let html = '';
    opts.nav.forEach(n => {
      if (n.group) { html += `<div class="nav-group">${esc(n.group)}</div>`; return; }
      html += `<div class="nav-item" data-id="${esc(n.id)}"><span>${esc(n.icon || '')}</span><span class="label">${esc(n.label)}</span></div>`;
    });
    sidebar.innerHTML = html;
    const content = document.getElementById('content');
    const go = (id) => {
      document.querySelectorAll('.nav-item').forEach(x => x.classList.toggle('active', x.dataset.id === id));
      content.innerHTML = '<div class="panel"><p class="meta">加载中…</p></div>';
      Promise.resolve()
        .then(() => opts.render(id, content))
        .catch(e => {
          content.innerHTML = panel('出错了', `<div class="note danger">${esc(e.message)}</div>`);
        });
    };
    sidebar.querySelectorAll('.nav-item').forEach(x => x.onclick = () => go(x.dataset.id));
    go(opts.defaultId || opts.nav.find(n => n.id).id);
  }

  function init(opts) {
    const root = document.getElementById('app');
    const user = window.auth.currentUser();
    if (user && user.role === opts.role) { boot(root, opts); return; }
    // 演示/截图便利：?auto=1 自动以第一个账号登录
    if (new URLSearchParams(location.search).get('auto') === '1') {
      const first = window.MockDB.db.users.find(u => u.role === opts.role);
      if (first) {
        window.api('POST', '/auth/login', { account: first.account, role: opts.role })
          .then(d => { window.auth.setSession(d.user); boot(root, opts); })
          .catch(() => renderLogin(root, opts));
        return;
      }
    }
    renderLogin(root, opts);
  }

  async function call(method, path, body) {
    try {
      return await window.api(method, path, body);
    } catch (e) {
      if (e.code === 40101) { toast('登录已失效，请重新登录', 'error'); setTimeout(() => location.reload(), 800); }
      else toast(e.message || '请求失败', 'error');
      throw e;
    }
  }

  window.UI = { esc, toast, tag, statusTag, pct, fmt, panel, empty, table, init, call };
})();
