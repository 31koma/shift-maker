document.addEventListener('DOMContentLoaded', () => {
    // 共通設定（config.js）から読む。取得できない場合だけ従来値を使う。
    const MAX_PUBLIC_HOLIDAYS = (window.SHIFT_CONFIG && window.SHIFT_CONFIG.MAX_PUBLIC_HOLIDAYS) || 8;
    const FULLTIME_CORE_NAMES = new Set(["梶本", "田渕", "田淵", "北窪", "八田"]);
    const SEED_BIRTHDAYS = (window.SHIFT_CONFIG && window.SHIFT_CONFIG.STAFF_BIRTHDAYS) || {};

    // 誕生日は年を持たない "MM-DD" で保存する。
    // 入力欄には「5/24」のように打てるようにして、保存時にここで整える。
    // 受け付ける形: 5/24, 05/24, 5-24, 05-24, 0524, 524, 5月24日
    function normalizeBirthday(raw) {
        if (raw === undefined || raw === null) return '';
        const text = String(raw).trim();
        if (!text) return '';

        let month = null;
        let day = null;

        const separated = text.match(/^(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})\s*日?$/);
        if (separated) {
            month = parseInt(separated[1], 10);
            day = parseInt(separated[2], 10);
        } else if (/^\d{4}$/.test(text)) {
            month = parseInt(text.slice(0, 2), 10);
            day = parseInt(text.slice(2), 10);
        } else if (/^\d{3}$/.test(text)) {
            month = parseInt(text.slice(0, 1), 10);
            day = parseInt(text.slice(1), 10);
        } else {
            return '';
        }

        if (!(month >= 1 && month <= 12)) return '';
        // 2/29 を許すため、うるう年のある2月は29日まで受け付ける
        const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
        if (!(day >= 1 && day <= maxDay)) return '';

        return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    // "05-24" → "5/24"（入力欄に出す用）
    function formatBirthdayForInput(value) {
        const normalized = normalizeBirthday(value);
        if (!normalized) return '';
        return `${parseInt(normalized.slice(0, 2), 10)}/${parseInt(normalized.slice(3), 10)}`;
    }
    // 新規インストール時の初期値。既存の localStorage があるときは使われない。
    // 岡本春さん・澤田さんは 2026-07 時点で退職済みのため入れていない。
    const defaultStaff = {
        fulltime: [
            { name: "梶本", checked: true, pubHolidays: 8, canWorkOneShift: true, isFulltimeCore: true, birthday: "05-24" },
            { name: "田渕", checked: true, pubHolidays: 8, canWorkOneShift: true, isFulltimeCore: true, birthday: "12-14" },
            { name: "北窪", checked: true, pubHolidays: 7, canWorkOneShift: true, isFulltimeCore: true, birthday: "03-22" },
            { name: "八田", checked: true, pubHolidays: 8, canWorkOneShift: true, isFulltimeCore: true, birthday: "09-11" },
            { name: "石川", checked: true, pubHolidays: 8, canWorkOneShift: true, birthday: "06-10" },
            { name: "岩田泰", checked: true, pubHolidays: 8, canWorkOneShift: true, birthday: "03-25" },
            { name: "岸本", checked: true, pubHolidays: 8, canWorkOneShift: true, birthday: "09-05" },
            { name: "中川", checked: true, pubHolidays: 8, canWorkOneShift: true, birthday: "11-12" },
            { name: "清水", checked: true, pubHolidays: 8, canWorkOneShift: true, birthday: "06-10" },
            { name: "柿林", checked: true, pubHolidays: 8, canWorkOneShift: true, birthday: "08-08" }
        ],
        parttime: [
            { name: "竹田", checked: true, pubHolidays: 8, canWorkOneShift: false, birthday: "08-12" },
            { name: "岩田美", checked: true, pubHolidays: 8, canWorkOneShift: true, birthday: "06-28" },
            { name: "岡本梨", checked: true, pubHolidays: 8, canWorkOneShift: true, birthday: "12-15" },
            { name: "岡崎", checked: true, pubHolidays: 8, canWorkOneShift: false, birthday: "04-01" },
            { name: "大野", checked: true, pubHolidays: 8, canWorkOneShift: false, birthday: "07-19" }
        ],
        irregular: [
            { name: "太田", checked: true, pubHolidays: 8, canWorkOneShift: false, birthday: "07-29" },
            // 中西さんは誕生日休の対象外（お客さん確認済み）
            { name: "中西", checked: true, pubHolidays: 8, canWorkOneShift: false, birthday: "" }
        ]
    };

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

    function normalizeFulltimeCoreFlags() {
        let changed = false;
        staffData.fulltime.forEach(staff => {
            const shouldBeCore = FULLTIME_CORE_NAMES.has(staff.name) || !!staff.isFulltimeCore;
            if (!!staff.isFulltimeCore !== shouldBeCore) {
                staff.isFulltimeCore = shouldBeCore;
                changed = true;
            }
        });
        staffData.fulltime.sort((a, b) => {
            const coreCompare = Number(isFulltimeCoreStaff(b)) - Number(isFulltimeCoreStaff(a));
            return coreCompare;
        });
        return changed;
    }

    let staffData = JSON.parse(localStorage.getItem('shiftApp_staffData'));
    if (!staffData || !staffData.fulltime || !staffData.parttime) {
        staffData = defaultStaff;
        normalizeFulltimeCoreFlags();
    } else {
        if (!staffData.irregular) {
            staffData.irregular = [];
        }
        // 移行処理（以前パートとして保存されたデータを正社員に移動）
        const promoteNames = ["岸本", "中川", "清水", "柿林"];
        let migrated = false;
        promoteNames.forEach(name => {
            const ptIdx = staffData.parttime.findIndex(p => p.name === name);
            if (ptIdx > -1) {
                const staffObj = staffData.parttime.splice(ptIdx, 1)[0];
                if (!staffData.fulltime.some(f => f.name === name)) {
                    staffData.fulltime.push(staffObj);
                    migrated = true;
                }
            }
        });
        const promoteToIrreg = ["太田", "中西"];
        promoteToIrreg.forEach(name => {
            const ptIdx = staffData.parttime.findIndex(p => p.name === name);
            if (ptIdx > -1) {
                const staffObj = staffData.parttime.splice(ptIdx, 1)[0];
                if (!staffData.irregular.some(f => f.name === name)) {
                    staffData.irregular.push(staffObj);
                    migrated = true;
                }
            }
        });
        const demoteToParttime = ["岩田美"];
        demoteToParttime.forEach(name => {
            const ftIdx = staffData.fulltime.findIndex(f => f.name === name);
            if (ftIdx > -1) {
                const staffObj = staffData.fulltime.splice(ftIdx, 1)[0];
                staffObj.canWorkOneShift = false;
                if (!staffData.parttime.some(p => p.name === name)) {
                    staffData.parttime.push(staffObj);
                }
                migrated = true;
            }
        });
        if (moveStaffAfter(staffData.parttime, "岩田美", "竹田")) {
            migrated = true;
        }
        if (normalizeFulltimeCoreFlags()) {
            migrated = true;
        }

        // データ統合（既存データにpubHolidaysがない場合はデフォルト8を設定）
        let normalizedChanged = false;
        const all = [...staffData.fulltime, ...staffData.parttime, ...staffData.irregular];
        all.forEach(s => {
            if (s.pubHolidays === undefined) {
                s.pubHolidays = MAX_PUBLIC_HOLIDAYS;
                normalizedChanged = true;
            } else {
                const n = parseInt(s.pubHolidays, 10);
                const normalized = Math.max(0, Math.min(MAX_PUBLIC_HOLIDAYS, isNaN(n) ? MAX_PUBLIC_HOLIDAYS : n));
                if (normalized !== s.pubHolidays) normalizedChanged = true;
                s.pubHolidays = normalized;
            }
        });
        all.forEach(s => {
            if (s.canWorkOneShift === undefined) {
                s.canWorkOneShift = staffData.fulltime.includes(s);
                normalizedChanged = true;
            }
        });

        // 誕生日の取り込み。
        // すでに入っている人は絶対に上書きしない（お客さんが直した値を消さないため）。
        // 未入力の人にだけ config.js の初期値を入れる。
        all.forEach(s => {
            const current = normalizeBirthday(s.birthday);
            if (current) {
                if (current !== s.birthday) {
                    s.birthday = current;
                    normalizedChanged = true;
                }
                return;
            }
            const seed = normalizeBirthday(SEED_BIRTHDAYS[s.name]);
            if (seed) {
                s.birthday = seed;
                normalizedChanged = true;
            } else if (s.birthday === undefined) {
                s.birthday = '';
                normalizedChanged = true;
            }
        });

        if (migrated || normalizedChanged) {
            localStorage.setItem('shiftApp_staffData', JSON.stringify(staffData));
        }
    }



    const ftCoreList = document.getElementById('fulltime-core-list');
    const ftList = document.getElementById('fulltime-list');
    const ptList = document.getElementById('parttime-list');
    const irList = document.getElementById('irregular-list');
    const toast = document.getElementById('toast');

    function renderStaff() {
        renderGroup(ftCoreList, staffData.fulltime.filter(isFulltimeCoreStaff), 'fulltimeCore', staffData.fulltime);
        renderGroup(ftList, staffData.fulltime.filter(s => !isFulltimeCoreStaff(s)), 'fulltime', staffData.fulltime);
        renderGroup(ptList, staffData.parttime, 'parttime');
        renderGroup(irList, staffData.irregular, 'irregular');
    }

    function renderGroup(container, list, groupName, sourceList = list) {
        container.innerHTML = '';
        list.forEach((staff, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = `staff-item ${staff.checked ? 'checked' : ''}`;

            const label = document.createElement('label');
            label.className = 'staff-main-label';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'staff-checkbox';
            checkbox.checked = staff.checked;

            checkbox.addEventListener('change', (e) => {
                staff.checked = e.target.checked;
                wrapper.className = `staff-item ${staff.checked ? 'checked' : ''}`;
                saveData();
            });

            const span = document.createElement('span');
            span.className = 'staff-name';
            span.textContent = staff.name;

            const settingsRow = document.createElement('div');
            settingsRow.className = 'staff-settings-row';

            const publicCol = document.createElement('div');
            publicCol.className = 'staff-setting-block';

            const publicValue = document.createElement('label');
            publicValue.className = 'staff-public-value';
            publicValue.setAttribute('aria-label', '公休');

            const publicLabel = document.createElement('span');
            publicLabel.className = 'staff-setting-title';
            publicLabel.textContent = '公休';

            const phInput = document.createElement('input');
            phInput.type = 'number';
            phInput.min = '0';
            phInput.max = `${MAX_PUBLIC_HOLIDAYS}`;
            phInput.value = staff.pubHolidays;
            phInput.className = 'premium-input staff-ph-input';

            phInput.addEventListener('change', (e) => {
                let val = parseInt(e.target.value, 10);
                if (isNaN(val) || val < 0) val = 0;
                if (val > MAX_PUBLIC_HOLIDAYS) val = MAX_PUBLIC_HOLIDAYS;
                e.target.value = `${val}`;
                staff.pubHolidays = val;
                saveData();
            });

            publicValue.appendChild(publicLabel);
            publicValue.appendChild(phInput);
            publicCol.appendChild(publicValue);

            const oneCol = document.createElement('div');
            oneCol.className = 'staff-setting-block';
            const oneTitle = document.createElement('span');
            oneTitle.className = 'staff-setting-title';
            oneTitle.textContent = '①に参加';
            oneCol.appendChild(oneTitle);

            const oneShiftLabel = document.createElement('label');
            oneShiftLabel.className = 'staff-inline-check';

            const oneShiftInput = document.createElement('input');
            oneShiftInput.type = 'checkbox';
            oneShiftInput.checked = !!staff.canWorkOneShift;
            oneShiftInput.addEventListener('change', (e) => {
                staff.canWorkOneShift = e.target.checked;
                saveData();
            });

            const oneShiftText = document.createElement('span');
            oneShiftText.textContent = '参加する';

            oneShiftLabel.appendChild(oneShiftInput);
            oneShiftLabel.appendChild(oneShiftText);
            oneCol.appendChild(oneShiftLabel);
            settingsRow.appendChild(oneCol);

            // 土日祝の出勤を少なめでよい人（土日祝の均等化から外す）
            const weekendCol = document.createElement('div');
            weekendCol.className = 'staff-setting-block';
            const weekendTitle = document.createElement('span');
            weekendTitle.className = 'staff-setting-title';
            weekendTitle.textContent = '土日祝';
            weekendCol.appendChild(weekendTitle);

            const weekendLabel = document.createElement('label');
            weekendLabel.className = 'staff-inline-check';
            weekendLabel.title = 'チェックすると、土日祝の出勤を均等にする対象から外し、土日祝の出勤を少なめにします。';

            const weekendInput = document.createElement('input');
            weekendInput.type = 'checkbox';
            weekendInput.checked = !!staff.weekendLight;
            weekendInput.addEventListener('change', (e) => {
                staff.weekendLight = e.target.checked;
                saveData();
            });

            const weekendText = document.createElement('span');
            weekendText.textContent = '少なめでよい';

            weekendLabel.appendChild(weekendInput);
            weekendLabel.appendChild(weekendText);
            weekendCol.appendChild(weekendLabel);
            settingsRow.appendChild(weekendCol);

            // 誕生日（公休に含めて必ず休みにする日）
            const birthdayCol = document.createElement('div');
            birthdayCol.className = 'staff-setting-block';

            const birthdayValue = document.createElement('label');
            birthdayValue.className = 'staff-public-value';
            birthdayValue.setAttribute('aria-label', '誕生日');

            const birthdayLabel = document.createElement('span');
            birthdayLabel.className = 'staff-setting-title';
            birthdayLabel.textContent = '誕生日';

            const birthdayInput = document.createElement('input');
            birthdayInput.type = 'text';
            birthdayInput.className = 'premium-input staff-birthday-input';
            birthdayInput.placeholder = '月/日';
            birthdayInput.title = '月/日 で入力してください（例: 5/24）。空欄なら誕生日休を作りません。';
            birthdayInput.value = formatBirthdayForInput(staff.birthday);

            birthdayInput.addEventListener('change', (e) => {
                const raw = e.target.value.trim();
                const normalized = normalizeBirthday(raw);
                if (raw && !normalized) {
                    // 読み取れなかったときは前の値に戻して知らせる
                    e.target.value = formatBirthdayForInput(staff.birthday);
                    showToast('誕生日は「5/24」のように 月/日 で入力してください');
                    return;
                }
                staff.birthday = normalized;
                e.target.value = formatBirthdayForInput(normalized);
                saveData();
            });

            birthdayValue.appendChild(birthdayLabel);
            birthdayValue.appendChild(birthdayInput);
            birthdayCol.appendChild(birthdayValue);
            settingsRow.appendChild(birthdayCol);

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'del-staff-btn';
            delBtn.innerHTML = '×';
            delBtn.title = '削除';
            delBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm(`「${staff.name}」さんを削除してよろしいですか？`)) {
                    const sourceIndex = sourceList.indexOf(staff);
                    if (sourceIndex > -1) sourceList.splice(sourceIndex, 1);
                    renderStaff();
                    saveData();
                }
            });

            label.appendChild(checkbox);
            label.appendChild(span);
            settingsRow.appendChild(publicCol);

            wrapper.appendChild(label);
            wrapper.appendChild(settingsRow);
            wrapper.appendChild(delBtn);
            container.appendChild(wrapper);
        });
    }

    function saveData() {
        localStorage.setItem('shiftApp_staffData', JSON.stringify(staffData));
    }

    function showToast(message) {
        toast.querySelector('span').textContent = message;
        toast.classList.remove('hidden');
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, 3000);
    }

    document.getElementById('check-all').addEventListener('click', () => {
        staffData.fulltime.forEach(s => s.checked = true);
        staffData.parttime.forEach(s => s.checked = true);
        staffData.irregular.forEach(s => s.checked = true);
        renderStaff();
        saveData();
    });

    document.getElementById('uncheck-all').addEventListener('click', () => {
        staffData.fulltime.forEach(s => s.checked = false);
        staffData.parttime.forEach(s => s.checked = false);
        staffData.irregular.forEach(s => s.checked = false);
        renderStaff();
        saveData();
    });

    const addForm = document.getElementById('add-staff-form');
    if (addForm) {
        addForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('new-staff-name');
            const typeInput = document.getElementById('new-staff-type');

            const name = nameInput.value.trim();
            const type = typeInput.value;
            const targetType = type === 'fulltimeCore' ? 'fulltime' : type;

            if (!name) return;

            const isDupFT = staffData.fulltime.some(s => s.name === name);
            const isDupPT = staffData.parttime.some(s => s.name === name);
            const isDupIR = staffData.irregular.some(s => s.name === name);
            if (isDupFT || isDupPT || isDupIR) {
                alert(`「${name}」さんはすでに登録されています。`);
                return;
            }

            staffData[targetType].push({
                name,
                checked: true,
                pubHolidays: MAX_PUBLIC_HOLIDAYS,
                canWorkOneShift: targetType === 'fulltime',
                isFulltimeCore: type === 'fulltimeCore',
                birthday: normalizeBirthday(SEED_BIRTHDAYS[name])
            });
            normalizeFulltimeCoreFlags();

            nameInput.value = '';
            renderStaff();
            saveData();
        });
    }

    renderStaff();
});
