#!/usr/bin/env python3
"""
PHE RCCE Dashboard - Excel Synchronization Engine
-------------------------------------------------
Automatically reads Public_Health_Emergencies.xlsx, parses all records across all 10 tools,
updates index.html with the latest embedded dataset, and creates exports for GitHub.

Usage:
  python3 update_dashboard.py          # Run once to sync Excel data to Dashboard
  python3 update_dashboard.py --watch  # Keep running and auto-sync whenever Excel is modified
"""

import os
import sys
import time
import json
import re
import shutil
from datetime import datetime, date

try:
    import openpyxl
except ImportError:
    print("Error: openpyxl is required. Run: pip install openpyxl")
    sys.exit(1)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EXCEL_FILENAME = 'Public_Health_Emergencies.xlsx'
EXCEL_PATH = os.path.join(BASE_DIR, EXCEL_FILENAME)

TARGET_DIRS = [
    os.path.join(BASE_DIR, 'Dashboard'),
    os.path.join(BASE_DIR, 'PHE Dashboard'),
    BASE_DIR
]

PARISH_COORDINATES = {
    'Kiswa': [0.3255, 32.6175],
    'Nansana': [0.3670, 32.5280],
    'Nansana west': [0.3685, 32.5210],
    'Nansana west ward': [0.3685, 32.5210],
    'Nansana east': [0.3650, 32.5350],
    'Nansana east ward': [0.3650, 32.5350],
    'Nabweru east': [0.3640, 32.5510],
    'Mbuya2': [0.3300, 32.6280],
    'Salaama': [0.2780, 32.5920],
    'Kibuye': [0.2980, 32.5730],
    'Kikaayq': [0.3650, 32.5990],
    'Kikaaya': [0.3650, 32.5990],
    'Makerere University': [0.3340, 32.5680],
    'Makerere III': [0.3380, 32.5650],
    'Kyebando': [0.3550, 32.5850],
    'Bwaise I': [0.3520, 32.5610],
    'Bwaise III': [0.3580, 32.5640],
    'Nakasero': [0.3200, 32.5780],
    'Luzira': [0.3010, 32.6450],
    'Nankulabye': [0.3240, 32.5560],
    'Lubya': [0.3290, 32.5440],
    'Seeta Ward': [0.3600, 32.7050],
    'Seeta': [0.3600, 32.7050],
    'Kkona': [0.3850, 32.5150],
    'Kawempe II': [0.3700, 32.5600],
    'Nateete': [0.2980, 32.5320],
    'Old Kampala': [0.3140, 32.5690],
    'Kamwokya': [0.3390, 32.5870],
    'Bukasa parish': [0.3050, 32.6150],
    'Bukasa': [0.3050, 32.6150],
    'Bukasa , Yoka': [0.3040, 32.6120],
    'Namwongo B, Bukasa': [0.3060, 32.6100],
    'Kisenyi': [0.3090, 32.5700],
    'Kisenyi 2': [0.3080, 32.5720],
    'Kisenyi 3': [0.3100, 32.5710],
    'Mutungo': [0.3230, 32.6410],
    'Mugungo': [0.3230, 32.6410],
    'Nsambya central': [0.2990, 32.5850],
    'East': [0.3600, 32.5350],
    'Ocheng': [0.3620, 32.5300],
    'Nakawa': [0.3320, 32.6190],
    'Central': [0.3150, 32.5780],
    'Kawempe': [0.3600, 32.5650],
    'Makindye': [0.2900, 32.5850],
    'Rubaga': [0.3050, 32.5450],
    'Wakiso': [0.3800, 32.5100],
    'Mukono': [0.3600, 32.7000]
}

def parse_num(val):
    if val is None or val == '':
        return 0
    try:
        return float(str(val).replace(',', '').strip())
    except Exception:
        return 0

def format_date(val):
    if isinstance(val, (datetime, date)):
        return val.strftime('%Y-%m-%d')
    if val:
        s = str(val).strip()
        if len(s) >= 10:
            return s[:10]
    return ''

def parse_excel_records(excel_path):
    wb = openpyxl.load_workbook(excel_path, data_only=True)
    target_sheet = None
    for name in wb.sheetnames:
        if 'public health' in name.lower() or 'emergenc' in name.lower():
            target_sheet = wb[name]
            break
    if not target_sheet:
        target_sheet = wb.active

    rows = list(target_sheet.iter_rows(values_only=True))
    if not rows:
        return []

    headers = [str(h).strip() if h is not None else '' for h in rows[0]]

    def get_col(row, *aliases):
        for a in aliases:
            a_clean = a.strip().lower()
            for idx, h in enumerate(headers):
                if h.strip().lower() == a_clean:
                    val = row[idx]
                    return '' if val is None else val
        return ''

    records = []
    for idx, r in enumerate(rows[1:]):
        if not any(x is not None for x in r):
            continue
        tool_raw = str(get_col(r, 'Public Health Emergencies', 'Public Health Emergencies ')).strip().lower()
        d_str = format_date(get_col(r, 'Date'))
        row_id = get_col(r, '_id') or (idx + 1)
        dist = get_col(r, 'District') or 'Central'
        parish = get_col(r, 'Parish') or ''
        coord = get_col(r, 'specify', 'Cordinator', 'Coordinator')

        if '3-visit' in tool_raw or 'wheel session' in tool_raw or ('school' in tool_raw and not 'preparedness' in tool_raw):
            s_name = get_col(r, 'School Name', 'Name of the school')
            if s_name:
                boys = parse_num(get_col(r, 'Number of boys sensitised'))
                girls = parse_num(get_col(r, 'Number of girls sensitised'))
                enrol = parse_num(get_col(r, 'Total School enrolment Population', 'Total School Enrollment Population'))
                if (boys + girls) > enrol and enrol == 0:
                    enrol = boys + girls
                records.append({
                    'id': row_id,
                    'date': d_str,
                    'tool': 'School Activity',
                    'district': dist,
                    'parish': parish,
                    'coordinator': coord,
                    'school': s_name,
                    'visit_num': get_col(r, 'Visit Number') or 'Visit 1',
                    'health_club': get_col(r, 'Presence of school health club', 'Presence of health club', 'School Health Club Status') or 'Active',
                    'boys': int(boys),
                    'girls': int(girls),
                    'enrolment': int(enrol),
                    'teachers': int(parse_num(get_col(r, 'Number of Teachers/Patrons Present'))),
                    'games': int(parse_num(get_col(r, 'Snakes & Ladders Board Games distributed'))),
                    'signs': get_col(r, 'Raise your hand if you can name 3 warning signs of PHE'),
                    'hotline': get_col(r, 'Raise your hand if you know the toll-free hotline or where to report'),
                    'stigma': get_col(r, 'Raise your hand if you believe a sick person should be cared for safely without being chased or hidden'),
                    'handwash_demo': get_col(r, 'Did the volunteer demonstrate correct handwashing steps'),
                    'soap': get_col(r, 'Soap and running water available at venue today'),
                    'rumor': get_col(r, 'Top misconception heard today', 'specify3', 'Local barrier identified', 'Rumor, misinformation or question flagged'),
                    'barrier': get_col(r, 'Local barrier identified'),
                    'source': get_col(r, 'source of the rumor') or 'Community'
                })
        elif 'gatekeeper' in tool_raw or 'community gate' in tool_raw:
            male_gk = parse_num(get_col(r, 'Male Gatekeepers Oriented'))
            fem_gk = parse_num(get_col(r, 'Female Gatekeepers Oriented'))
            records.append({
                'id': row_id,
                'date': d_str,
                'tool': 'Gatekeeper Session',
                'district': dist,
                'parish': parish,
                'coordinator': coord,
                'school': f'Gatekeeper Session ({get_col(r, "Type of gatekeeper") or "Community"})',
                'role': get_col(r, 'Type of gatekeeper') or 'Teacher / Patron',
                'commitments': get_col(r, 'what commitments did the gatekeeper make'),
                'male': int(male_gk),
                'female': int(fem_gk),
                'boys': 0, 'girls': 0, 'enrolment': 0,
                'teachers': int(male_gk + fem_gk),
                'games': 0
            })
        elif 'transect' in tool_raw or 'walk' in tool_raw or 'environmental' in tool_raw:
            stations = parse_num(get_col(r, 'Record number of functional stations', 'Record number of functional stations '))
            pop = parse_num(get_col(r, 'Population count of the site'))
            ratio = f'{(pop/stations):.1f}:1 ({int(pop)} : {int(stations)})' if stations > 0 else f'Critical Gap: {int(pop)} Persons with 0 Stations'
            records.append({
                'id': row_id,
                'date': d_str,
                'tool': 'Transect Walk',
                'district': dist,
                'parish': parish,
                'auditor': coord or 'Lead Auditor',
                'site': f'{dist} / {parish}',
                'setting': get_col(r, 'Setting type', 'specify3') or 'School',
                'stations': int(stations),
                'pop': int(pop),
                'stance_ratio': ratio,
                'notes': get_col(r, 'Observation notes', 'Check vector breeding sites and safety near food points.') or 'No notes',
                'refuse': get_col(r, 'Open refuse heaps, stagnant water, overflowing drainage channels near classrooms, food stalls, or passenger bays.') or 'Maintained',
                'wash': get_col(r, 'Functional handwashing points at gates, latrines, and dining/canteen areas with soap and running water.') or 'Present',
                'poster': get_col(r, 'Presence, legibility, and currency of MoH/KCCA posters on Ebola, Mpox, and Marburg with active toll-free lines.') or 'Observed',
                'holding': get_col(r, 'Designated space, ventilation, clean bedding, and written separation protocol for suspected symptomatic cases.') or 'Makeshift Only',
                'staff': get_col(r, 'Verify school nurse/matron or market head orientation.', 'Verify if school nurse/matron or market head has ever received orientation on epidemics.') or 'Not oriented',
                'boys': 0, 'girls': 0, 'enrolment': 0, 'teachers': 0, 'games': 0
            })
        elif 'preparedness' in tool_raw or 'pat' in tool_raw or 'tool 11' in tool_raw:
            s_name = get_col(r, 'Name of the school', 'School Name') or 'Assessed Facility'
            records.append({
                'id': row_id,
                'date': d_str,
                'tool': 'PAT Assessment',
                'district': dist,
                'parish': parish,
                'name': s_name,
                'level': get_col(r, 'School level') or 'Primary',
                'boys': int(parse_num(get_col(r, 'total enrolment for boys'))),
                'girls': int(parse_num(get_col(r, 'Totla enrolement for girls', 'Total enrolment for girls'))),
                'maleStaff': int(parse_num(get_col(r, 'Total male teaching staff'))),
                'femaleStaff': int(parse_num(get_col(r, 'Total female teaching staff'))),
                'club': get_col(r, 'Presence of health club', 'School Health Club Status') or 'Active',
                'plan': get_col(r, 'Does the school have a Epidemic Preparedness Plan') or 'Informal Only',
                'space': get_col(r, 'Does the school have a Designated Isolation place incase of an epidemic') or 'Makeshift corner',
                'stations': int(parse_num(get_col(r, 'Record number of working water stations', 'Record number of working water stations '))),
                'bStances': int(parse_num(get_col(r, 'Record number of stances for boys', 'Record number of stances for boys '))),
                'gStances': int(parse_num(get_col(r, 'record number of stances for girls', 'record number of stances for girls'))),
                'poster': get_col(r, 'Record presence of Posters or guidelines on Ebola, Mpox, or Cholera displayed in prominent pupil areas.') or 'IEC Present',
                'washAudit': get_col(r, 'Q1 Stations present at gates, outside latrines, and near dining/canteen areas with both clean running water AND soap.') or 'Water + Soap Present',
                'stanceAudit': get_col(r, 'Record toilet stances separated by gender, functional locks, clean floors, and handwash stations within 5 meters of exits.') or 'Adequate',
                'wasteAudit': get_col(r, 'Enclosed bins, absence of overflowing compost/litter pits or open medical/menstrual waste.') or 'Maintained',
                'drainageAudit': get_col(r, 'Record drainage conditions around the waste collection area') or 'Flowing',
                'hotlineLegible': get_col(r, 'Is the toll-free hotline legible on the posters') or 'Yes',
                'enrolment': 0, 'teachers': 0, 'games': 0
            })

    return records

def build_updated_html(template_html, records):
    json_str = json.dumps(records, indent=2)
    embedded_block = f'const DEFAULT_EMBEDDED_DATA = {json_str};'

    updated = template_html

    # 1. Update parishCoordinates
    coords_json = json.dumps(PARISH_COORDINATES, indent=4)
    updated = re.sub(
        r'const parishCoordinates\s*=\s*\{.*?\};',
        f'const parishCoordinates = {coords_json};',
        updated,
        flags=re.DOTALL
    )

    # 2. Remove admin login controls from header and replace with direct Excel loader
    header_admin_pattern = r'<!-- PASSWORD PROTECTED UPLOAD BUTTON SECTION -->.*?<!-- AUTHENTICATION TOGGLE BUTTON -->.*?<\/button>'
    new_header_controls = '''<!-- DIRECT EXCEL LOADER & AUTO-SYNC -->
        <div style="display: inline-flex; align-items: center; gap: 8px;">
          <label for="fileInput" class="btn-action" style="background: var(--gatekeeper); border-color: var(--gatekeeper); cursor: pointer;" title="Load or reload Excel data">
            <span>Upload / Update Excel</span>
          </label>
          <input type="file" id="fileInput" accept=".xlsx, .xls">
          <button class="btn-action btn-outline" onclick="reloadDefaultExcel()" title="Reset to bundled Excel data">
            <span>Reset to Default</span>
          </button>
        </div>'''
    if re.search(header_admin_pattern, updated, flags=re.DOTALL):
        updated = re.sub(header_admin_pattern, new_header_controls, updated, flags=re.DOTALL)

    # 3. Handle DEFAULT_EMBEDDED_DATA replacement or insertion
    if 'const DEFAULT_EMBEDDED_DATA' in updated:
        updated = re.sub(
            r'const DEFAULT_EMBEDDED_DATA\s*=\s*\[.*?\];',
            embedded_block,
            updated,
            flags=re.DOTALL
        )
    else:
        # Insert right above reloadDefaultExcel or STORAGE_KEY
        if 'function reloadDefaultExcel' in updated:
            updated = updated.replace(
                'function reloadDefaultExcel',
                f'{embedded_block}\n\n    function reloadDefaultExcel'
            )
        elif 'const STORAGE_KEY' in updated:
            updated = updated.replace(
                'const STORAGE_KEY',
                f'{embedded_block}\n\n    function reloadDefaultExcel() {{\n      try {{\n        localStorage.removeItem("phe_dashboard_uploaded_data_v17");\n        localStorage.removeItem("phe_dashboard_uploaded_data_v16");\n      }} catch(e) {{}}\n      processRawWorkbookRows(DEFAULT_EMBEDDED_DATA, true);\n      populateFilterOptions();\n      applyFilters();\n      alert("Reset completed. Loaded " + DEFAULT_EMBEDDED_DATA.length + " records from connected Excel dataset.");\n    }}\n\n    const STORAGE_KEY'
            )

    # 4. Remove any residual SHA-256 and admin authentication code if still present
    if 'computeSha256' in updated:
        auth_funcs_pattern = r'// ================= SECURE STANDALONE SHA-256 HASHING =================.*?const STORAGE_KEY ='
        new_auth_replacement = f'''// ================= DIRECT EXCEL LOADER (NO PASSWORD REQUIRED) =================
    {embedded_block}

    function reloadDefaultExcel() {{
      try {{
        localStorage.removeItem('phe_dashboard_uploaded_data_v17');
        localStorage.removeItem('phe_dashboard_uploaded_data_v16');
      }} catch(e) {{}}
      processRawWorkbookRows(DEFAULT_EMBEDDED_DATA, true);
      populateFilterOptions();
      applyFilters();
      alert('Reset completed. Loaded ' + DEFAULT_EMBEDDED_DATA.length + ' records from connected Excel dataset.');
    }}

    const STORAGE_KEY ='''
        updated = re.sub(auth_funcs_pattern, new_auth_replacement, updated, flags=re.DOTALL)

    # 5. Clean up window bindings
    updated = updated.replace('window.toggleAdminLogin = toggleAdminLogin;', '')
    updated = updated.replace('window.checkAdminAuth = checkAdminAuth;', 'window.reloadDefaultExcel = reloadDefaultExcel;')
    updated = updated.replace('checkAdminAuth();', '')

    # 6. Update storage key to v17
    updated = updated.replace("'phe_dashboard_uploaded_data_v16'", "'phe_dashboard_uploaded_data_v17'")

    # 7. Add auto-fetch on DOMContentLoaded if served via HTTP/HTTPS (e.g. GitHub Pages)
    auto_fetch_code = '''
    // Try to auto-fetch Excel or JSON if hosted on GitHub Pages or local web server
    async function tryAutoFetchServerData() {
      if (window.location.protocol.startsWith('http')) {
        try {
          const resp = await fetch('Public_Health_Emergencies.xlsx');
          if (resp.ok) {
            const buf = await resp.arrayBuffer();
            const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
            let targetSheetName = wb.SheetNames.find(s => s.trim().toLowerCase().includes('public health') || s.trim().toLowerCase().includes('emergenc')) || wb.SheetNames[0];
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[targetSheetName], { defval: "" });
            if (rows && rows.length > 0) {
              processRawWorkbookRows(rows, true);
              populateFilterOptions();
              applyFilters();
              console.log('Auto-loaded live Excel from server:', rows.length, 'rows');
            }
          }
        } catch (e) {
          console.log('Local/fallback data in use.');
        }
      }
    }
'''
    if 'tryAutoFetchServerData' not in updated:
        updated = updated.replace('// Boot', auto_fetch_code + '\n    // Boot')
        updated = updated.replace('applyFilters();\n    });', 'applyFilters();\n      tryAutoFetchServerData();\n    });')

    return updated

def sync():
    if not os.path.exists(EXCEL_PATH):
        print(f"Error: Excel file not found at: {EXCEL_PATH}")
        return False

    print(f"Reading Excel from: {EXCEL_PATH}")
    records = parse_excel_records(EXCEL_PATH)
    print(f"Parsed {len(records)} records from Public_Health_Emergencies.xlsx.")

    # Find the base template index.html
    template_candidates = [
        os.path.join(BASE_DIR, 'PHE Dashboard', 'index.html'),
        os.path.join(BASE_DIR, 'Dashboard', 'index.html'),
        os.path.join(BASE_DIR, 'index.html')
    ]

    template_html = None
    for cand in template_candidates:
        if os.path.exists(cand) and os.path.getsize(cand) > 30000:
            with open(cand, 'r', encoding='utf-8') as f:
                template_html = f.read()
            print(f"Using template HTML from: {cand}")
            break

    if not template_html:
        print("Error: Could not find template index.html")
        return False

    updated_html = build_updated_html(template_html, records)

    # Write updated index.html, data.json, and copy Excel to all relevant targets
    for target_dir in [os.path.join(BASE_DIR, 'Dashboard'), os.path.join(BASE_DIR, 'PHE Dashboard')]:
        os.makedirs(target_dir, exist_ok=True)
        html_out = os.path.join(target_dir, 'index.html')
        with open(html_out, 'w', encoding='utf-8') as f:
            f.write(updated_html)
        print(f"  -> Updated: {html_out}")

        json_out = os.path.join(target_dir, 'data.json')
        with open(json_out, 'w', encoding='utf-8') as f:
            json.dump(records, f, indent=2)
        print(f"  -> Exported: {json_out}")

        excel_copy = os.path.join(target_dir, EXCEL_FILENAME)
        try:
            shutil.copy2(EXCEL_PATH, excel_copy)
            print(f"  -> Synced: {excel_copy}")
        except Exception:
            pass

    print("\n=======================================================")
    print(f"SUCCESS! Dashboard successfully synced with {len(records)} records.")
    print("Admin login removed. Direct Excel loader enabled.")
    print("You can now commit and push the updated files to GitHub!")
    print("=======================================================\n")
    return True

if __name__ == '__main__':
    if '--watch' in sys.argv:
        print(f"Watching {EXCEL_PATH} for changes... (Press Ctrl+C to stop)")
        last_mtime = 0
        if os.path.exists(EXCEL_PATH):
            last_mtime = os.path.getmtime(EXCEL_PATH)
            sync()
        while True:
            try:
                time.sleep(2)
                if os.path.exists(EXCEL_PATH):
                    mtime = os.path.getmtime(EXCEL_PATH)
                    if mtime != last_mtime:
                        print(f"[{datetime.now().strftime('%H:%M:%S')}] Detected Excel modification, syncing...")
                        last_mtime = mtime
                        sync()
            except KeyboardInterrupt:
                print("\nWatch stopped.")
                break
    else:
        sync()
