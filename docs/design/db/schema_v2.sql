-- =====================================================================
-- 第四组 · 主线 学 / 记 / 诊  数据库设计 v2（PostgreSQL 14+）
-- 负责人：杨逸（学/记/诊 + AI 与评测）    版本：design-v2  2026-11-02
-- 变更（相对 v1）：
--   1) 新增 kp_relations、question_kp、resource_kp、exam_papers、exam_kp_scores
--   2) 新增 weakness_items（个人薄弱项）、difficulty_points（班级难点）、key_points（真题重点）
--   3) answer_records 增加 duration_sec（答题耗时）、judge_type（判分方式）
--   4) 移除 learning_events：不记录行为事件，行为不进入诊断
--   5) 知识点增加出处（source_quote）与审核状态；阈值统一带 rule_version
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- A. 用户与内容（9 张）
-- ---------------------------------------------------------------------
CREATE TABLE users (
    user_id      BIGSERIAL PRIMARY KEY,
    name         VARCHAR(64)  NOT NULL,
    role         VARCHAR(16)  NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
    class_id     VARCHAR(32),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE courses (
    course_id    BIGSERIAL PRIMARY KEY,
    name         VARCHAR(128) NOT NULL,
    term         VARCHAR(32)  NOT NULL,
    teacher_id   BIGINT REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE chapters (
    chapter_id   BIGSERIAL PRIMARY KEY,
    course_id    BIGINT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    name         VARCHAR(128) NOT NULL,
    seq          INT NOT NULL,
    UNIQUE (course_id, seq)
);

CREATE TABLE knowledge_points (
    kp_id             BIGSERIAL PRIMARY KEY,
    chapter_id        BIGINT NOT NULL REFERENCES chapters(chapter_id) ON DELETE CASCADE,
    name              VARCHAR(128) NOT NULL,
    description       TEXT,
    difficulty        SMALLINT CHECK (difficulty BETWEEN 1 AND 5),
    source_resource_id BIGINT,              -- 出处：哪份资料
    source_page       INT,                  -- 出处：第几页 / 第几秒
    source_quote      TEXT,                 -- 出处：原文一句（可回查，防幻觉）
    status            VARCHAR(16) NOT NULL DEFAULT 'PENDING_REVIEW'
                      CHECK (status IN ('PENDING_REVIEW', 'CONFIRMED', 'REJECTED')),
    model_version     VARCHAR(32),
    prompt_version    VARCHAR(32),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kp_chapter ON knowledge_points(chapter_id);

CREATE TABLE kp_relations (
    relation_id   BIGSERIAL PRIMARY KEY,
    from_kp_id    BIGINT NOT NULL REFERENCES knowledge_points(kp_id) ON DELETE CASCADE,
    to_kp_id      BIGINT NOT NULL REFERENCES knowledge_points(kp_id) ON DELETE CASCADE,
    relation_type VARCHAR(16) NOT NULL
                  CHECK (relation_type IN ('PREREQUISITE', 'PART_OF', 'RELATED')),
    confidence    NUMERIC(3,2) CHECK (confidence BETWEEN 0 AND 1),
    source_quote  TEXT,
    status        VARCHAR(16) NOT NULL DEFAULT 'PENDING_REVIEW'
                  CHECK (status IN ('PENDING_REVIEW', 'CONFIRMED', 'REJECTED')),
    CHECK (from_kp_id <> to_kp_id)
);
CREATE INDEX idx_rel_from ON kp_relations(from_kp_id);
CREATE INDEX idx_rel_to ON kp_relations(to_kp_id);

CREATE TABLE learning_resources (
    resource_id  BIGSERIAL PRIMARY KEY,
    type         VARCHAR(16) NOT NULL CHECK (type IN ('pdf', 'video', 'slide', 'link')),
    title        VARCHAR(200) NOT NULL,
    uri          TEXT NOT NULL,            -- 原始文件地址，内容不改写
    duration_sec INT CHECK (duration_sec >= 0),   -- 视频总长，可为空
    page_count   INT CHECK (page_count >= 0)
);

CREATE TABLE resource_kp (
    resource_id  BIGINT NOT NULL REFERENCES learning_resources(resource_id) ON DELETE CASCADE,
    kp_id        BIGINT NOT NULL REFERENCES knowledge_points(kp_id) ON DELETE CASCADE,
    PRIMARY KEY (resource_id, kp_id)
);

CREATE TABLE questions (
    question_id  BIGSERIAL PRIMARY KEY,
    type         VARCHAR(16) NOT NULL CHECK (type IN ('single', 'multiple', 'judge', 'short')),
    stem         TEXT NOT NULL,
    answer_key   JSONB NOT NULL,
    rubric       TEXT,
    difficulty   SMALLINT CHECK (difficulty BETWEEN 1 AND 5)
);

CREATE TABLE question_kp (
    question_id  BIGINT NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    kp_id        BIGINT NOT NULL REFERENCES knowledge_points(kp_id) ON DELETE CASCADE,
    is_primary   BOOLEAN NOT NULL DEFAULT false,   -- 主考点，每题恰好一个
    confidence   NUMERIC(3,2) CHECK (confidence BETWEEN 0 AND 1),
    PRIMARY KEY (question_id, kp_id)
);

-- ---------------------------------------------------------------------
-- B. 考试与重点（2 张）
-- ---------------------------------------------------------------------
CREATE TABLE exam_papers (
    paper_id     BIGSERIAL PRIMARY KEY,
    name         VARCHAR(200) NOT NULL,
    year         SMALLINT,
    course_id    BIGINT REFERENCES courses(course_id) ON DELETE SET NULL
);

CREATE TABLE exam_kp_scores (
    paper_id     BIGINT NOT NULL REFERENCES exam_papers(paper_id) ON DELETE CASCADE,
    kp_id        BIGINT NOT NULL REFERENCES knowledge_points(kp_id) ON DELETE CASCADE,
    score        NUMERIC(5,2) NOT NULL CHECK (score >= 0),
    total_score  NUMERIC(5,2) NOT NULL CHECK (total_score > 0),
    source_item  VARCHAR(64),              -- 题号，便于回查
    PRIMARY KEY (paper_id, kp_id)
);

-- ---------------------------------------------------------------------
-- C. 学习（2 张）
-- ---------------------------------------------------------------------
CREATE TABLE learning_sessions (
    session_id    BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    kp_id         BIGINT NOT NULL REFERENCES knowledge_points(kp_id) ON DELETE CASCADE,
    resource_id   BIGINT REFERENCES learning_resources(resource_id) ON DELETE SET NULL,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at      TIMESTAMPTZ,
    last_position INT NOT NULL DEFAULT 0,             -- 页码或秒
    status        VARCHAR(16) NOT NULL DEFAULT 'NOT_STARTED'
                  CHECK (status IN ('NOT_STARTED', 'LEARNING', 'PAUSED', 'COMPLETED', 'EXPIRED'))
);
CREATE INDEX idx_sessions_user_kp ON learning_sessions(user_id, kp_id, started_at DESC);

CREATE TABLE learning_progress (
    user_id       BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    resource_id   BIGINT NOT NULL REFERENCES learning_resources(resource_id) ON DELETE CASCADE,
    percent       SMALLINT NOT NULL DEFAULT 0 CHECK (percent BETWEEN 0 AND 100),
    last_position INT NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, resource_id)
);

-- ---------------------------------------------------------------------
-- D. 答题（2 张）
-- ---------------------------------------------------------------------
CREATE TABLE quiz_attempts (
    attempt_id   BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    quiz_id      VARCHAR(64) NOT NULL,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at TIMESTAMPTZ,
    status       VARCHAR(16) NOT NULL DEFAULT 'DRAFT'
                 CHECK (status IN ('DRAFT', 'SUBMITTED', 'GRADED', 'PENDING_REVIEW', 'CONFIRMED', 'ARCHIVED')),
    score        NUMERIC(5,2) CHECK (score >= 0)
);

CREATE TABLE answer_records (
    answer_id     BIGSERIAL PRIMARY KEY,
    attempt_id    BIGINT NOT NULL REFERENCES quiz_attempts(attempt_id) ON DELETE CASCADE,
    question_id   BIGINT NOT NULL REFERENCES questions(question_id) ON DELETE RESTRICT,
    kp_id         BIGINT NOT NULL REFERENCES knowledge_points(kp_id) ON DELETE RESTRICT,  -- 主考点
    answer_text   TEXT NOT NULL,
    is_correct    BOOLEAN,
    duration_sec  INT NOT NULL CHECK (duration_sec >= 0),   -- 答题耗时，第二判据
    reason_text   TEXT,                                     -- 理由原文，只追加不改写
    judge_type    VARCHAR(8) NOT NULL DEFAULT 'PROGRAM'
                  CHECK (judge_type IN ('PROGRAM', 'AI', 'HUMAN')),
    review_status VARCHAR(16) NOT NULL DEFAULT 'NONE'
                  CHECK (review_status IN ('NONE', 'PENDING', 'CONFIRMED', 'OVERRIDDEN')),
    answered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (attempt_id, question_id)
);
CREATE INDEX idx_answers_kp_time ON answer_records(kp_id, answered_at);
COMMENT ON COLUMN answer_records.reason_text IS '学生原始理由，不允许加工；作为诊断证据引用';
COMMENT ON COLUMN answer_records.duration_sec IS '答题耗时（秒）；样本足够时作为薄弱项第二判据';

-- ---------------------------------------------------------------------
-- E. 诊断（4 张）
-- ---------------------------------------------------------------------
CREATE TABLE weakness_items (
    weakness_id    BIGSERIAL PRIMARY KEY,
    user_id        BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    kp_id          BIGINT NOT NULL REFERENCES knowledge_points(kp_id) ON DELETE CASCADE,
    attempt_count  INT NOT NULL DEFAULT 0,
    correct_count  INT NOT NULL DEFAULT 0,
    correct_rate   NUMERIC(4,3) CHECK (correct_rate BETWEEN 0 AND 1),
    avg_duration   NUMERIC(8,2),          -- 该生该知识点平均耗时
    avg_correct    NUMERIC(8,2),          -- 全体正确作答平均耗时
    time_ratio     NUMERIC(5,2),          -- avg_duration / avg_correct
    sufficiency    VARCHAR(16) NOT NULL
                   CHECK (sufficiency IN ('INSUFFICIENT', 'SUFFICIENT')),
    status         VARCHAR(16) NOT NULL DEFAULT 'CANDIDATE'
                   CHECK (status IN ('INSUFFICIENT', 'CANDIDATE', 'CONFIRMED', 'REJECTED', 'EXPIRED')),
    rule_version   VARCHAR(32) NOT NULL DEFAULT 'v1-candidate',
    period_start   DATE,
    period_end     DATE,
    generated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, kp_id, generated_at)
);
CREATE INDEX idx_weak_user_kp ON weakness_items(user_id, kp_id, generated_at DESC);
COMMENT ON COLUMN weakness_items.sufficiency IS 'INSUFFICIENT 为一等状态，不等于掌握差';
COMMENT ON COLUMN weakness_items.time_ratio IS '超过阈值才参与判定；阈值与最少样本数为候选值';

CREATE TABLE difficulty_points (
    difficulty_id  BIGSERIAL PRIMARY KEY,
    kp_id          BIGINT NOT NULL REFERENCES knowledge_points(kp_id) ON DELETE CASCADE,
    class_id       VARCHAR(32) NOT NULL,
    weak_count     INT NOT NULL DEFAULT 0,
    total_students INT NOT NULL DEFAULT 0,
    weak_ratio     NUMERIC(4,3),
    rank           INT,
    period_start   DATE,
    period_end     DATE,
    rule_version   VARCHAR(32) NOT NULL DEFAULT 'v1-candidate',
    generated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_diff_class ON difficulty_points(class_id, period_end, rank);
COMMENT ON TABLE difficulty_points IS '班级难点：由全班 weakness_items 按知识点汇总';

CREATE TABLE key_points (
    key_id       BIGSERIAL PRIMARY KEY,
    kp_id        BIGINT NOT NULL REFERENCES knowledge_points(kp_id) ON DELETE CASCADE,
    paper_id     BIGINT NOT NULL REFERENCES exam_papers(paper_id) ON DELETE CASCADE,
    score        NUMERIC(5,2) NOT NULL,
    total_score  NUMERIC(5,2) NOT NULL,
    score_share  NUMERIC(4,3),
    rank         INT,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE key_points IS '真题重点：来自 exam_kp_scores 的分值占比，不是学生投票';

CREATE TABLE diagnosis_reports (
    report_id     BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    period_start  DATE NOT NULL,
    period_end    DATE NOT NULL,
    status        VARCHAR(16) NOT NULL DEFAULT 'DRAFT'
                  CHECK (status IN ('DRAFT', 'READY', 'REVIEWED')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (period_end >= period_start)
);

CREATE TABLE diagnosis_report_items (
    report_id    BIGINT NOT NULL REFERENCES diagnosis_reports(report_id) ON DELETE CASCADE,
    weakness_id  BIGINT NOT NULL REFERENCES weakness_items(weakness_id) ON DELETE CASCADE,
    seq          INT NOT NULL DEFAULT 0,
    PRIMARY KEY (report_id, weakness_id)
);

-- ---------------------------------------------------------------------
-- F. 评测（1 张）
-- ---------------------------------------------------------------------
CREATE TABLE evaluation_runs (
    run_id         BIGSERIAL PRIMARY KEY,
    metric_name    VARCHAR(64) NOT NULL,     -- 知识点召回率 / 准确率 / 关系准确率 / 出处可定位率 / 薄弱项一致率
    value          NUMERIC(6,3),
    target         NUMERIC(6,3),
    sample_set     VARCHAR(128),             -- 评测集版本
    model_version  VARCHAR(64),
    prompt_version VARCHAR(32),
    run_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    owner_id       BIGINT REFERENCES users(user_id),
    notes          TEXT
);
CREATE INDEX idx_eval_metric ON evaluation_runs(metric_name, run_at DESC);
COMMENT ON TABLE evaluation_runs IS 'AI 评测台账：每次运行一行，支持版本对比与回归';

COMMIT;

-- =====================================================================
-- 说明：
--   1) 共 20 张表：A 9 + B 2 + C 2 + D 2 + E 4 + F 1。
--   2) 知识点、资源、题目均为多对多，分别经 resource_kp、question_kp 关联。
--   3) 不设 learning_events：学习行为不进入诊断，只保留进度与位置。
--   4) 所有阈值（最少样本数、超时倍数、一致率目标）均为候选值，随 rule_version 留痕。
-- =====================================================================
