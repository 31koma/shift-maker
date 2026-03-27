document.addEventListener('DOMContentLoaded', () => {
    const SHIFT_TYPES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
    const MAX_PUBLIC_HOLIDAYS = 8;
    const MAX_CONSECUTIVE_WORK_DAYS = 3;
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
        fillOffAsKoukyu: false
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
    const savedResultsModal = document.getElementById('saved-results-modal');
    const closeSavedResultsBtn = document.getElementById('close-saved-results');
    const closeSavedResultsFooterBtn = document.getElementById('close-saved-results-footer');
    const savedResultsList = document.getElementById('saved-results-list');

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
            ...sourceStaffData.fulltime.filter(s => s.checked).map(s => ({ name: s.name, isFulltime: true, isIrregular: false, manualOnly: false, canWorkOneShift: !!s.canWorkOneShift, pubHolidays: Math.max(0, Math.min(MAX_PUBLIC_HOLIDAYS, parseInt(s.pubHolidays, 10) || 8)) })),
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
        setChecked('rule-fill-off-k', generateRules.fillOffAsKoukyu);
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
            fillOffAsKoukyu: getChk('rule-fill-off-k', generateRules.fillOffAsKoukyu)
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
                staffStats: deepCloneJson(lastGeneratedStaffStats),
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
        shiftContainer.style.display = 'block';
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
            `・未割当: ${generateRules.fillOffAsKoukyu ? '⑥で埋める' : '空欄のまま'}（必要に応じて6/10で補完）`,
            '・最終調整: 人数が少ない日を再配分して下振れを抑制し、土日祝の勤務/休み回数差もできるだけ均等化。3連勤の翌日は必ず公休'
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
        shiftContainer.style.display = 'none'; // hide until generated
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
            window.print(); // Uses browser print dialogue which includes PDF export functionality
        });
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

    function applyPublicHolidayPattern(staffStats, dates) {
        const dateKeys = dates.map(d => formatDateForData(d));

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
                if (v === '1' || v === '10') return;
                candidateIdx.push(idx);
            });

            function getPublicSpreadScore(idx) {
                if (!selected.size) return 999;

                let minDistance = 999;
                selected.forEach(selectedIdx => {
                    minDistance = Math.min(minDistance, Math.abs(selectedIdx - idx));
                });

                const prevSelected = selected.has(idx - 1) ? 1 : 0;
                const nextSelected = selected.has(idx + 1) ? 1 : 0;
                const adjacencyPenalty = (prevSelected + nextSelected) * 100;
                return minDistance - adjacencyPenalty;
            }

            const restCandidates = [...candidateIdx];
            while (selected.size < targetPublic && restCandidates.length > 0) {
                const selectable = restCandidates
                    .filter(idx => !selected.has(idx))
                    .filter(idx => canPlacePublicWithoutOver3(selected, idx, dateKeys.length))
                    .sort((a, b) => randomTieBreak(getPublicSpreadScore(b) - getPublicSpreadScore(a)));

                if (!selectable.length) break;
                selected.add(selectable[0]);
            }

            restCandidates.forEach(idx => {
                if (selected.size >= targetPublic) return;
                if (selected.has(idx)) return;
                if (!canPlacePublicWithoutOver3(selected, idx, dateKeys.length)) return;
                selected.add(idx);
            });

            if (selected.size < targetPublic) {
                restCandidates.forEach(idx => {
                    if (selected.size >= targetPublic) return;
                    if (!selected.has(idx)) selected.add(idx);
                });
            }

            dateKeys.forEach((dateStr, idx) => {
                const v = s.schedule[dateStr] || '';
                if (v === '休' || v === '有休' || v === '有' || v === '特休' || v === '特') return;
                if (s.fixedPublicDates && s.fixedPublicDates.has(dateStr)) {
                    s.schedule[dateStr] = '公';
                    return;
                }

                if (selected.has(idx)) {
                    s.schedule[dateStr] = '公';
                } else if (v === '公') {
                    s.schedule[dateStr] = '6';
                }
            });
        });
    }

    function getGeneratedPublicReplacementValue(staff, dateObj) {
        if (timeSettings["6"] && timeSettings["6"].enabled) return '6';
        if (timeSettings["10"] && timeSettings["10"].enabled) return '10';
        if (timeSettings["1"] && timeSettings["1"].enabled && staff.canWorkOneShift) return '1';
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

        staffStats.forEach(staff => {
            if (staff.manualOnly) return;

            for (let idx = 0; idx < dateKeys.length - 3; idx++) {
                const a = staff.schedule[dateKeys[idx]] || '';
                const b = staff.schedule[dateKeys[idx + 1]] || '';
                const c = staff.schedule[dateKeys[idx + 2]] || '';
                if (!isWorkValue(a) || !isWorkValue(b) || !isWorkValue(c)) continue;

                const nextIdx = idx + 3;
                const nextDateStr = dateKeys[nextIdx];
                const nextVal = staff.schedule[nextDateStr] || '';
                if (!isWorkValue(nextVal)) continue;

                staff.fixedPublicDates.add(nextDateStr);
                applyShiftValue(staff, nextDateStr, '公', isWeekendOrHoliday(dates[nextIdx], nextDateStr));
            }
        });
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
                    s.schedule[dateKeys[i]] = '10';
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

    function fillBlankWithWorkCodes(staffStats, dates) {
        const use10 = !!(timeSettings["10"] && timeSettings["10"].enabled);
        const use6 = !!(timeSettings["6"] && timeSettings["6"].enabled);
        if (!use10 && !use6) return;

        const dateKeys = dates.map(d => formatDateForData(d));
        dateKeys.forEach((dateStr, idx) => {
            const isSpecialTargetDay = isWeekendOrHoliday(dates[idx], dateStr);

            staffStats.forEach(s => {
                if (s.manualOnly) return;
                const currentVal = s.schedule[dateStr] || '';
                if (currentVal !== '') return;
                if (!canAssignWorkOnDate(s, dateKeys, idx)) return;

                // 「未割当は⑥で埋める」がONなら、空欄補完は⑥固定にする。
                let nextVal = '';
                if (generateRules.fillOffAsKoukyu && use6) {
                    nextVal = '6';
                } else if (use10 && use6) {
                    nextVal = s.count10 <= s.count6 ? '10' : '6';
                } else if (use10) {
                    nextVal = '10';
                } else {
                    nextVal = '6';
                }

                s.schedule[dateStr] = nextVal;
                if (nextVal === '10') s.count10++;
                if (nextVal === '6') s.count6++;
                if (isSpecialTargetDay) {
                    s.countWeekend++;
                    s.countHolidayWork++;
                }
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
        for (let pass = 0; pass < 4; pass++) {
            let movedInThisPass = false;

            dateKeys.forEach((dateStr, idx) => {
                const minNeed = dailyMinimumByDate[dateStr] || 0;
                let current = dailyCountMap[dateStr] || 0;
                if (current >= minNeed) return;

                const isSpecialTargetDay = isWeekendOrHoliday(dates[idx], dateStr);
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
            });

            if (!movedInThisPass) break;
        }
    }

    function enforceBusyDayHigherThanNormal(staffStats, dates, busyDayByDate) {
        const dateKeys = dates.map(d => formatDateForData(d));
        if (!dateKeys.length) return;

        function getDailyCount(dateStr) {
            let count = 0;
            staffStats.forEach(s => {
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
        if (oldVal === newVal) return;

        if (oldVal === '1') staff.count1--;
        if (oldVal === '6') staff.count6--;
        if (oldVal === '10') staff.count10--;
        if (isSpecialTargetDay && isWorkValue(oldVal)) {
            staff.countWeekend--;
            staff.countHolidayWork--;
        }

        if (newVal === '1') staff.count1++;
        if (newVal === '6') staff.count6++;
        if (newVal === '10') staff.count10++;
        if (isSpecialTargetDay && isWorkValue(newVal)) {
            staff.countWeekend++;
            staff.countHolidayWork++;
        }

        staff.schedule[dateStr] = newVal;
    }

    function assignOneShiftWithForcedRest(staff, dates, dateKeys, idx) {
        const dateStr = dateKeys[idx];
        applyShiftValue(staff, dateStr, '1', isWeekendOrHoliday(dates[idx], dateStr));

        const nextIdx = idx + 1;
        if (nextIdx < dateKeys.length) {
            const nextDateStr = dateKeys[nextIdx];
            staff.fixedPublicDates.add(nextDateStr);
            applyShiftValue(staff, nextDateStr, '公', isWeekendOrHoliday(dates[nextIdx], nextDateStr));
        }
    }

    function ensureOneShiftParticipation(staffStats, dates) {
        const dateKeys = dates.map(d => formatDateForData(d));

        function hasBlockingRequest(staffName, dateStr) {
            const req = (requestData[dateStr] && requestData[dateStr][staffName]) || '';
            return req === '10' || req === '1';
        }

        function canPlaceOneOnDate(staff, idx) {
            const dateStr = dateKeys[idx];
            const currentVal = staff.schedule[dateStr] || '';
            if (currentVal === '10') return false;
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
            .filter(s => !s.manualOnly && s.canWorkOneShift)
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
            .filter(s => !s.manualOnly && s.canWorkOneShift)
            .sort((a, b) => compareOneShiftFairness(a, b, staffStats, false))[0];

        if (!fallbackStaff) return;

        const fallbackCandidate = findOneShiftCandidate(fallbackStaff) || findFallbackOneShiftCandidate(fallbackStaff);
        if (!fallbackCandidate) {
            const absoluteFallbackStaff = staffStats
                .filter(s => !s.manualOnly && s.canWorkOneShift)
                .sort((a, b) => compareOneShiftFairness(a, b, staffStats, false))[0];

            if (!absoluteFallbackStaff) return;

            const absoluteFallbackIdx = dateKeys.findIndex((dateStr, idx) => {
                const req = (requestData[dateStr] && requestData[dateStr][absoluteFallbackStaff.name]) || '';
                if (req === '休' || req === '有休' || req === '有' || req === '特休' || req === '特') return false;
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
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
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
                        return v !== '10' && v !== '1' && !isOff(v) && canAssignWorkOnDate(s, dateKeys, idx);
                    })
                    .sort((a, b) => {
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
                            return v !== '10' && v !== '1' && !isOff(v) && canAssignWorkOnDate(s, dateKeys, idx);
                        })
                        .sort((a, b) => a.count10 - b.count10);
                    if (ftCandidates.length > 0) {
                        applyShiftValue(ftCandidates[0], dateStr, '10', isWeekend);
                        tenMembers = eligible.filter(s => (s.schedule[dateStr] || '') === '10');
                        if (tenMembers.length > target10) {
                            const removePt = tenMembers.filter(s => !s.isFulltime).sort((a, b) => b.count10 - a.count10);
                            if (removePt.length > 0) {
                                applyShiftValue(removePt[0], dateStr, (timeSettings["6"] && timeSettings["6"].enabled) ? '6' : '', isWeekend);
                            }
                        }
                    }
                }
            }
        });
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
            isIrregular: s.isIrregular,
            manualOnly: !!s.manualOnly,
            canWorkOneShift: !!s.canWorkOneShift,
            pubHolidays: s.pubHolidays,
            fixedPublicDates: new Set(),
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
                    s.schedule[dateStr] = '';
                    return;
                }
                const req = (requestData[dateStr] && requestData[dateStr][s.name]) || '';
                if (req === '休' || req === '有休' || req === '有' || req === '特休' || req === '特') {
                    if (req === '休') {
                        // 休み希望は自動生成時に公休として反映し、固定する
                        s.schedule[dateStr] = '公';
                        s.fixedPublicDates.add(dateStr);
                    } else if (req === '特休' || req === '特') {
                        s.schedule[dateStr] = '特';
                    } else {
                        s.schedule[dateStr] = '有';
                    }
                    s.countHoliday++;
                } else if (req === '10' && timeSettings["10"].enabled) {
                    if (getYesterdayShift(s, d) === '1') {
                        s.schedule[dateStr] = '公';
                        s.fixedPublicDates.add(dateStr);
                        s.countHoliday++;
                    } else {
                        s.schedule[dateStr] = '10';
                        s.count10++;
                        if (isSpecialTargetDay) {
                            s.countWeekend++;
                            s.countHolidayWork++;
                        }
                        req10_remaining--;
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
                    if (!s.canWorkOneShift) return false;
                    if (generateRules.oneNoAfterTen && getYesterdayShift(s, d) === '10') return false;
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
                    return s.isFulltime && !s.isIrregular && currentWorkDays < targetWorkDays && canAssignWorkOnDate(s, dateKeys, dateIdx);
                });
                candidates10_ft.sort((a, b) => randomTieBreak((a.count1 + a.count10) - (b.count1 + b.count10)));
                if (isSpecialTargetDay) {
                    candidates10_ft.sort((a, b) => {
                        const fairnessCompare = compareHolidayFairness(a, b, staffStats);
                        if (fairnessCompare !== 0) return fairnessCompare;
                        return randomTieBreak((a.count1 + a.count10) - (b.count1 + b.count10));
                    });
                }

                if (generateRules.requireFulltimeOn10 && !alreadyHasFtOn10 && candidates10_ft.length > 0) {
                    const ft = candidates10_ft[0];
                    ft.schedule[dateStr] = '10';
                    ft.count10++;
                    if (isSpecialTargetDay) {
                        ft.countWeekend++;
                        ft.countHolidayWork++;
                    }
                    removeFromAvailable(available, ft);
                    req10_remaining--;
                }

                // Pick remaining ⑩ from ALL staff (non-irregular)
                let candidates10_all = available.filter(s => {
                    const totalDays = dates.length;
                    const targetWorkDays = totalDays - s.pubHolidays;
                    const currentWorkDays = s.count1 + s.count10 + s.count6;
                    return !s.isIrregular && currentWorkDays < targetWorkDays && canAssignWorkOnDate(s, dateKeys, dateIdx);
                });
                candidates10_all.sort((a, b) => randomTieBreak((a.count1 + a.count10) - (b.count1 + b.count10)));
                if (isSpecialTargetDay) {
                    candidates10_all.sort((a, b) => {
                        const fairnessCompare = compareHolidayFairness(a, b, staffStats);
                        if (fairnessCompare !== 0) return fairnessCompare;
                        return randomTieBreak((a.count1 + a.count10) - (b.count1 + b.count10));
                    });
                }

                const assigned10_rest = candidates10_all.slice(0, req10_remaining);
                assigned10_rest.forEach(s => {
                    s.schedule[dateStr] = '10';
                    s.count10++;
                    if (isSpecialTargetDay) {
                        s.countWeekend++;
                        s.countHolidayWork++;
                    }
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
                    const val = s.schedule[dateStr] || '';
                    return acc + (isWorkValue(val) ? 1 : 0);
                }, 0);
                const req6 = Math.max(0, softTargetTotal - alreadyAssignedWork);
                const assigned6 = candidates6.slice(0, req6);
                assigned6.forEach(s => {
                    s.schedule[dateStr] = '6';
                    s.count6++;
                    if (isSpecialTargetDay) {
                        s.countWeekend++;
                        s.countHolidayWork++;
                    }
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
                    s.schedule[dateStr] = '6';
                    s.count6++;
                    if (isSpecialTargetDay) {
                        s.countWeekend++;
                        s.countHolidayWork++;
                    }
                    removeFromAvailable(available, s);
                });
            }

            // 4. Mark rest as 公休
            available.forEach(s => {
                if (s.manualOnly) {
                    s.schedule[dateStr] = '';
                    return;
                }
                if (generateRules.fillOffAsKoukyu) {
                    if (timeSettings["6"] && timeSettings["6"].enabled && canAssignWorkOnDate(s, dateKeys, dateIdx)) {
                        s.schedule[dateStr] = '6';
                        s.count6++;
                        if (isSpecialTargetDay) {
                            s.countWeekend++;
                            s.countHolidayWork++;
                        }
                    } else {
                        s.schedule[dateStr] = '';
                    }
                } else {
                    s.schedule[dateStr] = '';
                }
            });

        });

        // 最終補正1: 公休(公)は設定値に合わせ、3連休を避けるよう補正
        applyPublicHolidayPattern(staffStats, dates);

        // 最終的に残る空欄は、時間設定でONの勤務コード(6/10)で埋める
        fillBlankWithWorkCodes(staffStats, dates);

        // 最終補正2: 6/10 が4連続以上続かないようにほぐす（3連続は許容）
        normalizeWorkPattern(staffStats, dates);
        // 最終補正2.5: イレギュラーは6専用（10/1を除去）
        enforceIrregularShiftRules(staffStats, dates);
        // 最終補正2.8: 日別人数の下振れを再配分で補正（1桁人数を出しにくくする）
        rebalanceDailyMinimums(staffStats, dates, dailyMinimumByDate);
        // 最終補正2.9: 人数多めチェック日の人数が通常日より下回りにくいように再配分
        enforceBusyDayHigherThanNormal(staffStats, dates, busyDayByDate);
        // 最終補正3: ⑩を毎日3人体制 + 正社員最低1人に合わせる
        enforceDailyTenAssignments(staffStats, dates);
        // 最終補正4: ①参加ONのスタッフには月内で最低1回①を入れる
        ensureOneShiftParticipation(staffStats, dates);
        // 最終補正5: 土日祝勤務/休みの偏りを6勤務の持ち替えでできるだけ均等化
        rebalanceSpecialDayFairness(staffStats, dates);
        // 最終補正6: 自動生成された公休は最大2連休までに制限
        enforceMaxTwoConsecutiveGeneratedPublicHolidays(staffStats, dates);
        // 最終補正7: 3連勤した翌日は必ず公休にして4連勤を防止
        enforceRestAfterThreeConsecutiveWorkdays(staffStats, dates);

        lastGeneratedDates = dates;
        lastGeneratedStaffStats = staffStats;
        renderShiftTable(lastGeneratedDates, lastGeneratedStaffStats);
        shiftContainer.style.display = 'block';
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
        const req = (requestData[dateStr] && requestData[dateStr][staffName]) || '';
        return req === '休' || req === '有' || req === '有休' || req === '特' || req === '特休';
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
                if ((low.fixedPublicDates && low.fixedPublicDates.has(specialDateStr)) || hasFixedOffRequest(low.name, specialDateStr)) continue;
                if (!canAssignWorkOnDate(low, dateKeys, specialIdx)) continue;

                for (let normalIdx = 0; normalIdx < dateKeys.length && !swapped; normalIdx++) {
                    const normalDateStr = dateKeys[normalIdx];
                    if (specialDateSet.has(normalDateStr)) continue;

                    const lowNormalVal = low.schedule[normalDateStr] || '';
                    const highNormalVal = high.schedule[normalDateStr] || '';
                    if (lowNormalVal !== '6') continue;
                    if (highNormalVal !== '' && highNormalVal !== '公') continue;
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

    function canAssignWorkOnDate(staff, dateKeys, targetIdx) {
        const targetDateStr = dateKeys[targetIdx];
        const currentVal = staff.schedule[targetDateStr] || '';
        if (isWorkValue(currentVal)) return true;

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

        return streak <= MAX_CONSECUTIVE_WORK_DAYS;
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

        return lines.map(line => `<div>${escapeHtml(line)}</div>`).join('');
    }

    function applyCellValue(td, nextVal) {
        td.textContent = nextVal;
        td.className = 'cell';
        const cls = getCellClassByValue(nextVal);
        if (cls) td.classList.add(cls);
    }

    function updateStaffSummaryTooltipForRow(row, staff) {
        if (!row || !staff) return;
        const tooltip = row.querySelector('.staff-summary-tooltip');
        if (!tooltip) return;
        tooltip.innerHTML = buildStaffSummaryTooltipHtml(staff);
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

        if (nextVal === '') {
            delete target.schedule[dateStr];
        } else {
            target.schedule[dateStr] = nextVal;
        }

        applyCellValue(td, nextVal);
        updateStaffSummaryTooltipForRow(td.closest('tr'), target);
        updateDailyTotalRow();
        showToast('セルを変更しました');
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

        const ftGroup = staffStats.filter(s => s.isFulltime);
        const ptGroup = staffStats.filter(s => !s.isFulltime && !s.isIrregular);
        const irGroup = staffStats.filter(s => s.isIrregular);

        function makeRows(group) {
            group.forEach(s => {
                const displayName = s.name;
                const summaryTooltipHtml = buildStaffSummaryTooltipHtml(s);
                tbody += `<tr><td class="sticky-col staff-summary-cell"><span class="staff-summary-trigger">${escapeHtml(displayName)}</span><div class="staff-summary-tooltip">${summaryTooltipHtml}</div></td>`;
                dates.forEach(d => {
                    const dateStr = formatDateForData(d);
                    const rawVal = s.schedule[dateStr] || '';
                    const val = rawVal === '休' ? '有' : rawVal;
                    const cls = getCellClassByValue(val);

                    // In print, colors are handled well by browsers if styled nicely, or we just rely on text.
                    tbody += `<td class="cell ${cls}" data-name="${escapeAttr(s.name)}" data-date="${dateStr}">${val}</td>`;
                });
                tbody += `</tr>`;
            });
        }

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
