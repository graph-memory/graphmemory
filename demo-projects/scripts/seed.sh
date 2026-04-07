#!/usr/bin/env bash
# =============================================================================
# ShopFlow Demo — Seed Script
# Reads entity JSON files from data/ directory and POSTs them to the API.
# Creates 62 notes, 68 tasks, 31 skills, 6 epics, 9 team members,
# 100+ relations/links, sample attachments and skill usage history.
#
# Usage: ./scripts/seed.sh [BASE_URL] [API_KEY]
# Default BASE_URL: http://localhost:3000
# =============================================================================

set -euo pipefail

BASE="${1:-http://localhost:3000}"
API_KEY="${2:-mgm-qXux_Vmb2YubgZgTvvAWervmH_Z6cKS_}"
DIR="$(cd "$(dirname "$0")" && pwd)"
DATA="$DIR/data"
PROJECT_DIR="$(cd "$DIR/.." && pwd)"

AUTH_HEADER="Authorization: Bearer $API_KEY"
ALL_PROJECTS="api-gateway catalog-service order-service web-store admin-panel infra"

# Workspace → entry project mapping
ws_entry() {
  case "$1" in
    backend)  echo "api-gateway" ;;
    frontend) echo "web-store" ;;
    infra)    echo "infra" ;;
  esac
}

# ── ID storage (file-based for bash 3 compat) ──────────────────────────────
ID_FILE=$(mktemp)
trap 'rm -f "$ID_FILE"' EXIT

store_id() { echo "$1=$2" >> "$ID_FILE"; }
id() { grep "^$1=" "$ID_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || echo "$1"; }

# ── HTTP helpers ────────────────────────────────────────────────────────────
api_post() {
  local path="$1" data="$2"
  local resp status body
  resp=$(curl -s -w '\n%{http_code}' -X POST "$BASE$path" \
    -H 'Content-Type: application/json' -H "$AUTH_HEADER" -d "$data")
  status=$(echo "$resp" | tail -n1)
  body=$(echo "$resp" | sed '$d')
  if [ "$status" -ge 400 ] 2>/dev/null; then
    echo "  ERROR: POST $path → $status: $body" >&2
  fi
}

api_get() {
  curl -sf -H "$AUTH_HEADER" "$BASE$1"
}

api_post_get_id() {
  local path="$1" data="$2"
  curl -s -X POST "$BASE$path" \
    -H 'Content-Type: application/json' -H "$AUTH_HEADER" -d "$data" | jq -r '.id // empty'
}

api_delete() {
  curl -sf -X DELETE "$BASE$1" -H "$AUTH_HEADER" > /dev/null 2>&1 || true
}

api_list_ids() {
  curl -sf -H "$AUTH_HEADER" "$BASE$1?limit=500" | jq -r '.results[].id // empty' 2>/dev/null
}

# ── Cleanup ─────────────────────────────────────────────────────────────────
echo "=== ShopFlow Demo Seed ==="
echo "Base URL: $BASE"
echo ""
echo "Cleaning up existing data..."

for proj in $ALL_PROJECTS; do
  for entity in epics tasks knowledge/notes skills; do
    for eid in $(api_list_ids "/api/projects/$proj/$entity"); do
      api_delete "/api/projects/$proj/$entity/$eid"
    done
  done
done
rm -rf "$PROJECT_DIR/.workspace-backend/.team" "$PROJECT_DIR/.workspace-frontend/.team" "$PROJECT_DIR/infra/.team"

echo "Cleanup done."

# ── Team members ────────────────────────────────────────────────────────────
echo "Creating team members..."

team_dir() {
  case "$1" in
    backend)  echo "$PROJECT_DIR/.workspace-backend/.team" ;;
    frontend) echo "$PROJECT_DIR/.workspace-frontend/.team" ;;
    infra)    echo "$PROJECT_DIR/infra/.team" ;;
  esac
}

jq -c '.[]' "$DATA/team.json" | while IFS= read -r member; do
  d=$(echo "$member" | jq -r '.dir')
  mid=$(echo "$member" | jq -r '.id')
  name=$(echo "$member" | jq -r '.name')
  email=$(echo "$member" | jq -r '.email')
  role=$(echo "$member" | jq -r '.role')
  teamdir=$(team_dir "$d")
  mkdir -p "$teamdir"
  cat > "$teamdir/$mid.md" <<EOF
---
name: $name
email: $email
---

# $name

Role: $role
EOF
done

echo "Team members created: $(jq length "$DATA/team.json")"

# ── Sync team into team_members table per project, build slug→numeric id map
# GET /api/projects/$proj/team upserts the .team/ markdown into the DB and
# returns numeric ids that tasks.assigneeId will reference.
echo "Resolving team member IDs..."
TEAM_MAP=$(mktemp)
trap 'rm -f "$ID_FILE" "$TEAM_MAP"' EXIT
for proj in $ALL_PROJECTS; do
  api_get "/api/projects/$proj/team" 2>/dev/null \
    | jq -r --arg p "$proj" '.results[] | "\($p)::\(.slug)=\(.id)"' >> "$TEAM_MAP" 2>/dev/null || true
done

team_id() {
  # team_id <project> <slug>  → numeric id or empty
  grep "^$1::$2=" "$TEAM_MAP" 2>/dev/null | tail -1 | cut -d= -f2- || true
}

NOW_MS=$(($(date +%s) * 1000))
MS_PER_DAY=86400000

# ── Build path→id maps for indexed graphs (code, docs) ──────────────────────
# Cross-graph link API requires numeric toId; relations.json uses file paths,
# so we resolve them once per project at seed time.
echo "Building file id maps..."
NODE_MAP=$(mktemp)
trap 'rm -f "$ID_FILE" "$TEAM_MAP" "$NODE_MAP"' EXIT
for proj in $ALL_PROJECTS; do
  # code: deduplicate, take lowest id per fileId (the file row, not its symbol)
  api_get "/api/projects/$proj/code/files?limit=500" 2>/dev/null \
    | jq -r --arg p "$proj" '.results // [] | group_by(.fileId) | map(min_by(.id)) | .[] | "code::\($p)::\(.fileId)=\(.id)"' \
    >> "$NODE_MAP" 2>/dev/null || true
  api_get "/api/projects/$proj/docs/topics?limit=500" 2>/dev/null \
    | jq -r --arg p "$proj" '.results // [] | .[] | "docs::\($p)::\(.fileId)=\(.id)"' \
    >> "$NODE_MAP" 2>/dev/null || true
done

node_id() {
  # node_id <graph> <project> <fileId>
  grep "^$1::$2::$3=" "$NODE_MAP" 2>/dev/null | tail -1 | cut -d= -f2- || true
}

# ── Helper: load entities from directory ────────────────────────────────────
load_entities() {
  local entity_type="$1" api_path="$2" workspace="$3" dir="$4"
  local count=0
  local proj
  proj=$(ws_entry "$workspace")
  for f in "$dir"/*.json; do
    [ -f "$f" ] || continue
    local key body uid
    key=$(jq -r '.key' "$f")
    body=$(jq 'del(.key)' "$f")
    uid=$(api_post_get_id "/api/projects/$proj/$api_path" "$body")
    if [ -n "$uid" ]; then
      store_id "$key" "$uid"
      count=$((count + 1))
    else
      echo "  WARN: failed to create $entity_type from $f" >&2
    fi
  done
  echo "  $workspace $entity_type: $count"
}

# ── Notes ───────────────────────────────────────────────────────────────────
echo "Creating notes..."
load_entities "notes" "knowledge/notes" "backend"  "$DATA/notes/backend"
load_entities "notes" "knowledge/notes" "frontend" "$DATA/notes/frontend"
load_entities "notes" "knowledge/notes" "infra"    "$DATA/notes/infra"

# ── Tasks ───────────────────────────────────────────────────────────────────
# Tasks need extra transformation: assignee (slug) → assigneeId (numeric, per
# project), and dueDays (relative int) → dueDate (absolute ms timestamp).
load_tasks() {
  local workspace="$1" dir="$2"
  local proj
  proj=$(ws_entry "$workspace")
  local count=0
  for f in "$dir"/*.json; do
    [ -f "$f" ] || continue
    local key assignee_slug due_days assignee_id due_ms body uid
    key=$(jq -r '.key' "$f")
    assignee_slug=$(jq -r '.assignee // empty' "$f")
    due_days=$(jq -r '.dueDays // empty' "$f")
    assignee_id=""
    if [ -n "$assignee_slug" ]; then
      assignee_id=$(team_id "$proj" "$assignee_slug")
    fi
    due_ms=""
    if [ -n "$due_days" ]; then
      due_ms=$((NOW_MS + due_days * MS_PER_DAY))
    fi
    body=$(jq \
      --arg aid "$assignee_id" \
      --arg dms "$due_ms" \
      'del(.key, .assignee, .dueDays)
       | (if $aid != "" then . + {assigneeId: ($aid | tonumber)} else . end)
       | (if $dms != "" then . + {dueDate: ($dms | tonumber)} else . end)' \
      "$f")
    uid=$(api_post_get_id "/api/projects/$proj/tasks" "$body")
    if [ -n "$uid" ]; then
      store_id "$key" "$uid"
      count=$((count + 1))
    else
      echo "  WARN: failed to create task from $f" >&2
    fi
  done
  echo "  $workspace tasks: $count"
}

echo "Creating tasks..."
load_tasks "backend"  "$DATA/tasks/backend"
load_tasks "frontend" "$DATA/tasks/frontend"
load_tasks "infra"    "$DATA/tasks/infra"

# ── Epics ───────────────────────────────────────────────────────────────────
echo "Creating epics..."
load_entities "epics" "epics" "backend"  "$DATA/epics/backend"
load_entities "epics" "epics" "frontend" "$DATA/epics/frontend"
load_entities "epics" "epics" "infra"    "$DATA/epics/infra"

# ── Skills ──────────────────────────────────────────────────────────────────
echo "Creating skills..."
load_entities "skills" "skills" "backend"  "$DATA/skills/backend"
load_entities "skills" "skills" "frontend" "$DATA/skills/frontend"
load_entities "skills" "skills" "infra"    "$DATA/skills/infra"

# ── Relations (from relations.json) ─────────────────────────────────────────
REL="$DATA/relations.json"

# Epic-task links
echo "Linking tasks to epics..."
epic_link_count=0
for epic_key in $(jq -r '.epicTasks | keys[]' "$REL"); do
  epic_id=$(id "$epic_key")
  # Determine workspace from epic key prefix
  case "$epic_key" in
    e_payment|e_catalog|e_gateway) ws="backend" ;;
    e_checkout|e_admin) ws="frontend" ;;
    *) ws="infra" ;;
  esac
  proj=$(ws_entry "$ws")
  for task_key in $(jq -r --arg k "$epic_key" '.epicTasks[$k][]' "$REL"); do
    task_id=$(id "$task_key")
    api_post "/api/projects/$proj/epics/$epic_id/link" "{\"taskId\":$task_id}"
    epic_link_count=$((epic_link_count + 1))
  done
done
echo "Epic-task links: $epic_link_count"

# Note-to-note relations
echo "Creating note relations..."
note_rel_count=0
jq -c '.noteRelations[]' "$REL" | while IFS= read -r rel; do
  ws=$(echo "$rel" | jq -r '.workspace')
  proj="$(ws_entry "$ws")"
  from_id=$(id "$(echo "$rel" | jq -r '.from')")
  to_id=$(id "$(echo "$rel" | jq -r '.to')")
  kind=$(echo "$rel" | jq -r '.kind')
  api_post "/api/projects/$proj/knowledge/relations" \
    "{\"fromId\":$from_id,\"toId\":$to_id,\"kind\":\"$kind\",\"projectId\":\"$proj\"}"
done
echo "Note relations: $(jq '.noteRelations | length' "$REL")"

# Cross-graph link helper that resolves the target file path → numeric id
# via the pre-built NODE_MAP. Skips silently if the path is not indexed.
post_indexed_link() {
  local ws="$1" entity_path="$2" from_key="$3" target_graph="$4" path="$5" kind="$6" project="$7"
  local proj from_id to_id
  proj=$(ws_entry "$ws")
  from_id=$(id "$from_key")
  to_id=$(node_id "$target_graph" "$project" "$path")
  if [ -z "$to_id" ] || [ -z "$from_id" ]; then
    echo "  SKIP cross-link $from_key → $target_graph::$path (unresolved)" >&2
    return 0
  fi
  api_post "/api/projects/$proj/$entity_path" \
    "{\"fromId\":$from_id,\"toId\":$to_id,\"kind\":\"$kind\",\"targetGraph\":\"$target_graph\"}"
}

echo "Creating cross-graph links..."

# note→code
jq -c '.crossGraphLinks.noteToCode[]' "$REL" | while IFS= read -r link; do
  ws=$(echo "$link" | jq -r '.workspace')
  from=$(echo "$link" | jq -r '.from')
  to=$(echo "$link" | jq -r '.to')
  kind=$(echo "$link" | jq -r '.kind')
  project=$(echo "$link" | jq -r '.project')
  post_indexed_link "$ws" "knowledge/relations" "$from" "code" "$to" "$kind" "$project"
done

# note→docs
jq -c '.crossGraphLinks.noteToDocs[]' "$REL" | while IFS= read -r link; do
  ws=$(echo "$link" | jq -r '.workspace')
  from=$(echo "$link" | jq -r '.from')
  to=$(echo "$link" | jq -r '.to')
  kind=$(echo "$link" | jq -r '.kind')
  project=$(echo "$link" | jq -r '.project')
  post_indexed_link "$ws" "knowledge/relations" "$from" "docs" "$to" "$kind" "$project"
done

# task→code
jq -c '.crossGraphLinks.taskToCode[]' "$REL" | while IFS= read -r link; do
  ws=$(echo "$link" | jq -r '.workspace')
  from=$(echo "$link" | jq -r '.from')
  to=$(echo "$link" | jq -r '.to')
  kind=$(echo "$link" | jq -r '.kind')
  project=$(echo "$link" | jq -r '.project')
  post_indexed_link "$ws" "tasks/links" "$from" "code" "$to" "$kind" "$project"
done

# task→docs
jq -c '.crossGraphLinks.taskToDocs[]' "$REL" | while IFS= read -r link; do
  ws=$(echo "$link" | jq -r '.workspace')
  from=$(echo "$link" | jq -r '.from')
  to=$(echo "$link" | jq -r '.to')
  kind=$(echo "$link" | jq -r '.kind')
  project=$(echo "$link" | jq -r '.project')
  post_indexed_link "$ws" "tasks/links" "$from" "docs" "$to" "$kind" "$project"
done

# task→knowledge
jq -c '.crossGraphLinks.taskToKnowledge[]' "$REL" | while IFS= read -r link; do
  ws=$(echo "$link" | jq -r '.workspace')
  from=$(echo "$link" | jq -r '.from')
  to=$(echo "$link" | jq -r '.to')
  kind=$(echo "$link" | jq -r '.kind')
  from_id=$(id "$from")
  to_id=$(id "$to")
  proj="$(ws_entry "$ws")"
  api_post "/api/projects/$proj/tasks/links" \
    "{\"fromId\":$from_id,\"toId\":$to_id,\"kind\":\"$kind\",\"targetGraph\":\"knowledge\"}"
done

# skill→code
jq -c '.crossGraphLinks.skillToCode[]' "$REL" | while IFS= read -r link; do
  ws=$(echo "$link" | jq -r '.workspace')
  from=$(echo "$link" | jq -r '.from')
  to=$(echo "$link" | jq -r '.to')
  kind=$(echo "$link" | jq -r '.kind')
  project=$(echo "$link" | jq -r '.project')
  post_indexed_link "$ws" "skills/links" "$from" "code" "$to" "$kind" "$project"
done

# skill→docs
jq -c '.crossGraphLinks.skillToDocs[]' "$REL" | while IFS= read -r link; do
  ws=$(echo "$link" | jq -r '.workspace')
  from=$(echo "$link" | jq -r '.from')
  to=$(echo "$link" | jq -r '.to')
  kind=$(echo "$link" | jq -r '.kind')
  project=$(echo "$link" | jq -r '.project')
  post_indexed_link "$ws" "skills/links" "$from" "docs" "$to" "$kind" "$project"
done

# skill→knowledge
jq -c '.crossGraphLinks.skillToKnowledge[]?' "$REL" | while IFS= read -r link; do
  ws=$(echo "$link" | jq -r '.workspace')
  from=$(echo "$link" | jq -r '.from')
  to=$(echo "$link" | jq -r '.to')
  from_id=$(id "$from")
  to_id=$(id "$to")
  proj="$(ws_entry "$ws")"
  api_post "/api/projects/$proj/skills/links" \
    "{\"fromId\":$from_id,\"toId\":$to_id,\"kind\":\"references\",\"targetGraph\":\"knowledge\"}"
done

# Task-to-task links
echo "Creating task links..."
jq -c '.taskLinks[]' "$REL" | while IFS= read -r link; do
  ws=$(echo "$link" | jq -r '.workspace')
  from=$(echo "$link" | jq -r '.from')
  to=$(echo "$link" | jq -r '.to')
  kind=$(echo "$link" | jq -r '.kind')
  from_id=$(id "$from")
  to_id=$(id "$to")
  proj="$(ws_entry "$ws")"
  api_post "/api/projects/$proj/tasks/links" "{\"fromId\":$from_id,\"toId\":$to_id,\"kind\":\"$kind\"}"
done
echo "Task links: $(jq '.taskLinks | length' "$REL")"

# Skill-to-skill links
echo "Creating skill links..."
jq -c '.skillLinks[]' "$REL" | while IFS= read -r link; do
  ws=$(echo "$link" | jq -r '.workspace')
  from=$(echo "$link" | jq -r '.from')
  to=$(echo "$link" | jq -r '.to')
  kind=$(echo "$link" | jq -r '.kind')
  from_id=$(id "$from")
  to_id=$(id "$to")
  proj="$(ws_entry "$ws")"
  api_post "/api/projects/$proj/skills/links" "{\"fromId\":$from_id,\"toId\":$to_id,\"kind\":\"$kind\"}"
done
echo "Skill links: $(jq '.skillLinks | length' "$REL")"

# ── Skill usage history ─────────────────────────────────────────────────────
# Bump a few skills to varied counts so the "most used" view has signal.
echo "Bumping skill usage..."
bump_skill() {
  local ws="$1" key="$2" times="$3"
  local proj sid
  proj=$(ws_entry "$ws")
  sid=$(id "$key")
  [ -z "$sid" ] && return 0
  for _ in $(seq 1 "$times"); do
    api_post "/api/projects/$proj/skills/$sid/bump" ''
  done
}
bump_skill backend  s_add_rest         8
bump_skill backend  s_handle_webhook   5
bump_skill backend  s_add_rate_limit   3
bump_skill backend  s_debug_auth       6
bump_skill backend  s_db_migration     2
bump_skill frontend s_react_component  9
bump_skill frontend s_custom_hook      4
bump_skill frontend s_debug_render     2
bump_skill infra    s_sev1             7
bump_skill infra    s_deploy_prod      4
bump_skill infra    s_restore_db       1

# ── Attachments ─────────────────────────────────────────────────────────────
# Attach sample artifacts to a few tasks to demonstrate attachment support.
echo "Adding sample attachments..."
ATT_DIR=$(mktemp -d)
trap 'rm -f "$ID_FILE" "$TEAM_MAP"; rm -rf "$ATT_DIR"' EXIT

cat > "$ATT_DIR/webhook-trace.log" <<'LOG'
2026-04-05T10:12:33Z stripe.webhook event=evt_1AbCd type=payment_intent.succeeded
2026-04-05T10:12:33Z stripe.webhook event=evt_1AbCd type=payment_intent.succeeded  ← duplicate!
2026-04-05T10:12:34Z order.confirm orderId=ord_42 status=paid
2026-04-05T10:12:34Z inventory.decrement sku=SKU-100 qty=1
2026-04-05T10:12:34Z inventory.decrement sku=SKU-100 qty=1  ← duplicate decrement
LOG

cat > "$ATT_DIR/checkout-mock.md" <<'MD'
# Checkout Page Mockup

Layout: 2-column on desktop, stacked on mobile.

- Left: order summary, line items, totals
- Right: address form, payment, place order CTA
- Sticky CTA on mobile
MD

cat > "$ATT_DIR/canary-runbook.md" <<'MD'
# Canary Runbook

1. Deploy canary stack with 10% traffic weight
2. Monitor error rate, p95 latency for 10 min
3. If healthy → promote to 100%
4. If degraded → rollback weight to 0% and page on-call
MD

attach() {
  local ws="$1" task_key="$2" file="$3"
  local proj tid
  proj=$(ws_entry "$ws")
  tid=$(id "$task_key")
  [ -z "$tid" ] && return 0
  curl -s -o /dev/null -X POST "$BASE/api/projects/$proj/tasks/$tid/attachments" \
    -H "$AUTH_HEADER" -F "file=@$file" || true
}

attach backend  t_fix_webhook "$ATT_DIR/webhook-trace.log"
attach frontend t_checkout    "$ATT_DIR/checkout-mock.md"
attach infra    t_canary      "$ATT_DIR/canary-runbook.md"

# ── Reorder demo ────────────────────────────────────────────────────────────
# Set explicit kanban ordering for a few columns. Reorder API is per-task:
# POST /tasks/:id/reorder {order, status?}.
echo "Reordering kanban columns..."
reorder_column() {
  local ws="$1" status="$2"
  shift 2
  local proj
  proj=$(ws_entry "$ws")
  local idx=0
  for k in "$@"; do
    local tid
    tid=$(id "$k")
    [ -z "$tid" ] && continue
    api_post "/api/projects/$proj/tasks/$tid/reorder" \
      "{\"order\":$idx,\"status\":\"$status\"}"
    idx=$((idx + 1))
  done
}
reorder_column backend  in_progress t_fix_webhook t_order_cancel t_redis_session t_db_pool
reorder_column backend  todo        t_audit_log t_promo_codes t_wishlist t_structured_logging
reorder_column frontend in_progress t_checkout t_admin_orders t_search_autocomplete
reorder_column infra    backlog     t_canary t_dr_runbook t_waf

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "=== Seed complete ==="
echo "Notes: $(find "$DATA/notes" -name '*.json' | wc -l | tr -d ' ')"
echo "Tasks: $(find "$DATA/tasks" -name '*.json' | wc -l | tr -d ' ')"
echo "Skills: $(find "$DATA/skills" -name '*.json' | wc -l | tr -d ' ')"
echo "Epics: $(find "$DATA/epics" -name '*.json' | wc -l | tr -d ' ')"
echo "Team: $(jq length "$DATA/team.json")"
echo "Relations: epic-task links + $(jq '.noteRelations | length' "$REL") note relations + $(jq '.taskLinks | length' "$REL") task links + $(jq '.skillLinks | length' "$REL") skill links + cross-graph"
echo "Extras: skill usage bumps, 3 task attachments, kanban reorder"
