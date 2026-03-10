document.addEventListener('DOMContentLoaded', () => {
    const MAX_PUBLIC_HOLIDAYS = 8;
    const defaultStaff = {
        fulltime: [
            { name: "梶本", checked: true, pubHolidays: 8 },
            { name: "田渕", checked: true, pubHolidays: 8 },
            { name: "北窪", checked: true, pubHolidays: 7 },
            { name: "八田", checked: true, pubHolidays: 8 },
            { name: "石川", checked: true, pubHolidays: 8 },
            { name: "岩田泰", checked: true, pubHolidays: 8 },
            { name: "岩田美", checked: true, pubHolidays: 8 },
            { name: "岸本", checked: true, pubHolidays: 8 },
            { name: "中川", checked: true, pubHolidays: 8 },
            { name: "清水", checked: true, pubHolidays: 8 },
            { name: "柿林", checked: true, pubHolidays: 8 }
        ],
        parttime: [
            { name: "竹田", checked: true, pubHolidays: 8 },
            { name: "岡本春", checked: true, pubHolidays: 8 },
            { name: "岡本梨", checked: true, pubHolidays: 8 },
            { name: "岡崎", checked: true, pubHolidays: 8 },
            { name: "澤田", checked: true, pubHolidays: 8 },
            { name: "大野", checked: true, pubHolidays: 8 }
        ],
        irregular: [
            { name: "太田", checked: true, pubHolidays: 8 },
            { name: "中西", checked: true, pubHolidays: 8 }
        ]
    };

    let staffData = JSON.parse(localStorage.getItem('shiftApp_staffData'));
    if (!staffData || !staffData.fulltime || !staffData.parttime) {
        staffData = defaultStaff;
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
        if (migrated || normalizedChanged) {
            localStorage.setItem('shiftApp_staffData', JSON.stringify(staffData));
        }
    }



    const ftList = document.getElementById('fulltime-list');
    const ptList = document.getElementById('parttime-list');
    const irList = document.getElementById('irregular-list');
    const toast = document.getElementById('toast');

    function renderStaff() {
        renderGroup(ftList, staffData.fulltime, 'fulltime');
        renderGroup(ptList, staffData.parttime, 'parttime');
        renderGroup(irList, staffData.irregular, 'irregular');
    }

    function renderGroup(container, list, groupName) {
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

            const optionsDiv = document.createElement('div');
            optionsDiv.className = 'staff-options';

            const phLabel = document.createElement('span');
            phLabel.className = 'staff-options-label';
            phLabel.textContent = '公休:';

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

            optionsDiv.appendChild(phLabel);
            optionsDiv.appendChild(phInput);

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'del-staff-btn';
            delBtn.innerHTML = '×';
            delBtn.title = '削除';
            delBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm(`「${staff.name}」さんを削除してよろしいですか？`)) {
                    list.splice(index, 1);
                    renderStaff();
                    saveData();
                }
            });

            label.appendChild(checkbox);
            label.appendChild(span);

            wrapper.appendChild(label);
            wrapper.appendChild(optionsDiv);
            wrapper.appendChild(delBtn);
            container.appendChild(wrapper);
        });
    }

    function saveData() {
        localStorage.setItem('shiftApp_staffData', JSON.stringify(staffData));
        showToast('保存しました');
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

            if (!name) return;

            const isDupFT = staffData.fulltime.some(s => s.name === name);
            const isDupPT = staffData.parttime.some(s => s.name === name);
            const isDupIR = staffData.irregular.some(s => s.name === name);
            if (isDupFT || isDupPT || isDupIR) {
                alert(`「${name}」さんはすでに登録されています。`);
                return;
            }

            staffData[type].push({ name: name, checked: true, pubHolidays: MAX_PUBLIC_HOLIDAYS });

            nameInput.value = '';
            renderStaff();
            saveData();
        });
    }

    renderStaff();
});
