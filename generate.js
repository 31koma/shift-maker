document.addEventListener('DOMContentLoaded', () => {
    const SHIFT_TYPES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
    const MAX_PUBLIC_HOLIDAYS = 8;
    const DEFAULT_MAX_CONSECUTIVE_WORK_DAYS = 3;
    const HOLIDAYS_2026 = new Set([
        '2026-01-01',
        '2026-01-12',
        '2026-02-11',
        '2026-02-23',
        '2026-03-20',
        '2026-04-29',
        '2026-05-03',
        '2026-05-04',
        '2026-05-05',
        '2026-05-06',
        '2026-07-20',
        '2026-08-11',
        '2026-09-21',
        '2026-09-22',
        '2026-09-23',
        '2026-10-12',
        '2026-11-03',
        '2026-11-23'
    ]);
    const MANUAL_ONLY_IRREGULAR_NAMES = new Set(["中西"]);
    const DEFAULT_GENERATE_RULES = {
        oneShiftCount: 1,
        tenShiftCount: 3,
        oneFulltimeOnly: true,
        oneNoAfterTen: true,
        requireFulltimeOn10: true,
        tenFtProb1: 40,
        tenFtProb2: 40,
        tenFtProb3: 20,
        allowFourConsecutive: false,
        fillBlankWithSix: false
    };
    const DEFAULT_TIME_SETTINGS = {
        "1": { enabled: true, start: "06:00", end: "14:30" },
        "2": { enabled: true, start: "", end: "" },
        "3": { enabled: true, start: "", end: "" },
        "4": { enabled: true, start: "", end: "" },
        "5": { enabled: true, start: "", end: "" },
        "6": { enabled: true, start: "08:30", end: "17:00" },
        "7": { enabled: true, start: "", end: "" },
        "8": { enabled: true, start: "", end: "" },
        "9": { enabled: true, start: "", end: "" },
        "10": { enabled: true, start: "10:30", end: "19:00" }
    };
    const SAVED_RESULTS_KEY = 'shiftApp_savedShiftResults';
    const FULLTIME_CORE_NAMES = new Set(["梶本", "田渕", "田淵", "北窪", "八田"]);
    const WEEKEND_TEN_PRIORITY_NAMES = new Set(["石川", "大野"]);

    // State
    let today = new Date();
    let currentYear = today.getFullYear();
    let currentTargetMonth = today.getMonth() + 1;

    if (today.getDate() > 20) {
        currentTargetMonth++;
        if (currentTargetMonth > 12) {
            currentTargetMonth = 1;
            currentYear++;
        }
    }

    const currentMonthDisplay = document.getElementById('current-month-display');
    const periodDisplay = document.getElementById('period-display');
    const tableContainer = document.getElementById('shift-table');
    const shiftContainer = document.getElementById('shift-container');
    const summaryTableContainer = document.getElementById('summary-table-container');
    const summaryPrintTableContainer = document.getElementById('summary-print-table-container');
    const summaryHoverControl = document.getElementById('summary-hover-control');
    const summaryHoverBtn = document.getElementById('summary-hover-btn');
    const summaryHoverPanel = document.getElementById('summary-hover-panel');
    const toast = document.getElementById('toast');
    const printTitle = document.getElementById('print-title');
    const shiftTimeSummary = document.getElementById('shift-time-summary');
    const printTimeSummary = document.getElementById('print-time-summary');
    const timeSettingsBtn = document.getElementById('time-settings-btn');
    const timeSettingsModal = document.getElementById('time-settings-modal');
    const closeTimeSettingsBtn = document.getElementById('close-time-settings');
    const cancelTimeSettingsBtn = document.getElementById('cancel-time-settings');
    const saveTimeSettingsBtn = document.getElementById('save-time-settings');
    const ruleSettingsBtn = document.getElementById('rule-settings-btn');
    const ruleSettingsModal = document.getElementById('rule-settings-modal');
    const closeRuleSettingsBtn = document.getElementById('close-rule-settings');
    const cancelRuleSettingsBtn = document.getElementById('cancel-rule-settings');
    const saveRuleSettingsBtn = document.getElementById('save-rule-settings');
    const ruleLogicSummary = document.getElementById('rule-logic-summary');
    const saveResultBtn = document.getElementById('saveBtn') || document.getElementById('save-result-btn');
    const openSavedResultsBtn = document.getElementById('openSavedResultsBtn') || document.getElementById('open-saved-results-btn');
    const summaryPrintBtn = document.getElementById('summary-print-btn');
    const savedResultsModal = document.getElementById('saved-results-modal');
    const closeSavedResultsBtn = document.getElementById('close-saved-results');
    const closeSavedResultsFooterBtn = document.getElementById('close-saved-results-footer');
    const savedResultsList = document.getElementById('saved-results-list');

    function initSummaryHoverPanel() {
        if (!summaryHoverControl || !summaryHoverPanel) return;

        document.body.appendChild(summaryHoverPanel);

        let hideTimer = null;
        let panelPinned = false;
        let handledPointerOpen = false;

        function positionSummaryPanel() {
            summaryHoverPanel.style.left = '50%';
            summaryHoverPanel.style.top = '50%';
        }

        function showSummaryPanel({ pinned = false } = {}) {
            window.clearTimeout(hideTimer);
            panelPinned = pinned || panelPinned;
            summaryHoverPanel.classList.add('is-visible');
            summaryHoverPanel.classList.toggle('is-pinned', panelPinned);
            positionSummaryPanel();
        }

        function hideSummaryPanel({ force = false } = {}) {
            window.clearTimeout(hideTimer);
            if (!force && panelPinned) return;
            hideTimer = window.setTimeout(() => {
                if (force || (!summaryHoverControl.matches(':hover, :focus-within') &&
                    !summaryHoverPanel.matches(':hover, :focus-within'))) {
                    panelPinned = false;
                    summaryHoverPanel.classList.remove('is-visible');
                    summaryHoverPanel.classList.remove('is-pinned');
                }
            }, 120);
        }

        function togglePinnedSummaryPanel(e) {
            e.preventDefault();
            e.stopPropagation();
            if (summaryHoverPanel.classList.contains('is-visible') && panelPinned) {
                hideSummaryPanel({ force: true });
            } else {
                showSummaryPanel({ pinned: true });
            }
        }

        if (summaryHoverBtn) {
            summaryHoverBtn.addEventListener('pointerdown', (e) => {
                handledPointerOpen = true;
                togglePinnedSummaryPanel(e);
            }, true);
            summaryHoverBtn.addEventListener('click', (e) => {
                if (handledPointerOpen) {
                    handledPointerOpen = false;
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                togglePinnedSummaryPanel(e);
            }, true);
        }
        summaryHoverControl.addEventListener('mouseenter', showSummaryPanel);
        summaryHoverControl.addEventListener('focusin', showSummaryPanel);
        summaryHoverControl.addEventListener('mouseleave', hideSummaryPanel);
        summaryHoverControl.addEventListener('focusout', hideSummaryPanel);
        summaryHoverPanel.addEventListener('click', (e) => e.stopPropagation());
        summaryHoverPanel.addEventListener('mouseenter', showSummaryPanel);
        summaryHoverPanel.addEventListener('focusin', showSummaryPanel);
        summaryHoverPanel.addEventListener('mouseleave', hideSummaryPanel);
        summaryHoverPanel.addEventListener('focusout', hideSummaryPanel);
        document.addEventListener('click', () => hideSummaryPanel({ force: true }));
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hideSummaryPanel({ force: true });
        });
        window.addEventListener('resize', positionSummaryPanel);
    }

    function moveStaffAfter(list, staffName, previousName) {
        const staffIdx = list.findIndex(s => s.name === staffName);
        const previousIdx = list.findIndex(s => s.name === previousName);
        if (staffIdx === -1 || previousIdx === -1 || staffIdx === previousIdx + 1) return false;

        const [staff] = list.splice(staffIdx, 1);
        const updatedPreviousIdx = list.findIndex(s => s.name === previousName);
        list.splice(updatedPreviousIdx + 1, 0, staff);
        return true;
    }

    function isFulltimeCoreStaff(staff) {
        return !!staff.isFulltimeCore || FULLTIME_CORE_NAMES.has(staff.name);
    }

    function normalizeStaffData(rawStaffData) {
        let normalized = rawStaffData;
        let shouldSave = false;
        if (!normalized || !normalized.fulltime) {
            normalized = { fulltime: [], parttime: [], irregular: [] };
        } else {
            if (!normalized.irregular) {
                normalized.irregular = [];
            }
            const promoteNames = ["岸本", "中川", "清水", "柿林"];
            let migrated = false;
            promoteNames.forEach(name => {
                const ptIdx = normalized.parttime.findIndex(p => p.name === name);
                if (ptIdx > -1) {
                    const staffObj = normalized.parttime.splice(ptIdx, 1)[0];
                    if (!normalized.fulltime.some(f => f.name === name)) {
                        normalized.fulltime.push(staffObj);
                        migrated = true;
                    }
                }
            });
            ["石川"].forEach(name => {
                const ptIdx = normalized.parttime.findIndex(p => p.name === name);
                const irIdx = normalized.irregular.findIndex(p => p.name === name);
                const sourceIdx = ptIdx > -1 ? ptIdx : irIdx;
                const sourceList = ptIdx > -1 ? normalized.parttime : normalized.irregular;
                if (sourceIdx > -1) {
                    const staffObj = sourceList.splice(sourceIdx, 1)[0];
                    if (!normalized.fulltime.some(f => f.name === name)) {
                        normalized.fulltime.push(staffObj);
                    }
                    migrated = true;
                }
            });
            const promoteToIrreg = ["太田", "中西"];
            promoteToIrreg.forEach(name => {
                const ptIdx = normalized.parttime.findIndex(p => p.name === name);
                if (ptIdx > -1) {
                    const staffObj = normalized.parttime.splice(ptIdx, 1)[0];
                    if (!normalized.irregular.some(f => f.name === name)) {
                        normalized.irregular.push(staffObj);
                        migrated = true;
                    }
                }
            });
            const demoteToParttime = ["岩田美"];
            demoteToParttime.forEach(name => {
                const ftIdx = normalized.fulltime.findIndex(f => f.name === name);
                if (ftIdx > -1) {
                    const staffObj = normalized.fulltime.splice(ftIdx, 1)[0];
                    staffObj.canWorkOneShift = false;
                    if (!normalized.parttime.some(p => p.name === name)) {
                        normalized.parttime.push(staffObj);
                    }
                    migrated = true;
                }
            });
            ["大野"].forEach(name => {
                const ftIdx = normalized.fulltime.findIndex(p => p.name === name);
                const irIdx = normalized.irregular.findIndex(p => p.name === name);
                const sourceIdx = ftIdx > -1 ? ftIdx : irIdx;
                const sourceList = ftIdx > -1 ? normalized.fulltime : normalized.irregular;
                if (sourceIdx > -1) {
                    const staffObj = sourceList.splice(sourceIdx, 1)[0];
                    if (!normalized.parttime.some(p => p.name === name)) {
                        normalized.parttime.push(staffObj);
                    }
                    migrated = true;
                }
            });
            if (moveStaffAfter(normalized.parttime, "岩田美", "竹田")) {
                migrated = true;
            }
            normalized.fulltime.forEach(staff => {
                const shouldBeCore = FULLTIME_CORE_NAMES.has(staff.name) || !!staff.isFulltimeCore;
                if (!!staff.isFulltimeCore !== shouldBeCore) {
                    staff.isFulltimeCore = shouldBeCore;
                    migrated = true;
                }
            });
            normalized.fulltime.sort((a, b) => {
                return Number(isFulltimeCoreStaff(b)) - Number(isFulltimeCoreStaff(a));
            });

            if (migrated) {
                shouldSave = true;
            }
        }
        const fulltimeSet = new Set(normalized.fulltime);
        [...normalized.fulltime, ...normalized.parttime, ...normalized.irregular].forEach(s => {
            if (s.canWorkOneShift === undefined) {
                s.canWorkOneShift = fulltimeSet.has(s);
                shouldSave = true;
            }
        });

        const checkedOneShiftCount = [...normalized.fulltime, ...normalized.parttime, ...normalized.irregular]
            .filter(s => s.checked)
            .filter(s => !!s.canWorkOneShift)
            .length;
        if (checkedOneShiftCount === 0) {
            normalized.fulltime.forEach(s => {
                if (s.checked && !s.canWorkOneShift) {
                    s.canWorkOneShift = true;
                    shouldSave = true;
                }
            });
        }

        if (shouldSave) {
            localStorage.setItem('shiftApp_staffData', JSON.stringify(normalized));
        }
        return normalized;
    }

    function buildActiveStaffFromData(sourceStaffData) {
        return [
            ...sourceStaffData.fulltime.filter(s => s.checked).map(s => ({ name: s.name, isFulltime: true, isFulltimeCore: isFulltimeCoreStaff(s), isIrregular: false, manualOnly: false, canWorkOneShift: !!s.canWorkOneShift, pubHolidays: Math.max(0, Math.min(MAX_PUBLIC_HOLIDAYS, parseInt(s.pubHolidays, 10) || 8)) })),
            ...sourceStaffData.parttime.filter(s => s.checked).map(s => ({ name: s.name, isFulltime: false, isIrregular: false, manualOnly: false, canWorkOneShift: !!s.canWorkOneShift, pubHolidays: Math.max(0, Math.min(MAX_PUBLIC_HOLIDAYS, parseInt(s.pubHolidays, 10) || 8)) })),
            ...sourceStaffData.irregular.filter(s => s.checked).map(s => ({
                name: s.name,
                isFulltime: false,
                isIrregular: true,
                manualOnly: MANUAL_ONLY_IRREGULAR_NAMES.has(s.name),
                canWorkOneShift: !!s.canWorkOneShift,
                pubHolidays: Math.max(0, Math.min(MAX_PUBLIC_HOLIDAYS, parseInt(s.pubHolidays, 10) || 8))
            }))
        ];
    }

    function isManualOnlyWorkRequest(req) {
        return req === '出' || isWorkValue(req);
    }

    function getManualOnlyWorkValue() {
        if (timeSettings["6"] && timeSettings["6"].enabled) return '6';
        const enabledType = SHIFT_TYPES.find(type => timeSettings[type] && timeSettings[type].enabled);
        return enabledType || '6';
    }

    function getManualOnlyRequestedWorkValue(req) {
        if (isRequestedWorkValue(req) && timeSettings[req] && timeSettings[req].enabled) return req;
        if (req === '出') return getManualOnlyWorkValue();
        return '';
    }

    function refreshStaffData() {
        staffData = normalizeStaffData(JSON.parse(localStorage.getItem('shiftApp_staffData')));
        activeStaff = buildActiveStaffFromData(staffData);
    }

    // Load data
    let eventData = JSON.parse(localStorage.getItem('shiftApp_eventData')) || {};
    let requestData = JSON.parse(localStorage.getItem('shiftApp_requestData')) || {};
    let timeSettings = loadTimeSettings();
    let generateRules = loadGenerateRules();
    let lastGeneratedDates = [];
    let lastGeneratedStaffStats = [];
    let generationCount = 0;
    let staffData = normalizeStaffData(JSON.parse(localStorage.getItem('shiftApp_staffData')));
    let activeStaff = buildActiveStaffFromData(staffData);

    init();

    // 先にグローバル公開して、onclick から常に呼べるようにする
    window.saveShiftResult = function () {
        return saveCurrentResult();
    };
    window.openSavedShiftResults = function () {
        return openSavedResultsModal();
    };

    function init() {
        refreshStaffData();
        normalizeRequestData();
        initSummaryHoverPanel();
        bindEvents();
        renderTimeSummary();
        updateMonthDisplay();
    }

    function normalizeRequestData() {
        // 旧データ互換の正規化だけを行う（休み希望の「休」はそのまま保持）
        let changed = false;
        Object.keys(requestData).forEach(dateStr => {
            const byStaff = requestData[dateStr] || {};
            Object.keys(byStaff).forEach(staffName => {
                if (byStaff[staffName] === '有休') {
                    byStaff[staffName] = '有';
                    changed = true;
                } else if (byStaff[staffName] === '特休') {
                    byStaff[staffName] = '特';
                    changed = true;
                }
            });
        });
        if (changed) {
            localStorage.setItem('shiftApp_requestData', JSON.stringify(requestData));
        }
    }

    function loadTimeSettings() {
        const saved = JSON.parse(localStorage.getItem('shiftApp_timeSettings')) || {};
        const settings = {};
        SHIFT_TYPES.forEach(type => {
            settings[type] = { ...DEFAULT_TIME_SETTINGS[type], ...(saved[type] || {}) };
        });
        if (!settings["1"].enabled) {
            settings["1"].enabled = true;
        }
        return settings;
    }

    function loadGenerateRules() {
        const saved = JSON.parse(localStorage.getItem('shiftApp_generateRules')) || {};
        const rules = { ...DEFAULT_GENERATE_RULES, ...saved };
        rules.oneShiftCount = Math.max(1, parseInt(rules.oneShiftCount, 10) || DEFAULT_GENERATE_RULES.oneShiftCount);
        rules.allowFourConsecutive = Object.prototype.hasOwnProperty.call(saved, 'allowFourConsecutive')
            ? !!saved.allowFourConsecutive
            : DEFAULT_GENERATE_RULES.allowFourConsecutive;
        rules.fillBlankWithSix = Object.prototype.hasOwnProperty.call(saved, 'fillBlankWithSix')
            ? !!saved.fillBlankWithSix
            : DEFAULT_GENERATE_RULES.fillBlankWithSix;
        return rules;
    }

    function saveGenerateRules() {
        localStorage.setItem('shiftApp_generateRules', JSON.stringify(generateRules));
    }

    function saveTimeSettings() {
        localStorage.setItem('shiftApp_timeSettings', JSON.stringify(timeSettings));
    }

    function getSavedShiftResults() {
        const list = JSON.parse(localStorage.getItem(SAVED_RESULTS_KEY)) || [];
        if (!Array.isArray(list)) return [];
        return list;
    }

    function setSavedShiftResults(list) {
        localStorage.setItem(SAVED_RESULTS_KEY, JSON.stringify(list));
    }

    function deepCloneJson(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function formatDateTimeLabel(dateObj) {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        const hh = String(dateObj.getHours()).padStart(2, '0');
        const mm = String(dateObj.getMinutes()).padStart(2, '0');
        return `${y}/${m}/${d} ${hh}:${mm}`;
    }

    function getShiftLabel(type) {
        const map = {
            "1": "①", "2": "②", "3": "③", "4": "④", "5": "⑤",
            "6": "⑥", "7": "⑦", "8": "⑧", "9": "⑨", "10": "⑩"
        };
        if (map[type]) return map[type];
        return type;
    }

    function renderTimeSummary() {
        const parts = SHIFT_TYPES.filter(type => timeSettings[type].enabled).map(type => {
            const conf = timeSettings[type];
            const label = getShiftLabel(type);
            const range = (conf.start && conf.end) ? `${conf.start}-${conf.end}` : '時間未設定';
            return `${label} ${range}`;
        });
        const summary = `時間設定: ${parts.length > 0 ? parts.join(" / ") : '全てOFF'}`;
        shiftTimeSummary.textContent = summary;
        printTimeSummary.textContent = summary;
    }

    function getEnabledShiftTimeText() {
        const parts = SHIFT_TYPES.filter(type => timeSettings[type].enabled).map(type => {
            const conf = timeSettings[type];
            const label = getShiftLabel(type);
            const range = (conf.start && conf.end) ? `${conf.start}-${conf.end}` : '時間未設定';
            return `${label} ${range}`;
        });
        return parts.length > 0 ? parts.join(' / ') : '全てOFF';
    }

    function openTimeSettingsModal() {
        document.querySelectorAll('.time-setting').forEach(row => {
            const type = row.dataset.type;
            const conf = timeSettings[type];
            if (!conf) return;

            const enabledInput = row.querySelector('.shift-enabled');
            const startInput = row.querySelector('.shift-start');
            const endInput = row.querySelector('.shift-end');

            enabledInput.checked = !!conf.enabled;
            startInput.value = conf.start;
            endInput.value = conf.end;
        });

        timeSettingsModal.classList.remove('hidden');
        setTimeout(() => {
            const modalContent = timeSettingsModal.querySelector('.modal-content');
            if (modalContent) modalContent.classList.add('show');
        }, 10);
    }

    function closeTimeSettingsModal() {
        const modalContent = timeSettingsModal.querySelector('.modal-content');
        if (modalContent) modalContent.classList.remove('show');
        setTimeout(() => timeSettingsModal.classList.add('hidden'), 300);
    }

    function commitTimeSettingsFromModal() {
        const nextSettings = {};
        SHIFT_TYPES.forEach(type => {
            nextSettings[type] = { ...timeSettings[type] };
        });

        document.querySelectorAll('.time-setting').forEach(row => {
            const type = row.dataset.type;
            if (!nextSettings[type]) return;
            const enabledInput = row.querySelector('.shift-enabled');
            const startInput = row.querySelector('.shift-start');
            const endInput = row.querySelector('.shift-end');

            nextSettings[type].enabled = enabledInput.checked;
            nextSettings[type].start = startInput.value;
            nextSettings[type].end = endInput.value;
        });

        nextSettings["1"].enabled = true;

        const hasEnabled = SHIFT_TYPES.some(type => nextSettings[type].enabled);
        if (!hasEnabled) {
            alert('少なくとも1つはONにしてください。');
            return;
        }

        timeSettings = nextSettings;
        saveTimeSettings();
        renderTimeSummary();
        if (lastGeneratedDates.length > 0 && lastGeneratedStaffStats.length > 0) {
            renderShiftTable(lastGeneratedDates, lastGeneratedStaffStats);
            shiftContainer.style.display = 'block';
        }
        closeTimeSettingsModal();
        showToast('時間設定を保存しました');
    }

    function openRuleSettingsModal() {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };
        const setChecked = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.checked = !!val;
        };

        setVal('rule-1-count', generateRules.oneShiftCount);
        setVal('rule-10-count', generateRules.tenShiftCount);
        setChecked('rule-1-fulltime-only', generateRules.oneFulltimeOnly);
        setChecked('rule-1-no-after-10', generateRules.oneNoAfterTen);
        setChecked('rule-require-ft-on-10', generateRules.requireFulltimeOn10);
        setVal('rule-10-ft-p1', generateRules.tenFtProb1);
        setVal('rule-10-ft-p2', generateRules.tenFtProb2);
        setVal('rule-10-ft-p3', generateRules.tenFtProb3);
        setChecked('rule-allow-4-consecutive', generateRules.allowFourConsecutive);
        setChecked('rule-fill-blank-with-six', generateRules.fillBlankWithSix);
        renderRuleLogicSummary();

        ruleSettingsModal.classList.remove('hidden');
        ruleSettingsModal.style.display = 'flex';
        setTimeout(() => {
            const modalContent = ruleSettingsModal.querySelector('.modal-content');
            if (modalContent) modalContent.classList.add('show');
        }, 10);
    }

    function closeRuleSettingsModal() {
        const modalContent = ruleSettingsModal.querySelector('.modal-content');
        if (modalContent) modalContent.classList.remove('show');
        setTimeout(() => {
            ruleSettingsModal.classList.add('hidden');
            ruleSettingsModal.style.display = '';
        }, 300);
    }

    function commitRuleSettingsFromModal() {
        const getNum = (id, fallback) => {
            const el = document.getElementById(id);
            if (!el) return fallback;
            const n = parseInt(el.value || `${fallback}`, 10);
            return Math.max(0, isNaN(n) ? fallback : n);
        };
        const getChk = (id, fallback) => {
            const el = document.getElementById(id);
            return el ? !!el.checked : fallback;
        };
        const nextRules = {
            ...generateRules,
            oneShiftCount: Math.max(1, getNum('rule-1-count', generateRules.oneShiftCount)),
            tenShiftCount: getNum('rule-10-count', generateRules.tenShiftCount),
            oneFulltimeOnly: getChk('rule-1-fulltime-only', generateRules.oneFulltimeOnly),
            oneNoAfterTen: getChk('rule-1-no-after-10', generateRules.oneNoAfterTen),
            requireFulltimeOn10: getChk('rule-require-ft-on-10', generateRules.requireFulltimeOn10),
            tenFtProb1: getNum('rule-10-ft-p1', generateRules.tenFtProb1),
            tenFtProb2: getNum('rule-10-ft-p2', generateRules.tenFtProb2),
            tenFtProb3: getNum('rule-10-ft-p3', generateRules.tenFtProb3),
            allowFourConsecutive: getChk('rule-allow-4-consecutive', generateRules.allowFourConsecutive),
            fillBlankWithSix: getChk('rule-fill-blank-with-six', generateRules.fillBlankWithSix)
        };

        const probSum = nextRules.tenFtProb1 + nextRules.tenFtProb2 + nextRules.tenFtProb3;
        if (probSum > 0 && probSum !== 100) {
            nextRules.tenFtProb1 = Math.round((nextRules.tenFtProb1 / probSum) * 100);
            nextRules.tenFtProb2 = Math.round((nextRules.tenFtProb2 / probSum) * 100);
            nextRules.tenFtProb3 = Math.max(0, 100 - nextRules.tenFtProb1 - nextRules.tenFtProb2);
        }

        generateRules = nextRules;
        saveGenerateRules();
        renderRuleLogicSummary();
        if (lastGeneratedDates.length > 0) {
            generateShift();
        }
        closeRuleSettingsModal();
        showToast('ルール設定を保存しました');
    }

    function openSavedResultsModal() {
        renderSavedResultsList();
        savedResultsModal.classList.remove('hidden');
        savedResultsModal.style.display = 'flex';
        setTimeout(() => {
            const modalContent = savedResultsModal.querySelector('.modal-content');
            if (modalContent) modalContent.classList.add('show');
        }, 10);
    }

    function closeSavedResultsModal() {
        const modalContent = savedResultsModal.querySelector('.modal-content');
        if (modalContent) modalContent.classList.remove('show');
        setTimeout(() => {
            savedResultsModal.classList.add('hidden');
            savedResultsModal.style.display = '';
        }, 300);
    }

    function saveCurrentResult() {
        try {
            if (!lastGeneratedDates.length || !lastGeneratedStaffStats.length) {
                alert('保存するシフト結果がありません。先に自動生成してください。');
                return;
            }

            const now = new Date();
            const id = `sr_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            const monthLabel = `${currentYear}年${currentTargetMonth}月度`;
            const savedAt = now.toISOString();
            const result = {
                id,
                savedAt,
                year: currentYear,
                targetMonth: currentTargetMonth,
                label: `${monthLabel} ${formatDateTimeLabel(now)}`,
                dates: lastGeneratedDates.map(d => formatDateForData(d)),
                staffStats: lastGeneratedStaffStats.map(staff => ({
                    ...deepCloneJson(staff),
                    fixedPublicDates: Array.from(staff.fixedPublicDates || []),
                    fixedWorkDates: Array.from(staff.fixedWorkDates || []),
                    fixedPublicHolidayDates: Array.from(staff.fixedPublicHolidayDates || [])
                })),
                timeSettings: deepCloneJson(timeSettings),
                generateRules: deepCloneJson(generateRules)
            };

            const list = getSavedShiftResults();
            list.unshift(result);
            let nextList = list.slice(0, 50);

            try {
                setSavedShiftResults(nextList);
                showToast('生成結果を保存しました');
                return;
            } catch (e) {
                // 容量超過時は古い保存を自動で削りながら再試行
            }

            while (nextList.length > 1) {
                nextList.pop();
                try {
                    setSavedShiftResults(nextList);
                    showToast('生成結果を保存しました（古い保存を整理）');
                    return;
                } catch (e) {
                    // continue
                }
            }

            alert('保存容量がいっぱいのため保存できません。保存結果を一部削除してから再実行してください。');
        } catch (e) {
            alert(`保存処理でエラーが発生しました: ${e && e.message ? e.message : '不明なエラー'}`);
        }
    }

    function loadSavedResult(id) {
        const list = getSavedShiftResults();
        const target = list.find(item => item.id === id);
        if (!target) {
            showToast('保存結果が見つかりません');
            return;
        }

        currentYear = target.year;
        currentTargetMonth = target.targetMonth;
        updateMonthDisplay();

        const loadedDates = (target.dates || []).map(ds => new Date(`${ds}T00:00:00`));
        const loadedStats = (target.staffStats || []).map(s => ({
            ...s,
            isFulltimeCore: !!s.isFulltimeCore || (s.isFulltime && FULLTIME_CORE_NAMES.has(s.name)),
            fixedPublicDates: new Set(Array.isArray(s.fixedPublicDates) ? s.fixedPublicDates : []),
            fixedWorkDates: new Set(Array.isArray(s.fixedWorkDates) ? s.fixedWorkDates : []),
            fixedPublicHolidayDates: new Set(Array.isArray(s.fixedPublicHolidayDates) ? s.fixedPublicHolidayDates : []),
            schedule: { ...(s.schedule || {}) }
        }));

        if (target.timeSettings) {
            timeSettings = { ...timeSettings, ...target.timeSettings };
            renderTimeSummary();
        }
        if (target.generateRules) {
            generateRules = { ...generateRules, ...target.generateRules };
        }

        lastGeneratedDates = loadedDates;
        lastGeneratedStaffStats = loadedStats;
        renderShiftTable(lastGeneratedDates, lastGeneratedStaffStats);
        renderSummaryPanel(lastGeneratedStaffStats);
        if (shiftContainer) shiftContainer.style.display = 'block';
        closeSavedResultsModal();
        showToast('保存結果を読み込みました');
    }

    function deleteSavedResult(id) {
        const list = getSavedShiftResults();
        const nextList = list.filter(item => item.id !== id);
        setSavedShiftResults(nextList);
        renderSavedResultsList();
        showToast('保存結果を削除しました');
    }

    function renderSavedResultsList() {
        if (!savedResultsList) return;
        const list = getSavedShiftResults();
        if (!list.length) {
            savedResultsList.innerHTML = '<div style="padding:0.6rem; color:var(--text-muted);">保存された結果はありません。</div>';
            return;
        }

        savedResultsList.innerHTML = list.map(item => {
            const dateText = item.savedAt ? formatDateTimeLabel(new Date(item.savedAt)) : '-';
            const memberCount = Array.isArray(item.staffStats) ? item.staffStats.length : 0;
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:0.6rem; border:1px solid var(--border-color); border-radius:10px; padding:0.55rem 0.7rem; background:#fff;">
                    <div style="min-width:0;">
                        <div style="font-weight:700; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(item.label || '保存結果')}</div>
                        <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(dateText)} / ${memberCount}名</div>
                    </div>
                    <div style="display:flex; gap:0.4rem; flex-shrink:0;">
                        <button type="button" class="secondary-btn load-saved-result-btn" data-id="${escapeAttr(item.id)}">開く</button>
                        <button type="button" class="danger-btn delete-saved-result-btn" data-id="${escapeAttr(item.id)}">削除</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderRuleLogicSummary() {
        if (!ruleLogicSummary) return;
        refreshStaffData();

        const assignable = activeStaff.filter(s => !s.manualOnly);
        const totalStaff = assignable.length;
        const dayCount = 31;
        const totalPublicHolidayTarget = assignable.reduce((sum, s) => sum + (s.pubHolidays || 0), 0);
        const normalRange = getDynamicTargetRange(totalStaff, totalPublicHolidayTarget, dayCount, false);
        const eventRange = getDynamicTargetRange(totalStaff, totalPublicHolidayTarget, dayCount, true);
        const p1 = Math.max(0, generateRules.tenFtProb1 || 0);
        const p2 = Math.max(0, generateRules.tenFtProb2 || 0);
        const p3 = Math.max(0, generateRules.tenFtProb3 || 0);
        const oneShiftTargetCount = assignable.filter(s => s.canWorkOneShift).length;
        const oneShiftFulltimeCount = assignable.filter(s => s.isFulltime && s.canWorkOneShift).length;
        const oneShiftTargetText = `①参加スタッフ${oneShiftTargetCount}人（うち正社員${oneShiftFulltimeCount}人）`;

        const lines = [
            `・人数目安: スタッフ総数(${totalStaff}人)と公休設定の平均から日ごとの目安人数を計算`,
            `・通常日: ${normalRange.min}〜${normalRange.max}人目安`,
            `・人数多めチェック日: ${eventRange.min}〜${eventRange.max}人目安（通常日より少し多め）`,
            `・①: 1日${generateRules.oneShiftCount}人（${oneShiftTargetText} / 正社員・パートを区別せず①参加者全体で均等化 / ⑩の翌日は①禁止 / ①の翌日は必ず公休）`,
            `・⑩: 1日${generateRules.tenShiftCount}人、正社員最低${generateRules.requireFulltimeOn10 ? '1人' : '0人'}、正社員人数確率=${p1}%/${p2}%/${p3}%`,
            '・公休: 各スタッフ設定回数（上限8）を優先、自動生成の公休は最大2連休までに補正',
            `・連勤: ${generateRules.allowFourConsecutive ? '4連勤まで許可（5連勤以上は禁止）' : '3連勤の翌日は必ず公休（4連勤ありは初期OFF）'}`,
            `・空白補完: ${generateRules.fillBlankWithSix ? '生成完了後に空欄を6で埋める（後処理）' : '空欄後処理なし（初期OFF）'}`,
            '・最終調整: 人数が少ない日を再配分して下振れを抑制し、土日祝の勤務/休み回数差もできるだけ均等化'
        ];

        ruleLogicSummary.innerHTML = lines.map(line => `<div>${escapeHtml(line)}</div>`).join('');
    }

    function getPeriod(year, targetMonth) {
        const start = new Date(year, targetMonth - 2, 21);
        const end = new Date(year, targetMonth - 1, 20);
        return { start, end };
    }

    function formatDateForData(dateObj) {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function updateMonthDisplay() {
        currentMonthDisplay.textContent = `${currentYear}年 ${currentTargetMonth}月度`;
        const { start, end } = getPeriod(currentYear, currentTargetMonth);
        const startStr = `${start.getMonth() + 1}月${start.getDate()}日`;
        const endStr = `${end.getMonth() + 1}月${end.getDate()}日`;
        periodDisplay.textContent = `${startStr} 〜 ${endStr}`;
        printTitle.textContent = `${currentYear}年 ${currentTargetMonth}月度 出勤表`;
        lastGeneratedDates = [];
        lastGeneratedStaffStats = [];
        if (shiftContainer) shiftContainer.style.display = 'none'; // hide until generated
        if (summaryTableContainer) summaryTableContainer.innerHTML = '';
        if (summaryPrintTableContainer) summaryPrintTableContainer.innerHTML = '';
    }

    function changeMonth(offset) {
        currentTargetMonth += offset;
        if (currentTargetMonth < 1) {
            currentTargetMonth = 12;
            currentYear--;
        } else if (currentTargetMonth > 12) {
            currentTargetMonth = 1;
            currentYear++;
        }
        refreshStaffData();
        updateMonthDisplay();
    }

    function bindEvents() {
        document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
        document.getElementById('next-month').addEventListener('click', () => changeMonth(1));
        document.getElementById('generate-btn').addEventListener('click', generateShift);
        if (saveResultBtn) saveResultBtn.addEventListener('click', saveCurrentResult);
        if (openSavedResultsBtn) openSavedResultsBtn.addEventListener('click', openSavedResultsModal);
        document.getElementById('pdf-btn').addEventListener('click', () => {
            printSection('shift');
        });
        if (summaryPrintBtn) summaryPrintBtn.addEventListener('click', () => printSection('summary'));
        timeSettingsBtn.addEventListener('click', openTimeSettingsModal);
        closeTimeSettingsBtn.addEventListener('click', closeTimeSettingsModal);
        cancelTimeSettingsBtn.addEventListener('click', closeTimeSettingsModal);
        saveTimeSettingsBtn.addEventListener('click', commitTimeSettingsFromModal);
        timeSettingsModal.addEventListener('click', (e) => {
            if (e.target === timeSettingsModal) closeTimeSettingsModal();
        });
        if (ruleSettingsBtn) ruleSettingsBtn.addEventListener('click', openRuleSettingsModal);
        if (closeRuleSettingsBtn) closeRuleSettingsBtn.addEventListener('click', closeRuleSettingsModal);
        if (cancelRuleSettingsBtn) cancelRuleSettingsBtn.addEventListener('click', closeRuleSettingsModal);
        if (saveRuleSettingsBtn) saveRuleSettingsBtn.addEventListener('click', commitRuleSettingsFromModal);
        if (ruleSettingsModal) {
            ruleSettingsModal.addEventListener('click', (e) => {
                if (e.target === ruleSettingsModal) closeRuleSettingsModal();
            });
        }
        if (closeSavedResultsBtn) closeSavedResultsBtn.addEventListener('click', closeSavedResultsModal);
        if (closeSavedResultsFooterBtn) closeSavedResultsFooterBtn.addEventListener('click', closeSavedResultsModal);
        if (savedResultsModal) {
            savedResultsModal.addEventListener('click', (e) => {
                if (e.target === savedResultsModal) closeSavedResultsModal();
            });
        }
        if (savedResultsList) {
            savedResultsList.addEventListener('click', (e) => {
                const loadBtn = e.target.closest('.load-saved-result-btn');
                if (loadBtn) {
                    loadSavedResult(loadBtn.dataset.id);
                    return;
                }
                const deleteBtn = e.target.closest('.delete-saved-result-btn');
                if (deleteBtn) {
                    const ok = window.confirm('この保存結果を削除しますか？');
                    if (ok) deleteSavedResult(deleteBtn.dataset.id);
                }
            });
        }
        tableContainer.addEventListener('click', handleShiftCellClick);
    }

    function getYesterdayShift(staff, dateObj) {
        const yest = new Date(dateObj);
        yest.setDate(yest.getDate() - 1);
        const yestStr = formatDateForData(yest);
        return staff.schedule[yestStr];
    }

    function removeFromAvailable(arr, s) {
        const idx = arr.indexOf(s);
        if (idx > -1) arr.splice(idx, 1);
    }

    function randomTieBreak(baseCompare) {
        if (baseCompare !== 0) return baseCompare;
        return Math.random() < 0.5 ? -1 : 1;
    }

    function randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function isOffValue(val) {
        return val === '休' || val === '有休' || val === '有' || val === '特休' || val === '特' || val === '公';
    }

    function getStaffRequest(staffName, dateStr) {
        return (requestData[dateStr] && requestData[dateStr][staffName]) || '';
    }

    function isOffRequestValue(req) {
        return req === '休' || req === '有休' || req === '有' || req === '特休' || req === '特' || req === '公';
    }

    function isFixedOffRequestValue(req) {
        return req === '休' || req === '公' || req === '有休' || req === '有' || req === '特休' || req === '特';
    }

    function isRequestedWorkValue(req) {
        return req === '1' || req === '6' || req === '10';
    }

    function isOneShiftEligible(staff) {
        if (!staff || !staff.canWorkOneShift) return false;
        if (generateRules.oneFulltimeOnly && !staff.isFulltime) return false;
        return true;
    }

    function isWeekendTenPriorityStaff(staff) {
        return !!staff && WEEKEND_TEN_PRIORITY_NAMES.has(staff.name);
    }

    function isBusyDay(data) {
        if (!data) return false;
        if (data.busyDay) return true;
        if (data.isEventDay) return true;
        // 旧データ互換: 行事名に「行事」が含まれる場合も人数多め扱い
        const name = String(data.eventName || '');
        return name.includes('行事');
    }

    function getDynamicTargetRange(totalStaff, totalPublicHolidayTarget, dayCount, isBusyDayTarget) {
        // スタッフ総数と公休設定の平均から、月全体で違和感の少ない目安人数を作る
        // 通常日: 平均付近 / 人数多め日: 通常日より +1〜+2 程度
        const safeDayCount = Math.max(1, dayCount || 1);
        const avgPublicPerDay = Math.max(0, totalPublicHolidayTarget / safeDayCount);
        const expectedDailyWorkers = Math.max(0, totalStaff - avgPublicPerDay);
        const floorMin = totalStaff >= 10 ? 10 : totalStaff;

        const normalMin = Math.max(floorMin, Math.min(totalStaff, Math.floor(expectedDailyWorkers)));
        const normalMax = Math.max(normalMin, Math.min(totalStaff, Math.ceil(expectedDailyWorkers) + 1));
        const eventMin = Math.max(normalMin, Math.min(totalStaff, normalMin + 2));
        const eventMax = Math.max(eventMin, Math.min(totalStaff, normalMax + 3));

        return isBusyDayTarget
            ? { min: eventMin, max: eventMax }
            : { min: normalMin, max: normalMax };
    }

    function getPublicHolidayCount(staff) {
        return Object.values(staff.schedule).filter(v => v === '公').length;
    }

    function getMaxConsecutiveWorkDays() {
        return generateRules.allowFourConsecutive ? 4 : DEFAULT_MAX_CONSECUTIVE_WORK_DAYS;
    }

    function canPlacePublicWithoutOver3(selectedSet, idx, total) {
        let streak = 1;
        let i = idx - 1;
        while (i >= 0 && selectedSet.has(i)) {
            streak++;
            i--;
        }
        i = idx + 1;
        while (i < total && selectedSet.has(i)) {
            streak++;
            i++;
        }
        return streak <= 2;
    }

    function applyPublicHolidayPattern(staffStats, dates, dailyMinimumByDate = {}) {
        const dateKeys = dates.map(d => formatDateForData(d));
        const dailyCountMap = {};
        dateKeys.forEach(dateStr => {
            dailyCountMap[dateStr] = getDailyWorkCount(staffStats, dateStr);
        });

        staffStats.forEach(s => {
            if (s.manualOnly) return;

            const targetPublic = Math.max(0, Math.min(MAX_PUBLIC_HOLIDAYS, s.pubHolidays || 0));
            const selected = new Set();
            dateKeys.forEach((dateStr, idx) => {
                if (s.fixedPublicDates && s.fixedPublicDates.has(dateStr)) {
                    selected.add(idx);
                }
            });

            const candidateIdx = [];
            dateKeys.forEach((dateStr, idx) => {
                const v = s.schedule[dateStr] || '';
                if (v === '休' || v === '有休' || v === '有' || v === '特休' || v === '特') return;
                if (s.fixedPublicDates && s.fixedPublicDates.has(dateStr)) return;
                if (s.fixedWorkDates && s.fixedWorkDates.has(dateStr)) return;
                if (v === '1' || v === '10') return;
                if (isWorkValue(v) && (dailyCountMap[dateStr] || 0) <= (dailyMinimumByDate[dateStr] || 0)) return;
                candidateIdx.push(idx);
            });

            function getPublicSpreadScore(idx) {
                const dateStr = dateKeys[idx];
                const currentVal = s.schedule[dateStr] || '';
                const surplus = (dailyCountMap[dateStr] || 0) - (dailyMinimumByDate[dateStr] || 0);
                const surplusScore = isWorkValue(currentVal) ? surplus * 30 : 0;
                const edgePenalty = (idx < 3 || idx >= dateKeys.length - 3) ? 20 : 0;
                const finalDayPenalty = idx === dateKeys.length - 1 ? 260 : 0;
                const dateObj = dates[idx];
                const lastDay = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).getDate();
                const monthEndPenalty = lastDay - dateObj.getDate() < 3 ? 20 : 0;
                if (!selected.size) return 999 + surplusScore - edgePenalty - monthEndPenalty - finalDayPenalty;

                let minDistance = 999;
                selected.forEach(selectedIdx => {
                    minDistance = Math.min(minDistance, Math.abs(selectedIdx - idx));
                });

                const prevSelected = selected.has(idx - 1) ? 1 : 0;
                const nextSelected = selected.has(idx + 1) ? 1 : 0;
                const adjacencyPenalty = (prevSelected + nextSelected) * 100;
                return surplusScore + minDistance - adjacencyPenalty - edgePenalty - monthEndPenalty - finalDayPenalty;
            }

            function canAddGeneratedPublic(idx) {
                const dateStr = dateKeys[idx];
                const currentVal = s.schedule[dateStr] || '';
                if (isWorkValue(currentVal) && (dailyCountMap[dateStr] || 0) <= (dailyMinimumByDate[dateStr] || 0)) return false;
                return true;
            }

            const restCandidates = [...candidateIdx];
            while (selected.size < targetPublic && restCandidates.length > 0) {
                const selectable = restCandidates
                    .filter(idx => !selected.has(idx))
                    .filter(canAddGeneratedPublic)
                    .filter(idx => canPlacePublicWithoutOver3(selected, idx, dateKeys.length))
                    .sort((a, b) => randomTieBreak(getPublicSpreadScore(b) - getPublicSpreadScore(a)));

                if (!selectable.length) break;
                selected.add(selectable[0]);
            }

            restCandidates.forEach(idx => {
                if (selected.size >= targetPublic) return;
                if (selected.has(idx)) return;
                if (!canAddGeneratedPublic(idx)) return;
                if (!canPlacePublicWithoutOver3(selected, idx, dateKeys.length)) return;
                selected.add(idx);
            });

            if (selected.size < targetPublic) {
                restCandidates.forEach(idx => {
                    if (selected.size >= targetPublic) return;
                    if (!canAddGeneratedPublic(idx)) return;
                    if (!selected.has(idx)) selected.add(idx);
                });
            }

            dateKeys.forEach((dateStr, idx) => {
                const v = s.schedule[dateStr] || '';
                if (v === '休' || v === '有休' || v === '有' || v === '特休' || v === '特') return;
                if (s.fixedPublicDates && s.fixedPublicDates.has(dateStr)) {
                    applyShiftValue(s, dateStr, '公', isWeekendOrHoliday(dates[idx], dateStr));
                    return;
                }
                if (s.fixedWorkDates && s.fixedWorkDates.has(dateStr)) return;

                if (selected.has(idx)) {
                    applyShiftValue(s, dateStr, '公', isWeekendOrHoliday(dates[idx], dateStr));
                    if (isWorkValue(v)) dailyCountMap[dateStr] = Math.max(0, (dailyCountMap[dateStr] || 0) - 1);
                } else if (v === '公') {
                    applyShiftValue(s, dateStr, '6', isWeekendOrHoliday(dates[idx], dateStr));
                    dailyCountMap[dateStr] = (dailyCountMap[dateStr] || 0) + 1;
                }
            });
        });
    }

    function getGeneratedPublicReplacementValue(staff, dateObj) {
        if (timeSettings["6"] && timeSettings["6"].enabled) return '6';
        if (timeSettings["10"] && timeSettings["10"].enabled) return '10';
        if (timeSettings["1"] && timeSettings["1"].enabled && isOneShiftEligible(staff)) return '1';
        return '';
    }

    function enforceMaxTwoConsecutiveGeneratedPublicHolidays(staffStats, dates) {
        const dateKeys = dates.map(d => formatDateForData(d));

        staffStats.forEach(staff => {
            if (staff.manualOnly) return;

            let changed = true;
            while (changed) {
                changed = false;

                for (let start = 0; start < dateKeys.length; start++) {
                    const startDateStr = dateKeys[start];
                    if ((staff.schedule[startDateStr] || '') !== '公') continue;

                    let end = start;
                    while (end + 1 < dateKeys.length && (staff.schedule[dateKeys[end + 1]] || '') === '公') {
                        end++;
                    }

                    const runLength = end - start + 1;
                    if (runLength <= 2) {
                        start = end;
                        continue;
                    }

                    let brokeRun = false;
                    const candidateOrder = [];
                    for (let idx = start + 1; idx < end; idx++) candidateOrder.push(idx);
                    candidateOrder.push(start, end);

                    for (const idx of candidateOrder) {
                        const dateStr = dateKeys[idx];
                        if (staff.fixedPublicDates && staff.fixedPublicDates.has(dateStr)) continue;
                        if (staff.fixedWorkDates && staff.fixedWorkDates.has(dateStr)) continue;
                        if (hasFixedOffRequest(staff.name, dateStr)) continue;

                        const replacement = getGeneratedPublicReplacementValue(staff, dates[idx]);
                        if (!replacement) continue;
                        if (replacement === '1') {
                            if (idx > 0 && (staff.schedule[dateKeys[idx - 1]] || '') === '10') continue;
                        }
                        if (!canAssignWorkOnDate(staff, dateKeys, idx)) continue;

                        applyShiftValue(staff, dateStr, replacement, isWeekendOrHoliday(dates[idx], dateStr));
                        if (replacement === '1') {
                            const nextIdx = idx + 1;
                            if (nextIdx < dateKeys.length) {
                                const nextDateStr = dateKeys[nextIdx];
                                staff.fixedPublicDates.add(nextDateStr);
                                applyShiftValue(staff, nextDateStr, '公', isWeekendOrHoliday(dates[nextIdx], nextDateStr));
                            }
                        }
                        changed = true;
                        brokeRun = true;
                        break;
                    }

                    start = end;
                    if (brokeRun) break;
                }
            }
        });
    }

    function enforceRestAfterThreeConsecutiveWorkdays(staffStats, dates) {
        const dateKeys = dates.map(d => formatDateForData(d));
        const maxConsecutive = getMaxConsecutiveWorkDays();

        staffStats.forEach(staff => {
            if (staff.manualOnly) return;

            for (let idx = 0; idx < dateKeys.length - maxConsecutive; idx++) {
                const workRun = dateKeys
                    .slice(idx, idx + maxConsecutive)
                    .every(dateStr => isWorkValue(staff.schedule[dateStr] || ''));
                if (!workRun) continue;

                const nextIdx = idx + maxConsecutive;
                const nextDateStr = dateKeys[nextIdx];
                const nextVal = staff.schedule[nextDateStr] || '';
                if (!isWorkValue(nextVal)) continue;
                if (staff.fixedWorkDates && staff.fixedWorkDates.has(nextDateStr)) continue;

                staff.fixedPublicDates.add(nextDateStr);
                applyShiftValue(staff, nextDateStr, '公', isWeekendOrHoliday(dates[nextIdx], nextDateStr));
            }
        });
    }

    function enforceFulltimeCoreDailyCoverage(staffStats, dates, dailyMinimumByDate = {}) {
        const dateKeys = dates.map(d => formatDateForData(d));
        if (!dateKeys.length) return;

        const coreStaff = staffStats.filter(s => s.isFulltime && isFulltimeCoreStaff(s));
        if (!coreStaff.length) return;

        function getCoverageWorkValue(staff, dateKeys, idx) {
            if (timeSettings["6"] && timeSettings["6"].enabled) return '6';
            if (timeSettings["10"] && timeSettings["10"].enabled && !staff.isIrregular) return '10';
            if (timeSettings["1"] && timeSettings["1"].enabled && isOneShiftEligible(staff)) {
                const prevVal = idx > 0 ? (staff.schedule[dateKeys[idx - 1]] || '') : '';
                if (!generateRules.oneNoAfterTen || prevVal !== '10') return '1';
            }
            return '';
        }

        function canUseForCoreCoverage(staff, workValue, idx) {
            const dateStr = dateKeys[idx];
            if (staff.manualOnly) return false;
            if (staff.fixedPublicDates && staff.fixedPublicDates.has(dateStr)) return false;
            if (staff.fixedWorkDates && staff.fixedWorkDates.has(dateStr)) return false;
            if (hasFixedOffRequest(staff.name, dateStr)) return false;
            if (isRequestedWorkValue(getStaffRequest(staff.name, dateStr))) return false;
            if (!canAssignWorkOnDate(staff, dateKeys, idx, { ignoreCurrent: true })) return false;

            if (workValue === '1') {
                if (!isOneShiftEligible(staff)) return false;
                if (!canPlaceOneWithoutPublicBefore(staff, dateKeys, idx)) return false;
                if (generateRules.oneNoAfterTen && idx > 0 && (staff.schedule[dateKeys[idx - 1]] || '') === '10') return false;

                const nextIdx = idx + 1;
                if (nextIdx < dateKeys.length) {
                    const nextDateStr = dateKeys[nextIdx];
                    if (hasFixedOffRequest(staff.name, nextDateStr)) return false;
                    if (isRequestedWorkValue(getStaffRequest(staff.name, nextDateStr))) return false;
                    if (staff.fixedWorkDates && staff.fixedWorkDates.has(nextDateStr)) return false;
                    if (!canPlacePublicWithoutOver3(new Set(dateKeys
                        .map((ds, publicIdx) => (staff.schedule[ds] || '') === '公' ? publicIdx : -1)
                        .filter(publicIdx => publicIdx >= 0)), nextIdx, dateKeys.length)) return false;
                }
            }

            return true;
        }

        function getCoverageScore(staff, dateStr, idx) {
            const currentVal = staff.schedule[dateStr] || '';
            let score = 0;

            if (currentVal === '') score += 0;
            else if (currentVal === '公') score += 10;
            else if (currentVal === '休') score += 20;
            else if (currentVal === '有' || currentVal === '有休' || currentVal === '特' || currentVal === '特休') score += 30;
            else score += 40;

            if (hasFixedOffRequest(staff.name, dateStr)) score += 40;
            if (!canAssignWorkOnDate(staff, dateKeys, idx)) score += 80;
            score += ((staff.count1 || 0) + (staff.count6 || 0) + (staff.count10 || 0)) * 2;

            return score;
        }

        dateKeys.forEach((dateStr, idx) => {
            const hasCoreWorker = coreStaff.some(staff => isWorkValue(staff.schedule[dateStr] || ''));
            if (hasCoreWorker) return;

            const isSpecialTargetDay = isWeekendOrHoliday(dates[idx], dateStr);
            const candidates = [...coreStaff]
                .map(staff => ({
                    staff,
                    workValue: getCoverageWorkValue(staff, dateKeys, idx),
                    score: getCoverageScore(staff, dateStr, idx)
                }))
                .filter(item => !!item.workValue)
                .filter(item => canUseForCoreCoverage(item.staff, item.workValue, idx))
                .sort((a, b) => {
                    if (a.score !== b.score) return a.score - b.score;
                    return randomTieBreak((a.staff.count6 + a.staff.count10) - (b.staff.count6 + b.staff.count10));
                });

            if (!candidates.length) {
                console.warn(`[shift-generate] 正社員常勤の出勤を補充できません: ${dateStr}`, {
                    reason: '固定希望・勤務制限・公休連続制限を壊さない候補がありません'
                });
                return;
            }

            const { staff, workValue } = candidates[0];
            if (workValue === '1') {
                assignOneShiftWithForcedRest(staff, dates, dateKeys, idx, { staffStats, dailyMinimumByDate });
            } else {
                applyShiftValue(staff, dateStr, workValue, isSpecialTargetDay);
            }
        });
    }

    function getPublicBeforeOneReplacementWorkValue(staff) {
        if (timeSettings["6"] && timeSettings["6"].enabled) return '6';
        if (timeSettings["10"] && timeSettings["10"].enabled && !staff.isIrregular) return '10';
        return '';
    }

    function canAssignWorkOnDateWithTemporaryBlank(staff, dateKeys, idx) {
        const dateStr = dateKeys[idx];
        return canAssignWorkOnDate(staff, dateKeys, idx, { ignoreCurrent: true });
    }

    function enforceNoPublicBeforeOnePattern(staffStats, dates) {
        const dateKeys = dates.map(d => formatDateForData(d));
        if (!dateKeys.length) return;

        staffStats.forEach(staff => {
            for (let idx = 1; idx < dateKeys.length; idx++) {
                const dateStr = dateKeys[idx];
                const prevDateStr = dateKeys[idx - 1];
                if (!hasPublicBeforeOnePattern(staff, dateKeys, idx)) continue;

                const currentReq = getStaffRequest(staff.name, dateStr);
                const currentIsFixedWork = staff.fixedWorkDates && staff.fixedWorkDates.has(dateStr);
                const replacement = getPublicBeforeOneReplacementWorkValue(staff);
                if (replacement && !(currentIsFixedWork && currentReq === '1')) {
                    applyShiftValue(staff, dateStr, replacement, isWeekendOrHoliday(dates[idx], dateStr));
                    continue;
                }

                if (staff.fixedPublicDates && staff.fixedPublicDates.has(prevDateStr)) continue;
                if (hasFixedOffRequest(staff.name, prevDateStr)) continue;
                if (staff.fixedWorkDates && staff.fixedWorkDates.has(prevDateStr)) continue;

                const prevReplacement = getPublicBeforeOneReplacementWorkValue(staff);
                if (!prevReplacement) continue;
                if (!canAssignWorkOnDateWithTemporaryBlank(staff, dateKeys, idx - 1)) continue;

                applyShiftValue(staff, prevDateStr, prevReplacement, isWeekendOrHoliday(dates[idx - 1], prevDateStr));
                staff.fixedWorkDates.add(prevDateStr);
            }
        });
    }

    function getShiftCount(staff, shiftValue) {
        return Object.values(staff.schedule || {}).filter(v => v === shiftValue).length;
    }

    function getFairnessGap(staffList, shiftValue) {
        if (!staffList.length) return 0;
        const counts = staffList.map(staff => getShiftCount(staff, shiftValue));
        return Math.max(...counts) - Math.min(...counts);
    }

    function getDailyWorkCount(staffStats, dateStr) {
        return staffStats.reduce((count, staff) => {
            if (staff.manualOnly) return count;
            return count + (isWorkValue(staff.schedule[dateStr] || '') ? 1 : 0);
        }, 0);
    }

    function hasFulltimeCoreWorkerAfterReplacement(staffStats, dateStr, high, highNextVal, low, lowNextVal) {
        return staffStats.some(staff => {
            if (!staff.isFulltime || !isFulltimeCoreStaff(staff)) return false;
            if (staff === high) return isWorkValue(highNextVal || '');
            if (staff === low) return isWorkValue(lowNextVal || '');
            return isWorkValue(staff.schedule[dateStr] || '');
        });
    }

    function wouldBreakNextDayMinimumForOne(low, staffStats, dateKeys, idx, dailyMinimumByDate) {
        const nextIdx = idx + 1;
        if (nextIdx >= dateKeys.length) return false;
        const nextDateStr = dateKeys[nextIdx];
        const nextVal = low.schedule[nextDateStr] || '';
        if (!isWorkValue(nextVal)) return false;
        const minNeed = dailyMinimumByDate[nextDateStr] || 0;
        return getDailyWorkCount(staffStats, nextDateStr) - 1 < minNeed;
    }

    function wouldBreakNextDayCoreCoverageForOne(low, staffStats, dateKeys, idx) {
        const nextIdx = idx + 1;
        if (nextIdx >= dateKeys.length) return false;
        const nextDateStr = dateKeys[nextIdx];
        const nextVal = low.schedule[nextDateStr] || '';
        if (!isWorkValue(nextVal)) return false;
        if (!low.isFulltime || !isFulltimeCoreStaff(low)) return false;
        return !staffStats.some(staff => {
            return staff !== low &&
                staff.isFulltime &&
                isFulltimeCoreStaff(staff) &&
                isWorkValue(staff.schedule[nextDateStr] || '');
        });
    }

    function getTenFairnessTradeBlockReason(high, low, staffStats, dates, dateKeys, idx, dailyMinimumByDate) {
        const dateStr = dateKeys[idx];
        const lowVal = low.schedule[dateStr] || '';
        const isSpecialTargetDay = isWeekendOrHoliday(dates[idx], dateStr);

        if ((high.schedule[dateStr] || '') !== '10') return '多い人が10ではない';
        if (lowVal !== '6' && lowVal !== '') return '少ない人が6または空欄ではない';
        if (high.fixedWorkDates && high.fixedWorkDates.has(dateStr)) return '多い人の固定勤務希望';
        if (low.fixedWorkDates && low.fixedWorkDates.has(dateStr)) return '少ない人の固定勤務希望';
        if (low.fixedPublicDates && low.fixedPublicDates.has(dateStr)) return '少ない人の固定公休';
        if (isOffRequestValue(getStaffRequest(low.name, dateStr))) return '少ない人の固定休・有休・特休';
        if (isRequestedWorkValue(getStaffRequest(low.name, dateStr))) return '少ない人の固定勤務希望';
        if (!canAssignTenOnDate(low, dateKeys, idx)) return getTenPriorityBlockReason(low, dateKeys, idx) || '10候補不可';
        if (high.isFulltime && !low.isFulltime && generateRules.requireFulltimeOn10) {
            const otherFulltimeOnTen = staffStats.some(staff => {
                return staff !== high && staff.isFulltime && (staff.schedule[dateStr] || '') === '10';
            });
            if (!otherFulltimeOnTen) return '10の正社員最低1人を壊す';
        }
        if (!hasFulltimeCoreWorkerAfterReplacement(staffStats, dateStr, high, lowVal, low, '10')) {
            return '正社員常勤1名以上を壊す';
        }
        if (isSpecialTargetDay && isWeekendTenPriorityStaff(high) && !isWeekendTenPriorityStaff(low)) {
            return '土日祝10優先ルールを壊す';
        }
        if ((dailyMinimumByDate[dateStr] || 0) > getDailyWorkCount(staffStats, dateStr)) return '日別最低人数不足';
        return '';
    }

    function getTenPriorityBlockReason(staff, dateKeys, idx) {
        const dateStr = dateKeys[idx];
        const val = staff.schedule[dateStr] || '';
        const req = getStaffRequest(staff.name, dateStr);

        if (val === '10') return '';
        if (staff.manualOnly || staff.isIrregular) return '10対象外';
        if (staff.fixedPublicDates && staff.fixedPublicDates.has(dateStr)) return '固定公休';
        if (staff.fixedWorkDates && staff.fixedWorkDates.has(dateStr)) return '固定勤務希望';
        if (isOffRequestValue(req)) return '固定休・有休・特休';
        if (isRequestedWorkValue(req)) return '固定勤務希望';
        if (val === '公') return '公休数保護';
        if (val === '1') return '1勤務済み';
        if (isOffValue(val)) return '休み系勤務記号';
        if (generateRules.oneNoAfterTen && idx + 1 < dateKeys.length && (staff.schedule[dateKeys[idx + 1]] || '') === '1') return '10→1禁止';
        if (!canAssignWorkOnDate(staff, dateKeys, idx, { ignoreCurrent: true })) return '連勤制限';
        return '';
    }

    function canAssignTenOnDate(staff, dateKeys, idx) {
        return !getTenPriorityBlockReason(staff, dateKeys, idx);
    }

    function getWeekendTenPriorityCandidateReason(staff, dateKeys, idx) {
        if (!staff) return 'スタッフ未登録';
        const dateStr = dateKeys[idx];
        const val = staff.schedule[dateStr] || '';
        const req = getStaffRequest(staff.name, dateStr);

        if (!isWeekendTenPriorityStaff(staff)) return '優先対象外';
        if (val === '10') return '';
        if (val !== '6' && val !== '') return '6または空欄ではない';
        if (staff.manualOnly || staff.isIrregular) return '10対象外';
        if (staff.fixedPublicDates && staff.fixedPublicDates.has(dateStr)) return '固定休のため不可';
        if (staff.fixedWorkDates && staff.fixedWorkDates.has(dateStr)) return '固定勤務希望のため不可';
        if (isOffRequestValue(req)) return '固定休・有休・特休のため不可';
        if (isRequestedWorkValue(req)) return '勤務希望固定のため不可';
        if (generateRules.oneNoAfterTen && idx + 1 < dateKeys.length && (staff.schedule[dateKeys[idx + 1]] || '') === '1') return '10→1禁止のため不可';
        if (val === '' && !canAssignWorkOnDate(staff, dateKeys, idx, { ignoreCurrent: true })) return '連勤制限のため不可';
        return '';
    }

    function canRemoveTenForWeekendPriority(staff, staffStats, dateStr, candidate, replacementValue) {
        if (!staff || staff === candidate) return false;
        if ((staff.schedule[dateStr] || '') !== '10') return false;
        if (isWeekendTenPriorityStaff(staff)) return false;
        if (staff.fixedWorkDates && staff.fixedWorkDates.has(dateStr)) return false;

        if (staff.isFulltime && !candidate.isFulltime && generateRules.requireFulltimeOn10) {
            const otherFulltimeOnTen = staffStats.some(other => {
                return other !== staff && other.isFulltime && (other.schedule[dateStr] || '') === '10';
            });
            if (!otherFulltimeOnTen) return false;
        }

        if (!hasFulltimeCoreWorkerAfterReplacement(staffStats, dateStr, staff, replacementValue, candidate, '10')) {
            return false;
        }

        return true;
    }

    function getWeekendPriorityRemovalReplacement(removable, staffStats, dateStr, candidate, candidateOldVal) {
        if (candidateOldVal === '6') return '6';
        if (canRemoveTenForWeekendPriority(removable, staffStats, dateStr, candidate, '')) return '';
        if (timeSettings["6"] && timeSettings["6"].enabled && canRemoveTenForWeekendPriority(removable, staffStats, dateStr, candidate, '6')) return '6';
        return null;
    }

    function enforceWeekendTenPriority(staffStats, dates) {
        if (!(timeSettings["10"] && timeSettings["10"].enabled)) return;
        const target10 = Math.max(0, generateRules.tenShiftCount || 0);
        if (target10 <= 0) return;

        const dateKeys = dates.map(d => formatDateForData(d));
        const priorityStaff = ["石川", "大野"]
            .map(name => staffStats.find(staff => staff.name === name))
            .filter(Boolean);
        if (!priorityStaff.length) return;

        dateKeys.forEach((dateStr, idx) => {
            if (!isWeekendOrHoliday(dates[idx], dateStr)) return;

            let tenMembers = staffStats.filter(staff => !staff.manualOnly && (staff.schedule[dateStr] || '') === '10');
            if (tenMembers.length <= 0) return;
            if (tenMembers.some(staff => isWeekendTenPriorityStaff(staff))) return;

            const evaluated = priorityStaff.map((staff, order) => ({
                staff,
                order,
                reason: getWeekendTenPriorityCandidateReason(staff, dateKeys, idx)
            }));
            const candidates = evaluated
                .filter(item => !item.reason)
                .sort((a, b) => {
                    if ((a.staff.count10 || 0) !== (b.staff.count10 || 0)) {
                        return (a.staff.count10 || 0) - (b.staff.count10 || 0);
                    }
                    return a.order - b.order;
                });

            if (!candidates.length) {
                const message = evaluated
                    .map(item => `${item.staff.name}: ${item.reason || '候補だが未選択'}`)
                    .join(' / ');
                console.warn(`[土日祝10優先] ${dateStr} ${message}`);
                return;
            }

            for (const item of candidates) {
                const candidate = item.staff;
                const candidateOldVal = candidate.schedule[dateStr] || '';
                const isSpecialTargetDay = isWeekendOrHoliday(dates[idx], dateStr);

                applyShiftValue(candidate, dateStr, '10', isSpecialTargetDay);
                tenMembers = staffStats.filter(staff => !staff.manualOnly && (staff.schedule[dateStr] || '') === '10');

                if (tenMembers.length > target10) {
                    const removable = tenMembers
                        .filter(staff => staff !== candidate)
                        .filter(staff => !isWeekendTenPriorityStaff(staff))
                        .filter(staff => !(staff.fixedWorkDates && staff.fixedWorkDates.has(dateStr)))
                        .sort((a, b) => (b.count10 || 0) - (a.count10 || 0));

                    let removed = false;
                    for (const staff of removable) {
                        const replacement = getWeekendPriorityRemovalReplacement(staff, staffStats, dateStr, candidate, candidateOldVal);
                        if (replacement === null) continue;
                        applyShiftValue(staff, dateStr, replacement, isSpecialTargetDay);
                        removed = true;
                        break;
                    }

                    if (!removed) {
                        applyShiftValue(candidate, dateStr, candidateOldVal, isSpecialTargetDay);
                        continue;
                    }
                }

                return;
            }

            const message = evaluated
                .map(item => `${item.staff.name}: ${item.reason || '10人数調整で外せる候補がないため不可'}`)
                .join(' / ');
            console.warn(`[土日祝10優先] ${dateStr} ${message}`);
        });
    }

    function rebalanceTenShiftFairness(staffStats, dates, dailyMinimumByDate = {}) {
        if (!(timeSettings["10"] && timeSettings["10"].enabled)) return;
        const dateKeys = dates.map(d => formatDateForData(d));
        const eligible = staffStats.filter(staff => !staff.manualOnly && !staff.isIrregular);
        if (eligible.length < 2) return;

        const blockedReasons = [];
        for (let pass = 0; pass < 24; pass++) {
            if (getFairnessGap(eligible, '10') <= 1) break;

            const highCandidates = [...eligible].sort((a, b) => getShiftCount(b, '10') - getShiftCount(a, '10'));
            const lowCandidates = [...eligible].sort((a, b) => getShiftCount(a, '10') - getShiftCount(b, '10'));
            let selected = null;

            for (const high of highCandidates) {
                for (const low of lowCandidates) {
                    if (high === low) continue;
                    if (getShiftCount(high, '10') - getShiftCount(low, '10') < 2) continue;

                    let lastReason = '';
                    for (let idx = 0; idx < dateKeys.length; idx++) {
                        const reason = getTenFairnessTradeBlockReason(high, low, staffStats, dates, dateKeys, idx, dailyMinimumByDate);
                        if (!reason) {
                            selected = { high, low, tradeIdx: idx };
                            break;
                        }
                        if ((high.schedule[dateKeys[idx]] || '') === '10') lastReason = reason;
                    }
                    if (selected) break;
                    blockedReasons.push({
                        high: high.name,
                        highCount: getShiftCount(high, '10'),
                        low: low.name,
                        lowCount: getShiftCount(low, '10'),
                        reason: lastReason || '交換可能な日がありません'
                    });
                }
                if (selected) break;
            }

            if (!selected) break;

            const { high, low, tradeIdx } = selected;
            const tradeDateStr = dateKeys[tradeIdx];
            const lowVal = low.schedule[tradeDateStr] || '';
            const isSpecialTargetDay = isWeekendOrHoliday(dates[tradeIdx], tradeDateStr);
            applyShiftValue(high, tradeDateStr, lowVal, isSpecialTargetDay);
            applyShiftValue(low, tradeDateStr, '10', isSpecialTargetDay);
        }

        if (getFairnessGap(eligible, '10') >= 2) {
            console.warn('[shift-generate] 10勤務の公平化を完了できません', {
                gap: getFairnessGap(eligible, '10'),
                counts: eligible.map(staff => ({ staff: staff.name, count10: getShiftCount(staff, '10') })),
                reasons: blockedReasons
            });
        }
    }

    function printSection(target) {
        if (!lastGeneratedStaffStats.length) {
            alert('印刷するシフト結果がありません。先に自動生成してください。');
            return;
        }
        document.body.classList.remove('print-shift-only', 'print-summary-only');
        document.body.classList.add(target === 'summary' ? 'print-summary-only' : 'print-shift-only');
        window.print();
        setTimeout(() => {
            document.body.classList.remove('print-shift-only', 'print-summary-only');
        }, 500);
    }

    function getOneFairnessTradeBlockReason(high, low, staffStats, dates, dateKeys, idx, dailyMinimumByDate) {
        const dateStr = dateKeys[idx];
        const lowVal = low.schedule[dateStr] || '';
        const dailyReason = getDailyOneShiftBlockReason(low, dates, dateKeys, idx);

        if ((high.schedule[dateStr] || '') !== '1') return '多い人が1ではない';
        if (lowVal !== '6' && lowVal !== '') return '少ない人が6または空欄ではない';
        if (high.fixedWorkDates && high.fixedWorkDates.has(dateStr)) return '多い人の固定勤務希望';
        if (low.fixedWorkDates && low.fixedWorkDates.has(dateStr)) return '少ない人の固定勤務希望';
        if (low.fixedPublicDates && low.fixedPublicDates.has(dateStr)) return '少ない人の固定公休';
        if (isOffRequestValue(getStaffRequest(low.name, dateStr))) return '少ない人の固定休・有休・特休';
        if (isRequestedWorkValue(getStaffRequest(low.name, dateStr))) return '少ない人の固定勤務希望';
        if (dailyReason) return dailyReason;
        if (!hasFulltimeCoreWorkerAfterReplacement(staffStats, dateStr, high, lowVal, low, '1')) {
            return '正社員常勤1名以上を壊す';
        }
        if (idx + 1 < dateKeys.length && (low.schedule[dateKeys[idx + 1]] || '') === '10') {
            return '1翌日公休で10人数保証を壊す';
        }
        if (wouldBreakNextDayMinimumForOne(low, staffStats, dateKeys, idx, dailyMinimumByDate)) {
            return '1翌日公休で日別最低人数を下回る';
        }
        if (wouldBreakNextDayCoreCoverageForOne(low, staffStats, dateKeys, idx)) {
            return '1翌日公休で正社員常勤1名以上を壊す';
        }
        return '';
    }

    function rebalanceOneShiftFairness(staffStats, dates, dailyMinimumByDate = {}) {
        if (!(timeSettings["1"] && timeSettings["1"].enabled)) return;
        const dateKeys = dates.map(d => formatDateForData(d));
        const eligible = staffStats.filter(staff => !staff.manualOnly && isOneShiftEligible(staff));
        if (eligible.length < 2) return;

        const blockedReasons = [];
        for (let pass = 0; pass < 24; pass++) {
            if (getFairnessGap(eligible, '1') <= 1) break;

            const highCandidates = [...eligible].sort((a, b) => getShiftCount(b, '1') - getShiftCount(a, '1'));
            const lowCandidates = [...eligible].sort((a, b) => getShiftCount(a, '1') - getShiftCount(b, '1'));
            let selected = null;

            for (const high of highCandidates) {
                for (const low of lowCandidates) {
                    if (high === low) continue;
                    if (getShiftCount(high, '1') - getShiftCount(low, '1') < 2) continue;

                    let lastReason = '';
                    for (let idx = 0; idx < dateKeys.length; idx++) {
                        const reason = getOneFairnessTradeBlockReason(high, low, staffStats, dates, dateKeys, idx, dailyMinimumByDate);
                        if (!reason) {
                            selected = { high, low, tradeIdx: idx };
                            break;
                        }
                        if ((high.schedule[dateKeys[idx]] || '') === '1') lastReason = reason;
                    }
                    if (selected) break;
                    blockedReasons.push({
                        high: high.name,
                        highCount: getShiftCount(high, '1'),
                        low: low.name,
                        lowCount: getShiftCount(low, '1'),
                        reason: lastReason || '交換可能な日がありません'
                    });
                }
                if (selected) break;
            }

            if (!selected) break;

            const { high, low, tradeIdx } = selected;
            const tradeDateStr = dateKeys[tradeIdx];
            const lowVal = low.schedule[tradeDateStr] || '';
            const isSpecialTargetDay = isWeekendOrHoliday(dates[tradeIdx], tradeDateStr);
            applyShiftValue(high, tradeDateStr, lowVal, isSpecialTargetDay);
            assignOneShiftWithForcedRest(low, dates, dateKeys, tradeIdx);
        }

        if (getFairnessGap(eligible, '1') >= 2) {
            console.warn('[shift-generate] 1勤務の公平化を完了できません', {
                gap: getFairnessGap(eligible, '1'),
                counts: eligible.map(staff => ({ staff: staff.name, count1: getShiftCount(staff, '1') })),
                reasons: blockedReasons
            });
        }
    }

    function rebalanceOneAndTenShiftFairness(staffStats, dates, dailyMinimumByDate = {}) {
        rebalanceTenShiftFairness(staffStats, dates, dailyMinimumByDate);
        rebalanceOneShiftFairness(staffStats, dates, dailyMinimumByDate);
    }

    function normalizeWorkPattern(staffStats, dates) {
        const dateKeys = dates.map(d => formatDateForData(d));
        staffStats.forEach(s => {
            if (s.manualOnly) return;
            if (s.isIrregular) return;
            for (let i = 3; i < dateKeys.length; i++) {
                const a = s.schedule[dateKeys[i - 3]] || '';
                const b = s.schedule[dateKeys[i - 2]] || '';
                const c = s.schedule[dateKeys[i - 1]] || '';
                const d = s.schedule[dateKeys[i]] || '';
                if (a === b && b === c && c === d && d === '6') {
                    if (s.fixedWorkDates && s.fixedWorkDates.has(dateKeys[i])) continue;
                    applyShiftValue(s, dateKeys[i], '10', isWeekendOrHoliday(dates[i], dateKeys[i]));
                    break;
                }
            }
        });
    }

    function enforceIrregularShiftRules(staffStats, dates) {
        dates.forEach(d => {
            const dateStr = formatDateForData(d);
            const isSpecialTargetDay = isWeekendOrHoliday(d, dateStr);
            staffStats.forEach(s => {
                if (s.manualOnly || !s.isIrregular) return;
                const v = s.schedule[dateStr] || '';
                // イレギュラーは6専用（休み希望は尊重）
                if (v === '10' || v === '1') {
                    applyShiftValue(s, dateStr, '6', isSpecialTargetDay);
                }
            });
        });
    }

    function getMinimumShortageBlankFillBlockReason(staff, dateKeys, idx) {
        const dateStr = dateKeys[idx];
        const currentVal = staff.schedule[dateStr] || '';
        const req = getStaffRequest(staff.name, dateStr);

        if (staff.manualOnly) return '手動専用';
        if (currentVal !== '') return '空白ではない';
        if (!(timeSettings["6"] && timeSettings["6"].enabled)) return '6勤務が時間設定OFF';
        if (staff.fixedPublicDates && staff.fixedPublicDates.has(dateStr)) return '固定休';
        if (staff.fixedWorkDates && staff.fixedWorkDates.has(dateStr)) return '固定勤務希望';
        if (isOffRequestValue(req)) return '固定休・有休・特休';
        if (isRequestedWorkValue(req)) return '勤務希望固定';
        if (idx > 0 && (staff.schedule[dateKeys[idx - 1]] || '') === '1') return '前日1のため不可';
        if (!canAssignWorkOnDate(staff, dateKeys, idx, { ignoreCurrent: true })) {
            return generateRules.allowFourConsecutive ? '5連勤以上になるため不可' : '4連勤以上になるため不可';
        }
        return '';
    }

    function fillBlankWithSixPostProcess(staffStats, dates) {
        if (!generateRules.fillBlankWithSix) return;
        if (!(timeSettings["6"] && timeSettings["6"].enabled)) {
            console.warn('[shift-generate] 空欄後処理をスキップしました: 6勤務が時間設定OFF');
            return;
        }

        const dateKeys = dates.map(d => formatDateForData(d));
        dateKeys.forEach((dateStr, idx) => {
            const isSpecialTargetDay = isWeekendOrHoliday(dates[idx], dateStr);

            staffStats.forEach(s => {
                if (s.name === '中西') return;
                const currentVal = s.schedule[dateStr] || '';
                if (currentVal !== '') return;
                const req = getStaffRequest(s.name, dateStr);
                if (isOffRequestValue(req) || isRequestedWorkValue(req)) return;
                if (s.fixedPublicDates && s.fixedPublicDates.has(dateStr)) return;
                if (s.fixedWorkDates && s.fixedWorkDates.has(dateStr)) return;
                applyShiftValue(s, dateStr, '6', isSpecialTargetDay);
            });
        });

        staffStats.forEach(staff => {
            let runStart = -1;
            dateKeys.forEach((dateStr, idx) => {
                const isWork = isWorkValue(staff.schedule[dateStr] || '');
                if (isWork && runStart < 0) runStart = idx;
                const isRunEnd = runStart >= 0 && (!isWork || idx === dateKeys.length - 1);
                if (!isRunEnd) return;

                const endIdx = isWork ? idx : idx - 1;
                const runLength = endIdx - runStart + 1;
                if (runLength >= 8) {
                    console.warn('[shift-generate] 空欄後処理後の8連勤以上警告', {
                        staff: staff.name,
                        runLength,
                        dates: dateKeys.slice(runStart, endIdx + 1)
                    });
                } else if (runLength > getMaxConsecutiveWorkDays()) {
                    console.warn('[shift-generate] 参考警告: 空欄後処理により連勤が長くなっています', {
                        staff: staff.name,
                        runLength,
                        dates: dateKeys.slice(runStart, endIdx + 1)
                    });
                }
                runStart = isWork ? idx : -1;
            });
        });
    }

    function rebalanceDailyMinimums(staffStats, dates, dailyMinimumByDate) {
        const dateKeys = dates.map(d => formatDateForData(d));
        if (!dateKeys.length) return;

        const dailyCountMap = {};
        dateKeys.forEach(dateStr => {
            let c = 0;
            staffStats.forEach(s => {
                if (s.manualOnly) return;
                const v = s.schedule[dateStr] || '';
                if (isWorkValue(v)) c++;
            });
            dailyCountMap[dateStr] = c;
        });

        function getBestDonorDate(staff, lowDateStr) {
            let bestDate = '';
            let bestScore = -99999;
            dateKeys.forEach(candidateDate => {
                if (candidateDate === lowDateStr) return;
                const val = staff.schedule[candidateDate] || '';
                if (val !== '6' && val !== '10') return;
                if (staff.fixedWorkDates && staff.fixedWorkDates.has(candidateDate)) return;
                const minNeed = dailyMinimumByDate[candidateDate] || 0;
                const surplus = (dailyCountMap[candidateDate] || 0) - minNeed;
                if (surplus <= 0) return;
                const shiftPenalty = val === '6' ? 0 : 100; // 10はできるだけ崩さない
                const score = surplus * 10 - shiftPenalty;
                if (score > bestScore) {
                    bestScore = score;
                    bestDate = candidateDate;
                }
            });
            return bestDate;
        }

        // 複数回パスして、少人数日を底上げ
        for (let pass = 0; pass < 8; pass++) {
            let movedInThisPass = false;

            dateKeys.forEach((dateStr, idx) => {
                const minNeed = dailyMinimumByDate[dateStr] || 0;
                let current = dailyCountMap[dateStr] || 0;
                if (current >= minNeed) return;

                const isSpecialTargetDay = isWeekendOrHoliday(dates[idx], dateStr);
                const blankCandidates = staffStats
                    .filter(s => !s.manualOnly)
                    .filter(s => (s.schedule[dateStr] || '') === '')
                    .map(s => ({ staff: s, reason: getMinimumShortageBlankFillBlockReason(s, dateKeys, idx) }))
                    .sort((a, b) => {
                        const fairnessCompare = compareHolidayFairness(a.staff, b.staff, staffStats);
                        if (fairnessCompare !== 0) return fairnessCompare;
                        return ((a.staff.count6 || 0) + (a.staff.count10 || 0)) - ((b.staff.count6 || 0) + (b.staff.count10 || 0));
                    });

                for (let i = 0; i < blankCandidates.length && current < minNeed; i++) {
                    const { staff, reason } = blankCandidates[i];
                    if (reason) continue;
                    applyShiftValue(staff, dateStr, '6', isSpecialTargetDay);
                    dailyCountMap[dateStr] = (dailyCountMap[dateStr] || 0) + 1;
                    current = dailyCountMap[dateStr] || 0;
                    movedInThisPass = true;
                }

                if (current >= minNeed) return;

                const candidates = staffStats
                    .filter(s => !s.manualOnly)
                    .filter(s => (s.schedule[dateStr] || '') === '公')
                    .filter(s => canAssignWorkOnDate(s, dateKeys, idx))
                    .sort((a, b) => {
                        const fairnessCompare = compareHolidayFairness(a, b, staffStats);
                        if (fairnessCompare !== 0) return fairnessCompare;
                        return (a.count6 + a.count10) - (b.count6 + b.count10);
                    });

                for (let i = 0; i < candidates.length && current < minNeed; i++) {
                    const s = candidates[i];
                    if (s.fixedPublicDates && s.fixedPublicDates.has(dateStr)) continue;
                    if (s.fixedWorkDates && s.fixedWorkDates.has(dateStr)) continue;
                    const donorDateStr = getBestDonorDate(s, dateStr);
                    if (!donorDateStr) continue;

                    const donorDateObj = dates.find(d => formatDateForData(d) === donorDateStr);
                    if (!donorDateObj) continue;
                    const donorIsSpecialTargetDay = isWeekendOrHoliday(donorDateObj, donorDateStr);

                    applyShiftValue(s, donorDateStr, '公', donorIsSpecialTargetDay);
                    applyShiftValue(s, dateStr, '6', isSpecialTargetDay);
                    dailyCountMap[donorDateStr] = Math.max(0, (dailyCountMap[donorDateStr] || 0) - 1);
                    dailyCountMap[dateStr] = (dailyCountMap[dateStr] || 0) + 1;
                    current = dailyCountMap[dateStr] || 0;
                    movedInThisPass = true;
                }

                if ((dailyCountMap[dateStr] || 0) < minNeed) {
                    const reasons = [
                        ...blankCandidates
                            .filter(item => item.reason)
                            .map(item => ({ staff: item.staff.name, reason: item.reason })),
                        ...staffStats
                            .filter(s => !s.manualOnly)
                            .filter(s => (s.schedule[dateStr] || '') === '公')
                            .map(s => ({
                                staff: s.name,
                                reason: (s.fixedPublicDates && s.fixedPublicDates.has(dateStr)) ? '固定公休' :
                                    (s.fixedWorkDates && s.fixedWorkDates.has(dateStr)) ? '固定勤務希望' :
                                        !canAssignWorkOnDate(s, dateKeys, idx) ? '連勤制限' :
                                            !getBestDonorDate(s, dateStr) ? '交換元に余剰人数日がない' : ''
                            }))
                            .filter(item => item.reason)
                    ];
                    console.warn(`[人数不足] ${dateStr} 必要${minNeed}人 / 実績${dailyCountMap[dateStr] || 0}人`, { reasons });
                }
            });

            if (!movedInThisPass) break;
        }
    }

    function getFinalDayPublicStats(staffStats, dates, dailyMinimumByDate) {
        const dateKeys = dates.map(d => formatDateForData(d));
        const finalIdx = dateKeys.length - 1;
        const finalDateStr = dateKeys[finalIdx];
        const minNeed = dailyMinimumByDate[finalDateStr] || 0;
        const workCount = getDailyWorkCount(staffStats, finalDateStr);
        const publicMembers = staffStats.filter(staff => !staff.manualOnly && (staff.schedule[finalDateStr] || '') === '公');
        const fixedPublicMembers = publicMembers.filter(staff => {
            return (staff.fixedPublicDates && staff.fixedPublicDates.has(finalDateStr)) || hasFixedOffRequest(staff.name, finalDateStr);
        });
        const generatedPublicMembers = publicMembers.filter(staff => {
            return !(staff.fixedPublicDates && staff.fixedPublicDates.has(finalDateStr)) && !hasFixedOffRequest(staff.name, finalDateStr);
        });
        const publicReasons = publicMembers.map(staff => {
            let reason = '自動公休';
            if (staff.fixedPublicDates && staff.fixedPublicDates.has(finalDateStr)) reason = '固定公休';
            else if (hasFixedOffRequest(staff.name, finalDateStr)) reason = '休み希望・有休・特休';
            return { staff: staff.name, reason };
        });

        return {
            finalIdx,
            finalDateStr,
            minNeed,
            workCount,
            publicCount: publicMembers.length,
            fixedPublicCount: fixedPublicMembers.length,
            generatedPublicCount: generatedPublicMembers.length,
            generatedPublicMembers,
            publicReasons
        };
    }

    function canRestoreGeneratedPublicOnDate(staff, dateKeys, idx) {
        const dateStr = dateKeys[idx];
        if ((staff.schedule[dateStr] || '') !== '公') return '公ではない';
        if (staff.fixedPublicDates && staff.fixedPublicDates.has(dateStr)) return '固定公休';
        if (hasFixedOffRequest(staff.name, dateStr)) return '休み希望・有休・特休';
        if (staff.fixedWorkDates && staff.fixedWorkDates.has(dateStr)) return '固定勤務希望';
        if (!(timeSettings["6"] && timeSettings["6"].enabled)) return '6勤務が時間設定OFF';
        if (!canAssignWorkOnDate(staff, dateKeys, idx, { ignoreCurrent: true })) {
            return generateRules.allowFourConsecutive ? '5連勤以上になるため不可' : '4連勤以上になるため不可';
        }
        return '';
    }

    function redistributeFinalDayPublicConcentration(staffStats, dates, dailyMinimumByDate) {
        const dateKeys = dates.map(d => formatDateForData(d));
        if (!dateKeys.length) return;

        let stats = getFinalDayPublicStats(staffStats, dates, dailyMinimumByDate);
        const averagePublic = dateKeys.reduce((sum, dateStr) => {
            return sum + staffStats.filter(staff => !staff.manualOnly && (staff.schedule[dateStr] || '') === '公').length;
        }, 0) / dateKeys.length;
        const concentrationLimit = Math.ceil(averagePublic + 2);

        console.warn(`[最終日公休集中] ${stats.finalDateStr} 勤務${stats.workCount} / 公${stats.publicCount} / 固定休${stats.fixedPublicCount} / 自動公${stats.generatedPublicCount} / min${stats.minNeed}`, {
            publicReasons: stats.publicReasons
        });

        const shouldRestore = () => {
            stats = getFinalDayPublicStats(staffStats, dates, dailyMinimumByDate);
            return stats.workCount < stats.minNeed || stats.publicCount > concentrationLimit;
        };

        const restored = [];
        while (shouldRestore()) {
            const candidates = stats.generatedPublicMembers
                .map(staff => ({
                    staff,
                    reason: canRestoreGeneratedPublicOnDate(staff, dateKeys, stats.finalIdx)
                }))
                .sort((a, b) => {
                    if (!a.reason && b.reason) return -1;
                    if (a.reason && !b.reason) return 1;
                    return (a.staff.count6 || 0) - (b.staff.count6 || 0);
                });
            const candidate = candidates.find(item => !item.reason);
            if (!candidate) {
                console.warn(`[最終日補正] ${stats.finalDateStr} 公→6に戻せる自動公休がありません`, {
                    reasons: candidates.map(item => ({ staff: item.staff.name, reason: item.reason }))
                });
                break;
            }

            applyShiftValue(candidate.staff, stats.finalDateStr, '6', isWeekendOrHoliday(dates[stats.finalIdx], stats.finalDateStr));
            restored.push(candidate.staff.name);
            console.warn(`[最終日補正] ${candidate.staff.name} 公→6 理由: 自動公休かつ連勤制限OK`);
        }

        if (restored.length) {
            const afterStats = getFinalDayPublicStats(staffStats, dates, dailyMinimumByDate);
            console.warn(`[最終日公休集中] ${afterStats.finalDateStr} 補正後 勤務${afterStats.workCount} / 公${afterStats.publicCount} / 固定休${afterStats.fixedPublicCount} / 自動公${afterStats.generatedPublicCount} / min${afterStats.minNeed}`);
        }
    }

    function enforceBusyDayHigherThanNormal(staffStats, dates, busyDayByDate) {
        const dateKeys = dates.map(d => formatDateForData(d));
        if (!dateKeys.length) return;

        function getDailyCount(dateStr) {
            let count = 0;
            staffStats.forEach(s => {
                if (s.manualOnly) return;
                const v = s.schedule[dateStr] || '';
                if (isWorkValue(v)) count++;
            });
            return count;
        }

        const busyDates = dateKeys.filter(ds => !!busyDayByDate[ds]);
        const normalDates = dateKeys.filter(ds => !busyDayByDate[ds]);
        if (!busyDates.length || !normalDates.length) return;

        // 通常日が人数最多になり続けないように、通常日(6)→人数多め日(公)へ再配分
        for (let pass = 0; pass < 4; pass++) {
            let changed = false;

            const busyCounts = busyDates.map(ds => ({ ds, count: getDailyCount(ds) })).sort((a, b) => a.count - b.count);
            const normalCounts = normalDates.map(ds => ({ ds, count: getDailyCount(ds) })).sort((a, b) => b.count - a.count);
            if (!busyCounts.length || !normalCounts.length) break;

            const lowBusy = busyCounts[0];
            const highNormal = normalCounts[0];
            if (highNormal.count <= lowBusy.count) break;

            const busyIdx = dateKeys.indexOf(lowBusy.ds);
            const normalIdx = dateKeys.indexOf(highNormal.ds);
            if (busyIdx < 0 || normalIdx < 0) break;
            const busyIsSpecialTargetDay = isWeekendOrHoliday(dates[busyIdx], lowBusy.ds);
            const normalIsSpecialTargetDay = isWeekendOrHoliday(dates[normalIdx], highNormal.ds);

            const candidates = staffStats
                .filter(s => !s.manualOnly)
                .filter(s => (s.schedule[highNormal.ds] || '') === '6')
                .filter(s => (s.schedule[lowBusy.ds] || '') === '公')
                .filter(s => !(s.fixedPublicDates && s.fixedPublicDates.has(lowBusy.ds)))
                .filter(s => !(s.fixedWorkDates && s.fixedWorkDates.has(highNormal.ds)))
                .filter(s => !(s.fixedWorkDates && s.fixedWorkDates.has(lowBusy.ds)))
                .filter(s => canAssignWorkOnDate(s, dateKeys, busyIdx))
                .sort((a, b) => {
                    const fairnessCompare = compareHolidayFairness(a, b, staffStats);
                    if (fairnessCompare !== 0) return fairnessCompare;
                    return (a.count6 + a.count10) - (b.count6 + b.count10);
                });

            for (let i = 0; i < candidates.length; i++) {
                const s = candidates[i];
                applyShiftValue(s, highNormal.ds, '公', normalIsSpecialTargetDay);
                applyShiftValue(s, lowBusy.ds, '6', busyIsSpecialTargetDay);
                changed = true;
                break;
            }

            if (!changed) break;
        }
    }

    function applyShiftValue(staff, dateStr, newVal, isSpecialTargetDay) {
        const oldVal = staff.schedule[dateStr] || '';
        const normalizedNewVal = newVal || '';
        if (oldVal === normalizedNewVal) return;

        if (oldVal === '1') staff.count1--;
        if (oldVal === '6') staff.count6--;
        if (oldVal === '10') staff.count10--;
        if (isOffValue(oldVal)) staff.countHoliday--;
        if (isSpecialTargetDay && isWorkValue(oldVal)) {
            staff.countWeekend--;
            staff.countHolidayWork--;
        }

        if (normalizedNewVal === '1') staff.count1++;
        if (normalizedNewVal === '6') staff.count6++;
        if (normalizedNewVal === '10') staff.count10++;
        if (isOffValue(normalizedNewVal)) staff.countHoliday++;
        if (isSpecialTargetDay && isWorkValue(normalizedNewVal)) {
            staff.countWeekend++;
            staff.countHolidayWork++;
        }

        staff.schedule[dateStr] = normalizedNewVal;
    }

    function hasPublicBeforeOnePattern(staff, dateKeys, idx) {
        if (idx <= 0) return false;
        return (staff.schedule[dateKeys[idx - 1]] || '') === '公' && (staff.schedule[dateKeys[idx]] || '') === '1';
    }

    function canPlaceOneWithoutPublicBefore(staff, dateKeys, idx) {
        if (idx <= 0) return true;
        return (staff.schedule[dateKeys[idx - 1]] || '') !== '公';
    }

    function wouldForcedRestBreakDailyMinimum(staff, staffStats, dateKeys, nextIdx, dailyMinimumByDate) {
        if (!staffStats || !dailyMinimumByDate) return false;
        if (nextIdx >= dateKeys.length) return false;

        const nextDateStr = dateKeys[nextIdx];
        const nextVal = staff.schedule[nextDateStr] || '';
        if (!isWorkValue(nextVal)) return false;

        const minNeed = dailyMinimumByDate[nextDateStr] || 0;
        if (minNeed <= 0) return false;
        return getDailyWorkCount(staffStats, nextDateStr) - 1 < minNeed;
    }

    function wouldForcedRestConcentrateFinalPublic(staffStats, dates, dateKeys, nextIdx, dailyMinimumByDate) {
        if (!staffStats || !dailyMinimumByDate) return false;
        if (nextIdx !== dateKeys.length - 1) return false;

        const nextDateStr = dateKeys[nextIdx];
        const currentPublicCount = staffStats.filter(staff => !staff.manualOnly && (staff.schedule[nextDateStr] || '') === '公').length;
        const averagePublic = dateKeys.reduce((sum, dateStr) => {
            return sum + staffStats.filter(staff => !staff.manualOnly && (staff.schedule[dateStr] || '') === '公').length;
        }, 0) / dateKeys.length;
        return currentPublicCount + 1 > Math.ceil(averagePublic + 2);
    }

    function assignOneShiftWithForcedRest(staff, dates, dateKeys, idx, options = {}) {
        const dateStr = dateKeys[idx];
        applyShiftValue(staff, dateStr, '1', isWeekendOrHoliday(dates[idx], dateStr));

        const nextIdx = idx + 1;
        if (nextIdx < dateKeys.length) {
            const nextDateStr = dateKeys[nextIdx];
            if (hasFixedOffRequest(staff.name, nextDateStr) || isRequestedWorkValue(getStaffRequest(staff.name, nextDateStr))) return;
            if (staff.fixedWorkDates && staff.fixedWorkDates.has(nextDateStr)) return;
            if (wouldForcedRestBreakDailyMinimum(staff, options.staffStats, dateKeys, nextIdx, options.dailyMinimumByDate)) {
                console.warn(`[shift-generate] 1翌日公休をスキップしました: ${dateStr} ${staff.name} → ${nextDateStr}`, {
                    reason: '日別最低人数維持を優先'
                });
                return;
            }
            if (wouldForcedRestConcentrateFinalPublic(options.staffStats, dates, dateKeys, nextIdx, options.dailyMinimumByDate)) {
                console.warn(`[shift-generate] 1翌日公休をスキップしました: ${dateStr} ${staff.name} → ${nextDateStr}`, {
                    reason: '最終日の公休集中を回避'
                });
                return;
            }
            applyShiftValue(staff, nextDateStr, '公', isWeekendOrHoliday(dates[nextIdx], nextDateStr));
        }
    }

    function ensureOneShiftParticipation(staffStats, dates) {
        const dateKeys = dates.map(d => formatDateForData(d));

        function hasBlockingRequest(staffName, dateStr) {
            return isRequestedWorkValue(getStaffRequest(staffName, dateStr));
        }

        function canPlaceOneOnDate(staff, idx) {
            const dateStr = dateKeys[idx];
            const currentVal = staff.schedule[dateStr] || '';
            if (staff.fixedWorkDates && staff.fixedWorkDates.has(dateStr)) return false;
            if (currentVal === '10') return false;
            if (!canPlaceOneWithoutPublicBefore(staff, dateKeys, idx)) return false;
            if (generateRules.oneNoAfterTen && idx > 0) {
                const prevVal = staff.schedule[dateKeys[idx - 1]] || '';
                if (prevVal === '10') return false;
            }
            if (!isWorkValue(currentVal) && !canAssignWorkOnDate(staff, dateKeys, idx)) return false;
            return true;
        }

        function canKeepRestAfterOne(staff, idx) {
            const nextIdx = idx + 1;
            if (nextIdx >= dateKeys.length) return true;

            const nextDateStr = dateKeys[nextIdx];
            const nextVal = staff.schedule[nextDateStr] || '';
            if (hasFixedOffRequest(staff.name, nextDateStr)) return false;
            if (!isWorkValue(nextVal)) return true;
            if (hasBlockingRequest(staff.name, nextDateStr)) return false;
            return true;
        }

        function findOneShiftCandidate(staff) {
            let best = null;

            dateKeys.forEach((dateStr, idx) => {
                if (!canPlaceOneOnDate(staff, idx)) return;
                if (!canKeepRestAfterOne(staff, idx)) return;

                const currentVal = staff.schedule[dateStr] || '';
                const nextDateStr = dateKeys[idx + 1] || '';
                const nextVal = nextDateStr ? (staff.schedule[nextDateStr] || '') : '';

                let score = 0;
                if (currentVal === '6') score += 0;
                else if (currentVal === '公' || currentVal === '') score += 20;
                else score += 40;

                if (idx + 1 < dateKeys.length && isWorkValue(nextVal)) score += 30;
                if (isWeekendOrHoliday(dates[idx], dateStr)) score += 5;

                if (!best || score < best.score) {
                    best = { idx, score };
                }
            });

            return best;
        }

        function findFallbackOneShiftCandidate(staff) {
            let best = null;

            dateKeys.forEach((dateStr, idx) => {
                const currentVal = staff.schedule[dateStr] || '';
                if (staff.fixedWorkDates && staff.fixedWorkDates.has(dateStr)) return;
                if (hasBlockingRequest(staff.name, dateStr)) return;

                const nextIdx = idx + 1;
                const nextDateStr = dateKeys[nextIdx] || '';
                const nextVal = nextDateStr ? (staff.schedule[nextDateStr] || '') : '';
                if (nextDateStr && hasBlockingRequest(staff.name, nextDateStr)) return;

                let score = 0;
                if (currentVal === '6') score += 0;
                else if (currentVal === '公' || currentVal === '') score += 10;
                else if (currentVal === '10') score += 40;
                else score += 20;

                if (nextVal === '10') score += 40;
                else if (isWorkValue(nextVal)) score += 20;

                if (!best || score < best.score) {
                    best = { idx, score };
                }
            });

            return best;
        }

        staffStats
            .filter(s => !s.manualOnly && isOneShiftEligible(s))
            .filter(s => (s.count1 || 0) === 0)
            .forEach(staff => {
                const candidate = findOneShiftCandidate(staff);
                if (!candidate) return;

                const idx = candidate.idx;
                assignOneShiftWithForcedRest(staff, dates, dateKeys, idx);
            });

        const totalOneShiftCount = staffStats.reduce((sum, s) => sum + (s.count1 || 0), 0);
        if (totalOneShiftCount > 0) return;

        const fallbackStaff = staffStats
            .filter(s => !s.manualOnly && isOneShiftEligible(s))
            .sort((a, b) => compareOneShiftFairness(a, b, staffStats, false))[0];

        if (!fallbackStaff) return;

        const fallbackCandidate = findOneShiftCandidate(fallbackStaff) || findFallbackOneShiftCandidate(fallbackStaff);
        if (!fallbackCandidate) {
            const absoluteFallbackStaff = staffStats
                .filter(s => !s.manualOnly && isOneShiftEligible(s))
                .sort((a, b) => compareOneShiftFairness(a, b, staffStats, false))[0];

            if (!absoluteFallbackStaff) return;

            const absoluteFallbackIdx = dateKeys.findIndex((dateStr, idx) => {
                const req = getStaffRequest(absoluteFallbackStaff.name, dateStr);
                if (isOffRequestValue(req) || isRequestedWorkValue(req)) return false;
                if (absoluteFallbackStaff.fixedWorkDates && absoluteFallbackStaff.fixedWorkDates.has(dateStr)) return false;
                if (!canPlaceOneWithoutPublicBefore(absoluteFallbackStaff, dateKeys, idx)) return false;
                if (idx > 0 && (absoluteFallbackStaff.schedule[dateKeys[idx - 1]] || '') === '10' && generateRules.oneNoAfterTen) return false;
                return true;
            });

            if (absoluteFallbackIdx < 0) return;

            assignOneShiftWithForcedRest(absoluteFallbackStaff, dates, dateKeys, absoluteFallbackIdx);
            return;
        }

        const idx = fallbackCandidate.idx;
        assignOneShiftWithForcedRest(fallbackStaff, dates, dateKeys, idx);
    }

    function getDailyOneShiftBlockReason(staff, dates, dateKeys, idx) {
        const dateStr = dateKeys[idx];
        const val = staff.schedule[dateStr] || '';
        const req = getStaffRequest(staff.name, dateStr);

        if (staff.manualOnly) return '手動専用';
        if (!isOneShiftEligible(staff)) return generateRules.oneFulltimeOnly ? '1勤務対象外（正社員かつ参加ONではない）' : '1勤務対象外（参加OFF）';
        if (staff.fixedPublicDates && staff.fixedPublicDates.has(dateStr)) return '固定公休';
        if (staff.fixedWorkDates && staff.fixedWorkDates.has(dateStr)) return '固定勤務希望';
        if (isOffRequestValue(req)) return '固定休・有休・特休';
        if (isRequestedWorkValue(req)) return '固定勤務希望';
        if (val === '1') return '';
        if (val === '10') return '10勤務済み';
        if (val === '有' || val === '有休' || val === '特' || val === '特休' || val === '休') return '休み系勤務記号';
        if (idx > 0 && (staff.schedule[dateKeys[idx - 1]] || '') === '10' && generateRules.oneNoAfterTen) return '前日10';
        if (idx > 0 && (staff.schedule[dateKeys[idx - 1]] || '') === '公') return '前日公';
        if (!canPlaceOneWithoutPublicBefore(staff, dateKeys, idx)) return '公→1回避';
        if (!canAssignWorkOnDate(staff, dateKeys, idx, { ignoreCurrent: true })) return '連勤制限';

        const nextIdx = idx + 1;
        if (nextIdx < dateKeys.length) {
            const nextDateStr = dateKeys[nextIdx];
            const nextVal = staff.schedule[nextDateStr] || '';
            const nextReq = getStaffRequest(staff.name, nextDateStr);
            if (nextVal === '1') return '翌日の1勤務保護';
            if (isWorkValue(nextVal) && (staff.fixedWorkDates && staff.fixedWorkDates.has(nextDateStr))) return '翌日固定勤務希望';
            if (isWorkValue(nextVal) && isRequestedWorkValue(nextReq)) return '翌日勤務希望';
            if (isWorkValue(nextVal) && hasFixedOffRequest(staff.name, nextDateStr)) return '翌日固定休';
            if (nextVal !== '公') {
                const publicSet = new Set(dateKeys
                    .map((ds, publicIdx) => (staff.schedule[ds] || '') === '公' ? publicIdx : -1)
                    .filter(publicIdx => publicIdx >= 0));
                if (!canPlacePublicWithoutOver3(publicSet, nextIdx, dateKeys.length)) return '翌日公休で3連休化';
            }
        }

        return '';
    }

    function canAssignDailyOneShift(staff, dates, dateKeys, idx) {
        return !getDailyOneShiftBlockReason(staff, dates, dateKeys, idx);
    }

    function enforceDailyOneShiftMinimum(staffStats, dates, dailyMinimumByDate = {}) {
        if (!(timeSettings["1"] && timeSettings["1"].enabled)) return;
        const dateKeys = dates.map(d => formatDateForData(d));

        dateKeys.forEach((dateStr, idx) => {
            const hasOne = staffStats.some(staff => (staff.schedule[dateStr] || '') === '1');
            if (hasOne) return;

            const candidates = staffStats
                .filter(staff => canAssignDailyOneShift(staff, dates, dateKeys, idx))
                .sort((a, b) => {
                    const aVal = a.schedule[dateStr] || '';
                    const bVal = b.schedule[dateStr] || '';
                    const valueScore = { "6": 0, "": 1, "公": 2 };
                    const aScore = valueScore[aVal] ?? 3;
                    const bScore = valueScore[bVal] ?? 3;
                    if (aScore !== bScore) return aScore - bScore;
                    return compareOneShiftFairness(a, b, staffStats, isWeekendOrHoliday(dates[idx], dateStr));
                });

            if (!candidates.length) {
                const reasons = staffStats
                    .filter(staff => !staff.manualOnly)
                    .filter(staff => isOneShiftEligible(staff))
                    .map(staff => ({
                        staff: staff.name,
                        reason: getDailyOneShiftBlockReason(staff, dates, dateKeys, idx)
                    }))
                    .filter(item => item.reason);
                console.warn(`[shift-generate] 1勤務を補充できません: ${dateStr}`, { reasons });
                return;
            }

            assignOneShiftWithForcedRest(candidates[0], dates, dateKeys, idx, { staffStats, dailyMinimumByDate });
        });
    }

    function enforceDailyTenAssignments(staffStats, dates) {
        if (!(timeSettings["10"] && timeSettings["10"].enabled)) return;
        const target10 = Math.max(0, generateRules.tenShiftCount || 0);
        if (target10 === 0) return;

        const isOff = (v) => v === '公' || v === '有' || v === '有休' || v === '特' || v === '特休' || v === '休';
        const dateKeys = dates.map(d => formatDateForData(d));

        function pickDesiredFtCount() {
            const p1 = Math.max(0, generateRules.tenFtProb1 || 0);
            const p2 = Math.max(0, generateRules.tenFtProb2 || 0);
            const p3 = Math.max(0, generateRules.tenFtProb3 || 0);
            const total = p1 + p2 + p3;
            if (total <= 0) return 1;
            const r = Math.random() * total;
            if (r < p1) return 1;
            if (r < p1 + p2) return 2;
            return 3;
        }

        dates.forEach((d, idx) => {
            const dateStr = formatDateForData(d);
            const isWeekend = isWeekendOrHoliday(d, dateStr);
            const eligible = staffStats.filter(s => !s.manualOnly && !s.isIrregular);
            if (eligible.length === 0) return;

            let tenMembers = eligible.filter(s => (s.schedule[dateStr] || '') === '10');
            const fulltimeEligible = eligible.filter(s => s.isFulltime).filter(s => {
                const v = s.schedule[dateStr] || '';
                return v === '10' || !isOff(v);
            });
            const desiredFtRaw = pickDesiredFtCount();
            const desiredFt = Math.max(
                generateRules.requireFulltimeOn10 ? 1 : 0,
                Math.min(desiredFtRaw, Math.min(target10, fulltimeEligible.length))
            );

            // 多すぎる場合は3人まで削減（正社員偏りを減らす）
            if (tenMembers.length > target10) {
                const removable = [...tenMembers].sort((a, b) => {
                    const ftNow = tenMembers.filter(x => x.isFulltime).length;
                    if (ftNow > desiredFt && a.isFulltime !== b.isFulltime) return a.isFulltime ? -1 : 1;
                    if (ftNow < desiredFt && a.isFulltime !== b.isFulltime) return a.isFulltime ? 1 : -1;
                    return b.count10 - a.count10;
                });
                while (tenMembers.length > target10 && removable.length > 0) {
                    const s = removable.shift();
                    if (s.fixedWorkDates && s.fixedWorkDates.has(dateStr)) continue;
                    const ftOn10 = tenMembers.filter(x => x.isFulltime).length;
                    if (s.isFulltime && ftOn10 <= 1) continue;
                    applyShiftValue(s, dateStr, (timeSettings["6"] && timeSettings["6"].enabled) ? '6' : '', isWeekend);
                    tenMembers = eligible.filter(x => (x.schedule[dateStr] || '') === '10');
                }
            }

            // 足りない場合は3人まで補充
            if (tenMembers.length < target10) {
                const hasFtAlready = tenMembers.some(s => s.isFulltime);
                const addable = eligible
                    .filter(s => {
                        const v = s.schedule[dateStr] || '';
                        if (s.fixedWorkDates && s.fixedWorkDates.has(dateStr)) return false;
                        return v !== '10' && v !== '1' && !isOff(v) && canAssignTenOnDate(s, dateKeys, idx);
                    })
                    .sort((a, b) => {
                        if (isWeekend && isWeekendTenPriorityStaff(a) !== isWeekendTenPriorityStaff(b)) {
                            return isWeekendTenPriorityStaff(a) ? -1 : 1;
                        }
                        const ftNow = tenMembers.filter(x => x.isFulltime).length;
                        if (ftNow < desiredFt && a.isFulltime !== b.isFulltime) return a.isFulltime ? -1 : 1;
                        if (ftNow >= desiredFt && a.isFulltime !== b.isFulltime) return a.isFulltime ? 1 : -1;
                        return a.count10 - b.count10;
                    });

                let i = 0;
                while (tenMembers.length < target10 && i < addable.length) {
                    applyShiftValue(addable[i++], dateStr, '10', isWeekend);
                    tenMembers = eligible.filter(x => (x.schedule[dateStr] || '') === '10');
                }
            }

            // 最低1人の正社員を保証
            if (generateRules.requireFulltimeOn10) {
                tenMembers = eligible.filter(s => (s.schedule[dateStr] || '') === '10');
                const hasFt = tenMembers.some(s => s.isFulltime);
                if (!hasFt) {
                    const ftCandidates = eligible
                        .filter(s => s.isFulltime)
                        .filter(s => {
                            const v = s.schedule[dateStr] || '';
                            if (s.fixedWorkDates && s.fixedWorkDates.has(dateStr)) return false;
                            return v !== '10' && v !== '1' && !isOff(v) && canAssignTenOnDate(s, dateKeys, idx);
                        })
                        .sort((a, b) => {
                            if (isWeekend && isWeekendTenPriorityStaff(a) !== isWeekendTenPriorityStaff(b)) {
                                return isWeekendTenPriorityStaff(a) ? -1 : 1;
                            }
                            return a.count10 - b.count10;
                        });
                    if (ftCandidates.length > 0) {
                        applyShiftValue(ftCandidates[0], dateStr, '10', isWeekend);
                        tenMembers = eligible.filter(s => (s.schedule[dateStr] || '') === '10');
                        if (tenMembers.length > target10) {
                            const removePt = tenMembers
                                .filter(s => !s.isFulltime)
                                .filter(s => !(s.fixedWorkDates && s.fixedWorkDates.has(dateStr)))
                                .sort((a, b) => b.count10 - a.count10);
                            if (removePt.length > 0) {
                                applyShiftValue(removePt[0], dateStr, (timeSettings["6"] && timeSettings["6"].enabled) ? '6' : '', isWeekend);
                            }
                        }
                    }
                }
            }
        });
    }

    function getExpectedOffValueForRequest(req) {
        if (req === '休' || req === '公') return '公';
        if (req === '特休' || req === '特') return '特';
        if (req === '有休' || req === '有') return '有';
        return '';
    }

    function getActualCounterSnapshot(staff, dates) {
        const counts = {
            count1: 0,
            count6: 0,
            count10: 0,
            countHoliday: 0,
            countWeekend: 0,
            countHolidayWork: 0
        };

        dates.forEach(dateObj => {
            const dateStr = formatDateForData(dateObj);
            const val = staff.schedule[dateStr] || '';
            const special = isWeekendOrHoliday(dateObj, dateStr);
            if (val === '1') counts.count1++;
            if (val === '6') counts.count6++;
            if (val === '10') counts.count10++;
            if (isOffValue(val)) counts.countHoliday++;
            if (special && isWorkValue(val)) {
                counts.countWeekend++;
                counts.countHolidayWork++;
            }
        });

        return counts;
    }

    function validateGenerationConflicts(staffStats, dates, dailyMinimumByDate = {}) {
        const dateKeys = dates.map(d => formatDateForData(d));
        const warnings = [];

        function isMonthBoundaryAttention(idx) {
            if (idx < 3 || idx >= dateKeys.length - 3) return true;
            const dateObj = dates[idx];
            const lastDay = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).getDate();
            return lastDay - dateObj.getDate() < 3;
        }

        staffStats.forEach(staff => {
            dateKeys.forEach((dateStr, idx) => {
                const req = getStaffRequest(staff.name, dateStr);
                const val = staff.schedule[dateStr] || '';

                if (isOffRequestValue(req)) {
                    const expected = getExpectedOffValueForRequest(req);
                    if (expected && val !== expected) {
                        warnings.push({
                            type: 'fixed-request-overwritten',
                            staff: staff.name,
                            date: dateStr,
                            expected,
                            actual: val
                        });
                    }
                }

                if (isRequestedWorkValue(req) && staff.fixedWorkDates && staff.fixedWorkDates.has(dateStr) && val !== req) {
                    warnings.push({
                        type: 'fixed-work-request-overwritten',
                        staff: staff.name,
                        date: dateStr,
                        expected: req,
                        actual: val
                    });
                }

                if (isFixedPublicHoliday(staff, dateStr) && val !== '公') {
                    warnings.push({
                        type: 'fixed-public-holiday-overwritten',
                        staff: staff.name,
                        date: dateStr,
                        expected: '公',
                        actual: val
                    });
                    console.warn(`[固定公休破壊] ${dateStr} ${staff.name} 公→${val || '空欄'}`);
                }

                if (val === '1' && idx + 1 < dateKeys.length) {
                    const nextDateStr = dateKeys[idx + 1];
                    const nextVal = staff.schedule[nextDateStr] || '';
                    if (isWorkValue(nextVal)) {
                        warnings.push({
                            type: 'work-after-one',
                            staff: staff.name,
                            date: dateStr,
                            nextDate: nextDateStr,
                            nextValue: nextVal
                        });
                    }
                }

                if (val === '10' && idx + 1 < dateKeys.length && (staff.schedule[dateKeys[idx + 1]] || '') === '1') {
                    warnings.push({
                        type: 'one-after-ten',
                        staff: staff.name,
                        date: dateStr,
                        nextDate: dateKeys[idx + 1]
                    });
                }
            });

            let publicRunStart = -1;
            dateKeys.forEach((dateStr, idx) => {
                const isPublic = (staff.schedule[dateStr] || '') === '公';
                if (isPublic && publicRunStart < 0) publicRunStart = idx;
                const isRunEnd = publicRunStart >= 0 && (!isPublic || idx === dateKeys.length - 1);
                if (!isRunEnd) return;

                const endIdx = isPublic ? idx : idx - 1;
                const runLength = endIdx - publicRunStart + 1;
                if (runLength >= 3) {
                    const runDates = dateKeys.slice(publicRunStart, endIdx + 1);
                    const includesGeneratedPublic = runDates.some(ds => !hasFixedOffRequest(staff.name, ds));
                    if (includesGeneratedPublic) {
                        warnings.push({
                            type: 'generated-public-three-plus',
                            staff: staff.name,
                            dates: runDates
                        });
                    }
                }
                publicRunStart = isPublic ? idx : -1;
            });

            let workRunStart = -1;
            dateKeys.forEach((dateStr, idx) => {
                const isWork = isWorkValue(staff.schedule[dateStr] || '');
                if (isWork && workRunStart < 0) workRunStart = idx;
                const isRunEnd = workRunStart >= 0 && (!isWork || idx === dateKeys.length - 1);
                if (!isRunEnd) return;

                const endIdx = isWork ? idx : idx - 1;
                const runLength = endIdx - workRunStart + 1;
                const maxAllowed = getMaxConsecutiveWorkDays();
                const warningLimit = generateRules.fillBlankWithSix ? 7 : maxAllowed;
                if (runLength > warningLimit) {
                    warnings.push({
                        type: 'consecutive-work-limit',
                        staff: staff.name,
                        maxAllowed: warningLimit,
                        dates: dateKeys.slice(workRunStart, endIdx + 1)
                    });
                } else if (generateRules.fillBlankWithSix && runLength > maxAllowed) {
                    console.warn('[shift-generate] 参考警告: 空欄後処理により連勤が長くなっています', {
                        staff: staff.name,
                        dates: dateKeys.slice(workRunStart, endIdx + 1),
                        runLength,
                        normalMaxAllowed: maxAllowed
                    });
                }
                workRunStart = isWork ? idx : -1;
            });

            const actualCounts = getActualCounterSnapshot(staff, dates);
            ['count1', 'count6', 'count10', 'countHoliday', 'countWeekend', 'countHolidayWork'].forEach(key => {
                if ((staff[key] || 0) !== actualCounts[key]) {
                    warnings.push({
                        type: 'counter-mismatch',
                        staff: staff.name,
                        counter: key,
                        stored: staff[key] || 0,
                        actual: actualCounts[key]
                    });
                }
            });
        });

        const oneEligible = staffStats.filter(staff => !staff.manualOnly && isOneShiftEligible(staff));
        if (oneEligible.length >= 2) {
            const oneCounts = oneEligible.map(staff => ({ staff: staff.name, count1: getShiftCount(staff, '1') }));
            const maxOne = Math.max(...oneCounts.map(item => item.count1));
            const minOne = Math.min(...oneCounts.map(item => item.count1));
            if (maxOne - minOne >= 2) {
                warnings.push({
                    type: 'one-fairness-gap',
                    max: maxOne,
                    min: minOne,
                    gap: maxOne - minOne,
                    counts: oneCounts
                });
            }
        }

        const tenEligible = staffStats.filter(staff => !staff.manualOnly && !staff.isIrregular);
        if (tenEligible.length >= 2) {
            const tenCounts = tenEligible.map(staff => ({ staff: staff.name, count10: getShiftCount(staff, '10') }));
            const maxTen = Math.max(...tenCounts.map(item => item.count10));
            const minTen = Math.min(...tenCounts.map(item => item.count10));
            if (maxTen - minTen >= 2) {
                warnings.push({
                    type: 'ten-fairness-gap',
                    max: maxTen,
                    min: minTen,
                    gap: maxTen - minTen,
                    counts: tenCounts
                });
            }
        }

        if (dateKeys.length) {
            const finalStats = getFinalDayPublicStats(staffStats, dates, dailyMinimumByDate);
            const averagePublic = dateKeys.reduce((sum, dateStr) => {
                return sum + staffStats.filter(staff => !staff.manualOnly && (staff.schedule[dateStr] || '') === '公').length;
            }, 0) / dateKeys.length;
            if (finalStats.publicCount > Math.ceil(averagePublic + 2)) {
                warnings.push({
                    type: 'final-day-public-concentration',
                    date: finalStats.finalDateStr,
                    publicCount: finalStats.publicCount,
                    averagePublic,
                    fixedPublicCount: finalStats.fixedPublicCount,
                    generatedPublicCount: finalStats.generatedPublicCount
                });
                console.warn(`[最終日公休集中] ${finalStats.finalDateStr} 公休数が他日平均より多いです`, {
                    publicCount: finalStats.publicCount,
                    averagePublic,
                    fixedPublicCount: finalStats.fixedPublicCount,
                    generatedPublicCount: finalStats.generatedPublicCount
                });
            }
        }

        dateKeys.forEach(dateStr => {
            const idx = dateKeys.indexOf(dateStr);
            const minNeed = dailyMinimumByDate[dateStr] || 0;
            const dailyWorkCount = getDailyWorkCount(staffStats, dateStr);
            const oneCount = staffStats.filter(staff => !staff.manualOnly && (staff.schedule[dateStr] || '') === '1').length;
            const tenCount = staffStats.filter(staff => !staff.manualOnly && (staff.schedule[dateStr] || '') === '10').length;
            if (idx === dateKeys.length - 1) {
                console.warn(`[最終日チェック] ${dateStr} 必要${minNeed}人 / 実績${dailyWorkCount}人 / 1:${oneCount}人 / 10:${tenCount}人`);
            }
            if (minNeed > 0 && dailyWorkCount < minNeed) {
                warnings.push({
                    type: 'daily-minimum-shortage',
                    date: dateStr,
                    required: minNeed,
                    actual: dailyWorkCount
                });
                if (idx === dateKeys.length - 1) {
                    warnings.push({
                        type: 'final-day-minimum-shortage',
                        date: dateStr,
                        required: minNeed,
                        actual: dailyWorkCount,
                        oneCount,
                        tenCount
                    });
                }
                console.warn(`[人数不足] ${dateStr} 必要${minNeed}人 / 実績${dailyWorkCount}人`);
                if (idx >= 0 && isMonthBoundaryAttention(idx)) {
                    console.warn(`[月境界注意] ${dateStr} 人数不足。公休補正が集中している可能性あり。`);
                }
            }

            const hasCoreWorker = staffStats.some(staff => staff.isFulltime && isFulltimeCoreStaff(staff) && isWorkValue(staff.schedule[dateStr] || ''));
            if (!hasCoreWorker) {
                warnings.push({
                    type: 'missing-fulltime-core-worker',
                    date: dateStr
                });
            }

            const oneMembers = staffStats.filter(staff => !staff.manualOnly && (staff.schedule[dateStr] || '') === '1');
            if (!oneMembers.length) {
                warnings.push({
                    type: 'missing-daily-one-shift',
                    date: dateStr
                });
            }

            if (timeSettings["10"] && timeSettings["10"].enabled && generateRules.requireFulltimeOn10) {
                const tenMembers = staffStats.filter(staff => !staff.manualOnly && (staff.schedule[dateStr] || '') === '10');
                if (!tenMembers.some(staff => staff.isFulltime)) {
                    warnings.push({
                        type: 'ten-without-fulltime',
                        date: dateStr,
                        tenMembers: tenMembers.map(staff => staff.name)
                    });
                }
            }

            if (timeSettings["10"] && timeSettings["10"].enabled && (generateRules.tenShiftCount || 0) > 0 && idx >= 0 && isWeekendOrHoliday(dates[idx], dateStr)) {
                const tenMembers = staffStats.filter(staff => !staff.manualOnly && (staff.schedule[dateStr] || '') === '10');
                const hasPriorityTen = tenMembers.some(staff => isWeekendTenPriorityStaff(staff));
                if (!hasPriorityTen) {
                    const priorityReasons = staffStats
                        .filter(staff => isWeekendTenPriorityStaff(staff))
                        .map(staff => ({
                            staff: staff.name,
                            reason: getWeekendTenPriorityCandidateReason(staff, dateKeys, idx) || '候補だが未選択'
                        }));
                    warnings.push({
                        type: 'missing-weekend-priority-ten',
                        date: dateStr,
                        priorityReasons
                    });
                    const message = priorityReasons
                        .map(item => `${item.staff}: ${item.reason}`)
                        .join(' / ');
                    console.warn(`[土日祝10優先] ${dateStr} ${message}`);
                }
            }
        });

        if (warnings.length) {
            console.warn('[shift-generate] 生成ロジック競合チェック警告', warnings);
        }

        return warnings;
    }

    function shuffleInPlace(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function generateShift() {
        refreshStaffData();
        if (activeStaff.length === 0) {
            alert('スタッフが選択されていません。');
            return;
        }

        if (!timeSettings["1"].enabled && !timeSettings["6"].enabled && !timeSettings["10"].enabled) {
            alert('時間設定で1つ以上の勤務区分をONにしてください。');
            return;
        }

        generationCount++;

        const { start, end } = getPeriod(currentYear, currentTargetMonth);
        const dates = [];
        let curr = new Date(start);
        while (curr <= end) {
            dates.push(new Date(curr));
            curr.setDate(curr.getDate() + 1);
        }

        // initialize staff stats
        const staffStats = activeStaff.map(s => ({
            name: s.name,
            isFulltime: s.isFulltime,
            isFulltimeCore: !!s.isFulltimeCore,
            isIrregular: s.isIrregular,
            manualOnly: !!s.manualOnly,
            canWorkOneShift: !!s.canWorkOneShift,
            pubHolidays: s.pubHolidays,
            fixedPublicDates: new Set(),
            fixedWorkDates: new Set(),
            fixedPublicHolidayDates: new Set(),
            count1: 0,
            count10: 0,
            count6: 0,
            countHoliday: 0, // NEW: track actual given holidays (休, 有休, 有, and 公)
            countWeekend: 0,
            countHolidayWork: 0,
            schedule: {}
        }));
        const assignableStaff = staffStats.filter(s => !s.manualOnly);
        const assignableStaffCount = assignableStaff.length;
        const totalPublicHolidayTarget = assignableStaff.reduce((sum, s) => sum + (s.pubHolidays || 0), 0);
        const dailyMinimumByDate = {};
        const busyDayByDate = {};
        const dateKeys = dates.map(d => formatDateForData(d));

        function canKeepRestAfterRequestedOne(staff, dateIdx) {
            const nextIdx = dateIdx + 1;
            if (nextIdx >= dateKeys.length) return true;

            const nextDateStr = dateKeys[nextIdx];
            const nextReq = getStaffRequest(staff.name, nextDateStr);
            const nextVal = staff.schedule[nextDateStr] || '';
            return !nextReq && !isWorkValue(nextVal);
        }

        function canHonorWorkRequest(staff, requestedValue, dateObj, dateIdx) {
            if (!timeSettings[requestedValue] || !timeSettings[requestedValue].enabled) return false;
            if (staff.isIrregular && requestedValue !== '6') return false;
            if (!canAssignWorkOnDate(staff, dateKeys, dateIdx)) return false;

            if (requestedValue === '1') {
                if (!isOneShiftEligible(staff)) return false;
                if (generateRules.oneNoAfterTen && getYesterdayShift(staff, dateObj) === '10') return false;
                if (!canPlaceOneWithoutPublicBefore(staff, dateKeys, dateIdx)) return false;
                if (!canKeepRestAfterRequestedOne(staff, dateIdx)) return false;
            }

            if (requestedValue === '10') {
                if (staff.isIrregular) return false;
                if (getYesterdayShift(staff, dateObj) === '1') return false;
            }

            return true;
        }

        function applyRequestedWork(staff, requestedValue, dateObj, dateIdx, isSpecialTargetDay) {
            if (requestedValue === '1') {
                assignOneShiftWithForcedRest(staff, dates, dateKeys, dateIdx);
            } else {
                applyShiftValue(staff, formatDateForData(dateObj), requestedValue, isSpecialTargetDay);
            }
            staff.fixedWorkDates.add(formatDateForData(dateObj));
        }

        // Assign day by day
        dates.forEach((d, dateIdx) => {
            const dateStr = formatDateForData(d);
            const isSpecialTargetDay = isWeekendOrHoliday(d, dateStr);

            const todayEvent = eventData[dateStr] || {};

            const isBusyTargetDay = isBusyDay(todayEvent);
            busyDayByDate[dateStr] = isBusyTargetDay;
            // 固定人数ではなく、スタッフ総数 + 公休平均ベースの可変目安人数
            const targetRange = getDynamicTargetRange(
                assignableStaffCount,
                totalPublicHolidayTarget,
                dates.length,
                isBusyTargetDay
            );
            const softTargetTotal = randomInt(targetRange.min, targetRange.max);
            dailyMinimumByDate[dateStr] = targetRange.min;

            let req1 = timeSettings["1"].enabled ? generateRules.oneShiftCount : 0;
            let req10_target = timeSettings["10"].enabled ? generateRules.tenShiftCount : 0;

            let req10_remaining = req10_target;

            // Filter available and process pre-assigned requests ('10')
            let available = [];
            staffStats.forEach(s => {
                if (s.manualOnly) {
                    const req = getStaffRequest(s.name, dateStr);
                    if (isOffRequestValue(req)) {
                        if (req === '休' || req === '公') {
                            applyShiftValue(s, dateStr, '公', isSpecialTargetDay);
                            s.fixedPublicDates.add(dateStr);
                            s.fixedPublicHolidayDates.add(dateStr);
                        } else if (req === '特休' || req === '特') {
                            applyShiftValue(s, dateStr, '特', isSpecialTargetDay);
                        } else {
                            applyShiftValue(s, dateStr, '有', isSpecialTargetDay);
                        }
                    } else if (isManualOnlyWorkRequest(req)) {
                        const workValue = getManualOnlyRequestedWorkValue(req);
                        if (!workValue) {
                            applyShiftValue(s, dateStr, '', isSpecialTargetDay);
                            return;
                        }
                        applyShiftValue(s, dateStr, workValue, isSpecialTargetDay);
                    } else {
                        applyShiftValue(s, dateStr, '', isSpecialTargetDay);
                    }
                    return;
                }
                const req = getStaffRequest(s.name, dateStr);
                if ((s.fixedPublicDates && s.fixedPublicDates.has(dateStr)) && (s.schedule[dateStr] || '') === '公') {
                    return;
                }

                if (isOffRequestValue(req)) {
                    if (req === '休' || req === '公') {
                        // 休み系の希望は自動生成時に公休として反映し、固定する
                        applyShiftValue(s, dateStr, '公', isSpecialTargetDay);
                        s.fixedPublicDates.add(dateStr);
                        s.fixedPublicHolidayDates.add(dateStr);
                    } else if (req === '特休' || req === '特') {
                        applyShiftValue(s, dateStr, '特', isSpecialTargetDay);
                    } else {
                        applyShiftValue(s, dateStr, '有', isSpecialTargetDay);
                    }
                } else if (isRequestedWorkValue(req)) {
                    if (canHonorWorkRequest(s, req, d, dateIdx)) {
                        applyRequestedWork(s, req, d, dateIdx, isSpecialTargetDay);
                        if (req === '1') req1 = Math.max(0, req1 - 1);
                        if (req === '10') req10_remaining--;
                    } else if (!((s.fixedPublicDates && s.fixedPublicDates.has(dateStr)) && (s.schedule[dateStr] || '') === '公')) {
                        available.push(s);
                    }
                } else {
                    available.push(s);
                }
            });
            shuffleInPlace(available);

            req10_remaining = Math.max(0, req10_remaining);

            // 1. Assign ① (1 person, Fulltime only, not 10 yesterday)
            if (req1 > 0) {
                let candidates1 = available.filter(s => {
                    const totalDays = dates.length;
                    const targetWorkDays = totalDays - s.pubHolidays;
                    const currentWorkDays = s.count1 + s.count10 + s.count6;
                    if (!isOneShiftEligible(s)) return false;
                    if (generateRules.oneNoAfterTen && getYesterdayShift(s, d) === '10') return false;
                    if (!canPlaceOneWithoutPublicBefore(s, dateKeys, dateIdx)) return false;
                    if (!canAssignWorkOnDate(s, dateKeys, dateIdx)) return false;
                    return currentWorkDays < targetWorkDays;
                });

                const sortCandidatesForOne = (a, b) => compareOneShiftFairness(a, b, staffStats, isSpecialTargetDay);

                candidates1.sort(sortCandidatesForOne);

                const assigned1 = candidates1.slice(0, req1);

                assigned1.slice(0, req1).forEach(s => {
                    assignOneShiftWithForcedRest(s, dates, dateKeys, dateIdx);
                    removeFromAvailable(available, s);
                });
            }

            // 2. Assign ⑩ (3 people, at least 1 Fulltime)
            if (req10_remaining > 0) {
                let alreadyHasFtOn10 = staffStats.some(s => s.schedule[dateStr] === '10' && s.isFulltime);

                let candidates10_ft = available.filter(s => {
                    const totalDays = dates.length;
                    const targetWorkDays = totalDays - s.pubHolidays;
                    const currentWorkDays = s.count1 + s.count10 + s.count6;
                    return s.isFulltime && !s.isIrregular && currentWorkDays < targetWorkDays && canAssignTenOnDate(s, dateKeys, dateIdx);
                });
                candidates10_ft.sort((a, b) => randomTieBreak((a.count1 + a.count10) - (b.count1 + b.count10)));
                if (isSpecialTargetDay) {
                    candidates10_ft.sort((a, b) => {
                        if (isWeekendTenPriorityStaff(a) !== isWeekendTenPriorityStaff(b)) {
                            return isWeekendTenPriorityStaff(a) ? -1 : 1;
                        }
                        return 0;
                    });
                }
                if (isSpecialTargetDay) {
                    candidates10_ft.sort((a, b) => {
                        if (isWeekendTenPriorityStaff(a) !== isWeekendTenPriorityStaff(b)) {
                            return isWeekendTenPriorityStaff(a) ? -1 : 1;
                        }
                        const fairnessCompare = compareHolidayFairness(a, b, staffStats);
                        if (fairnessCompare !== 0) return fairnessCompare;
                        return randomTieBreak((a.count1 + a.count10) - (b.count1 + b.count10));
                    });
                }

                if (generateRules.requireFulltimeOn10 && !alreadyHasFtOn10 && candidates10_ft.length > 0) {
                    const ft = candidates10_ft[0];
                    applyShiftValue(ft, dateStr, '10', isSpecialTargetDay);
                    removeFromAvailable(available, ft);
                    req10_remaining--;
                }

                // Pick remaining ⑩ from ALL staff (non-irregular)
                let candidates10_all = available.filter(s => {
                    const totalDays = dates.length;
                    const targetWorkDays = totalDays - s.pubHolidays;
                    const currentWorkDays = s.count1 + s.count10 + s.count6;
                    return !s.isIrregular && currentWorkDays < targetWorkDays && canAssignTenOnDate(s, dateKeys, dateIdx);
                });
                candidates10_all.sort((a, b) => randomTieBreak((a.count1 + a.count10) - (b.count1 + b.count10)));
                if (isSpecialTargetDay) {
                    candidates10_all.sort((a, b) => {
                        if (isWeekendTenPriorityStaff(a) !== isWeekendTenPriorityStaff(b)) {
                            return isWeekendTenPriorityStaff(a) ? -1 : 1;
                        }
                        const fairnessCompare = compareHolidayFairness(a, b, staffStats);
                        if (fairnessCompare !== 0) return fairnessCompare;
                        return randomTieBreak((a.count1 + a.count10) - (b.count1 + b.count10));
                    });
                }

                const assigned10_rest = candidates10_all.slice(0, req10_remaining);
                assigned10_rest.forEach(s => {
                    applyShiftValue(s, dateStr, '10', isSpecialTargetDay);
                    removeFromAvailable(available, s);
                });
            }

            // 3. Assign ⑥（その日の目安人数に届くまで）
            if (timeSettings["6"].enabled) {
                let candidates6 = available.filter(s => {
                    const totalDays = dates.length;
                    const targetWorkDays = totalDays - s.pubHolidays;
                    const currentWorkDays = s.count1 + s.count10 + s.count6;
                    return currentWorkDays < targetWorkDays && canAssignWorkOnDate(s, dateKeys, dateIdx);
                });

                candidates6.sort((a, b) => {
                    const totalDays = dates.length;
                    const aTargetWorkDays = totalDays - a.pubHolidays;
                    const bTargetWorkDays = totalDays - b.pubHolidays;

                    const aCurrentWorkDays = a.count1 + a.count10 + a.count6;
                    const bCurrentWorkDays = b.count1 + b.count10 + b.count6;

                    const aRemainingWorkDays = aTargetWorkDays - aCurrentWorkDays;
                    const bRemainingWorkDays = bTargetWorkDays - bCurrentWorkDays;

                    if (aRemainingWorkDays !== bRemainingWorkDays) {
                        return bRemainingWorkDays - aRemainingWorkDays;
                    }

                    if (isSpecialTargetDay) {
                        const fairnessCompare = compareHolidayFairness(a, b, staffStats);
                        if (fairnessCompare !== 0) return fairnessCompare;
                        const weekendCompare = a.countWeekend - b.countWeekend;
                        return randomTieBreak(weekendCompare);
                    }

                    return randomTieBreak(aCurrentWorkDays - bCurrentWorkDays);
                });

                const alreadyAssignedWork = staffStats.reduce((acc, s) => {
                    if (s.manualOnly) return acc;
                    const val = s.schedule[dateStr] || '';
                    return acc + (isWorkValue(val) ? 1 : 0);
                }, 0);
                const req6 = Math.max(0, softTargetTotal - alreadyAssignedWork);
                const assigned6 = candidates6.slice(0, req6);
                assigned6.forEach(s => {
                    applyShiftValue(s, dateStr, '6', isSpecialTargetDay);
                    removeFromAvailable(available, s);
                });
            }

            // 3.5 追加勤務をランダム付与（人数多めチェック日をやや多め）
            const extraWorkTarget = isBusyTargetDay
                ? randomInt(2, 4)
                : randomInt(0, 1);
            if (extraWorkTarget > 0) {
                let extraCandidates = available.filter(s => !s.isIrregular && canAssignWorkOnDate(s, dateKeys, dateIdx));
                shuffleInPlace(extraCandidates);
                const extras = extraCandidates.slice(0, extraWorkTarget);
                extras.forEach(s => {
                    applyShiftValue(s, dateStr, '6', isSpecialTargetDay);
                    removeFromAvailable(available, s);
                });
            }

            // 4. Mark rest as 公休
            available.forEach(s => {
                if (s.manualOnly) {
                    applyShiftValue(s, dateStr, '', isSpecialTargetDay);
                    return;
                }
                applyShiftValue(s, dateStr, '', isSpecialTargetDay);
            });

        });

        // 優先順位: 固定希望 > 営業維持 > 勤務制限 > 公休数調整 > 公平化
        // 初期公休配置: 公休(公)は設定値に合わせ、3連休を避けるよう補正
        applyPublicHolidayPattern(staffStats, dates, dailyMinimumByDate);

        // 営業維持1: 日別人数の下振れを再配分で補正（1桁人数を出しにくくする）
        rebalanceDailyMinimums(staffStats, dates, dailyMinimumByDate);
        // 営業維持2: 人数多めチェック日の人数が通常日より下回りにくいように再配分
        enforceBusyDayHigherThanNormal(staffStats, dates, busyDayByDate);
        // 営業維持3: ⑩を毎日3人体制 + 正社員最低1人に合わせる
        enforceDailyTenAssignments(staffStats, dates);
        // 営業維持4: 各日に1勤務を最低1人入れる
        enforceDailyOneShiftMinimum(staffStats, dates, dailyMinimumByDate);
        // 営業維持5: 正社員常勤は毎日最低1人出勤させる
        enforceFulltimeCoreDailyCoverage(staffStats, dates, dailyMinimumByDate);
        // 営業維持6: 土日祝10は石川・大野を優先して入れる
        enforceWeekendTenPriority(staffStats, dates);

        // 勤務制限1: 6/10 が4連続以上続かないようにほぐす（3連続は許容）
        normalizeWorkPattern(staffStats, dates);
        // 勤務制限2: イレギュラーは6専用（10/1を除去）
        enforceIrregularShiftRules(staffStats, dates);
        // 勤務制限3: ①参加ONのスタッフには月内で最低1回①を入れる
        ensureOneShiftParticipation(staffStats, dates);
        // 勤務制限4: 自動生成された公休は最大2連休までに制限
        enforceMaxTwoConsecutiveGeneratedPublicHolidays(staffStats, dates);
        // 勤務制限5: 設定された連勤上限（初期3、許可時4）を超えないよう翌日公休にする
        enforceRestAfterThreeConsecutiveWorkdays(staffStats, dates);
        // 勤務制限6: 「公1」「1公1」をできるだけ解消する
        enforceNoPublicBeforeOnePattern(staffStats, dates);

        // 公平化1: 土日祝勤務/休みの偏りを6勤務の持ち替えでできるだけ均等化
        rebalanceSpecialDayFairness(staffStats, dates);
        // 公平化2: ①と⑩の回数を別々にできるだけ均等化する
        rebalanceOneAndTenShiftFairness(staffStats, dates, dailyMinimumByDate);
        // 営業維持の最終再保証: 各日の1勤務を固定希望・勤務制限を壊さず補充
        enforceDailyOneShiftMinimum(staffStats, dates, dailyMinimumByDate);
        // 営業維持の最終再保証: ⑩人数と10正社員を固定希望・勤務制限を壊さず補充
        enforceDailyTenAssignments(staffStats, dates);
        // 営業維持の最終再保証: 正社員常勤を固定希望・勤務制限を壊さない候補だけ使用
        enforceFulltimeCoreDailyCoverage(staffStats, dates, dailyMinimumByDate);
        // 営業維持の最終再保証: 土日祝10は石川・大野を優先して入れる
        enforceWeekendTenPriority(staffStats, dates);
        // 最終公平化: 営業維持を壊さない交換だけで①/⑩の差を詰める
        rebalanceOneAndTenShiftFairness(staffStats, dates, dailyMinimumByDate);
        // 公平化後の再補正: 石川・大野の土日祝10が外れた場合に戻す
        enforceWeekendTenPriority(staffStats, dates);
        // 最終再確認: 公休数調整 → 公休集中の分散 → 最終日人数不足補正 → 1 → 10 → 正社員常勤 → 検証
        applyPublicHolidayPattern(staffStats, dates, dailyMinimumByDate);
        redistributeFinalDayPublicConcentration(staffStats, dates, dailyMinimumByDate);
        enforceDailyOneShiftMinimum(staffStats, dates, dailyMinimumByDate);
        enforceDailyTenAssignments(staffStats, dates);
        enforceFulltimeCoreDailyCoverage(staffStats, dates, dailyMinimumByDate);
        enforceWeekendTenPriority(staffStats, dates);
        validateGenerationConflicts(staffStats, dates, dailyMinimumByDate);
        fillBlankWithSixPostProcess(staffStats, dates);

        lastGeneratedDates = dates;
        lastGeneratedStaffStats = staffStats;
        renderShiftTable(lastGeneratedDates, lastGeneratedStaffStats);
        renderSummaryPanel(lastGeneratedStaffStats);
        if (shiftContainer) shiftContainer.style.display = 'block';
        showToast(`シフトを作成しました（${generationCount}回目）`);
    }

    function getCellClassByValue(val) {
        if (val === '1') return 'c-1';
        if (val === '6') return 'c-6';
        if (val === '10') return 'c-10';
        if (/^(?:[2-5]|[7-9])$/.test(val)) return 'c-n';
        if (val === '休' || val === '有休' || val === '有' || val === '特休' || val === '特') return 'c-v';
        if (val === '公') return 'c-k';
        return '';
    }

    function isFixedPublicHoliday(staff, dateStr) {
        return !!(staff && staff.fixedPublicHolidayDates && staff.fixedPublicHolidayDates.has(dateStr));
    }

    function getCellClassForStaffDate(staff, dateStr, val) {
        const baseClass = getCellClassByValue(val);
        if (val === '公' && isFixedPublicHoliday(staff, dateStr)) {
            return `${baseClass} c-k-fixed`;
        }
        return baseClass;
    }

    function escapeAttr(str) {
        return String(str).replace(/"/g, '&quot;');
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatEventNameTwoVerticalCols(name) {
        const normalized = String(name || '').slice(0, 20);
        if (!normalized) return '';
        const col1 = normalized.slice(0, 10);
        const col2 = normalized.slice(10, 20);
        const colStyle = 'writing-mode:vertical-rl;text-orientation:upright;font-size:0.56rem;line-height:0.95;letter-spacing:0;display:block;height:114px;overflow:hidden;';
        const col1Html = `<span class="event-col" style="${colStyle}">${escapeHtml(col1)}</span>`;
        const col2Html = col2 ? `<span class="event-col" style="${colStyle}">${escapeHtml(col2)}</span>` : '<span class="event-col" style="display:block;width:10px;"></span>';
        return `<div class="event-two-col" title="${escapeAttr(normalized)}" style="margin:6px auto 0;display:inline-grid;grid-template-columns:repeat(2, 10px);column-gap:1px;align-items:start;justify-content:center;width:21px;height:116px;overflow:hidden;">${col1Html}${col2Html}</div>`;
    }

    function isWorkValue(val) {
        return /^(?:10|[1-9])$/.test(String(val || ''));
    }

    function isHolidayDateStr(dateStr) {
        return HOLIDAYS_2026.has(dateStr);
    }

    function isWeekendOrHoliday(dateObj, dateStr = formatDateForData(dateObj)) {
        const dayOfWeek = dateObj.getDay();
        return dayOfWeek === 0 || dayOfWeek === 6 || isHolidayDateStr(dateStr);
    }

    function getStaffFairnessGroupKey(staff) {
        if (staff.isIrregular) return 'irregular';
        return staff.isFulltime ? 'fulltime' : 'parttime';
    }

    function getHolidayWorkCountGap(staff, staffStats) {
        const groupKey = getStaffFairnessGroupKey(staff);
        const sameGroup = staffStats.filter(s => getStaffFairnessGroupKey(s) === groupKey && !s.manualOnly);
        if (!sameGroup.length) return 0;
        const minCount = Math.min(...sameGroup.map(s => s.countHolidayWork || 0));
        return (staff.countHolidayWork || 0) - minCount;
    }

    function compareHolidayFairness(a, b, staffStats) {
        const aWork = a.countHolidayWork || 0;
        const bWork = b.countHolidayWork || 0;
        if (aWork !== bWork) return aWork - bWork;

        const aOff = getSpecialOffCount(a);
        const bOff = getSpecialOffCount(b);
        if (aOff !== bOff) return bOff - aOff;

        return randomTieBreak((a.count6 + a.count10) - (b.count6 + b.count10));
    }

    function getSpecialOffCount(staff) {
        return Object.entries(staff.schedule || {}).reduce((sum, [dateStr, val]) => {
            const dateObj = new Date(`${dateStr}T00:00:00`);
            if (!isWeekendOrHoliday(dateObj, dateStr)) return sum;
            return isOffValue(val) ? sum + 1 : sum;
        }, 0);
    }

    function hasFixedOffRequest(staffName, dateStr) {
        return isFixedOffRequestValue(getStaffRequest(staffName, dateStr));
    }

    function rebalanceSpecialDayFairness(staffStats, dates) {
        const dateKeys = dates.map(d => formatDateForData(d));
        const specialDateSet = new Set(
            dateKeys.filter((dateStr, idx) => isWeekendOrHoliday(dates[idx], dateStr))
        );

        for (let pass = 0; pass < 12; pass++) {
            const eligible = staffStats.filter(s => !s.manualOnly);
            const sorted = [...eligible].sort((a, b) => {
                const fairness = compareHolidayFairness(a, b, staffStats);
                if (fairness !== 0) return fairness;
                return randomTieBreak(0);
            });
            if (sorted.length < 2) return;

            const low = sorted[0];
            const high = sorted[sorted.length - 1];
            const workDiff = (high.countHolidayWork || 0) - (low.countHolidayWork || 0);
            if (workDiff <= 1) return;

            let swapped = false;

            for (let specialIdx = 0; specialIdx < dateKeys.length && !swapped; specialIdx++) {
                const specialDateStr = dateKeys[specialIdx];
                if (!specialDateSet.has(specialDateStr)) continue;

                const highVal = high.schedule[specialDateStr] || '';
                const lowVal = low.schedule[specialDateStr] || '';
                if (highVal !== '6') continue;
                if (lowVal !== '' && lowVal !== '公') continue;
                if (high.fixedWorkDates && high.fixedWorkDates.has(specialDateStr)) continue;
                if (low.fixedWorkDates && low.fixedWorkDates.has(specialDateStr)) continue;
                if ((low.fixedPublicDates && low.fixedPublicDates.has(specialDateStr)) || hasFixedOffRequest(low.name, specialDateStr)) continue;
                if (!canAssignWorkOnDate(low, dateKeys, specialIdx)) continue;

                for (let normalIdx = 0; normalIdx < dateKeys.length && !swapped; normalIdx++) {
                    const normalDateStr = dateKeys[normalIdx];
                    if (specialDateSet.has(normalDateStr)) continue;

                    const lowNormalVal = low.schedule[normalDateStr] || '';
                    const highNormalVal = high.schedule[normalDateStr] || '';
                    if (lowNormalVal !== '6') continue;
                    if (highNormalVal !== '' && highNormalVal !== '公') continue;
                    if (low.fixedWorkDates && low.fixedWorkDates.has(normalDateStr)) continue;
                    if (high.fixedWorkDates && high.fixedWorkDates.has(normalDateStr)) continue;
                    if ((high.fixedPublicDates && high.fixedPublicDates.has(normalDateStr)) || hasFixedOffRequest(high.name, normalDateStr)) continue;
                    if (!canAssignWorkOnDate(high, dateKeys, normalIdx)) continue;

                    applyShiftValue(high, specialDateStr, highNormalVal === '公' ? '公' : '', true);
                    applyShiftValue(low, specialDateStr, '6', true);
                    applyShiftValue(low, normalDateStr, lowVal === '公' ? '公' : '', false);
                    applyShiftValue(high, normalDateStr, '6', false);
                    swapped = true;
                }
            }

            if (!swapped) return;
        }
    }

    function compareOneShiftFairness(a, b, staffStats, isSpecialTargetDay) {
        if ((a.count1 || 0) !== (b.count1 || 0)) {
            return (a.count1 || 0) - (b.count1 || 0);
        }
        if (isSpecialTargetDay) {
            const holidayCompare = compareHolidayFairness(a, b, staffStats);
            if (holidayCompare !== 0) return holidayCompare;
        }
        const aTotalWork = (a.count1 || 0) + (a.count6 || 0) + (a.count10 || 0);
        const bTotalWork = (b.count1 || 0) + (b.count6 || 0) + (b.count10 || 0);
        return randomTieBreak(aTotalWork - bTotalWork);
    }

    function canAssignWorkOnDate(staff, dateKeys, targetIdx, options = {}) {
        const targetDateStr = dateKeys[targetIdx];
        const currentVal = staff.schedule[targetDateStr] || '';
        if (!options.ignoreCurrent && isWorkValue(currentVal)) return true;

        const previousDateStr = targetIdx > 0 ? dateKeys[targetIdx - 1] : '';
        if (previousDateStr && (staff.schedule[previousDateStr] || '') === '1') {
            return false;
        }

        let streak = 1;

        for (let i = targetIdx - 1; i >= 0; i--) {
            const val = staff.schedule[dateKeys[i]] || '';
            if (!isWorkValue(val)) break;
            streak++;
        }

        for (let i = targetIdx + 1; i < dateKeys.length; i++) {
            const val = staff.schedule[dateKeys[i]] || '';
            if (!isWorkValue(val)) break;
            streak++;
        }

        return streak <= getMaxConsecutiveWorkDays();
    }

    function getDailyWorkCounts(dates, staffStats) {
        return dates.map(d => {
            const dateStr = formatDateForData(d);
            let count = 0;
            staffStats.forEach(s => {
                const val = s.schedule[dateStr] || '';
                if (isWorkValue(val)) count++;
            });
            return count;
        });
    }

    function getEditableValues(currentVal) {
        const values = SHIFT_TYPES.filter(type => timeSettings[type] && timeSettings[type].enabled);
        values.push('公', '有', '');

        if (currentVal && !values.includes(currentVal)) {
            values.unshift(currentVal);
        }
        return values;
    }

    function getStaffShiftSummary(staff) {
        const counts = {
            publicHoliday: 0,
            paidLeave: 0,
            saturdayOff: 0,
            sundayOff: 0,
            holidayOff: 0
        };

        SHIFT_TYPES.forEach(type => {
            counts[type] = 0;
        });

        Object.entries(staff.schedule || {}).forEach(([dateStr, rawVal]) => {
            const val = String(rawVal || '');
            const dateObj = new Date(`${dateStr}T00:00:00`);
            const dayOfWeek = dateObj.getDay();
            const isHoliday = isHolidayDateStr(dateStr);
            const isOff = val === '公' || val === '有' || val === '有休' || val === '休';
            if (val === '公') {
                counts.publicHoliday += 1;
            } else if (val === '有' || val === '有休' || val === '特' || val === '特休') {
                counts.paidLeave += 1;
            } else if (SHIFT_TYPES.includes(val)) {
                counts[val] += 1;
            }

            if (isOff) {
                if (dayOfWeek === 6) counts.saturdayOff += 1;
                if (dayOfWeek === 0) counts.sundayOff += 1;
                if (isHoliday) counts.holidayOff += 1;
            }
        });

        return counts;
    }

    function buildStaffSummaryTooltipHtml(staff) {
        const counts = getStaffShiftSummary(staff);
        const shiftLabelMap = {
            "1": "①",
            "2": "②",
            "3": "③",
            "4": "④",
            "5": "⑤",
            "6": "⑥",
            "7": "⑦",
            "8": "⑧",
            "9": "⑨",
            "10": "⑩"
        };
        const lines = [
            `公：${counts.publicHoliday}`,
            `有：${counts.paidLeave}`,
            `${shiftLabelMap["1"]}：${counts["1"]}`
        ];

        for (let i = 2; i <= 9; i++) {
            if (counts[String(i)] > 0) {
                lines.push(`${shiftLabelMap[String(i)]}：${counts[String(i)]}`);
            }
        }

        lines.push(`${shiftLabelMap["10"]}：${counts["10"]}`);
        lines.push(`土休：${counts.saturdayOff}`);
        lines.push(`日休：${counts.sundayOff}`);
        lines.push(`祝休：${counts.holidayOff}`);
        lines.push('黒文字の公：希望休');

        return lines.map(line => `<div>${escapeHtml(line)}</div>`).join('');
    }

    function buildAllStaffSummaryTooltipHtml(staffStats) {
        const rows = staffStats.map(staff => {
            const counts = getStaffShiftSummary(staff);
            const workTotal = SHIFT_TYPES.reduce((sum, type) => sum + (counts[type] || 0), 0);
            const total = workTotal + (counts.publicHoliday || 0) + (counts.paidLeave || 0);

            return `
                <tr>
                    <td>${escapeHtml(staff.name)}</td>
                    <td>${workTotal}</td>
                    <td>${counts.publicHoliday || 0}</td>
                    <td>${counts["1"] || 0}</td>
                    <td>${counts["6"] || 0}</td>
                    <td>${counts["10"] || 0}</td>
                    <td>${counts.paidLeave || 0}</td>
                    <td>${total}</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="all-summary-title">スタッフ別集計</div>
            <div class="all-summary-legend">黒文字の公 = 希望休</div>
            <div class="all-summary-table-wrap">
                <table class="all-summary-table">
                    <thead>
                        <tr><th>スタッフ名</th><th>勤務数</th><th>公休数</th><th>1</th><th>6</th><th>10</th><th>特</th><th>合計</th></tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    function renderSummaryPanel(staffStats) {
        const html = staffStats && staffStats.length
            ? buildAllStaffSummaryTooltipHtml(staffStats)
            : '<div class="summary-empty">集計するシフトがありません。</div>';
        if (summaryTableContainer) summaryTableContainer.innerHTML = html;
        if (summaryPrintTableContainer) summaryPrintTableContainer.innerHTML = html;
    }

    function applyCellValue(td, nextVal) {
        const valueEl = td.querySelector('.cell-value');
        if (valueEl) {
            valueEl.textContent = nextVal;
        } else {
            td.textContent = nextVal;
        }
        td.className = 'cell';
        const cls = getCellClassByValue(nextVal);
        if (cls) td.classList.add(cls);
    }

    function updateStaffSummaryTooltipForRow(row, staff) {
        renderSummaryPanel(lastGeneratedStaffStats);
    }

    function handleShiftCellClick(e) {
        const td = e.target.closest('td.cell[data-name][data-date]');
        if (!td || lastGeneratedStaffStats.length === 0) return;

        const staffName = td.dataset.name;
        const dateStr = td.dataset.date;
        const target = lastGeneratedStaffStats.find(s => s.name === staffName);
        if (!target) return;

        const currentVal = target.schedule[dateStr] || '';
        const editableValues = getEditableValues(currentVal);
        const currentIdx = editableValues.indexOf(currentVal);
        const nextVal = editableValues[(currentIdx + 1) % editableValues.length];

        const dateObj = lastGeneratedDates.find(d => formatDateForData(d) === dateStr);
        applyShiftValue(target, dateStr, nextVal, dateObj ? isWeekendOrHoliday(dateObj, dateStr) : false);

        applyCellValue(td, nextVal);
        updateStaffSummaryTooltipForRow(td.closest('tr'), target);
        updateDailyTotalRow();
    }

    function updateDailyTotalRow() {
        const totalCells = tableContainer.querySelectorAll('.daily-total-row .daily-total-cell');
        if (!totalCells.length || !lastGeneratedDates.length || !lastGeneratedStaffStats.length) return;

        const counts = getDailyWorkCounts(lastGeneratedDates, lastGeneratedStaffStats);
        totalCells.forEach((cell, idx) => {
            cell.textContent = `${counts[idx] || 0}`;
        });
    }

    function renderShiftTable(dates, staffStats) {
        let monthRow = `<tr class="month-top-row"><th class="sticky-col month-top-sticky"></th>`;
        let dayRow = `<tr class="day-header-row"><th class="sticky-col">名前</th>`;
        dates.forEach((d, index) => {
            const dayOfWeek = d.getDay();
            let dayClass = '';
            if (dayOfWeek === 0) dayClass = 'day-sun';
            if (dayOfWeek === 6) dayClass = 'day-sat';

            const dateStr = formatDateForData(d);
            if (isHolidayDateStr(dateStr)) dayClass += `${dayClass ? ' ' : ''}day-holiday`;
            const eventName = (eventData[dateStr] && eventData[dateStr].eventName) || '';
            const eventHtml = eventName ? formatEventNameTwoVerticalCols(eventName) : '';
            const prevDate = index > 0 ? dates[index - 1] : null;
            const isMonthChanged = !prevDate || d.getMonth() !== prevDate.getMonth() || d.getFullYear() !== prevDate.getFullYear();
            const monthMarker = isMonthChanged ? `${d.getMonth() + 1}月` : '';

            monthRow += `<th class="${dayClass} month-top-day">${monthMarker}</th>`;
            dayRow += `<th class="${dayClass} shift-day-th" style="vertical-align: top; padding-top: 0.5rem;">
                <div class="date-label">${d.getDate()}</div>
                ${eventHtml}
            </th>`;
        });
        monthRow += '</tr>';
        dayRow += '</tr>';
        const thead = `<thead>${monthRow}${dayRow}</thead>`;

        let tbody = '<tbody>';

        const ftCoreGroup = staffStats.filter(s => s.isFulltime && isFulltimeCoreStaff(s));
        const ftGroup = staffStats.filter(s => s.isFulltime && !isFulltimeCoreStaff(s));
        const ptGroup = staffStats.filter(s => !s.isFulltime && !s.isIrregular);
        const irGroup = staffStats.filter(s => s.isIrregular);

        function makeRows(group) {
            group.forEach(s => {
                const displayName = s.name;
                tbody += `<tr class="staff-shift-row"><td class="sticky-col">${escapeHtml(displayName)}</td>`;
                dates.forEach(d => {
                    const dateStr = formatDateForData(d);
                    const rawVal = s.schedule[dateStr] || '';
                    const val = rawVal === '休' ? '有' : rawVal;
                    const cls = getCellClassForStaffDate(s, dateStr, val);

                    // In print, colors are handled well by browsers if styled nicely, or we just rely on text.
                    tbody += `<td class="cell ${cls}" data-name="${escapeAttr(s.name)}" data-date="${dateStr}"><span class="cell-value">${escapeHtml(val)}</span></td>`;
                });
                tbody += `</tr>`;
            });
        }

        makeRows(ftCoreGroup);
        makeRows(ftGroup);
        makeRows(ptGroup);
        makeRows(irGroup);

        const dailyCounts = getDailyWorkCounts(dates, staffStats);
        tbody += `<tr class="daily-total-row"><td class="sticky-col">合計人数</td>`;
        dailyCounts.forEach(count => {
            tbody += `<td class="daily-total-cell">${count}</td>`;
        });
        tbody += `</tr>`;

        const shiftTimeText = getEnabledShiftTimeText();
        tbody += `<tr class="shift-time-row"><td class="sticky-col">時間帯</td><td class="shift-time-cell" colspan="${dates.length}">${shiftTimeText}</td></tr>`;

        tbody += '</tbody>';
        tableContainer.innerHTML = thead + tbody;
    }

    function showToast(message) {
        const toastMessage = document.getElementById('toast-message');
        if (toastMessage) toastMessage.textContent = message;
        toast.classList.remove('hidden');
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, 3000);
    }

});
