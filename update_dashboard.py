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
import re
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

CLEAN_EMPTY_WORDS = {'nan', 'none', 'non', 'nil', 'n/a', 'na', 'none.', 'non.', 'null'}

CANONICAL_SCHOOLS = {
    'bwaise parents primary school': 'Bwaise Parents Primary School',
    'buganda rd primary': 'Buganda Road Primary School',
    'buganda road primary': 'Buganda Road Primary School',
    'gayaza road high school': 'Gayaza Road High School',
    'gayaza road secondary school': 'Gayaza Road High School',
    'greenland islamic secondary school': 'Greenlight Islamic Secondary School',
    'greenlight islamic secondary school': 'Greenlight Islamic Secondary School',
    'katwe church  of uganda primary  school': 'Katwe Church of Uganda Primary School',
    'katwe church of uganda primary school': 'Katwe Church of Uganda Primary School',
    'katwe martyrs  cou primary  school': 'Katwe Martyrs COU Primary School',
    'katwe martyrs cou primary school': 'Katwe Martyrs COU Primary School',
    'luzira secondary school': 'Luzira Secondary School',
    'luzira ss': 'Luzira Secondary School',
    'mbuya c/u primary': 'Mbuya C/U Primary School',
    'mbuya c/u primary school': 'Mbuya C/U Primary School',
    'nansana catholic primary school': 'St Joseph\'s Nansana Catholic Primary School',
    'st joseph\'s nansana catholic primary school': 'St Joseph\'s Nansana Catholic Primary School',
    'st josephs nansana catholic primary school': 'St Joseph\'s Nansana Catholic Primary School',
    'nansana sda primary school': 'Nansana SDA Primary School',
    'progressive ss kitintale': 'Progressive SS Kitintale',
    'st paul  primary school  nsambya': 'St Paul Primary School Nsambya',
    'st paul primary school nsambya': 'St Paul Primary School Nsambya',
    'st ponsiano primary  school': 'St Ponsiano Primary School',
    'st ponsiano primary school': 'St Ponsiano Primary School',
    'talents college secondary school': 'Talents College Secondary School',
    'talents college ss': 'Talents College Secondary School',
    'seeta church of uganda primary school': 'Seeta COU Primary School',
    'seeta cou primary and nursery school': 'Seeta COU Primary School',
    'seeta cou primary school': 'Seeta COU Primary School',
    'uganda youth aid primary school': 'Uganda Youth Aid Primary School',
    'uganda youth aid school': 'Uganda Youth Aid Primary School',
    'uganda youth primary school': 'Uganda Youth Aid Primary School',
}

def clean_school_name(raw):
    if not raw:
        return ''
    s = re.sub(r'\s+', ' ', str(raw)).strip()
    s_low = s.lower()
    return CANONICAL_SCHOOLS.get(s_low, s)

def clean_val(v):
    if isinstance(v, str):
        s = v.strip()
        if s.lower() in CLEAN_EMPTY_WORDS:
            return ''
        return s
    return v

def normalize_col_name(s):
    if not s:
        return ''
    return ''.join(c for c in str(s).lower() if c.isalnum())

def get_col(row, *aliases):
    # 1. Exact lowercase match
    for alias in aliases:
        clean_alias = alias.strip().lower()
        for k in row.index:
            if str(k).strip().lower() == clean_alias:
                v = row[k]
                if pd.notna(v):
                    s = str(v).strip()
                    if s.lower() not in CLEAN_EMPTY_WORDS:
                        return s
    # 2. Normalized alphanumeric match
    for alias in aliases:
        norm_alias = normalize_col_name(alias)
        if not norm_alias:
            continue
        for k in row.index:
            if normalize_col_name(k) == norm_alias:
                v = row[k]
                if pd.notna(v):
                    s = str(v).strip()
                    if s.lower() not in CLEAN_EMPTY_WORDS:
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
    
    # Check _index column in Excel
    if '_index' in df.columns:
        valid_indices = df['_index'].dropna()
        if len(valid_indices) > 0:
            print(f"📌 Found '_index' column in Excel: range {int(valid_indices.min())} to {int(valid_indices.max())} ({len(valid_indices)} populated rows)")

    records = []
    tool_counts = {}

    for idx, row in df.iterrows():
        activity_type = str(row.get('Public Health Emergencies') or row.get('Public Health Emergencies ') or '').strip().lower()
        raw_date = row.get('Date')
        formatted_date = normalize_date(raw_date)
        
        # Primary index from Kobo / Excel
        raw_idx = row.get('_index') if '_index' in row else None
        p_idx = parse_num(raw_idx)
        row_index = int(p_idx) if (p_idx and p_idx > 0) else (idx + 1)
        row_id = parse_num(row.get('_id')) or row_index
        row_uuid = str(row.get('_uuid') or '').strip()

        def push_record(rec_dict):
            rec_dict['_index'] = row_index
            rec_dict['index'] = row_index
            rec_dict['_id'] = row_id
            if row_uuid:
                rec_dict['_uuid'] = row_uuid
            records.append(rec_dict)
        
        # Determine coordinator / lead
        coord_raw = str(row.get('Cordinator') or row.get('Coordinator') or '').strip()
        specify_raw = str(row.get('specify') or '').strip()
        if specify_raw and specify_raw.lower() != 'nan' and (coord_raw.lower() == 'other' or not coord_raw or coord_raw.lower() == 'nan'):
            coordinator = specify_raw
        else:
            coordinator = coord_raw if coord_raw.lower() != 'nan' else specify_raw

        # --- 1. School Activity (Tool 9) ---
        if ('3-visit' in activity_type or 'wheel session' in activity_type or 'school activity' in activity_type or 'tool 9' in activity_type or 
            (not any(k in activity_type for k in ['transect', 'gatekeeper', 'preparedness', 'intercept', 'ask 5', 'photovoice', 'influencer', 'simulation', 'u-report', 'recruitment', 'listening', 'rumor', 'rumour']) and get_col(row, 'School Name'))):
            s_name = clean_school_name(get_col(row, 'School Name', 'Name of the school'))
            if s_name:
                boys = parse_num(get_col(row, 'Number of boys sensitised'))
                girls = parse_num(get_col(row, 'Number of girls sensitised'))
                enrolment = parse_num(get_col(row, 'Total School enrolment Population', 'Total School Enrollment Population'))
                if boys + girls > enrolment:
                    enrolment = boys + girls
                
                # New questions from PDF
                protocol_shared = get_col(row, 'Written 1-page PHE Protocol shared and displayed with Headteacher?', 'Written 1-page PHE Protocol shared and displayed with Headteacher', 'protocol_shared')
                isolation_space = get_col(row, 'Designated temporary isolation space / sick bay identified?', 'Designated temporary isolation space / sick bay identified', 'isolation_space')
                hotline_known = get_col(row, 'Headteacher / Focal Teacher knows official reporting hotline (0800-100-066 / 8500)', 'Headteacher knows official reporting hotline', 'hotline_known')
                health_club_est = get_col(row, 'Is a U-Report Health Club Established?', 'Is a U-Report Health Club Established', 'health_club_established', 'Presence of school health club', 'Presence of health club', 'School Health Club Status') or 'Active'
                patron = get_col(row, 'Patron')
                patron_spec = get_col(row, 'Specify', 'specify')
                female_club = parse_num(get_col(row, 'Females members of club', 'Female members of club'))
                male_club = parse_num(get_col(row, 'Male members of club'))
                handwash_demo_club = get_col(row, 'Handwashing demonstration led by club members?', 'Handwashing demonstration led by club members')
                meeting_days = get_col(row, 'Meeting days of the club')
                verified_activities = get_col(row, 'Verified club activities this week')
                take_home_cards = parse_num(get_col(row, 'PHE Take-home cards distributed'))
                wash_points_soap = get_col(row, 'Handwashing points functional with running water AND soap today')
                wheel_sessions = parse_num(get_col(row, 'Number of knowledge wheel sessions held today'))
                wheel_correct = get_col(row, 'When spinning the wheel, did the pupil answer correctly?')
                wheel_score = get_col(row, 'Wheel of Good Practices Score')

                push_record({
                    'id': row_id,
                    'date': formatted_date,
                    'tool': 'School Activity',
                    'district': get_col(row, 'District') or 'Central',
                    'parish': get_col(row, 'Parish'),
                    'coordinator': coordinator,
                    'school': s_name,
                    'visit_num': get_col(row, 'Visit Number') or 'Visit 1',
                    'health_club': health_club_est,
                    'protocol_shared': protocol_shared,
                    'isolation_space': isolation_space,
                    'hotline_known': hotline_known,
                    'health_club_established': health_club_est,
                    'patron': patron,
                    'patron_specify': patron_spec,
                    'female_club_members': female_club,
                    'male_club_members': male_club,
                    'handwash_demo_club': handwash_demo_club,
                    'meeting_days': meeting_days,
                    'verified_club_activities': verified_activities,
                    'take_home_cards': take_home_cards,
                    'wash_points_soap': wash_points_soap,
                    'wheel_sessions': wheel_sessions,
                    'wheel_correct': wheel_correct,
                    'wheel_score': wheel_score,
                    'boys': boys,
                    'girls': girls,
                    'enrolment': enrolment,
                    'teachers': parse_num(get_col(row, 'Number of Teachers/Patrons Present')),
                    'active_ureporters': parse_num(get_col(row, 'Number of U-Reporters Active On-Site Today')),
                    'games': parse_num(get_col(row, 'Snakes & Ladders Board Games distributed')),
                    'signs': get_col(row, 'Raise your hand if you can name 3 warning signs of PHE'),
                    'hotline': get_col(row, 'Raise your hand if you know the toll-free hotline or where to report'),
                    'stigma': get_col(row, 'Raise your hand if you believe a sick person should be cared for safely without being chased or hidden'),
                    'handwash_demo': get_col(row, 'Did the volunteer demonstrate correct handwashing steps'),
                    'soap': get_col(row, 'Soap and running water available at venue today'),
                    'rumor': get_col(row, 'Rumor, misinformation or question flagged', 'Top misconception heard today', 'specify3', 'Local barrier identified'),
                    'barrier': get_col(row, 'Local barrier identified'),
                    'source': get_col(row, 'source of the rumor', 'Origin of rumor') or 'Community'
                })
                tool_counts['School Activity'] = tool_counts.get('School Activity', 0) + 1
                continue

        # --- 2. Gatekeeper Session (Tool 7) ---
        if 'gatekeeper' in activity_type or 'community gate' in activity_type or 'tool 7' in activity_type or get_col(row, 'what commitments did the gatekeeper make'):
            male_gk = parse_num(get_col(row, 'Male Gatekeepers Oriented'))
            female_gk = parse_num(get_col(row, 'Female Gatekeepers Oriented'))
            role = get_col(row, 'Type of gatekeeper') or 'Teacher / Patron'
            role_specify = get_col(row, 'specify2', 'specify')
            gk_cat = get_col(row, 'Gatekeeper primary category') or role
            hotspot_setting = get_col(row, 'Hotspot seting', 'Hotspot setting', 'Setting type')
            manual_used = get_col(row, 'Did the gatekeeper lead the session using the Standard Manual/Script')
            protocol_handed = get_col(row, 'Was the official 1-page PHE Protocol handed over to the venue/institution lead?')
            action_plan = get_col(row, 'Has the institution started / agreed on its own 1-page emergency action plan?')
            commitments = get_col(row, 'what commitments did the gatekeeper make')
            signs_ability = get_col(row, 'Are the gatekepers able to identify the three PHE warning signs', 'Warning Signs: Proportion in audience able to identify 3 PHE signs without prompting')
            hotline_ability = get_col(row, 'Do the gatekeeprs know the exact hotline and reporting steps', 'Notification Route: Proportion knowing the 0800-100-066 line or immediate VHT link')
            destigmatization = get_col(row, 'Destigmatization: Willingness to support rather than chase/isolate suspect cases')
            venue_wash = get_col(row, 'Is functional handwashing present at this venue?')
            wheel_sessions_gk = parse_num(get_col(row, 'Number of Community in Knowledge Wheel Sessions Held'))
            wheel_score_gk = get_col(row, 'Wheel of good practice score')
            
            # Male & Female Community Crowd Reached
            male_crowd = parse_num(get_col(row,
                'Estimated male Passersby / Community Crowd Engaged',
                'Estimated male Passersby / Community Crowd Engaged ',
                'Estimated male Passersby',
                'Estimated male Crowd Engaged',
                'Male Passersby / Community Crowd Engaged',
                'Estimated male Passersby / Community Crowd',
                'Number of people reached in community events male',
                'Estimated male community crowd engaged',
                'male_crowd',
                'crowd_male'
            ))
            female_crowd = parse_num(get_col(row,
                'Estimated female Passersby / Community Crowd Engaged',
                'Estimated female Passersby / Community Crowd Engaged ',
                'Estimated female Passersby',
                'Estimated female Crowd Engaged',
                'Female Passersby / Community Crowd Engaged',
                'Estimated female Passersby / Community Crowd',
                'Number of people reached in community events female',
                'Estimated female community crowd engaged',
                'female_crowd',
                'crowd_female'
            ))
            legacy_crowd = parse_num(get_col(row,
                'Estimated Passersby / Community Crowd Engaged',
                'Estimated Passersby / Community Crowd Engaged ',
                'Estimated Passersby',
                'Estimated Crowd Engaged',
                'crowd_engaged'
            ))
            crowd_engaged = (male_crowd + female_crowd) if (male_crowd > 0 or female_crowd > 0) else legacy_crowd

            rumor = get_col(row, 'Rumor, misinformation or question flagged')
            barrier = get_col(row, 'Local barrier identified')
            source = get_col(row, 'source of the rumor', 'Origin of rumor') or 'Community'
            risk_level = get_col(row, 'Estimated spread or risk level')
            tactical_adaptation = get_col(row, 'Recommended tactical adaptation')

            push_record({
                'id': row_id,
                'date': formatted_date,
                'tool': 'Gatekeeper Session',
                'district': get_col(row, 'District') or 'Central',
                'parish': get_col(row, 'Parish'),
                'coordinator': coordinator,
                'school': f'Gatekeeper Session ({role})',
                'role': role,
                'role_specify': role_specify,
                'gk_category': gk_cat,
                'hotspot_setting': hotspot_setting,
                'protocol_handed_over': protocol_handed,
                'action_plan_started': action_plan,
                'commitments': commitments,
                'manual_used': manual_used,
                'signs_ability': signs_ability,
                'hotline_ability': hotline_ability,
                'destigmatization': destigmatization,
                'venue_wash': venue_wash,
                'wheel_sessions': wheel_sessions_gk,
                'wheel_score': wheel_score_gk,
                'crowd_engaged': crowd_engaged,
                'male_crowd': male_crowd,
                'female_crowd': female_crowd,
                'crowd_male': male_crowd,
                'crowd_female': female_crowd,
                'rumor': rumor,
                'barrier': barrier,
                'source': source,
                'risk_level': risk_level,
                'tactical_adaptation': tactical_adaptation,
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

            wash_val = get_col(row, 'Functional handwashing points at gates, latrines, and dining/canteen areas with soap and running water.') or 'Present'
            refuse_val = get_col(row, 'Open refuse heaps, stagnant water, overflowing drainage channels near classrooms, food stalls, or passenger bays.') or 'Maintained'
            choke_val = get_col(row, 'Choke points where physical distancing is impossible (school gates, market aisles, taxi boarding bays).') or 'Moderate Congestion'
            poster_val = get_col(row, 'Presence, legibility, and currency of MoH/KCCA posters on Ebola, Mpox, and Marburg with active toll-free lines.') or 'Observed'
            hotline_conf = get_col(row, 'Confirm if these IEC materials have presence of hotlines (0800-100-066 / 8500).')
            latrine_val = get_col(row, 'Cleanliness, separation of facilities, water availability, and handwash basins at latrines/toilets.') or 'Clean & Supplied'
            stance_notes = get_col(row, 'Note student-to-stance ratio or market vendor access.')
            holding_val = get_col(row, 'Designated space, ventilation, clean bedding, and written separation protocol for suspected symptomatic cases.') or 'Makeshift Only'
            staff_val = get_col(row, 'Verify if school nurse/matron or market head has ever received orientation on epidemics.', 'Verify school nurse/matron or market head orientation.') or 'Not oriented'
            vector_notes = get_col(row, 'Check vector breeding sites and safety near food points.')
            obs_notes = get_col(row, 'Observation notes')

            risk_level = get_col(row, 'Estimated spread or risk level')
            rumor = get_col(row, 'Rumor, misinformation or question flagged')
            barrier = get_col(row, 'Local barrier identified')
            source = get_col(row, 'source of the rumor', 'Origin of rumor') or 'Community'
            tactical_adaptation = get_col(row, 'Recommended tactical adaptation')

            push_record({
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
                'wash': wash_val,
                'refuse': refuse_val,
                'choke': choke_val,
                'poster': poster_val,
                'hotline_conf': hotline_conf,
                'latrine_sanitation': latrine_val,
                'stance_notes': stance_notes,
                'holding': holding_val,
                'staff': staff_val,
                'vector_notes': vector_notes,
                'notes': obs_notes or vector_notes or 'No notes recorded',
                'risk_level': risk_level,
                'rumor': rumor,
                'barrier': barrier,
                'source': source,
                'tactical_adaptation': tactical_adaptation,
                'boys': 0, 'girls': 0, 'enrolment': 0, 'teachers': 0, 'games': 0
            })
            tool_counts['Transect Walk'] = tool_counts.get('Transect Walk', 0) + 1
            continue

        # --- 4. Dedicated Weekly Community & School Listening and Rumour Log (Tool 8) ---
        if ('listening' in activity_type or 'rumour log' in activity_type or 'rumor log' in activity_type or 
            (('listening' in activity_type or 'rumor' in activity_type) and not any(k in activity_type for k in ['transect', 'gatekeeper', 'intercept', 'ask 5', 'preparedness']))):
            push_record({
                'id': row_id,
                'date': formatted_date,
                'tool': 'Listening & Rumour Log',
                'district': get_col(row, 'District') or 'Central',
                'parish': get_col(row, 'Parish'),
                'coordinator': coordinator,
                'school': f"{get_col(row, 'District') or 'Central'} - {get_col(row, 'Parish') or 'Community'}",
                'rumor': get_col(row, 'Rumor, misinformation or question flagged', 'Top misconception heard today'),
                'barrier': get_col(row, 'Local barrier identified'),
                'origin': get_col(row, 'Origin of rumor', 'source of the rumor', 'source') or 'Community',
                'origin_specify': get_col(row, 'Specify', 'specify'),
                'risk_level': get_col(row, 'Estimated spread or risk level') or 'Moderate',
                'tactical_adaptation': get_col(row, 'Recommended tactical adaptation'),
                'setting': get_col(row, 'Setting type') or 'School',
                'setting_specify': get_col(row, 'specify', 'specify3'),
                'boys': 0, 'girls': 0, 'enrolment': 0, 'teachers': 0, 'games': 0
            })
            tool_counts['Listening & Rumour Log'] = tool_counts.get('Listening & Rumour Log', 0) + 1
            continue

        # --- 5. Dedicated U-Report Recruitment (Tool 11) ---
        if ('u-report' in activity_type or 'recruitment' in activity_type or ('tool 11' in activity_type and not 'preparedness' in activity_type)):
            male_u = parse_num(get_col(row, 'Male U-reporters recruited'))
            female_u = parse_num(get_col(row, 'Female U-reporters recruited'))
            loc = get_col(row, 'Location') or 'Community Congregate Setting'
            push_record({
                'id': row_id,
                'date': formatted_date,
                'tool': 'U-Report Recruitment',
                'district': get_col(row, 'District') or 'Central',
                'parish': get_col(row, 'Parish'),
                'coordinator': coordinator,
                'school': f"{get_col(row, 'District') or 'Central'} - {loc}",
                'location': loc,
                'male': male_u,
                'female': female_u,
                'total': male_u + female_u,
                'teachers': male_u + female_u,
                'boys': 0, 'girls': 0, 'enrolment': 0, 'games': 0
            })
            tool_counts['U-Report Recruitment'] = tool_counts.get('U-Report Recruitment', 0) + 1
            continue

        # --- 6. PAT Assessment (Preparedness Assessment Tool) ---
        if 'preparedness' in activity_type or 'pat' in activity_type or get_col(row, 'Does the school have a Epidemic Preparedness Plan'):
            s_name = clean_school_name(get_col(row, 'Name of the school', 'School Name') or 'Assessed Facility')
            p_signs = parse_num(get_col(row, 'How many can you name three major signs or warning symptoms of a public health emergency like Ebola or Mpox?', 'How many can you name three major signs or warning symptoms of a public health emergency like Ebola or Mpox?13'))
            p_spread = parse_num(get_col(row, 'How many Can you tell me how disease outbreaks spread from one person to another?', 'How many Can you tell me how disease outbreaks spread from one person to another?14'))
            p_risk = parse_num(get_col(row, 'Since Uganda was declared free from the last outbreak, is the risk completely gone?', 'Since Uganda was declared free from the last outbreak, is the risk completely gone?15'))
            p_notify = parse_num(get_col(row, 'If a classmate or family member collapses or has high fever and bleeding, who should be notified first?', 'If a classmate or family member collapses or has high fever and bleeding, who should be notified first?16'))
            p_stigma = parse_num(get_col(row, 'If a pupil returns to school after being discharged from an isolation treatment unit, how should they be treated?', 'If a pupil returns to school after being discharged from an isolation treatment unit, how should they be treated?17'))
            p_handwash = parse_num(get_col(row, 'Demonstrate how to wash your hands properly using running water and soap.', 'Demonstrate how to wash your hands properly using running water and soap.18'))
            lead_hotline = get_col(row, 'Can the school leadership state the official toll-free reporting lines (e.g., MoH/KCCA hotlines: 0800-100-066 / 8500) and the focal Division Health Officer/VHT contact without checking notes?')

            push_record({
                'id': row_id,
                'date': formatted_date,
                'tool': 'PAT Assessment',
                'district': get_col(row, 'District') or 'Central',
                'parish': get_col(row, 'Parish'),
                'coordinator': coordinator,
                'school': s_name,
                'name': s_name,
                'level': get_col(row, 'School level') or 'Primary',
                'boys': 0,
                'girls': 0,
                'boys_enrolment': parse_num(get_col(row, 'total enrolment for boys')),
                'girls_enrolment': parse_num(get_col(row, 'Totla enrolement for girls', 'Total enrolment for girls')),
                'enrolment': parse_num(get_col(row, 'total enrolment for boys')) + parse_num(get_col(row, 'Totla enrolement for girls', 'Total enrolment for girls')),
                'maleStaff': parse_num(get_col(row, 'Total male teaching staff')),
                'femaleStaff': parse_num(get_col(row, 'Total female teaching staff')),
                'club': get_col(row, 'Presence of health club', 'School Health Club Status') or 'Active',
                'plan': get_col(row, 'Does the school have a Epidemic Preparedness Plan') or 'Informal Only',
                'leadership_hotline': lead_hotline,
                'space': get_col(row, 'Does the school have a Designated Isolation place incase of an epidemic') or 'Makeshift corner',
                'stations': parse_num(get_col(row, 'Record number of working water stations', 'Record number of working water stations ')),
                'bStances': parse_num(get_col(row, 'Record number of stances for boys', 'Record number of stances for boys ')),
                'gStances': parse_num(get_col(row, 'record number of stances for girls', 'record number of stances for girls')),
                'poster': get_col(row, 'Record presence of Posters or guidelines on Ebola, Mpox, or Cholera displayed in prominent pupil areas.') or 'IEC Present',
                'washAudit': get_col(row, 'Q1 Stations present at gates, outside latrines, and near dining/canteen areas with both clean running water AND soap.') or 'Water + Soap Present',
                'soapAudit': get_col(row, 'Q2 Soap is consistently replenished for pupil use, not kept locked away for staff only.'),
                'stanceAudit': get_col(row, 'Record toilet stances separated by gender, functional locks, clean floors, and handwash stations within 5 meters of exits.') or 'Adequate',
                'wasteAudit': get_col(row, 'Enclosed bins, absence of overflowing compost/litter pits or open medical/menstrual waste.') or 'Maintained',
                'drainageAudit': get_col(row, 'Record drainage conditions around the waste collection area') or 'Flowing',
                'hotlineLegible': get_col(row, 'Is the toll-free hotline legible on the posters') or 'Yes',
                # 10-Pupil Rapid Intercept
                'p_signs': p_signs,
                'p_spread': p_spread,
                'p_risk': p_risk,
                'p_notify': p_notify,
                'p_stigma': p_stigma,
                'p_handwash': p_handwash,
                'teachers': 0, 'games': 0
            })
            tool_counts['PAT Assessment'] = tool_counts.get('PAT Assessment', 0) + 1
            continue


        # --- 5. Tool 2: Rapid Audience Intercept Survey ---
        if 'tool 2' in activity_type or 'rapid audience' in activity_type or 'intercept' in activity_type:
            district = get_col(row, 'District') or 'Central'
            parish = get_col(row, 'Parish')
            setting = get_col(row, 'Setting type') or 'Community'
            spec_setting = get_col(row, 'specify3')
            site_name = f"{district} - {parish} ({setting})" if parish else f"{district} ({setting})"
            if spec_setting:
                site_name += f" - {spec_setting}"

            # Q1: 7-day outbreak message exposure
            q1_val = get_col(row, 'Q1 In the past 7 days, have you seen or heard any public health messages or activities in this area regarding disease outbreaks (Ebola, Mpox, Marburg)?')

            # Q2: Key symptoms & protection measures recalled
            q2_verbatim = get_col(row, 'Q2 Can you name two key signs/symptoms of Ebola or Mpox and one way you can protect yourself?')
            q2_eval = get_col(row, 'Correctly named 2+ symptoms', 'Correctly named 2+ symptoms  ')
            q2_val = q2_eval or q2_verbatim

            # Q3: Post-declaration epidemic risk perception
            q3_val = get_col(row, 'Qn3 Now that Uganda was declared Ebola-free in July 2026, do you feel there is still a risk of outbreaks in your community, or is the threat completely gone?')

            # Q4: First Action / Health Seeking Protocol (Binary choices + Specify)
            q4_hotline = parse_num(row.get('Q4 If someone in your home or workplace suddenly developed high fever, vomiting, and unexplained bleeding, what is the FIRST action you would take?/Call national/district toll-free hotline (0800-100-066 / 8500)', 0))
            q4_vht = parse_num(row.get('Q4 If someone in your home or workplace suddenly developed high fever, vomiting, and unexplained bleeding, what is the FIRST action you would take?/Notify local VHT ', 0))
            q4_lc1 = parse_num(row.get('Q4 If someone in your home or workplace suddenly developed high fever, vomiting, and unexplained bleeding, what is the FIRST action you would take?/LC1 Chairperson immediately', 0))
            q4_clinic = parse_num(row.get('Q4 If someone in your home or workplace suddenly developed high fever, vomiting, and unexplained bleeding, what is the FIRST action you would take?/Escort them quietly to a private clinic or pharmacy', 0))
            q4_home_care = parse_num(row.get('Q4 If someone in your home or workplace suddenly developed high fever, vomiting, and unexplained bleeding, what is the FIRST action you would take?/Isolate them at home and treat with herbs/home care', 0))
            q4_healer = parse_num(row.get('Q4 If someone in your home or workplace suddenly developed high fever, vomiting, and unexplained bleeding, what is the FIRST action you would take?/Seek prayers / traditional healer', 0))
            q4_other = parse_num(row.get('Q4 If someone in your home or workplace suddenly developed high fever, vomiting, and unexplained bleeding, what is the FIRST action you would take?/Other', 0))
            q4_specify = get_col(row, 'Specify4')

            q4_primary = get_col(row, 'Q4 If someone in your home or workplace suddenly developed high fever, vomiting, and unexplained bleeding, what is the FIRST action you would take?')
            q4_val = q4_specify if (q4_primary.lower() == 'other' and q4_specify) else q4_primary

            # Q5: Most trusted truth broker
            q5_val = get_col(row, 'Qn5 Who in this community do you trust the MOST to tell you the truth about a disease outbreak?')

            # Risk level and qualitative intelligence
            risk_level = get_col(row, 'Estimated spread or risk level')
            rumor = get_col(row, 'Rumor, misinformation or question flagged')
            barrier = get_col(row, 'Local barrier identified')
            source = get_col(row, 'source of the rumor') or 'Community'
            tactical_adaptation = get_col(row, 'Recommended tactical adaptation')

            push_record({
                'id': row_id,
                'date': formatted_date,
                'tool': 'Rapid Intercept',
                'district': district,
                'parish': parish,
                'coordinator': coordinator,
                'school': site_name,
                'site': site_name,
                'setting': setting,
                'spec_setting': spec_setting,
                'q1': q1_val,
                'q1_exposure': q1_val,
                'q2': q2_val,
                'q2_verbatim': q2_verbatim,
                'q2_eval': q2_eval,
                'q3': q3_val,
                'q3_risk': q3_val,
                'q4': q4_val,
                'q4_hotline': q4_hotline,
                'q4_vht': q4_vht,
                'q4_lc1': q4_lc1,
                'q4_clinic': q4_clinic,
                'q4_home_care': q4_home_care,
                'q4_healer': q4_healer,
                'q4_other': q4_other,
                'q4_specify': q4_specify,
                'q5': q5_val,
                'q5_trusted': q5_val,
                'risk_level': risk_level,
                'rumor': rumor,
                'barrier': barrier,
                'source': source,
                'tactical_adaptation': tactical_adaptation,
                'boys': 0, 'girls': 0, 'enrolment': 0, 'teachers': 0, 'games': 0
            })
            tool_counts['Rapid Intercept'] = tool_counts.get('Rapid Intercept', 0) + 1
            continue

        # --- 6. Tool 3: 'Ask 5' Behavioral Verification Diagnostic ---
        if 'tool 3' in activity_type or 'ask 5' in activity_type or 'diagnostic' in activity_type:
            district = get_col(row, 'District') or 'Central'
            parish = get_col(row, 'Parish')
            target_group = get_col(row, 'Target group') or 'Community Member'
            setting = get_col(row, 'Setting type') or 'School'
            claim = get_col(row, 'Which of these five claims have you heard')

            # Heard claims breakdown
            h1 = parse_num(row.get('Which of these five claims have you heard/We always wash our hands with soap throughout the day.', 0))
            h2 = parse_num(row.get('Which of these five claims have you heard/I can easily spot the signs of Ebola and Mpox', 0))
            h3 = parse_num(row.get('Which of these five claims have you heard/If someone gets sick with outbreak signs, I will call the toll-free line or report immediately', 0))
            h4 = parse_num(row.get('Which of these five claims have you heard/We do not discriminate against anyone who recovers from an infectious disease or their family', 0))
            h5 = parse_num(row.get('Which of these five claims have you heard/I have shared the emergency preparedness messages with my household and colleagues', 0))

            # Claim 1: Handwashing
            c1_time = get_col(row, 'When was the exact last time you washed hands with soap today')
            c1_soap = get_col(row, 'where is the nearest soap located right now?')
            c1_station = get_col(row, 'Show me the station you used')
            c1_status = get_col(row, 'data collector verification status')

            # Claim 2: Symptom Differentiation & No-Contact
            c2_diff = get_col(row, 'What is the critical difference between ordinary malaria/flu and early warning signs of Haemorrhagic Fevers or Mpox skin lesions?')
            c2_assist = get_col(row, 'If a pupil, colleague, or customer has high fever and red eyes, how do you assist without physical contact?')
            c2_status = get_col(row, 'Verification Status')

            # Claim 3: Toll-free Hotline & Reporting
            c3_hotline = get_col(row, 'Without checking your phone, what is the exact emergency toll-free number or school/parish focal person contact?')
            c3_fear = get_col(row, 'What specific fear would make you hesitate to call ')
            c3_status = get_col(row, 'Verification Status5')

            # Claim 4: Anti-Stigma & Reintegration
            c4_reintegrate = get_col(row, 'If a pupil or vendor returns after being discharged from an isolation unit, how will you and others interact with them?')
            c4_allow_back = get_col(row, 'Would you allow them back in your study group, buy food from them, or sit next to them?')
            c4_status = get_col(row, 'Verification Status6')

            # Claim 5: Preparedness Multiplier
            c5_agreement = get_col(row, 'What specific agreement did your family or health club members establish after you spoke with them?')
            c5_tough_q = get_col(row, 'Who asked the most difficult question about disease outbreaks, and what was your exact answer?')
            c5_status = get_col(row, 'Verification Status7')

            # Primary status summary
            primary_status = c1_status or c2_status or c3_status or c4_status or c5_status or 'Verified'

            push_record({
                'id': row_id,
                'date': formatted_date,
                'tool': 'Ask 5',
                'district': district,
                'parish': parish,
                'coordinator': coordinator,
                'school': f"{district} - {parish} ({target_group})" if parish else f"{district} ({target_group})",
                'group': target_group,
                'setting': setting,
                'claim': claim,
                'heard_c1': h1,
                'heard_c2': h2,
                'heard_c3': h3,
                'heard_c4': h4,
                'heard_c5': h5,
                # Claim 1
                'c1_time': c1_time,
                'c1_soap': c1_soap,
                'c1_station': c1_station,
                'c1_status': c1_status,
                # Claim 2
                'c2_diff': c2_diff,
                'c2_assist': c2_assist,
                'c2_status': c2_status,
                # Claim 3
                'c3_hotline': c3_hotline,
                'c3_fear': c3_fear,
                'c3_status': c3_status,
                # Claim 4
                'c4_reintegrate': c4_reintegrate,
                'c4_allow_back': c4_allow_back,
                'c4_status': c4_status,
                # Claim 5
                'c5_agreement': c5_agreement,
                'c5_tough_q': c5_tough_q,
                'c5_status': c5_status,
                # Backward-compatible fields
                'prompt': c1_time or c2_diff or c3_hotline or c4_reintegrate or c5_agreement or 'Behavioral Diagnostic',
                'findings': c1_station or c2_assist or c3_fear or c4_allow_back or c5_tough_q or 'Audited',
                'status': primary_status,
                # Misinformation
                'rumor': get_col(row, 'Rumor, misinformation or question flagged'),
                'barrier': get_col(row, 'Local barrier identified'),
                'source': get_col(row, 'source of the rumor'),
                'risk_level': get_col(row, 'Estimated spread or risk level'),
                'tactical_adaptation': get_col(row, 'Recommended tactical adaptation'),
                'boys': 0, 'girls': 0, 'enrolment': 0, 'teachers': 0, 'games': 0
            })
            tool_counts['Ask 5'] = tool_counts.get('Ask 5', 0) + 1
            continue

        # --- 7. Tool 4: Most Significant Change Story Form ---
        if 'tool 4' in activity_type or 'significant change' in activity_type or 'msc' in activity_type:
            district = get_col(row, 'District') or 'Central'
            parish = get_col(row, 'Parish')
            setting = get_col(row, 'Setting type') or 'Community'
            baseline = get_col(row, 'Step 1: Baseline Situation (Before the Intervention)', 'Step 1: Baseline Situation')
            event = get_col(row, 'Step 2: The Event / Turning Point', 'Step 2: Turning Point Event')
            change = get_col(row, 'Step 3: The Concrete Change in Behavior or Norm', 'Step 3: Concrete Behavior Change')
            significance = get_col(row, 'Step 4: Why is this Change Significant?')
            participant = get_col(row, 'Participant name', 'Participant & Setting') or (f"{district} - {parish} ({setting})" if parish else f"{district} ({setting})")
            push_record({
                'id': row_id,
                'date': formatted_date,
                'tool': 'MSC Story',
                'district': district,
                'parish': parish,
                'coordinator': coordinator,
                'school': f"{district} - {parish}" if parish else district,
                'setting': setting,
                'participant': participant,
                'baseline': baseline or 'Baseline Situation',
                'event': event or 'Turning Point Event',
                'change': change or 'Concrete Behavior Change',
                'significance': significance or 'Significance',
                'rumor': get_col(row, 'Rumor, misinformation or question flagged'),
                'barrier': get_col(row, 'Local barrier identified'),
                'source': get_col(row, 'source of the rumor', 'Origin of rumor') or 'Community',
                'risk_level': get_col(row, 'Estimated spread or risk level'),
                'tactical_adaptation': get_col(row, 'Recommended tactical adaptation'),
                'boys': 0, 'girls': 0, 'enrolment': 0, 'teachers': 0, 'games': 0
            })
            tool_counts['MSC Story'] = tool_counts.get('MSC Story', 0) + 1
            continue

        # --- 8. Tool 5: Social Network & Influencer Mapping ---
        if 'tool 5' in activity_type or 'influencer' in activity_type or 'social network' in activity_type:
            district = get_col(row, 'District') or 'Central'
            parish = get_col(row, 'Parish')
            push_record({
                'id': row_id,
                'date': formatted_date,
                'tool': 'Influencer Mapping',
                'district': district,
                'parish': parish,
                'coordinator': coordinator,
                'school': f"{district} - {parish}",
                'sector': get_col(row, 'Social sector', 'Sector') or 'Community Sector',
                'influencer': get_col(row, 'Name of key influencer') or 'Influencer',
                'reach': get_col(row, 'Estimated audience reach') or 'Community',
                'boys': 0, 'girls': 0, 'enrolment': 0, 'teachers': 0, 'games': 0
            })
            tool_counts['Influencer Mapping'] = tool_counts.get('Influencer Mapping', 0) + 1
            continue

        # --- 9. Tool 6: Photovoice Participatory Documentation ---
        if 'tool 6' in activity_type or 'photovoice' in activity_type or 'photo' in activity_type:
            district = get_col(row, 'District') or 'Central'
            parish = get_col(row, 'Parish')
            push_record({
                'id': row_id,
                'date': formatted_date,
                'tool': 'Photovoice',
                'district': district,
                'parish': parish,
                'coordinator': coordinator,
                'school': f"{district} - {parish}",
                'theme': get_col(row, 'PHOTO Theme', 'Theme') or 'Hygiene Barrier',
                'caption': get_col(row, 'H — Happening: What is the background story or context here?') or 'PHOTO Observation',
                'boys': 0, 'girls': 0, 'enrolment': 0, 'teachers': 0, 'games': 0
            })
            tool_counts['Photovoice'] = tool_counts.get('Photovoice', 0) + 1
            continue

        # --- 10. Tool 10: School Simulation Drill ---
        if 'tool 10' in activity_type or 'simulation' in activity_type or 'drill' in activity_type:
            district = get_col(row, 'District') or 'Central'
            parish = get_col(row, 'Parish')
            s_name = get_col(row, 'Name of the school', 'School Name') or f"{district} - {parish}"
            push_record({
                'id': row_id,
                'date': formatted_date,
                'tool': 'Simulation Drill',
                'district': district,
                'parish': parish,
                'coordinator': coordinator,
                'school': s_name,
                'detection': get_col(row, 'No-Contact Detection') or 'Verified',
                'holding': get_col(row, 'Holding Area Setup') or 'Active',
                'time': parse_num(get_col(row, 'Time to Call (Mins)')),
                'handover': get_col(row, 'Handover & Debrief Status') or 'Completed',
                'boys': 0, 'girls': 0, 'enrolment': 0, 'teachers': 0, 'games': 0
            })
            tool_counts['Simulation Drill'] = tool_counts.get('Simulation Drill', 0) + 1
            continue

        # --- 11. Generic / Unclassified Field Activity Fallback ---
        # Guarantees that 100% of row entries in the Excel file are captured and never skipped
        district = get_col(row, 'District') or 'Central'
        parish = get_col(row, 'Parish')
        s_name = get_col(row, 'School Name', 'Name of the school') or f"{district} - {parish or 'Community'}"
        b = parse_num(get_col(row, 'Number of boys sensitised', 'total enrolment for boys'))
        g = parse_num(get_col(row, 'Number of girls sensitised', 'Totla enrolement for girls', 'Total enrolment for girls'))
        enr = parse_num(get_col(row, 'Total School enrolment Population'))
        t_male = parse_num(get_col(row, 'Male Gatekeepers Oriented', 'Total male teaching staff'))
        t_fem = parse_num(get_col(row, 'Female Gatekeepers Oriented', 'Total female teaching staff'))
        t_tot = parse_num(get_col(row, 'Number of Teachers/Patrons Present')) or (t_male + t_fem)
        c_male = parse_num(get_col(row, 'Estimated male Passersby / Community Crowd Engaged', 'Estimated male Passersby'))
        c_fem = parse_num(get_col(row, 'Estimated female Passersby / Community Crowd Engaged', 'Estimated female Passersby'))
        c_tot = parse_num(get_col(row, 'Estimated Passersby / Community Crowd Engaged')) or (c_male + c_fem)

        push_record({
            'id': row_id,
            'date': formatted_date,
            'tool': 'Field Record',
            'activity_type': activity_type or 'Field Activity',
            'district': district,
            'parish': parish,
            'coordinator': coordinator,
            'school': s_name,
            'boys': b,
            'girls': g,
            'enrolment': enr or (b + g),
            'teachers': t_tot,
            'male': t_male,
            'female': t_fem,
            'games': parse_num(get_col(row, 'Snakes & Ladders Board Games distributed')),
            'crowd_engaged': c_tot,
            'male_crowd': c_male,
            'female_crowd': c_fem,
            'crowd_male': c_male,
            'crowd_female': c_fem,
            'rumor': get_col(row, 'Rumor, misinformation or question flagged', 'Top misconception heard today'),
            'barrier': get_col(row, 'Local barrier identified'),
            'source': get_col(row, 'source of the rumor', 'Origin of rumor') or 'Community'
        })
        tool_counts['Field Record'] = tool_counts.get('Field Record', 0) + 1

    # Sanitize all record fields to remove any 'none', 'non', 'nil', etc.
    sanitized_records = []
    for i, r in enumerate(records):
        sanitized_r = {k: clean_val(v) for k, v in r.items()}
        # Ensure _index is an integer
        idx_val = sanitized_r.get('_index') or (i + 1)
        try:
            sanitized_r['_index'] = int(idx_val)
        except Exception:
            sanitized_r['_index'] = i + 1
        sanitized_r['index'] = sanitized_r['_index']
        sanitized_records.append(sanitized_r)

    # Sort strictly by _index to guarantee 1:1 match with Excel row order
    sanitized_records.sort(key=lambda r: r.get('_index', 0))

    return sanitized_records, tool_counts

def main():
    cli_arg = sys.argv[1] if len(sys.argv) > 1 else None
    excel_path = find_excel_file(cli_arg)
    
    if not excel_path:
        print("❌ Error: Could not locate Public_Health_Emergencies.xlsx.")
        print(f"Please specify the path, e.g.:\n  python3 update_dashboard.py '/path/to/Public_Health_Emergencies.xlsx'")
        sys.exit(1)

    json_path_dash = os.path.join(LOCAL_DIR, "dashboard_data.json")
    existing_indices = set()
    if os.path.exists(json_path_dash):
        try:
            with open(json_path_dash, "r", encoding="utf-8") as f:
                prev_data = json.load(f)
                if isinstance(prev_data, list):
                    existing_indices = {r.get('_index') for r in prev_data if r.get('_index') is not None}
        except Exception:
            pass
        
    records, tool_counts = parse_workbook(excel_path)

    # Cross-reference and match new entries by _index
    new_entries = [r for r in records if r.get('_index') not in existing_indices]
    if existing_indices and new_entries:
        new_indices = sorted([r['_index'] for r in new_entries])
        print("\n" + "=" * 60)
        print(f"✨ NEW ENTRIES DETECTED BY _index ({len(new_entries)} new row(s)):")
        print(f"   • New _index Range: #{new_indices[0]} to #{new_indices[-1]}")
        for ne in new_entries[:10]:
            print(f"     → [_index #{ne.get('_index')}] Tool: {ne.get('tool')}, District: {ne.get('district')}, Date: {ne.get('date')}")
        if len(new_entries) > 10:
            print(f"     → ... and {len(new_entries) - 10} more new entries.")
        print("=" * 60)
    elif existing_indices:
        print(f"\n✅ All {len(records)} entries matched existing records by _index.")
    else:
        print(f"\n✅ Baseline ingestion: {len(records)} records indexed by _index (1 to {len(records)}).")

    # Verify continuity of _index across all records
    all_indices = [r['_index'] for r in records]
    if all_indices:
        min_idx, max_idx = min(all_indices), max(all_indices)
        missing_indices = set(range(min_idx, max_idx + 1)) - set(all_indices)
        if missing_indices:
            print(f"⚠️ Warning: Detected missing _index numbers in sequence: {sorted(list(missing_indices))[:10]}")
        else:
            print(f"📋 Verified _index continuity: 100% of rows from #{min_idx} to #{max_idx} are present without gaps.")
    
    # Save dashboard_data.json
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
    # Calculate True Deduplicated School Reach (unique individuals)
    school_unique_reach = {}
    for r in records:
        if r.get('tool') == 'School Activity':
            s_name = clean_school_name(r.get('school') or '')
            if s_name and not s_name.lower().startswith('site') and not s_name.lower().startswith('gatekeeper'):
                b = r.get('boys', 0)
                g = r.get('girls', 0)
                tot = b + g
                enr = r.get('enrolment', 0)
                if not school_unique_reach.get(s_name) or tot > school_unique_reach[s_name]['total']:
                    school_unique_reach[s_name] = {'boys': b, 'girls': g, 'total': tot, 'enrolment': enr}
                elif enr > school_unique_reach[s_name]['enrolment']:
                    school_unique_reach[s_name]['enrolment'] = enr

    # Reconcile with PAT for full program target schools
    pat_unique = {}
    for r in records:
        if r.get('tool') == 'PAT Assessment':
            s_name = clean_school_name(r.get('school') or r.get('name') or '')
            enr = r.get('enrolment', 0)
            if s_name:
                if s_name not in pat_unique or enr > pat_unique[s_name]['enrolment']:
                    pat_unique[s_name] = {'enrolment': enr}

    all_target_schools = dict(school_unique_reach)
    for s_name, p_info in pat_unique.items():
        if s_name not in all_target_schools:
            all_target_schools[s_name] = {'boys': 0, 'girls': 0, 'total': 0, 'enrolment': p_info['enrolment']}
        elif p_info['enrolment'] > all_target_schools[s_name]['enrolment']:
            all_target_schools[s_name]['enrolment'] = p_info['enrolment']

    unique_boys = sum(v['boys'] for v in school_unique_reach.values())
    unique_girls = sum(v['girls'] for v in school_unique_reach.values())
    unique_learners = unique_boys + unique_girls
    total_contacts = sum(r.get('boys', 0) + r.get('girls', 0) for r in records if r.get('tool') == 'School Activity')
    total_target_schools_count = len(all_target_schools)
    total_enrolment = sum(v['enrolment'] for v in all_target_schools.values())

    total_teachers = sum(r.get('teachers', 0) for r in records)
    total_games = sum(r.get('games', 0) for r in records)
    total_crowd_male = sum(r.get('male_crowd', 0) for r in records)
    total_crowd_female = sum(r.get('female_crowd', 0) for r in records)
    total_crowd = sum(r.get('crowd_engaged', 0) for r in records)
    if total_crowd == 0 and (total_crowd_male + total_crowd_female > 0):
        total_crowd = total_crowd_male + total_crowd_female
    districts = set(r.get('district') for r in records if r.get('district'))
    
    print("\n" + "=" * 60)
    print("✅ DASHBOARD DATA UPDATED SUCCESSFULLY!")
    print("=" * 60)
    print(f"📊 Total Records Processed: {len(records)}")
    for t_name, count in tool_counts.items():
        print(f"   • {t_name}: {count} records")
    print("-" * 60)
    print(f"👥 Unique Learners Reached: {unique_learners:,} ({unique_boys:,} Boys | {unique_girls:,} Girls)")
    print(f"   • Total Enrolment Monitored: {total_enrolment:,} across {total_target_schools_count} unique schools (Coverage: {((unique_learners/total_enrolment)*100):.1f}%)")
    print(f"   • Cumulative Session Contacts Delivered: {total_contacts:,}")
    print(f"🎓 Gatekeepers & Teachers Oriented: {total_teachers:,}")
    print(f"📣 Community Events Crowd Reached: {total_crowd:,} ({total_crowd_male:,} Male | {total_crowd_female:,} Female)")
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

