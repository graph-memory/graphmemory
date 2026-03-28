#!/usr/bin/env bash
# =============================================================================
# ShopFlow Demo — Seed Script
# Reads entity JSON files from data/ directory and POSTs them to the API.
# Creates 67 notes, 84 tasks, 31 skills, 6 epics, 9 team members,
# and 85+ relations/links.
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
  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE$path" \
    -H 'Content-Type: application/json' -H "$AUTH_HEADER" -d "$data")
  if [ "$status" -ge 500 ] 2>/dev/null; then
    echo "  ERROR: POST $path → $status" >&2
  fi
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
echo "Creating tasks..."
load_entities "tasks" "tasks" "backend"  "$DATA/tasks/backend"
load_entities "tasks" "tasks" "frontend" "$DATA/tasks/frontend"
load_entities "tasks" "tasks" "infra"    "$DATA/tasks/infra"

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
    api_post "/api/projects/$proj/epics/$epic_id/link" "{\"taskId\":\"$task_id\"}"
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
    "{\"fromId\":\"$from_id\",\"toId\":\"$to_id\",\"kind\":\"$kind\",\"projectId\":\"$proj\"}"
done
echo "Note relations: $(jq '.noteRelations | length' "$REL")"

# Cross-graph links helper
post_cross_link() {
  local ws="$1" entity_path="$2" from_key="$3" to_val="$4" kind="$5" target_graph="$6" project="$7"
  local proj="$(ws_entry "$ws")"
  local from_id
  from_id=$(id "$from_key")
  api_post "/api/projects/$proj/$entity_path" \
    "{\"fromId\":\"$from_id\",\"toId\":\"$to_val\",\"kind\":\"$kind\",\"targetGraph\":\"$target_graph\",\"projectId\":\"$project\"}"
}

echo "Creating cross-graph links..."

# note→code
jq -c '.crossGraphLinks.noteToCode[]' "$REL" | while IFS= read -r link; do
  ws=$(echo "$link" | jq -r '.workspace')
  from=$(echo "$link" | jq -r '.from')
  to=$(echo "$link" | jq -r '.to')
  kind=$(echo "$link" | jq -r '.kind')
  project=$(echo "$link" | jq -r '.project')
  post_cross_link "$ws" "knowledge/relations" "$from" "$to" "$kind" "code" "$project"
done

# note→docs
jq -c '.crossGraphLinks.noteToDocs[]' "$REL" | while IFS= read -r link; do
  ws=$(echo "$link" | jq -r '.workspace')
  from=$(echo "$link" | jq -r '.from')
  to=$(echo "$link" | jq -r '.to')
  kind=$(echo "$link" | jq -r '.kind')
  project=$(echo "$link" | jq -r '.project')
  post_cross_link "$ws" "knowledge/relations" "$from" "$to" "$kind" "docs" "$project"
done

# task→code
jq -c '.crossGraphLinks.taskToCode[]' "$REL" | while IFS= read -r link; do
  ws=$(echo "$link" | jq -r '.workspace')
  from=$(echo "$link" | jq -r '.from')
  to=$(echo "$link" | jq -r '.to')
  kind=$(echo "$link" | jq -r '.kind')
  project=$(echo "$link" | jq -r '.project')
  from_id=$(id "$from")
  proj="$(ws_entry "$ws")"
  api_post "/api/projects/$proj/tasks/links" \
    "{\"fromId\":\"$from_id\",\"toId\":\"$to\",\"kind\":\"$kind\",\"targetGraph\":\"code\",\"projectId\":\"$project\"}"
done

# task→docs
jq -c '.crossGraphLinks.taskToDocs[]' "$REL" | while IFS= read -r link; do
  ws=$(echo "$link" | jq -r '.workspace')
  from=$(echo "$link" | jq -r '.from')
  to=$(echo "$link" | jq -r '.to')
  kind=$(echo "$link" | jq -r '.kind')
  project=$(echo "$link" | jq -r '.project')
  from_id=$(id "$from")
  proj="$(ws_entry "$ws")"
  api_post "/api/projects/$proj/tasks/links" \
    "{\"fromId\":\"$from_id\",\"toId\":\"$to\",\"kind\":\"$kind\",\"targetGraph\":\"docs\",\"projectId\":\"$project\"}"
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
    "{\"fromId\":\"$from_id\",\"toId\":\"$to_id\",\"kind\":\"$kind\",\"targetGraph\":\"knowledge\"}"
done

# skill→code
jq -c '.crossGraphLinks.skillToCode[]' "$REL" | while IFS= read -r link; do
  ws=$(echo "$link" | jq -r '.workspace')
  from=$(echo "$link" | jq -r '.from')
  to=$(echo "$link" | jq -r '.to')
  kind=$(echo "$link" | jq -r '.kind')
  project=$(echo "$link" | jq -r '.project')
  from_id=$(id "$from")
  proj="$(ws_entry "$ws")"
  api_post "/api/projects/$proj/skills/links" \
    "{\"fromId\":\"$from_id\",\"toId\":\"$to\",\"kind\":\"$kind\",\"targetGraph\":\"code\",\"projectId\":\"$project\"}"
done

# skill→docs
jq -c '.crossGraphLinks.skillToDocs[]' "$REL" | while IFS= read -r link; do
  ws=$(echo "$link" | jq -r '.workspace')
  from=$(echo "$link" | jq -r '.from')
  to=$(echo "$link" | jq -r '.to')
  kind=$(echo "$link" | jq -r '.kind')
  project=$(echo "$link" | jq -r '.project')
  from_id=$(id "$from")
  proj="$(ws_entry "$ws")"
  api_post "/api/projects/$proj/skills/links" \
    "{\"fromId\":\"$from_id\",\"toId\":\"$to\",\"kind\":\"$kind\",\"targetGraph\":\"docs\",\"projectId\":\"$project\"}"
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
  api_post "/api/projects/$proj/tasks/links" "{\"fromId\":\"$from_id\",\"toId\":\"$to_id\",\"kind\":\"$kind\"}"
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
  api_post "/api/projects/$proj/skills/links" "{\"fromId\":\"$from_id\",\"toId\":\"$to_id\",\"kind\":\"$kind\"}"
done
echo "Skill links: $(jq '.skillLinks | length' "$REL")"

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "=== Seed complete ==="
echo "Notes: $(find "$DATA/notes" -name '*.json' | wc -l | tr -d ' ')"
echo "Tasks: $(find "$DATA/tasks" -name '*.json' | wc -l | tr -d ' ')"
echo "Skills: $(find "$DATA/skills" -name '*.json' | wc -l | tr -d ' ')"
echo "Epics: $(find "$DATA/epics" -name '*.json' | wc -l | tr -d ' ')"
echo "Team: $(jq length "$DATA/team.json")"
echo "Relations: epic-task links + $(jq '.noteRelations | length' "$REL") note relations + $(jq '.taskLinks | length' "$REL") task links + $(jq '.skillLinks | length' "$REL") skill links + cross-graph"
