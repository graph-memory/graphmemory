/**
 * Central named constants for all tunable values.
 * Import from here instead of hardcoding magic numbers.
 */

// ---------------------------------------------------------------------------
// Search — BM25, RRF, BFS
// ---------------------------------------------------------------------------

export const BM25_K1  = 1.2;
export const BM25_B   = 0.75;
export const BM25_IDF_OFFSET = 0.5;
export const RRF_K    = 60;

export const SEARCH_TOP_K       = 5;
export const SEARCH_BFS_DEPTH   = 1;
export const SEARCH_MAX_RESULTS = 5;
export const SEARCH_BFS_DECAY   = 0.8;

/** Edge-specific BFS decay for code graph — stronger edges propagate more score. */
export const CODE_EDGE_DECAY: Record<string, number> = {
  contains:   0.95,   // file→declaration, class→method — nearly the same entity
  extends:    0.85,   // class inheritance — strong semantic link
  implements: 0.85,   // interface implementation — strong semantic link
  imports:    0.70,   // cross-file import — weaker dependency
};
export const SEARCH_MIN_SCORE   = 0.5;
export const SEARCH_MIN_SCORE_CODE  = 0.3;
export const SEARCH_MIN_SCORE_FILES = 0.3;

export const FILE_SEARCH_TOP_K  = 10;

export const BM25_BODY_MAX_CHARS = 2000;

// ---------------------------------------------------------------------------
// Limits — sizes, counts, truncation
// ---------------------------------------------------------------------------

export const MAX_BODY_SIZE      = 10 * 1024 * 1024;  // 10 MB
export const MAX_UPLOAD_SIZE    = 50 * 1024 * 1024;   // 50 MB (multer)
export const SIGNATURE_MAX_LEN  = 300;

export const LIST_LIMIT_SMALL   = 10;
export const LIST_PAGE_SIZE     = 25;
export const LIST_PAGE_SIZE_TABLE = 50;

export const CONTENT_PREVIEW_LEN = 500;
export const INDEXER_PREVIEW_LEN = 200;

// ---------------------------------------------------------------------------
// Validation — REST API schema limits
// ---------------------------------------------------------------------------

export const MAX_TITLE_LEN          = 500;
export const MAX_NOTE_CONTENT_LEN   = 1_000_000;
export const MAX_TAG_LEN            = 100;
export const MAX_TAGS_COUNT         = 100;
export const MAX_SEARCH_QUERY_LEN   = 10_000;
export const MAX_SEARCH_TOP_K       = 500;
export const MAX_DESCRIPTION_LEN    = 500_000;
export const MAX_ASSIGNEE_LEN       = 100;
export const MAX_SKILL_STEP_LEN     = 10_000;
export const MAX_SKILL_STEPS_COUNT  = 100;
export const MAX_SKILL_TRIGGER_LEN  = 500;
export const MAX_SKILL_TRIGGERS_COUNT = 50;
export const MAX_TARGET_NODE_ID_LEN = 500;
export const MAX_LINK_KIND_LEN      = 100;
export const MAX_PROJECT_ID_LEN     = 200;
export const MAX_ATTACHMENT_FILENAME_LEN = 255;
export const MIN_PASSWORD_LEN       = 8;
export const MAX_PASSWORD_LEN       = 256;

// ---------------------------------------------------------------------------
// Timing — intervals, retries, timeouts
// ---------------------------------------------------------------------------

export const AUTO_SAVE_INTERVAL_MS      = 30_000;
export const WS_DEBOUNCE_MS             = 1000;
export const REMOTE_MAX_RETRIES         = 3;
export const REMOTE_BASE_DELAY_MS       = 200;
export const RATE_LIMIT_WINDOW_MS       = 60_000;
export const SESSION_SWEEP_INTERVAL_MS  = 60_000;
export const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 15_000;
export const ERROR_BODY_LIMIT           = 500;

// ---------------------------------------------------------------------------
// Mirror
// ---------------------------------------------------------------------------

export const MIRROR_STALE_MS             = 10_000;
export const MIRROR_MAX_ENTRIES          = 10_000;
export const MIRROR_MTIME_TOLERANCE_MS   = 100;

// ---------------------------------------------------------------------------
// Embedder
// ---------------------------------------------------------------------------

export const DEFAULT_EMBEDDING_CACHE_SIZE = 10_000;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export const WIKI_MAX_DEPTH = 10;

// ---------------------------------------------------------------------------
// Graph data version — bump when changing what gets embedded, stored format,
// or any schema change that requires re-indexing
// ---------------------------------------------------------------------------

export const GRAPH_DATA_VERSION = 2;  // v2: body in code embeddings, path normalization, hybrid file search
