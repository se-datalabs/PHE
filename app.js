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

function getCol(row, ...aliases) {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const cleanAlias = alias.trim().toLowerCase();
    for (const k of keys) {
      if (k.trim().toLowerCase() === cleanAlias) {
        const val = row[k];
        if (val !== undefined && val !== null) {
          return typeof val === 'string' ? val.trim() : val;
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
      rawMasterData.push({
        id: row.id || (idx + 1),
        date: formattedDate || row.date,
        tool: row.tool,
        district: row.district || 'Central',
        parish: row.parish || '',
        coordinator: row.coordinator || '',
        school: row.school || row.name || 'Site',
        visit_num: row.visit_num || 'Visit 1',
        health_club: row.health_club || 'Active',
        boys: parseNum(row.boys),
        girls: parseNum(row.girls),
        enrolment: parseNum(row.enrolment),
        teachers: parseNum(row.teachers),
        games: parseNum(row.games),
        signs: row.signs || '',
        hotline: row.hotline || '',
        stigma: row.stigma || '',
        handwash_demo: row.handwash_demo || '',
        soap: row.soap || '',
        rumor: row.rumor || '',
        barrier: row.barrier || '',
        source: row.source || '',
        role: row.role || '',
        commitments: row.commitments || '',
        male: parseNum(row.male),
        female: parseNum(row.female),
        auditor: row.auditor || '',
        site: row.site || '',
        setting: row.setting || '',
        stations: parseNum(row.stations),
        pop: parseNum(row.pop),
        stance_ratio: row.stance_ratio || '',
        notes: row.notes || '',
        refuse: row.refuse || '',
        wash: row.wash || '',
        poster: row.poster || '',
        holding: row.holding || '',
        staff: row.staff || '',
        name: row.name || '',
        level: row.level || '',
        maleStaff: parseNum(row.maleStaff),
        femaleStaff: parseNum(row.femaleStaff),
        plan: row.plan || '',
        space: row.space || '',
        bStances: parseNum(row.bStances),
        gStances: parseNum(row.gStances),
        washAudit: row.washAudit || '',
        stanceAudit: row.stanceAudit || '',
        wasteAudit: row.wasteAudit || '',
        drainageAudit: row.drainageAudit || '',
        hotlineLegible: row.hotlineLegible || ''
      });
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
    'overview': ['Main Summary of Reach', 'Cross-tool reach aggregation, district performance, and programmatic coverage'],
    'tool_9': ['Tool 9: School 3-Visit Model & Knowledge Wheel Session Tracker', 'Detailed analysis of learner reach, visit number, health club, and wheel answers'],
    'tool_7': ['Tool 7: Community Gatekeeper Dialogue & Commitment Log', 'Tracking orientation sessions conducted with local leaders and community stakeholders'],
    'tool_1': ['Tool 1: Transect Walk Environmental & Infrastructure Checklist', 'Environmental sanitation, setting type, functional stations, and stance ratios'],
    'tool_2': ['Tool 2: Rapid Audience Assessment Intercept Survey', 'Full questionnaire capture: 7-day recall, 2+ symptoms, risk perception, and notification intent'],
    'tool_3': ['Tool 3: "Ask 5" Behavioral Verification Diagnostic Tool', 'Full 5-claim diagnostic audit for gatekeepers, teachers, vendors, and transport operators'],
    'tool_4': ['Tool 4: Most Significant Change Story Collection Form', 'Systematic qualitative narrative tracking of the Most Significant Change'],
    'tool_5': ['Tool 5: Social Network & Influencer Mapping Protocol', 'Identification of trusted community influencers across social sectors'],
    'tool_6': ['Tool 6: Photovoice Participatory Documentation Guide & Caption Form', 'PHOTO protocol analysis of youth-led hygiene challenges and community solutions'],
    'tool_10': ['Tool 10: School Simulation Drill & Safeguarding Compliance Protocol', 'Mandatory pre-drill verification and performance rehearsal evaluation'],
    'tool_8': ['Tool 8: Preparedness Assessment Tool (PAT)', 'School Epidemic Preparedness Assessment Tool examining institutional response plans and isolation wards']
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
    } else if (tabId === 'tool_9') {
      if (chartInstances.signsT1) chartInstances.signsT1.resize();
      if (chartInstances.hotlineT1) chartInstances.hotlineT1.resize();
      if (chartInstances.stigmaT1) chartInstances.stigmaT1.resize();
      if (chartInstances.handwashT1) chartInstances.handwashT1.resize();
      if (chartInstances.topSchoolsT1) chartInstances.topSchoolsT1.resize();
    } else if (tabId === 'tool_1') {
      if (chartInstances.washT3) chartInstances.washT3.resize();
      if (chartInstances.posterT3) chartInstances.posterT3.resize();
    } else if (tabId === 'tool_2') {
      if (chartInstances.chartT4Q1) chartInstances.chartT4Q1.resize();
      if (chartInstances.chartT4Q4) chartInstances.chartT4Q4.resize();
    } else if (tabId === 'tool_3') {
      if (chartInstances.chartT5Target) chartInstances.chartT5Target.resize();
      if (chartInstances.chartT5Claims) chartInstances.chartT5Claims.resize();
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

function recomputeAndRender() {
  Object.keys(chartInstances).forEach(k => {
    if (chartInstances[k]) {
      chartInstances[k].destroy();
      delete chartInstances[k];
    }
  });

  const distMap = {};
  let totalBoys = 0, totalGirls = 0, totalTeachers = 0, totalGames = 0;

  const schoolUniqueEnrolment = {};
  appData.forEach(r => {
    totalBoys += (r.boys || 0);
    totalGirls += (r.girls || 0);
    totalTeachers += (r.teachers || 0);
    totalGames += (r.games || 0);

    const sName = (r.school || r.name || '').trim().toLowerCase();
    const enr = r.enrolment || 0;
    const dName = r.district || 'Unassigned';

    if (sName && sName !== 'site' && !sName.startsWith('gatekeeper') && r.tool === 'School Activity') {
      if (!schoolUniqueEnrolment[sName] || enr > schoolUniqueEnrolment[sName].enr) {
        schoolUniqueEnrolment[sName] = { enr: enr, district: dName };
      }
    }

    if (!distMap[dName]) {
      distMap[dName] = { count: 0, enrolment: 0, boys: 0, girls: 0, teachers: 0, totalLearners: 0, totalReach: 0, games: 0, v1Reach: 0, v2Reach: 0, v3Reach: 0, schoolsSet: new Set() };
    }
    
    if (sName && sName !== 'site' && !sName.startsWith('gatekeeper') && r.tool === 'School Activity') {
      distMap[dName].schoolsSet.add(sName);
    }

    distMap[dName].boys += (r.boys || 0);
    distMap[dName].girls += (r.girls || 0);
    distMap[dName].teachers += (r.teachers || 0);
    distMap[dName].totalLearners += ((r.boys || 0) + (r.girls || 0));
    distMap[dName].totalReach += ((r.boys || 0) + (r.girls || 0) + (r.teachers || 0));
    distMap[dName].games += (r.games || 0);

    if (r.tool === 'School Activity') {
      const vNum = String(r.visit_num || 'Visit 1').trim().toLowerCase();
      const vReach = (r.boys || 0) + (r.girls || 0);
      if (vNum.includes('visit 1') || vNum === '1') distMap[dName].v1Reach += vReach;
      else if (vNum.includes('visit 2') || vNum === '2') distMap[dName].v2Reach += vReach;
      else if (vNum.includes('visit 3') || vNum === '3') distMap[dName].v3Reach += vReach;
    }
  });

  let totalEnrolment = 0;
  Object.values(schoolUniqueEnrolment).forEach(item => {
    totalEnrolment += item.enr;
    if (distMap[item.district]) {
      distMap[item.district].enrolment += item.enr;
    }
  });

  const distList = Object.keys(distMap).map(d => ({
    name: d,
    schoolCount: distMap[d].schoolsSet.size > 0 ? distMap[d].schoolsSet.size : distMap[d].count,
    ...distMap[d]
  })).sort((a, b) => b.totalReach - a.totalReach);

  const totalSensitised = totalBoys + totalGirls;
  const totalLearners = totalSensitised;
  const gatekeeperRowsFiltered = appData.filter(d => d.tool === 'Gatekeeper Session');
  const grandTotalGatekeepers = totalTeachers;
  const grandTotalReach = totalLearners + grandTotalGatekeepers;

  safeSetText('kpiLearners', totalLearners.toLocaleString());
  safeSetText('kpiLearnersSub', `${totalBoys.toLocaleString()} Boys | ${totalGirls.toLocaleString()} Girls (${totalLearners > 0 ? ((totalGirls / totalLearners) * 100).toFixed(1) : 0}% F)`);
  safeSetText('kpiEnrolment', totalEnrolment.toLocaleString());
  safeSetText('kpiEnrolmentSub', `Unique school population base (validated)`);
  safeSetText('kpiGatekeepers', grandTotalGatekeepers.toLocaleString());
  safeSetText('kpiGames', totalGames.toLocaleString());
  safeSetText('kpiDistricts', distList.length);
  safeSetText('badgeTotalReach', grandTotalReach > 1000 ? `${(grandTotalReach/1000).toFixed(1)}K` : grandTotalReach);
  safeSetText('badgeTool1', appData.filter(d => d.tool === 'School Activity').length);
  safeSetText('badgeTool2', gatekeeperRowsFiltered.length);
  safeSetText('badgeTool3', appData.filter(d => d.tool === 'Transect Walk').length);
  safeSetText('badgeTool4', appData.filter(d => d.tool === 'Rapid Intercept').length);
  safeSetText('badgeTool5', appData.filter(d => d.tool === 'Ask 5').length);
  safeSetText('badgeTool6', appData.filter(d => d.tool === 'MSC Story').length);
  safeSetText('badgeTool7', appData.filter(d => d.tool === 'Influencer Mapping').length);
  safeSetText('badgeTool8', appData.filter(d => d.tool === 'Photovoice').length);
  safeSetText('badgeTool9', appData.filter(d => d.tool === 'Simulation Drill').length);
  safeSetText('badgeTool10', appData.filter(d => d.tool === 'PAT Assessment').length);

  const keyChipsHtml = distList.length === 0
    ? `<span style="color:#64748b; font-size:0.8rem;">No district data for active filter.</span>`
    : distList.map(d => `
        <div class="district-key-chip">
          <strong>${d.name}:</strong> 
          <span class="chip-total">Total: ${d.totalReach.toLocaleString()}</span>
          <span style="color:#64748b; font-size:0.72rem;">(${d.boys.toLocaleString()} B / ${d.girls.toLocaleString()} G / ${d.teachers} Gatekeepers)</span>
        </div>
      `).join('');
  safeSetHtml('districtTotalsKey', keyChipsHtml);

  const schoolActsCount = appData.filter(d => d.tool === 'School Activity').length;
  const t2Count = appData.filter(d => d.tool === 'Rapid Intercept').length;
  const t3Count = appData.filter(d => d.tool === 'Ask 5').length;
  const t4Count = appData.filter(d => d.tool === 'MSC Story').length;
  const t5Count = appData.filter(d => d.tool === 'Influencer Mapping').length;
  const t6Count = appData.filter(d => d.tool === 'Photovoice').length;
  const t9Count = appData.filter(d => d.tool === 'Simulation Drill').length;
  const patCount = appData.filter(d => d.tool === 'PAT Assessment').length;

  const toolDefs = [
    { num: 1, name: "Tool 9: School 3-Visit Model & Knowledge Wheel Session Tracker", q: 26, reach: `${appData.filter(d => d.tool === 'School Activity').reduce((acc, r) => acc + (r.boys||0) + (r.girls||0), 0).toLocaleString()} Learners (${schoolActsCount} Schools)`, active: schoolActsCount > 0, tab: "tool_9" },
    { num: 2, name: "Tool 7: Community Gatekeeper Dialogue & Commitment Log", q: 8, reach: `${gatekeeperRowsFiltered.length} Sessions Oriented`, active: gatekeeperRowsFiltered.length > 0, tab: "tool_7" },
    { num: 3, name: "Tool 1: Transect Walk Environmental & Infrastructure Checklist", q: 14, reach: `${appData.filter(d => d.tool === 'Transect Walk').length} Facility Audits`, active: appData.filter(d => d.tool === 'Transect Walk').length > 0, tab: "tool_1" },
    { num: 4, name: "Tool 2: Rapid Audience Assessment Intercept Survey", q: 15, reach: t2Count > 0 ? `${t2Count} Intercepts Audited` : "0 Submissions (Pending)", active: t2Count > 0, tab: "tool_2" },
    { num: 5, name: "Tool 3: 'Ask 5' Behavioral Verification Diagnostic Tool", q: 32, reach: t3Count > 0 ? `${t3Count} Claims Verified` : "0 Submissions (Pending)", active: t3Count > 0, tab: "tool_3" },
    { num: 6, name: "Tool 4: Most Significant Change Story Collection Form", q: 5, reach: t4Count > 0 ? `${t4Count} Impact Narratives` : "0 Submissions (Pending)", active: t4Count > 0, tab: "tool_4" },
    { num: 7, name: "Tool 5: Social Network & Influencer Mapping Protocol", q: 19, reach: t5Count > 0 ? `${t5Count} Key Influencers Mapped` : "0 Submissions (Pending)", active: t5Count > 0, tab: "tool_5" },
    { num: 8, name: "Tool 6: Photovoice Participatory Documentation Guide & Caption Form", q: 9, reach: t6Count > 0 ? `${t6Count} PHOTO Panels` : "0 Submissions (Pending)", active: t6Count > 0, tab: "tool_6" },
    { num: 9, name: "Tool 10: School Simulation Drill & Safeguarding Compliance Protocol", q: 19, reach: t9Count > 0 ? `${t9Count} Drills Evaluated` : "0 Submissions (Pending)", active: t9Count > 0, tab: "tool_10" },
    { num: 10, name: "Tool 8: Preparedness Assessment Tool (PAT)", q: 53, reach: `${patCount} Institutional Audits Complete`, active: patCount > 0, tab: "tool_8" }
  ];

  safeSetHtml('toolsManifestBody', toolDefs.map(t => `
    <tr>
      <td><span class="badge-pill badge-primary">Tool ${t.num}</span></td>
      <td><strong>${t.name}</strong></td>
      <td>${t.q} Questions</td>
      <td><strong style="color:${t.active ? 'var(--primary)' : 'var(--text-muted)'};">${t.reach}</strong></td>
      <td><span class="badge-pill ${t.active ? 'badge-success' : 'badge-warning'}">${t.active ? 'Active Tool' : 'Pending Field Data'}</span></td>
      <td><button class="btn-action ${t.active ? '' : 'btn-outline'}" style="padding:4px 10px; font-size:0.72rem;" onclick="showTab('${t.tab}')">Open Tool Analytics →</button></td>
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

  // Tool 9: School Multi-Visit Table
  const schoolVisitMap = {};
  appData.filter(s => s.tool === 'School Activity').forEach(s => {
    const sKey = (s.school || 'Unknown School').trim();
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

  // Tool 7: Community Gatekeeper Table
  safeSetHtml('tool7GatekeeperTableBody', gatekeeperRowsFiltered.length === 0 ? `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:20px;">No gatekeeper dialogue records found in active filter.</td></tr>` : gatekeeperRowsFiltered.map(g => `
    <tr>
      <td><strong>${g.district || 'Central'} / ${g.parish || '—'}</strong></td>
      <td>${g.coordinator || 'Coordinator'}</td>
      <td><span class="badge-pill badge-primary">${g.role}</span></td>
      <td>${g.male || 0}</td>
      <td>${g.female || 0}</td>
      <td style="max-width:300px; white-space:normal; font-size:0.77rem;">${g.commitments || 'Committed to supporting institutional PHE compliance'}</td>
    </tr>
  `).join(''));

  // Tool 1: Transect Walk Table
  const filteredTransect = appData.filter(d => d.tool === 'Transect Walk');
  safeSetHtml('tool3TableBody', filteredTransect.length === 0 ? `<tr><td colspan="11" style="text-align:center; color:#94a3b8; padding:20px;">No transect walk records found in active filter.</td></tr>` : filteredTransect.map(t => `
    <tr>
      <td><strong>${t.auditor}</strong></td>
      <td>${t.site}</td>
      <td><span class="badge-pill badge-primary">${t.setting}</span></td>
      <td><strong>${t.stations} Stations</strong></td>
      <td>${t.pop} Persons</td>
      <td><strong style="color:#d97706; font-size:0.83rem;">${t.stance_ratio}</strong></td>
      <td style="max-width:200px; white-space:normal; font-size:0.75rem;">${t.notes}</td>
      <td>${t.refuse}</td>
      <td><span class="badge-pill ${String(t.poster).includes('Fresh') ? 'badge-success' : 'badge-danger'}">${t.poster}</span></td>
      <td>${t.holding}</td>
      <td>${t.staff}</td>
    </tr>
  `).join(''));

  // Tool 8: PAT Table
  const filteredPat = appData.filter(d => d.tool === 'PAT Assessment');
  safeSetHtml('tool10TableBody', filteredPat.length === 0 ? `<tr><td colspan="10" style="text-align:center; color:#94a3b8; padding:20px;">No PAT institutional audits found in active filter.</td></tr>` : filteredPat.map(p => `
    <tr>
      <td><strong>${p.name}</strong></td>
      <td>${p.level}</td>
      <td>${p.boys} / ${p.girls}</td>
      <td>${p.maleStaff} / ${p.femaleStaff}</td>
      <td><span class="badge-pill ${String(p.club).toLowerCase().includes('active') || String(p.club).toLowerCase().includes('yes') ? 'badge-success' : 'badge-danger'}">${p.club}</span></td>
      <td><span class="badge-pill badge-warning">${p.plan}</span></td>
      <td>${p.space}</td>
      <td><span class="badge-pill ${String(p.washAudit).includes('Soap') ? 'badge-success' : 'badge-warning'}">${p.washAudit} (${p.stations} stns)</span></td>
      <td>${p.bStances} B / ${p.gStances} G <br><span style="font-size:0.7rem; color:var(--text-muted);">${p.stanceAudit}</span></td>
      <td style="font-size:0.75rem;">${p.wasteAudit}<br>Drain: ${p.drainageAudit}</td>
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
  }

  // Populate qualitative tools data (Tools 2, 3, 4, 5, 6, 10)
  populateQualitativeTools();

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
  if (tool2Body) {
    if (t2Rows.length === 0) {
      tool2Body.innerHTML = renderEmptyState(7, 'rapid audience intercept surveys');
    } else {
      tool2Body.innerHTML = t2Rows.map(i => `
        <tr>
          <td><strong>${i.id}</strong></td>
          <td>${i.site || i.school || '—'}</td>
          <td><span class="badge-pill badge-success">${i.q1 || 'Yes'}</span></td>
          <td>${i.q2 || '—'}</td>
          <td>${i.q3 || '—'}</td>
          <td><strong style="color:var(--primary);">${i.q4 || '—'}</strong></td>
          <td>${i.q5 || '—'}</td>
        </tr>
      `).join('');
    }
  }

  // Tool 3: 'Ask 5' Diagnostic
  const tool3Body = document.getElementById('tool5TableBody');
  const t3Rows = appData.filter(d => d.tool === 'Ask 5');
  if (tool3Body) {
    if (t3Rows.length === 0) {
      tool3Body.innerHTML = renderEmptyState(6, "'Ask 5' behavioral verification diagnostics");
    } else {
      tool3Body.innerHTML = t3Rows.map(c => `
        <tr>
          <td><strong>${c.id}</strong></td>
          <td><span class="badge-pill badge-primary">${c.group || '—'}</span></td>
          <td>${c.claim || '—'}</td>
          <td style="font-size:0.75rem; color:#475569;">${c.prompt || '—'}</td>
          <td style="font-size:0.75rem;">${c.findings || '—'}</td>
          <td><span class="badge-pill badge-success">${c.status || 'Verified'}</span></td>
        </tr>
      `).join('');
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
          <td><strong>${s.id}</strong></td>
          <td><strong>${s.participant || s.part || '—'}</strong></td>
          <td style="font-size:0.75rem;">${s.baseline || '—'}</td>
          <td style="font-size:0.75rem; color:var(--primary); font-weight:600;">${s.event || '—'}</td>
          <td style="font-size:0.75rem;">${s.change || '—'}</td>
          <td style="font-size:0.75rem; font-weight:600;">${s.significance || '—'}</td>
        </tr>
      `).join('');
    }
  }

  // Tool 5: Social Influencer Mapping
  const tool5Body = document.getElementById('tool7TableBody');
  const t5Rows = appData.filter(d => d.tool === 'Influencer Mapping');
  if (tool5Body) {
    if (t5Rows.length === 0) {
      tool5Body.innerHTML = renderEmptyState(4, 'influencer or social network mappings');
    } else {
      tool5Body.innerHTML = t5Rows.map(inf => `
        <tr>
          <td><span class="badge-pill badge-primary">${inf.sector || '—'}</span></td>
          <td><strong>${inf.leaders || inf.name || '—'}</strong></td>
          <td>${inf.contact || '—'}</td>
          <td style="font-size:0.76rem;">${inf.strategy || '—'}</td>
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
          <td><strong>${ph.id}</strong></td>
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
          <td><strong>${dr.id}</strong></td>
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
                return `Total Reach: ${d.totalReach.toLocaleString()} (Learners: ${d.totalLearners.toLocaleString()} + Gatekeepers: ${d.teachers})`;
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
        labels: ['Functional & Supplied', 'Present, No Soap / Water', 'No Facility Setup'],
        datasets: [{
          label: 'Sites Audited',
          data: [
            transectFiltered.filter(t => String(t.wash).toLowerCase().includes('functional') || String(t.wash).toLowerCase().includes('present & functional')).length,
            transectFiltered.filter(t => String(t.wash).toLowerCase().includes('no soap') || String(t.wash).toLowerCase().includes('no water')).length,
            transectFiltered.filter(t => String(t.wash).toLowerCase().includes('no facility') || String(t.wash).toLowerCase().includes('not present')).length
          ],
          backgroundColor: ['#10b981', '#f1bc1b', '#ef4444'],
          borderRadius: 4,
          datalabels: { anchor: 'end', align: 'right', color: '#282c68', font: { weight: 'bold' } }
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

  const elPoster = document.getElementById('chartPosterT3');
  if (elPoster) {
    const transectFiltered = appData.filter(d => d.tool === 'Transect Walk');
    chartInstances.posterT3 = new Chart(elPoster.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Fresh & Prominent', 'Obsolete (No hotline)', 'Torn Posters', 'No Posters Seen'],
        datasets: [{
          label: 'Facilities Audited',
          data: [
            transectFiltered.filter(t => String(t.poster).toLowerCase().includes('fresh') || String(t.poster).toLowerCase().includes('prominent')).length,
            transectFiltered.filter(t => String(t.poster).toLowerCase().includes('obsolete')).length,
            transectFiltered.filter(t => String(t.poster).toLowerCase().includes('torn')).length,
            transectFiltered.filter(t => String(t.poster).toLowerCase().includes('no material') || String(t.poster).toLowerCase().includes('no poster') || String(t.poster).toLowerCase().includes('none')).length
          ],
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
        scales: { x: { beginAtZero: true, grace: '20%' } }
      }
    });
  }

  // Tool 2 Charts (Only render if field records exist; otherwise display pending placeholder)
  const t2Data = appData.filter(d => d.tool === 'Rapid Intercept');
  const elT4Q1 = document.getElementById('chartT4Q1');
  const emptyT4Q1 = document.getElementById('emptyT4Q1');
  const elT4Q4 = document.getElementById('chartT4Q4');
  const emptyT4Q4 = document.getElementById('emptyT4Q4');

  if (elT4Q1 && emptyT4Q1) {
    if (t2Data.length === 0) {
      elT4Q1.style.display = 'none';
      emptyT4Q1.style.display = 'flex';
    } else {
      elT4Q1.style.display = 'block';
      emptyT4Q1.style.display = 'none';
      const heardCount = t2Data.filter(d => String(d.q1).toLowerCase().includes('yes')).length;
      chartInstances.chartT4Q1 = new Chart(elT4Q1.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: ['Heard Outbreak Message (7d)', 'Not Heard in 7d'],
          datasets: [{
            data: [heardCount, t2Data.length - heardCount],
            backgroundColor: ['#282c68', '#e2e8f0']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } }
        }
      });
    }
  }

  if (elT4Q4 && emptyT4Q4) {
    if (t2Data.length === 0) {
      elT4Q4.style.display = 'none';
      emptyT4Q4.style.display = 'flex';
    } else {
      elT4Q4.style.display = 'block';
      emptyT4Q4.style.display = 'none';
      const actionCounts = {};
      t2Data.forEach(d => {
        const act = d.q4 || 'Unspecified';
        actionCounts[act] = (actionCounts[act] || 0) + 1;
      });
      chartInstances.chartT4Q4 = new Chart(elT4Q4.getContext('2d'), {
        type: 'bar',
        data: {
          labels: Object.keys(actionCounts),
          datasets: [{
            label: 'Respondents',
            data: Object.values(actionCounts),
            backgroundColor: '#f1bc1b',
            borderRadius: 4
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
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, grace: '15%' } }
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
      const statusCounts = {};
      t3Data.forEach(d => {
        const st = d.status || 'Unverified';
        statusCounts[st] = (statusCounts[st] || 0) + 1;
      });
      chartInstances.chartT5Claims = new Chart(elT5Claims.getContext('2d'), {
        type: 'pie',
        data: {
          labels: Object.keys(statusCounts),
          datasets: [{
            data: Object.values(statusCounts),
            backgroundColor: ['#10b981', '#f1bc1b', '#ef4444']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } }
        }
      });
    }
  }
}


// Attach functions to global window for HTML inline handlers
window.processRawWorkbookRows = processRawWorkbookRows;
window.recomputeAndRender = recomputeAndRender;
window.renderBarCharts = renderBarCharts;
window.showTab = showTab;
window.applyFilters = applyFilters;
window.resetFilters = resetFilters;

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
