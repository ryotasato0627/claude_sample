CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    email         TEXT        NOT NULL UNIQUE,
    name          TEXT        NOT NULL,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE projects (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE project_members (
    project_id BIGINT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    user_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role       TEXT   NOT NULL CHECK (role IN ('owner', 'member', 'viewer')),
    PRIMARY KEY (project_id, user_id)
);
CREATE INDEX idx_project_members_user_id ON project_members (user_id);

CREATE TABLE tasks (
    id          BIGSERIAL PRIMARY KEY,
    project_id  BIGINT      NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    title       TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    status      TEXT        NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
    assignee_id BIGINT      REFERENCES users (id) ON DELETE SET NULL,
    created_by  BIGINT      NOT NULL REFERENCES users (id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_project_id_updated_at ON tasks (project_id, updated_at DESC);
CREATE INDEX idx_tasks_assignee_id ON tasks (assignee_id);

CREATE TABLE comments (
    id         BIGSERIAL PRIMARY KEY,
    task_id    BIGINT      NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    user_id    BIGINT      NOT NULL REFERENCES users (id),
    body       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_task_id ON comments (task_id, created_at);
