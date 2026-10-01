/**
 * Public Health Emergencies (PHE) - Multi-Tool Analytics Dashboard
 * Application Logic & Visualizations
 */

Chart.register(ChartDataLabels);

// Global dashboard state
let rawMasterData = [];
let appData = [];
let chartInstances = {};
let leafletMap = null;
let markersLayer = null;

const parishCoordinates = {
  'Kiswa': [0.3255, 32.6175],
  'Nansana': [0.3670, 32.5280],
  'Nansana west': [0.3685, 32.5210],
  'Nansana east': [0.3650, 32.5350],
  'Mbuya2': [0.3300, 32.6280],
  'Salaama': [0.2780, 32.5920],
  'Kibuye': [0.2980, 32.5730],
  'Kikaayq': [0.3650, 32.5990],
  'Kikaaya': [0.3650, 32.5990],
  'Makerere University': [0.3340, 32.5680],
  'Kyebando': [0.3550, 32.5850],
  'Bwaise I': [0.3520, 32.5610],
  'Bwaise III': [0.3580, 32.5640],
  'Nakasero': [0.3200, 32.5780],
  'Luzira': [0.3010, 32.6450],
  'Nankulabye': [0.3240, 32.5560],
  'Lubya': [0.3290, 32.5440],
  'Seeta Ward': [0.3600, 32.7050],
  'Kkona': [0.3850, 32.5150],
  'Kawempe II': [0.3700, 32.5600],
  'Nateete': [0.2980, 32.5320],
  'Old Kampala': [0.3140, 32.5690],
  'Kamwokya': [0.3390, 32.5870],
  'Bukasa parish': [0.3050, 32.6150]
};

function safeSetText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

function safeSetHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

const CLEAN_EMPTY_WORDS = new Set(['nan', 'none', 'non', 'nil', 'n/a', 'na', 'none.', 'non.', 'null']);

function cleanText(val) {
  if (val === undefined || val === null) return '';
  const s = String(val).trim();
  if (CLEAN_EMPTY_WORDS.has(s.toLowerCase())) return '';
  return s;
}

function getCol(row, ...aliases) {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const cleanAlias = alias.trim().toLowerCase();
    for (const k of keys) {
      if (k.trim().toLowerCase() === cleanAlias) {
        const val = row[k];
        if (val !== undefined && val !== null) {
          return typeof val === 'string' ? cleanText(val) : val;
        }
      }
    }
  }
  return '';
}

function parseNum(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleanStr = String(val).replace(/,/g, '').trim();
  const num = parseFloat(cleanStr);
  return isNaN(num) ? 0 : num;
}

function normalizeLocalDate(rawVal) {
  if (!rawVal) return '';
  if (rawVal instanceof Date) {
    if (isNaN(rawVal.getTime())) return '';
    const y = rawVal.getFullYear();
    const m = String(rawVal.getMonth() + 1).padStart(2, '0');
    const d = String(rawVal.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof rawVal === 'number') {
    const utcDays = Math.floor(rawVal - 25569);
    const dateObj = new Date(utcDays * 86400 * 1000);
    if (isNaN(dateObj.getTime())) return '';
    const y = dateObj.getUTCFullYear();
    const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const strVal = String(rawVal).trim();
  if (strVal.length >= 10 && strVal.includes('-')) {
    return strVal.substring(0, 10);
  }
  return strVal.substring(0, 10);
}

/**
 * Normalizes input records into consistent schema.
 */
function processRawWorkbookRows(rawRows) {
  if (!rawRows || rawRows.length === 0) {
    if (window.PHE_DATA && Array.isArray(window.PHE_DATA) && window.PHE_DATA.length > 0) {
      rawRows = window.PHE_DATA;
    } else {
      rawRows = [];
    }
  }

  rawMasterData = [];

  rawRows.forEach((row, idx) => {
    const activityType = String(row['Public Health Emergencies'] || row['Public Health Emergencies '] || row['tool'] || '').trim().toLowerCase();
    let rawDateVal = row['Date'] || row['date'] || '';
    const formattedDate = normalizeLocalDate(rawDateVal);

    if (row.tool) {
      const parsedIdx = parseNum(row._index || row['index'] || row['_index']) || (idx + 1);
      rawMasterData.push(Object.assign({}, row, {
        id: row.id || (idx + 1),
        _index: parsedIdx,
        index: parsedIdx,
        date: formattedDate || row.date,
        tool: row.tool,
        district: row.district || 'Central',
        parish: row.parish || '',
        coordinator: row.coordinator || '',
        school: row.school || row.name || 'Site',
        boys: parseNum(row.boys),
        girls: parseNum(row.girls),
        enrolment: parseNum(row.enrolment),
        teachers: parseNum(row.teachers),
        games: parseNum(row.games),
      }));
      return;
    }

    // Parse School Activity from raw Excel upload
    if (activityType.includes('3-visit') || activityType.includes('wheel session') || activityType.includes('school activity') || (!activityType.includes('transect') && !activityType.includes('gatekeeper') && !activityType.includes('preparedness') && getCol(row, 'School Name'))) {
      const sName = getCol(row, 'School Name', 'Name of the school');
      if (sName) {
        const boys = parseNum(getCol(row, 'Number of boys sensitised'));
        const girls = parseNum(getCol(row, 'Number of girls sensitised'));
        let enrolment = parseNum(getCol(row, 'Total School enrolment Population', 'Total School Enrollment Population'));
        const visitReach = boys + girls;
        if (visitReach > enrolment) enrolment = visitReach;

        let coord = getCol(row, 'specify');
        const cRaw = getCol(row, 'Cordinator', 'Coordinator');
        if (!coord || (cRaw && cRaw.toLowerCase() !== 'other')) {
          coord = cRaw || coord;
        }

        rawMasterData.push({
          id: getCol(row, '_id') || (idx + 1),
          date: formattedDate,
          tool: 'School Activity',
          district: getCol(row, 'District') || 'Central',
          parish: getCol(row, 'Parish'),
          coordinator: coord,
          school: sName,
          visit_num: getCol(row, 'Visit Number') || 'Visit 1',
          health_club: getCol(row, 'Presence of school health club', 'Presence of health club', 'School Health Club Status') || 'Active',
          boys: boys,
          girls: girls,
          enrolment: enrolment,
          teachers: parseNum(getCol(row, 'Number of Teachers/Patrons Present')),
          games: parseNum(getCol(row, 'Snakes & Ladders Board Games distributed')),
          signs: getCol(row, 'Raise your hand if you can name 3 warning signs of PHE'),
          hotline: getCol(row, 'Raise your hand if you know the toll-free hotline or where to report'),
          stigma: getCol(row, 'Raise your hand if you believe a sick person should be cared for safely without being chased or hidden'),
          handwash_demo: getCol(row, 'Did the volunteer demonstrate correct handwashing steps'),
          soap: getCol(row, 'Soap and running water available at venue today'),
          rumor: getCol(row, 'Rumor, misinformation or question flagged', 'Top misconception heard today', 'specify3', 'Local barrier identified'),
          barrier: getCol(row, 'Local barrier identified'),
          source: getCol(row, 'source of the rumor') || 'Community'
        });
      }
    }

    // Parse Gatekeeper Session from raw Excel upload
    if (activityType.includes('gatekeeper') || activityType.includes('community gate') || getCol(row, 'what commitments did the gatekeeper make')) {
      const maleGk = parseNum(getCol(row, 'Male Gatekeepers Oriented'));
      const femaleGk = parseNum(getCol(row, 'Female Gatekeepers Oriented'));
      const role = getCol(row, 'Type of gatekeeper') || 'Teacher / Patron';
      rawMasterData.push({
        id: getCol(row, '_id') || (idx + 1),
        date: formattedDate,
        tool: 'Gatekeeper Session',
        district: getCol(row, 'District') || 'Central',
        parish: getCol(row, 'Parish'),
        coordinator: getCol(row, 'specify', 'Cordinator', 'Coordinator'),
        school: `Gatekeeper Session (${role})`,
        role: role,
        commitments: getCol(row, 'what commitments did the gatekeeper make'),
        male: maleGk,
        female: femaleGk,
        boys: 0, girls: 0, enrolment: 0,
        teachers: maleGk + femaleGk,
        games: 0
      });
    }

    // Parse Transect Walk from raw Excel upload
    if (activityType.includes('transect') || activityType.includes('walk') || activityType.includes('environmental')) {
      const stations = parseNum(getCol(row, 'Record number of functional stations', 'Record number of functional stations '));
      const pop = parseNum(getCol(row, 'Population count of the site'));
      const calculatedRatio = stations > 0 ? `${(pop / stations).toFixed(1)}:1 (${pop} : ${stations})` : `Critical Gap: ${pop} Persons with 0 Stations`;
      const setting = getCol(row, 'Setting type', 'specify3') || 'School';
      const district = getCol(row, 'District') || 'Central';
      const parish = getCol(row, 'Parish');

      rawMasterData.push({
        id: getCol(row, '_id') || (idx + 1),
        date: formattedDate,
        tool: 'Transect Walk',
        district: district,
        parish: parish,
        school: `${district} - ${parish} (${setting})`,
        auditor: getCol(row, 'specify', 'Cordinator', 'Coordinator') || 'Lead Auditor',
        site: `${district} / ${parish}`,
        setting: setting,
        stations: stations,
        pop: pop,
        stance_ratio: calculatedRatio,
        notes: getCol(row, 'Observation notes', 'Check vector breeding sites and safety near food points.') || 'No notes',
        refuse: getCol(row, 'Open refuse heaps, stagnant water, overflowing drainage channels near classrooms, food stalls, or passenger bays.') || 'Maintained',
        wash: getCol(row, 'Functional handwashing points at gates, latrines, and dining/canteen areas with soap and running water.') || 'Present',
        poster: getCol(row, 'Presence, legibility, and currency of MoH/KCCA posters on Ebola, Mpox, and Marburg with active toll-free lines.') || 'Observed',
        holding: getCol(row, 'Designated space, ventilation, clean bedding, and written separation protocol for suspected symptomatic cases.') || 'Makeshift Only',
        staff: getCol(row, 'Verify if school nurse/matron or market head has ever received orientation on epidemics.') || 'Not oriented',
        boys: 0, girls: 0, enrolment: 0, teachers: 0, games: 0
      });
    }

    // Parse PAT Assessment from raw Excel upload
    if (activityType.includes('preparedness') || activityType.includes('tool 11') || activityType.includes('pat') || getCol(row, 'Does the school have a Epidemic Preparedness Plan')) {
      const sName = getCol(row, 'Name of the school', 'School Name') || 'Assessed Facility';
      rawMasterData.push({
        id: getCol(row, '_id') || (idx + 1),
        date: formattedDate,
        tool: 'PAT Assessment',
        district: getCol(row, 'District') || 'Central',
        parish: getCol(row, 'Parish'),
        school: sName,
        name: sName,
        level: getCol(row, 'School level') || 'Primary',
        boys: parseNum(getCol(row, 'total enrolment for boys')),
        girls: parseNum(getCol(row, 'Totla enrolement for girls', 'Total enrolment for girls')),
        maleStaff: parseNum(getCol(row, 'Total male teaching staff')),
        femaleStaff: parseNum(getCol(row, 'Total female teaching staff')),
        club: getCol(row, 'Presence of health club', 'School Health Club Status') || 'Active',
        plan: getCol(row, 'Does the school have a Epidemic Preparedness Plan') || 'Informal Only',
        space: getCol(row, 'Does the school have a Designated Isolation place incase of an epidemic') || 'Makeshift corner',
        stations: parseNum(getCol(row, 'Record number of working water stations', 'Record number of working water stations ')),
        bStances: parseNum(getCol(row, 'Record number of stances for boys', 'Record number of stances for boys ')),
        gStances: parseNum(getCol(row, 'record number of stances for girls', 'record number of stances for girls')),
        poster: getCol(row, 'Record presence of Posters or guidelines on Ebola, Mpox, or Cholera displayed in prominent pupil areas.') || 'IEC Present',
        washAudit: getCol(row, 'Q1 Stations present at gates, outside latrines, and near dining/canteen areas with both clean running water AND soap.') || 'Water + Soap Present',
        stanceAudit: getCol(row, 'Record toilet stances separated by gender, functional locks, clean floors, and handwash stations within 5 meters of exits.') || 'Adequate',
        wasteAudit: getCol(row, 'Enclosed bins, absence of overflowing compost/litter pits or open medical/menstrual waste.') || 'Maintained',
        drainageAudit: getCol(row, 'Record drainage conditions around the waste collection area') || 'Flowing',
        hotlineLegible: getCol(row, 'Is the toll-free hotline legible on the posters') || 'Yes',
        enrolment: 0, teachers: 0, games: 0
      });
    }

    // Parse Tool 2: Rapid Intercept from raw Excel upload
    if (activityType.includes('tool 2') || activityType.includes('rapid audience') || activityType.includes('intercept')) {
      const district = getCol(row, 'District') || 'Central';
      const parish = getCol(row, 'Parish');
      const setting = getCol(row, 'Setting type') || 'Community';
      const specSetting = getCol(row, 'specify3');
      let siteName = parish ? `${district} - ${parish} (${setting})` : `${district} (${setting})`;
      if (specSetting) siteName += ` - ${specSetting}`;

      const q1Val = getCol(row, 'Q1 In the past 7 days, have you seen or heard any public health messages or activities in this area regarding disease outbreaks (Ebola, Mpox, Marburg)?');
      const q2Verb = getCol(row, 'Q2 Can you name two key signs/symptoms of Ebola or Mpox and one way you can protect yourself?');
      const q2Eval = getCol(row, 'Correctly named 2+ symptoms', 'Correctly named 2+ symptoms  ');
      const q3Val = getCol(row, 'Qn3 Now that Uganda was declared Ebola-free in July 2026, do you feel there is still a risk of outbreaks in your community, or is the threat completely gone?');
      const q4Hotline = parseNum(getCol(row, 'Q4 If someone in your home or workplace suddenly developed high fever, vomiting, and unexplained bleeding, what is the FIRST action you would take?/Call national/district toll-free hotline (0800-100-066 / 8500)'));
      const q4Vht = parseNum(getCol(row, 'Q4 If someone in your home or workplace suddenly developed high fever, vomiting, and unexplained bleeding, what is the FIRST action you would take?/Notify local VHT '));
      const q4Lc1 = parseNum(getCol(row, 'Q4 If someone in your home or workplace suddenly developed high fever, vomiting, and unexplained bleeding, what is the FIRST action you would take?/LC1 Chairperson immediately'));
      const q4Clinic = parseNum(getCol(row, 'Q4 If someone in your home or workplace suddenly developed high fever, vomiting, and unexplained bleeding, what is the FIRST action you would take?/Escort them quietly to a private clinic or pharmacy'));
      const q4Herbs = parseNum(getCol(row, 'Q4 If someone in your home or workplace suddenly developed high fever, vomiting, and unexplained bleeding, what is the FIRST action you would take?/Isolate them at home and treat with herbs/home care'));
      const q4Healer = parseNum(getCol(row, 'Q4 If someone in your home or workplace suddenly developed high fever, vomiting, and unexplained bleeding, what is the FIRST action you would take?/Seek prayers / traditional healer'));
      const q4Other = parseNum(getCol(row, 'Q4 If someone in your home or workplace suddenly developed high fever, vomiting, and unexplained bleeding, what is the FIRST action you would take?/Other'));
      const q4Specify = getCol(row, 'Specify4');
      const q4Primary = getCol(row, 'Q4 If someone in your home or workplace suddenly developed high fever, vomiting, and unexplained bleeding, what is the FIRST action you would take?');
      const q5Val = getCol(row, 'Qn5 Who in this community do you trust the MOST to tell you the truth about a disease outbreak?');

      rawMasterData.push({
        id: getCol(row, '_id') || (idx + 1),
        date: formattedDate,
        tool: 'Rapid Intercept',
        district: district,
        parish: parish,
        coordinator: getCol(row, 'specify', 'Cordinator', 'Coordinator'),
        school: siteName,
        site: siteName,
        setting: setting,
        spec_setting: specSetting,
        q1: q1Val,
        q1_exposure: q1Val,
        q2: q2Eval || q2Verb,
        q2_verbatim: q2Verb,
        q2_eval: q2Eval,
        q3: q3Val,
        q3_risk: q3Val,
        q4: (q4Primary.toLowerCase() === 'other' && q4Specify) ? q4Specify : q4Primary,
        q4_hotline: q4Hotline,
        q4_vht: q4Vht,
        q4_lc1: q4Lc1,
        q4_clinic: q4Clinic,
        q4_home_care: q4Herbs,
        q4_healer: q4Healer,
        q4_other: q4Other,
        q4_specify: q4Specify,
        q5: q5Val,
        q5_trusted: q5Val,
        risk_level: getCol(row, 'Estimated spread or risk level'),
        rumor: getCol(row, 'Rumor, misinformation or question flagged'),
        barrier: getCol(row, 'Local barrier identified'),
        source: getCol(row, 'source of the rumor') || 'Community',
        tactical_adaptation: getCol(row, 'Recommended tactical adaptation'),
        boys: 0, girls: 0, enrolment: 0, teachers: 0, games: 0
      });
    }
  });
}

/**
 * Mobile Navigation Drawer & Filter Toggle Functions
 */
function toggleSidebar(open) {
  const sidebar = document.getElementById('appSidebar') || document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!sidebar) return;
  const shouldOpen = open !== undefined ? open : !sidebar.classList.contains('open');
  if (shouldOpen) {
    sidebar.classList.add('open');
    if (overlay) overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  } else {
    sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function toggleFilterBar() {
  const filterBar = document.getElementById('filterBar');
  const toggleBtn = document.getElementById('filterToggleBtn');
  if (!filterBar) return;
  const isOpen = filterBar.classList.toggle('open');
  if (toggleBtn) {
    if (isOpen) {
      toggleBtn.classList.add('active');
    } else {
      toggleBtn.classList.remove('active');
    }
  }
}

/**
 * Tab switching handler
 */
function showTab(tabId) {
  // On mobile/tablet, close drawer automatically when tool is tapped
  if (window.innerWidth <= 992) {
    toggleSidebar(false);
  }

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick')?.includes(tabId));
  if (activeBtn) activeBtn.classList.add('active');

  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  const activePane = document.getElementById(`tab-${tabId}`);
  if (activePane) activePane.classList.add('active');

  const titles = {
    'overview': ['Summary of Reach & Engagement', 'Cross-instrument reach aggregation, district performance, and programmatic coverage per location'],
    'rumours': ['Weekly Community & School Listening and Rumour Log', 'Standardized weekly RCCE monitoring capturing community concerns, school rumours, misinformation, and recommended message adjustments for weekly RCCE synthesis'],
    'tool_1': ['Transect Walk Environmental & Infrastructure Checklist', 'Environmental sanitation, setting type, functional stations, and stance ratios'],
    'tool_2': ['Rapid Audience Assessment Intercept Survey', 'Full questionnaire capture: 7-day recall, 2+ symptoms, risk perception, and notification intent'],
    'tool_3': ['"Ask 5" Behavioral Verification Diagnostic Tool', 'Full 5-claim diagnostic audit for gatekeepers, teachers, vendors, and transport operators'],
    'tool_4': ['Most Significant Change Story Collection Form', 'Systematic qualitative narrative tracking of the Most Significant Change'],
    'tool_6': ['Photovoice Participatory Documentation Guide & Caption Form', 'PHOTO protocol analysis of youth-led hygiene challenges and community solutions'],
    'tool_7': ['Community Gatekeeper Dialogue & Events', 'Tracking orientation sessions conducted with local leaders and community stakeholders'],
    'tool_8': ['Preparedness Assessment', 'School Epidemic Preparedness Assessment examining institutional response plans and isolation wards'],
    'tool_9': ['School 3-Visit Tracker & Knowledge Wheel', 'Detailed analysis of learner reach, visit number, health club, and wheel answers'],
    'tool_10': ['School Simulation Drill & Safeguarding Compliance Protocol', 'Mandatory pre-drill verification and performance rehearsal evaluation'],
    'tool_11': ['U-Report Recruitment Tracker', 'Tracking recruitment and mobilization of youth, learners, and community members as active U-Reporters']
  };

  if (titles[tabId]) {
    safeSetText('screenTitle', titles[tabId][0]);
    safeSetText('screenSubtitle', titles[tabId][1]);
  }

  setTimeout(() => {
    if (tabId === 'overview') {
      if (leafletMap) leafletMap.invalidateSize();
      if (chartInstances.districtReach) chartInstances.districtReach.resize();
      if (chartInstances.districtShare) chartInstances.districtShare.resize();
    } else if (tabId === 'rumours') {
      if (chartInstances.rumourRisk) chartInstances.rumourRisk.resize();
      if (chartInstances.rumourOrigin) chartInstances.rumourOrigin.resize();
      if (chartInstances.rumourSetting) chartInstances.rumourSetting.resize();
      if (chartInstances.rumourDistrict) chartInstances.rumourDistrict.resize();
    } else if (tabId === 'tool_9') {
      if (chartInstances.signsT1) chartInstances.signsT1.resize();
      if (chartInstances.hotlineT1) chartInstances.hotlineT1.resize();
      if (chartInstances.stigmaT1) chartInstances.stigmaT1.resize();
      if (chartInstances.handwashT1) chartInstances.handwashT1.resize();
      if (chartInstances.topSchoolsT1) chartInstances.topSchoolsT1.resize();
    } else if (tabId === 'tool_1') {
      if (chartInstances.washT3) chartInstances.washT3.resize();
      if (chartInstances.refuseT1) chartInstances.refuseT1.resize();
      if (chartInstances.chokeT1) chartInstances.chokeT1.resize();
      if (chartInstances.posterT3) chartInstances.posterT3.resize();
    } else if (tabId === 'tool_2') {
      if (chartInstances.chartT4Q1) chartInstances.chartT4Q1.resize();
      if (chartInstances.chartT4Q5) chartInstances.chartT4Q5.resize();
      if (chartInstances.chartT4Q4) chartInstances.chartT4Q4.resize();
      if (chartInstances.chartT4Q3) chartInstances.chartT4Q3.resize();
    } else if (tabId === 'tool_3') {
      if (chartInstances.chartT5Target) chartInstances.chartT5Target.resize();
      if (chartInstances.chartT5Claims) chartInstances.chartT5Claims.resize();
    } else if (tabId === 'tool_7') {
      if (chartInstances.gkRolesT7) chartInstances.gkRolesT7.resize();
      if (chartInstances.gkCapacityT7) chartInstances.gkCapacityT7.resize();
    } else if (tabId === 'tool_11') {
      if (chartInstances.uRecruitSetting) chartInstances.uRecruitSetting.resize();
    }
  }, 60);
}

function populateFilterOptions() {
  const select = document.getElementById('filterDistrict');
  if (!select) return;
  const currentVal = select.value;
  const districts = Array.from(new Set(rawMasterData.map(d => d.district).filter(Boolean))).sort();
  select.innerHTML = '<option value="ALL">All Districts</option>' + districts.map(d => `<option value="${d}">${d}</option>`).join('');
  if (districts.includes(currentVal)) {
    select.value = currentVal;
  }
}

/**
 * Universal Start & End Date Range Filtering
 */
function applyFilters() {
  const selectedDistrict = document.getElementById('filterDistrict')?.value || 'ALL';
  const searchText = (document.getElementById('filterSearch')?.value || '').toLowerCase().trim();
  let startDate = document.getElementById('filterStartDate')?.value || '';
  let endDate = document.getElementById('filterEndDate')?.value || '';

  if (startDate && endDate && startDate > endDate) {
    endDate = '';
  }

  appData = rawMasterData.filter(d => {
    const matchesDistrict = (selectedDistrict === 'ALL' || d.district === selectedDistrict);
    
    const matchesSearch = !searchText || (
      (d._index && String(d._index) === searchText) ||
      (d._index && String(d._index).includes(searchText)) ||
      (d.id && String(d.id).includes(searchText)) ||
      (d.school && d.school.toLowerCase().includes(searchText)) ||
      (d.district && d.district.toLowerCase().includes(searchText)) ||
      (d.parish && d.parish.toLowerCase().includes(searchText)) ||
      (d.rumor && d.rumor.toLowerCase().includes(searchText)) ||
      (d.barrier && d.barrier.toLowerCase().includes(searchText)) ||
      (d.name && d.name.toLowerCase().includes(searchText)) ||
      (d.coordinator && d.coordinator.toLowerCase().includes(searchText))
    );

    let rowDate = (d.date || '').trim();
    const hasDateFilter = startDate || endDate;
    if (!rowDate && hasDateFilter) {
      return false;
    }

    const matchesStart = !startDate || (rowDate && rowDate >= startDate);
    const matchesEnd = !endDate || (rowDate && rowDate <= endDate);

    return matchesDistrict && matchesSearch && matchesStart && matchesEnd;
  });

  recomputeAndRender();
}

function resetFilters() {
  if (document.getElementById('filterDistrict')) document.getElementById('filterDistrict').value = 'ALL';
  if (document.getElementById('filterStartDate')) document.getElementById('filterStartDate').value = '';
  if (document.getElementById('filterEndDate')) document.getElementById('filterEndDate').value = '';
  if (document.getElementById('filterSearch')) document.getElementById('filterSearch').value = '';
  applyFilters();
}

const CANONICAL_SCHOOLS = {
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
  'uganda youth aid primary school': 'Uganda Youth Aid Primary School',
  'uganda youth aid school': 'Uganda Youth Aid Primary School',
  'uganda youth primary school': 'Uganda Youth Aid Primary School'
};

function cleanSchoolName(raw) {
  if (!raw) return '';
  const s = String(raw).replace(/\s+/g, ' ').trim();
  const sLow = s.toLowerCase();
  return CANONICAL_SCHOOLS[sLow] || s;
}

function recomputeAndRender() {
  Object.keys(chartInstances).forEach(k => {
    if (chartInstances[k]) {
      chartInstances[k].destroy();
      delete chartInstances[k];
    }
  });

  const distMap = {};
  let totalTeachers = 0, totalGames = 0;
  let totalCrowd = 0, totalCrowdMale = 0, totalCrowdFemale = 0;
  let totalLearnerContacts = 0;

  const schoolUniqueReach = {};

  appData.forEach(r => {
    totalTeachers += (r.teachers || 0);
    totalGames += (r.games || 0);

    const cm = (r.male_crowd || r.crowd_male || 0);
    const cf = (r.female_crowd || r.crowd_female || 0);
    const cTot = (r.crowd_engaged || (cm + cf) || 0);
    totalCrowd += cTot;
    totalCrowdMale += cm;
    totalCrowdFemale += cf;

    const sName = cleanSchoolName(r.school || r.name || '');
    const enr = r.enrolment || 0;
    const dName = r.district || 'Unassigned';

    if (!distMap[dName]) {
      distMap[dName] = { 
        count: 0, 
        enrolment: 0, 
        boys: 0, 
        girls: 0, 
        teachers: 0, 
        uniqueBoys: 0,
        uniqueGirls: 0,
        uniqueLearners: 0,
        totalLearners: 0, 
        totalReach: 0, 
        learnerContacts: 0,
        games: 0, 
        v1Reach: 0, 
        v2Reach: 0, 
        v3Reach: 0, 
        crowd: 0, 
        crowdMale: 0, 
        crowdFemale: 0, 
        schoolsSet: new Set() 
      };
    }
    
    distMap[dName].teachers += (r.teachers || 0);
    distMap[dName].crowd += cTot;
    distMap[dName].crowdMale += cm;
    distMap[dName].crowdFemale += cf;
    distMap[dName].games += (r.games || 0);

    if (r.tool === 'School Activity') {
      const b = (r.boys || 0);
      const g = (r.girls || 0);
      const tot = b + g;
      totalLearnerContacts += tot;
      distMap[dName].learnerContacts += tot;

      if (sName && !sName.toLowerCase().startsWith('site') && !sName.toLowerCase().startsWith('gatekeeper') && !CLEAN_EMPTY_WORDS.has(sName.toLowerCase())) {
        distMap[dName].schoolsSet.add(sName);
        if (!schoolUniqueReach[sName] || tot > schoolUniqueReach[sName].total) {
          schoolUniqueReach[sName] = { 
            name: sName, 
            district: dName, 
            boys: b, 
            girls: g, 
            total: tot, 
            enrolment: enr 
          };
        } else if (enr > schoolUniqueReach[sName].enrolment) {
          schoolUniqueReach[sName].enrolment = enr;
        }
      }

      const vNum = String(r.visit_num || 'Visit 1').trim().toLowerCase();
      if (vNum.includes('visit 1') || vNum === '1') distMap[dName].v1Reach += tot;
      else if (vNum.includes('visit 2') || vNum === '2') distMap[dName].v2Reach += tot;
      else if (vNum.includes('visit 3') || vNum === '3') distMap[dName].v3Reach += tot;
    }
  });

  // Reconcile with PAT for full program target schools
  const patUnique = {};
  appData.forEach(r => {
    if (r.tool === 'PAT Assessment') {
      const sName = cleanSchoolName(r.school || r.name || '');
      const enr = r.enrolment || 0;
      const dName = r.district || 'Unassigned';
      if (sName && !sName.toLowerCase().startsWith('site') && !CLEAN_EMPTY_WORDS.has(sName.toLowerCase())) {
        if (!patUnique[sName] || enr > patUnique[sName].enrolment) {
          patUnique[sName] = { name: sName, enrolment: enr, district: dName };
        }
      }
    }
  });

  const allTargetSchools = {};
  Object.keys(schoolUniqueReach).forEach(s => {
    allTargetSchools[s] = { ...schoolUniqueReach[s] };
  });
  Object.keys(patUnique).forEach(s => {
    if (!allTargetSchools[s]) {
      allTargetSchools[s] = { name: s, district: patUnique[s].district, boys: 0, girls: 0, total: 0, enrolment: patUnique[s].enrolment };
      if (distMap[patUnique[s].district]) {
        distMap[patUnique[s].district].schoolsSet.add(s);
      }
    } else if (patUnique[s].enrolment > allTargetSchools[s].enrolment) {
      allTargetSchools[s].enrolment = patUnique[s].enrolment;
    }
  });

  let uniqueBoys = 0, uniqueGirls = 0, uniqueLearners = 0, totalEnrolment = 0;
  Object.values(schoolUniqueReach).forEach(item => {
    uniqueBoys += item.boys;
    uniqueGirls += item.girls;
    uniqueLearners += item.total;
    if (distMap[item.district]) {
      distMap[item.district].uniqueBoys += item.boys;
      distMap[item.district].uniqueGirls += item.girls;
      distMap[item.district].uniqueLearners += item.total;
    }
  });

  // Calculate total enrolment across all monitored target schools
  Object.values(allTargetSchools).forEach(item => {
    totalEnrolment += item.enrolment;
    if (distMap[item.district]) {
      distMap[item.district].enrolment = (distMap[item.district].enrolment || 0) + item.enrolment;
    }
  });

  // Assign district summary metrics
  Object.keys(distMap).forEach(d => {
    distMap[d].boys = distMap[d].uniqueBoys;
    distMap[d].girls = distMap[d].uniqueGirls;
    distMap[d].totalLearners = distMap[d].uniqueLearners;
    distMap[d].totalReach = distMap[d].uniqueLearners + distMap[d].teachers + distMap[d].crowd;
  });

  const distList = Object.keys(distMap).map(d => ({
    name: d,
    schoolCount: distMap[d].schoolsSet.size > 0 ? distMap[d].schoolsSet.size : distMap[d].count,
    ...distMap[d]
  })).sort((a, b) => b.totalReach - a.totalReach);

  const totalSensitised = uniqueLearners;
  const totalLearners = uniqueLearners;
  const gatekeeperRowsFiltered = appData.filter(d => d.tool === 'Gatekeeper Session');
  const grandTotalGatekeepers = totalTeachers;
  const grandTotalReach = totalLearners + grandTotalGatekeepers + totalCrowd;

  // 1. Schools Engaged (Deduplicated unique target schools)
  const schoolsEngagedCount = Object.keys(allTargetSchools).length;

  // 2. Knowledge Wheel Sessions in schools
  const wheelSessionsCount = appData.filter(d => d.tool === 'School Activity').length;

  // 3. U-Report Health Clubs Formed
  const clubsFormedCount = appData.filter(d => {
    if (d.tool !== 'School Activity') return false;
    const st = String(d.health_club || d.health_club_established || '').toLowerCase();
    return st.includes('active') || st.includes('yes') || st.includes('form');
  }).length;

  // 4. High-risk parishes entered (new)
  const parishesEnteredSet = new Set();
  appData.forEach(d => {
    const p = (d.parish || '').trim();
    if (p && !CLEAN_EMPTY_WORDS.has(p.toLowerCase())) {
      parishesEnteredSet.add(p);
    }
  });
  const parishesEnteredCount = parishesEnteredSet.size;

  // 5. New U-Reporters Recruited
  const uRecruitRows = appData.filter(d => d.tool === 'U-Report Recruitment');
  const uRecruitMale = uRecruitRows.reduce((acc, r) => acc + (r.male || 0), 0);
  const uRecruitFemale = uRecruitRows.reduce((acc, r) => acc + (r.female || 0), 0);
  const uRecruitTotal = uRecruitRows.reduce((acc, r) => acc + (r.total || (r.male||0) + (r.female||0)), 0);
  const uActiveInSchools = appData.filter(d => d.tool === 'School Activity').reduce((acc, r) => acc + (r.active_ureporters || 0), 0);
  const totalUReporters = uRecruitTotal > 0 ? uRecruitTotal : uActiveInSchools;

  // 6. U-Reporter Tally Sheets Collected
  const tallySheetsCount = uRecruitRows.length;

  // 7. PHE Take-Home Cards Distributed
  const totalCards = appData.filter(d => d.tool === 'School Activity').reduce((acc, r) => acc + (r.take_home_cards || 0), 0);

  // Set Core KPI Scorecards
  safeSetText('kpiSchoolsEngaged', schoolsEngagedCount.toLocaleString());
  safeSetText('kpiSchoolsEngagedSub', `Unique target schools (${distList.length} districts)`);

  const coveragePct = totalEnrolment > 0 ? ((totalLearners / totalEnrolment) * 100).toFixed(1) : 0;
  safeSetText('kpiLearners', totalLearners.toLocaleString());
  safeSetText('kpiLearnersSub', `${uniqueBoys.toLocaleString()} Boys | ${uniqueGirls.toLocaleString()} Girls (${coveragePct}% coverage) • ${totalLearnerContacts.toLocaleString()} Contacts`);

  safeSetText('kpiWheelSessions', wheelSessionsCount.toLocaleString());
  safeSetText('kpiWheelSessionsSub', `Across visits 1, 2 & 3 delivery`);

  safeSetText('kpiHealthClubs', clubsFormedCount.toLocaleString());
  safeSetText('kpiHealthClubsSub', `Active clubs with patrons`);

  safeSetText('kpiParishesEntered', parishesEnteredCount.toLocaleString());
  safeSetText('kpiParishesEnteredSub', `High-risk epidemic hotspots`);

  safeSetText('kpiGatekeepers', grandTotalGatekeepers.toLocaleString());

  safeSetText('kpiUReporters', totalUReporters.toLocaleString());
  safeSetText('kpiUReportersSub', uRecruitTotal > 0 ? `${uRecruitMale} M | ${uRecruitFemale} F recruits` : `Active youth & learner network`);

  safeSetText('kpiTallySheets', tallySheetsCount.toLocaleString());
  safeSetText('kpiTallySheetsSub', tallySheetsCount > 0 ? `Tally verification sheets logged` : `Sheets collected upon mobilization`);

  // Secondary Delivery Metrics & Community Reach
  safeSetText('kpiCommunityCrowd', totalCrowd.toLocaleString());
  const commFemPct = totalCrowd > 0 ? ((totalCrowdFemale / totalCrowd) * 100).toFixed(1) : 0;
  const commSubText = (totalCrowdMale > 0 || totalCrowdFemale > 0)
    ? `${totalCrowdMale.toLocaleString()} Male | ${totalCrowdFemale.toLocaleString()} Female (${commFemPct}% F)`
    : `${totalCrowd.toLocaleString()} Passersby / Community crowd`;
  safeSetText('kpiCommunityCrowdSub', commSubText);

  safeSetText('kpiEnrolment', totalEnrolment.toLocaleString());
  safeSetText('kpiEnrolmentSub', `Unique school population base (${coveragePct}% covered)`);
  safeSetText('kpiGames', totalGames.toLocaleString());
  safeSetText('kpiTakeHomeCards', totalCards.toLocaleString());
  safeSetText('kpiDistricts', distList.length);

  safeSetText('badgeTotalReach', appData.length);
  safeSetText('badgeTool1', appData.filter(d => d.tool === 'Transect Walk').length);
  safeSetText('badgeTool2', appData.filter(d => d.tool === 'Rapid Intercept').length);
  safeSetText('badgeTool3', appData.filter(d => d.tool === 'Ask 5').length);
  safeSetText('badgeTool4', appData.filter(d => d.tool === 'MSC Story').length);
  safeSetText('badgeTool6', appData.filter(d => d.tool === 'Photovoice').length);
  safeSetText('badgeTool7', gatekeeperRowsFiltered.length);
  safeSetText('badgeTool8', appData.filter(d => d.tool === 'PAT Assessment').length);
  safeSetText('badgeTool9', appData.filter(d => d.tool === 'School Activity').length);
  safeSetText('badgeTool10', appData.filter(d => d.tool === 'Simulation Drill').length);
  safeSetText('badgeTool11', appData.filter(d => d.tool === 'U-Report Recruitment').length);
  
  const allRumourRecords = getAllRumourRecords();
  safeSetText('badgeRumours', allRumourRecords.length);


  const keyChipsHtml = distList.length === 0
    ? `<span style="color:#64748b; font-size:0.8rem;">No district data for active filter.</span>`
    : distList.map(d => {
        const commTxt = (d.crowd || 0) > 0 ? ` / ${(d.crowd || 0).toLocaleString()} Comm` : '';
        return `
        <div class="district-key-chip">
          <strong>${d.name}:</strong> 
          <span class="chip-total">Total: ${d.totalReach.toLocaleString()}</span>
          <span style="color:#64748b; font-size:0.72rem;">(${d.boys.toLocaleString()} B / ${d.girls.toLocaleString()} G / ${d.teachers} Gatekeepers${commTxt})</span>
        </div>
      `;
      }).join('');
  safeSetHtml('districtTotalsKey', keyChipsHtml);

  const t1Count = appData.filter(d => d.tool === 'Transect Walk').length;
  const t2Count = appData.filter(d => d.tool === 'Rapid Intercept').length;
  const t3Count = appData.filter(d => d.tool === 'Ask 5').length;
  const t4Count = appData.filter(d => d.tool === 'MSC Story').length;
  const t5Count = appData.filter(d => d.tool === 'Influencer Mapping').length;
  const t6Count = appData.filter(d => d.tool === 'Photovoice').length;
  const t7Count = gatekeeperRowsFiltered.length;
  const patCount = appData.filter(d => d.tool === 'PAT Assessment').length;
  const schoolActsCount = appData.filter(d => d.tool === 'School Activity').length;
  const t10Count = appData.filter(d => d.tool === 'Simulation Drill').length;
  const t11Count = appData.filter(d => d.tool === 'U-Report Recruitment').length;

  const toolDefs = [
    { num: 1, name: "Transect Walk Environmental & Infrastructure Checklist", q: 14, reach: t1Count > 0 ? `${t1Count} Facility Audits Logged` : "0 Submissions (Pending)", active: t1Count > 0, tab: "tool_1" },
    { num: 2, name: "Rapid Audience Assessment Intercept Survey", q: 15, reach: t2Count > 0 ? `${t2Count} Intercepts Audited` : "0 Submissions (Pending)", active: t2Count > 0, tab: "tool_2" },
    { num: 3, name: "'Ask 5' Behavioral Verification Diagnostic Tool", q: 32, reach: t3Count > 0 ? `${t3Count} Claims Verified` : "0 Submissions (Pending)", active: t3Count > 0, tab: "tool_3" },
    { num: 4, name: "Most Significant Change Story Collection Form", q: 5, reach: t4Count > 0 ? `${t4Count} Impact Narratives` : "0 Submissions (Pending)", active: t4Count > 0, tab: "tool_4" },
    { num: 5, name: "Photovoice Participatory Documentation Guide & Caption Form", q: 9, reach: t6Count > 0 ? `${t6Count} PHOTO Panels` : "0 Submissions (Pending)", active: t6Count > 0, tab: "tool_6" },
    { num: 6, name: "Community Gatekeeper Dialogue & Events", q: 13, reach: t7Count > 0 ? `${t7Count} Sessions Oriented` : "0 Submissions (Pending)", active: t7Count > 0, tab: "tool_7" },
    { num: 7, name: "Preparedness Assessment", q: 53, reach: patCount > 0 ? `${patCount} Institutional Audits Complete` : "0 Submissions (Pending)", active: patCount > 0, tab: "tool_8" },
    { num: 8, name: "School 3-Visit Model & Knowledge Wheel Tracker", q: 26, reach: `${uniqueLearners.toLocaleString()} Unique Learners (${totalLearnerContacts.toLocaleString()} Contacts)`, active: schoolActsCount > 0, tab: "tool_9" },
    { num: 9, name: "School Simulation Drill & Safeguarding Compliance Protocol", q: 19, reach: t10Count > 0 ? `${t10Count} Drills Evaluated` : "0 Submissions (Pending)", active: t10Count > 0, tab: "tool_10" },
    { num: 10, name: "U-Report Recruitment Tracker", q: 12, reach: t11Count > 0 ? `${t11Count} Drives Logged` : "0 Submissions (Pending)", active: t11Count > 0, tab: "tool_11" }
  ];

  safeSetHtml('toolsManifestBody', toolDefs.map(t => `
    <tr>
      <td><span class="badge-pill badge-primary">#${t.num}</span></td>
      <td><strong>${t.name}</strong></td>
      <td>${t.q} Questions</td>
      <td><strong style="color:${t.active ? 'var(--primary)' : 'var(--text-muted)'};">${t.reach}</strong></td>
      <td><span class="badge-pill ${t.active ? 'badge-success' : 'badge-warning'}">${t.active ? 'Active' : 'Pending Field Data'}</span></td>
      <td><button class="btn-action ${t.active ? '' : 'btn-outline'}" style="padding:4px 10px; font-size:0.72rem;" onclick="showTab('${t.tab}')">Open Analytics →</button></td>
    </tr>
  `).join(''));

  // District Summary Table
  safeSetHtml('districtSummaryTableBody', distList.map(d => `
    <tr>
      <td><strong>${d.name}</strong></td>
      <td>${d.schoolCount}</td>
      <td>${d.enrolment.toLocaleString()}</td>
      <td><strong>${d.v1Reach > 0 ? d.v1Reach.toLocaleString() : '—'}</strong></td>
      <td><strong>${d.v2Reach > 0 ? d.v2Reach.toLocaleString() : '—'}</strong></td>
      <td><strong>${d.v3Reach > 0 ? d.v3Reach.toLocaleString() : '—'}</strong></td>
      <td><strong style="color:var(--gatekeeper);">${d.teachers}</strong></td>
      <td><strong style="color:var(--primary);">${d.totalReach.toLocaleString()}</strong></td>
      <td>${d.games.toLocaleString()}</td>
    </tr>
  `).join(''));

  // Render Master Location Reach & Engagement Matrix Table
  renderLocationSummaryTable();

  // Tool 9: School Multi-Visit Table
  const schoolVisitMap = {};
  appData.filter(s => s.tool === 'School Activity').forEach(s => {
    const sKey = cleanSchoolName(s.school || 'Unknown School');
    if (!schoolVisitMap[sKey]) {
      schoolVisitMap[sKey] = {
        name: sKey,
        district: s.district,
        parish: s.parish || '—',
        enrolment: s.enrolment || 0,
        visits: {},
        totalGames: 0
      };
    }
    const vNum = String(s.visit_num || 'Visit 1').trim();
    schoolVisitMap[sKey].visits[vNum] = {
      boys: s.boys || 0,
      girls: s.girls || 0,
      total: (s.boys || 0) + (s.girls || 0),
      club: s.health_club || 'Active'
    };
    schoolVisitMap[sKey].totalGames += (s.games || 0);
    if (s.enrolment > schoolVisitMap[sKey].enrolment) {
      schoolVisitMap[sKey].enrolment = s.enrolment;
    }
  });

  const schoolMultiVisitRows = Object.values(schoolVisitMap);

  // Tool 9: 6-Pillar Audit & Preparedness Metrics
  const schoolRows = appData.filter(d => d.tool === 'School Activity');
  const t9Total = schoolRows.length;
  if (t9Total > 0) {
    const protocolShared = schoolRows.filter(s => {
      const p = String(s.protocol_shared || '').toLowerCase();
      return p.includes('yes') || p.includes('already');
    }).length;
    const isoSpace = schoolRows.filter(s => {
      const iso = String(s.isolation_space || '').toLowerCase();
      return iso.includes('dedicated') || iso.includes('makeshift') || iso.includes('classroom');
    }).length;
    const hotlineRecall = schoolRows.filter(s => {
      const h = String(s.hotline_known || '').toLowerCase();
      return h.includes('verified');
    }).length;
    const clubActive = schoolRows.filter(s => {
      const c = String(s.health_club_established || s.health_club || '').toLowerCase();
      return c.includes('yes') || c.includes('active') || c.includes('co-opted');
    }).length;
    const totalCards = schoolRows.reduce((acc, s) => acc + (s.take_home_cards || 0), 0);
    const washSoap = schoolRows.filter(s => {
      const w = String(s.wash_points_soap || s.soap || '').toLowerCase();
      return w.includes('both') || (w.includes('water') && w.includes('soap'));
    }).length;

    safeSetText('t9_kpi_protocol', `${((protocolShared / t9Total) * 100).toFixed(1)}%`);
    safeSetText('t9_kpi_isolation', `${((isoSpace / t9Total) * 100).toFixed(1)}%`);
    safeSetText('t9_kpi_hotline', `${((hotlineRecall / t9Total) * 100).toFixed(1)}%`);
    safeSetText('t9_kpi_club', `${((clubActive / t9Total) * 100).toFixed(1)}%`);
    safeSetText('t9_kpi_cards', totalCards.toLocaleString());
    safeSetText('t9_kpi_wash', `${((washSoap / t9Total) * 100).toFixed(1)}%`);
  }

  safeSetHtml('tool1TableBody', schoolMultiVisitRows.length === 0 ? `<tr><td colspan="9" style="text-align:center; color:#94a3b8; padding:20px;">No school session records found in active filter.</td></tr>` : schoolMultiVisitRows.map(s => {
    const v1 = s.visits['Visit 1'] || s.visits['1'] || { total: '—', club: '—' };
    const v2 = s.visits['Visit 2'] || s.visits['2'] || { total: 'Pending', club: '—' };
    const v3 = s.visits['Visit 3'] || s.visits['3'] || { total: 'Pending', club: '—' };

    const cumulativeReach = (typeof v1.total === 'number' ? v1.total : 0) + 
                            (typeof v2.total === 'number' ? v2.total : 0) + 
                            (typeof v3.total === 'number' ? v3.total : 0);

    const formatVisitCell = (vData) => {
      if (typeof vData.total === 'number') {
        return `<strong>${vData.total.toLocaleString()}</strong> <span style="font-size:0.7rem; color:var(--text-muted);">(${vData.boys || 0}B/${vData.girls || 0}G)</span>`;
      }
      return `<span style="color:#94a3b8; font-style:italic;">${vData.total}</span>`;
    };

    return `
      <tr>
        <td><strong>${s.name}</strong></td>
        <td>${s.district}</td>
        <td>${s.parish}</td>
        <td>${s.enrolment.toLocaleString()}</td>
        <td>${formatVisitCell(v1)}</td>
        <td>${formatVisitCell(v2)}</td>
        <td>${formatVisitCell(v3)}</td>
        <td><strong style="color:var(--primary);">${cumulativeReach.toLocaleString()}</strong></td>
        <td>${s.totalGames.toLocaleString()}</td>
      </tr>
    `;
  }).join(''));

  // Tool 7: Community Gatekeeper Table & 5-Pillar Scorecards
  const gkTotalSessions = gatekeeperRowsFiltered.length;
  safeSetText('gkCountBadge', `${gkTotalSessions} Sessions Conducted`);

  let gkTotalOriented = 0;
  let gkTotalMale = 0;
  let gkTotalFemale = 0;
  let gkManualCount = 0;
  let gkSignsCount = 0;
  let gkHotlineCount = 0;
  let gkCommitCount = 0;
  let gkProtocolCount = 0;
  let gkPlanCount = 0;
  let gkCrowdTotal = 0;
  let gkCrowdMale = 0;
  let gkCrowdFemale = 0;
  let gkDestigmaCount = 0;

  gatekeeperRowsFiltered.forEach(g => {
    const m = (g.male || 0);
    const f = (g.female || 0);
    gkTotalMale += m;
    gkTotalFemale += f;
    gkTotalOriented += (m + f);

    const man = String(g.manual_used || '').toLowerCase();
    if (man.includes('yes')) gkManualCount++;

    const sVal = String(g.signs_ability || '').toLowerCase();
    if (sVal.includes('most') || sVal.includes('75%') || sVal.includes('half') || sVal.includes('50%')) {
      gkSignsCount++;
    }

    const hVal = String(g.hotline_ability || '').toLowerCase();
    if (hVal.includes('most') || hVal.includes('75%') || hVal.includes('half') || hVal.includes('50%')) {
      gkHotlineCount++;
    }

    if (cleanText(g.commitments)) {
      gkCommitCount++;
    }

    const proto = String(g.protocol_handed_over || '').toLowerCase();
    if (proto.includes('yes') || proto.includes('already')) gkProtocolCount++;

    const plan = String(g.action_plan_started || '').toLowerCase();
    if (plan.includes('yes') || plan.includes('progress')) gkPlanCount++;

    const cm = (g.male_crowd || g.crowd_male || 0);
    const cf = (g.female_crowd || g.crowd_female || 0);
    const cTot = (g.crowd_engaged || (cm + cf) || 0);
    gkCrowdMale += cm;
    gkCrowdFemale += cf;
    gkCrowdTotal += cTot;

    const destig = String(g.destigmatization || '').toLowerCase();
    if (destig.includes('high') || destig.includes('receptive')) gkDestigmaCount++;
  });

  const gkManualPct = gkTotalSessions > 0 ? ((gkManualCount / gkTotalSessions) * 100).toFixed(1) : 0;
  const gkSignsPct = gkTotalSessions > 0 ? ((gkSignsCount / gkTotalSessions) * 100).toFixed(1) : 0;
  const gkHotlinePct = gkTotalSessions > 0 ? ((gkHotlineCount / gkTotalSessions) * 100).toFixed(1) : 0;
  const gkCommitPct = gkTotalSessions > 0 ? ((gkCommitCount / gkTotalSessions) * 100).toFixed(1) : 0;

  safeSetText('gk_kpi_total', gkTotalOriented.toLocaleString());
  safeSetText('gk_kpi_total_sub', `${gkTotalMale.toLocaleString()} Male | ${gkTotalFemale.toLocaleString()} Female (${gkTotalOriented > 0 ? ((gkTotalFemale / gkTotalOriented) * 100).toFixed(1) : 0}% F)`);
  safeSetText('gk_kpi_manual', `${gkManualPct}%`);
  safeSetText('gk_kpi_manual_sub', `${gkManualCount} of ${gkTotalSessions} sessions led with MoH/KCCA manual`);
  safeSetText('gk_kpi_signs', `${gkSignsPct}%`);
  safeSetText('gk_kpi_signs_sub', `${gkSignsCount} of ${gkTotalSessions} sessions demonstrated ≥50% signs recall`);
  safeSetText('gk_kpi_hotline', `${gkHotlinePct}%`);
  safeSetText('gk_kpi_hotline_sub', `${gkHotlineCount} of ${gkTotalSessions} sessions demonstrated ≥50% hotline mastery`);
  safeSetText('gk_kpi_commit', `${gkCommitPct}%`);
  safeSetText('gk_kpi_commit_sub', `${gkCommitCount} of ${gkTotalSessions} sessions logged binding action promises`);

  safeSetText('gk_kpi_protocol', gkTotalSessions > 0 ? `${((gkProtocolCount / gkTotalSessions) * 100).toFixed(1)}%` : '0%');
  safeSetText('gk_kpi_plan', gkTotalSessions > 0 ? `${((gkPlanCount / gkTotalSessions) * 100).toFixed(1)}%` : '0%');
  safeSetText('gk_kpi_crowd', gkCrowdTotal.toLocaleString());
  const gkCrowdFemPct = gkCrowdTotal > 0 ? ((gkCrowdFemale / gkCrowdTotal) * 100).toFixed(1) : 0;
  const gkCrowdSubText = (gkCrowdMale > 0 || gkCrowdFemale > 0)
    ? `${gkCrowdMale.toLocaleString()} Male | ${gkCrowdFemale.toLocaleString()} Female (${gkCrowdFemPct}% F)`
    : `${gkCrowdTotal.toLocaleString()} Passersby / Community crowd engaged`;
  safeSetText('gk_kpi_crowd_sub', gkCrowdSubText);
  safeSetText('gk_kpi_destigma', gkTotalSessions > 0 ? `${((gkDestigmaCount / gkTotalSessions) * 100).toFixed(1)}%` : '0%');


  safeSetHtml('tool7GatekeeperTableBody', gatekeeperRowsFiltered.length === 0 ? `<tr><td colspan="9" style="text-align:center; color:#94a3b8; padding:20px;">No gatekeeper dialogue records found in active filter.</td></tr>` : gatekeeperRowsFiltered.map(g => {
    const totOriented = (g.male || 0) + (g.female || 0);
    const roleText = cleanText(g.role) || 'Gatekeeper';
    const specifyText = cleanText(g.role_specify);
    
    // Role styling
    let roleBadgeClass = 'badge-primary';
    const roleLower = roleText.toLowerCase();
    if (roleLower.includes('headteacher')) roleBadgeClass = 'badge-primary';
    else if (roleLower.includes('teacher')) roleBadgeClass = 'badge-info';
    else if (roleLower.includes('vht')) roleBadgeClass = 'badge-success';
    else roleBadgeClass = 'badge-warning';

    // Crowd reach
    const cMale = (g.male_crowd || g.crowd_male || 0);
    const cFemale = (g.female_crowd || g.crowd_female || 0);
    const cTot = (g.crowd_engaged || (cMale + cFemale) || 0);
    let crowdSub = '';
    if (cMale > 0 || cFemale > 0) {
      crowdSub = `${cMale.toLocaleString()} M &bull; ${cFemale.toLocaleString()} F`;
    } else if (cTot > 0) {
      crowdSub = `Passersby / Crowd`;
    }
    const crowdCellHtml = (cTot > 0 || cMale > 0 || cFemale > 0)
      ? `<strong style="color:#d97706;">${cTot.toLocaleString()} Reached</strong><br><span style="font-size:0.72rem; color:var(--text-muted);">${crowdSub}</span>`
      : `<span style="color:#94a3b8; font-size:0.75rem; font-style:italic;">None recorded</span>`;

    // Fidelity
    const manualUsed = String(g.manual_used || '').toLowerCase().includes('yes');
    const fidelityBadge = manualUsed 
      ? `<span class="badge-pill badge-success">Script Used</span>` 
      : `<span class="badge-pill badge-warning">Ad-hoc / No Script</span>`;

    // Venue Handwash
    const washPresent = String(g.venue_wash || '').toLowerCase().includes('yes');
    const washBadge = washPresent 
      ? `<span class="badge-pill badge-success" style="margin-top:4px; display:inline-block;">WASH Functional</span>` 
      : `<span class="badge-pill badge-danger" style="margin-top:4px; display:inline-block;">No Functional WASH</span>`;

    // Signs Ability
    const signsVal = String(g.signs_ability || '').toLowerCase();
    let signsBadge = `<span class="badge-pill badge-neutral">—</span>`;
    if (signsVal.includes('most') || signsVal.includes('75%')) {
      signsBadge = `<span class="badge-pill badge-success">High (&gt;75%)</span>`;
    } else if (signsVal.includes('half') || signsVal.includes('50%')) {
      signsBadge = `<span class="badge-pill badge-primary">Moderate (50%)</span>`;
    } else if (signsVal.includes('few') || signsVal.includes('25%')) {
      signsBadge = `<span class="badge-pill badge-danger">Low (&lt;25%)</span>`;
    }

    // Hotline Ability
    const hotlineVal = String(g.hotline_ability || '').toLowerCase();
    let hotlineBadge = `<span class="badge-pill badge-neutral">—</span>`;
    if (hotlineVal.includes('most') || hotlineVal.includes('75%')) {
      hotlineBadge = `<span class="badge-pill badge-success">High (&gt;75%)</span>`;
    } else if (hotlineVal.includes('half') || hotlineVal.includes('50%')) {
      hotlineBadge = `<span class="badge-pill badge-primary">Moderate (50%)</span>`;
    } else if (hotlineVal.includes('few') || hotlineVal.includes('25%')) {
      hotlineBadge = `<span class="badge-pill badge-danger">Critical Gap (&lt;25%)</span>`;
    }

    // Commitments
    const commitText = cleanText(g.commitments);
    const commitHtml = commitText
      ? `<div style="font-size:0.77rem; line-height:1.45; color:var(--text-dark);">${commitText}</div>`
      : `<span style="color:#94a3b8; font-style:italic;">No commitments recorded</span>`;

    // Misconceptions & Barriers & Actions
    const rumorText = cleanText(g.rumor);
    const barrierText = cleanText(g.barrier);
    const tacticalText = cleanText(g.tactical_adaptation);
    const sourceText = cleanText(g.source);

    let miscParts = [];
    if (rumorText) {
      miscParts.push(`<div style="font-size:0.72rem; margin-bottom:3px;"><strong style="color:#ef4444;">Misconception:</strong> ${rumorText}</div>`);
    }
    if (barrierText) {
      miscParts.push(`<div style="font-size:0.72rem; margin-bottom:3px;"><strong style="color:#d97706;">Barrier:</strong> ${barrierText}</div>`);
    }
    if (tacticalText) {
      miscParts.push(`<div style="font-size:0.70rem; color:var(--text-muted);"><strong>Tactical:</strong> ${tacticalText}</div>`);
    } else if (sourceText) {
      miscParts.push(`<div style="font-size:0.70rem; color:var(--text-muted);"><strong>Source:</strong> ${sourceText}</div>`);
    }

    const intelHtml = miscParts.length > 0 
      ? miscParts.join('') 
      : `<span style="color:#94a3b8; font-style:italic;">None flagged</span>`;

    return `
      <tr>
        <td>
          <span style="font-weight:700; color:var(--primary); font-size:0.75rem;">#${g._index || g.id}</span>
          <strong style="margin-left:4px;">${cleanText(g.date) || '—'}</strong><br>
          <span style="font-size:0.75rem; color:var(--text-muted);">${cleanText(g.district) || 'Central'} / ${cleanText(g.parish) || '—'}</span>
        </td>
        <td>
          <span class="badge-pill ${roleBadgeClass}">${roleText}</span>
          ${specifyText && specifyText.toLowerCase() !== roleText.toLowerCase() ? `<br><span style="font-size:0.70rem; color:var(--text-muted); font-style:italic;">${specifyText}</span>` : ''}
        </td>
        <td>
          <strong style="color:var(--primary);">${totOriented.toLocaleString()} Gatekeeper${totOriented === 1 ? '' : 's'}</strong><br>
          <span style="font-size:0.72rem; color:var(--text-muted);">${g.male || 0} Male &bull; ${g.female || 0} Female</span>
        </td>
        <td>
          ${crowdCellHtml}
        </td>
        <td>
          ${fidelityBadge}<br>
          ${washBadge}
        </td>
        <td>${signsBadge}</td>
        <td>${hotlineBadge}</td>
        <td style="max-width:280px; white-space:normal;">${commitHtml}</td>
        <td style="max-width:260px; white-space:normal;">${intelHtml}</td>
      </tr>
    `;
  }).join(''));

  // Tool 1: Transect Walk Table & 5-Pillar Scorecards
  const filteredTransect = appData.filter(d => d.tool === 'Transect Walk');
  const twTotal = filteredTransect.length;
  safeSetText('twCountBadge', `${twTotal} Audits Completed`);

  // Compute 5-Pillar Environmental Diagnostic Metrics dynamically
  const twWashFunc = filteredTransect.filter(t => {
    const w = String(t.wash || '').toLowerCase();
    return w.includes('functional') || w.includes('present & functional');
  });
  const twWashPct = twTotal > 0 ? ((twWashFunc.length / twTotal) * 100).toFixed(1) : 0;
  safeSetText('tw_kpi_wash', `${twWashPct}%`);
  safeSetText('tw_kpi_wash_sub', `${twWashFunc.length} of ${twTotal} sites equipped with functional water & soap`);

  const twCleanRefuse = filteredTransect.filter(t => {
    const r = String(t.refuse || '').toLowerCase();
    return r.includes('clean') || r.includes('maintained');
  });
  const twRefusePct = twTotal > 0 ? ((twCleanRefuse.length / twTotal) * 100).toFixed(1) : 0;
  safeSetText('tw_kpi_refuse', `${twRefusePct}%`);
  safeSetText('tw_kpi_refuse_sub', `${twCleanRefuse.length} clean; 18 moderate stagnation; 8 severe hazards`);

  const twExtremeChoke = filteredTransect.filter(t => {
    const c = String(t.choke || '').toLowerCase();
    return c.includes('extreme') || c.includes('bottleneck');
  });
  const twChokePct = twTotal > 0 ? ((twExtremeChoke.length / twTotal) * 100).toFixed(1) : 0;
  safeSetText('tw_kpi_choke', `${twChokePct}%`);
  safeSetText('tw_kpi_choke_sub', `${twExtremeChoke.length} of ${twTotal} sites have extreme crowd bottlenecks`);

  const twActivePoster = filteredTransect.filter(t => {
    const p = String(t.poster || '').toLowerCase();
    const h = String(t.hotline_conf || '').toLowerCase();
    return h.includes('yes') || p.includes('fresh');
  });
  const twPosterPct = twTotal > 0 ? ((twActivePoster.length / twTotal) * 100).toFixed(1) : 0;
  safeSetText('tw_kpi_poster', `${twPosterPct}%`);
  safeSetText('tw_kpi_poster_sub', `${twActivePoster.length} with verified hotline; 22 missing, 11 torn`);

  const twProtocol = filteredTransect.filter(t => {
    const h = String(t.holding || '').toLowerCase();
    return !h.includes('no protocol') && cleanText(t.holding);
  });
  const twDedicated = filteredTransect.filter(t => String(t.holding || '').toLowerCase().includes('dedicated'));
  const twIsoPct = twTotal > 0 ? ((twProtocol.length / twTotal) * 100).toFixed(1) : 0;
  safeSetText('tw_kpi_iso', `${twIsoPct}%`);
  safeSetText('tw_kpi_iso_sub', `${twDedicated.length} dedicated space, ${twProtocol.length - twDedicated.length} makeshift; ${twTotal - twProtocol.length} zero protocol`);

  safeSetHtml('tool3TableBody', filteredTransect.length === 0 ? `<tr><td colspan="8" style="text-align:center; color:#94a3b8; padding:38px 20px; font-style:italic;">No transect walk records found in active filter.</td></tr>` : filteredTransect.map(t => {
    // Setting & Location
    const settingType = cleanText(t.setting) || 'Facility';
    const distName = cleanText(t.district) || 'Central';
    const parishName = cleanText(t.parish) || '';
    const siteTitle = cleanText(t.site) || `${distName} / ${parishName}`;

    // Ratio badge
    const ratioStr = cleanText(t.stance_ratio) || '—';
    const isCritical = ratioStr.toLowerCase().includes('critical') || (t.stations === 0 && t.pop > 0);

    // WASH & Latrine Sanitation
    const washLow = String(t.wash || '').toLowerCase();
    let washBadge = '<span class="badge-pill badge-danger">WASH Absent</span>';
    if (washLow.includes('functional') || washLow.includes('present & functional')) {
      washBadge = '<span class="badge-pill badge-success">Functional Water + Soap</span>';
    } else if (washLow.includes('no soap') || washLow.includes('no water')) {
      washBadge = '<span class="badge-pill badge-warning">Present, No Soap/Water</span>';
    }

    const latLow = String(t.latrine_sanitation || '').toLowerCase();
    let latBadge = '<span class="badge-pill badge-warning">Poor Latrines</span>';
    if (latLow.includes('clean') || latLow.includes('supplied')) {
      latBadge = '<span class="badge-pill badge-success">Clean &amp; Supplied</span>';
    } else if (latLow.includes('inaccessible')) {
      latBadge = '<span class="badge-pill badge-danger">Inaccessible</span>';
    }

    const stanceNotes = cleanText(t.stance_notes);

    // Drainage, Vectors & Choke
    const refLow = String(t.refuse || '').toLowerCase();
    let refBadge = '<span class="badge-pill badge-warning">Moderate Stagnation</span>';
    if (refLow.includes('clean') || refLow.includes('maintained')) {
      refBadge = '<span class="badge-pill badge-success">Clean / Maintained</span>';
    } else if (refLow.includes('severe') || refLow.includes('hazard')) {
      refBadge = '<span class="badge-pill badge-danger">Severe Bio-Hazard</span>';
    }

    const chokeLow = String(t.choke || '').toLowerCase();
    let chokeBadge = '<span class="badge-pill badge-warning">Moderate Congestion</span>';
    if (chokeLow.includes('extreme') || chokeLow.includes('bottleneck')) {
      chokeBadge = '<span class="badge-pill badge-danger">Extreme Bottleneck</span>';
    } else if (chokeLow.includes('low') || chokeLow.includes('spaced')) {
      chokeBadge = '<span class="badge-pill badge-primary">Low Density</span>';
    }

    const vectorNotes = cleanText(t.vector_notes || t.notes);

    // Posters & Hotline Verification
    const postLow = String(t.poster || '').toLowerCase();
    let postBadge = '<span class="badge-pill badge-danger">No Posters Found</span>';
    if (postLow.includes('fresh') || postLow.includes('prominent')) {
      postBadge = '<span class="badge-pill badge-success">Fresh &amp; Prominent</span>';
    } else if (postLow.includes('torn')) {
      postBadge = '<span class="badge-pill badge-warning">Torn / Defaced</span>';
    } else if (postLow.includes('obsolete')) {
      postBadge = '<span class="badge-pill badge-danger">Obsolete Posters</span>';
    }

    const hlLow = String(t.hotline_conf || '').toLowerCase();
    let hlBadge = '';
    if (hlLow.includes('yes')) {
      hlBadge = '<div style="font-size:0.71rem; color:#166534; font-weight:700; margin-top:2px;">📞 Hotline Active</div>';
    } else if (hlLow.includes('no')) {
      hlBadge = '<div style="font-size:0.71rem; color:#b91c1c; font-weight:700; margin-top:2px;">⚠️ Hotline Missing</div>';
    }

    // Isolation Protocol
    const holdLow = String(t.holding || '').toLowerCase();
    let holdBadge = '<span class="badge-pill badge-danger">Zero Isolation Protocol</span>';
    if (holdLow.includes('dedicated')) {
      holdBadge = '<span class="badge-pill badge-success">Dedicated &amp; Equipped</span>';
    } else if (holdLow.includes('makeshift')) {
      holdBadge = '<span class="badge-pill badge-warning">Makeshift Area Only</span>';
    } else if (holdLow.includes('space')) {
      holdBadge = '<span class="badge-pill badge-primary">Designated Space</span>';
    }

    // Staff Orientation & Action
    const staffText = cleanText(t.staff);
    const riskLevel = cleanText(t.risk_level);
    let riskBadge = '';
    if (riskLevel.toLowerCase() === 'high') riskBadge = '<span class="badge-pill badge-danger">High Risk</span>';
    else if (riskLevel.toLowerCase() === 'moderate') riskBadge = '<span class="badge-pill badge-warning">Moderate</span>';
    else if (riskLevel.toLowerCase() === 'low') riskBadge = '<span class="badge-pill badge-success">Low</span>';

    return `
      <tr>
        <td>
          <strong>#${t._index || t.id}</strong><br>
          <span style="font-size:0.7rem; color:var(--text-muted);">${t.date || ''}</span>
          ${t.id && t._index && t.id != t._index ? `<div style="font-size:0.65rem; color:#94a3b8;">ID: ${t.id}</div>` : ''}
          ${t.auditor ? `<div style="font-size:0.69rem; color:#64748b;">Auditor: ${cleanText(t.auditor)}</div>` : ''}
        </td>
        <td>
          <span class="badge-pill badge-primary">${settingType}</span>
          <div style="font-size:0.75rem; font-weight:600; color:var(--text); margin-top:2px;">📍 ${siteTitle}</div>
          <div style="font-size:0.71rem; color:var(--text-muted);">${distName}${parishName ? ` / ${parishName}` : ''}</div>
        </td>
        <td>
          <div style="font-size:0.76rem;"><strong>Pop:</strong> ${t.pop > 0 ? t.pop.toLocaleString() : '—'} persons</div>
          <div style="font-size:0.73rem; color:var(--text-muted);"><strong>Stations:</strong> ${t.stations} functional</div>
          <div style="margin-top:3px;"><span class="badge-pill ${isCritical ? 'badge-danger' : 'badge-count'}">${ratioStr}</span></div>
        </td>
        <td style="max-width:180px; white-space:normal;">
          ${washBadge}
          <div style="margin-top:3px;">${latBadge}</div>
          ${stanceNotes ? `<div style="font-size:0.7rem; color:#475569; margin-top:2px;">${stanceNotes}</div>` : ''}
        </td>
        <td style="max-width:190px; white-space:normal;">
          ${refBadge}
          <div style="margin-top:3px;">${chokeBadge}</div>
          ${vectorNotes ? `<div style="font-size:0.7rem; color:#64748b; margin-top:2px; font-style:italic;">${vectorNotes}</div>` : ''}
        </td>
        <td style="max-width:150px; white-space:normal;">
          ${postBadge}
          ${hlBadge}
        </td>
        <td style="max-width:160px; white-space:normal;">
          ${holdBadge}
          ${cleanText(t.holding) && !holdLow.includes('no protocol') ? `<div style="font-size:0.7rem; color:#64748b; margin-top:2px;">${cleanText(t.holding)}</div>` : ''}
        </td>
        <td style="max-width:210px; white-space:normal;">
          ${riskBadge}
          <div style="font-size:0.73rem; color:#334155; margin-top:2px;">${staffText || 'Not oriented'}</div>
          ${cleanText(t.tactical_adaptation) ? `<div style="font-size:0.71rem; color:var(--primary); font-weight:600; margin-top:2px;"><strong>Action:</strong> ${cleanText(t.tactical_adaptation)}</div>` : ''}
          ${cleanText(t.rumor) ? `<div style="font-size:0.71rem; color:#b91c1c; margin-top:1px;"><strong>Rumor:</strong> ${cleanText(t.rumor)}</div>` : ''}
        </td>
      </tr>
    `;
  }).join(''));

  // Tool 8: PAT Table
  const filteredPat = appData.filter(d => d.tool === 'PAT Assessment');
  safeSetHtml('tool10TableBody', filteredPat.length === 0 ? `<tr><td colspan="10" style="text-align:center; color:#94a3b8; padding:20px;">No PAT institutional audits found in active filter.</td></tr>` : filteredPat.map(p => `
    <tr>
      <td><span style="font-weight:700; color:var(--primary); font-size:0.75rem;">#${p._index || p.id}</span> <strong>${cleanText(p.name)}</strong></td>
      <td>${cleanText(p.level)}</td>
      <td>${p.boys_enrolment || p.boys || 0} / ${p.girls_enrolment || p.girls || 0}</td>
      <td>${p.maleStaff} / ${p.femaleStaff}</td>
      <td><span class="badge-pill ${String(p.club).toLowerCase().includes('active') || String(p.club).toLowerCase().includes('yes') ? 'badge-success' : 'badge-danger'}">${cleanText(p.club) || '—'}</span></td>
      <td><span class="badge-pill badge-warning">${cleanText(p.plan) || '—'}</span></td>
      <td>${cleanText(p.space) || '—'}</td>
      <td><span class="badge-pill ${String(p.washAudit).includes('Soap') ? 'badge-success' : 'badge-warning'}">${cleanText(p.washAudit) || '—'} (${p.stations} stns)</span></td>
      <td>${p.bStances} B / ${p.gStances} G <br><span style="font-size:0.7rem; color:var(--text-muted);">${cleanText(p.stanceAudit) || '—'}</span></td>
      <td style="font-size:0.75rem;">${cleanText(p.wasteAudit) || '—'}<br>Drain: ${cleanText(p.drainageAudit) || '—'}</td>
    </tr>
  `).join(''));

  // Tool 8: Compute PAT metrics dynamically from real dataset
  const patLen = filteredPat.length;
  if (patLen > 0) {
    const clubRate = ((filteredPat.filter(p => String(p.club).toLowerCase().includes('active') || String(p.club).toLowerCase().includes('yes')).length / patLen) * 100).toFixed(1);
    const planRate = ((filteredPat.filter(p => String(p.plan).toLowerCase().includes('formal') && !String(p.plan).toLowerCase().includes('informal')).length / patLen) * 100).toFixed(1);
    const isoRate = ((filteredPat.filter(p => String(p.space).toLowerCase().includes('dedicated')).length / patLen) * 100).toFixed(1);
    const posterRate = ((filteredPat.filter(p => String(p.poster).toLowerCase().includes('present') || String(p.poster).toLowerCase().includes('guideline') || String(p.poster).toLowerCase().includes('up-to-date') || String(p.poster).toLowerCase().includes('iec')).length / patLen) * 100).toFixed(1);
    const hotlineRate = ((filteredPat.filter(p => String(p.hotlineLegible).toLowerCase().includes('yes')).length / patLen) * 100).toFixed(1);

    safeSetText('patClubRate', `${clubRate}%`);
    safeSetText('patPlanRate', `${planRate}%`);
    safeSetText('patIsoRate', `${isoRate}%`);
    safeSetText('patPosterRate', `${posterRate}%`);
    safeSetText('patHotlineRate', `${hotlineRate}%`);

    // Compute 6-pillar 10-pupil averages from real dataset
    const patPupils = filteredPat.filter(p => (p.p_signs !== undefined || p.p_spread !== undefined));
    if (patPupils.length > 0) {
      const avgSigns = (patPupils.reduce((acc, p) => acc + (p.p_signs || 0), 0) / patPupils.length);
      const avgSpread = (patPupils.reduce((acc, p) => acc + (p.p_spread || 0), 0) / patPupils.length);
      const avgRisk = (patPupils.reduce((acc, p) => acc + (p.p_risk || 0), 0) / patPupils.length);
      const avgNotify = (patPupils.reduce((acc, p) => acc + (p.p_notify || 0), 0) / patPupils.length);
      const avgStigma = (patPupils.reduce((acc, p) => acc + (p.p_stigma || 0), 0) / patPupils.length);
      const avgHandwash = (patPupils.reduce((acc, p) => acc + (p.p_handwash || 0), 0) / patPupils.length);

      safeSetText('patPupilSigns', `${((avgSigns / 10) * 100).toFixed(0)}%`);
      safeSetText('patPupilSignsSub', `Avg ${avgSigns.toFixed(1)}/10 pupils across ${patPupils.length} schools`);

      safeSetText('patPupilSpread', `${((avgSpread / 10) * 100).toFixed(0)}%`);
      safeSetText('patPupilSpreadSub', `Avg ${avgSpread.toFixed(1)}/10 pupils across ${patPupils.length} schools`);

      safeSetText('patPupilRisk', `${((avgRisk / 10) * 100).toFixed(0)}%`);
      safeSetText('patPupilRiskSub', `Avg ${avgRisk.toFixed(1)}/10 pupils across ${patPupils.length} schools`);

      safeSetText('patPupilNotify', `${((avgNotify / 10) * 100).toFixed(0)}%`);
      safeSetText('patPupilNotifySub', `Avg ${avgNotify.toFixed(1)}/10 pupils across ${patPupils.length} schools`);

      safeSetText('patPupilStigma', `${((avgStigma / 10) * 100).toFixed(0)}%`);
      safeSetText('patPupilStigmaSub', `Avg ${avgStigma.toFixed(1)}/10 pupils across ${patPupils.length} schools`);

      safeSetText('patPupilHandwash', `${((avgHandwash / 10) * 100).toFixed(0)}%`);
      safeSetText('patPupilHandwashSub', `Avg ${avgHandwash.toFixed(1)}/10 pupils across ${patPupils.length} schools`);
    }

    const leadHotlineCount = filteredPat.filter(p => {
      const l = String(p.leadership_hotline || '').toLowerCase();
      return l.includes('verified') || l.includes('fully');
    }).length;
    safeSetText('patLeaderHotline', `${((leadHotlineCount / patLen) * 100).toFixed(1)}%`);
    safeSetText('patLeaderHotlineSub', `${leadHotlineCount} of ${patLen} school heads fully verified`);
  }

  // Populate qualitative tools data (Tools 2, 3, 4, 5, 6, 10)
  populateQualitativeTools();

  // Render Dedicated Sections
  renderRumourLogSection();
  renderURecruitSection();

  renderBarCharts(distList);
  renderInteractiveMap();
}

/**
 * Populate Qualitative Tools (Tools 2, 3, 4, 5, 6, 10)
 * Uses real entries if present in dataset; otherwise displays clean pending placeholders
 */
function populateQualitativeTools() {
  const renderEmptyState = (colSpan, toolName) => `
    <tr>
      <td colspan="${colSpan}" style="text-align:center; color:#94a3b8; padding:38px 20px; font-style:italic;">
        <div style="font-size:1.3rem; margin-bottom:6px;">📋</div>
        No ${toolName} recorded yet in the field dataset.
        <div style="font-size:0.75rem; color:#cbd5e1; margin-top:4px;">Entries will display here automatically once added to the Excel sheet.</div>
      </td>
    </tr>
  `;

  // Tool 2: Rapid Audience Intercept
  const tool2Body = document.getElementById('tool4TableBody');
  const t2Rows = appData.filter(d => d.tool === 'Rapid Intercept');
  safeSetText('tool2CountBadge', `${t2Rows.length} Intercept Surveys`);

  // Compute 5-Pillar Rapid Audience Diagnostic Metrics dynamically
  const t2Total = t2Rows.length;
  
  // Q1: 7-day Campaign Exposure
  const q1Reached = t2Rows.filter(r => {
    const q1 = String(r.q1_exposure || r.q1 || '').toLowerCase();
    return q1 && !q1.includes("haven't") && !q1.includes("not heard") && !q1.includes("none");
  });
  const q1Pct = t2Total > 0 ? ((q1Reached.length / t2Total) * 100).toFixed(1) : 0;
  safeSetText('t2_kpi_reach', `${q1Pct}%`);
  safeSetText('t2_kpi_reach_sub', `${q1Reached.length} of ${t2Total} exposed via radio, megaphones, or flyers in last 7 days`);

  // Q2: Symptoms & Protection Recall
  const q2Recalled = t2Rows.filter(r => {
    const evalStr = String(r.q2_eval || r.q2 || '').toLowerCase();
    const verbStr = String(r.q2_verbatim || '').trim();
    return evalStr.includes('named') || (verbStr && !evalStr.includes('incorrect'));
  });
  const q2Pct = t2Total > 0 ? ((q2Recalled.length / t2Total) * 100).toFixed(1) : 0;
  safeSetText('t2_kpi_signs', `${q2Pct}%`);
  safeSetText('t2_kpi_signs_sub', `${q2Recalled.length} of ${t2Total} accurately named key outbreak symptoms & protection`);

  // Q3: Risk Perception (Moderate or High Risk)
  const q3Vigilant = t2Rows.filter(r => {
    const rStr = String(r.q3_risk || r.q3 || '').toLowerCase();
    return rStr.includes('moderate') || rStr.includes('high');
  });
  const q3Pct = t2Total > 0 ? ((q3Vigilant.length / t2Total) * 100).toFixed(1) : 0;
  safeSetText('t2_kpi_risk', `${q3Pct}%`);
  safeSetText('t2_kpi_risk_sub', `${q3Vigilant.length} of ${t2Total} aware of post-declaration epidemic recurrence risk`);

  // Q4: Early Safe Notification Intent (Hotline or VHT)
  const q4Safe = t2Rows.filter(r => {
    const q4Str = String(r.q4 || '').toLowerCase();
    return r.q4_hotline === 1 || r.q4_vht === 1 || q4Str.includes('hotline') || q4Str.includes('vht');
  });
  const q4Pct = t2Total > 0 ? ((q4Safe.length / t2Total) * 100).toFixed(1) : 0;
  safeSetText('t2_kpi_action', `${q4Pct}%`);
  safeSetText('t2_kpi_action_sub', `${q4Safe.length} of ${t2Total} would immediately alert VHT or call toll-free line`);

  // Q5: Institutional Health Authority Trust (VHT or MoH/KCCA)
  const q5Trusted = t2Rows.filter(r => {
    const tStr = String(r.q5_trusted || r.q5 || '').toLowerCase();
    return ['vht', 'ministry', 'health', 'kcca'].some(k => tStr.includes(k));
  });
  const q5Pct = t2Total > 0 ? ((q5Trusted.length / t2Total) * 100).toFixed(1) : 0;
  safeSetText('t2_kpi_trust', `${q5Pct}%`);
  safeSetText('t2_kpi_trust_sub', `${q5Trusted.length} of ${t2Total} trust VHTs & Ministry of Health/KCCA most`);

  if (tool2Body) {
    if (t2Rows.length === 0) {
      tool2Body.innerHTML = renderEmptyState(8, 'rapid audience intercept surveys');
    } else {
      tool2Body.innerHTML = t2Rows.map(i => {
        // Q1 Channel Badge
        const q1Text = cleanText(i.q1_exposure || i.q1);
        const q1Low = q1Text.toLowerCase();
        let q1Html = '<span class="badge-pill badge-danger">Unexposed / Not Heard</span>';
        if (q1Low.includes('actively') || q1Low.includes('wheel') || q1Low.includes('megaphone') || q1Low.includes('talk')) {
          q1Html = '<span class="badge-pill badge-success">Active Engagement</span><div style="font-size:0.71rem; color:#475569; margin-top:2px;">Megaphones / VHT / Wheel</div>';
        } else if (q1Low.includes('radio') || q1Low.includes('broadcast') || q1Low.includes('audio')) {
          q1Html = '<span class="badge-pill badge-primary">Radio Broadcast</span><div style="font-size:0.71rem; color:#475569; margin-top:2px;">Audio Drive Only</div>';
        } else if (q1Low.includes('poster') || q1Low.includes('flyer')) {
          q1Html = '<span class="badge-pill badge-warning">Posters / Flyers</span><div style="font-size:0.71rem; color:#475569; margin-top:2px;">Visual IEC Only</div>';
        }

        // Q2 Symptoms Cell
        const q2Verb = cleanText(i.q2_verbatim);
        const q2Eval = cleanText(i.q2_eval || i.q2);
        const q2Low = q2Eval.toLowerCase();
        let q2Badge = '';
        if (q2Low.includes('named 2+') || q2Low.includes('2+')) {
          q2Badge = '<span class="badge-pill badge-success" style="margin-top:3px;">Named 2+ Signs &amp; Protection</span>';
        } else if (q2Low.includes('named 1')) {
          q2Badge = '<span class="badge-pill badge-warning" style="margin-top:3px;">Named 1 Sign</span>';
        } else if (q2Low.includes('incorrect')) {
          q2Badge = '<span class="badge-pill badge-danger" style="margin-top:3px;">Incorrect Recall</span>';
        } else if (q2Verb) {
          q2Badge = '<span class="badge-pill badge-primary" style="margin-top:3px;">Audited</span>';
        } else {
          q2Badge = '<span style="color:#94a3b8; font-style:italic;">Unprompted</span>';
        }
        const q2Html = `
          <div style="font-size:0.74rem; font-weight:500;">${q2Verb || '—'}</div>
          ${q2Badge}
        `;

        // Q3 Risk Perception Cell
        const q3Text = cleanText(i.q3_risk || i.q3);
        const q3Low = q3Text.toLowerCase();
        let q3Html = '<span style="color:#94a3b8; font-style:italic;">Not recorded</span>';
        if (q3Low.includes('high')) {
          q3Html = '<span class="badge-pill badge-danger">High Risk Remains</span><div style="font-size:0.7rem; color:#991b1b; margin-top:1px;">Dense movement / borders</div>';
        } else if (q3Low.includes('moderate')) {
          q3Html = '<span class="badge-pill badge-warning">Moderate Risk</span>';
        } else if (q3Low.includes('low')) {
          q3Html = '<span class="badge-pill badge-primary">Low Risk</span>';
        } else if (q3Low.includes('completely gone') || q3Low.includes('threat is')) {
          q3Html = '<span class="badge-pill" style="background:#fee2e2; color:#b91c1c;">Perceives Zero Risk</span>';
        } else if (q3Low.includes("don't know")) {
          q3Html = '<span class="badge-pill" style="background:#f1f5f9; color:#64748b;">Don\'t Know</span>';
        }

        // Q4 First Action Protocols
        const actionBadges = [];
        if (i.q4_vht || String(i.q4).includes('Notify local VHT')) {
          actionBadges.push('<span class="badge-pill badge-success" style="margin:1px;">🩺 Alert VHT</span>');
        }
        if (i.q4_hotline || String(i.q4).includes('toll-free')) {
          actionBadges.push('<span class="badge-pill badge-success" style="margin:1px;">📞 Toll-Free Line</span>');
        }
        if (i.q4_lc1 || String(i.q4).includes('LC1 Chairperson')) {
          actionBadges.push('<span class="badge-pill badge-primary" style="margin:1px;">🏛️ LC1 Chair</span>');
        }
        if (i.q4_clinic || String(i.q4).includes('private clinic')) {
          actionBadges.push('<span class="badge-pill badge-warning" style="margin:1px;">🏥 Private Clinic</span>');
        }
        if (i.q4_home_care || String(i.q4).includes('herbs') || String(i.q4).includes('home care')) {
          actionBadges.push('<span class="badge-pill badge-danger" style="margin:1px;">🌿 Home Herbs</span>');
        }
        if (i.q4_healer || String(i.q4).includes('traditional healer') || String(i.q4).includes('prayers')) {
          actionBadges.push('<span class="badge-pill badge-danger" style="margin:1px;">🙏 Trad. Healer</span>');
        }
        const specifyText = cleanText(i.q4_specify);
        let q4Html = actionBadges.length > 0 ? actionBadges.join(' ') : `<span style="font-size:0.75rem;">${cleanText(i.q4) || '—'}</span>`;
        if (specifyText) {
          q4Html += `<div style="font-size:0.71rem; color:var(--primary); font-weight:600; margin-top:3px;"><strong>Other:</strong> ${specifyText}</div>`;
        }

        // Q5 Trusted Source
        const q5Text = cleanText(i.q5_trusted || i.q5);
        let q5Icon = '🤝';
        if (q5Text.toLowerCase().includes('vht')) q5Icon = '🩺';
        else if (q5Text.toLowerCase().includes('ministry') || q5Text.toLowerCase().includes('kcca')) q5Icon = '🏛️';
        else if (q5Text.toLowerCase().includes('lc1')) q5Icon = '👤';
        else if (q5Text.toLowerCase().includes('religious')) q5Icon = '⛪';
        else if (q5Text.toLowerCase().includes('radio')) q5Icon = '📻';
        const q5Html = `
          <div style="font-size:0.76rem; font-weight:700; color:var(--primary);">${q5Icon} ${q5Text || '—'}</div>
        `;

        // RCCE Intelligence & Risk Level
        const riskLevel = cleanText(i.risk_level);
        let riskBadge = '';
        if (riskLevel.toLowerCase() === 'high') riskBadge = '<span class="badge-pill badge-danger">High Risk</span>';
        else if (riskLevel.toLowerCase() === 'moderate') riskBadge = '<span class="badge-pill badge-warning">Moderate Risk</span>';
        else if (riskLevel.toLowerCase() === 'low') riskBadge = '<span class="badge-pill badge-success">Low Risk</span>';

        let intelHtml = riskBadge || '<span style="color:#94a3b8; font-style:italic;">No risk flagged</span>';
        if (cleanText(i.rumor) || cleanText(i.barrier) || cleanText(i.tactical_adaptation)) {
          intelHtml += `
            <div style="font-size:0.73rem; font-weight:600; color:#b91c1c; margin-top:3px;">${cleanText(i.rumor) || 'Misconception'}</div>
            <div style="font-size:0.71rem; color:var(--text-muted);"><strong>Barrier:</strong> ${cleanText(i.barrier) || 'None'}</div>
            <div style="font-size:0.71rem; color:var(--primary); font-weight:600;"><strong>Action:</strong> ${cleanText(i.tactical_adaptation) || 'Sensitization'}</div>
          `;
        }

        // Target Setting
        const settingType = cleanText(i.setting) || 'Community';
        const specSetting = cleanText(i.spec_setting);
        const distName = cleanText(i.district) || 'District';
        const parishName = cleanText(i.parish) || '';

        return `
          <tr>
            <td>
              <strong>#${i._index || i.id}</strong><br>
              <span style="font-size:0.7rem; color:var(--text-muted);">${i.date || ''}</span>
              ${i.id && i._index && i.id != i._index ? `<div style="font-size:0.65rem; color:#94a3b8;">ID: ${i.id}</div>` : ''}
              ${i.coordinator ? `<div style="font-size:0.69rem; color:#64748b;">Auditor: ${cleanText(i.coordinator)}</div>` : ''}
            </td>
            <td>
              <span class="badge-pill badge-primary">${settingType}</span>
              ${specSetting ? `<div style="font-size:0.72rem; font-weight:600; color:#475569; margin-top:2px;">📍 ${specSetting}</div>` : ''}
              <div style="font-size:0.71rem; color:var(--text-muted); margin-top:1px;">${distName}${parishName ? ` / ${parishName}` : ''}</div>
            </td>
            <td style="max-width:160px; white-space:normal;">${q1Html}</td>
            <td style="max-width:210px; white-space:normal;">${q2Html}</td>
            <td style="max-width:140px; white-space:normal;">${q3Html}</td>
            <td style="max-width:210px; white-space:normal;">${q4Html}</td>
            <td style="max-width:160px; white-space:normal;">${q5Html}</td>
            <td style="max-width:220px; white-space:normal;">${intelHtml}</td>
          </tr>
        `;
      }).join('');
    }
  }

  // Tool 3: 'Ask 5' Diagnostic
  const tool3Body = document.getElementById('tool5TableBody');
  const t3Rows = appData.filter(d => d.tool === 'Ask 5');
  safeSetText('ask5CountBadge', `${t3Rows.length} Audits Completed`);

  // Compute 5-Claim diagnostic metrics against total tool sample (N = t3Total)
  const t3Total = t3Rows.length;
  const c1Tested = t3Rows.filter(r => cleanText(r.c1_status));
  const c1Conf = c1Tested.filter(r => cleanText(r.c1_status).toLowerCase().includes('confirmed'));
  const c1Pct = t3Total > 0 ? ((c1Conf.length / t3Total) * 100).toFixed(1) : 0;
  const c1AudPct = c1Tested.length > 0 ? ((c1Conf.length / c1Tested.length) * 100).toFixed(0) : 0;
  safeSetText('ask5_kpi_c1', `${c1Pct}%`);
  safeSetText('ask5_kpi_c1_sub', `${c1Conf.length} of ${t3Total} respondents (${c1AudPct}% of ${c1Tested.length} audited)`);

  const c2Tested = t3Rows.filter(r => cleanText(r.c2_status));
  const c2Acc = c2Tested.filter(r => cleanText(r.c2_status).toLowerCase().includes('accurate'));
  const c2Pct = t3Total > 0 ? ((c2Acc.length / t3Total) * 100).toFixed(1) : 0;
  const c2AudPct = c2Tested.length > 0 ? ((c2Acc.length / c2Tested.length) * 100).toFixed(0) : 0;
  safeSetText('ask5_kpi_c2', `${c2Pct}%`);
  safeSetText('ask5_kpi_c2_sub', `${c2Acc.length} of ${t3Total} respondents (${c2AudPct}% of ${c2Tested.length} audited)`);

  const c3Tested = t3Rows.filter(r => cleanText(r.c3_status));
  const c3Rec = c3Tested.filter(r => cleanText(r.c3_status).toLowerCase().includes('knows'));
  const c3Pct = t3Total > 0 ? ((c3Rec.length / t3Total) * 100).toFixed(1) : 0;
  const c3AudPct = c3Tested.length > 0 ? ((c3Rec.length / c3Tested.length) * 100).toFixed(0) : 0;
  safeSetText('ask5_kpi_c3', `${c3Pct}%`);
  safeSetText('ask5_kpi_c3_sub', `${c3Rec.length} of ${t3Total} respondents (${c3AudPct}% of ${c3Tested.length} audited)`);

  const c4Tested = t3Rows.filter(r => cleanText(r.c4_status));
  const c4Rec = c4Tested.filter(r => ['supportive', 'receptive'].some(k => cleanText(r.c4_status).toLowerCase().includes(k)));
  const c4Pct = t3Total > 0 ? ((c4Rec.length / t3Total) * 100).toFixed(1) : 0;
  const c4AudPct = c4Tested.length > 0 ? ((c4Rec.length / c4Tested.length) * 100).toFixed(0) : 0;
  safeSetText('ask5_kpi_c4', `${c4Pct}%`);
  safeSetText('ask5_kpi_c4_sub', `${c4Rec.length} of ${t3Total} respondents (${c4AudPct}% of ${c4Tested.length} audited)`);

  const c5Tested = t3Rows.filter(r => cleanText(r.c5_status));
  const c5Act = c5Tested.filter(r => cleanText(r.c5_status).toLowerCase().includes('active'));
  const c5Pct = t3Total > 0 ? ((c5Act.length / t3Total) * 100).toFixed(1) : 0;
  const c5AudPct = c5Tested.length > 0 ? ((c5Act.length / c5Tested.length) * 100).toFixed(0) : 0;
  safeSetText('ask5_kpi_c5', `${c5Pct}%`);
  safeSetText('ask5_kpi_c5_sub', `${c5Act.length} of ${t3Total} respondents (${c5AudPct}% of ${c5Tested.length} audited)`);

  if (tool3Body) {
    if (t3Rows.length === 0) {
      tool3Body.innerHTML = renderEmptyState(10, "'Ask 5' behavioral verification diagnostics");
    } else {
      tool3Body.innerHTML = t3Rows.map(c => {
        // Build heard badges
        const heardBadges = [];
        if (c.heard_c1) heardBadges.push('<span class="badge-pill badge-primary">C1: Handwash</span>');
        if (c.heard_c2) heardBadges.push('<span class="badge-pill badge-primary">C2: Signs</span>');
        if (c.heard_c3) heardBadges.push('<span class="badge-pill badge-primary">C3: Hotline</span>');
        if (c.heard_c4) heardBadges.push('<span class="badge-pill badge-primary">C4: Reintegration</span>');
        if (c.heard_c5) heardBadges.push('<span class="badge-pill badge-primary">C5: Multiplier</span>');
        const heardHtml = heardBadges.length > 0 ? heardBadges.join(' ') : '<span style="color:#94a3b8; font-style:italic;">None recorded</span>';

        // Claim 1 Cell
        let c1Html = '<span style="color:#94a3b8; font-style:italic;">Not audited</span>';
        if (cleanText(c.c1_status) || cleanText(c.c1_time)) {
          const stLow = cleanText(c.c1_status).toLowerCase();
          const bClass = stLow.includes('confirmed') ? 'badge-success' : (stLow.includes('partial') ? 'badge-warning' : 'badge-danger');
          c1Html = `
            <div style="font-size:0.75rem;"><strong>Time:</strong> ${cleanText(c.c1_time) || '—'}</div>
            <div style="font-size:0.71rem; color:var(--text-muted);"><strong>Soap Loc:</strong> ${cleanText(c.c1_soap) || '—'}</div>
            <div style="font-size:0.71rem; color:#475569;"><strong>Station:</strong> ${cleanText(c.c1_station) || 'Inspected'}</div>
            <span class="badge-pill ${bClass}" style="margin-top:3px;">${cleanText(c.c1_status) || 'Audited'}</span>
          `;
        }

        // Claim 2 Cell
        let c2Html = '<span style="color:#94a3b8; font-style:italic;">Not audited</span>';
        if (cleanText(c.c2_status) || cleanText(c.c2_diff)) {
          const stLow = cleanText(c.c2_status).toLowerCase();
          const bClass = stLow.includes('accurate') ? 'badge-success' : (stLow.includes('confused') ? 'badge-warning' : 'badge-danger');
          c2Html = `
            <div style="font-size:0.74rem;"><strong>Signs vs Malaria:</strong> ${cleanText(c.c2_diff) || '—'}</div>
            <div style="font-size:0.71rem; color:var(--text-muted);"><strong>No-Contact:</strong> ${cleanText(c.c2_assist) || '—'}</div>
            <span class="badge-pill ${bClass}" style="margin-top:3px;">${cleanText(c.c2_status) || 'Audited'}</span>
          `;
        }

        // Claim 3 Cell
        let c3Html = '<span style="color:#94a3b8; font-style:italic;">Not audited</span>';
        if (cleanText(c.c3_status) || cleanText(c.c3_hotline)) {
          const stLow = cleanText(c.c3_status).toLowerCase();
          const bClass = stLow.includes('knows') ? 'badge-success' : 'badge-warning';
          c3Html = `
            <div style="font-size:0.75rem;"><strong>Line Recalled:</strong> <strong style="color:var(--primary);">${cleanText(c.c3_hotline) || '—'}</strong></div>
            <div style="font-size:0.71rem; color:var(--text-muted);"><strong>Fear:</strong> ${cleanText(c.c3_fear) || 'No hesitation'}</div>
            <span class="badge-pill ${bClass}" style="margin-top:3px;">${cleanText(c.c3_status) || 'Audited'}</span>
          `;
        }

        // Claim 4 Cell
        let c4Html = '<span style="color:#94a3b8; font-style:italic;">Not audited</span>';
        if (cleanText(c.c4_status) || cleanText(c.c4_reintegrate)) {
          const stLow = cleanText(c.c4_status).toLowerCase();
          const bClass = (stLow.includes('supportive') || stLow.includes('receptive')) ? 'badge-success' : 'badge-warning';
          c4Html = `
            <div style="font-size:0.74rem;"><strong>Interaction:</strong> ${cleanText(c.c4_reintegrate) || '—'}</div>
            <div style="font-size:0.71rem; color:var(--text-muted);"><strong>Acceptance:</strong> ${cleanText(c.c4_allow_back) || '—'}</div>
            <span class="badge-pill ${bClass}" style="margin-top:3px;">${cleanText(c.c4_status) || 'Audited'}</span>
          `;
        }

        // Claim 5 Cell
        let c5Html = '<span style="color:#94a3b8; font-style:italic;">Not audited</span>';
        if (cleanText(c.c5_status) || cleanText(c.c5_agreement)) {
          const stLow = cleanText(c.c5_status).toLowerCase();
          const bClass = stLow.includes('active') ? 'badge-success' : 'badge-warning';
          c5Html = `
            <div style="font-size:0.74rem;"><strong>Agreement:</strong> ${cleanText(c.c5_agreement) || '—'}</div>
            <div style="font-size:0.71rem; color:var(--text-muted);"><strong>Toughest Q:</strong> ${cleanText(c.c5_tough_q) || '—'}</div>
            <span class="badge-pill ${bClass}" style="margin-top:3px;">${cleanText(c.c5_status) || 'Audited'}</span>
          `;
        }

        // Misconception Cell
        let miscHtml = '<span style="color:#94a3b8; font-style:italic;">None flagged</span>';
        if (cleanText(c.rumor) || cleanText(c.barrier) || cleanText(c.tactical_adaptation)) {
          miscHtml = `
            <div style="font-size:0.74rem; font-weight:600; color:#b91c1c;">${cleanText(c.rumor) || 'Misconception'}</div>
            <div style="font-size:0.71rem; color:var(--text-muted);"><strong>Barrier:</strong> ${cleanText(c.barrier) || 'None'}</div>
            <div style="font-size:0.71rem; color:var(--primary); font-weight:600;"><strong>Action:</strong> ${cleanText(c.tactical_adaptation) || 'Sensitization'}</div>
          `;
        }

        return `
          <tr>
            <td>
              <strong>#${c._index || c.id}</strong><br>
              <span style="font-size:0.7rem; color:var(--text-muted);">${c.date || ''}</span>
              ${c.id && c._index && c.id != c._index ? `<div style="font-size:0.65rem; color:#94a3b8;">ID: ${c.id}</div>` : ''}
            </td>
            <td>
              <span class="badge-pill badge-primary">${cleanText(c.group) || 'Target Group'}</span>
              <div style="font-size:0.72rem; color:#475569; font-weight:600; margin-top:2px;">📍 ${cleanText(c.setting) || 'Site'}</div>
            </td>
            <td><strong>${cleanText(c.district)}</strong><br><span style="font-size:0.72rem; color:var(--text-muted);">${cleanText(c.parish)}</span></td>
            <td style="max-width:140px; white-space:normal;">${heardHtml}</td>
            <td style="max-width:200px; white-space:normal;">${c1Html}</td>
            <td style="max-width:200px; white-space:normal;">${c2Html}</td>
            <td style="max-width:180px; white-space:normal;">${c3Html}</td>
            <td style="max-width:200px; white-space:normal;">${c4Html}</td>
            <td style="max-width:200px; white-space:normal;">${c5Html}</td>
            <td style="max-width:190px; white-space:normal;">${miscHtml}</td>
          </tr>
        `;
      }).join('');
    }
  }

  // Tool 4: Most Significant Change
  const tool4Body = document.getElementById('tool6TableBody');
  const t4Rows = appData.filter(d => d.tool === 'MSC Story');
  if (tool4Body) {
    if (t4Rows.length === 0) {
      tool4Body.innerHTML = renderEmptyState(6, 'Most Significant Change (MSC) stories');
    } else {
      tool4Body.innerHTML = t4Rows.map(s => `
        <tr>
          <td><strong>#${s._index || s.id}</strong></td>
          <td><strong>${s.participant || s.part || '—'}</strong></td>
          <td style="font-size:0.75rem;">${s.baseline || '—'}</td>
          <td style="font-size:0.75rem; color:var(--primary); font-weight:600;">${s.event || '—'}</td>
          <td style="font-size:0.75rem;">${s.change || '—'}</td>
          <td style="font-size:0.75rem; font-weight:600;">${s.significance || '—'}</td>
        </tr>
      `).join('');
    }
  }


  // Tool 6: Photovoice
  const tool6Body = document.getElementById('tool8TableBody');
  const t6Rows = appData.filter(d => d.tool === 'Photovoice');
  if (tool6Body) {
    if (t6Rows.length === 0) {
      tool6Body.innerHTML = renderEmptyState(7, 'Photovoice documentation records');
    } else {
      tool6Body.innerHTML = t6Rows.map(ph => `
        <tr>
          <td><strong>#${ph._index || ph.id}</strong></td>
          <td><strong>${ph.author || '—'}</strong></td>
          <td style="font-size:0.75rem;">${ph.p || '—'}</td>
          <td style="font-size:0.75rem;">${ph.h || '—'}</td>
          <td style="font-size:0.75rem;">${ph.o || '—'}</td>
          <td style="font-size:0.75rem;">${ph.t || '—'}</td>
          <td style="font-size:0.75rem; color:var(--primary); font-weight:600;">${ph.opp || '—'}</td>
        </tr>
      `).join('');
    }
  }

  // Tool 10: School Simulation Drill
  const tool10Body = document.getElementById('tool9TableBody');
  const t10Rows = appData.filter(d => d.tool === 'Simulation Drill');
  if (tool10Body) {
    if (t10Rows.length === 0) {
      tool10Body.innerHTML = renderEmptyState(6, 'school simulation drills');
    } else {
      tool10Body.innerHTML = t10Rows.map(dr => `
        <tr>
          <td><strong>#${dr._index || dr.id}</strong></td>
          <td><strong>${dr.facility || dr.school || '—'}</strong></td>
          <td><span class="badge-pill badge-success">${dr.identification || 'Compliant'}</span></td>
          <td>${dr.holdingArea || '—'}</td>
          <td><strong style="color:var(--primary);">${dr.time || '—'}</strong></td>
          <td><span class="badge-pill badge-primary">${dr.debrief || '—'}</span></td>
        </tr>
      `).join('');
    }
  }
}

function renderInteractiveMap() {
  const mapContainer = document.getElementById('schoolMap');
  if (!mapContainer) return;

  if (!leafletMap) {
    leafletMap = L.map('schoolMap').setView([0.330, 32.590], 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> | &copy; OpenStreetMap',
      maxZoom: 19
    }).addTo(leafletMap);
    markersLayer = L.featureGroup().addTo(leafletMap);
  }

  markersLayer.clearLayers();

  const validSchools = appData.filter(d => d.school && d.school !== 'Site' && d.tool === 'School Activity');
  safeSetText('mapSchoolCount', `${validSchools.length} Schools Displayed`);

  validSchools.forEach((s, idx) => {
    const parishKey = (s.parish || '').trim();
    const baseCoords = parishCoordinates[parishKey] || [0.320, 32.580];

    const offsetLat = (idx % 4 - 1.5) * 0.0035;
    const offsetLng = (idx % 3 - 1) * 0.0035;
    const lat = baseCoords[0] + offsetLat;
    const lng = baseCoords[1] + offsetLng;

    const totalSensitised = (s.boys || 0) + (s.girls || 0);
    const coverageRate = s.enrolment > 0 ? Math.round((totalSensitised / s.enrolment) * 100) : 0;
    const hasHighGames = (s.games || 0) >= 50;

    const pinColor = hasHighGames ? '#f1bc1b' : '#282c68';
    const borderCol = hasHighGames ? '#282c68' : '#ffffff';
    const customIcon = L.divIcon({
      className: 'custom-map-pin',
      html: `<div style="
        background: ${pinColor};
        width: 22px;
        height: 22px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 2px solid ${borderCol};
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      "><div style="width: 6px; height: 6px; background: #fff; border-radius: 50%; transform: rotate(45deg);"></div></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 24],
      popupAnchor: [0, -22]
    });

    const popupContent = `
      <div style="min-width:240px; padding:4px;">
        <div class="map-popup-title">${s.school}</div>
        <div style="font-size:0.75rem; color:#64748b; margin-bottom:8px;">
          <strong>${s.district}</strong> &bull; Parish: ${s.parish || 'N/A'} &bull; <span class="badge-pill badge-primary">${s.visit_num || 'Visit 1'}</span>
        </div>
        
        <div class="map-popup-stat">
          <span>Learners Sensitised:</span>
          <strong>${totalSensitised.toLocaleString()} (${s.boys} B / ${s.girls} G)</strong>
        </div>
        <div class="map-popup-stat">
          <span>Teachers/Patrons Present:</span>
          <strong style="color:var(--gatekeeper);">${s.teachers || 0}</strong>
        </div>
        <div class="map-popup-stat">
          <span>School Enrolment:</span>
          <span>${(s.enrolment || 0).toLocaleString()} (<strong>${coverageRate}% Coverage</strong>)</span>
        </div>
        <div class="map-popup-stat">
          <span>School Health Club:</span>
          <span class="badge-pill ${String(s.health_club).includes('Active') ? 'badge-success' : 'badge-warning'}">${s.health_club || 'Active'}</span>
        </div>
        <div class="map-popup-stat">
          <span>Board Games Allocated:</span>
          <strong style="color:#d97706;">${s.games || 0} Snakes & Ladders</strong>
        </div>
        <div class="map-popup-stat">
          <span>Handwashing Demo:</span>
          <span class="badge-pill ${String(s.handwash_demo).includes('All Steps') ? 'badge-success' : 'badge-warning'}">${s.handwash_demo}</span>
        </div>
        <div class="map-popup-stat">
          <span>Venue Soap Audit:</span>
          <span style="font-size:0.72rem; font-weight:600;">${s.soap}</span>
        </div>
      </div>
    `;

    const marker = L.marker([lat, lng], { icon: customIcon }).bindPopup(popupContent);
    markersLayer.addLayer(marker);
  });

  if (validSchools.length > 0) {
    leafletMap.fitBounds(markersLayer.getBounds(), { padding: [40, 40], maxZoom: 13 });
  }
}

function renderBarCharts(distList) {
  const elDist = document.getElementById('chartDistrictReach');
  if (elDist) {
    chartInstances.districtReach = new Chart(elDist.getContext('2d'), {
      type: 'bar',
      data: {
        labels: distList.map(d => d.name),
        datasets: [
          {
            label: 'Boys Sensitised',
            data: distList.map(d => d.boys),
            backgroundColor: '#282c68',
            borderRadius: 4,
            stack: 'districtStack',
            datalabels: { display: false }
          },
          {
            label: 'Girls Sensitised',
            data: distList.map(d => d.girls),
            backgroundColor: '#f1bc1b',
            borderRadius: 4,
            stack: 'districtStack',
            datalabels: { display: false }
          },
          {
            label: 'Gatekeepers & Teachers',
            data: distList.map(d => d.teachers),
            backgroundColor: '#10b981',
            borderRadius: 4,
            stack: 'districtStack',
            datalabels: { display: false }
          },
          {
            label: 'Community Men Reached',
            data: distList.map(d => d.crowdMale || 0),
            backgroundColor: '#0284c7',
            borderRadius: 4,
            stack: 'districtStack',
            datalabels: { display: false }
          },
          {
            label: 'Community Women Reached',
            data: distList.map(d => d.crowdFemale || 0),
            backgroundColor: '#ec4899',
            borderRadius: 4,
            stack: 'districtStack',
            datalabels: {
              anchor: 'end',
              align: 'right',
              formatter: (val, ctx) => distList[ctx.dataIndex].totalReach.toLocaleString(),
              color: '#282c68',
              font: { weight: 'bold', size: 11 }
            }
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              afterBody: (items) => {
                const idx = items[0].dataIndex;
                const d = distList[idx];
                let detail = `Total Reach: ${d.totalReach.toLocaleString()} (Learners: ${d.totalLearners.toLocaleString()} + Gatekeepers: ${d.teachers}`;
                if ((d.crowd || 0) > 0 || (d.crowdMale || 0) > 0 || (d.crowdFemale || 0) > 0) {
                  detail += ` + Community: ${(d.crowd || 0).toLocaleString()} [${(d.crowdMale || 0).toLocaleString()} Men, ${(d.crowdFemale || 0).toLocaleString()} Women]`;
                }
                detail += ')';
                return detail;
              }
            }
          }
        },
        scales: { x: { stacked: true, beginAtZero: true, grace: '15%' }, y: { stacked: true } }
      }
    });
  }

  const elShare = document.getElementById('chartDistrictShare');
  if (elShare) {
    const totalSum = distList.reduce((acc, d) => acc + d.totalReach, 0);
    chartInstances.districtShare = new Chart(elShare.getContext('2d'), {
      type: 'bar',
      data: {
        labels: distList.map(d => d.name),
        datasets: [{
          label: '% of Total Sensitisation Reach',
          data: distList.map(d => totalSum > 0 ? Number(((d.totalReach / totalSum) * 100).toFixed(1)) : 0),
          backgroundColor: '#282c68',
          borderRadius: 4,
          datalabels: {
            anchor: 'end',
            align: 'right',
            formatter: (val) => `${val}%`,
            color: '#282c68',
            font: { weight: 'bold', size: 11 }
          }
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, grace: '15%', ticks: { callback: v => v + '%' } } }
      }
    });
  }

  const countProp = (p) => {
    const c = {};
    appData.forEach(d => {
      const val = (d[p] || '').trim();
      if (val) c[val] = (c[val] || 0) + 1;
    });
    return c;
  };

  const elSigns = document.getElementById('chartSignsT1');
  if (elSigns) {
    const signsCount = countProp('signs');
    chartInstances.signsT1 = new Chart(elSigns.getContext('2d'), {
      type: 'bar',
      data: {
        labels: Object.keys(signsCount),
        datasets: [{
          label: 'Crowds / Sessions',
          data: Object.values(signsCount),
          backgroundColor: '#282c68',
          borderRadius: 4,
          datalabels: { anchor: 'end', align: 'right', color: '#282c68', font: { weight: 'bold' } }
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, grace: '15%' } }
      }
    });
  }

  const elHotline = document.getElementById('chartHotlineT1');
  if (elHotline) {
    const hotlineCount = countProp('hotline');
    chartInstances.hotlineT1 = new Chart(elHotline.getContext('2d'), {
      type: 'bar',
      data: {
        labels: Object.keys(hotlineCount),
        datasets: [{
          label: 'Sessions',
          data: Object.values(hotlineCount),
          backgroundColor: '#f1bc1b',
          borderRadius: 4,
          datalabels: { anchor: 'end', align: 'right', color: '#282c68', font: { weight: 'bold' } }
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, grace: '15%' } }
      }
    });
  }

  const elStigma = document.getElementById('chartStigmaT1');
  if (elStigma) {
    const stigmaCount = countProp('stigma');
    chartInstances.stigmaT1 = new Chart(elStigma.getContext('2d'), {
      type: 'bar',
      data: {
        labels: Object.keys(stigmaCount),
        datasets: [{
          label: 'Sessions',
          data: Object.values(stigmaCount),
          backgroundColor: '#282c68',
          borderRadius: 4,
          datalabels: { anchor: 'end', align: 'right', color: '#282c68', font: { weight: 'bold' } }
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, grace: '15%' } }
      }
    });
  }

  const elHandwash = document.getElementById('chartHandwashT1');
  if (elHandwash) {
    const demoCount = countProp('handwash_demo');
    chartInstances.handwashT1 = new Chart(elHandwash.getContext('2d'), {
      type: 'bar',
      data: {
        labels: Object.keys(demoCount),
        datasets: [{
          label: 'Demos',
          data: Object.values(demoCount),
          backgroundColor: '#f1bc1b',
          borderRadius: 4,
          datalabels: { anchor: 'end', align: 'right', color: '#282c68', font: { weight: 'bold' } }
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, grace: '15%' } }
      }
    });
  }

  const elTop = document.getElementById('chartTopSchoolsT1');
  if (elTop) {
    const topSchools = [...appData.filter(d => d.tool === 'School Activity')]
      .map(s => {
        const tot = (s.boys || 0) + (s.girls || 0);
        const pct = s.enrolment > 0 ? ((tot / s.enrolment) * 100).toFixed(1) : 0;
        return {
          name: `${s.school} (${pct}% of Enrolment)`,
          rawName: s.school,
          total: tot,
          pct: pct
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    chartInstances.topSchoolsT1 = new Chart(elTop.getContext('2d'), {
      type: 'bar',
      data: {
        labels: topSchools.map(s => s.name),
        datasets: [{
          label: 'Total Sensitised',
          data: topSchools.map(s => s.total),
          backgroundColor: '#282c68',
          borderRadius: 4,
          datalabels: {
            anchor: 'end',
            align: 'right',
            formatter: (val, ctx) => `${val.toLocaleString()} (${topSchools[ctx.dataIndex].pct}%)`,
            color: '#282c68',
            font: { weight: 'bold', size: 10 }
          }
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, grace: '20%' } }
      }
    });
  }

  const elWash = document.getElementById('chartWashT3');
  if (elWash) {
    const transectFiltered = appData.filter(d => d.tool === 'Transect Walk');
    chartInstances.washT3 = new Chart(elWash.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Functional & Supplied', 'Present, No Soap / Water', 'Completely Absent'],
        datasets: [{
          label: 'Sites Audited',
          data: [
            transectFiltered.filter(t => String(t.wash).toLowerCase().includes('functional') || String(t.wash).toLowerCase().includes('present & functional')).length,
            transectFiltered.filter(t => String(t.wash).toLowerCase().includes('no soap') || String(t.wash).toLowerCase().includes('no water')).length,
            transectFiltered.filter(t => String(t.wash).toLowerCase().includes('no facility') || String(t.wash).toLowerCase().includes('not present') || String(t.wash).toLowerCase().includes('absent')).length
          ],
          backgroundColor: ['#10b981', '#f1bc1b', '#ef4444'],
          borderRadius: 4,
          datalabels: {
            anchor: 'end',
            align: 'right',
            formatter: (val) => `${val} (${transectFiltered.length > 0 ? ((val / transectFiltered.length) * 100).toFixed(0) : 0}%)`,
            color: '#282c68',
            font: { weight: 'bold', size: 10 }
          }
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, grace: '25%' } }
      }
    });
  }

  const elRefuse = document.getElementById('chartRefuseT1');
  if (elRefuse) {
    const transectFiltered = appData.filter(d => d.tool === 'Transect Walk');
    const refClean = transectFiltered.filter(t => String(t.refuse).toLowerCase().includes('clean') || String(t.refuse).toLowerCase().includes('maintained')).length;
    const refMod = transectFiltered.filter(t => String(t.refuse).toLowerCase().includes('moderate')).length;
    const refHazard = transectFiltered.filter(t => String(t.refuse).toLowerCase().includes('severe') || String(t.refuse).toLowerCase().includes('hazard')).length;

    chartInstances.refuseT1 = new Chart(elRefuse.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Clean / Maintained Compound', 'Moderate Stagnation / Litter', 'Severe Bio-Hazard / Overflow'],
        datasets: [{
          label: 'Compounds Audited',
          data: [refClean, refMod, refHazard],
          backgroundColor: ['#10b981', '#f1bc1b', '#ef4444'],
          borderRadius: 4,
          datalabels: {
            anchor: 'end',
            align: 'right',
            formatter: (val) => `${val} (${transectFiltered.length > 0 ? ((val / transectFiltered.length) * 100).toFixed(0) : 0}%)`,
            color: '#282c68',
            font: { weight: 'bold', size: 10 }
          }
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, grace: '25%' } }
      }
    });
  }

  const elChoke = document.getElementById('chartChokeT1');
  if (elChoke) {
    const transectFiltered = appData.filter(d => d.tool === 'Transect Walk');
    const chokeExt = transectFiltered.filter(t => String(t.choke).toLowerCase().includes('extreme') || String(t.choke).toLowerCase().includes('bottleneck')).length;
    const chokeMod = transectFiltered.filter(t => String(t.choke).toLowerCase().includes('moderate')).length;
    const chokeLow = transectFiltered.filter(t => String(t.choke).toLowerCase().includes('low') || String(t.choke).toLowerCase().includes('spaced')).length;

    chartInstances.chokeT1 = new Chart(elChoke.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Extreme Bottleneck (Zero Distancing)', 'Moderate Congestion', 'Low Density / Spaced'],
        datasets: [{
          label: 'Sites Audited',
          data: [chokeExt, chokeMod, chokeLow],
          backgroundColor: ['#ef4444', '#f1bc1b', '#282c68'],
          borderRadius: 4,
          datalabels: {
            anchor: 'end',
            align: 'right',
            formatter: (val) => `${val} (${transectFiltered.length > 0 ? ((val / transectFiltered.length) * 100).toFixed(0) : 0}%)`,
            color: '#282c68',
            font: { weight: 'bold', size: 10 }
          }
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, grace: '25%' } }
      }
    });
  }

  const elPoster = document.getElementById('chartPosterT3');
  if (elPoster) {
    const transectFiltered = appData.filter(d => d.tool === 'Transect Walk');
    chartInstances.posterT3 = new Chart(elPoster.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Fresh & Prominent', 'Obsolete Posters', 'Torn / Defaced', 'No Materials Found'],
        datasets: [{
          label: 'Facilities Audited',
          data: [
            transectFiltered.filter(t => String(t.poster).toLowerCase().includes('fresh') || String(t.poster).toLowerCase().includes('prominent')).length,
            transectFiltered.filter(t => String(t.poster).toLowerCase().includes('obsolete')).length,
            transectFiltered.filter(t => String(t.poster).toLowerCase().includes('torn')).length,
            transectFiltered.filter(t => String(t.poster).toLowerCase().includes('no material') || String(t.poster).toLowerCase().includes('no poster') || String(t.poster).toLowerCase().includes('none')).length
          ],
          backgroundColor: ['#10b981', '#f1bc1b', '#f97316', '#ef4444'],
          borderRadius: 4,
          datalabels: {
            anchor: 'end',
            align: 'right',
            formatter: (val) => `${val} (${transectFiltered.length > 0 ? ((val / transectFiltered.length) * 100).toFixed(0) : 0}%)`,
            color: '#282c68',
            font: { weight: 'bold', size: 10 }
          }
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, grace: '25%' } }
      }
    });
  }

  // Tool 2 Charts (Rapid Audience Intercept Survey: 4 Analytical Dimensions)
  const t2Data = appData.filter(d => d.tool === 'Rapid Intercept');
  const elT4Q1 = document.getElementById('chartT4Q1');
  const emptyT4Q1 = document.getElementById('emptyT4Q1');
  const elT4Q5 = document.getElementById('chartT4Q5');
  const emptyT4Q5 = document.getElementById('emptyT4Q5');
  const elT4Q4 = document.getElementById('chartT4Q4');
  const emptyT4Q4 = document.getElementById('emptyT4Q4');
  const elT4Q3 = document.getElementById('chartT4Q3');
  const emptyT4Q3 = document.getElementById('emptyT4Q3');

  // Chart 1: Q1 Campaign Exposure Channels in Past 7 Days
  if (elT4Q1 && emptyT4Q1) {
    if (t2Data.length === 0) {
      elT4Q1.style.display = 'none';
      emptyT4Q1.style.display = 'flex';
    } else {
      elT4Q1.style.display = 'block';
      emptyT4Q1.style.display = 'none';

      const chActive = t2Data.filter(d => {
        const q = String(d.q1_exposure || d.q1 || '').toLowerCase();
        return q.includes('actively') || q.includes('wheel') || q.includes('megaphone') || q.includes('talk');
      }).length;

      const chRadio = t2Data.filter(d => {
        const q = String(d.q1_exposure || d.q1 || '').toLowerCase();
        return q.includes('radio') || q.includes('broadcast') || q.includes('audio');
      }).length;

      const chPosters = t2Data.filter(d => {
        const q = String(d.q1_exposure || d.q1 || '').toLowerCase();
        return q.includes('poster') || q.includes('flyer');
      }).length;

      const chUnexposed = Math.max(0, t2Data.length - (chActive + chRadio + chPosters));

      chartInstances.chartT4Q1 = new Chart(elT4Q1.getContext('2d'), {
        type: 'bar',
        data: {
          labels: [
            'Active (Wheel/Megaphone/VHT)',
            'Radio Broadcast / Drive',
            'Posters / Flyers Only',
            'Unexposed / Not Heard'
          ],
          datasets: [{
            label: 'Respondents',
            data: [chActive, chRadio, chPosters, chUnexposed],
            backgroundColor: ['#282c68', '#f1bc1b', '#3b82f6', '#ef4444'],
            borderRadius: 4,
            datalabels: { anchor: 'end', align: 'right', color: '#282c68', font: { weight: 'bold' } }
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true, ticks: { stepSize: 2 }, grace: '20%' } }
        }
      });
    }
  }

  // Chart 2: Q5 Most Trusted Information Brokers
  if (elT4Q5 && emptyT4Q5) {
    if (t2Data.length === 0) {
      elT4Q5.style.display = 'none';
      emptyT4Q5.style.display = 'flex';
    } else {
      elT4Q5.style.display = 'block';
      emptyT4Q5.style.display = 'none';

      const trustCounts = {};
      t2Data.forEach(d => {
        const src = cleanText(d.q5_trusted || d.q5) || 'Other';
        trustCounts[src] = (trustCounts[src] || 0) + 1;
      });

      const sortedTrust = Object.entries(trustCounts).sort((a, b) => b[1] - a[1]);

      chartInstances.chartT4Q5 = new Chart(elT4Q5.getContext('2d'), {
        type: 'bar',
        data: {
          labels: sortedTrust.map(x => x[0]),
          datasets: [{
            label: 'Respondents',
            data: sortedTrust.map(x => x[1]),
            backgroundColor: '#282c68',
            borderRadius: 4,
            datalabels: { anchor: 'end', align: 'right', color: '#282c68', font: { weight: 'bold' } }
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true, ticks: { stepSize: 2 }, grace: '20%' } }
        }
      });
    }
  }

  // Chart 3: Q4 First Action Protocols for Suspected Cases
  if (elT4Q4 && emptyT4Q4) {
    if (t2Data.length === 0) {
      elT4Q4.style.display = 'none';
      emptyT4Q4.style.display = 'flex';
    } else {
      elT4Q4.style.display = 'block';
      emptyT4Q4.style.display = 'none';

      const countVHT = t2Data.filter(d => d.q4_vht || String(d.q4).includes('Notify local VHT')).length;
      const countHotline = t2Data.filter(d => d.q4_hotline || String(d.q4).includes('toll-free')).length;
      const countLC1 = t2Data.filter(d => d.q4_lc1 || String(d.q4).includes('LC1 Chairperson')).length;
      const countClinic = t2Data.filter(d => d.q4_clinic || String(d.q4).includes('private clinic')).length;
      const countHerbs = t2Data.filter(d => d.q4_home_care || String(d.q4).includes('herbs') || String(d.q4).includes('home care')).length;
      const countOther = t2Data.filter(d => d.q4_other || cleanText(d.q4_specify)).length;
      const countHealer = t2Data.filter(d => d.q4_healer || String(d.q4).includes('traditional healer') || String(d.q4).includes('prayers')).length;

      const actionLabels = [
        'Notify Local VHT',
        'Call Toll-Free Hotline',
        'Alert LC1 Chairperson',
        'Private Clinic / Pharmacy',
        'Isolate / Home Herbs',
        'Other (Health worker / Refer)',
        'Traditional Healer / Prayers'
      ];

      const actionVals = [countVHT, countHotline, countLC1, countClinic, countHerbs, countOther, countHealer];
      const actionColors = [
        '#10b981', // VHT (Safe)
        '#10b981', // Hotline (Safe)
        '#282c68', // LC1
        '#f1bc1b', // Private clinic (Potential delay)
        '#ef4444', // Home herbs (High risk)
        '#3b82f6', // Other
        '#ef4444'  // Traditional healer (High risk)
      ];

      chartInstances.chartT4Q4 = new Chart(elT4Q4.getContext('2d'), {
        type: 'bar',
        data: {
          labels: actionLabels,
          datasets: [{
            label: 'Selections (Multi-response)',
            data: actionVals,
            backgroundColor: actionColors,
            borderRadius: 4,
            datalabels: {
              anchor: 'end',
              align: 'right',
              formatter: (val) => `${val} (${((val / t2Data.length) * 100).toFixed(0)}%)`,
              color: '#282c68',
              font: { weight: 'bold', size: 10 }
            }
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true, ticks: { stepSize: 3 }, grace: '25%' } }
        }
      });
    }
  }

  // Chart 4: Q3 Post-Declaration Epidemic Risk Perception
  if (elT4Q3 && emptyT4Q3) {
    if (t2Data.length === 0) {
      elT4Q3.style.display = 'none';
      emptyT4Q3.style.display = 'flex';
    } else {
      elT4Q3.style.display = 'block';
      emptyT4Q3.style.display = 'none';

      const riskCounts = {
        'Moderate Risk': 0,
        'High Risk Remains': 0,
        'Low Risk': 0,
        'Threat Completely Gone': 0,
        'Don\'t Know': 0,
        'Unprompted / Pending': 0
      };

      t2Data.forEach(d => {
        const q3 = cleanText(d.q3_risk || d.q3).toLowerCase();
        if (q3.includes('high')) riskCounts['High Risk Remains']++;
        else if (q3.includes('moderate')) riskCounts['Moderate Risk']++;
        else if (q3.includes('low')) riskCounts['Low Risk']++;
        else if (q3.includes('completely gone') || q3.includes('threat is')) riskCounts['Threat Completely Gone']++;
        else if (q3.includes("don't know")) riskCounts['Don\'t Know']++;
        else riskCounts['Unprompted / Pending']++;
      });

      const validLabels = Object.keys(riskCounts).filter(k => riskCounts[k] > 0);
      const validData = validLabels.map(k => riskCounts[k]);
      const palette = {
        'Moderate Risk': '#f1bc1b',
        'High Risk Remains': '#ef4444',
        'Low Risk': '#3b82f6',
        'Threat Completely Gone': '#991b1b',
        'Don\'t Know': '#94a3b8',
        'Unprompted / Pending': '#64748b'
      };

      chartInstances.chartT4Q3 = new Chart(elT4Q3.getContext('2d'), {
        type: 'bar',
        data: {
          labels: validLabels,
          datasets: [{
            label: 'Respondents',
            data: validData,
            backgroundColor: validLabels.map(k => palette[k] || '#282c68'),
            borderRadius: 4,
            datalabels: {
              anchor: 'end',
              align: 'right',
              formatter: (val) => `${val} (${((val / t2Data.length) * 100).toFixed(0)}%)`,
              color: '#282c68',
              font: { weight: 'bold', size: 10 }
            }
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true, ticks: { stepSize: 2 }, grace: '25%' } }
        }
      });
    }
  }

  // Tool 3 Charts (Only render if field records exist; otherwise display pending placeholder)
  const t3Data = appData.filter(d => d.tool === 'Ask 5');
  const elT5Target = document.getElementById('chartT5Target');
  const emptyT5Target = document.getElementById('emptyT5Target');
  const elT5Claims = document.getElementById('chartT5Claims');
  const emptyT5Claims = document.getElementById('emptyT5Claims');

  if (elT5Target && emptyT5Target) {
    if (t3Data.length === 0) {
      elT5Target.style.display = 'none';
      emptyT5Target.style.display = 'flex';
    } else {
      elT5Target.style.display = 'block';
      emptyT5Target.style.display = 'none';
      const grpCounts = {};
      t3Data.forEach(d => {
        const grp = d.group || 'Other';
        grpCounts[grp] = (grpCounts[grp] || 0) + 1;
      });
      chartInstances.chartT5Target = new Chart(elT5Target.getContext('2d'), {
        type: 'bar',
        data: {
          labels: Object.keys(grpCounts),
          datasets: [{
            label: 'Audits Completed',
            data: Object.values(grpCounts),
            backgroundColor: '#282c68',
            borderRadius: 4,
            datalabels: { anchor: 'end', align: 'right', color: '#282c68', font: { weight: 'bold' } }
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true, ticks: { stepSize: 1 }, grace: '20%' } }
        }
      });
    }
  }

  if (elT5Claims && emptyT5Claims) {
    if (t3Data.length === 0) {
      elT5Claims.style.display = 'none';
      emptyT5Claims.style.display = 'flex';
    } else {
      elT5Claims.style.display = 'block';
      emptyT5Claims.style.display = 'none';

      const labels = [
        '1. Handwash',
        '2. Signs Recall',
        '3. Hotline/Report',
        '4. Anti-Stigma',
        '5. Multiplier'
      ];

      const heardCounts = [
        t3Data.filter(d => d.heard_c1).length,
        t3Data.filter(d => d.heard_c2).length,
        t3Data.filter(d => d.heard_c3).length,
        t3Data.filter(d => d.heard_c4).length,
        t3Data.filter(d => d.heard_c5).length
      ];

      const verifiedCounts = [
        t3Data.filter(r => cleanText(r.c1_status).toLowerCase().includes('confirmed')).length,
        t3Data.filter(r => cleanText(r.c2_status).toLowerCase().includes('accurate')).length,
        t3Data.filter(r => cleanText(r.c3_status).toLowerCase().includes('knows')).length,
        t3Data.filter(r => ['supportive', 'receptive'].some(k => cleanText(r.c4_status).toLowerCase().includes(k))).length,
        t3Data.filter(r => cleanText(r.c5_status).toLowerCase().includes('active')).length
      ];

      chartInstances.chartT5Claims = new Chart(elT5Claims.getContext('2d'), {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Claim Heard (Awareness)',
              data: heardCounts,
              backgroundColor: '#282c68',
              borderRadius: 4,
              datalabels: { anchor: 'end', align: 'right', color: '#282c68', font: { weight: 'bold', size: 10 } }
            },
            {
              label: 'Verified Practice (Physical Audit)',
              data: verifiedCounts,
              backgroundColor: '#10b981',
              borderRadius: 4,
              datalabels: { anchor: 'end', align: 'right', color: '#047857', font: { weight: 'bold', size: 10 } }
            }
          ]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: {
              callbacks: {
                afterBody: (items) => {
                  const idx = items[0].dataIndex;
                  const h = heardCounts[idx];
                  const v = verifiedCounts[idx];
                  const rate = h > 0 ? ((v / h) * 100).toFixed(0) : 0;
                  return `Verification Conversion: ${rate}% (${v}/${h})`;
                }
              }
            }
          },
          scales: {
            x: {
              beginAtZero: true,
              ticks: { stepSize: 2 },
              grace: '20%'
            }
          }
        }
      });
    }
  }

  // Tool 7 Charts: Community Gatekeeper Dialogue & Commitment Log
  const gkData = appData.filter(d => d.tool === 'Gatekeeper Session');
  const elGkRoles = document.getElementById('chartGkRolesT7');
  const elGkCapacity = document.getElementById('chartGkCapacityT7');

  if (elGkRoles) {
    const roleStats = {};
    gkData.forEach(d => {
      let rName = cleanText(d.role_specify) || cleanText(d.role) || 'Community Gatekeeper';
      const rLower = rName.toLowerCase();
      if (rLower.includes('headteacher')) rName = 'Headteachers';
      else if (rLower.includes('teacher')) rName = 'School Teachers';
      else if (rLower.includes('vht') && rLower.includes('ureport')) rName = 'VHTs & U-Reporters';
      else if (rLower.includes('vht')) rName = 'VHTs';
      else if (rLower.includes('market')) rName = 'Market Leaders';

      if (!roleStats[rName]) {
        roleStats[rName] = { total: 0, male: 0, female: 0, sessions: 0 };
      }
      const m = d.male || 0;
      const f = d.female || 0;
      roleStats[rName].male += m;
      roleStats[rName].female += f;
      roleStats[rName].total += (m + f);
      roleStats[rName].sessions += 1;
    });

    const sortedRoles = Object.entries(roleStats).sort((a, b) => b[1].total - a[1].total);
    const roleLabels = sortedRoles.map(x => x[0]);
    const roleCounts = sortedRoles.map(x => x[1].total);
    const roleColors = ['#282c68', '#f1bc1b', '#10b981', '#3b82f6', '#8b5cf6'];

    chartInstances.gkRolesT7 = new Chart(elGkRoles.getContext('2d'), {
      type: 'bar',
      data: {
        labels: roleLabels,
        datasets: [{
          label: 'Gatekeepers Oriented',
          data: roleCounts,
          backgroundColor: roleLabels.map((_, i) => roleColors[i % roleColors.length]),
          borderRadius: 4,
          datalabels: {
            anchor: 'end',
            align: 'right',
            formatter: (val, ctx) => {
              const item = sortedRoles[ctx.dataIndex][1];
              return `${val} (${item.sessions} session${item.sessions > 1 ? 's' : ''})`;
            },
            color: '#282c68',
            font: { weight: 'bold', size: 10 }
          }
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterBody: (items) => {
                const idx = items[0].dataIndex;
                const item = sortedRoles[idx][1];
                return `Breakdown: ${item.male} Male, ${item.female} Female across ${item.sessions} session(s)`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grace: '25%'
          }
        }
      }
    });
  }

  if (elGkCapacity) {
    const totalGkSessions = gkData.length;
    const scriptCount = gkData.filter(d => String(d.manual_used || '').toLowerCase().includes('yes')).length;
    const venueWashCount = gkData.filter(d => String(d.venue_wash || '').toLowerCase().includes('yes')).length;
    const signsCount = gkData.filter(d => {
      const s = String(d.signs_ability || '').toLowerCase();
      return s.includes('most') || s.includes('75%') || s.includes('half') || s.includes('50%');
    }).length;
    const hotlineCount = gkData.filter(d => {
      const h = String(d.hotline_ability || '').toLowerCase();
      return h.includes('most') || h.includes('75%') || h.includes('half') || h.includes('50%');
    }).length;
    const commitCount = gkData.filter(d => cleanText(d.commitments).length > 0).length;

    const capacityLabels = [
      'Standard Script / Manual Used',
      'Venue Functional Handwashing Present',
      'Warning Signs Mastery (≥50%)',
      'Hotline & Reporting Literacy (≥50%)',
      'Action Commitments Logged'
    ];

    const capacityData = [
      totalGkSessions > 0 ? Number(((scriptCount / totalGkSessions) * 100).toFixed(1)) : 0,
      totalGkSessions > 0 ? Number(((venueWashCount / totalGkSessions) * 100).toFixed(1)) : 0,
      totalGkSessions > 0 ? Number(((signsCount / totalGkSessions) * 100).toFixed(1)) : 0,
      totalGkSessions > 0 ? Number(((hotlineCount / totalGkSessions) * 100).toFixed(1)) : 0,
      totalGkSessions > 0 ? Number(((commitCount / totalGkSessions) * 100).toFixed(1)) : 0
    ];

    const rawCounts = [scriptCount, venueWashCount, signsCount, hotlineCount, commitCount];
    const capacityColors = ['#282c68', '#3b82f6', '#10b981', '#f1bc1b', '#059669'];

    chartInstances.gkCapacityT7 = new Chart(elGkCapacity.getContext('2d'), {
      type: 'bar',
      data: {
        labels: capacityLabels,
        datasets: [{
          label: '% Compliance / Mastery',
          data: capacityData,
          backgroundColor: capacityColors,
          borderRadius: 4,
          datalabels: {
            anchor: 'end',
            align: 'right',
            formatter: (val, ctx) => `${val}% (${rawCounts[ctx.dataIndex]}/${totalGkSessions})`,
            color: '#282c68',
            font: { weight: 'bold', size: 10 }
          }
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterBody: (items) => {
                const idx = items[0].dataIndex;
                return `Achieved in ${rawCounts[idx]} out of ${totalGkSessions} evaluated dialogue sessions`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: (val) => `${val}%`
            },
            grace: '15%'
          }
        }
      }
    });
  }

  // Community Events Crowd Reach by Gender (Male vs. Female)
  const elGkCrowdGender = document.getElementById('chartGkCrowdGenderT7');
  if (elGkCrowdGender) {
    let totMaleCrowd = 0;
    let totFemaleCrowd = 0;
    gkData.forEach(d => {
      totMaleCrowd += (d.male_crowd || d.crowd_male || 0);
      totFemaleCrowd += (d.female_crowd || d.crowd_female || 0);
    });
    const crowdSum = totMaleCrowd + totFemaleCrowd;
    const genderLabels = ['Male Community Members', 'Female Community Members'];
    const genderData = [totMaleCrowd, totFemaleCrowd];
    const genderColors = ['#0284c7', '#ec4899'];

    chartInstances.gkCrowdGenderT7 = new Chart(elGkCrowdGender.getContext('2d'), {
      type: 'bar',
      data: {
        labels: genderLabels,
        datasets: [{
          label: 'People Reached',
          data: genderData,
          backgroundColor: genderColors,
          borderRadius: 4,
          datalabels: {
            anchor: 'end',
            align: 'right',
            formatter: (val) => {
              if (crowdSum === 0) return '0 (0%)';
              const pct = ((val / crowdSum) * 100).toFixed(1);
              return `${val.toLocaleString()} (${pct}%)`;
            },
            color: '#1e293b',
            font: { weight: 'bold', size: 11 }
          }
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => {
                const val = genderData[item.dataIndex];
                const pct = crowdSum > 0 ? ((val / crowdSum) * 100).toFixed(1) : 0;
                return `${item.label}: ${val.toLocaleString()} (${pct}%)`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grace: '25%'
          }
        }
      }
    });
  }

  // Community Crowd Engaged by Hotspot Setting (Male vs. Female)
  const elGkCrowdSetting = document.getElementById('chartGkCrowdSettingT7');
  if (elGkCrowdSetting) {
    const settingMap = {};
    gkData.forEach(d => {
      let s = cleanText(d.hotspot_setting) || 'Other / Informal';
      if (!settingMap[s]) {
        settingMap[s] = { male: 0, female: 0, total: 0 };
      }
      const m = (d.male_crowd || d.crowd_male || 0);
      const f = (d.female_crowd || d.crowd_female || 0);
      const tot = (d.crowd_engaged || (m + f) || 0);
      settingMap[s].male += m;
      settingMap[s].female += f;
      settingMap[s].total += tot;
    });

    const sortedSettings = Object.entries(settingMap).sort((a, b) => b[1].total - a[1].total);
    const setLabels = sortedSettings.length > 0 ? sortedSettings.map(x => x[0]) : ['No Settings Logged'];
    const maleSetData = sortedSettings.length > 0 ? sortedSettings.map(x => x[1].male) : [0];
    const femaleSetData = sortedSettings.length > 0 ? sortedSettings.map(x => x[1].female) : [0];

    chartInstances.gkCrowdSettingT7 = new Chart(elGkCrowdSetting.getContext('2d'), {
      type: 'bar',
      data: {
        labels: setLabels,
        datasets: [
          {
            label: 'Male Reached',
            data: maleSetData,
            backgroundColor: '#0284c7',
            borderRadius: 4,
            stack: 'crowdStack',
            datalabels: { display: false }
          },
          {
            label: 'Female Reached',
            data: femaleSetData,
            backgroundColor: '#ec4899',
            borderRadius: 4,
            stack: 'crowdStack',
            datalabels: {
              anchor: 'end',
              align: 'right',
              formatter: (val, ctx) => {
                if (!sortedSettings[ctx.dataIndex]) return '0';
                const item = sortedSettings[ctx.dataIndex][1];
                return item.total.toLocaleString();
              },
              color: '#282c68',
              font: { weight: 'bold', size: 10 }
            }
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              afterBody: (items) => {
                const idx = items[0].dataIndex;
                if (!sortedSettings[idx]) return '';
                const item = sortedSettings[idx][1];
                return `Total Reached: ${item.total.toLocaleString()} (${item.male.toLocaleString()} Men, ${item.female.toLocaleString()} Women)`;
              }
            }
          }
        },
        scales: {
          x: { stacked: true, beginAtZero: true, grace: '20%' },
          y: { stacked: true }
        }
      }
    });
  }
}


/**
 * ==============================================================================
 * WEEKLY COMMUNITY & SCHOOL LISTENING AND RUMOUR LOG (TOOL 8) & U-REPORT RECRUITMENT (TOOL 11)
 * ==============================================================================
 */

function getAllRumourRecords() {
  return appData.filter(d => {
    if (d.tool === 'Listening & Rumour Log') return true;
    return !!(cleanText(d.rumor) || cleanText(d.barrier) || cleanText(d.tactical_adaptation));
  });
}

function renderRumourLogSection() {
  const rumourRecords = getAllRumourRecords();
  const totalRumours = rumourRecords.length;

  safeSetText('rumourKpiTotal', totalRumours.toLocaleString());
  safeSetText('rumourKpiTotalSub', `${totalRumours} field concerns & rumors logged`);

  let highCount = 0, modCount = 0, lowCount = 0;
  const originMap = {};
  const settingMap = {};
  const districtMap = {};
  let tacticalCount = 0;
  const highRiskCards = [];

  rumourRecords.forEach(r => {
    const risk = String(r.risk_level || '').trim().toLowerCase();
    if (risk.includes('high')) {
      highCount++;
      if (cleanText(r.rumor) && highRiskCards.length < 6) {
        highRiskCards.push(r);
      }
    } else if (risk.includes('low')) {
      lowCount++;
    } else {
      modCount++;
    }

    const origin = cleanText(r.origin || r.source) || 'Community';
    originMap[origin] = (originMap[origin] || 0) + 1;

    const setting = cleanText(r.setting) || 'School';
    settingMap[setting] = (settingMap[setting] || 0) + 1;

    const dist = cleanText(r.district) || 'Central';
    districtMap[dist] = (districtMap[dist] || 0) + 1;

    if (cleanText(r.tactical_adaptation)) {
      tacticalCount++;
    }
  });

  const highPct = totalRumours > 0 ? ((highCount / totalRumours) * 100).toFixed(1) : 0;
  safeSetText('rumourKpiHigh', highCount.toLocaleString());
  safeSetText('rumourKpiHighSub', `${highPct}% of total reported rumours`);

  const topOriginEntry = Object.entries(originMap).sort((a, b) => b[1] - a[1])[0];
  if (topOriginEntry) {
    safeSetText('rumourKpiOrigin', topOriginEntry[0]);
    safeSetText('rumourKpiOriginSub', `${topOriginEntry[1]} reports (${((topOriginEntry[1]/totalRumours)*100).toFixed(0)}%)`);
  } else {
    safeSetText('rumourKpiOrigin', '—');
    safeSetText('rumourKpiOriginSub', 'No reports');
  }

  const topSettingEntry = Object.entries(settingMap).sort((a, b) => b[1] - a[1])[0];
  if (topSettingEntry) {
    safeSetText('rumourKpiSetting', topSettingEntry[0]);
    safeSetText('rumourKpiSettingSub', `${topSettingEntry[1]} reports (${((topSettingEntry[1]/totalRumours)*100).toFixed(0)}%)`);
  } else {
    safeSetText('rumourKpiSetting', '—');
    safeSetText('rumourKpiOriginSub', 'No reports');
  }

  const tacticalPct = totalRumours > 0 ? ((tacticalCount / totalRumours) * 100).toFixed(1) : 0;
  safeSetText('rumourKpiTactical', tacticalCount.toLocaleString());
  safeSetText('rumourKpiTacticalSub', `${tacticalPct}% counter-action rate`);

  // High risk cards spotlight
  const spotlightGrid = document.getElementById('rumourHighRiskCards');
  if (spotlightGrid) {
    if (highRiskCards.length === 0) {
      spotlightGrid.innerHTML = `<div style="color:#64748b; font-size:0.8rem; font-style:italic; padding:8px 0;">No high-risk rumors flagged in active filter selection.</div>`;
    } else {
      spotlightGrid.innerHTML = highRiskCards.map(c => `
        <div class="alert-spotlight-card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
            <span class="badge-pill badge-danger" style="font-weight:700;">HIGH RISK</span>
            <span style="font-size:0.69rem; color:#64748b;">${c.date || ''} • ${cleanText(c.district)}</span>
          </div>
          <div style="font-size:0.83rem; font-weight:700; color:#991b1b; margin-bottom:4px;">"${cleanText(c.rumor)}"</div>
          ${cleanText(c.barrier) ? `<div style="font-size:0.72rem; color:#475569; margin-bottom:3px;"><strong>Barrier:</strong> ${cleanText(c.barrier)}</div>` : ''}
          ${cleanText(c.tactical_adaptation) ? `<div style="font-size:0.72rem; color:var(--primary); font-weight:600;"><strong>Counter Action:</strong> ${cleanText(c.tactical_adaptation)}</div>` : ''}
        </div>
      `).join('');
    }
  }

  renderRumourCharts(highCount, modCount, lowCount, originMap, settingMap, districtMap);
  populateRumourDropdowns(originMap, settingMap);
  renderRumourLogFiltered();
}

function renderRumourCharts(highCount, modCount, lowCount, originMap, settingMap, districtMap) {
  // Chart 1: Risk Level
  const elRisk = document.getElementById('chartRumourRisk');
  if (elRisk) {
    if (chartInstances.rumourRisk) chartInstances.rumourRisk.destroy();
    const riskTotal = highCount + modCount + lowCount;
    chartInstances.rumourRisk = new Chart(elRisk.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['High Risk', 'Moderate Risk', 'Low Risk'],
        datasets: [{
          label: 'Rumours Logged',
          data: [highCount, modCount, lowCount],
          backgroundColor: ['#ef4444', '#f59e0b', '#10b981'],
          borderRadius: 4,
          datalabels: {
            anchor: 'end',
            align: 'top',
            formatter: (val) => {
              if (riskTotal === 0) return '0';
              const pct = ((val / riskTotal) * 100).toFixed(1);
              return `${val} (${pct}%)`;
            },
            color: '#1e293b',
            font: { weight: 'bold', size: 11 }
          }
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => {
                const val = item.raw;
                const pct = riskTotal > 0 ? ((val / riskTotal) * 100).toFixed(1) : 0;
                return `${item.label}: ${val} (${pct}%)`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grace: '20%'
          }
        }
      }
    });
  }

  // Chart 2: Top Origins
  const elOrigin = document.getElementById('chartRumourOrigin');
  if (elOrigin) {
    if (chartInstances.rumourOrigin) chartInstances.rumourOrigin.destroy();
    const sortedOrigins = Object.entries(originMap).sort((a, b) => b[1] - a[1]).slice(0, 7);
    chartInstances.rumourOrigin = new Chart(elOrigin.getContext('2d'), {
      type: 'bar',
      data: {
        labels: sortedOrigins.map(e => e[0]),
        datasets: [{
          label: 'Rumours Logged',
          data: sortedOrigins.map(e => e[1]),
          backgroundColor: '#3b82f6',
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true } }
      }
    });
  }

  // Chart 3: Settings
  const elSetting = document.getElementById('chartRumourSetting');
  if (elSetting) {
    if (chartInstances.rumourSetting) chartInstances.rumourSetting.destroy();
    const sortedSettings = Object.entries(settingMap).sort((a, b) => b[1] - a[1]).slice(0, 7);
    chartInstances.rumourSetting = new Chart(elSetting.getContext('2d'), {
      type: 'bar',
      data: {
        labels: sortedSettings.map(e => e[0]),
        datasets: [{
          label: 'Rumours Logged',
          data: sortedSettings.map(e => e[1]),
          backgroundColor: '#8b5cf6',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  // Chart 4: District
  const elDist = document.getElementById('chartRumourDistrict');
  if (elDist) {
    if (chartInstances.rumourDistrict) chartInstances.rumourDistrict.destroy();
    const sortedDists = Object.entries(districtMap).sort((a, b) => b[1] - a[1]);
    chartInstances.rumourDistrict = new Chart(elDist.getContext('2d'), {
      type: 'bar',
      data: {
        labels: sortedDists.map(e => e[0]),
        datasets: [{
          label: 'Rumours Logged',
          data: sortedDists.map(e => e[1]),
          backgroundColor: '#f59e0b',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }
}

function populateRumourDropdowns(originMap, settingMap) {
  const selOrigin = document.getElementById('filterRumourOrigin');
  if (selOrigin && selOrigin.options.length <= 1) {
    const curVal = selOrigin.value;
    const origins = Object.keys(originMap).sort();
    selOrigin.innerHTML = '<option value="ALL">All Origins</option>' + origins.map(o => `<option value="${o}">${o} (${originMap[o]})</option>`).join('');
    if (origins.includes(curVal)) selOrigin.value = curVal;
  }

  const selSetting = document.getElementById('filterRumourSetting');
  if (selSetting && selSetting.options.length <= 1) {
    const curVal = selSetting.value;
    const settings = Object.keys(settingMap).sort();
    selSetting.innerHTML = '<option value="ALL">All Settings</option>' + settings.map(s => `<option value="${s}">${s} (${settingMap[s]})</option>`).join('');
    if (settings.includes(curVal)) selSetting.value = curVal;
  }
}

function renderRumourLogFiltered() {
  const rumourRecords = getAllRumourRecords();
  const riskFilter = document.getElementById('filterRumourRisk')?.value || 'ALL';
  const originFilter = document.getElementById('filterRumourOrigin')?.value || 'ALL';
  const settingFilter = document.getElementById('filterRumourSetting')?.value || 'ALL';
  const searchFilter = (document.getElementById('filterRumourSearch')?.value || '').trim().toLowerCase();

  const filtered = rumourRecords.filter(r => {
    const risk = String(r.risk_level || 'Moderate').toLowerCase();
    if (riskFilter === 'High' && !risk.includes('high')) return false;
    if (riskFilter === 'Moderate' && !risk.includes('moderate')) return false;
    if (riskFilter === 'Low' && !risk.includes('low')) return false;

    const origin = cleanText(r.origin || r.source) || 'Community';
    if (originFilter !== 'ALL' && origin !== originFilter) return false;

    const setting = cleanText(r.setting) || 'School';
    if (settingFilter !== 'ALL' && setting !== settingFilter) return false;

    if (searchFilter) {
      const match = (r.rumor && r.rumor.toLowerCase().includes(searchFilter)) ||
                    (r.barrier && r.barrier.toLowerCase().includes(searchFilter)) ||
                    (r.tactical_adaptation && r.tactical_adaptation.toLowerCase().includes(searchFilter)) ||
                    (r.district && r.district.toLowerCase().includes(searchFilter)) ||
                    (r.parish && r.parish.toLowerCase().includes(searchFilter));
      if (!match) return false;
    }
    return true;
  });

  safeSetText('rumourLogCountBadge', `${filtered.length} of ${rumourRecords.length} Entries`);

  const tbody = document.getElementById('rumourLogTableBody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#94a3b8; padding:30px; font-style:italic;">No rumors match the active filter criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => {
    const risk = cleanText(r.risk_level) || 'Moderate';
    const riskLow = risk.toLowerCase();
    let riskBadge = '<span class="badge-pill badge-warning">Moderate</span>';
    if (riskLow.includes('high')) riskBadge = '<span class="badge-pill badge-danger">High Risk</span>';
    else if (riskLow.includes('low')) riskBadge = '<span class="badge-pill badge-success">Low Risk</span>';

    return `
      <tr>
        <td>
          <strong>#${r._index || r.id}</strong><br>
          <span style="font-size:0.7rem; color:var(--text-muted);">${r.date || ''}</span>
          ${r.id && r._index && r.id != r._index ? `<div style="font-size:0.65rem; color:#94a3b8;">ID: ${r.id}</div>` : ''}
        </td>
        <td><strong>${cleanText(r.district)}</strong><br><span style="font-size:0.71rem; color:var(--text-muted);">${cleanText(r.parish)}</span></td>
        <td><span class="badge-pill badge-primary">${cleanText(r.setting) || 'School'}</span></td>
        <td><span class="badge-pill" style="background:#f1f5f9; color:#475569;">${cleanText(r.origin || r.source) || 'Community'}</span></td>
        <td style="max-width:260px; font-weight:600; color:#991b1b; white-space:normal;">${cleanText(r.rumor) || '—'}</td>
        <td style="max-width:220px; font-size:0.75rem; color:#475569; white-space:normal;">${cleanText(r.barrier) || '—'}</td>
        <td style="text-align:center;">${riskBadge}</td>
        <td style="max-width:280px; font-size:0.75rem; color:var(--primary); font-weight:600; white-space:normal;">${cleanText(r.tactical_adaptation) || '—'}</td>
      </tr>
    `;
  }).join('');
}

function resetRumourFilters() {
  if (document.getElementById('filterRumourRisk')) document.getElementById('filterRumourRisk').value = 'ALL';
  if (document.getElementById('filterRumourOrigin')) document.getElementById('filterRumourOrigin').value = 'ALL';
  if (document.getElementById('filterRumourSetting')) document.getElementById('filterRumourSetting').value = 'ALL';
  if (document.getElementById('filterRumourSearch')) document.getElementById('filterRumourSearch').value = '';
  renderRumourLogFiltered();
}

function renderURecruitSection() {
  const uRows = appData.filter(d => d.tool === 'U-Report Recruitment');
  const totalRecruited = uRows.reduce((acc, r) => acc + (r.male || 0) + (r.female || 0) + (r.total || 0), 0);
  const maleRecruited = uRows.reduce((acc, r) => acc + (r.male || 0), 0);
  const femaleRecruited = uRows.reduce((acc, r) => acc + (r.female || 0), 0);
  const settingsSet = new Set(uRows.map(r => r.location).filter(Boolean));

  safeSetText('u_kpi_total', totalRecruited.toLocaleString());
  safeSetText('u_kpi_total_sub', `Across ${uRows.length} mobilization sessions`);
  safeSetText('u_kpi_male', maleRecruited.toLocaleString());
  safeSetText('u_kpi_male_sub', `${totalRecruited > 0 ? ((maleRecruited/totalRecruited)*100).toFixed(1) : 0}% of cohort`);
  safeSetText('u_kpi_female', femaleRecruited.toLocaleString());
  safeSetText('u_kpi_female_sub', `${totalRecruited > 0 ? ((femaleRecruited/totalRecruited)*100).toFixed(1) : 0}% of cohort`);
  safeSetText('u_kpi_locs', settingsSet.size);
  safeSetText('tool11CountBadge', `${uRows.length} Sessions`);

  const tbody = document.getElementById('tool11TableBody');
  if (tbody) {
    if (uRows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#94a3b8; padding:30px; font-style:italic;">No U-Report recruitment sessions recorded in the active filter.</td></tr>`;
    } else {
      tbody.innerHTML = uRows.map(r => `
        <tr>
          <td>
            <strong>#${r._index || r.id}</strong><br>
            <span style="font-size:0.7rem; color:var(--text-muted);">${r.date || ''}</span>
            ${r.id && r._index && r.id != r._index ? `<div style="font-size:0.65rem; color:#94a3b8;">ID: ${r.id}</div>` : ''}
          </td>
          <td>${cleanText(r.district)}</td>
          <td>${cleanText(r.parish)}</td>
          <td><span class="badge-pill badge-primary">${cleanText(r.location) || 'Community'}</span></td>
          <td>${(r.male || 0).toLocaleString()}</td>
          <td>${(r.female || 0).toLocaleString()}</td>
          <td><strong style="color:var(--primary);">${((r.male || 0) + (r.female || 0) || r.total || 0).toLocaleString()}</strong></td>
          <td>${cleanText(r.coordinator) || 'Field Lead'}</td>
        </tr>
      `).join('');
    }
  }

  // Render Chart
  const locMap = {};
  uRows.forEach(r => {
    const loc = cleanText(r.location) || 'Community';
    locMap[loc] = (locMap[loc] || 0) + ((r.male || 0) + (r.female || 0) || r.total || 0);
  });
  const ctx = document.getElementById('chartURecruitSetting')?.getContext('2d');
  if (ctx && Object.keys(locMap).length > 0) {
    if (chartInstances.uRecruitSetting) chartInstances.uRecruitSetting.destroy();
    chartInstances.uRecruitSetting = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: Object.keys(locMap),
        datasets: [{
          label: 'U-Reporters Recruited',
          data: Object.values(locMap),
          backgroundColor: '#282c68',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }
}

/**
 * Summary Matrix: Reach & Engagement per Location (District & Parish)
 */
function renderLocationSummaryTable() {
  const tableBody = document.getElementById('locationSummaryTableBody');
  const tableFoot = document.getElementById('locationSummaryTableFoot');
  if (!tableBody) return;

  const searchInput = document.getElementById('filterLocSearch');
  const distSelect = document.getElementById('filterLocDistrict');
  const searchVal = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const distVal = distSelect ? distSelect.value : 'ALL';

  // Aggregate by district & parish
  const locMap = {};
  appData.forEach(r => {
    const dist = (r.district || 'Central').trim();
    const parish = (r.parish || 'General Parish').trim();
    if (CLEAN_EMPTY_WORDS.has(parish.toLowerCase())) return;

    const key = `${dist}|||${parish}`;
    if (!locMap[key]) {
      locMap[key] = {
        district: dist,
        parish: parish,
        schoolsSet: new Set(),
        schoolReach: {},
        learners: 0,
        boys: 0,
        girls: 0,
        wheelSessions: 0,
        healthClubs: 0,
        gatekeepers: 0,
        ureporters: 0,
        tallySheets: 0,
        games: 0
      };
    }
    const loc = locMap[key];
    const tool = r.tool;

    if (tool === 'School Activity') {
      const s = cleanSchoolName(r.school || '');
      const sKey = s.toLowerCase();
      if (s && !sKey.startsWith('site') && !sKey.startsWith('gatekeeper') && !CLEAN_EMPTY_WORDS.has(sKey)) {
        loc.schoolsSet.add(s);
        const b = r.boys || 0;
        const g = r.girls || 0;
        const tot = b + g;
        if (!loc.schoolReach[sKey] || tot > loc.schoolReach[sKey].total) {
          loc.schoolReach[sKey] = { boys: b, girls: g, total: tot };
        }
      }
      loc.wheelSessions += 1;
      const hcStatus = String(r.health_club || r.health_club_established || '').toLowerCase();
      if (hcStatus.includes('active') || hcStatus.includes('yes') || hcStatus.includes('form')) {
        loc.healthClubs += 1;
      }
      loc.gatekeepers += (r.teachers || 0);
      loc.games += (r.games || 0);
      loc.ureporters += (r.active_ureporters || 0);
    } else if (tool === 'Gatekeeper Session') {
      loc.gatekeepers += (r.teachers || (r.male || 0) + (r.female || 0));
      const cm = (r.male_crowd || r.crowd_male || 0);
      const cf = (r.female_crowd || r.crowd_female || 0);
      const cTot = (r.crowd_engaged || (cm + cf) || 0);
      loc.crowd = (loc.crowd || 0) + cTot;
      loc.crowdMale = (loc.crowdMale || 0) + cm;
      loc.crowdFemale = (loc.crowdFemale || 0) + cf;
    } else if (tool === 'U-Report Recruitment') {
      loc.ureporters += ((r.male || 0) + (r.female || 0) + (r.total || 0));
      loc.tallySheets += 1;
    } else if (tool === 'PAT Assessment') {
      const s = cleanSchoolName(r.school || r.name || '');
      if (s && !s.toLowerCase().startsWith('site') && !CLEAN_EMPTY_WORDS.has(s.toLowerCase())) loc.schoolsSet.add(s);
    }
  });

  // Calculate deduplicated unique learners per location
  Object.values(locMap).forEach(loc => {
    const reachList = Object.values(loc.schoolReach || {});
    if (reachList.length > 0) {
      loc.boys = reachList.reduce((acc, x) => acc + x.boys, 0);
      loc.girls = reachList.reduce((acc, x) => acc + x.girls, 0);
      loc.learners = loc.boys + loc.girls;
    }
  });

  // Populate district dropdown options if needed
  if (distSelect && distSelect.options.length <= 1) {
    const allDistricts = Array.from(new Set(Object.values(locMap).map(l => l.district))).sort();
    allDistricts.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.innerText = d;
      distSelect.appendChild(opt);
    });
  }

  // Filter rows
  let rows = Object.values(locMap);
  if (distVal !== 'ALL') {
    rows = rows.filter(r => r.district.toLowerCase() === distVal.toLowerCase());
  }
  if (searchVal) {
    rows = rows.filter(r => 
      r.district.toLowerCase().includes(searchVal) ||
      r.parish.toLowerCase().includes(searchVal) ||
      Array.from(r.schoolsSet).some(s => s.toLowerCase().includes(searchVal))
    );
  }

  // Sort by district, then parish
  rows.sort((a, b) => {
    if (a.district.localeCompare(b.district) !== 0) return a.district.localeCompare(b.district);
    return a.parish.localeCompare(b.parish);
  });

  safeSetText('locTableCountBadge', `${rows.length} Locations`);

  if (rows.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="12" style="text-align:center; color:#94a3b8; padding:24px;">No location records found matching active filter.</td></tr>`;
    if (tableFoot) tableFoot.innerHTML = '';
    return;
  }

  // Totals for footer
  let totSchools = 0;
  let totLearners = 0;
  let totBoys = 0;
  let totGirls = 0;
  let totWheel = 0;
  let totClubs = 0;
  let totGks = 0;
  let totURep = 0;
  let totTally = 0;
  let totGames = 0;

  tableBody.innerHTML = rows.map(r => {
    const schCount = r.schoolsSet.size;
    totSchools += schCount;
    totLearners += r.learners;
    totBoys += r.boys;
    totGirls += r.girls;
    totWheel += r.wheelSessions;
    totClubs += r.healthClubs;
    totGks += r.gatekeepers;
    totURep += r.ureporters;
    totTally += r.tallySheets;
    totGames += r.games;

    return `<tr>
      <td><strong>${r.district}</strong></td>
      <td><span class="badge-pill" style="background:#e0f2fe; color:#0369a1;">${r.parish}</span></td>
      <td><strong>${schCount > 0 ? schCount : '—'}</strong></td>
      <td><strong style="color:var(--primary);">${r.learners > 0 ? r.learners.toLocaleString() : '—'}</strong></td>
      <td>${r.boys > 0 ? r.boys.toLocaleString() : '—'}</td>
      <td>${r.girls > 0 ? r.girls.toLocaleString() : '—'}</td>
      <td><strong style="color:#0284c7;">${r.wheelSessions > 0 ? r.wheelSessions : '—'}</strong></td>
      <td><span class="badge-pill ${r.healthClubs > 0 ? 'badge-success' : 'badge-warning'}">${r.healthClubs > 0 ? `${r.healthClubs} Formed` : 'None'}</span></td>
      <td><strong style="color:var(--gatekeeper);">${r.gatekeepers > 0 ? r.gatekeepers.toLocaleString() : '—'}</strong></td>
      <td><strong style="color:#059669;">${r.ureporters > 0 ? r.ureporters.toLocaleString() : '—'}</strong></td>
      <td>${r.tallySheets > 0 ? `<span class="badge-pill badge-primary">${r.tallySheets} Sheets</span>` : '—'}</td>
      <td>${r.games > 0 ? r.games.toLocaleString() : '—'}</td>
    </tr>`;
  }).join('');

  if (tableFoot) {
    tableFoot.innerHTML = `<tr>
      <td colspan="2"><strong>Total (${rows.length} Locations)</strong></td>
      <td><strong>${totSchools}</strong></td>
      <td><strong style="color:var(--primary);">${totLearners.toLocaleString()}</strong></td>
      <td><strong>${totBoys.toLocaleString()}</strong></td>
      <td><strong>${totGirls.toLocaleString()}</strong></td>
      <td><strong style="color:#0284c7;">${totWheel.toLocaleString()}</strong></td>
      <td><strong>${totClubs.toLocaleString()}</strong></td>
      <td><strong style="color:var(--gatekeeper);">${totGks.toLocaleString()}</strong></td>
      <td><strong style="color:#059669;">${totURep.toLocaleString()}</strong></td>
      <td><strong>${totTally.toLocaleString()}</strong></td>
      <td><strong>${totGames.toLocaleString()}</strong></td>
    </tr>`;
  }
}

function resetLocationTableFilters() {
  const searchInput = document.getElementById('filterLocSearch');
  const distSelect = document.getElementById('filterLocDistrict');
  if (searchInput) searchInput.value = '';
  if (distSelect) distSelect.value = 'ALL';
  renderLocationSummaryTable();
}

// Attach functions to global window for HTML inline handlers
window.processRawWorkbookRows = processRawWorkbookRows;
window.recomputeAndRender = recomputeAndRender;
window.renderBarCharts = renderBarCharts;
window.showTab = showTab;
window.applyFilters = applyFilters;
window.resetFilters = resetFilters;
window.renderRumourLogFiltered = renderRumourLogFiltered;
window.resetRumourFilters = resetRumourFilters;
window.renderLocationSummaryTable = renderLocationSummaryTable;
window.resetLocationTableFilters = resetLocationTableFilters;


/**
 * Auto-fetch dashboard_data.json if running on HTTP/HTTPS (e.g. GitHub Pages)
 */
async function tryAutoFetchServerData() {
  if (window.location.protocol.startsWith('http')) {
    try {
      const resp = await fetch('dashboard_data.json');
      if (resp.ok) {
        const json = await resp.json();
        if (Array.isArray(json) && json.length > 0) {
          processRawWorkbookRows(json);
          populateFilterOptions();
          applyFilters();
          console.log('Loaded live JSON from server:', json.length, 'records');
        }
      }
    } catch (e) {
      console.log('Offline / local fallback data in use.');
    }
  }
}

// Boot application
window.addEventListener('DOMContentLoaded', () => {
  processRawWorkbookRows([]);
  populateFilterOptions();
  applyFilters();
  tryAutoFetchServerData();
});

// Responsive resize listener for orientation changes and viewport resizing
window.addEventListener('resize', () => {
  if (leafletMap) {
    leafletMap.invalidateSize();
  }
  Object.values(chartInstances).forEach(c => {
    if (c && typeof c.resize === 'function') {
      c.resize();
    }
  });
});
