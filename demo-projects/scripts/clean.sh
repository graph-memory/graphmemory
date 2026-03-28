#!/usr/bin/env bash
# =============================================================================
# ShopFlow Demo — Clean Script
# Removes all persisted graphs, workspace data, and mirror files.
# Run this to reset demo-projects to a clean state (code + docs only).
#
# Usage: ./scripts/clean.sh
# =============================================================================

set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Cleaning demo-projects data..."

# Workspace shared graphs + mirror files
rm -rf "$DIR/.workspace-backend"
rm -rf "$DIR/.workspace-frontend"

# Per-project persisted graphs + mirror files
for proj in api-gateway catalog-service order-service web-store admin-panel infra; do
  rm -rf "$DIR/$proj/.graph-memory"
  rm -rf "$DIR/$proj/.notes"
  rm -rf "$DIR/$proj/.tasks"
  rm -rf "$DIR/$proj/.skills"
  rm -rf "$DIR/$proj/.team"
  rm -rf "$DIR/$proj/.epics"
done

echo "Done. All graphs, mirror files, team, epics, and workspace data removed."
