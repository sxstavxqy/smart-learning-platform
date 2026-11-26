/* 前端 Mock API：按《前后端接口设计.md》实现，localStorage 持久化。
   后端就绪后，把 api() 换成真实 fetch 即可，页面代码不变。 */
(function () {
  const DB = () => window.MockDB.db;
  const save = () => window.MockDB.save();
  const now = () => new Date().toISOString();
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const r1 = (x) => Math.round(x * 10) / 10;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const clone = (x) => JSON.parse(JSON.stringify(x));

  const SESSION_KEY = 'smart-learning-session';
  function currentUser() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return DB().users.find(u => u.user_id === s.user_id) || null;
    } catch (e) { return null; }
  }
  function setSession(user) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user_id: user.user_id, token: 'demo-' + user.user_id }));
  }
  function clearSession() { sessionStorage.removeItem(SESSION_KEY); }

  function fail(code, message) {
    const e = new Error(message);
    e.code = code;
    throw e;
  }
  function requireUser(role) {
    const u = currentUser();
    if (!u) fail(40101, '未登录，请先登录');
    if (role && u.role !== role) fail(40301, '无权限');
    return u;
  }

  // ---------- 业务计算 ----------
  function isCorrect(a) {
    return a.is_correct === 1 || (a.is_correct === null && (a.final_score || 0) >= 60);
  }
  function kpOf(id) { return DB().kps.find(k => k.kp_id === id); }
  function userOf(id) { return DB().users.find(u => u.user_id === id); }
  function activeMark(uid, kpId) {
    return DB().selfMarks.find(m => m.user_id === uid && m.kp_id === kpId && m.status === 'ACTIVE') || null;
  }
  function consistency(system, mark) {
    if (!mark) return 'NONE';
    if (system.status === 'WEAK_ACCURACY' || system.status === 'WEAK_TIME') return 'MATCH';
    if (system.status === 'MASTERED') return 'CONFLICT';
    return 'UNKNOWN';
  }

  function diagnoseFor(uid, kpId) {
    const cfg = DB().config;
    const rows = DB().answers.filter(a => a.user_id === uid && a.kp_id === kpId);
    const total = rows.length;
    const correct = rows.filter(isCorrect).length;
    const base = { kp_id: kpId, kp_name: (kpOf(kpId) || {}).name, attempts: total, correct, rule_version: 'v2-candidate', judged_at: now() };
    if (!total) return { ...base, status: 'INSUFFICIENT', accuracy: null, time: {} };
    const accuracy = correct / total;
    const times = rows.filter(isCorrect).map(a => a.duration_sec).filter(t => t > 0);
    const classTimes = DB().answers.filter(a => a.kp_id === kpId && isCorrect(a) && a.duration_sec > 0).map(a => a.duration_sec);
    const classMean = classTimes.length ? avg(classTimes) : null;
    const time = {
      my_mean: times.length ? r1(avg(times)) : null,
      class_mean: classMean ? r1(classMean) : null,
      samples: times.length,
      min_samples: cfg.min_student_correct_samples
    };
    if (accuracy < cfg.kp_accuracy_threshold) {
      return { ...base, status: 'WEAK_ACCURACY', accuracy: r3(accuracy), time, weak_reason: 'accuracy' };
    }
    if (times.length < cfg.min_student_correct_samples) {
      return { ...base, status: 'MASTERED', accuracy: r3(accuracy), time, time_insufficient: true };
    }
    const ratio = classMean ? avg(times) / classMean : 0;
    time.ratio = r3(ratio);
    if (ratio > cfg.time_ratio_threshold) {
      return { ...base, status: 'WEAK_TIME', accuracy: r3(accuracy), time, weak_reason: 'time' };
    }
    return { ...base, status: 'MASTERED', accuracy: r3(accuracy), time };
  }

  function diagnosisPayload(uid, kpId) {
    const system = diagnoseFor(uid, kpId);
    const mark = activeMark(uid, kpId);
    const self_mark = mark ? { status: mark.status, reason: mark.reason, updated_at: mark.updated_at } : null;
    const evidence = DB().answers
      .filter(a => a.user_id === uid && a.kp_id === kpId)
      .map(a => {
        const q = DB().questions.find(x => x.question_id === a.question_id) || {};
        return {
          answer_id: a.answer_id, question_title: q.title, answer_text: a.answer_text,
          is_correct: a.is_correct, final_score: a.final_score,
          reason_text: a.reason_text, duration_sec: a.duration_sec, judge_type: a.judge_type
        };
      });
    return { kp_id: kpId, kp_name: (kpOf(kpId) || {}).name, system, self_mark, consistency: consistency(system, mark), evidence };
  }

  function learningOf(uid, kpId) {
    const rs = DB().resources.filter(r => r.kp_id === kpId);
    const completed = rs.filter(r => {
      const p = DB().progress.find(x => x.user_id === uid && x.resource_id === r.resource_id);
      return p && p.progress_pct >= 100;
    }).length;
    return { total: rs.length, completed, learned_all: rs.length > 0 && completed >= rs.length };
  }

  function courseTree(uid) {
    return DB().courses.map(c => ({
      ...c,
      chapters: DB().chapters.filter(ch => ch.course_id === c.course_id).sort((a, b) => a.seq - b.seq).map(ch => ({
        ...ch,
        knowledge_points: DB().kps.filter(k => k.chapter_id === ch.chapter_id).map(k => {
          const mark = activeMark(uid, k.kp_id);
          return {
            ...k,
            learning: learningOf(uid, k.kp_id),
            self_mark: mark ? { status: mark.status, reason: mark.reason, updated_at: mark.updated_at } : null
          };
        })
      }))
    }));
  }

  function pushLog(userId, type, detail) {
    const db = DB();
    const id = 1000 + db.logs.length + 1;
    db.logs.unshift({ log_id: id, user_id: userId, action_type: type, detail, created_at: now() });
  }

  function resourceView(r) {
    return {
      ...r,
      kp_name: (kpOf(r.kp_id) || {}).name,
      file_url: r.file_url || null
    };
  }

  function questionStats() {
    const cfg = DB().config;
    return DB().questions.map(q => {
      const rows = DB().answers.filter(a => a.question_id === q.question_id);
      const total = rows.length;
      const correct = rows.filter(isCorrect).length;
      const acc = total ? correct / total : null;
      const times = rows.filter(isCorrect).map(a => a.duration_sec).filter(t => t > 0);
      const mean = times.length ? avg(times) : null;
      const variance = times.length >= 2 ? avg(times.map(t => Math.pow(t - avg(times), 2))) : null;
      const reasons = [];
      if (total && acc < cfg.question_accuracy_threshold) {
        reasons.push(`准确率 ${Math.round(acc * 100)}% < ${Math.round(cfg.question_accuracy_threshold * 100)}%（第一依据）`);
      }
      if (times.length >= cfg.min_time_samples && variance != null && variance > cfg.time_variance_threshold) {
        reasons.push(`正确作答时间方差 ${Math.round(variance)} > ${cfg.time_variance_threshold}（第二依据，样本 ${times.length} ≥ ${cfg.min_time_samples}）`);
      }
      return {
        question_id: q.question_id, title: q.title, kp_name: (kpOf(q.kp_id) || {}).name,
        total_answers: total, accuracy: acc, correct_time_mean: mean ? r1(mean) : null,
        correct_time_variance: variance != null ? r1(variance) : null,
        correct_time_samples: times.length, min_time_samples: cfg.min_time_samples,
        level: total === 0 ? '无作答' : (reasons.length ? '难题' : '普通'), reasons
      };
    });
  }

  function classDifficulty() {
    const cfg = DB().config;
    const students = DB().users.filter(u => u.role === 'student');
    return DB().kps.map(k => {
      const detail = [];
      let learned = 0;
      students.forEach(s => {
        const has = DB().answers.some(a => a.user_id === s.user_id && a.kp_id === k.kp_id);
        if (!has) return;
        learned++;
        const d = diagnoseFor(s.user_id, k.kp_id);
        if (d.status === 'WEAK_ACCURACY') detail.push({ user_id: s.user_id, why: `准确率 ${Math.round(d.accuracy * 100)}%（第一依据）` });
        else if (d.status === 'WEAK_TIME') detail.push({ user_id: s.user_id, why: `时间比值 ${d.time.ratio} > ${cfg.time_ratio_threshold}（第二依据）` });
      });
      const ratio = learned ? detail.length / learned : 0;
      return {
        kp_id: k.kp_id, kp_name: k.name, learned_students: learned,
        weak_count: detail.length, total: learned, weak_ratio: r3(ratio),
        level: learned ? (ratio >= cfg.weak_ratio_threshold ? '难点' : '普通') : '无人作答',
        detail
      };
    });
  }

  function keyPoints() {
    const cfg = DB().config;
    const total = DB().examScores.reduce((s, x) => s + x.score, 0);
    return {
      total_score: total,
      items: DB().kps.map(k => {
        const score = DB().examScores.filter(x => x.kp_id === k.kp_id).reduce((s, x) => s + x.score, 0);
        const share = total ? score / total : 0;
        return { kp_id: k.kp_id, kp_name: k.name, score, share: r3(share), level: share >= cfg.key_score_share_threshold ? '重点' : '普通' };
      }).sort((a, b) => b.share - a.share)
    };
  }

  function selfAgg() {
    const students = DB().users.filter(u => u.role === 'student');
    return DB().kps.map(k => {
      const marks = DB().selfMarks.filter(m => m.kp_id === k.kp_id && m.status === 'ACTIVE');
      let match = 0, conflict = 0;
      marks.forEach(m => {
        const s = diagnoseFor(m.user_id, k.kp_id);
        if (s.status === 'WEAK_ACCURACY' || s.status === 'WEAK_TIME') match++;
        else if (s.status === 'MASTERED') conflict++;
      });
      return {
        kp_id: k.kp_id, kp_name: k.name, count: marks.length,
        ratio: students.length ? r3(marks.length / students.length) : 0,
        reasons: marks.map(m => m.reason).filter(Boolean).slice(0, 3),
        students: marks.map(m => ({ user_id: m.user_id, name: (userOf(m.user_id) || {}).name, reason: m.reason })),
        consistency: { match, conflict }
      };
    }).filter(x => x.count > 0);
  }

  function recommendFor(uid, kpId) {
    let recs = DB().recommendations.filter(r => r.user_id === uid && (!kpId || r.kp_id === kpId));
    if (!recs.length) {
      const targets = [];
      DB().kps.forEach(k => {
        const d = diagnoseFor(uid, k.kp_id);
        if (d.status === 'WEAK_ACCURACY' || d.status === 'WEAK_TIME') targets.push({ kp_id: k.kp_id, source: 'SYSTEM', reason: d.status === 'WEAK_ACCURACY' ? `准确率 ${Math.round(d.accuracy * 100)}% 低于阈值` : `时间比值 ${d.time.ratio} 超标` });
        else if (activeMark(uid, k.kp_id)) targets.push({ kp_id: k.kp_id, source: 'SELF', reason: '学生自主标识薄弱' });
      });
      targets.forEach((t, i) => {
        const qs = DB().questions.filter(q => q.kp_id === t.kp_id).slice(0, 3).map(q => q.question_id);
        recs.push({ rec_id: 100 + i, user_id: uid, kp_id: t.kp_id, source: t.source, reason: t.reason, question_ids: qs, accepted: false, created_at: now() });
      });
      DB().recommendations.push(...recs);
      save();
    }
    return recs.map(r => ({
      ...r, kp_name: (kpOf(r.kp_id) || {}).name,
      questions: r.question_ids.map(id => DB().questions.find(q => q.question_id === id)).filter(Boolean)
        .map(q => ({ question_id: q.question_id, title: q.title, difficulty: q.difficulty }))
    }));
  }

  // ---------- 路由 ----------
  async function api(method, path, body) {
    await new Promise(r => setTimeout(r, 70));
    const [rawPath, qs] = path.split('?');
    const params = new URLSearchParams(qs || '');
    const p = rawPath.replace(/^\/api/, '');
    const db = DB();
    let m;

    // ===== 认证 =====
    if (p === '/auth/login' && method === 'POST') {
      const user = db.users.find(u => u.account === body.account && u.role === body.role);
      if (!user) fail(40101, '账号不存在或角色不符');
      setSession(user);
      return { token: 'demo-' + user.user_id, expires_at: now(), demo: true, user: clone(user) };
    }
    if (p === '/auth/me') {
      const u = currentUser();
      if (!u) fail(40101, '未登录');
      return clone(u);
    }
    if (p === '/auth/logout') { clearSession(); return null; }
    if (p === '/llm-status') {
      return { engine: 'RULE_FALLBACK', model: null, prompt_version: 'v2-candidate', detail: '前端演示模式（未连接 LLM）' };
    }

    // ===== 学生端 =====
    if (p === '/student/courses') {
      const u = requireUser('student');
      return courseTree(u.user_id);
    }
    if ((m = p.match(/^\/student\/knowledge-points\/(\d+)$/))) {
      const u = requireUser('student');
      const kp = kpOf(+m[1]);
      if (!kp) fail(40401, '知识点不存在');
      const mark = activeMark(u.user_id, kp.kp_id);
      return {
        ...kp,
        resources: db.resources.filter(r => r.kp_id === kp.kp_id).map(resourceView),
        relations: db.relations.filter(r => r.source_kp === kp.kp_id || r.target_kp === kp.kp_id),
        self_mark: mark ? { status: mark.status, reason: mark.reason, updated_at: mark.updated_at } : null
      };
    }
    if (p === '/student/resources') {
      const u = requireUser('student');
      let rs = db.resources;
      const kpId = params.get('kp_id');
      if (kpId) rs = rs.filter(r => r.kp_id === +kpId);
      return rs.map(r => {
        const prog = db.progress.find(x => x.user_id === u.user_id && x.resource_id === r.resource_id);
        return { ...resourceView(r), progress_pct: prog ? prog.progress_pct : 0 };
      });
    }
    if ((m = p.match(/^\/student\/resources\/(\d+)$/))) {
      requireUser('student');
      const r = db.resources.find(x => x.resource_id === +m[1]);
      if (!r) fail(40401, '资源不存在');
      return resourceView(r);
    }
    if (p === '/student/videos') {
      requireUser('student');
      return db.resources.filter(r => r.type === 'video').map(resourceView);
    }
    if (p === '/student/learning-progress' && method === 'POST') {
      const u = requireUser('student');
      let rec = db.progress.find(x => x.user_id === u.user_id && x.resource_id === body.resource_id);
      if (!rec) { rec = { user_id: u.user_id, resource_id: body.resource_id, progress_pct: 0, duration_sec: 0 }; db.progress.push(rec); }
      rec.progress_pct = Math.max(rec.progress_pct, Math.min(100, body.progress_pct || 0));
      rec.duration_sec = (rec.duration_sec || 0) + (body.duration_sec || 0);
      save();
      return { resource_id: rec.resource_id, progress_pct: rec.progress_pct, completed: rec.progress_pct >= 100 };
    }
    if (p === '/student/learning-progress') {
      const u = requireUser('student');
      const kpId = +params.get('kp_id');
      const rs = db.resources.filter(r => r.kp_id === kpId);
      const items = rs.map(r => {
        const rec = db.progress.find(x => x.user_id === u.user_id && x.resource_id === r.resource_id);
        return { resource_id: r.resource_id, progress_pct: rec ? rec.progress_pct : 0, completed: !!(rec && rec.progress_pct >= 100) };
      });
      return { items, completed: items.filter(x => x.completed).length, total: items.length };
    }
    if ((m = p.match(/^\/student\/quiz\/(\d+)$/))) {
      const u = requireUser('student');
      const kpId = +m[1];
      return {
        questions: db.questions.filter(q => q.kp_id === kpId).map(q => ({
          question_id: q.question_id, type: q.type, difficulty: q.difficulty, title: q.title, options: q.options
        })),
        learning: learningOf(u.user_id, kpId)
      };
    }
    if (p === '/student/attempts' && method === 'POST') {
      const u = requireUser('student');
      const id = 1000 + db.attempts.length + 1;
      const attempt = { attempt_id: id, user_id: u.user_id, kp_id: body.kp_id, started_at: now(), status: 'DRAFT', score: null };
      db.attempts.push(attempt); save();
      return { attempt_id: id, started_at: attempt.started_at };
    }
    if ((m = p.match(/^\/student\/attempts\/(\d+)\/answers$/)) && method === 'POST') {
      const u = requireUser('student');
      const attempt = db.attempts.find(a => a.attempt_id === +m[1] && a.user_id === u.user_id);
      if (!attempt) fail(40401, '答题尝试不存在');
      const q = db.questions.find(x => x.question_id === body.question_id);
      if (!q) fail(40401, '题目不存在');
      const subj = q.type === 'subjective';
      const is_correct = subj ? null : (body.answer_text === q.answer ? 1 : 0);
      const ai_score = subj ? (String(body.answer_text || '').length >= 15 ? 62 : 45) : null;
      const answer = {
        answer_id: 2000 + db.answers.length,
        user_id: u.user_id, attempt_id: attempt.attempt_id, question_id: q.question_id, kp_id: q.kp_id,
        answer_text: body.answer_text, reason_text: body.reason_text || '', duration_sec: body.duration_sec || 0,
        judge_type: subj ? 'AI' : 'PROGRAM', review_status: subj ? 'PENDING' : 'NONE',
        is_correct, ai_score, final_score: subj ? ai_score : (is_correct ? 1 : 0),
        judge_comment: subj ? '[引擎:RULE_FALLBACK] 演示环境按要点长度估算' : '程序判分',
        created_at: now()
      };
      db.answers.push(answer);
      const qq = db.questions.find(x => x.question_id === q.question_id);
      if (qq) qq.exposure = (qq.exposure || 0) + 1;
      save();
      const d = diagnoseFor(u.user_id, q.kp_id);
      return {
        answer_id: answer.answer_id, judge_type: answer.judge_type, review_status: answer.review_status,
        is_correct, score: answer.final_score, judge_comment: answer.judge_comment,
        diagnosis: { kp_id: d.kp_id, status: d.status, accuracy: d.accuracy }
      };
    }
    if ((m = p.match(/^\/student\/attempts\/(\d+)\/submit$/)) && method === 'POST') {
      const u = requireUser('student');
      const attempt = db.attempts.find(a => a.attempt_id === +m[1] && a.user_id === u.user_id);
      if (!attempt) fail(40401, '答题尝试不存在');
      const rows = db.answers.filter(a => a.attempt_id === attempt.attempt_id);
      attempt.status = 'SUBMITTED';
      attempt.score = rows.length ? r3(rows.reduce((s, a) => s + (a.final_score || 0), 0) / rows.length) : 0;
      save();
      return { attempt_id: attempt.attempt_id, score: attempt.score, status: attempt.status };
    }
    if ((m = p.match(/^\/student\/attempts\/(\d+)$/))) {
      requireUser('student');
      const a = db.attempts.find(x => x.attempt_id === +m[1]);
      if (!a) fail(40401, '答题尝试不存在');
      return { ...a, answers: db.answers.filter(x => x.attempt_id === a.attempt_id) };
    }
    if (p === '/student/answers') {
      const u = requireUser('student');
      const kpId = params.get('kp_id');
      let rows = db.answers.filter(a => a.user_id === u.user_id);
      if (kpId) rows = rows.filter(a => a.kp_id === +kpId);
      return rows.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    if (p === '/student/diagnosis') {
      const u = requireUser('student');
      const kpId = +params.get('kp_id');
      if (!kpId) fail(40001, '缺少 kp_id');
      return diagnosisPayload(u.user_id, kpId);
    }
    if (p === '/student/diagnosis/summary') {
      const u = requireUser('student');
      return db.kps.map(k => {
        const d = diagnoseFor(u.user_id, k.kp_id);
        const mark = activeMark(u.user_id, k.kp_id);
        return { kp_id: k.kp_id, kp_name: k.name, status: d.status, accuracy: d.accuracy, attempts: d.attempts, self_mark: mark ? 'ACTIVE' : null };
      });
    }
    if (p === '/student/profile') {
      const u = requireUser('student');
      return db.kps.map(k => {
        const d = diagnoseFor(u.user_id, k.kp_id);
        const mark = activeMark(u.user_id, k.kp_id);
        let state = '未学';
        if (d.status === 'INSUFFICIENT') state = d.attempts ? '证据不足' : '未学';
        else if (d.status === 'MASTERED') state = '已掌握';
        else state = '已学未掌握';
        return {
          kp_id: k.kp_id, kp_name: k.name, state, accuracy: d.accuracy,
          correct_count: d.correct, answer_count: d.attempts, judgment: d.status,
          self_mark: mark ? { status: mark.status, reason: mark.reason } : null,
          evidence_count: d.attempts
        };
      });
    }
    if (p === '/student/profile/evidence') {
      const u = requireUser('student');
      const kpId = +params.get('kp_id');
      return diagnosisPayload(u.user_id, kpId).evidence;
    }
    if (p === '/student/recommendations') {
      const u = requireUser('student');
      const kpId = params.get('kp_id');
      return { items: recommendFor(u.user_id, kpId ? +kpId : null) };
    }
    if (p === '/student/recommendations/history') {
      const u = requireUser('student');
      return db.recommendations.filter(r => r.user_id === u.user_id).slice().reverse();
    }
    if ((m = p.match(/^\/student\/recommendations\/(\d+)\/accept$/)) && method === 'POST') {
      const u = requireUser('student');
      const rec = db.recommendations.find(r => r.rec_id === +m[1] && r.user_id === u.user_id);
      if (!rec) fail(40401, '推荐不存在');
      rec.accepted = true;
      pushLog(u.user_id, 'accept_recommendation', `接受推荐：${(kpOf(rec.kp_id) || {}).name}`);
      save();
      return { rec_id: rec.rec_id, accepted: true };
    }
    if (p === '/student/interventions') {
      const u = requireUser('student');
      return db.interventions.filter(x => x.user_id === u.user_id).map(x => ({
        ...x, kp_name: x.kp_id ? (kpOf(x.kp_id) || {}).name : '全部', teacher_name: (userOf(x.teacher_id) || {}).name,
        feedback: db.feedbackRecords.filter(f => f.intervention_id === x.intervention_id)
      }));
    }
    if ((m = p.match(/^\/student\/interventions\/(\d+)\/feedback$/)) && method === 'POST') {
      const u = requireUser('student');
      const it = db.interventions.find(x => x.intervention_id === +m[1] && x.user_id === u.user_id);
      if (!it) fail(40401, '任务不存在');
      const fb = { feedback_id: 500 + db.feedbackRecords.length, intervention_id: it.intervention_id, user_id: u.user_id, feedback: body.feedback || '', created_at: now() };
      db.feedbackRecords.push(fb);
      if (body.done) { it.status = 'DONE'; it.updated_at = now(); }
      pushLog(u.user_id, 'feedback', `任务反馈：${it.detail.slice(0, 20)}`);
      save();
      return { feedback_id: fb.feedback_id, status: it.status };
    }
    if (p === '/student/graph') {
      requireUser('student');
      return {
        nodes: db.kps.map(k => ({ kp_id: k.kp_id, name: k.name })),
        edges: db.relations.map(r => ({ ...r, source_name: (kpOf(r.source_kp) || {}).name, target_name: (kpOf(r.target_kp) || {}).name }))
      };
    }
    if (p === '/student/ai/ask' && method === 'POST') {
      const u = requireUser('student');
      const kp = kpOf(body.kp_id);
      const answer = `关于「${kp ? kp.name : '该知识点'}」：${kp ? kp.description : ''}\n\n演示环境使用规则回答。建议先复习课件，再完成对应练习；如仍不清楚，可在“自主标识”中标记薄弱并填写理由。`;
      pushLog(u.user_id, 'ask_ai', body.question);
      save();
      return { answer, engine: 'RULE_FALLBACK' };
    }
    if (p === '/student/behavior') {
      const u = requireUser('student');
      return {
        answers: db.answers.filter(a => a.user_id === u.user_id).slice().sort((a, b) => b.created_at.localeCompare(a.created_at)),
        learning: db.progress.filter(x => x.user_id === u.user_id).map(x => ({ ...x, resource_title: (db.resources.find(r => r.resource_id === x.resource_id) || {}).title }))
      };
    }
    // 自主标识
    if (p === '/student/self-marks' && method === 'POST') {
      const u = requireUser('student');
      const kp = kpOf(body.kp_id);
      if (!kp) fail(40401, '知识点不存在');
      if (body.reason && body.reason.length > 200) fail(40002, '理由不能超过 200 字');
      let mark = db.selfMarks.find(m => m.user_id === u.user_id && m.kp_id === body.kp_id);
      if (mark) {
        mark.status = 'ACTIVE'; mark.reason = body.reason || mark.reason; mark.updated_at = now();
      } else {
        mark = { mark_id: 100 + db.selfMarks.length, user_id: u.user_id, kp_id: body.kp_id, reason: body.reason || '', status: 'ACTIVE', created_at: now(), updated_at: now() };
        db.selfMarks.push(mark);
      }
      pushLog(u.user_id, 'self_mark', `标识 ${kp.name} 为薄弱`);
      save();
      return { mark_id: mark.mark_id, kp_id: mark.kp_id, kp_name: kp.name, reason: mark.reason, status: mark.status, created_at: mark.created_at, updated_at: mark.updated_at };
    }
    if (p === '/student/self-marks') {
      const u = requireUser('student');
      const status = params.get('status') || 'ACTIVE';
      return {
        items: db.selfMarks.filter(m => m.user_id === u.user_id && m.status === status).map(m => {
          const kp = kpOf(m.kp_id) || {};
          const d = diagnoseFor(u.user_id, m.kp_id);
          return { ...m, kp_name: kp.name, system_status: d.status, consistency: consistency(d, m) };
        })
      };
    }
    if ((m = p.match(/^\/student\/self-marks\/(\d+)$/)) && method === 'DELETE') {
      const u = requireUser('student');
      const mark = db.selfMarks.find(x => x.user_id === u.user_id && x.kp_id === +m[1] && x.status === 'ACTIVE');
      if (!mark) fail(40401, '自评不存在');
      mark.status = 'CANCELLED'; mark.updated_at = now();
      pushLog(u.user_id, 'self_mark_cancel', `取消自评：${(kpOf(mark.kp_id) || {}).name}`);
      save();
      return { kp_id: mark.kp_id, status: mark.status };
    }

    // ===== 画：DifficultyMark（只读） =====
    if (p === '/student/marks' && method === 'GET') {
      const u = requireUser('student');
      const scope = params.get('scope') || 'my';
      const kpId = params.get('kp_id'), status = params.get('status');
      let rows = db.difficultyMarks || [];
      if (scope === 'my') rows = rows.filter(x => x.student_id === u.user_id);
      if (kpId) rows = rows.filter(x => x.kp_id === +kpId);
      if (status) rows = rows.filter(x => x.status === status);
      return rows.map(x => ({
        ...x, kp_name: (kpOf(x.kp_id) || {}).name,
        student_name: (userOf(x.student_id) || {}).name,
        evidence_count: (db.evidenceRefs || []).filter(e => e.mark_id === x.mark_id).length
      }));
    }
    if ((m = p.match(/^\/student\/marks\/([^/]+)\/evidence$/))) {
      requireUser('student');
      const mark = (db.difficultyMarks || []).find(x => x.mark_id === m[1]);
      if (!mark) fail(40401, '标记不存在');
      return (db.evidenceRefs || []).filter(e => e.mark_id === mark.mark_id).map(e => {
        const q = db.questions.find(x => x.question_id === e.question_id) || {};
        return { ...e, question_title: q.title };
      });
    }
    if ((m = p.match(/^\/student\/marks\/([^/]+)\/view$/)) && method === 'POST') {
      requireUser('student');
      const scope = body.scope || 'MY', hash = body.filter_hash || 'default';
      let v = (db.markViews || []).find(x => x.mark_id === m[1] && x.scope === scope && x.filter_hash === hash);
      if (!v) {
        v = { view_id: 'V-' + ((db.markViews || []).length + 1), mark_id: m[1], scope, filter_hash: hash, rendered_at: now() };
        db.markViews = db.markViews || []; db.markViews.push(v); save();
      }
      return { view_id: v.view_id };
    }
    if ((m = p.match(/^\/student\/marks\/([^/]+)$/))) {
      requireUser('student');
      const mark = (db.difficultyMarks || []).find(x => x.mark_id === m[1]);
      if (!mark) fail(40401, '标记不存在');
      return {
        ...mark, kp_name: (kpOf(mark.kp_id) || {}).name,
        evidence: (db.evidenceRefs || []).filter(e => e.mark_id === mark.mark_id).map(e => {
          const q = db.questions.find(x => x.question_id === e.question_id) || {};
          return { ...e, question_title: q.title };
        })
      };
    }

    // ===== 荐：推荐请求（同步 + 降级） =====
    if (p === '/student/recommend-requests' && method === 'POST') {
      requireUser('student');
      const mark = (db.difficultyMarks || []).find(x => x.mark_id === body.mark_id);
      if (!mark) fail(40401, '标记不存在');
      const kpIds = body.kp_ids && body.kp_ids.length ? body.kp_ids : [mark.kp_id];
      const limit = body.limit || 3;
      const request = {
        request_id: 'R-' + ((db.recommendRequests || []).length + 1),
        mark_id: mark.mark_id, kp_ids: kpIds, limit_n: limit,
        state: 'REQUESTED', degraded: false, created_at: now()
      };
      db.recommendRequests = db.recommendRequests || [];
      db.recommendRequests.push(request);
      let items = [];
      if (mark.status === 'INSUFFICIENT') {
        request.state = 'DEGRADED'; request.degraded = true;
      } else {
        const qs = db.questions.filter(q => kpIds.includes(q.kp_id)).slice(0, limit);
        items = qs.map((q, i) => ({
          item_id: 'I-' + ((db.recommendItems || []).length + i + 1),
          request_id: request.request_id, type: q.type, kp_id: q.kp_id,
          est_minutes: q.type === 'subjective' ? 6 : 3
        }));
        db.recommendItems = db.recommendItems || [];
        db.recommendItems.push(...items);
        request.state = items.length ? 'SERVED' : 'EMPTY';
        if (!items.length) request.degraded = true;
      }
      save();
      return { ...request, items };
    }
    if (p === '/student/recommend-requests' && method === 'GET') {
      const u = requireUser('student');
      const marks = db.difficultyMarks || [];
      return (db.recommendRequests || []).filter(r => {
        const mk = marks.find(x => x.mark_id === r.mark_id);
        return mk && mk.student_id === u.user_id;
      }).map(r => ({ ...r, items: (db.recommendItems || []).filter(i => i.request_id === r.request_id) }));
    }
    if ((m = p.match(/^\/student\/recommend-requests\/([^/]+)$/))) {
      requireUser('student');
      const r = (db.recommendRequests || []).find(x => x.request_id === m[1]);
      if (!r) fail(40401, '请求不存在');
      return { ...r, items: (db.recommendItems || []).filter(i => i.request_id === r.request_id) };
    }

    // ===== 干：动作日志（只写） =====
    if (p === '/student/actions' && method === 'POST') {
      const u = requireUser('student');
      const valid = ['RETRY_QUESTION', 'GO_PRACTICE', 'ASK_TEACHER'];
      if (!valid.includes(body.action)) fail(40002, '动作类型非法');
      const log = {
        log_id: 'L-' + ((db.interventionLogs || []).length + 1),
        mark_id: body.mark_id || null, student_id: u.user_id,
        action: body.action, source_page: body.source_page || '', created_at: now()
      };
      db.interventionLogs = db.interventionLogs || [];
      db.interventionLogs.push(log);
      pushLog(u.user_id, 'student_action', body.action);
      save();
      return { log_id: log.log_id };
    }
    if (p === '/student/actions') {
      const u = requireUser('student');
      return (db.interventionLogs || []).filter(l => l.student_id === u.user_id)
        .slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
    }

    // ===== 教师端 =====
    if (p === '/teacher/dashboard') {
      requireUser('teacher');
      return db.users.filter(u => u.role === 'student').map(s => {
        const rows = db.answers.filter(a => a.user_id === s.user_id);
        const correct = rows.filter(isCorrect).length;
        return {
          user_id: s.user_id, name: s.name, class_id: s.class_id,
          total_answers: rows.length, correct_answers: correct,
          accuracy: rows.length ? r3(correct / rows.length) : 0,
          self_mark_count: db.selfMarks.filter(m => m.user_id === s.user_id && m.status === 'ACTIVE').length,
          learning_count: db.progress.filter(p => p.user_id === s.user_id).length
        };
      });
    }
    if (p === '/teacher/difficulty') {
      requireUser('teacher');
      return {
        rule_version: 'v2-candidate',
        questions: questionStats(),
        class_kps: classDifficulty(),
        key_points: keyPoints(),
        self_marks: selfAgg()
      };
    }
    if (p === '/teacher/self-marks') {
      requireUser('teacher');
      const kpId = params.get('kp_id');
      const agg = selfAgg();
      return kpId ? agg.filter(x => x.kp_id === +kpId) : agg;
    }
    if (p === '/teacher/pending-grades') {
      requireUser('teacher');
      return db.answers.filter(a => a.review_status === 'PENDING').map(a => {
        const q = db.questions.find(x => x.question_id === a.question_id) || {};
        return {
          ...a, student_name: (userOf(a.user_id) || {}).name, question_title: q.title,
          reference_answer: q.reference_answer || q.answer, kp_name: (kpOf(a.kp_id) || {}).name
        };
      });
    }
    if (p === '/teacher/grade-reviews' && method === 'POST') {
      const t = requireUser('teacher');
      const a = db.answers.find(x => x.answer_id === body.answer_id);
      if (!a) fail(40401, '作答不存在');
      const review = { review_id: 300 + (db.gradeReviews || []).length, answer_id: a.answer_id, teacher_id: t.user_id, ai_score: a.ai_score, final_score: body.final_score, comment: body.comment || '', created_at: now() };
      db.gradeReviews = db.gradeReviews || [];
      db.gradeReviews.push(review);
      a.final_score = body.final_score;
      a.review_status = 'OVERRIDDEN';
      a.judge_type = 'HUMAN';
      a.judge_comment = body.comment || a.judge_comment;
      pushLog(t.user_id, 'grade_review', `复核作答 #${a.answer_id}：${body.final_score} 分`);
      save();
      return { review_id: review.review_id, status: 'OVERRIDDEN', diagnosis: diagnoseFor(a.user_id, a.kp_id) };
    }
    if (p === '/teacher/courses' && method === 'GET') {
      requireUser('teacher');
      return courseTree(0);
    }
    if (p === '/teacher/courses' && method === 'POST') {
      const t = requireUser('teacher');
      const id = 100 + db.courses.length;
      db.courses.push({ course_id: id, name: body.name, term: body.term || '2026秋' });
      pushLog(t.user_id, 'course_add', body.name); save();
      return { course_id: id };
    }
    if ((m = p.match(/^\/teacher\/courses\/(\d+)$/)) && method === 'PUT') {
      requireUser('teacher');
      const c = db.courses.find(x => x.course_id === +m[1]);
      if (!c) fail(40401, '课程不存在');
      if (body.name) c.name = body.name;
      if (body.term) c.term = body.term;
      save(); return { course_id: c.course_id };
    }
    if ((m = p.match(/^\/teacher\/courses\/(\d+)$/)) && method === 'DELETE') {
      requireUser('teacher');
      const cid = +m[1];
      const chs = db.chapters.filter(c => c.course_id === cid).map(c => c.chapter_id);
      const kps = db.kps.filter(k => chs.includes(k.chapter_id)).map(k => k.kp_id);
      const rs = db.resources.filter(r => kps.includes(r.kp_id)).map(r => r.resource_id);
      db.resources = db.resources.filter(r => !rs.includes(r.resource_id));
      db.questions = db.questions.filter(q => !kps.includes(q.kp_id));
      db.kps = db.kps.filter(k => !kps.includes(k.kp_id));
      db.chapters = db.chapters.filter(c => c.course_id !== cid);
      db.courses = db.courses.filter(c => c.course_id !== cid);
      save(); return null;
    }
    if (p === '/teacher/resources' && method === 'GET') {
      requireUser('teacher');
      let rs = db.resources;
      const kpId = params.get('kp_id'), type = params.get('type');
      if (kpId) rs = rs.filter(r => r.kp_id === +kpId);
      if (type) rs = rs.filter(r => r.type === type);
      return rs.map(resourceView);
    }
    if (p === '/teacher/resources' && method === 'POST') {
      requireUser('teacher');
      const id = 200 + db.resources.length;
      db.resources.push({ resource_id: id, kp_id: body.kp_id, title: body.title, type: body.type || 'doc', content: body.content || '', file_name: null, file_size: null });
      save(); return { resource_id: id };
    }
    if ((m = p.match(/^\/teacher\/resources\/(\d+)$/)) && method === 'DELETE') {
      requireUser('teacher');
      db.resources = db.resources.filter(r => r.resource_id !== +m[1]);
      db.progress = db.progress.filter(p => p.resource_id !== +m[1]);
      save(); return null;
    }
    if (p === '/teacher/resources/upload' && method === 'POST') {
      requireUser('teacher');
      const saved = [], skipped = [];
      (body.files || []).forEach((f, i) => {
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        const okExt = ['png','jpg','jpeg','gif','webp','svg','mp4','webm','ogg','mov','pdf','ppt','pptx','doc','docx','xls','xlsx','txt','md'].includes(ext);
        if (!okExt) { skipped.push({ file: f.name, reason: '不支持的类型 .' + ext }); return; }
        const type = ['png','jpg','jpeg','gif','webp','svg'].includes(ext) ? 'image' : (['mp4','webm','ogg','mov'].includes(ext) ? 'video' : 'doc');
        const id = 200 + db.resources.length + i;
        db.resources.push({
          resource_id: id, kp_id: body.kp_id,
          title: body.title ? (body.files.length > 1 ? `${body.title} - ${f.name}` : body.title) : f.name.replace(/\.[^.]+$/, ''),
          type, content: '', file_name: f.name, file_size: f.size || 0,
          file_url: f.dataUrl || null
        });
        saved.push({ resource_id: id, title: db.resources[db.resources.length - 1].title, type, file_url: f.dataUrl || null, size: f.size || 0 });
      });
      save();
      return { saved, skipped, message: `已上传 ${saved.length} 个文件` + (skipped.length ? `，跳过 ${skipped.length} 个` : '') };
    }
    if (p === '/teacher/graph') {
      requireUser('teacher');
      return {
        nodes: db.kps.map(k => ({ kp_id: k.kp_id, name: k.name })),
        edges: db.relations.map(r => ({ ...r, source_name: (kpOf(r.source_kp) || {}).name, target_name: (kpOf(r.target_kp) || {}).name }))
      };
    }
    if (p === '/teacher/graph/relations' && method === 'POST') {
      requireUser('teacher');
      if (body.relation === 'prerequisite') {
        const wouldCycle = (from, to, seen = new Set()) => {
          if (from === to) return true;
          if (seen.has(from)) return false;
          seen.add(from);
          return db.relations.filter(r => r.relation === 'prerequisite' && r.target_kp === to).some(r => wouldCycle(from, r.source_kp, seen));
        };
        if (wouldCycle(body.target_kp, body.source_kp)) fail(42201, '先修关系不能成环');
      }
      const id = 50 + db.relations.length;
      db.relations.push({ relation_id: id, source_kp: body.source_kp, target_kp: body.target_kp, relation: body.relation });
      save(); return { relation_id: id };
    }
    if ((m = p.match(/^\/teacher\/graph\/relations\/(\d+)$/)) && method === 'DELETE') {
      requireUser('teacher');
      db.relations = db.relations.filter(r => r.relation_id !== +m[1]);
      save(); return null;
    }
    if (p === '/teacher/graph/extractions' && method === 'POST') {
      requireUser('teacher');
      const chapterId = body.chapter_id || 1;
      const materials = db.resources.filter(r => (kpOf(r.kp_id) || {}).chapter_id === chapterId);
      const text = materials.map(r => r.content).join('\n');
      const found = [];
      db.kps.filter(k => k.chapter_id === chapterId).forEach((k, i) => {
        const idx = text.indexOf(k.name);
        if (idx >= 0) found.push({ kp_name: k.name, source_quote: text.slice(Math.max(0, idx - 12), idx + k.name.length + 12), engine: 'LLM', status: 'PENDING_REVIEW', created_at: now() });
      });
      db.kpExtractions = [...found, ...db.kpExtractions];
      save();
      return { extractions: found, engine: 'LLM' };
    }
    if (p === '/teacher/graph/extractions' && method === 'GET') {
      requireUser('teacher');
      return db.kpExtractions;
    }
    if ((m = p.match(/^\/teacher\/graph\/extractions\/(\d+)\/review$/)) && method === 'POST') {
      requireUser('teacher');
      const idx = +m[1];
      const item = db.kpExtractions[idx];
      if (!item) fail(40401, '抽取记录不存在');
      item.status = body.decision === 'REJECTED' ? 'REJECTED' : 'CONFIRMED';
      save(); return { extraction_id: idx, status: item.status };
    }
    if (p === '/teacher/annotations' && method === 'POST') {
      const t = requireUser('teacher');
      const ann = { annotation_id: 400 + db.annotations.length, kp_id: body.kp_id, teacher_id: t.user_id, mark: body.mark, note: body.note, created_at: now() };
      db.annotations.push(ann); save();
      return { annotation_id: ann.annotation_id };
    }
    if (p === '/teacher/ai-dialogues') {
      requireUser('teacher');
      return db.logs.filter(l => l.action_type === 'ask_ai').map(l => ({ ...l, student_name: (userOf(l.user_id) || {}).name }));
    }
    if (p === '/teacher/exams') {
      requireUser('teacher');
      return db.examPapers;
    }
    if (p === '/teacher/exams/scan' && method === 'POST') {
      requireUser('teacher');
      const text = body.paper_text || '';
      const entries = [];
      db.kps.forEach(k => {
        if (text.includes(k.name)) {
          const idx = text.indexOf(k.name);
          entries.push({ kp_id: k.kp_id, kp_name: k.name, score: Math.round(100 / Math.max(1, db.kps.filter(x => text.includes(x.name)).length)), source_quote: text.slice(Math.max(0, idx - 10), idx + k.name.length + 10) });
        }
      });
      const paperId = 100 + db.examPapers.length;
      db.examPapers.push({ paper_id: paperId, title: body.title || '未命名真题卷', year: body.year || '', term: '', status: 'PENDING_REVIEW', scanned_by: 'AI' });
      const savedEntries = entries.map(e => ({ ...e, paper_id: paperId, status: 'PENDING_REVIEW' }));
      db.examScores.push(...savedEntries);
      save();
      return { paper_id: paperId, entries: savedEntries, engine: 'RULE_FALLBACK', message: '扫描结果待人工确认' };
    }
    if ((m = p.match(/^\/teacher\/exams\/(\d+)\/confirm$/)) && method === 'POST') {
      const t = requireUser('teacher');
      const paper = db.examPapers.find(x => x.paper_id === +m[1]);
      if (!paper) fail(40401, '试卷不存在');
      paper.status = 'CONFIRMED'; paper.scanned_by = 'HUMAN';
      pushLog(t.user_id, 'exam_confirm', paper.title);
      save();
      return { paper_id: paper.paper_id, status: 'CONFIRMED' };
    }
    if (p === '/teacher/interventions' && method === 'POST') {
      const t = requireUser('teacher');
      const id = 100 + db.interventions.length;
      db.interventions.push({ intervention_id: id, teacher_id: t.user_id, user_id: body.user_id, kp_id: body.kp_id || null, type: body.type, detail: body.detail || '', status: 'PENDING', created_at: now(), updated_at: now() });
      pushLog(t.user_id, 'intervention', body.detail);
      save();
      return { intervention_id: id, status: 'PENDING' };
    }
    if (p === '/teacher/interventions' && method === 'GET') {
      requireUser('teacher');
      const uid = params.get('user_id'), status = params.get('status');
      let rows = db.interventions;
      if (uid) rows = rows.filter(x => x.user_id === +uid);
      if (status) rows = rows.filter(x => x.status === status);
      return rows.map(x => ({ ...x, student_name: (userOf(x.user_id) || {}).name, kp_name: x.kp_id ? (kpOf(x.kp_id) || {}).name : '全部' }));
    }
    if ((m = p.match(/^\/teacher\/interventions\/(\d+)$/)) && method === 'PUT') {
      requireUser('teacher');
      const it = db.interventions.find(x => x.intervention_id === +m[1]);
      if (!it) fail(40401, '干预不存在');
      it.status = body.status; it.updated_at = now(); save();
      return { intervention_id: it.intervention_id, status: it.status };
    }
    if (p === '/teacher/feedback') {
      requireUser('teacher');
      return db.feedbackRecords.map(f => ({ ...f, student_name: (userOf(f.user_id) || {}).name }));
    }

    // ===== E4 难点标记审核 =====
    if (p === '/teacher/difficulty-marks' && method === 'GET') {
      requireUser('teacher');
      const status = params.get('status'), kpId = params.get('kp_id');
      let rows = db.difficultyMarks || [];
      if (status) rows = rows.filter(x => x.status === status);
      if (kpId) rows = rows.filter(x => x.kp_id === +kpId);
      return rows.map(x => ({
        ...x, kp_name: (kpOf(x.kp_id) || {}).name,
        student_name: (userOf(x.student_id) || {}).name,
        evidence_count: (db.evidenceRefs || []).filter(e => e.mark_id === x.mark_id).length
      }));
    }
    if ((m = p.match(/^\/teacher\/difficulty-marks\/([^/]+)\/review$/)) && method === 'POST') {
      const t = requireUser('teacher');
      const mark = (db.difficultyMarks || []).find(x => x.mark_id === m[1]);
      if (!mark) fail(40401, '标记不存在');
      const decision = body.decision === 'REJECTED' ? 'REJECTED' : 'CONFIRMED';
      mark.status = decision;
      db.reviewActions = db.reviewActions || [];
      db.reviewActions.push({
        action_id: 'A-' + (db.reviewActions.length + 1), mark_id: mark.mark_id,
        reviewer_id: t.user_id, decision, comment: body.comment || '', created_at: now()
      });
      pushLog(t.user_id, 'mark_review', `${mark.mark_id} → ${decision}`);
      save();
      return { mark_id: mark.mark_id, status: mark.status };
    }
    if ((m = p.match(/^\/teacher\/difficulty-marks\/([^/]+)\/weight$/)) && method === 'POST') {
      requireUser('teacher');
      const mark = (db.difficultyMarks || []).find(x => x.mark_id === m[1]);
      if (!mark) fail(40401, '标记不存在');
      mark.confidence = Math.max(0, Math.min(1, body.weight));
      save();
      return { mark_id: mark.mark_id, confidence: mark.confidence };
    }
    if ((m = p.match(/^\/teacher\/difficulty-marks\/([^/]+)$/))) {
      requireUser('teacher');
      const mark = (db.difficultyMarks || []).find(x => x.mark_id === m[1]);
      if (!mark) fail(40401, '标记不存在');
      return {
        ...mark, kp_name: (kpOf(mark.kp_id) || {}).name,
        student_name: (userOf(mark.student_id) || {}).name,
        evidence: (db.evidenceRefs || []).filter(e => e.mark_id === mark.mark_id).map(e => {
          const q = db.questions.find(x => x.question_id === e.question_id) || {};
          return { ...e, question_title: q.title };
        }),
        reviews: (db.reviewActions || []).filter(r => r.mark_id === mark.mark_id)
      };
    }

    // ===== 评测（teacher/admin） =====
    if (p === '/eval/datasets') {
      requireUser();
      return db.evalDatasets;
    }
    if (p === '/eval/runs' && method === 'POST') {
      requireUser();
      const type = body.run_type;
      const cfg = db.config;
      let metrics, targets, prompt;
      if (type === 'KP_EXTRACTION') {
        metrics = { recall: 1, precision: .5, source_locatability: 1 };
        targets = { recall: cfg.eval_kp_recall_target, precision: cfg.eval_kp_precision_target, source_locatability: cfg.eval_source_target };
        prompt = 'v2-candidate';
      } else if (type === 'RELATION_ACCURACY') {
        metrics = { relation_accuracy: 1 };
        targets = { relation_accuracy: cfg.eval_relation_target };
        prompt = 'v1-candidate';
      } else fail(40002, '未知评测类型');
      const passed = Object.keys(targets).every(k => (metrics[k] || 0) >= targets[k]);
      const run = {
        run_group: 'run-' + (db.evaluationRuns.length + 1), run_type: type, engine: 'LLM',
        model: cfg.llm_model, prompt, metrics, targets, passed, created_at: now()
      };
      db.evaluationRuns.push(run); save();
      return { run_id: run.run_group, ...run };
    }
    if (p === '/eval/runs') {
      requireUser();
      return db.evaluationRuns.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    if (p === '/eval/kp-extractions') {
      requireUser();
      return db.kpExtractions;
    }

    // ===== 管理端 =====
    if (p === '/admin/overview') {
      requireUser('admin');
      return {
        students: db.users.filter(u => u.role === 'student').length,
        teachers: db.users.filter(u => u.role === 'teacher').length,
        courses: db.courses.length, questions: db.questions.length,
        answers: db.answers.length, logs: db.logs.length, resources: db.resources.length
      };
    }
    if (p === '/admin/users' && method === 'GET') {
      requireUser('admin');
      const role = params.get('role');
      return db.users.filter(u => !role || u.role === role).map(clone);
    }
    if (p === '/admin/users' && method === 'POST') {
      requireUser('admin');
      const id = 30 + db.users.length;
      db.users.push({ user_id: id, account: body.account, name: body.name, role: body.role, class_id: body.class_id || '', title: body.title || '' });
      save(); return { user_id: id };
    }
    if ((m = p.match(/^\/admin\/users\/(\d+)$/)) && method === 'PUT') {
      requireUser('admin');
      const u = db.users.find(x => x.user_id === +m[1]);
      if (!u) fail(40401, '用户不存在');
      ['name', 'class_id', 'title', 'account'].forEach(k => { if (body[k] != null) u[k] = body[k]; });
      save(); return null;
    }
    if ((m = p.match(/^\/admin\/users\/(\d+)$/)) && method === 'DELETE') {
      requireUser('admin');
      db.users = db.users.filter(x => x.user_id !== +m[1]);
      save(); return null;
    }
    if (p === '/admin/roles') {
      requireUser('admin');
      return [
        { role: 'student', permissions: ['学习', '作答', '自评', '查看诊断', '接受推荐', '反馈任务'] },
        { role: 'teacher', permissions: ['课程/资源管理', '图谱构建', '复核', '重难点', '干预', '评测'] },
        { role: 'admin', permissions: ['用户/课程/资源/题目', '阈值配置', '日志', '评测', '备份'] }
      ];
    }
    if (p === '/admin/config' && method === 'GET') {
      requireUser('admin');
      return Object.entries(db.config).map(([key, value]) => ({ key, value, description: '', rule_version: 'v2-candidate' }));
    }
    if ((m = p.match(/^\/admin\/config\/([A-Za-z0-9_]+)$/)) && method === 'PUT') {
      const a = requireUser('admin');
      db.config[m[1]] = body.value;
      pushLog(a.user_id, 'config_update', `${m[1]} = ${body.value}`);
      save(); return { key: m[1], value: body.value, rule_version: 'v2-candidate' };
    }
    if (p === '/admin/courses' && method === 'GET') {
      requireUser('admin');
      return courseTree(0);
    }
    if (p === '/admin/courses' && method === 'POST') {
      requireUser('admin');
      const id = 100 + db.courses.length;
      db.courses.push({ course_id: id, name: body.name, term: body.term || '2026秋' });
      save(); return { course_id: id };
    }
    if ((m = p.match(/^\/admin\/courses\/(\d+)$/)) && method === 'DELETE') {
      requireUser('admin');
      const cid = +m[1];
      const chs = db.chapters.filter(c => c.course_id === cid).map(c => c.chapter_id);
      const kps = db.kps.filter(k => chs.includes(k.chapter_id)).map(k => k.kp_id);
      db.resources = db.resources.filter(r => !kps.includes(r.kp_id));
      db.questions = db.questions.filter(q => !kps.includes(q.kp_id));
      db.kps = db.kps.filter(k => !kps.includes(k.kp_id));
      db.chapters = db.chapters.filter(c => c.course_id !== cid);
      db.courses = db.courses.filter(c => c.course_id !== cid);
      save(); return null;
    }
    if (p === '/admin/resources' && method === 'GET') {
      requireUser('admin');
      return db.resources.map(resourceView);
    }
    if (p === '/admin/resources' && method === 'POST') {
      requireUser('admin');
      const id = 200 + db.resources.length;
      db.resources.push({ resource_id: id, kp_id: body.kp_id, title: body.title, type: body.type || 'doc', content: body.content || '', file_name: null, file_size: null });
      save(); return { resource_id: id };
    }
    if ((m = p.match(/^\/admin\/resources\/(\d+)$/)) && method === 'DELETE') {
      requireUser('admin');
      db.resources = db.resources.filter(r => r.resource_id !== +m[1]);
      save(); return null;
    }
    if (p === '/admin/questions' && method === 'GET') {
      requireUser('admin');
      return db.questions.map(q => ({ ...q, kp_name: (kpOf(q.kp_id) || {}).name }));
    }
    if (p === '/admin/questions' && method === 'POST') {
      requireUser('admin');
      const id = 100 + db.questions.length;
      db.questions.push({ question_id: id, kp_id: body.kp_id, type: body.type || 'choice', difficulty: body.difficulty || 0.5, title: body.title, options: body.options || null, answer: body.reference_answer || '', reference_answer: body.reference_answer || '', exposure: 0 });
      save(); return { question_id: id };
    }
    if ((m = p.match(/^\/admin\/questions\/(\d+)$/)) && method === 'DELETE') {
      requireUser('admin');
      db.questions = db.questions.filter(q => q.question_id !== +m[1]);
      save(); return null;
    }
    if (p === '/admin/logs') {
      requireUser('admin');
      return db.logs.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    if (p === '/admin/ai-model' && method === 'GET') {
      requireUser('admin');
      return { model: db.config.llm_model, timeout: db.config.llm_timeout, enabled: db.config.llm_enabled };
    }
    if (p === '/admin/ai-model' && method === 'PUT') {
      requireUser('admin');
      if (body.model) db.config.llm_model = body.model;
      if (body.timeout) db.config.llm_timeout = body.timeout;
      if (body.enabled != null) db.config.llm_enabled = body.enabled;
      save(); return null;
    }
    if (p === '/admin/cicd' && method === 'GET') {
      requireUser('admin');
      return { pipeline: db.config.cicd_pipeline, auto_test: db.config.cicd_auto_test };
    }
    if (p === '/admin/cicd' && method === 'PUT') {
      requireUser('admin');
      if (body.pipeline) db.config.cicd_pipeline = body.pipeline;
      if (body.auto_test) db.config.cicd_auto_test = body.auto_test;
      save(); return null;
    }
    if (p === '/admin/backup' && method === 'POST') {
      requireUser('admin');
      return { message: '演示环境：已生成数据库 JSON（见浏览器下载）', backup: clone(db) };
    }
    if (p === '/admin/security') {
      requireUser('admin');
      return [
        { item: '登录认证', status: '演示模式（无密码）', level: 'warn' },
        { item: '角色权限', status: '前端按角色隔离', level: 'warn' },
        { item: 'SQL 注入', status: '前端演示无 SQL', level: 'ok' },
        { item: '上传校验', status: '扩展名白名单', level: 'ok' }
      ];
    }

    fail(40401, `接口不存在：${method} ${p}`);
  }

  window.api = api;
  window.auth = { currentUser, setSession, clearSession };
})();
