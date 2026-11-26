/* 教师端 */
(function () {
  const U = window.UI;
  const { esc, toast, tag, statusTag, pct, fmt, panel, empty, table, call } = U;

  let kpCache = [];

  const nav = [
    { group: '诊断与教学' },
    { id: 'dashboard', icon: '📊', label: '学情看板' },
    { id: 'difficulty', icon: '🎯', label: '重难点诊断' },
    { id: 'pending', icon: '🖊️', label: '主观题复核' },
    { id: 'marks', icon: '🎯', label: '难点标记审核（E4）' },
    { group: '内容与图谱' },
    { id: 'courses', icon: '📚', label: '课程管理' },
    { id: 'resources', icon: '📖', label: '课件与上传' },
    { id: 'graph', icon: '🕸️', label: '图谱构建（E5）' },
    { id: 'annotations', icon: '📝', label: '文本标注' },
    { group: '评测与工具' },
    { id: 'eval', icon: '📐', label: 'AI 评测' },
    { id: 'exam', icon: '📄', label: '真题扫描' },
    { id: 'dialogues', icon: '🤖', label: 'AI 对话' }
  ];

  async function loadKps() {
    if (kpCache.length) return kpCache;
    const tree = await call('GET', '/teacher/courses');
    kpCache = [];
    tree.forEach(c => c.chapters.forEach(ch => ch.knowledge_points.forEach(kp => kpCache.push({ ...kp, chapter: ch.name, course: c.name }))));
    return kpCache;
  }
  function kpOptions() {
    return kpCache.map(k => `<option value="${k.kp_id}">${esc(k.chapter)} / ${esc(k.name)}</option>`).join('');
  }

  async function render(id, el) {
    if (id === 'dashboard') return renderDashboard(el);
    if (id === 'difficulty') return renderDifficulty(el);
    if (id === 'pending') return renderPending(el);
    if (id === 'marks') return renderE4(el);
    if (id === 'courses') return renderCourses(el);
    if (id === 'resources') return renderResources(el);
    if (id === 'graph') return renderGraph(el);
    if (id === 'annotations') return renderAnnotations(el);
    if (id === 'eval') return renderEval(el);
    if (id === 'exam') return renderExam(el);
    if (id === 'dialogues') return renderDialogues(el);
  }

  // ================= 学情看板 =================
  async function renderDashboard(el) {
    const rows = await call('GET', '/teacher/dashboard');
    el.innerHTML = panel('学情看板', `
      <p class="meta">按学生汇总答题、正确率、自评与学习记录；点击“查看画像”进入诊断。</p>
      ${table(['学生', '班级', '答题数', '正确数', '正确率', '自评数', '学习记录', '操作'], rows.map(s => [
        esc(s.name), esc(s.class_id || '-'), s.total_answers, s.correct_answers, pct(s.accuracy),
        s.self_mark_count, s.learning_count,
        `<button class="btn btn-sm" data-profile="${s.user_id}">查看画像</button>`
      ]))}`);
    el.querySelectorAll('[data-profile]').forEach(b => b.onclick = () => {
      toast('可在“重难点诊断”查看该生判定；学生画像页由画模块提供', 'info');
    });
  }

  // ================= 重难点诊断 =================
  async function renderDifficulty(el) {
    const d = await call('GET', '/teacher/difficulty');
    const selfRows = (d.self_marks || []).map(s => [
      esc(s.kp_name), s.count, pct(s.ratio),
      esc((s.reasons || []).join('；') || '-'),
      `一致 ${s.consistency.match} / 冲突 ${s.consistency.conflict}`
    ]);
    el.innerHTML = panel('重难点诊断', `
      <div class="note info">规则版本 <strong>${esc(d.rule_version)}</strong>：准确率第一依据，正确作答时间第二依据（样本 ≥ N）；阈值均为候选值，可在管理端调整。</div>
      <h4>🧩 难题（题目级）</h4>
      ${table(['题目', '知识点', '作答数', '准确率', '正确作答均时', '时间方差（样本/N）', '判定', '依据'], d.questions.map(q => [
        esc((q.title || '').slice(0, 22)), esc(q.kp_name || ''), q.total_answers, q.accuracy != null ? pct(q.accuracy) : '-',
        q.correct_time_mean != null ? q.correct_time_mean + 's' : '-',
        q.correct_time_variance != null ? `${q.correct_time_variance}（${q.correct_time_samples}/${q.min_time_samples}）` : '-',
        q.level === '难题' ? tag('难题', 'red') : tag(q.level, 'gray'),
        esc((q.reasons || []).join('；') || '-')
      ]))}
      <h4>🧱 难点（知识点 · 班级聚合）</h4>
      ${table(['知识点', '作答人数', '薄弱人数', '薄弱占比', '判定', '明细'], d.class_kps.map(k => [
        esc(k.kp_name), k.learned_students, k.weak_count, pct(k.weak_ratio),
        k.level === '难点' ? tag('难点', 'gold') : tag(k.level, 'gray'),
        esc((k.detail || []).map(x => `${(window.MockDB.db.users.find(u => u.user_id === x.user_id) || {}).name}：${x.why}`).join('；') || '-')
      ]))}
      <h4>⭐ 重点（真题分值占比，总分 ${d.key_points.total_score}）</h4>
      ${table(['知识点', '真题分值', '占比', '判定'], d.key_points.items.map(k => [
        esc(k.kp_name), k.score, pct(k.share),
        k.level === '重点' ? tag('重点', 'blue') : tag('普通', 'gray')
      ]))}
      <h4>🙋 学生自主标识（新增）</h4>
      <p class="meta">自评是主观证据，不参与系统判定；教师可结合自评与系统结论安排辅导。</p>
      ${selfRows.length ? table(['知识点', '自评人数', '占比', '理由样例', '与系统判定'], selfRows) : empty('暂无学生自评', '🙋')}
    `);
  }

  // ================= 主观题复核 =================
  async function renderPending(el) {
    const rows = await call('GET', '/teacher/pending-grades');
    if (!rows.length) { el.innerHTML = panel('主观题复核', empty('暂无待复核提交', '✅')); return; }
    el.innerHTML = panel('主观题复核（AI 初判 → 教师改判）', `
      <p class="meta">改判会写入 grade_reviews，原始提交与 AI 初判不可改写；改判后自动重算诊断。</p>
      ${rows.map(a => `<div class="card" style="margin-bottom:12px">
        <strong>${esc(a.student_name)} · ${esc((a.question_title || '').slice(0, 40))}</strong> ${statusTag('PENDING')}
        <p><strong>学生作答：</strong>${esc(a.answer_text)}</p>
        <p class="meta"><strong>参考答案：</strong>${esc((a.reference_answer || '').slice(0, 120))}</p>
        <p class="meta">AI 初判：<strong>${a.ai_score}</strong> 分 ｜ ${esc(a.judge_comment || '')} ｜ 用时 ${a.duration_sec || '-'}s</p>
        <div class="form-row">
          <label class="field"><span>最终得分（0-100）</span><input type="number" id="gs_${a.answer_id}" value="${a.ai_score != null ? a.ai_score : 60}" min="0" max="100"></label>
          <label class="field"><span>复核意见</span><input type="text" id="gc_${a.answer_id}" placeholder="改判理由（留痕）"></label>
        </div>
        <button class="btn btn-primary btn-sm" data-review="${a.answer_id}">确认复核</button>
      </div>`).join('')}`);
    el.querySelectorAll('[data-review]').forEach(b => b.onclick = async () => {
      const id = b.dataset.review;
      const score = parseFloat(el.querySelector(`#gs_${id}`).value);
      const comment = el.querySelector(`#gc_${id}`).value;
      const r = await call('POST', '/teacher/grade-reviews', { answer_id: +id, final_score: score, comment });
      toast(`复核完成，新判定：${r.diagnosis.status}`, 'success');
      renderPending(el);
    });
  }

  // ================= E4 难点标记审核 =================
  async function renderE4(el) {
    const status = el.dataset.status || 'PENDING_REVIEW';
    const marks = await call('GET', `/teacher/difficulty-marks?status=${status}`);
    const tabs = [['PENDING_REVIEW', '待复核'], ['CONFIRMED', '已确认'], ['REJECTED', '已驳回'], ['INSUFFICIENT', '证据不足'], ['', '全部']];
    let html = `<div class="tabs">${tabs.map(t => `<div class="tab ${status === t[0] ? 'active' : ''}" data-st="${t[0]}">${t[1]}</div>`).join('')}</div>
      <p class="meta">E4 五字段标记：observation / evidence / uncertainty / next_check / status。确认或驳回后回写图谱节点属性。</p>`;
    if (!marks.length) html += empty('当前状态无标记', '🎯');
    marks.forEach(mk => {
      html += `<div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:260px">
            <strong>${esc(mk.student_name || '')} · ${esc(mk.kp_name || '')}</strong> ${statusTag(mk.status)}
            <div style="margin-top:4px">${esc(mk.observation || '')}</div>
            <div class="meta">不确定：${esc(mk.uncertainty || '-')} ｜ 下一步：${esc(mk.next_check || '-')} ｜ 证据 ${mk.evidence_count} 条 ｜ 置信度 ${mk.confidence != null ? mk.confidence : '-'}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start">
            <button class="btn btn-sm" data-ev="${mk.mark_id}">查看证据</button>
            <button class="btn btn-sm btn-primary" data-confirm="${mk.mark_id}">确认</button>
            <button class="btn btn-sm btn-danger" data-reject="${mk.mark_id}">驳回</button>
          </div>
        </div>
        <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="meta">调整权重</span>
          <input type="number" id="w_${mk.mark_id}" value="${mk.confidence != null ? mk.confidence : 0.5}" min="0" max="1" step="0.05" style="max-width:100px">
          <button class="btn btn-sm" data-weight="${mk.mark_id}">保存权重</button>
        </div>
        <div id="ev_${mk.mark_id}" style="margin-top:8px"></div>
      </div>`;
    });
    el.innerHTML = panel('难点标记审核（E4）', html);
    el.querySelectorAll('[data-st]').forEach(t => t.onclick = () => { el.dataset.status = t.dataset.st; renderE4(el); });
    el.querySelectorAll('[data-ev]').forEach(b => b.onclick = async () => {
      const d = await call('GET', `/teacher/difficulty-marks/${b.dataset.ev}`);
      const box = el.querySelector(`#ev_${b.dataset.ev}`);
      box.innerHTML = d.evidence && d.evidence.length
        ? table(['题号', '理由原文', '判定'], d.evidence.map(e => [esc(e.question_id), esc(e.reason_text || ''), e.is_correct ? '正确' : '错误']))
        : '<div class="note warn">证据缺失，暂不下结论；不得把结论降级为推测。</div>';
    });
    el.querySelectorAll('[data-confirm]').forEach(b => b.onclick = async () => {
      const raw = window.prompt('复核意见（可空）', '');
      if (raw === null) return;
      const comment = raw;
      await call('POST', `/teacher/difficulty-marks/${b.dataset.confirm}/review`, { decision: 'CONFIRMED', comment });
      toast('已确认，回写图谱节点属性', 'success'); renderE4(el);
    });
    el.querySelectorAll('[data-reject]').forEach(b => b.onclick = async () => {
      const raw = window.prompt('驳回理由', '');
      if (raw === null) return;
      const comment = raw;
      await call('POST', `/teacher/difficulty-marks/${b.dataset.reject}/review`, { decision: 'REJECTED', comment });
      toast('已驳回', 'success'); renderE4(el);
    });
    el.querySelectorAll('[data-weight]').forEach(b => b.onclick = async () => {
      const w = parseFloat(el.querySelector(`#w_${b.dataset.weight}`).value);
      await call('POST', `/teacher/difficulty-marks/${b.dataset.weight}/weight`, { weight: w });
      toast('权重已保存', 'success');
    });
  }

  // ================= 课程管理 =================
  async function renderCourses(el) {
    const tree = await call('GET', '/teacher/courses');
    el.innerHTML = panel('课程管理', `
      <div class="card" style="margin-bottom:14px">
        <div class="form-row">
          <label class="field"><span>课程名称</span><input id="cName" placeholder="如：软件测试"></label>
          <label class="field"><span>学期</span><input id="cTerm" placeholder="2026秋"></label>
        </div>
        <button class="btn btn-primary btn-sm" id="cAdd">新增课程</button>
      </div>
      ${tree.map(c => `<div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <div><strong>${esc(c.name)}</strong> <span class="meta">${esc(c.term || '')}</span></div>
          <button class="btn btn-sm btn-danger" data-dc="${c.course_id}">删除课程</button>
        </div>
        ${c.chapters.map(ch => `<div style="margin-top:8px"><span class="meta">第 ${ch.seq} 章</span> <strong>${esc(ch.name)}</strong>
          <div class="chips" style="margin-top:6px">${ch.knowledge_points.map(k => `<span class="chip">${esc(k.name)}</span>`).join('')}</div></div>`).join('')}
      </div>`).join('')}`);
    el.querySelector('#cAdd').onclick = async () => {
      const name = el.querySelector('#cName').value.trim();
      if (!name) { toast('请输入课程名称', 'error'); return; }
      await call('POST', '/teacher/courses', { name, term: el.querySelector('#cTerm').value.trim() || '2026秋' });
      kpCache = []; toast('课程已新增', 'success'); renderCourses(el);
    };
    el.querySelectorAll('[data-dc]').forEach(b => b.onclick = async () => {
      if (!confirm('删除课程将级联删除其章节、知识点、资源与题目，确定？')) return;
      await call('DELETE', `/teacher/courses/${b.dataset.dc}`);
      kpCache = []; toast('课程已删除', 'success'); renderCourses(el);
    });
  }

  // ================= 课件与上传 =================
  async function renderResources(el) {
    await loadKps();
    const rows = await call('GET', '/teacher/resources');
    const typeName = { video: '视频', image: '图片', doc: '文档' };
    el.innerHTML = panel('课件与资料上传', `
      <div class="card" style="margin-bottom:14px">
        <h4 style="margin-top:0">上传资料（图片 / 视频 / 文档）</h4>
        <div class="form-row">
          <label class="field"><span>知识点</span><select id="upKp">${kpOptions()}</select></label>
          <label class="field"><span>标题（可选）</span><input id="upTitle" placeholder="留空使用文件名"></label>
        </div>
        <label class="field"><span>选择文件（可多选，单文件 ≤ 300MB）</span>
          <input type="file" id="upFiles" multiple accept="image/*,video/*,.pdf,.txt,.md,.ppt,.pptx,.doc,.docx,.xls,.xlsx"></label>
        <button class="btn btn-primary btn-sm" id="upBtn">开始上传</button>
        <span class="meta" id="upMsg" style="margin-left:10px"></span>
      </div>
      ${table(['标题', '知识点', '类型', '文件', '大小', '操作'], rows.map(r => [
        esc(r.title), esc(r.kp_name || ''),
        tag(typeName[r.type] || r.type, r.type === 'video' ? 'blue' : (r.type === 'image' ? 'purple' : 'gray')),
        r.file_url ? `<a class="file-link" href="${esc(r.file_url)}" target="_blank">📎 打开</a>` : '<span class="meta">-</span>',
        r.file_size ? Math.round(r.file_size / 1024) + 'KB' : '-',
        `<button class="btn btn-sm btn-danger" data-del="${r.resource_id}">删除</button>`
      ]))}`);
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('删除资源？')) return;
      await call('DELETE', `/teacher/resources/${b.dataset.del}`);
      toast('已删除', 'success'); renderResources(el);
    });
    el.querySelector('#upBtn').onclick = async () => {
      const input = el.querySelector('#upFiles');
      if (!input.files.length) { toast('请选择文件', 'error'); return; }
      const msg = el.querySelector('#upMsg');
      msg.textContent = '读取文件中…';
      const files = [];
      for (const f of Array.from(input.files)) {
        let dataUrl = null;
        if (f.type.startsWith('image/') && f.size < 300 * 1024) {
          dataUrl = await new Promise(res => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.readAsDataURL(f); });
        }
        files.push({ name: f.name, type: f.type, size: f.size, dataUrl });
      }
      const r = await call('POST', '/teacher/resources/upload', {
        kp_id: +el.querySelector('#upKp').value,
        title: el.querySelector('#upTitle').value.trim(),
        files
      });
      msg.textContent = r.message;
      toast(r.message, 'success');
      renderResources(el);
    };
  }

  // ================= 图谱构建（E5） =================
  async function renderGraph(el) {
    await loadKps();
    const [g, ex] = await Promise.all([call('GET', '/teacher/graph'), call('GET', '/teacher/graph/extractions')]);
    el.innerHTML = panel('知识图谱构建（E5）', `
      <h4>知识点与关系</h4>
      ${table(['源知识点', '关系', '目标知识点', '操作'], g.edges.map(e => [
        esc(e.source_name || ''), tag(e.relation, 'blue'), esc(e.target_name || ''),
        `<button class="btn btn-sm btn-danger" data-delrel="${e.relation_id}">删除</button>`
      ]))}
      <div class="card" style="margin-top:12px">
        <div class="form-row">
          <label class="field"><span>源知识点</span><select id="relSrc">${kpOptions()}</select></label>
          <label class="field"><span>关系</span><select id="relType">
            <option value="prerequisite">先修 prerequisite</option><option value="related">相关 related</option>
            <option value="contains">包含 contains</option></select></label>
          <label class="field"><span>目标知识点</span><select id="relTgt">${kpOptions()}</select></label>
        </div>
        <button class="btn btn-primary btn-sm" id="relAdd">添加关系</button>
      </div>
      <h4>AI 知识点抽取（强制出处）</h4>
      <div class="form-row">
        <label class="field"><span>章节</span><select id="exChapter"><option value="1">软件测试基础</option><option value="2">需求工程</option></select></label>
        <button class="btn btn-sm" id="exRun">运行抽取</button>
      </div>
      ${table(['知识点', '出处片段', '引擎', '状态', '操作'], ex.map((x, i) => [
        esc(x.kp_name), esc((x.source_quote || '').slice(0, 40)), esc(x.engine), tag(x.status, x.status === 'CONFIRMED' ? 'green' : 'gold'),
        x.status === 'PENDING_REVIEW'
          ? `<button class="btn btn-sm btn-primary" data-confirm="${i}">确认</button>
             <button class="btn btn-sm btn-danger" data-reject="${i}">驳回</button>` : '-'
      ]))}`);
    el.querySelectorAll('[data-delrel]').forEach(b => b.onclick = async () => {
      await call('DELETE', `/teacher/graph/relations/${b.dataset.delrel}`);
      toast('关系已删除', 'success'); renderGraph(el);
    });
    el.querySelector('#relAdd').onclick = async () => {
      const src = +el.querySelector('#relSrc').value, tgt = +el.querySelector('#relTgt').value;
      if (src === tgt) { toast('源和目标不能相同', 'error'); return; }
      await call('POST', '/teacher/graph/relations', { source_kp: src, target_kp: tgt, relation: el.querySelector('#relType').value });
      toast('关系已添加', 'success'); renderGraph(el);
    };
    el.querySelector('#exRun').onclick = async () => {
      const r = await call('POST', '/teacher/graph/extractions', { chapter_id: +el.querySelector('#exChapter').value });
      toast(`抽取完成：${r.extractions.length} 个知识点（待审核）`, 'success');
      renderGraph(el);
    };
    el.querySelectorAll('[data-confirm]').forEach(b => b.onclick = async () => {
      await call('POST', `/teacher/graph/extractions/${b.dataset.confirm}/review`, { decision: 'CONFIRMED' });
      toast('已确认', 'success'); renderGraph(el);
    });
    el.querySelectorAll('[data-reject]').forEach(b => b.onclick = async () => {
      await call('POST', `/teacher/graph/extractions/${b.dataset.reject}/review`, { decision: 'REJECTED' });
      toast('已驳回', 'success'); renderGraph(el);
    });
  }

  // ================= 文本标注 =================
  async function renderAnnotations(el) {
    await loadKps();
    el.innerHTML = panel('文本标注', `
      <p class="meta">标注类型：重点 / 难点 / 易错 / 补充；标注会进入诊断证据包。</p>
      <div class="form-row">
        <label class="field"><span>知识点</span><select id="anKp">${kpOptions()}</select></label>
        <label class="field"><span>标注类型</span><select id="anMark">
          <option>重点</option><option>难点</option><option>易错</option><option>补充</option></select></label>
      </div>
      <label class="field"><span>标注内容</span><textarea id="anNote"></textarea></label>
      <button class="btn btn-primary btn-sm" id="anSubmit">提交标注</button>`);
    el.querySelector('#anSubmit').onclick = async () => {
      await call('POST', '/teacher/annotations', {
        kp_id: +el.querySelector('#anKp').value,
        mark: el.querySelector('#anMark').value,
        note: el.querySelector('#anNote').value.trim()
      });
      toast('标注已提交', 'success');
      el.querySelector('#anNote').value = '';
    };
  }

  // ================= AI 评测 =================
  async function renderEval(el) {
    const [ds, runs, llm] = await Promise.all([
      call('GET', '/eval/datasets'), call('GET', '/eval/runs'), call('GET', '/llm-status')
    ]);
    const metricText = (m) => {
      const parts = [];
      if (m.recall != null) parts.push('召回率 ' + Math.round(m.recall * 100) + '%');
      if (m.precision != null) parts.push('准确率 ' + Math.round(m.precision * 100) + '%');
      if (m.source_locatability != null) parts.push('出处可定位 ' + Math.round(m.source_locatability * 100) + '%');
      if (m.relation_accuracy != null) parts.push('关系准确率 ' + Math.round(m.relation_accuracy * 100) + '%');
      return parts.join('，');
    };
    el.innerHTML = panel('AI 评测（评测台账）', `
      <div class="note info">当前引擎：<strong>${esc(llm.engine)}</strong> ｜ 提示词版本：${esc(llm.prompt_version)} ｜ ${esc(llm.detail)}</div>
      <p class="meta">目标（候选值）：召回 ≥80%、准确率 ≥85%、关系准确率 ≥80%、出处可定位 ≥95%。同一标注集重跑，旧记录保留。</p>
      <h4>标注集</h4>
      ${table(['数据集', '类型', '说明', '操作'], ds.map(x => [
        esc(x.name), esc(x.run_type), esc(x.description),
        `<button class="btn btn-sm btn-primary" data-run="${x.run_type}" data-ds="${x.dataset_id}">运行评测</button>`
      ]))}
      <h4>评测台账</h4>
      ${table(['时间', '类型', '引擎', '提示词', '指标', '结论'], runs.map(r => [
        fmt(r.created_at), esc(r.run_type), esc(r.engine), esc(r.prompt || '-'),
        esc(metricText(r.metrics || {})), r.passed ? tag('达标', 'green') : tag('未达标', 'red')
      ]))}`);
    el.querySelectorAll('[data-run]').forEach(b => b.onclick = async () => {
      const r = await call('POST', '/eval/runs', { run_type: b.dataset.run, dataset_id: +b.dataset.ds });
      toast(`评测完成：${r.passed ? '达标' : '未达标'}（${r.engine}）`, r.passed ? 'success' : 'error');
      renderEval(el);
    });
  }

  // ================= 真题扫描 =================
  async function renderExam(el) {
    const papers = await call('GET', '/teacher/exams');
    el.innerHTML = panel('真题卷扫描（重点）', `
      <div class="card" style="margin-bottom:14px">
        <div class="form-row">
          <label class="field"><span>试卷标题</span><input id="pTitle" value="2025年期末真题（示例）"></label>
          <label class="field"><span>年份</span><input id="pYear" placeholder="2025"></label>
        </div>
        <label class="field"><span>试卷文本</span><textarea id="pText" placeholder="粘贴试卷文本，如：一、选择题……关于边界值分析（10分）……"></textarea></label>
        <button class="btn btn-primary btn-sm" id="scanBtn">AI 扫描分值</button>
        <div id="scanResult" style="margin-top:12px"></div>
      </div>
      <h4>真题卷</h4>
      ${table(['试卷', '年份', '来源', '状态', '分值条数', '操作'], papers.map(p => [
        esc(p.title), esc(p.year || '-'), esc(p.scanned_by), tag(p.status, p.status === 'CONFIRMED' ? 'green' : 'gold'),
        window.MockDB.db.examScores.filter(s => s.paper_id === p.paper_id).length,
        p.status === 'PENDING_REVIEW' ? `<button class="btn btn-sm btn-primary" data-confirm="${p.paper_id}">确认采用</button>` : '-'
      ]))}`);
    el.querySelector('#scanBtn').onclick = async () => {
      const text = el.querySelector('#pText').value.trim();
      if (!text) { toast('请输入试卷文本', 'error'); return; }
      const r = await call('POST', '/teacher/exams/scan', {
        title: el.querySelector('#pTitle').value, year: el.querySelector('#pYear').value, paper_text: text
      });
      const html = `<div class="note warn">引擎：${esc(r.engine)} ｜ ${esc(r.message)}</div>
        ${table(['知识点', '分值', '出处'], r.entries.map(e => [esc(e.kp_name), e.score, esc((e.source_quote || '').slice(0, 36))]))}`;
      await renderExam(el);
      const box = el.querySelector('#scanResult');
      if (box) box.innerHTML = html;
    };
    el.querySelectorAll('[data-confirm]').forEach(b => b.onclick = async () => {
      await call('POST', `/teacher/exams/${b.dataset.confirm}/confirm`);
      toast('已确认，重点统计采用人工确认分值', 'success'); renderExam(el);
    });
  }

  // ================= AI 对话 =================
  async function renderDialogues(el) {
    const rows = await call('GET', '/teacher/ai-dialogues');
    el.innerHTML = panel('AI 助教对话记录', rows.length
      ? table(['学生', '内容', '时间'], rows.map(r => [esc(r.student_name || '-'), esc(r.detail || ''), fmt(r.created_at)]))
      : empty('暂无对话记录', '🤖'));
  }

  UI.init({
    role: 'teacher', title: '教师端', roleName: '教师', loginTitle: '教师登录',
    nav, defaultId: 'dashboard', render
  });
})();
