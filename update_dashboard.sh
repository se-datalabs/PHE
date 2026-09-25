#!/usr/bin/env bash
# ==============================================================================
# Public Health Emergencies (PHE) - Dashboard Update Command
#
# Usage:
#   ./update_dashboard.sh
#   or
#   ./update_dashboard.sh "/path/to/Public_Health_Emergencies.xlsx"
# ==============================================================================

set -e

# Change directory to this script's directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================================"
echo "🔄 Updating PHE Analytics Dashboard..."
echo "============================================================"

# Run the python parser
if command -v python3 &>/dev/null; then
  python3 update_dashboard.py "$@"
else
  echo "❌ Error: python3 is not found in PATH."
  exit 1
fi
