-- =====================================================================
-- 第四组 · 学记诊 + AI 评测   数据库增量设计 v3（PostgreSQL 14+）
-- 基线：schema_v2.sql（A-F 六组 20 张表）
-- 新增：
--   1) self_weak_marks        学生自主标识薄弱知识点（主观证据，不参与系统判定）
--   2) eval_datasets/items    AI 评测固定标注集（REQ-QA-02）
--   3) grade_reviews          主观题教师改判留痕
--   4) system_config          阈值与规则版本（候选值）
--   5) annotations            教师文本标注（重点/难点/易错）
--   6) action_logs            操作审计
--   7) evaluation_runs 增列    run_group / engine / passed（按次运行聚合）
-- 说明：所有阈值均为候选值；变更需更新 rule_version。
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. 学生自主标识（主观证据）
-- ---------------------------------------------------------------------
CREATE TABLE self_weak_marks (
    mark_id     BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    kp_id       BIGINT NOT NULL REFERENCES knowledge_points(kp_id) ON DELETE CASCADE,
    reason      VARCHAR(200),                       -- 自评理由，可空
    status      VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'
                CHECK (status IN ('ACTIVE', 'CANCELLED')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, kp_id)                         -- 一人一知识点一条
);
CREATE INDEX idx_self_marks_kp ON self_weak_marks(kp_id, status);
COMMENT ON TABLE self_weak_marks IS '学生自主标识薄弱知识点；仅展示与推荐优先级，不进入薄弱项计算';
COMMENT ON COLUMN self_weak_marks.status IS 'CANCELLED 保留历史，不物理删除';

-- ---------------------------------------------------------------------
-- 2. AI 评测标注集（固定版本，可复查）
-- ---------------------------------------------------------------------
CREATE TABLE eval_datasets (
    dataset_id   BIGSERIAL PRIMARY KEY,
    name         VARCHAR(128) NOT NULL,
    run_type     VARCHAR(32) NOT NULL
                 CHECK (run_type IN ('KP_EXTRACTION', 'RELATION_ACCURACY')),
    description  TEXT,
    version      VARCHAR(32) NOT NULL DEFAULT 'v1',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE eval_items (
    item_id     BIGSERIAL PRIMARY KEY,
    dataset_id  BIGINT NOT NULL REFERENCES eval_datasets(dataset_id) ON DELETE CASCADE,
    item_key    VARCHAR(128) NOT NULL,      -- 知识点名称 / 题目 ID
    expected    VARCHAR(256) NOT NULL,      -- 人工标注的正确答案
    detail      TEXT
);
CREATE INDEX idx_eval_items_ds ON eval_items(dataset_id);
COMMENT ON TABLE eval_items IS '人工标注期望值；指标计算以此为准，不随模型输出修改';

-- ---------------------------------------------------------------------
-- 3. 主观题改判留痕
-- ---------------------------------------------------------------------
CREATE TABLE grade_reviews (
    review_id    BIGSERIAL PRIMARY KEY,
    answer_id    BIGINT NOT NULL REFERENCES answer_records(answer_id) ON DELETE CASCADE,
    teacher_id   BIGINT NOT NULL REFERENCES users(user_id),
    ai_score     NUMERIC(5,2),              -- 原 AI 分（只读留痕）
    final_score  NUMERIC(5,2) NOT NULL,     -- 教师最终分
    comment      TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_grade_reviews_answer ON grade_reviews(answer_id);
COMMENT ON TABLE grade_reviews IS '改判留痕：原始提交与 AI 初判不可改写，只追加';

-- ---------------------------------------------------------------------
-- 4. 系统配置（阈值、目标、演示开关）
-- ---------------------------------------------------------------------
CREATE TABLE system_config (
    key          VARCHAR(64) PRIMARY KEY,
    value        VARCHAR(256) NOT NULL,
    description  VARCHAR(256),
    rule_version VARCHAR(32) NOT NULL DEFAULT 'v2-candidate',
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by   BIGINT REFERENCES users(user_id)
);
COMMENT ON TABLE system_config IS '判定阈值与评测目标；修改后立即生效，历史快照保留旧 rule_version';

-- ---------------------------------------------------------------------
-- 5. 教师文本标注
-- ---------------------------------------------------------------------
CREATE TABLE annotations (
    annotation_id BIGSERIAL PRIMARY KEY,
    kp_id         BIGINT NOT NULL REFERENCES knowledge_points(kp_id) ON DELETE CASCADE,
    teacher_id    BIGINT NOT NULL REFERENCES users(user_id),
    mark          VARCHAR(16) NOT NULL
                  CHECK (mark IN ('重点', '难点', '易错', '补充')),
    note          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_annotations_kp ON annotations(kp_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 6. 操作审计
-- ---------------------------------------------------------------------
CREATE TABLE action_logs (
    log_id      BIGSERIAL PRIMARY KEY,
    user_id     BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    action_type VARCHAR(32) NOT NULL,       -- login / answer / grade_review / config_update / upload / eval_run ...
    target_id   VARCHAR(64),
    detail      JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_action_logs_time ON action_logs(created_at DESC);
CREATE INDEX idx_action_logs_type ON action_logs(action_type, created_at DESC);

-- ---------------------------------------------------------------------
-- 7. 画 / 荐 / 干（对齐第四组汇报 PPT：7 张表）
-- ---------------------------------------------------------------------
-- 7.1 画：E4 输出投影 + 证据引用（只读）
CREATE TABLE difficulty_marks (
    mark_id        UUID PRIMARY KEY,
    student_id     BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    kp_id          BIGINT NOT NULL REFERENCES knowledge_points(kp_id) ON DELETE CASCADE,
    observation    TEXT NOT NULL,
    uncertainty    TEXT,
    next_check     TEXT,
    status         VARCHAR(16) NOT NULL DEFAULT 'PENDING_REVIEW'
                   CHECK (status IN ('PENDING_REVIEW', 'CONFIRMED', 'REJECTED', 'INSUFFICIENT')),
    confidence     NUMERIC(4,3),
    rule_version   VARCHAR(32) NOT NULL DEFAULT 'v2-candidate',
    evidence_source JSONB,                      -- 图谱结构 / 学情数据 / 文本标注
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, kp_id, rule_version)
);
CREATE INDEX idx_dmarks_student ON difficulty_marks(student_id, status);
COMMENT ON TABLE difficulty_marks IS 'E4 输出投影（只读）：五字段 observation/evidence/uncertainty/next_check/status';

CREATE TABLE evidence_refs (
    mark_id      UUID NOT NULL REFERENCES difficulty_marks(mark_id) ON DELETE RESTRICT,
    question_id  BIGINT NOT NULL REFERENCES questions(question_id) ON DELETE RESTRICT,
    kp_id        BIGINT NOT NULL REFERENCES knowledge_points(kp_id) ON DELETE RESTRICT,
    reason_text  TEXT,                          -- 原文引用，不加工
    is_correct   BOOLEAN,
    PRIMARY KEY (mark_id, question_id)
);
CREATE INDEX idx_erefs_kp ON evidence_refs(kp_id);
COMMENT ON TABLE evidence_refs IS '证据引用（只读）：只引用 answer_records.reason_text 原文，不复写';

CREATE TABLE mark_views (
    view_id      UUID PRIMARY KEY,
    mark_id      UUID NOT NULL REFERENCES difficulty_marks(mark_id) ON DELETE CASCADE,
    scope        VARCHAR(16) NOT NULL CHECK (scope IN ('MY', 'CLASS')),
    filter_hash  VARCHAR(64) NOT NULL,
    rendered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (mark_id, scope, filter_hash)        -- 曝光幂等
);

CREATE TABLE review_actions (
    action_id    UUID PRIMARY KEY,
    mark_id      UUID NOT NULL REFERENCES difficulty_marks(mark_id) ON DELETE CASCADE,
    reviewer_id  BIGINT NOT NULL REFERENCES users(user_id),
    decision     VARCHAR(16) NOT NULL CHECK (decision IN ('CONFIRMED', 'REJECTED')),
    comment      TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_review_mark ON review_actions(mark_id, created_at DESC);

-- 7.2 荐：请求与候选（只读 + 缓存）
CREATE TABLE recommend_requests (
    request_id   UUID PRIMARY KEY,
    mark_id      UUID NOT NULL REFERENCES difficulty_marks(mark_id) ON DELETE CASCADE,
    kp_ids       BIGINT[] NOT NULL DEFAULT '{}',
    limit_n      INT NOT NULL DEFAULT 3,
    state        VARCHAR(16) NOT NULL
                 CHECK (state IN ('REQUESTED', 'SERVED', 'ADOPTED', 'EMPTY', 'DEGRADED', 'DISMISSED')),
    degraded     BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rreq_state ON recommend_requests(state, created_at DESC);

CREATE TABLE recommend_items (
    item_id      UUID PRIMARY KEY,
    request_id   UUID NOT NULL REFERENCES recommend_requests(request_id) ON DELETE CASCADE,
    type         VARCHAR(16) NOT NULL,
    kp_id        BIGINT REFERENCES knowledge_points(kp_id) ON DELETE SET NULL,
    est_minutes  INT,
    expires_at   TIMESTAMPTZ DEFAULT (now() + interval '24 hours')  -- TTL 24h
);
CREATE INDEX idx_ritem_req ON recommend_items(request_id);

-- 7.3 干：学生动作记录（只写）
CREATE TABLE intervention_logs (
    log_id       UUID PRIMARY KEY,
    mark_id      UUID REFERENCES difficulty_marks(mark_id) ON DELETE SET NULL,
    student_id   BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    action       VARCHAR(24) NOT NULL
                 CHECK (action IN ('RETRY_QUESTION', 'GO_PRACTICE', 'ASK_TEACHER')),
    source_page  VARCHAR(32),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ilog_student ON intervention_logs(student_id, created_at DESC);
COMMENT ON TABLE intervention_logs IS '动作日志：只开放 INSERT；与 next_check（系统建议）区分';

-- ---------------------------------------------------------------------
-- 8. evaluation_runs 增列：按次运行聚合
-- ---------------------------------------------------------------------
ALTER TABLE evaluation_runs
    ADD COLUMN IF NOT EXISTS run_group UUID,
    ADD COLUMN IF NOT EXISTS engine VARCHAR(16)
        CHECK (engine IN ('LLM', 'RULE_FALLBACK')),
    ADD COLUMN IF NOT EXISTS passed BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_eval_group ON evaluation_runs(run_group);
COMMENT ON COLUMN evaluation_runs.run_group IS '同一次评测运行的多条指标共享该 UUID';
COMMENT ON COLUMN evaluation_runs.engine IS 'LLM 或规则回退；规则结果不得混入 AI 能力结论';

COMMIT;

-- =====================================================================
-- 增量后表数：20（基线）+ 14（新增：self_weak_marks、eval_datasets、eval_items、
-- grade_reviews、system_config、annotations、action_logs、
-- difficulty_marks、evidence_refs、mark_views、review_actions、
-- recommend_requests、recommend_items、intervention_logs）= 34 张
-- 说明：本文档只增不改；如需回滚，按依赖逆序 DROP。
-- =====================================================================
