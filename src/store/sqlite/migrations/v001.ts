import type { Migration } from '../lib/migrate';

const EMBEDDING_DIM = 384;

export const v001: Migration = {
  version: 1,
  sql: `
-- =============================================
-- Workspace-level tables
-- =============================================

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE projects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  directory  TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec') * 1000)
);

CREATE TABLE team_members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  email      TEXT,
  role       TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec') * 1000)
);

CREATE TABLE tags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  UNIQUE(project_id, name)
);
CREATE INDEX idx_tags_project ON tags(project_id);

CREATE TABLE attachments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  graph      TEXT NOT NULL,
  entity_id  INTEGER NOT NULL,
  filename   TEXT NOT NULL,
  mime_type  TEXT NOT NULL,
  size       INTEGER NOT NULL,
  url        TEXT,
  added_at   INTEGER NOT NULL DEFAULT (unixepoch('now','subsec') * 1000),
  UNIQUE(project_id, graph, entity_id, filename)
);

-- =============================================
-- Unified edges (same-graph + cross-graph)
-- =============================================

CREATE TABLE edges (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_graph TEXT NOT NULL,
  from_id    INTEGER NOT NULL,
  to_graph   TEXT NOT NULL,
  to_id      INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  PRIMARY KEY (project_id, from_graph, from_id, to_graph, to_id, kind)
);
CREATE INDEX idx_edges_target ON edges(to_graph, to_id);
CREATE INDEX idx_edges_source ON edges(from_graph, from_id);

-- =============================================
-- Knowledge (notes)
-- =============================================

CREATE TABLE knowledge (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL DEFAULT '',
  version       INTEGER NOT NULL DEFAULT 1,
  created_by_id INTEGER,
  updated_by_id INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch('now','subsec') * 1000),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch('now','subsec') * 1000),
  UNIQUE(project_id, slug)
);
CREATE INDEX idx_knowledge_project ON knowledge(project_id);

CREATE VIRTUAL TABLE knowledge_fts USING fts5(
  title, content, content=knowledge, content_rowid=id
);
CREATE TRIGGER knowledge_ai AFTER INSERT ON knowledge BEGIN
  INSERT INTO knowledge_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
END;
CREATE TRIGGER knowledge_ad AFTER DELETE ON knowledge BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
END;
CREATE TRIGGER knowledge_au AFTER UPDATE ON knowledge BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
  INSERT INTO knowledge_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
END;

CREATE VIRTUAL TABLE knowledge_vec USING vec0(embedding float[${EMBEDDING_DIM}]);

CREATE TRIGGER knowledge_cleanup AFTER DELETE ON knowledge BEGIN
  DELETE FROM edges WHERE
    (from_graph = 'knowledge' AND from_id = old.id AND project_id = old.project_id) OR
    (to_graph = 'knowledge' AND to_id = old.id AND project_id = old.project_id);
  DELETE FROM attachments WHERE graph = 'knowledge' AND entity_id = old.id AND project_id = old.project_id;
  DELETE FROM knowledge_vec WHERE rowid = old.id;
END;

-- =============================================
-- Tasks
-- =============================================

CREATE TABLE tasks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'backlog',
  priority      TEXT NOT NULL DEFAULT 'medium',
  "order"       REAL NOT NULL DEFAULT 0,
  due_date      INTEGER,
  estimate      INTEGER,
  completed_at  INTEGER,
  assignee_id   INTEGER,
  version       INTEGER NOT NULL DEFAULT 1,
  created_by_id INTEGER,
  updated_by_id INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch('now','subsec') * 1000),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch('now','subsec') * 1000),
  UNIQUE(project_id, slug)
);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_status ON tasks(project_id, status, "order");

CREATE VIRTUAL TABLE tasks_fts USING fts5(
  title, description, content=tasks, content_rowid=id
);
CREATE TRIGGER tasks_ai AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
END;
CREATE TRIGGER tasks_ad AFTER DELETE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, description) VALUES ('delete', old.id, old.title, old.description);
END;
CREATE TRIGGER tasks_au AFTER UPDATE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, description) VALUES ('delete', old.id, old.title, old.description);
  INSERT INTO tasks_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
END;

CREATE VIRTUAL TABLE tasks_vec USING vec0(embedding float[${EMBEDDING_DIM}]);

CREATE TRIGGER tasks_cleanup AFTER DELETE ON tasks BEGIN
  DELETE FROM edges WHERE
    (from_graph = 'tasks' AND from_id = old.id AND project_id = old.project_id) OR
    (to_graph = 'tasks' AND to_id = old.id AND project_id = old.project_id);
  DELETE FROM attachments WHERE graph = 'tasks' AND entity_id = old.id AND project_id = old.project_id;
  DELETE FROM tasks_vec WHERE rowid = old.id;
END;

-- =============================================
-- Epics
-- =============================================

CREATE TABLE epics (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'open',
  priority      TEXT NOT NULL DEFAULT 'medium',
  "order"       REAL NOT NULL DEFAULT 0,
  version       INTEGER NOT NULL DEFAULT 1,
  created_by_id INTEGER,
  updated_by_id INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch('now','subsec') * 1000),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch('now','subsec') * 1000),
  UNIQUE(project_id, slug)
);
CREATE INDEX idx_epics_project ON epics(project_id);

CREATE VIRTUAL TABLE epics_fts USING fts5(
  title, description, content=epics, content_rowid=id
);
CREATE TRIGGER epics_ai AFTER INSERT ON epics BEGIN
  INSERT INTO epics_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
END;
CREATE TRIGGER epics_ad AFTER DELETE ON epics BEGIN
  INSERT INTO epics_fts(epics_fts, rowid, title, description) VALUES ('delete', old.id, old.title, old.description);
END;
CREATE TRIGGER epics_au AFTER UPDATE ON epics BEGIN
  INSERT INTO epics_fts(epics_fts, rowid, title, description) VALUES ('delete', old.id, old.title, old.description);
  INSERT INTO epics_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
END;

CREATE VIRTUAL TABLE epics_vec USING vec0(embedding float[${EMBEDDING_DIM}]);

CREATE TRIGGER epics_cleanup AFTER DELETE ON epics BEGIN
  DELETE FROM edges WHERE
    (from_graph = 'epics' AND from_id = old.id AND project_id = old.project_id) OR
    (to_graph = 'epics' AND to_id = old.id AND project_id = old.project_id);
  DELETE FROM attachments WHERE graph = 'epics' AND entity_id = old.id AND project_id = old.project_id;
  DELETE FROM epics_vec WHERE rowid = old.id;
END;

-- =============================================
-- Skills
-- =============================================

CREATE TABLE skills (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id         INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug               TEXT NOT NULL,
  title              TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  steps_json         TEXT NOT NULL DEFAULT '[]',
  triggers_json      TEXT NOT NULL DEFAULT '[]',
  input_hints_json   TEXT NOT NULL DEFAULT '[]',
  file_patterns_json TEXT NOT NULL DEFAULT '[]',
  source             TEXT NOT NULL DEFAULT 'user',
  confidence         REAL NOT NULL DEFAULT 1.0,
  usage_count        INTEGER NOT NULL DEFAULT 0,
  last_used_at       INTEGER,
  version            INTEGER NOT NULL DEFAULT 1,
  created_by_id      INTEGER,
  updated_by_id      INTEGER,
  created_at         INTEGER NOT NULL DEFAULT (unixepoch('now','subsec') * 1000),
  updated_at         INTEGER NOT NULL DEFAULT (unixepoch('now','subsec') * 1000),
  UNIQUE(project_id, slug)
);
CREATE INDEX idx_skills_project ON skills(project_id);

CREATE VIRTUAL TABLE skills_fts USING fts5(
  title, description, content=skills, content_rowid=id
);
CREATE TRIGGER skills_ai AFTER INSERT ON skills BEGIN
  INSERT INTO skills_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
END;
CREATE TRIGGER skills_ad AFTER DELETE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, title, description) VALUES ('delete', old.id, old.title, old.description);
END;
CREATE TRIGGER skills_au AFTER UPDATE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, title, description) VALUES ('delete', old.id, old.title, old.description);
  INSERT INTO skills_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
END;

CREATE VIRTUAL TABLE skills_vec USING vec0(embedding float[${EMBEDDING_DIM}]);

CREATE TRIGGER skills_cleanup AFTER DELETE ON skills BEGIN
  DELETE FROM edges WHERE
    (from_graph = 'skills' AND from_id = old.id AND project_id = old.project_id) OR
    (to_graph = 'skills' AND to_id = old.id AND project_id = old.project_id);
  DELETE FROM attachments WHERE graph = 'skills' AND entity_id = old.id AND project_id = old.project_id;
  DELETE FROM skills_vec WHERE rowid = old.id;
END;

-- =============================================
-- Code (one table — file nodes + symbol nodes, linked via edges)
-- =============================================

CREATE TABLE code (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  file_id       TEXT NOT NULL,
  language      TEXT NOT NULL DEFAULT '',
  name          TEXT NOT NULL,
  signature     TEXT NOT NULL DEFAULT '',
  doc_comment   TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  start_line    INTEGER NOT NULL DEFAULT 0,
  end_line      INTEGER NOT NULL DEFAULT 0,
  is_exported   INTEGER NOT NULL DEFAULT 0,
  mtime         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_code_project ON code(project_id);
CREATE INDEX idx_code_file ON code(project_id, file_id);
CREATE INDEX idx_code_name ON code(name);
CREATE INDEX idx_code_kind ON code(project_id, kind);

CREATE VIRTUAL TABLE code_fts USING fts5(
  name, signature, doc_comment, content=code, content_rowid=id
);
CREATE TRIGGER code_ai AFTER INSERT ON code BEGIN
  INSERT INTO code_fts(rowid, name, signature, doc_comment)
    VALUES (new.id, new.name, new.signature, new.doc_comment);
END;
CREATE TRIGGER code_ad AFTER DELETE ON code BEGIN
  INSERT INTO code_fts(code_fts, rowid, name, signature, doc_comment)
    VALUES ('delete', old.id, old.name, old.signature, old.doc_comment);
END;
CREATE TRIGGER code_au AFTER UPDATE ON code BEGIN
  INSERT INTO code_fts(code_fts, rowid, name, signature, doc_comment)
    VALUES ('delete', old.id, old.name, old.signature, old.doc_comment);
  INSERT INTO code_fts(rowid, name, signature, doc_comment)
    VALUES (new.id, new.name, new.signature, new.doc_comment);
END;

CREATE VIRTUAL TABLE code_vec USING vec0(embedding float[${EMBEDDING_DIM}]);

CREATE TRIGGER code_cleanup AFTER DELETE ON code BEGIN
  DELETE FROM edges WHERE
    (from_graph = 'code' AND from_id = old.id AND project_id = old.project_id) OR
    (to_graph = 'code' AND to_id = old.id AND project_id = old.project_id);
  DELETE FROM code_vec WHERE rowid = old.id;
END;

-- =============================================
-- Docs (one table — file nodes + chunk nodes, linked via edges)
-- =============================================

CREATE TABLE docs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'chunk',
  file_id       TEXT NOT NULL,
  title         TEXT NOT NULL DEFAULT '',
  content       TEXT NOT NULL DEFAULT '',
  level         INTEGER NOT NULL DEFAULT 0,
  language      TEXT,
  symbols_json  TEXT NOT NULL DEFAULT '[]',
  mtime         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_docs_project ON docs(project_id);
CREATE INDEX idx_docs_file ON docs(project_id, file_id);
CREATE INDEX idx_docs_kind ON docs(project_id, kind);

CREATE VIRTUAL TABLE docs_fts USING fts5(
  title, content, content=docs, content_rowid=id
);
CREATE TRIGGER docs_ai AFTER INSERT ON docs BEGIN
  INSERT INTO docs_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
END;
CREATE TRIGGER docs_ad AFTER DELETE ON docs BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
END;
CREATE TRIGGER docs_au AFTER UPDATE ON docs BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
  INSERT INTO docs_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
END;

CREATE VIRTUAL TABLE docs_vec USING vec0(embedding float[${EMBEDDING_DIM}]);

CREATE TRIGGER docs_cleanup AFTER DELETE ON docs BEGIN
  DELETE FROM edges WHERE
    (from_graph = 'docs' AND from_id = old.id AND project_id = old.project_id) OR
    (to_graph = 'docs' AND to_id = old.id AND project_id = old.project_id);
  DELETE FROM docs_vec WHERE rowid = old.id;
END;

-- =============================================
-- Files (one table — file nodes + directory nodes, linked via edges)
-- =============================================

CREATE TABLE files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'file',
  file_path   TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  directory   TEXT NOT NULL,
  extension   TEXT NOT NULL DEFAULT '',
  language    TEXT,
  mime_type   TEXT,
  size        INTEGER NOT NULL DEFAULT 0,
  file_count  INTEGER NOT NULL DEFAULT 0,
  mtime       INTEGER NOT NULL DEFAULT 0,
  UNIQUE(project_id, file_path)
);
CREATE INDEX idx_files_project ON files(project_id);
CREATE INDEX idx_files_dir ON files(project_id, directory);
CREATE INDEX idx_files_kind ON files(project_id, kind);

CREATE VIRTUAL TABLE files_vec USING vec0(embedding float[${EMBEDDING_DIM}]);

CREATE TRIGGER files_cleanup AFTER DELETE ON files BEGIN
  DELETE FROM edges WHERE
    (from_graph = 'files' AND from_id = old.id AND project_id = old.project_id) OR
    (to_graph = 'files' AND to_id = old.id AND project_id = old.project_id);
  DELETE FROM files_vec WHERE rowid = old.id;
END;

-- Tags cleanup: when a tag is deleted, remove its edges
CREATE TRIGGER tags_cleanup AFTER DELETE ON tags BEGIN
  DELETE FROM edges WHERE
    (from_graph = 'tags' AND from_id = old.id AND project_id = old.project_id) OR
    (to_graph = 'tags' AND to_id = old.id AND project_id = old.project_id);
END;
`,
};
