document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
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

    let requestData = JSON.parse(localStorage.getItem('shiftApp_requestData')) || {};
    let staffData = JSON.parse(localStorage.getItem('shiftApp_staffData'));

    // fallback if no staff logic is set yet
    if (!staffData || !staffData.fulltime) {
        staffData = { fulltime: [], parttime: [], irregular: [] };
    } else if (!staffData.irregular) {
        staffData.irregular = [];
    }

    function getActiveStaff() {
        return [
            ...staffData.fulltime.filter(s => s.checked).map(s => s.name),
            ...staffData.parttime.filter(s => s.checked).map(s => s.name),
            ...staffData.irregular.filter(s => s.checked).map(s => s.name)
        ];
    }

    // --- DOM Elements ---
    const currentMonthDisplay = document.getElementById('current-month-display');
    const periodDisplay = document.getElementById('period-display');
    const tableContainer = document.getElementById('request-table');
    const toast = document.getElementById('toast');

    // --- Init ---
    init();

    function init() {
        bindEvents();
        renderTable();
    }

    // --- Functions ---
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

    function renderTable() {
        currentMonthDisplay.textContent = `${currentYear}年 ${currentTargetMonth}月度`;

        const { start, end } = getPeriod(currentYear, currentTargetMonth);

        const startStr = `${start.getMonth() + 1}月${start.getDate()}日`;
        const endStr = `${end.getMonth() + 1}月${end.getDate()}日`;
        periodDisplay.textContent = `${startStr} 〜 ${endStr}`;

        // Create table structure
        let thead = '<thead><tr><th class="sticky-col">名前</th>';
        let datesArray = [];

        const currDate = new Date(start);
        while (currDate <= end) {
            const dateStr = formatDateForData(currDate);
            datesArray.push(dateStr);

            const dayOfWeek = currDate.getDay();
            let dayClass = '';
            if (dayOfWeek === 0) dayClass = 'day-sun';
            if (dayOfWeek === 6) dayClass = 'day-sat';

            thead += `<th class="${dayClass}">${currDate.getDate()}</th>`;
            currDate.setDate(currDate.getDate() + 1);
        }
        thead += '</tr></thead>';

        let tbody = '<tbody>';
        const activeStaff = getActiveStaff();
        if (activeStaff.length === 0) {
            tbody += `<tr><td colspan="${datesArray.length + 1}" style="text-align: center; color: var(--text-muted); padding: 2rem;">スタッフが選択されていません。スタッフ画面でONにしてください。</td></tr>`;
        } else {
            activeStaff.forEach(staffName => {
                tbody += `<tr><td class="sticky-col">${staffName}</td>`;
                datesArray.forEach(dateStr => {
                    const cellVal = (requestData[dateStr] && requestData[dateStr][staffName]) || '';
                    let extraClass = '';
                    if (cellVal === '休') extraClass = 'active-rest';
                    if (cellVal === '有' || cellVal === '有休' || cellVal === '特' || cellVal === '特休') extraClass = 'active-paid-leave';
                    if (cellVal === '10') extraClass = 'active-10';

                    tbody += `<td class="cell ${extraClass}" data-date="${dateStr}" data-name="${staffName}">${cellVal}</td>`;
                });
                tbody += `</tr>`;
            });
        }
        tbody += '</tbody>';

        tableContainer.innerHTML = thead + tbody;

        // Bind cell clicks
        document.querySelectorAll('.request-table .cell').forEach(cell => {
            cell.addEventListener('click', handleCellClick);
        });
    }

    function handleCellClick(e) {
        const td = e.currentTarget;
        const dateStr = td.dataset.date;
        const staffName = td.dataset.name;

        if (!requestData[dateStr]) {
            requestData[dateStr] = {};
        }

        let currentVal = requestData[dateStr][staffName] || '';
        // Toggle: "" -> "休" -> "有" -> "特" -> "10" -> ""
        if (currentVal === '') currentVal = '休';
        else if (currentVal === '休') currentVal = '有';
        else if (currentVal === '有' || currentVal === '有休') currentVal = '特';
        else if (currentVal === '特' || currentVal === '特休') currentVal = '10';
        else currentVal = '';

        if (currentVal === '') {
            delete requestData[dateStr][staffName];
            // Cleanup empty object
            if (Object.keys(requestData[dateStr]).length === 0) {
                delete requestData[dateStr];
            }
        } else {
            requestData[dateStr][staffName] = currentVal;
        }

        saveData();

        // Update UI locally without full re-render for performance
        td.textContent = currentVal;
        td.className = 'cell'; // reset
        if (currentVal === '休') td.classList.add('active-rest');
        if (currentVal === '有' || currentVal === '有休' || currentVal === '特' || currentVal === '特休') td.classList.add('active-paid-leave');
        if (currentVal === '10') td.classList.add('active-10');
    }

    function bindEvents() {
        document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
        document.getElementById('next-month').addEventListener('click', () => changeMonth(1));
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
        renderTable();
    }

    function saveData() {
        localStorage.setItem('shiftApp_requestData', JSON.stringify(requestData));
        showToast('保存しました');
    }

    function showToast(message) {
        const toastMessage = document.getElementById('toast-message');
        if (toastMessage) toastMessage.textContent = message;

        toast.classList.remove('hidden');
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, 1000); // Quick hide since tapping might be fast and frequent
    }
});
