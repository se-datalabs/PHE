#!/bin/bash
# ==============================================================================
# PHE RCCE Dashboard - One-Click Excel Sync Runner
# Double-click this file in Finder anytime you save new data in
# Public_Health_Emergencies.xlsx to automatically update the dashboard!
# ==============================================================================

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "======================================================="
echo " PHE RCCE Dashboard: Syncing with Excel..."
echo " Directory: $DIR"
echo "======================================================="
echo ""

if command -v python3 &>/dev/null; then
    python3 update_dashboard.py
else
    echo "Error: python3 is not found on your system."
fi

echo ""
echo "Press any key to close this window..."
read -n 1
