#!/usr/bin/env python3
"""
Public Health Emergencies (PHE) - Dashboard Data Updater
Reads field data from the PHE Excel workbook and generates:
  - dashboard_data.json
  - data.js (for offline/direct browser support)
  - Syncs Public_Health_Emergencies.xlsx locally
"""

import os
import sys
import json
import shutil
import pandas as pd
from datetime import datetime

# Default paths to search for the raw Excel workbook
PARENT_PHE_DIR = "/Users/semakulaemmanuel/Library/CloudStorage/OneDrive-SharedLibraries-Solutions4People/Kenneth Mulondo - UNICEFMPOX/PHE"
LOCAL_DIR = os.path.dirname(os.path.abspath(__file__))

DEFAULT_CANDIDATE_PATHS = [
    os.path.join(PARENT_PHE_DIR, "Public_Health_Emergencies.xlsx"),
    os.path.join(LOCAL_DIR, "..", "Public_Health_Emergencies.xlsx"),
    os.path.join(LOCAL_DIR, "Public_Health_Emergencies.xlsx")
]

def find_excel_file(cli_arg=None):
    if cli_arg and os.path.exists(cli_arg):
        try:
            with open(cli_arg, 'rb'):
                pass
            return os.path.abspath(cli_arg)
        except Exception:
            pass
    
    for candidate in DEFAULT_CANDIDATE_PATHS:
        candidate_norm = os.path.normpath(candidate)
        if os.path.exists(candidate_norm):
            try:
                with open(candidate_norm, 'rb'):
                    pass
                return candidate_norm
            except Exception:
                continue
    
    # Try searching any .xlsx in PARENT_PHE_DIR
    try:
        if os.path.exists(PARENT_PHE_DIR):
            for fname in os.listdir(PARENT_PHE_DIR):
                if fname.lower().endswith(('.xlsx', '.xls')) and not fname.startswith('~$'):
                    cand = os.path.join(PARENT_PHE_DIR, fname)
                    try:
                        with open(cand, 'rb'):
                            return cand
                    except Exception:
                        pass
    except Exception:
        pass
                
    # Fallback to any local .xlsx
    for fname in os.listdir(LOCAL_DIR):
        if fname.lower().endswith(('.xlsx', '.xls')) and not fname.startswith('~$'):
            cand = os.path.join(LOCAL_DIR, fname)
            try:
                with open(cand, 'rb'):
                    return cand
            except Exception:
                pass
            
    return None

def normalize_date(val):
    if pd.isna(val) or val is None or val == '':
        return ''
    if isinstance(val, pd.Timestamp):
        return val.strftime('%Y-%m-%d')
    s = str(val).strip()
    return s[:10]

def parse_num(val):
    if val is None or pd.isna(val) or val == '':
        return 0
    try:
        clean = str(val).replace(',', '').strip()
        num = float(clean)
        return int(num) if num.is_integer() else num
    except:
        return 0

def get_col(row, *aliases):
    for alias in aliases:
        clean_alias = alias.strip().lower()
        for k in row.index:
            if str(k).strip().lower() == clean_alias:
                v = row[k]
                if pd.notna(v):
                    s = str(v).strip()
                    if s.lower() != 'nan':
                        return s
    return ''

def parse_workbook(excel_path):
    print(f"\n📂 Reading Excel workbook: {excel_path}")
    xl = pd.ExcelFile(excel_path)
    
    # Locate main Public Health Emergencies sheet
    target_sheet = None
    for s in xl.sheet_names:
        if 'emergenc' in s.lower() or 'public' in s.lower():
            target_sheet = s
            break
    if not target_sheet:
        target_sheet = xl.sheet_names[0]
        
    print(f"📄 Processing sheet: '{target_sheet}'")
    df = pd.read_excel(excel_path, sheet_name=target_sheet)
    print(f"📊 Total raw rows detected: {len(df)}")
    
    records = []
    tool_counts = {}

    for idx, row in df.iterrows():
        activity_type = str(row.get('Public Health Emergencies') or row.get('Public Health Emergencies ') or '').strip().lower()
        raw_date = row.get('Date')
        formatted_date = normalize_date(raw_date)
        row_id = parse_num(row.get('_id')) or (idx + 1)
        
        # Determine coordinator / lead
        coord_raw = str(row.get('Cordinator') or row.get('Coordinator') or '').strip()
        specify_raw = str(row.get('specify') or '').strip()
        if specify_raw and specify_raw.lower() != 'nan' and (coord_raw.lower() == 'other' or not coord_raw or coord_raw.lower() == 'nan'):
            coordinator = specify_raw
        else:
            coordinator = coord_raw if coord_raw.lower() != 'nan' else specify_raw

        # --- 1. School Activity (Tool 9) ---
        if ('3-visit' in activity_type or 'wheel session' in activity_type or 'school activity' in activity_type or 
            (not any(k in activity_type for k in ['transect', 'gatekeeper', 'preparedness']) and get_col(row, 'School Name'))):
            s_name = get_col(row, 'School Name', 'Name of the school')
            if s_name:
                boys = parse_num(get_col(row, 'Number of boys sensitised'))
                girls = parse_num(get_col(row, 'Number of girls sensitised'))
                enrolment = parse_num(get_col(row, 'Total School enrolment Population', 'Total School Enrollment Population'))
                if boys + girls > enrolment:
                    enrolment = boys + girls
                
                records.append({
                    'id': row_id,
                    'date': formatted_date,
                    'tool': 'School Activity',
                    'district': get_col(row, 'District') or 'Central',
                    'parish': get_col(row, 'Parish'),
                    'coordinator': coordinator,
                    'school': s_name,
                    'visit_num': get_col(row, 'Visit Number') or 'Visit 1',
                    'health_club': get_col(row, 'Presence of school health club', 'Presence of health club', 'School Health Club Status') or 'Active',
                    'boys': boys,
                    'girls': girls,
                    'enrolment': enrolment,
                    'teachers': parse_num(get_col(row, 'Number of Teachers/Patrons Present')),
                    'games': parse_num(get_col(row, 'Snakes & Ladders Board Games distributed')),
                    'signs': get_col(row, 'Raise your hand if you can name 3 warning signs of PHE'),
                    'hotline': get_col(row, 'Raise your hand if you know the toll-free hotline or where to report'),
                    'stigma': get_col(row, 'Raise your hand if you believe a sick person should be cared for safely without being chased or hidden'),
                    'handwash_demo': get_col(row, 'Did the volunteer demonstrate correct handwashing steps'),
                    'soap': get_col(row, 'Soap and running water available at venue today'),
                    'rumor': get_col(row, 'Rumor, misinformation or question flagged', 'Top misconception heard today', 'specify3', 'Local barrier identified'),
                    'barrier': get_col(row, 'Local barrier identified'),
                    'source': get_col(row, 'source of the rumor') or 'Community'
                })
                tool_counts['School Activity'] = tool_counts.get('School Activity', 0) + 1
                continue

        # --- 2. Gatekeeper Session (Tool 7) ---
        if 'gatekeeper' in activity_type or 'community gate' in activity_type or get_col(row, 'what commitments did the gatekeeper make'):
            male_gk = parse_num(get_col(row, 'Male Gatekeepers Oriented'))
            female_gk = parse_num(get_col(row, 'Female Gatekeepers Oriented'))
            role = get_col(row, 'Type of gatekeeper') or 'Teacher / Patron'
            records.append({
                'id': row_id,
                'date': formatted_date,
                'tool': 'Gatekeeper Session',
                'district': get_col(row, 'District') or 'Central',
                'parish': get_col(row, 'Parish'),
                'coordinator': coordinator,
                'school': f'Gatekeeper Session ({role})',
                'role': role,
                'commitments': get_col(row, 'what commitments did the gatekeeper make'),
                'male': male_gk,
                'female': female_gk,
                'boys': 0, 'girls': 0, 'enrolment': 0,
                'teachers': male_gk + female_gk,
                'games': 0
            })
            tool_counts['Gatekeeper Session'] = tool_counts.get('Gatekeeper Session', 0) + 1
            continue

        # --- 3. Transect Walk (Tool 1) ---
        if 'transect' in activity_type or 'walk' in activity_type or 'environmental' in activity_type:
            stations = parse_num(get_col(row, 'Record number of functional stations', 'Record number of functional stations '))
            pop = parse_num(get_col(row, 'Population count of the site'))
            stance_ratio = f'{(pop / stations):.1f}:1 ({pop} : {stations})' if stations > 0 else f'Critical Gap: {pop} Persons with 0 Stations'
            setting = get_col(row, 'Setting type', 'specify3') or 'School'
            district = get_col(row, 'District') or 'Central'
            parish = get_col(row, 'Parish')
            records.append({
                'id': row_id,
                'date': formatted_date,
                'tool': 'Transect Walk',
                'district': district,
                'parish': parish,
                'school': f'{district} - {parish} ({setting})',
                'auditor': coordinator or 'Lead Auditor',
                'site': f'{district} / {parish}',
                'setting': setting,
                'stations': stations,
                'pop': pop,
                'stance_ratio': stance_ratio,
                'notes': get_col(row, 'Observation notes', 'Check vector breeding sites and safety near food points.') or 'No notes',
                'refuse': get_col(row, 'Open refuse heaps, stagnant water, overflowing drainage channels near classrooms, food stalls, or passenger bays.') or 'Maintained',
                'wash': get_col(row, 'Functional handwashing points at gates, latrines, and dining/canteen areas with soap and running water.') or 'Present',
                'poster': get_col(row, 'Presence, legibility, and currency of MoH/KCCA posters on Ebola, Mpox, and Marburg with active toll-free lines.') or 'Observed',
                'holding': get_col(row, 'Designated space, ventilation, clean bedding, and written separation protocol for suspected symptomatic cases.') or 'Makeshift Only',
                'staff': get_col(row, 'Verify if school nurse/matron or market head has ever received orientation on epidemics.') or 'Not oriented',
                'boys': 0, 'girls': 0, 'enrolment': 0, 'teachers': 0, 'games': 0
            })
            tool_counts['Transect Walk'] = tool_counts.get('Transect Walk', 0) + 1
            continue

        # --- 4. PAT Assessment (Tool 8 / 11) ---
        if 'preparedness' in activity_type or 'tool 11' in activity_type or 'pat' in activity_type or get_col(row, 'Does the school have a Epidemic Preparedness Plan'):
            s_name = get_col(row, 'Name of the school', 'School Name') or 'Assessed Facility'
            records.append({
                'id': row_id,
                'date': formatted_date,
                'tool': 'PAT Assessment',
                'district': get_col(row, 'District') or 'Central',
                'parish': get_col(row, 'Parish'),
                'school': s_name,
                'name': s_name,
                'level': get_col(row, 'School level') or 'Primary',
                'boys': parse_num(get_col(row, 'total enrolment for boys')),
                'girls': parse_num(get_col(row, 'Totla enrolement for girls', 'Total enrolment for girls')),
                'maleStaff': parse_num(get_col(row, 'Total male teaching staff')),
                'femaleStaff': parse_num(get_col(row, 'Total female teaching staff')),
                'club': get_col(row, 'Presence of health club', 'School Health Club Status') or 'Active',
                'plan': get_col(row, 'Does the school have a Epidemic Preparedness Plan') or 'Informal Only',
                'space': get_col(row, 'Does the school have a Designated Isolation place incase of an epidemic') or 'Makeshift corner',
                'stations': parse_num(get_col(row, 'Record number of working water stations', 'Record number of working water stations ')),
                'bStances': parse_num(get_col(row, 'Record number of stances for boys', 'Record number of stances for boys ')),
                'gStances': parse_num(get_col(row, 'record number of stances for girls', 'record number of stances for girls')),
                'poster': get_col(row, 'Record presence of Posters or guidelines on Ebola, Mpox, or Cholera displayed in prominent pupil areas.') or 'IEC Present',
                'washAudit': get_col(row, 'Q1 Stations present at gates, outside latrines, and near dining/canteen areas with both clean running water AND soap.') or 'Water + Soap Present',
                'stanceAudit': get_col(row, 'Record toilet stances separated by gender, functional locks, clean floors, and handwash stations within 5 meters of exits.') or 'Adequate',
                'wasteAudit': get_col(row, 'Enclosed bins, absence of overflowing compost/litter pits or open medical/menstrual waste.') or 'Maintained',
                'drainageAudit': get_col(row, 'Record drainage conditions around the waste collection area') or 'Flowing',
                'hotlineLegible': get_col(row, 'Is the toll-free hotline legible on the posters') or 'Yes',
                'enrolment': 0, 'teachers': 0, 'games': 0
            })
            tool_counts['PAT Assessment'] = tool_counts.get('PAT Assessment', 0) + 1
            continue

    return records, tool_counts

def main():
    cli_arg = sys.argv[1] if len(sys.argv) > 1 else None
    excel_path = find_excel_file(cli_arg)
    
    if not excel_path:
        print("❌ Error: Could not locate Public_Health_Emergencies.xlsx.")
        print(f"Please specify the path, e.g.:\n  python3 update_dashboard.py '/path/to/Public_Health_Emergencies.xlsx'")
        sys.exit(1)
        
    records, tool_counts = parse_workbook(excel_path)
    
    # Save dashboard_data.json
    json_path_dash = os.path.join(LOCAL_DIR, "dashboard_data.json")
    
    with open(json_path_dash, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)
        
    # Save data.js for direct file:// browser support
    js_path = os.path.join(LOCAL_DIR, "data.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("/**\n * Auto-generated PHE dataset from update_dashboard script.\n")
        f.write(f" * Updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n */\n")
        f.write("window.PHE_DATA = ")
        json.dump(records, f, indent=2, ensure_ascii=False)
        f.write(";\n")

    # If the source excel is outside the current folder, copy it locally for GitHub tracking
    local_excel = os.path.join(LOCAL_DIR, "Public_Health_Emergencies.xlsx")
    if os.path.abspath(excel_path) != os.path.abspath(local_excel):
        try:
            shutil.copy2(excel_path, local_excel)
            print(f"📋 Synced local Excel copy to: {local_excel}")
        except Exception as e:
            print(f"⚠️ Could not copy Excel file locally: {e}")

    # Summary Statistics
    total_boys = sum(r.get('boys', 0) for r in records)
    total_girls = sum(r.get('girls', 0) for r in records)
    total_learners = total_boys + total_girls
    total_teachers = sum(r.get('teachers', 0) for r in records)
    total_games = sum(r.get('games', 0) for r in records)
    districts = set(r.get('district') for r in records if r.get('district'))
    
    print("\n" + "=" * 60)
    print("✅ DASHBOARD DATA UPDATED SUCCESSFULLY!")
    print("=" * 60)
    print(f"📊 Total Records Processed: {len(records)}")
    for t_name, count in tool_counts.items():
        print(f"   • {t_name}: {count} records")
    print("-" * 60)
    print(f"👥 Total Learners Sensitised: {total_learners:,} ({total_boys:,} Boys | {total_girls:,} Girls)")
    print(f"🎓 Gatekeepers & Teachers Oriented: {total_teachers:,}")
    print(f"🎲 Board Games Distributed: {total_games:,}")
    print(f"📍 Districts Covered: {len(districts)} ({', '.join(sorted(districts))})")
    print("-" * 60)
    print("📁 Updated Files:")
    print(f"   ✓ {os.path.basename(json_path_dash)}")
    print(f"   ✓ {os.path.basename(js_path)}")
    print(f"   ✓ Public_Health_Emergencies.xlsx")
    print("=" * 60)
    print("🚀 Next step to upload to GitHub:")
    print("   git add .")
    print('   git commit -m "Update PHE dashboard data"')
    print("   git push")
    print("=" * 60 + "\n")

if __name__ == "__main__":
    main()
