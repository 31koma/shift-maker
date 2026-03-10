document.addEventListener('DOMContentLoaded', () => {
    const MAX_EVENT_NAME_LENGTH = 20;
    // --- State ---
    let today = new Date();
    let currentYear = today.getFullYear();
    let currentTargetMonth = today.getMonth() + 1;

    // Target month logic: e.g. Mar 21 is April Target Month
    if (today.getDate() > 20) {
        currentTargetMonth++;
        if (currentTargetMonth > 12) {
            currentTargetMonth = 1;
            currentYear++;
        }
    }

    let eventData = JSON.parse(localStorage.getItem('shiftApp_eventData')) || {};
    let selectedDateStr = null;

    // --- DOM Elements ---
    const currentMonthDisplay = document.getElementById('current-month-display');
    const periodDisplay = document.getElementById('period-display');
    const calendarGrid = document.getElementById('calendar-grid');

    const editModal = document.getElementById('edit-modal');
    const modalDateDisplay = document.getElementById('modal-date-display');
    const eventNameInput = document.getElementById('event-name');
    const isBusyDayInput = document.getElementById('is-busy-day');
    const toast = document.getElementById('toast');

    // --- Init ---
    init();

    function init() {
        bindEvents();
        renderCalendar();
    }

    // --- Functions ---
    function getPeriod(year, targetMonth) {
        // targetMonth: 1-indexed. Month 0 is Dec of previous year for JS Date
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

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatEventNameForDisplay(name) {
        const normalized = String(name || '').slice(0, MAX_EVENT_NAME_LENGTH);
        const line1 = normalized.slice(0, 10);
        const line2 = normalized.slice(10, 20);
        if (!line2) return `<span class="event-line">${escapeHtml(line1)}</span>`;
        return `<span class="event-line">${escapeHtml(line1)}</span><span class="event-line">${escapeHtml(line2)}</span>`;
    }

    function renderCalendar() {
        currentMonthDisplay.textContent = `${currentYear}年 ${currentTargetMonth}月度`;

        const { start, end } = getPeriod(currentYear, currentTargetMonth);

        const startStr = `${start.getMonth() + 1}月${start.getDate()}日`;
        const endStr = `${end.getMonth() + 1}月${end.getDate()}日`;
        periodDisplay.textContent = `${startStr} 〜 ${endStr}`;

        calendarGrid.innerHTML = '';

        const startDayOfWeek = start.getDay();
        const calendarStart = new Date(start);
        calendarStart.setDate(start.getDate() - startDayOfWeek);

        const endDayOfWeek = end.getDay();
        const calendarEnd = new Date(end);
        calendarEnd.setDate(end.getDate() + (6 - endDayOfWeek));

        const currDate = new Date(calendarStart);

        while (currDate <= calendarEnd) {
            const dateStr = formatDateForData(currDate);
            const isOutOfRange = currDate < start || currDate > end;
            const dayData = eventData[dateStr] || { eventName: '', busyDay: false };

            const dayOfWeek = currDate.getDay();

            const cell = document.createElement('div');
            cell.className = `calendar-cell ${isOutOfRange ? 'out-of-range' : ''}`;

            if (dayOfWeek === 0) cell.classList.add('sunday');
            if (dayOfWeek === 6) cell.classList.add('saturday');

            const isToday = today.toDateString() === currDate.toDateString();
            if (isToday) cell.classList.add('today');

            const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
            const displayDateText = `${currDate.getMonth() + 1}月${currDate.getDate()}日`;
            const currentDayName = dayNames[dayOfWeek];

            cell.onclick = () => openModal(dateStr, displayDateText, currentDayName);

            let badgesHtml = '';
            if (dayData.eventName) {
                badgesHtml += `<div class="event-badge">${formatEventNameForDisplay(dayData.eventName)}</div>`;
            }
            const isBusyDay = !!dayData.busyDay || !!dayData.isEventDay;
            if (isBusyDay) {
                badgesHtml += `<div class="people-badge">人数多め</div>`;
            }
            cell.innerHTML = `
                <div class="cell-header">
                    <span class="date-num">${currDate.getDate()}</span>
                </div>
                <div class="cell-content">
                    ${badgesHtml}
                </div>
            `;

            calendarGrid.appendChild(cell);

            currDate.setDate(currDate.getDate() + 1);
        }
    }

    function bindEvents() {
        document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
        document.getElementById('next-month').addEventListener('click', () => changeMonth(1));

        document.getElementById('close-modal').addEventListener('click', closeModal);
        document.getElementById('save-day-btn').addEventListener('click', saveModal);
        document.getElementById('clear-day-btn').addEventListener('click', clearModal);

        editModal.addEventListener('click', (e) => {
            if (e.target === editModal) closeModal();
        });

        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                eventNameInput.value = e.target.dataset.event;
                if (e.target.dataset.event === '行事日') isBusyDayInput.checked = true;
            });
        });
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
        renderCalendar();
    }

    function openModal(dateStr, displayDateText, dayName) {
        selectedDateStr = dateStr;
        modalDateDisplay.textContent = `${displayDateText} (${dayName})`;

        const dayData = eventData[dateStr] || { eventName: '', busyDay: false };
        eventNameInput.value = dayData.eventName;
        isBusyDayInput.checked = !!dayData.busyDay || !!dayData.isEventDay;

        editModal.classList.remove('hidden');
        setTimeout(() => editModal.querySelector('.modal-content').classList.add('show'), 10);
    }

    function closeModal() {
        editModal.querySelector('.modal-content').classList.remove('show');
        setTimeout(() => editModal.classList.add('hidden'), 300);
        selectedDateStr = null;
    }

    function saveModal() {
        if (!selectedDateStr) return;

        const eName = eventNameInput.value.trim().slice(0, MAX_EVENT_NAME_LENGTH);
        const isBusyDay = !!isBusyDayInput.checked;

        if (eName || isBusyDay) {
            eventData[selectedDateStr] = {
                eventName: eName,
                busyDay: isBusyDay
            };
        } else {
            delete eventData[selectedDateStr];
        }

        localStorage.setItem('shiftApp_eventData', JSON.stringify(eventData));

        closeModal();
        renderCalendar();
        showToast('保存しました');
    }

    function clearModal() {
        eventNameInput.value = '';
        isBusyDayInput.checked = false;
    }

    function showToast(message) {
        const toastMessage = document.getElementById('toast-message');
        if (toastMessage) {
            toastMessage.textContent = message;
        } else {
            toast.querySelector('span').textContent = message;
        }

        toast.classList.remove('hidden');
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, 3000);
    }
});
