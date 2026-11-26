/* 学生端 */
(function () {
  const U = window.UI;
  const { esc, toast, tag, statusTag, pct, fmt, panel, empty, table, call } = U;

  let learnTab = 'structure';
  let resourceKp = '';
  let courses = [];
  let quiz = null; // { attemptId, kpId, questions, timers:{} }

  const nav = [
    { group: '学习' },
    { id: 'learn', icon: '📚', label: '课程学习' },
    { id: 'diagnosis', icon: '🔍', label: '诊断结果' },
    { id: 'marks', icon: '👤', label: '个人画像（画）' },
    { id: 'recommend', icon: '💡', label: '学习推荐（荐）' },
    { id: 'actions', icon: '📝', label: '学习记录（干）' },
    { group: '辅助' },
    { id: 'ai', icon: '🤖', label: 'AI 助教' },
    { id: 'graph', icon: '🕸️', label: '知识图谱' },
    { id: 'behavior', icon: '📝', label: '行为记录' }
  ];

  async function render(id, el) {
    if (id === 'learn') return renderLearn(el);
    if (id === 'diagnosis') return renderDiagnosis(el);
    if (id === 'marks') return renderMarks(el);
    if (id === 'recommend') return renderRecommend(el);
    if (id === 'actions') return renderActions(el);
    if (id === 'ai') return renderAI(el);
    if (id === 'graph') return renderGraph(el);
    if (id === 'behavior') return renderBehavior(el);
  }

  async function loadCourses() {
    if (!courses.length) courses = await call('GET', '/student/courses');
    return courses;
  }
  function kpOptions(selected) {
    let html = '<option value="">全部知识点</option>';
    courses.forEach(c => c.chapters.forEach(ch => ch.knowledge_points.forEach(kp => {
      html += `<option value="${kp.kp_id}" ${String(selected) === String(kp.kp_id) ? 'selected' : ''}>${esc(ch.name)} / ${esc(kp.name)}</option>`;
    })));
    return html;
  }
  function allKps() {
    const list = [];
    courses.forEach(c => c.chapters.forEach(ch => ch.knowledge_points.forEach(kp => list.push({ ...kp, chapter: ch.name }))));
    return list;
  }

  // ================= 课程学习 =================
  async function renderLearn(el) {
    await loadCourses();
    const tabs = [
      { id: 'structure', label: '📋 课程结构' },
      { id: 'resources', label: '📖 课件资源' },
      { id: 'videos', label: '🎬 教学视频' },
      { id: 'quiz', label: '✍️ 单元测验' }
    ];
    el.innerHTML = panel('课程学习', `
      <div class="tabs">${tabs.map(t => `<div class="tab ${learnTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</div>`).join('')}</div>
      <div id="learnBody"></div>`);
    el.querySelectorAll('.tab').forEach(t => t.onclick = () => { learnTab = t.dataset.tab; renderLearn(el); });
    const body = el.querySelector('#learnBody');
    if (learnTab === 'structure') return renderStructure(body);
    if (learnTab === 'resources') return renderResources(body);
    if (learnTab === 'videos') return renderVideos(body);
    if (learnTab === 'quiz') return renderQuiz(body);
  }

  async function renderStructure(el) {
    const data = await loadCourses();
    let html = '';
    data.forEach(c => {
      html += `<div class="panel"><h3>${esc(c.name)} <span class="meta">${esc(c.term)}</span></h3>`;
      c.chapters.forEach(ch => {
        html += `<h4>${esc(ch.name)}</h4>`;
        ch.knowledge_points.forEach(kp => {
          const p = kp.learning || { total: 0, completed: 0, learned_all: false };
          const marked = !!(kp.self_mark && kp.self_mark.status === 'ACTIVE');
          html += `<div class="card" style="margin-bottom:10px">
            <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">
              <div style="flex:1;min-width:220px">
                <strong>${esc(kp.name)}</strong>
                ${marked ? ' <span class="tag tag-red">已标薄弱</span>' : ''}
                <div class="meta">${esc(kp.description || '')}</div>
                <div class="meta" style="margin-top:6px">资料完成 ${p.completed}/${p.total} ${p.learned_all ? '· <span style="color:#2f6b3a">已学完，可练习</span>' : ''}</div>
                <div class="progress" style="max-width:280px;margin-top:6px"><i style="width:${p.total ? Math.round(p.completed / p.total * 100) : 0}%"></i></div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-sm" data-res="${kp.kp_id}">学习资料</button>
                <button class="btn btn-sm" data-quiz="${kp.kp_id}">开始测验</button>
                ${marked
                  ? `<button class="btn btn-sm btn-danger" data-unmark="${kp.kp_id}">取消薄弱标识</button>`
                  : `<button class="btn btn-sm btn-primary" data-mark="${kp.kp_id}">标为薄弱</button>`}
              </div>
            </div>
            ${marked && kp.self_mark.reason ? `<div class="note warn" style="margin-top:8px">自评理由：${esc(kp.self_mark.reason)}</div>` : ''}
          </div>`;
        });
      });
      html += '</div>';
    });
    el.innerHTML = html;
    el.querySelectorAll('[data-res]').forEach(b => b.onclick = () => { learnTab = 'resources'; resourceKp = b.dataset.res; renderLearn(el.closest('.content')); });
    el.querySelectorAll('[data-quiz]').forEach(b => b.onclick = () => { learnTab = 'quiz'; startQuiz(b.dataset.quiz); renderLearn(el.closest('.content')); });
    el.querySelectorAll('[data-mark]').forEach(b => b.onclick = () => markWeak(b.dataset.mark, el));
    el.querySelectorAll('[data-unmark]').forEach(b => b.onclick = () => unmarkWeak(b.dataset.unmark, el));
  }

  async function markWeak(kpId, el) {
    const reason = window.prompt('为什么觉得这个知识点薄弱？（可空，最多 200 字）', '');
    if (reason === null) return;
    await call('POST', '/student/self-marks', { kp_id: +kpId, reason: reason.slice(0, 200) });
    toast('已标记为薄弱，诊断页可查看对比', 'success');
    courses = [];
    renderLearn(el.closest('.content'));
  }
  async function unmarkWeak(kpId, el) {
    await call('DELETE', `/student/self-marks/${kpId}`);
    toast('已取消薄弱标识', 'success');
    courses = [];
    renderLearn(el.closest('.content'));
  }

  async function renderResources(el) {
    await loadCourses();
    const kpId = resourceKp || '';
    const rows = await call('GET', '/student/resources' + (kpId ? `?kp_id=${kpId}` : ''));
    const typeName = { video: '🎬 视频', image: '🖼️ 图片', doc: '📖 文档' };
    let html = `<div class="form-row" style="margin-bottom:12px">
      <label class="field"><span>按知识点筛选</span><select id="resKp">${kpOptions(kpId)}</select></label>
    </div>`;
    html += rows.length ? table(['标题', '知识点', '类型', '进度', '操作'], rows.map(r => [
      `<strong>${esc(r.title)}</strong>${r.file_name ? ' <span class="tag tag-blue">文件</span>' : ''}`,
      esc(r.kp_name || '-'), typeName[r.type] || esc(r.type),
      `${r.progress_pct || 0}%`,
      `<button class="btn btn-sm" data-view="${r.resource_id}">查看</button>
       <button class="btn btn-sm btn-primary" data-done="${r.resource_id}">完成学习</button>`
    ])) : empty('该知识点暂无资料');
    html += '<div id="resDetail" style="margin-top:14px"></div>';
    el.innerHTML = html;
    el.querySelector('#resKp').onchange = (e) => { resourceKp = e.target.value; renderResources(el); };
    el.querySelectorAll('[data-done]').forEach(b => b.onclick = async () => {
      await call('POST', '/student/learning-progress', { resource_id: +b.dataset.done, progress_pct: 100, duration_sec: 120 });
      toast('已记录学习完成', 'success'); renderResources(el);
    });
    el.querySelectorAll('[data-view]').forEach(b => b.onclick = async () => {
      const r = await call('GET', `/student/resources/${b.dataset.view}`);
      const box = el.querySelector('#resDetail');
      let media = '';
      if (r.file_url && r.type === 'video') media = `<video class="media" controls src="${esc(r.file_url)}"></video>`;
      else if (r.file_url && r.type === 'image') media = `<img src="${esc(r.file_url)}" style="max-width:100%;border-radius:9px">`;
      else if (r.file_url && /\.pdf$/i.test(r.file_url)) media = `<iframe src="${esc(r.file_url)}" style="width:100%;height:480px;border:1px solid #d7e0e6;border-radius:9px"></iframe>`;
      else if (r.file_url) media = `<p><a class="file-link" href="${esc(r.file_url)}" target="_blank">📎 打开文件</a></p>`;
      box.innerHTML = panel(r.title, `${media}<div class="meta" style="margin:8px 0">${esc(r.kp_name || '')} · ${typeName[r.type] || r.type}</div>
        <div style="white-space:pre-wrap">${esc(r.content || '（暂无文字内容）')}</div>`);
    });
  }

  async function renderVideos(el) {
    const rows = await call('GET', '/student/videos');
    if (!rows.length) { el.innerHTML = empty('暂无视频资源（教师端上传后显示）', '🎬'); return; }
    el.innerHTML = rows.map(v => `<div class="card" style="margin-bottom:12px">
      <strong>${esc(v.title)}</strong><div class="meta">${esc(v.kp_name || '')}</div>
      ${v.file_url ? `<video class="media" controls src="${esc(v.file_url)}"></video>` : '<div class="note warn">演示数据：暂无视频文件</div>'}
    </div>`).join('');
  }

  function startQuiz(kpId) {
    quiz = { kpId, attemptId: null, questions: [], timers: {} };
    call('POST', '/student/attempts', { kp_id: +kpId }).then(r => {
      quiz.attemptId = r.attempt_id;
      return call('GET', `/student/quiz/${kpId}`);
    }).then(d => {
      quiz.questions = d.questions;
      quiz.learning = d.learning;
      quiz.questions.forEach(q => quiz.timers[q.question_id] = Date.now());
      const container = document.querySelector('#learnBody');
      if (container) renderQuiz(container);
    }).catch(() => {});
  }

  async function renderQuiz(el) {
    await loadCourses();
    if (!quiz) {
      el.innerHTML = `<p class="meta">选择知识点开始测验（答完可查看诊断）</p><div class="chips">
        ${allKps().map(kp => `<div class="chip" data-start="${kp.kp_id}">${esc(kp.name)}</div>`).join('')}
      </div>`;
      el.querySelectorAll('[data-start]').forEach(c => c.onclick = () => startQuiz(c.dataset.start));
      return;
    }
    if (!quiz.questions.length) {
      el.innerHTML = '<div class="panel"><p class="meta">题目加载中…</p></div>';
      return;
    }
    let html = '';
    if (quiz.learning) {
      html += quiz.learning.learned_all
        ? `<div class="note ok">✅ 本知识点资料已学完（${quiz.learning.completed}/${quiz.learning.total}），可以直接练习</div>`
        : `<div class="note warn">⚠️ 建议先学完资料再练习（已学 ${quiz.learning.completed}/${quiz.learning.total}）</div>`;
    }
    quiz.questions.forEach((q, i) => {
      const isSubj = q.type !== 'choice' && q.type !== 'judge';
      html += `<div class="card" style="margin-top:12px" data-qcard="${q.question_id}">
        <strong>Q${i + 1}. ${esc(q.title)}</strong>
        <span class="tag tag-gray">${isSubj ? '主观题' : '选择题'}</span>
        <span class="timer" data-timer="${q.question_id}">⏱ 0s</span>`;
      if (q.options) {
        html += q.options.map(o => `<div style="margin:4px 0"><label><input type="radio" name="q${q.question_id}" value="${esc(o)}"> ${esc(o)}</label></div>`).join('');
      } else {
        html += `<textarea id="ans_${q.question_id}" placeholder="输入你的答案（主观题由 AI 初判，教师复核）"></textarea>`;
      }
      html += `<textarea id="reason_${q.question_id}" placeholder="作答理由（可选，但会作为证据保留）"></textarea>
        <div style="margin-top:8px"><button class="btn btn-primary btn-sm" data-answer="${q.question_id}">提交本题</button>
        <span id="result_${q.question_id}" style="margin-left:8px"></span></div></div>`;
    });
    html += `<div style="margin-top:14px"><button class="btn btn-primary" id="submitAttempt">提交本次测验</button></div>`;
    el.innerHTML = html;
    // 计时
    const tick = setInterval(() => {
      quiz.questions.forEach(q => {
        const t = Math.floor((Date.now() - quiz.timers[q.question_id]) / 1000);
        const node = el.querySelector(`[data-timer="${q.question_id}"]`);
        if (node) node.textContent = `⏱ ${t}s`;
      });
    }, 1000);
    el._timer = tick;
    el.querySelectorAll('[data-answer]').forEach(b => b.onclick = async () => {
      const qid = +b.dataset.answer;
      const selected = el.querySelector(`input[name="q${qid}"]:checked`);
      const ansEl = el.querySelector(`#ans_${qid}`);
      const answer = selected ? selected.value : (ansEl ? ansEl.value : '');
      if (!answer) { toast('请先选择或输入答案', 'error'); return; }
      const reason = (el.querySelector(`#reason_${qid}`) || {}).value || '';
      const duration = Math.max(1, Math.floor((Date.now() - quiz.timers[qid]) / 1000));
      try {
        const r = await call('POST', `/student/attempts/${quiz.attemptId}/answers`, {
          question_id: qid, answer_text: answer, reason_text: reason, duration_sec: duration
        });
        const res = el.querySelector(`#result_${qid}`);
        if (r.judge_type === 'AI') res.innerHTML = `<span class="tag tag-gold">AI 初判 ${r.score} 分 · 待教师复核</span>`;
        else res.innerHTML = `<span class="tag tag-${r.is_correct ? 'green' : 'red'}">${r.is_correct ? '正确' : '错误'} · 程序判分</span> <span class="meta">用时 ${duration}s</span>`;
        b.disabled = true;
      } catch (e) { /* toast 已处理 */ }
    });
    el.querySelector('#submitAttempt').onclick = async () => {
      clearInterval(el._timer);
      const r = await call('POST', `/student/attempts/${quiz.attemptId}/submit`);
      toast(`测验已提交，平均得分 ${r.score}`, 'success');
      quiz = null;
      renderLearn(el.closest('.content'));
    };
  }

  // ================= 诊断结果 =================
  async function renderDiagnosis(el) {
    await loadCourses();
    const kps = allKps();
    const selected = el.dataset.kp || (kps[0] && kps[0].kp_id);
    const opts = kps.map(k => `<option value="${k.kp_id}" ${String(k.kp_id) === String(selected) ? 'selected' : ''}>${esc(k.name)}</option>`).join('');
    let html = `<div class="form-row" style="margin-bottom:12px"><label class="field"><span>选择知识点</span>
      <select id="diagKp">${opts}</select></label></div><div id="diagBody"></div>`;
    el.innerHTML = panel('诊断结果', html);
    el.querySelector('#diagKp').onchange = (e) => { el.dataset.kp = e.target.value; renderDiagnosis(el); };
    const d = await call('GET', `/student/diagnosis?kp_id=${selected}`);
    const sys = d.system;
    const time = sys.time || {};
    const self = d.self_mark;
    el.querySelector('#diagBody').innerHTML = `
      <div class="grid grid-3">
        <div class="card ${sys.status === 'MASTERED' ? 'green' : (sys.status === 'INSUFFICIENT' ? 'gold' : 'red')}">
          <div class="k">系统判定</div><div class="v" style="font-size:18px">${statusTag(sys.status)}</div>
          <div class="meta">准确率 ${pct(sys.accuracy)} · 作答 ${sys.attempts} 次 · 正确 ${sys.correct} 次</div>
        </div>
        <div class="card blue"><div class="k">正确作答时间（第二依据）</div>
          <div class="v" style="font-size:18px">${time.ratio != null ? '比值 ' + time.ratio : (time.samples != null ? '样本 ' + time.samples + '/' + time.min_samples : '-')}</div>
          <div class="meta">我的均时 ${time.my_mean != null ? time.my_mean + 's' : '-'} · 班级均时 ${time.class_mean != null ? time.class_mean + 's' : '-'}</div>
        </div>
        <div class="card ${d.consistency === 'CONFLICT' ? 'red' : (d.consistency === 'MATCH' ? 'green' : 'gold')}">
          <div class="k">自评一致度</div><div class="v" style="font-size:18px">${statusTag(d.consistency)}</div>
          <div class="meta">${self ? '自评理由：' + esc(self.reason || '（无）') : '尚未自主标识'}</div>
        </div>
      </div>
      <div class="grid grid-2" style="margin-top:14px">
        <div class="card">
          <h4>我的自评</h4>
          ${self ? `<p>${statusTag('ACTIVE')} ${esc(self.reason || '（无理由）')} <span class="meta">${fmt(self.updated_at)}</span></p>
            <button class="btn btn-sm btn-danger" id="cancelMark">取消自评</button>`
            : `<p class="meta">如果你觉得自己这一知识点薄弱，可以主动标记（不改变系统判定）</p>
              <textarea id="markReason" placeholder="理由（可空）"></textarea>
              <button class="btn btn-sm btn-primary" id="addMark" style="margin-top:8px">标为薄弱</button>`}
        </div>
        <div class="card">
          <h4>证据包</h4>
          <div class="kv"><span class="k">证据来源</span><span>答题记录 + 正确作答时间 + 图谱 + 文本标注</span></div>
          <div class="kv"><span class="k">时间样本门槛 N</span><span>${time.min_samples != null ? time.min_samples : '-'}</span></div>
          <div class="kv"><span class="k">规则版本</span><span>${esc(sys.rule_version)}</span></div>
          <div class="kv"><span class="k">证据不足说明</span><span>${sys.status === 'INSUFFICIENT' ? '不判掌握差，仅提示补充证据' : '证据充分'}</span></div>
        </div>
      </div>
      <h4>作答证据（可回溯）</h4>
      ${d.evidence.length ? table(['题目', '你的答案', '结果', '得分', '理由', '用时'], d.evidence.map(a => [
        esc(a.question_title || '-'), esc(a.answer_text), a.is_correct === 1 ? '✅' : (a.is_correct === 0 ? '❌' : '待复核'),
        a.final_score != null ? a.final_score : '-', esc((a.reason_text || '').slice(0, 30)),
        a.duration_sec != null ? a.duration_sec + 's' : '-'
      ])) : empty('该知识点暂无作答记录')}`;
    const add = el.querySelector('#addMark');
    if (add) add.onclick = async () => {
      const reason = (el.querySelector('#markReason') || {}).value || '';
      await call('POST', '/student/self-marks', { kp_id: +selected, reason });
      toast('已标记为薄弱', 'success'); renderDiagnosis(el);
    };
    const cancel = el.querySelector('#cancelMark');
    if (cancel) cancel.onclick = async () => {
      await call('DELETE', `/student/self-marks/${selected}`);
      toast('已取消自评', 'success'); renderDiagnosis(el);
    };
  }

  // ================= 画：DifficultyMark =================
  const ACTION_NAME = { RETRY_QUESTION: '回原题', GO_PRACTICE: '去练习', ASK_TEACHER: '问老师' };

  async function logAction(markId, action, source) {
    await call('POST', '/student/actions', { mark_id: markId, action, source_page: source || 'mark_detail' });
    toast(`已记录动作：${ACTION_NAME[action]}`, 'success');
  }

  async function renderMarks(el) {
    const scope = el.dataset.scope || 'my';
    const status = el.dataset.status || '';
    const list = await call('GET', `/student/marks?scope=${scope}${status ? '&status=' + status : ''}`);
    const statusOptions = [['', '全部状态'], ['PENDING_REVIEW', '待复核'], ['CONFIRMED', '已确认'], ['REJECTED', '已驳回'], ['INSUFFICIENT', '证据不足']];
    let html = `<div class="chips" style="margin-bottom:10px">
      <div class="chip ${scope === 'my' ? 'active' : ''}" data-scope="my">我的</div>
      <div class="chip ${scope === 'class' ? 'active' : ''}" data-scope="class">班级</div>
      <select id="markStatus" style="max-width:150px;margin-left:8px">${statusOptions.map(o => `<option value="${o[0]}" ${status === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>
    </div>`;
    if (!list.length) {
      html += empty('暂无标记；完成练习后由 E4 生成，或先完成一次补证', '🖼️');
      html += `<div class="note info">没有标记时页面不猜测、不用行为数据补；可点击下方“去补证”完成一次练习。</div>
        <button class="btn btn-primary btn-sm" data-goto-learn>去补证</button>`;
    } else {
      html += list.map(mk => `<div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:240px">
            <strong>${esc(mk.kp_name || '')}</strong> ${statusTag(mk.status)}
            <div style="margin-top:4px">${esc(mk.observation || '')}</div>
            <div class="meta" style="margin-top:4px">不确定：${esc(mk.uncertainty || '-')} ｜ 下一步：${esc(mk.next_check || '-')}</div>
            <div class="meta">证据 ${mk.evidence_count} 条 ｜ 置信度 ${mk.confidence != null ? mk.confidence : '-'}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start">
            <button class="btn btn-sm" data-detail="${mk.mark_id}">查看详情</button>
            <button class="btn btn-sm" data-act="RETRY_QUESTION" data-mark="${mk.mark_id}">回原题</button>
            <button class="btn btn-sm btn-primary" data-practice="${mk.mark_id}">去练习</button>
            <button class="btn btn-sm" data-act="ASK_TEACHER" data-mark="${mk.mark_id}">问老师</button>
          </div>
        </div>
        <div id="mark_${mk.mark_id}" style="margin-top:10px"></div>
      </div>`).join('');
    }
    el.innerHTML = panel('个人画像（画）', `
      <p class="meta">只读展示 E4 五字段标记；证据不足显示灰色，不出现“掌握度低/差”等词。</p>${html}`);
    el.querySelectorAll('[data-scope]').forEach(c => c.onclick = () => { el.dataset.scope = c.dataset.scope; renderMarks(el); });
    const sel = el.querySelector('#markStatus');
    if (sel) sel.onchange = () => { el.dataset.status = sel.value; renderMarks(el); };
    const goLearn = el.querySelector('[data-goto-learn]');
    if (goLearn) goLearn.onclick = () => toast('请到“课程学习 → 单元测验”完成一次练习', 'info');
    el.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
      await logAction(b.dataset.mark, b.dataset.act);
    });
    el.querySelectorAll('[data-detail]').forEach(b => b.onclick = async () => {
      const id = b.dataset.detail;
      const d = await call('GET', `/student/marks/${id}`);
      await call('POST', `/student/marks/${id}/view`, { scope: 'MY', filter_hash: 'detail' });
      const box = el.querySelector(`#mark_${id}`);
      box.innerHTML = `<div class="card blue">
        <div class="kv"><span class="k">observation</span><span>${esc(d.observation || '-')}</span></div>
        <div class="kv"><span class="k">uncertainty</span><span>${esc(d.uncertainty || '-')}</span></div>
        <div class="kv"><span class="k">next_check</span><span>${esc(d.next_check || '-')}</span></div>
        <div class="kv"><span class="k">status</span><span>${statusTag(d.status)}</span></div>
        <div class="kv"><span class="k">证据来源</span><span>${esc((d.evidence_source || []).join(' / ') || '-')}</span></div>
        <h4>证据深链</h4>
        ${d.evidence.length ? table(['题号', '理由原文', '判定'], d.evidence.map(e => [
          esc(e.question_id), esc(e.reason_text || ''), e.is_correct ? '正确' : '错误'
        ])) : '<div class="note warn">证据缺失，暂不下结论；保留标记与题号，待补证后重新生成。</div>'}
      </div>`;
    });
    el.querySelectorAll('[data-practice]').forEach(b => b.onclick = async () => {
      const id = b.dataset.practice;
      const r = await call('POST', '/student/recommend-requests', { mark_id: id, kp_ids: [], limit: 3 });
      const box = el.querySelector(`#mark_${id}`);
      if (r.degraded) {
        box.innerHTML = `<div class="note warn">暂无可用练习（${r.state}）。请先完成补证：${esc((list.find(x => x.mark_id === id) || {}).next_check || '')}</div>`;
      } else {
        box.innerHTML = `<div class="note ok">推荐 ${r.items.length} 条（state=${r.state}）</div>
          ${table(['类型', '知识点', '预计时长'], r.items.map(i => [esc(i.type), esc((window.MockDB.db.kps.find(k => k.kp_id === i.kp_id) || {}).name || ''), (i.est_minutes || '-') + ' 分钟']))}`;
      }
      await logAction(id, 'GO_PRACTICE', 'mark_detail');
    });
  }

  // ================= 荐：推荐请求 =================
  async function renderRecommend(el) {
    const marks = await call('GET', '/student/marks?scope=my');
    const reqs = await call('GET', '/student/recommend-requests');
    const usable = marks.filter(m => m.status !== 'INSUFFICIENT');
    el.innerHTML = panel('学习推荐（荐）', `
      <p class="meta">按薄弱点推练习：同步请求，800ms 内给不出就降级为 next_check，不出现空白或报错。</p>
      ${usable.length ? `<div class="form-row">
        <label class="field"><span>选择标记</span><select id="recMark">${usable.map(m => `<option value="${m.mark_id}">${esc(m.kp_name)} · ${esc(m.observation)}</option>`).join('')}</select></label>
      </div>
      <button class="btn btn-primary btn-sm" id="recBtn">获取推荐</button>
      <div id="recResult" style="margin-top:12px"></div>` : empty('暂无可推荐标记', '💡')}
      <h4>推荐请求历史</h4>
      ${reqs.length ? table(['时间', '标记', '状态', '降级', '候选数'], reqs.map(r => [
        fmt(r.created_at), esc(r.mark_id), tag(r.state, r.state === 'SERVED' || r.state === 'ADOPTED' ? 'green' : (r.state === 'DEGRADED' ? 'gold' : 'gray')),
        r.degraded ? '是' : '否', (r.items || []).length
      ])) : empty('暂无请求', '💡')}`);
    const btn = el.querySelector('#recBtn');
    if (btn) btn.onclick = async () => {
      const r = await call('POST', '/student/recommend-requests', { mark_id: el.querySelector('#recMark').value, kp_ids: [], limit: 3 });
      el.querySelector('#recResult').innerHTML = r.degraded
        ? `<div class="note warn">降级（${r.state}）：暂无可用练习，请先完成 next_check 补证。</div>`
        : `<div class="note ok">返回 ${r.items.length} 条候选（${r.state}）</div>
           ${table(['类型', '知识点', '预计时长'], r.items.map(i => [esc(i.type), esc((window.MockDB.db.kps.find(k => k.kp_id === i.kp_id) || {}).name || ''), (i.est_minutes || '-') + ' 分钟']))}`;
      toast('推荐结果已返回', 'success');
    };
  }

  // ================= 干：动作记录 =================
  async function renderActions(el) {
    const [marks, logs] = await Promise.all([
      call('GET', '/student/marks?scope=my'),
      call('GET', '/student/actions')
    ]);
    el.innerHTML = panel('学习记录（干）', `
      <p class="meta">三个动作入口：回原题 / 去练习 / 问老师。只记录“谁、何时、从哪条标记发起”，不改标记结论。</p>
      ${marks.length ? `<div class="card" style="margin-bottom:12px">
        <label class="field"><span>选择标记</span><select id="actMark">${marks.map(m => `<option value="${m.mark_id}">${esc(m.kp_name)} · ${esc(m.observation)}</option>`).join('')}</select></label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm" data-action="RETRY_QUESTION">回原题</button>
          <button class="btn btn-sm btn-primary" data-action="GO_PRACTICE">去练习</button>
          <button class="btn btn-sm" data-action="ASK_TEACHER">问老师</button>
        </div>
      </div>` : empty('暂无可操作的标记', '📝')}
      <h4>动作记录</h4>
      ${logs.length ? table(['时间', '标记', '动作', '来源页面'], logs.map(l => [
        fmt(l.created_at), esc(l.mark_id || '-'), esc(ACTION_NAME[l.action] || l.action), esc(l.source_page || '-')
      ])) : empty('暂无动作记录', '📝')}`);
    el.querySelectorAll('[data-action]').forEach(b => b.onclick = async () => {
      const markId = el.querySelector('#actMark') ? el.querySelector('#actMark').value : null;
      await logAction(markId, b.dataset.action, 'action_page');
      renderActions(el);
    });
  }

  // ================= AI 助教 =================
  async function renderAI(el) {
    await loadCourses();
    el.innerHTML = panel('AI 助教', `
      <div class="form-row"><label class="field"><span>知识点</span><select id="aiKp">${kpOptions('')}</select></label></div>
      <label class="field"><span>你的问题</span><textarea id="aiQ" placeholder="例如：边界值分析和等价类划分有什么区别？"></textarea></label>
      <button class="btn btn-primary" id="askBtn">提问</button>
      <div id="aiA" style="margin-top:14px"></div>`);
    el.querySelector('#askBtn').onclick = async () => {
      const q = el.querySelector('#aiQ').value.trim();
      if (!q) { toast('请输入问题', 'error'); return; }
      const r = await call('POST', '/student/ai/ask', { kp_id: +el.querySelector('#aiKp').value || null, question: q });
      el.querySelector('#aiA').innerHTML = `<div class="card"><div class="meta">引擎：${tag(r.engine === 'LLM' ? 'Claude' : '规则回退', r.engine === 'LLM' ? 'green' : 'gold')}</div>
        <div style="white-space:pre-wrap;margin-top:8px">${esc(r.answer)}</div></div>`;
    };
  }

  // ================= 知识图谱 =================
  async function renderGraph(el) {
    const g = await call('GET', '/student/graph');
    const nodes = g.nodes || [], edges = g.edges || [];
    const W = 720, H = 380, cx = W / 2, cy = H / 2, R = 130;
    const pos = {};
    nodes.forEach((n, i) => {
      const a = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      pos[n.kp_id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
    });
    const lines = edges.map(e => {
      const p1 = pos[e.source_kp], p2 = pos[e.target_kp];
      if (!p1 || !p2) return '';
      return `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="#9fb3bf" stroke-width="1.4"/>`;
    }).join('');
    const dots = nodes.map(n => {
      const p = pos[n.kp_id];
      return `<circle cx="${p.x}" cy="${p.y}" r="26" fill="#e7f5f1" stroke="#007c78" stroke-width="2"/>
        <text x="${p.x}" y="${p.y + 4}" text-anchor="middle" font-size="11" fill="#172e3d">${esc(n.name.slice(0, 6))}</text>`;
    }).join('');
    el.innerHTML = panel('知识图谱', `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:760px;background:#fbfdfd;border-radius:10px">${lines}${dots}</svg>
      ${table(['源知识点', '关系', '目标知识点'], edges.map(e => [esc(e.source_name || ''), tag(e.relation, 'blue'), esc(e.target_name || '')]))}`);
  }

  // ================= 行为记录 =================
  async function renderBehavior(el) {
    const d = await call('GET', '/student/behavior');
    el.innerHTML = panel('答题与学习记录', `
      <h4>作答记录</h4>
      ${table(['题目', '答案', '结果', '得分', '理由', '用时', '时间'], d.answers.map(a => {
        const q = (window.MockDB.db.questions.find(x => x.question_id === a.question_id) || {});
        return [esc((q.title || '').slice(0, 24)), esc(a.answer_text),
          a.is_correct === 1 ? '✅' : (a.is_correct === 0 ? '❌' : statusTag(a.review_status)),
          a.final_score != null ? a.final_score : '-', esc((a.reason_text || '').slice(0, 20)),
          a.duration_sec != null ? a.duration_sec + 's' : '-', fmt(a.created_at)];
      }))}
      <h4>学习进度</h4>
      ${table(['资料', '进度'], d.learning.map(x => [esc(x.resource_title || ''), `${x.progress_pct}%`]))}`);
  }

  UI.init({
    role: 'student', title: '学生端', roleName: '学生', loginTitle: '学生登录',
    nav, defaultId: 'learn', render
  });
})();
