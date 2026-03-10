document.addEventListener('DOMContentLoaded', () => {
    const periodEl = document.getElementById('top-period');
    const staffCountEl = document.getElementById('top-staff-count');
    const eventCountEl = document.getElementById('top-event-count');
    const leaveCountEl = document.getElementById('top-leave-count');

    const now = new Date();
    let year = now.getFullYear();
    let targetMonth = now.getMonth() + 1;
    if (now.getDate() > 20) {
        targetMonth += 1;
        if (targetMonth > 12) {
            targetMonth = 1;
            year += 1;
        }
    }

    periodEl.textContent = `${year}年${targetMonth}月度`;

    const staffData = JSON.parse(localStorage.getItem('shiftApp_staffData')) || { fulltime: [], parttime: [], irregular: [] };
    const checkedCount = [...(staffData.fulltime || []), ...(staffData.parttime || []), ...(staffData.irregular || [])]
        .filter(s => s && s.checked)
        .length;
    staffCountEl.textContent = `${checkedCount}人`;

    const eventData = JSON.parse(localStorage.getItem('shiftApp_eventData')) || {};
    const eventCount = Object.values(eventData).filter(v => v && v.isEventDay).length;
    eventCountEl.textContent = `${eventCount}日`;

    const requestData = JSON.parse(localStorage.getItem('shiftApp_requestData')) || {};
    let leaveCount = 0;
    Object.values(requestData).forEach(byName => {
        Object.values(byName || {}).forEach(v => {
            if (v === '有' || v === '有休' || v === '休') leaveCount += 1;
        });
    });
    leaveCountEl.textContent = `${leaveCount}件`;
});
