/* 管理端 */
(function () {
  const U = window.UI;
  const { esc, toast, tag, fmt, panel, empty, table, call } = U;

  let kpCache = [];

  const nav = [
    { group: '系统' },
    { id: 'overview', icon: '📊', label: '系统概览' },
    { id: 'users', icon: '👥', label: '用户管理' },
    { id: 'courses', icon: '📚', label: '课程管理' },
    { id: 'resources', icon: '📖', label: '资源管理' },
    { id: 'questions', icon: '📝', label: '题目管理' },
    { group: '配置与评测' },
    { id: 'config', icon: '⚙️', label: '系统配置' },
    { id: 'eval', icon: '📐', label: '评测管理' },
    { id: 'ai', icon: '🤖', label: 'AI 模型配置' },
    { id: 'cicd', icon: '🔄', label: 'CI/CD' },
    { group: '运维' },
    { id: 'logs', icon: '📋', label: '系统日志' },
    { id: 'backup', icon: '💾', label: '备份恢复' },
    { id: 'security', icon: '🛡️', label: '安全管理' }
  ];

  async function loadKps() {
    if (kpCache.length) return kpCache;
    const tree = await call('GET', '/admin/courses');
    kpCache = [];
    tree.forEach(c => c.chapters.forEach(ch => ch.knowledge_points.forEach(kp => kpCache.push({ ...kp, chapter: ch.name }))));
    return kpCache;
  }

  async function render(id, el) {
    if (id === 'overview') return renderOverview(el);
    if (id === 'users') return renderUsers(el);
    if (id === 'courses') return renderCourses(el);
    if (id === 'resources') return renderResources(el);
    if (id === 'questions') return renderQuestions(el);
    if (id === 'config') return renderConfig(el);
    if (id === 'eval') return renderEval(el);
    if (id === 'ai') return renderAI(el);
    if (id === 'cicd') return renderCicd(el);
    if (id === 'logs') return renderLogs(el);
    if (id === 'backup') return renderBackup(el);
    if (id === 'security') return renderSecurity(el);
  }

  async function renderOverview(el) {
    const o = await call('GET', '/admin/overview');
    el.innerHTML = panel('系统概览', `
      <div class="grid grid-4">
        <div class="card accent"><div class="k">学生</div><div class="v">${o.students}</div></div>
        <div class="card blue"><div class="k">教师</div><div class="v">${o.teachers}</div></div>
        <div class="card green"><div class="k">课程</div><div class="v">${o.courses}</div></div>
        <div class="card gold"><div class="k">题目</div><div class="v">${o.questions}</div></div>
        <div class="card"><div class="k">资源</div><div class="v">${o.resources}</div></div>
        <div class="card"><div class="k">答题记录</div><div class="v">${o.answers}</div></div>
        <div class="card"><div class="k">操作日志</div><div class="v">${o.logs}</div></div>
        <div class="card"><div class="k">运行形态</div><div class="v" style="font-size:16px">前端演示</div></div>
      </div>
      <div class="note info" style="margin-top:14px">当前为前端 Mock 数据（localStorage）。接入后端后，此页数据来自 /api/admin/overview。</div>`);
  }

  async function renderUsers(el) {
    const rows = await call('GET', '/admin/users');
    const roleName = { student: '学生', teacher: '教师', admin: '管理员' };
    el.innerHTML = panel('用户管理', `
      <div class="card" style="margin-bottom:14px">
        <div class="form-row">
          <label class="field"><span>角色</span><select id="uRole"><option value="student">学生</option><option value="teacher">教师</option><option value="admin">管理员</option></select></label>
          <label class="field"><span>账号</span><input id="uAccount" placeholder="如 s4"></label>
          <label class="field"><span>姓名</span><input id="uName"></label>
          <label class="field"><span>班级/职称</span><input id="uExtra" placeholder="学生填班级，教师填职称"></label>
        </div>
        <button class="btn btn-primary btn-sm" id="uAdd">新增用户</button>
      </div>
      ${table(['账号', '姓名', '角色', '班级/职称', '操作'], rows.map(u => [
        esc(u.account), esc(u.name), roleName[u.role] || u.role, esc(u.class_id || u.title || '-'),
        `<button class="btn btn-sm btn-danger" data-del="${u.user_id}">删除</button>`
      ]))}`);
    el.querySelector('#uAdd').onclick = async () => {
      const role = el.querySelector('#uRole').value;
      const body = {
        account: el.querySelector('#uAccount').value.trim(),
        name: el.querySelector('#uName').value.trim(),
        role,
        class_id: role === 'student' ? el.querySelector('#uExtra').value.trim() : '',
        title: role === 'teacher' ? el.querySelector('#uExtra').value.trim() : ''
      };
      if (!body.account || !body.name) { toast('请填写账号与姓名', 'error'); return; }
      await call('POST', '/admin/users', body);
      toast('用户已新增', 'success'); renderUsers(el);
    };
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('删除用户？')) return;
      await call('DELETE', `/admin/users/${b.dataset.del}`);
      toast('已删除', 'success'); renderUsers(el);
    });
  }

  async function renderCourses(el) {
    const tree = await call('GET', '/admin/courses');
    el.innerHTML = panel('课程管理', `
      <div class="card" style="margin-bottom:14px">
        <div class="form-row">
          <label class="field"><span>课程名称</span><input id="acName"></label>
          <label class="field"><span>学期</span><input id="acTerm" placeholder="2026秋"></label>
        </div>
        <button class="btn btn-primary btn-sm" id="acAdd">新增课程</button>
      </div>
      ${tree.map(c => `<div class="card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><strong>${esc(c.name)}</strong> <span class="meta">${esc(c.term || '')}</span></div>
          <button class="btn btn-sm btn-danger" data-del="${c.course_id}">删除</button>
        </div>
        <div class="meta" style="margin-top:6px">${c.chapters.map(ch => esc(ch.name) + '（' + ch.knowledge_points.length + ' 知识点）').join(' · ')}</div>
      </div>`).join('')}`);
    el.querySelector('#acAdd').onclick = async () => {
      const name = el.querySelector('#acName').value.trim();
      if (!name) { toast('请输入课程名称', 'error'); return; }
      await call('POST', '/admin/courses', { name, term: el.querySelector('#acTerm').value.trim() });
      kpCache = []; toast('已新增', 'success'); renderCourses(el);
    };
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('删除课程？')) return;
      await call('DELETE', `/admin/courses/${b.dataset.del}`);
      kpCache = []; toast('已删除', 'success'); renderCourses(el);
    });
  }

  async function renderResources(el) {
    const rows = await call('GET', '/admin/resources');
    const typeName = { video: '视频', image: '图片', doc: '文档' };
    el.innerHTML = panel('资源管理', table(['标题', '知识点', '类型', '文件', '操作'], rows.map(r => [
      esc(r.title), esc(r.kp_name || ''), typeName[r.type] || r.type,
      r.file_url ? `<a class="file-link" href="${esc(r.file_url)}" target="_blank">📎 打开</a>` : '-',
      `<button class="btn btn-sm btn-danger" data-del="${r.resource_id}">删除</button>`
    ])));
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      await call('DELETE', `/admin/resources/${b.dataset.del}`);
      toast('已删除', 'success'); renderResources(el);
    });
  }

  async function renderQuestions(el) {
    await loadKps();
    const rows = await call('GET', '/admin/questions');
    const typeName = { choice: '选择题', judge: '判断题', subjective: '主观题' };
    el.innerHTML = panel('题目管理', `
      <div class="card" style="margin-bottom:14px">
        <div class="form-row">
          <label class="field"><span>知识点</span><select id="qKp">${kpCache.map(k => `<option value="${k.kp_id}">${esc(k.name)}</option>`).join('')}</select></label>
          <label class="field"><span>题型</span><select id="qType"><option value="choice">选择题</option><option value="subjective">主观题</option></select></label>
          <label class="field"><span>难度（0-1）</span><input type="number" id="qDiff" value="0.6" step="0.1" min="0" max="1"></label>
        </div>
        <label class="field"><span>题干</span><input id="qTitle"></label>
        <label class="field"><span>参考答案</span><textarea id="qAnswer"></textarea></label>
        <button class="btn btn-primary btn-sm" id="qAdd">新增题目</button>
      </div>
      ${table(['题干', '知识点', '题型', '难度', '操作'], rows.map(q => [
        esc((q.title || '').slice(0, 40)), esc(q.kp_name || ''), typeName[q.type] || q.type, q.difficulty,
        `<button class="btn btn-sm btn-danger" data-del="${q.question_id}">删除</button>`
      ]))}`);
    el.querySelector('#qAdd').onclick = async () => {
      const title = el.querySelector('#qTitle').value.trim();
      if (!title) { toast('请输入题干', 'error'); return; }
      await call('POST', '/admin/questions', {
        kp_id: +el.querySelector('#qKp').value, type: el.querySelector('#qType').value,
        difficulty: parseFloat(el.querySelector('#qDiff').value), title,
        reference_answer: el.querySelector('#qAnswer').value.trim()
      });
      toast('题目已新增', 'success'); renderQuestions(el);
    };
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('删除题目？')) return;
      await call('DELETE', `/admin/questions/${b.dataset.del}`);
      toast('已删除', 'success'); renderQuestions(el);
    });
  }

  async function renderConfig(el) {
    const rows = await call('GET', '/admin/config');
    const desc = {
      kp_accuracy_threshold: '知识点准确率阈值（第一依据）',
      time_ratio_threshold: '正确作答时间比值阈值（第二依据）',
      min_student_correct_samples: '个人时间判据最少正确样本 N',
      question_accuracy_threshold: '难题准确率阈值',
      min_time_samples: '题目时间统计最少样本 N',
      time_variance_threshold: '正确作答时间方差阈值（秒²）',
      weak_ratio_threshold: '班级难点薄弱占比阈值',
      key_score_share_threshold: '重点分值占比阈值',
      eval_kp_recall_target: '召回率目标',
      eval_kp_precision_target: '准确率目标',
      eval_relation_target: '关系准确率目标',
      eval_source_target: '出处可定位率目标'
    };
    el.innerHTML = panel('系统配置（候选阈值）', `
      <div class="note warn">所有阈值均为候选值，修改立即生效；历史诊断快照保留旧 rule_version。</div>
      ${table(['配置键', '值', '说明', '操作'], rows.map(r => [
        `<code>${esc(r.key)}</code>`,
        `<input data-cfg="${esc(r.key)}" value="${esc(r.value)}" style="max-width:140px">`,
        esc(desc[r.key] || '-'),
        `<button class="btn btn-sm btn-primary" data-save="${esc(r.key)}">保存</button>`
      ]))}`);
    el.querySelectorAll('[data-save]').forEach(b => b.onclick = async () => {
      const key = b.dataset.save;
      const input = el.querySelector(`[data-cfg="${key}"]`);
      await call('PUT', `/admin/config/${key}`, { value: input.value });
      toast('已保存', 'success');
    });
  }

  async function renderEval(el) {
    const [ds, runs] = await Promise.all([call('GET', '/eval/datasets'), call('GET', '/eval/runs')]);
    const metricText = (m) => {
      const p = [];
      if (m.recall != null) p.push('召回 ' + Math.round(m.recall * 100) + '%');
      if (m.precision != null) p.push('准确 ' + Math.round(m.precision * 100) + '%');
      if (m.source_locatability != null) p.push('出处 ' + Math.round(m.source_locatability * 100) + '%');
      if (m.relation_accuracy != null) p.push('关系 ' + Math.round(m.relation_accuracy * 100) + '%');
      return p.join('，');
    };
    el.innerHTML = panel('评测管理', `
      <h4>标注集</h4>
      ${table(['数据集', '类型', '说明'], ds.map(x => [esc(x.name), esc(x.run_type), esc(x.description)]))}
      <h4>评测台账</h4>
      ${table(['时间', '类型', '引擎', '模型', '提示词', '指标', '结论'], runs.map(r => [
        fmt(r.created_at), esc(r.run_type), esc(r.engine), esc(r.model || '-'), esc(r.prompt || '-'),
        esc(metricText(r.metrics || {})), r.passed ? tag('达标', 'green') : tag('未达标', 'red')
      ]))}`);
  }

  async function renderAI(el) {
    const c = await call('GET', '/admin/ai-model');
    el.innerHTML = panel('AI 模型配置', `
      <div class="note warn">演示环境不实际调用模型；接入后端后，此配置由服务端读取并生效。</div>
      <div class="form-row">
        <label class="field"><span>模型</span><input id="mModel" value="${esc(c.model || '')}"></label>
        <label class="field"><span>超时（秒）</span><input id="mTimeout" type="number" value="${esc(c.timeout || 60)}"></label>
        <label class="field"><span>启用</span><select id="mEnabled"><option value="true" ${c.enabled ? 'selected' : ''}>是</option><option value="false" ${!c.enabled ? 'selected' : ''}>否</option></select></label>
      </div>
      <button class="btn btn-primary btn-sm" id="mSave">保存</button>`);
    el.querySelector('#mSave').onclick = async () => {
      await call('PUT', '/admin/ai-model', {
        model: el.querySelector('#mModel').value,
        timeout: +el.querySelector('#mTimeout').value,
        enabled: el.querySelector('#mEnabled').value === 'true'
      });
      toast('已保存', 'success');
    };
  }

  async function renderCicd(el) {
    const c = await call('GET', '/admin/cicd');
    el.innerHTML = panel('CI/CD 配置', `
      <div class="form-row">
        <label class="field"><span>流水线模式</span><input id="pPipeline" value="${esc(c.pipeline || '')}"></label>
        <label class="field"><span>自动测试</span><select id="pAuto"><option value="on" ${c.auto_test === 'on' ? 'selected' : ''}>开启</option><option value="off" ${c.auto_test === 'off' ? 'selected' : ''}>关闭</option></select></label>
      </div>
      <button class="btn btn-primary btn-sm" id="pSave">保存</button>`);
    el.querySelector('#pSave').onclick = async () => {
      await call('PUT', '/admin/cicd', { pipeline: el.querySelector('#pPipeline').value, auto_test: el.querySelector('#pAuto').value });
      toast('已保存', 'success');
    };
  }

  async function renderLogs(el) {
    const rows = await call('GET', '/admin/logs');
    el.innerHTML = panel('系统日志', rows.length
      ? table(['时间', '用户', '动作', '详情'], rows.map(l => [
        fmt(l.created_at), esc((window.MockDB.db.users.find(u => u.user_id === l.user_id) || {}).name || '-'),
        esc(l.action_type), esc(l.detail || '')
      ]))
      : empty('暂无日志', '📋'));
  }

  async function renderBackup(el) {
    el.innerHTML = panel('备份与恢复', `
      <p class="meta">演示环境将当前数据导出为 JSON 文件；生产环境由后端执行数据库备份。</p>
      <button class="btn btn-primary" id="bkBtn">下载数据备份（JSON）</button>
      <div class="note warn" style="margin-top:14px">恢复功能：将备份 JSON 写入 localStorage 后刷新即可（可在浏览器控制台执行）。</div>`);
    el.querySelector('#bkBtn').onclick = async () => {
      const r = await call('POST', '/admin/backup', { action: 'backup' });
      const blob = new Blob([JSON.stringify(r.backup, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'smart-learning-backup.json';
      a.click();
      toast('备份已下载', 'success');
    };
  }

  async function renderSecurity(el) {
    const rows = await call('GET', '/admin/security');
    el.innerHTML = panel('安全管理', table(['检查项', '状态'], rows.map(r => [
      esc(r.item),
      r.level === 'ok' ? tag(r.status, 'green') : tag(r.status, 'gold')
    ])) + '<div class="note warn" style="margin-top:12px">演示模式无密码校验；正式部署需启用 JWT、RBAC 与上传内容检测。</div>');
  }

  UI.init({
    role: 'admin', title: '管理端', roleName: '管理员', loginTitle: '管理员登录',
    nav, defaultId: 'overview', render
  });
})();
