/* 前端演示数据库：种子数据 + localStorage 持久化（后端就绪后可替换为真实 API） */
(function () {
  const KEY = 'smart-learning-db-v2';

  const iso = (d) => new Date(d).toISOString();
  const day = (n) => new Date(Date.now() - n * 86400000).toISOString();

  function seed() {
    return {
      users: [
        { user_id: 1, account: 's1', name: '学生A', role: 'student', class_id: '软工2024-1' },
        { user_id: 2, account: 's2', name: '学生B', role: 'student', class_id: '软工2024-1' },
        { user_id: 3, account: 's3', name: '学生C', role: 'student', class_id: '软工2024-1' },
        { user_id: 10, account: 't1', name: '张老师', role: 'teacher', title: '副教授' },
        { user_id: 11, account: 't2', name: '李老师', role: 'teacher', title: '讲师' },
        { user_id: 20, account: 'a1', name: '管理员A', role: 'admin' }
      ],
      courses: [{ course_id: 1, name: '智能软件工程', term: '2026秋' }],
      chapters: [
        { chapter_id: 1, course_id: 1, name: '软件测试基础', seq: 1 },
        { chapter_id: 2, course_id: 1, name: '需求工程', seq: 2 }
      ],
      kps: [
        { kp_id: 1, chapter_id: 1, name: '边界值分析', description: '测试输入空间边界附近的值来发现缺陷' },
        { kp_id: 2, chapter_id: 1, name: '等价类划分', description: '将输入域划分为等价类，每类选代表值测试' },
        { kp_id: 3, chapter_id: 1, name: '测试用例设计', description: '综合运用多种方法设计有效测试用例' },
        { kp_id: 4, chapter_id: 2, name: '需求获取', description: '通过访谈、问卷等方式收集用户需求' },
        { kp_id: 5, chapter_id: 2, name: '需求验证', description: '验证需求是否完整、一致、可验证' }
      ],
      relations: [
        { relation_id: 1, source_kp: 1, target_kp: 3, relation: 'prerequisite' },
        { relation_id: 2, source_kp: 2, target_kp: 3, relation: 'prerequisite' },
        { relation_id: 3, source_kp: 4, target_kp: 5, relation: 'prerequisite' },
        { relation_id: 4, source_kp: 1, target_kp: 2, relation: 'related' }
      ],
      resources: [
        { resource_id: 1, kp_id: 1, title: '边界值分析课件', type: 'doc', content: '边界值分析是黑盒测试方法之一。对范围 [1,100] 的函数，边界值为 1 和 100；同时测试 0 和 101（越界）可以发现更多缺陷。', file_name: null, file_size: null },
        { resource_id: 2, kp_id: 1, title: '边界值分析练习', type: 'doc', content: '练习题：对 0-100 范围的函数进行边界值测试，列出有效与无效边界值。', file_name: null, file_size: null },
        { resource_id: 3, kp_id: 2, title: '等价类划分课件', type: 'doc', content: '等价类划分将输入域分为有效和无效等价类，从每个等价类中选取代表值进行测试。', file_name: null, file_size: null },
        { resource_id: 4, kp_id: 4, title: '需求获取方法', type: 'doc', content: '需求获取的常用方法包括访谈、问卷、观察、原型等。', file_name: null, file_size: null }
      ],
      questions: [
        { question_id: 1, kp_id: 1, type: 'choice', difficulty: 0.7, title: '对范围[1,100]的函数，以下哪个是有效的边界值测试输入？', options: ['A. x=0', 'B. x=1', 'C. x=50', 'D. x=101'], answer: 'B', reference_answer: 'B', exposure: 2 },
        { question_id: 2, kp_id: 1, type: 'choice', difficulty: 0.7, title: '边界值分析中，x=0 对于范围[1,100]的函数属于什么？', options: ['A. 有效边界值', 'B. 无效边界值（越界）', 'C. 正常值', 'D. 等价类代表'], answer: 'B', reference_answer: 'B', exposure: 2 },
        { question_id: 3, kp_id: 2, type: 'choice', difficulty: 0.6, title: '等价类划分的核心思想是什么？', options: ['A. 测试所有可能输入', 'B. 将输入域划分为等价类，每类取代表', 'C. 只测边界值', 'D. 随机测试'], answer: 'B', reference_answer: 'B', exposure: 2 },
        { question_id: 4, kp_id: 2, type: 'choice', difficulty: 0.6, title: '对于输入条件“年龄为1-120的整数”，以下哪个属于无效等价类？', options: ['A. 年龄=25', 'B. 年龄=1', 'C. 年龄=0', 'D. 年龄=120'], answer: 'C', reference_answer: 'C', exposure: 2 },
        { question_id: 5, kp_id: 4, type: 'choice', difficulty: 0.5, title: '需求获取最常用的方法是？', options: ['A. 访谈', 'B. 代码审查', 'C. 单元测试', 'D. 部署'], answer: 'A', reference_answer: 'A', exposure: 2 },
        { question_id: 6, kp_id: 1, type: 'subjective', difficulty: 0.7, title: '简述边界值分析的基本思想，并说明它与等价类划分的关系。', options: null, answer: '边界值分析是对等价类划分的补充，测试输入空间边界附近的值来发现缺陷；它关注边界取值（等于、刚刚大于、刚刚小于），等价类划分关注输入域划分与代表值选取，两者结合可提高用例有效性。', reference_answer: '边界值分析关注边界取值，是等价类划分的补充……', exposure: 1 }
      ],
      answers: [],
      attempts: [],
      progress: [
        { user_id: 1, resource_id: 1, progress_pct: 100, duration_sec: 300 },
        { user_id: 1, resource_id: 2, progress_pct: 60, duration_sec: 120 }
      ],
      selfMarks: [],
      examPapers: [{ paper_id: 1, title: '2024年软件测试期末真题', year: '2024', term: '秋', status: 'CONFIRMED', scanned_by: 'HUMAN' }],
      examScores: [
        { paper_id: 1, kp_id: 5, score: 30, source_quote: '需求验证是期末大题重点' },
        { paper_id: 1, kp_id: 4, score: 25, source_quote: '需求获取占两道大题' },
        { paper_id: 1, kp_id: 3, score: 20, source_quote: '测试用例设计综合题' },
        { paper_id: 1, kp_id: 1, score: 15, source_quote: '边界值分析选择题与简答' },
        { paper_id: 1, kp_id: 2, score: 10, source_quote: '等价类划分选择题' }
      ],
      evalDatasets: [
        { dataset_id: 1, name: '第1章知识点标注集', run_type: 'KP_EXTRACTION', version: 'v1', description: '人工标注：第1章应有的知识点（召回/准确/出处）' },
        { dataset_id: 2, name: '题目-知识点关系标注集', run_type: 'RELATION_ACCURACY', version: 'v1', description: '人工标注：题目与知识点关联（关系准确率）' }
      ],
      evalItems: [
        { dataset_id: 1, item_key: '边界值分析', expected: '边界值分析' },
        { dataset_id: 1, item_key: '等价类划分', expected: '等价类划分' },
        { dataset_id: 1, item_key: '测试用例设计', expected: '测试用例设计' },
        { dataset_id: 2, item_key: '1', expected: '1' },
        { dataset_id: 2, item_key: '2', expected: '1' },
        { dataset_id: 2, item_key: '3', expected: '2' },
        { dataset_id: 2, item_key: '4', expected: '2' },
        { dataset_id: 2, item_key: '5', expected: '4' }
      ],
      evaluationRuns: [
        { run_group: 'run-1', run_type: 'KP_EXTRACTION', engine: 'LLM', model: 'claude-opus-5-5', prompt: 'v1-candidate', metrics: { recall: 0, precision: 0, source_locatability: 1 }, targets: { recall: .8, precision: .85, source_locatability: .95 }, passed: false, created_at: day(6) },
        { run_group: 'run-2', run_type: 'KP_EXTRACTION', engine: 'LLM', model: 'claude-opus-5-5', prompt: 'v2-candidate', metrics: { recall: 1, precision: .5, source_locatability: 1 }, targets: { recall: .8, precision: .85, source_locatability: .95 }, passed: false, created_at: day(5) },
        { run_group: 'run-3', run_type: 'RELATION_ACCURACY', engine: 'LLM', model: 'claude-opus-5-5', prompt: 'v1-candidate', metrics: { relation_accuracy: 1 }, targets: { relation_accuracy: .8 }, passed: true, created_at: day(4) }
      ],
      kpExtractions: [
        { kp_name: '边界值分析', source_quote: '边界值分析是对等价类划分的补充', engine: 'LLM', status: 'CONFIRMED', created_at: day(5) },
        { kp_name: '等价类划分', source_quote: '等价类划分是把程序的输入域划分成若干部分', engine: 'LLM', status: 'PENDING_REVIEW', created_at: day(5) },
        { kp_name: '测试用例设计', source_quote: '测试用例是为某个特殊目标而编制的一组测试输入', engine: 'LLM', status: 'PENDING_REVIEW', created_at: day(5) }
      ],
      interventions: [
        { intervention_id: 1, teacher_id: 10, user_id: 1, kp_id: 1, type: 'PRACTICE', detail: '完成边界值分析 3 道练习，课后提交', status: 'IN_PROGRESS', created_at: day(2), updated_at: day(1) },
        { intervention_id: 2, teacher_id: 10, user_id: 2, kp_id: 1, type: 'REMINDER', detail: '注意控制答题时间，先复习边界定义', status: 'PENDING', created_at: day(1), updated_at: day(1) }
      ],
      feedbackRecords: [],
      annotations: [],
      aiDialogues: [],
      recommendations: [
        { rec_id: 1, user_id: 1, kp_id: 1, source: 'SYSTEM', reason: '准确率 57% 低于 60%', question_ids: [1, 2, 6], accepted: false, created_at: day(1) },
        { rec_id: 2, user_id: 1, kp_id: 2, source: 'SELF', reason: '学生自主标识薄弱', question_ids: [3, 4], accepted: false, created_at: day(1) }
      ],
      difficultyMarks: [
        { mark_id: 'M-1001', student_id: 1, kp_id: 1, observation: '边界有效性混淆',
          uncertainty: '仅覆盖边界值分析一个知识点', next_check: '完成边界值题 3',
          status: 'PENDING_REVIEW', confidence: 0.72, rule_version: 'v2-candidate',
          evidence_source: ['图谱结构', '学情数据', '文本标注'], created_at: day(3) },
        { mark_id: 'M-1002', student_id: 2, kp_id: 1, observation: '准确率达标但正确作答时间明显偏长',
          uncertainty: '仅时间证据，建议继续观察', next_check: '限时完成边界值题 2',
          status: 'PENDING_REVIEW', confidence: 0.60, rule_version: 'v2-candidate',
          evidence_source: ['学情数据'], created_at: day(2) },
        { mark_id: 'M-1003', student_id: 3, kp_id: 2, observation: '等价类概念模糊',
          uncertainty: '仅 2 道题证据', next_check: '重做等价类题 2',
          status: 'CONFIRMED', confidence: 0.80, rule_version: 'v2-candidate',
          evidence_source: ['学情数据', '文本标注'], created_at: day(2) },
        { mark_id: 'M-1004', student_id: 1, kp_id: 3, observation: '暂无作答记录',
          uncertainty: '证据不足，不判掌握差', next_check: '完成测试用例设计题 1',
          status: 'INSUFFICIENT', confidence: 0.30, rule_version: 'v2-candidate',
          evidence_source: ['学情数据'], created_at: day(1) }
      ],
      evidenceRefs: [
        { mark_id: 'M-1001', question_id: 1, kp_id: 1, reason_text: '以为 x=0 也是有效边界', is_correct: false },
        { mark_id: 'M-1001', question_id: 2, kp_id: 1, reason_text: 'x=0 在边界附近', is_correct: false },
        { mark_id: 'M-1002', question_id: 1, kp_id: 1, reason_text: '仔细核对后确定', is_correct: true },
        { mark_id: 'M-1002', question_id: 2, kp_id: 1, reason_text: '不确定，反复比较边界', is_correct: true },
        { mark_id: 'M-1003', question_id: 3, kp_id: 2, reason_text: '以为要测试所有输入', is_correct: false }
      ],
      markViews: [],
      reviewActions: [],
      recommendRequests: [
        { request_id: 'R-1', mark_id: 'M-1001', kp_ids: [1], limit_n: 3, state: 'SERVED', degraded: false, created_at: day(1) },
        { request_id: 'R-2', mark_id: 'M-1004', kp_ids: [3], limit_n: 3, state: 'DEGRADED', degraded: true, created_at: day(1) }
      ],
      recommendItems: [
        { item_id: 'I-1', request_id: 'R-1', type: 'choice', kp_id: 1, est_minutes: 3 },
        { item_id: 'I-2', request_id: 'R-1', type: 'subjective', kp_id: 1, est_minutes: 6 }
      ],
      interventionLogs: [
        { log_id: 'L-1', mark_id: 'M-1001', student_id: 1, action: 'GO_PRACTICE', source_page: 'mark_detail', created_at: day(1) },
        { log_id: 'L-2', mark_id: 'M-1001', student_id: 1, action: 'RETRY_QUESTION', source_page: 'mark_detail', created_at: day(1) }
      ],
      logs: [
        { log_id: 1, user_id: 10, action_type: 'grade_review', detail: '复核主观题 #6', created_at: day(3) },
        { log_id: 2, user_id: 1, action_type: 'self_mark', detail: '标识 边界值分析 为薄弱', created_at: day(2) }
      ],
      config: {
        kp_accuracy_threshold: 0.6,
        time_ratio_threshold: 1.5,
        min_student_correct_samples: 3,
        question_accuracy_threshold: 0.6,
        min_time_samples: 5,
        time_variance_threshold: 200,
        weak_ratio_threshold: 0.3,
        key_score_share_threshold: 0.2,
        eval_kp_recall_target: 0.8,
        eval_kp_precision_target: 0.85,
        eval_relation_target: 0.8,
        eval_source_target: 0.95,
        llm_model: 'claude-opus-5-5',
        llm_timeout: 60,
        llm_enabled: true,
        auth_demo_mode: true,
        cicd_pipeline: 'manual',
        cicd_auto_test: 'on'
      },
      seq: 100
    };
  }

  // ---- 种子答题记录 ----
  function seedAnswers(db) {
    let id = 1000;
    const add = (user_id, question_id, kp_id, answer_text, reason_text, duration_sec, opts = {}) => {
      const q = db.questions.find(x => x.question_id === question_id);
      const isSubj = q.type === 'subjective';
      let is_correct = isSubj ? null : (answer_text === q.answer ? 1 : 0);
      const ai_score = opts.ai_score != null ? opts.ai_score : (isSubj ? null : (is_correct ? 100 : 0));
      const final_score = opts.final_score != null ? opts.final_score : (isSubj ? ai_score : (is_correct ? 1 : 0));
      db.answers.push({
        answer_id: id++, user_id, question_id, kp_id, answer_text, reason_text, duration_sec,
        judge_type: isSubj ? 'AI' : 'PROGRAM',
        review_status: opts.review_status || (isSubj ? 'PENDING' : 'NONE'),
        is_correct, ai_score, final_score,
        judge_comment: opts.judge_comment || (isSubj ? '[引擎:LLM] 要点基本答到' : '程序判分'),
        created_at: opts.at || day(3)
      });
    };
    // s1 kp1：7 题，4 对（57%）
    add(1, 1, 1, 'A', '以为 x=0 也是有效边界', 25);
    add(1, 1, 1, 'B', 'x=1 是下边界', 30);
    add(1, 2, 1, 'A', 'x=0 在边界附近', 30);
    add(1, 2, 1, 'A', '又把越界当有效', 22);
    add(1, 2, 1, 'B', '越界即无效', 28);
    add(1, 2, 1, 'B', 'x=0 超出范围', 26);
    // s2 kp1：5 题，4 对；正确作答耗时明显偏长
    add(2, 1, 1, 'A', '没注意边界定义', 45);
    add(2, 1, 1, 'B', '仔细核对后确定', 200);
    add(2, 1, 1, 'B', '再次检查边界', 190);
    add(2, 2, 1, 'B', '思考很久才确认', 180);
    add(2, 2, 1, 'B', '不确定，反复比较', 240);
    // s3 kp1
    add(3, 1, 1, 'B', '边界为 1 和 100', 42);
    add(3, 2, 1, 'B', 'x=0 越界', 36);
    // kp2
    add(1, 3, 2, 'B', '分类取代表', 24);
    add(1, 4, 2, 'C', '0 不在范围内', 30);
    add(1, 4, 2, 'C', '无效等价类', 25);
    add(2, 3, 2, 'B', '核心思想明确', 20);
    add(2, 3, 2, 'B', '翻课件确认', 90);
    add(2, 4, 2, 'C', '范围外', 26);
    add(3, 3, 2, 'A', '以为要测所有输入', 30);
    add(3, 4, 2, 'C', '0 是无效等价类', 22);
    // kp4
    add(1, 5, 4, 'A', '访谈最常用', 15);
    add(2, 5, 4, 'A', '访谈', 18);
    add(3, 5, 4, 'A', '访谈', 16);
    // 主观题 s2：待复核
    add(2, 6, 1, '边界值分析测试边界附近的值，是等价类划分的补充。', '凭记忆作答', 95, { ai_score: 62, positive: true });
    // 自评
    db.selfMarks.push(
      { mark_id: 1, user_id: 1, kp_id: 1, reason: '边界值题总是做错，概念没弄清', status: 'ACTIVE', created_at: day(2), updated_at: day(2) },
      { mark_id: 2, user_id: 2, kp_id: 4, reason: '需求获取方法记不住', status: 'ACTIVE', created_at: day(1), updated_at: day(1) },
      { mark_id: 3, user_id: 3, kp_id: 2, reason: '等价类还是有点模糊', status: 'ACTIVE', created_at: day(1), updated_at: day(1) }
    );
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    const db = seed();
    seedAnswers(db);
    save(db);
    return db;
  }

  function save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* 空间不足时忽略 */ }
  }

  function reset() {
    localStorage.removeItem(KEY);
    return load();
  }

  window.MockDB = {
    get db() { return window.__db || (window.__db = load()); },
    save() { save(window.__db); },
    reset() { window.__db = reset(); }
  };
})();
