/*
 * 新ルールの検証（2026-08-10 変更分）
 * 本番実データで各月を生成し、エンジン自身の採点ではなく独立の検査で確認する。
 */
'use strict';
const fs = require('fs');
const path = require('path');

require(path.join(__dirname, '..', 'engine.js'));
const E = globalThis.ShiftEngine;

const HOLIDAYS = new Set([
    '2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29',
    '2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11',
    '2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23'
]);
const isHoliday = ds => HOLIDAYS.has(ds);
const isWeekendish = ds => {
    const day = new Date(ds + 'T00:00:00').getDay();
    return day === 0 || day === 6 || isHoliday(ds);
};

const backup = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'backups', '本番実データ_20260731.json'), 'utf8'));
const data = backup.data;
const staffData = JSON.parse(data.shiftApp_staffData);
const requestData = JSON.parse(data.shiftApp_requestData);
const eventData = JSON.parse(data.shiftApp_eventData);

const BIRTHDAYS = {
    "梶本":"05-24","田渕":"12-14","田淵":"12-14","北窪":"03-22","八田":"09-11","石川":"06-10",
    "岩田泰":"03-25","岸本":"09-05","中川":"11-12","清水":"06-10","柿林":"08-08","竹田":"08-12",
    "岩田美":"06-28","岡本梨":"12-15","岡崎":"04-01","大野":"07-19","太田":"07-29"
};
const THIRD_STAFF = new Set(["梶本","田渕","田淵","北窪","八田","石川","岸本","中川"]);
const FOURTH_STAFF = new Set(["岡崎"]);
const NO_TEN = new Set(["太田"]);
const CONSECUTIVE_TEN_OK = new Set(["竹田","岩田美","石川","大野"]);
const CORE = new Set(["梶本","田渕","田淵","北窪","八田"]);
const MANUAL_ONLY = new Set(["中西"]);
const MAX_RUN_BY_STAFF = { "太田": 3 };

// テストシナリオ用の上書き（引数で切替）
const scenario = process.argv[2] || 'base';

function buildStaff() {
    const all = [];
    const push = (s, grp) => {
        all.push({
            name: s.name,
            isFulltime: grp === 'fulltime',
            isFulltimeCore: grp === 'fulltime' && CORE.has(s.name),
            isIrregular: grp === 'irregular',
            manualOnly: MANUAL_ONLY.has(s.name),
            canWorkOneShift: !!s.canWorkOneShift,
            canWorkTenShift: !NO_TEN.has(s.name) && grp !== 'irregular',
            canWorkThirdShift: THIRD_STAFF.has(s.name),
            usesFourthShift: FOURTH_STAFF.has(s.name),
            allowsConsecutiveTen: CONSECUTIVE_TEN_OK.has(s.name),
            weekendLight: scenario === 'weekendlight' && s.name === '清水',
            maxConsecutive: MAX_RUN_BY_STAFF[s.name] || 0,
            pubHolidays: s.pubHolidays,
            birthday: BIRTHDAYS[s.name] || ''
        });
    };
    staffData.fulltime.filter(s => s.checked).forEach(s => push(s, 'fulltime'));
    staffData.parttime.filter(s => s.checked).forEach(s => push(s, 'parttime'));
    staffData.irregular.filter(s => s.checked).forEach(s => push(s, 'irregular'));
    return all;
}

function datesOf(year, month) {
    const start = new Date(year, month - 2, 21);
    const end = new Date(year, month - 1, 20);
    const out = [];
    const cur = new Date(start);
    while (cur <= end) {
        out.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`);
        cur.setDate(cur.getDate() + 1);
    }
    return out;
}

function checkMonth(year, month, seed, opts) {
    const dates = datesOf(year, month);
    const staff = buildStaff();
    const thirdByDate = {};
    const minByDate = {};
    if (opts && opts.thirdByDate) Object.assign(thirdByDate, opts.thirdByDate);
    if (opts && opts.minByDate) Object.assign(minByDate, opts.minByDate);

    const result = E.generate({
        dates,
        staff,
        requests: requestData,
        events: eventData,
        manualLocks: {},
        isHolidayDate: isHoliday,
        rules: {
            weekdayMinimum: 11, weekendMinimum: 10,
            oneShiftCount: 1, tenShiftCount: 3,
            minConsecutiveWork: 2, maxConsecutiveWork: 4,
            allowFiveConsecutiveOnce: true,
            tenFulltimeRandom: false,
            thirdShiftDefault: 0,
            thirdShiftByDate: thirdByDate,
            minimumByDate: minByDate,
            busyDayBoost: 1,
            seed
        }
    });

    const sched = result.schedule;
    const errors = [];
    const err = m => errors.push(m);

    const byName = Object.fromEntries(staff.map(s => [s.name, s]));
    const isWork = v => /^(?:10|[1-9])$/.test(v);
    const offQuota = v => v === '公' || v === '誕' || v === '特';
    // 指定セルか（指定が原因の違反は「エンジンのせい」ではないので除外して数える）
    const isRequested = (name, ds) => {
        const r = (requestData[ds] || {})[name];
        return r !== undefined && r !== null && r !== '';
    };
    // エンジンが「どう組んでも◯連勤になる」と申告した下限
    const noteFloor = {};
    (result.notes || []).forEach(n => {
        if (n.kind === 'consecutive-impossible') {
            const m = n.message.match(/最大(\d+)連勤/);
            if (m) noteFloor[n.staff] = Math.max(noteFloor[n.staff] || 0, parseInt(m[1], 10));
        }
        if (n.kind === 'consecutive-unsatisfiable') noteFloor[n.staff] = 99;
    });
    // 指定休にはさまれて必ず1勤になる日（エンジンがnoteで申告済み）
    const isolatedOk = new Set(
        (result.notes || []).filter(n => n.kind === 'isolated-day').map(n => `${n.staff}|${n.date}`));

    // --- 指定の保持 ---
    for (const ds of dates) {
        const reqs = requestData[ds] || {};
        for (const [name, req] of Object.entries(reqs)) {
            if (!sched[name]) continue;
            const got = sched[name][ds] || '';
            const expected = ({'休':'公','公':'公','有':'有','特':'特'})[req] || req;
            if (expected === '出') continue; // 旧データ（中西さん）
            if (got !== expected) err(`指定破れ ${name} ${ds} 希望=${req} 結果=${got}`);
        }
    }

    // --- 人ごとの検査 ---
    const openingCounts = {}, weekendWork = {};
    for (const s of staff) {
        if (s.manualOnly) continue;
        const row = sched[s.name] || {};
        let quotaCount = 0;
        let run = 0; const runs = [];
        let tenRun = 0;
        dates.forEach((ds, i) => {
            const v = row[ds] || '';
            if (offQuota(v)) quotaCount++;
            if (isWork(v)) { run++; } else { if (run) runs.push({len: run, endIdx: i - 1}); run = 0; }
            if (v === '10') { tenRun++; } else tenRun = 0;
            if (tenRun === 2 && !s.allowsConsecutiveTen && !isRequested(s.name, ds)) err(`⑩2連続 ${s.name} ${ds}`);
            if (tenRun >= 3 && !isRequested(s.name, ds)) err(`⑩3連続 ${s.name} ${ds}`);
            // 希望休の前日⑩（その⑩自体が指定なら、指定どうしの矛盾なので除外）
            if (v === '10' && i + 1 < dates.length && !isRequested(s.name, ds)) {
                const nreq = (requestData[dates[i+1]] || {})[s.name];
                if (nreq === '休' || nreq === '公' || nreq === '有' || nreq === '特') err(`希望休前日の⑩ ${s.name} ${ds}`);
            }
            // ①の翌日
            if (v === '1' && i + 1 < dates.length && isWork(row[dates[i+1]] || '')) err(`①翌日出勤 ${s.name} ${ds}`);
            // ①の前日が⑩（2026-08-10 お客さん要望で禁止）
            if (v === '1' && i > 0 && (row[dates[i-1]] || '') === '10'
                && !isRequested(s.name, ds) && !isRequested(s.name, dates[i-1])) err(`①の前日が⑩ ${s.name} ${ds}`);
            // ③の資格・行事日
            if (v === '3') {
                if (!s.canWorkThirdShift) err(`③資格なし ${s.name} ${ds}`);
                const need = thirdByDate[ds];
                if (need === undefined || need <= 0) err(`③が指定なしの日に出現 ${s.name} ${ds}`);
            }
            if (v === '4' && !s.usesFourthShift) err(`④岡崎以外 ${s.name} ${ds}`);
            if (v === '6' && s.usesFourthShift) err(`岡崎さんに⑥ ${s.name} ${ds}`);
            if (v === '10' && !s.canWorkTenShift) err(`⑩資格なし ${s.name} ${ds}`);
            if (v === '1' && !s.canWorkOneShift) err(`①資格なし ${s.name} ${ds}`);
        });
        if (run) runs.push({len: run, endIdx: dates.length - 1});
        if (quotaCount !== s.pubHolidays) err(`公休+特休=${quotaCount} 設定${s.pubHolidays} ${s.name}`);

        // 連勤（月境の連勤は下限免除。指定だけで避けられない長さは除外）
        const maxRun = Math.max(s.maxConsecutive || 4, noteFloor[s.name] || 0);
        let over = 0;
        runs.forEach(r => {
            const startsEdge = r.endIdx - r.len + 1 === 0;
            const endsEdge = r.endIdx === dates.length - 1;
            if (!startsEdge && !endsEdge && r.len < 2 && !isolatedOk.has(`${s.name}|${dates[r.endIdx]}`)) err(`1勤 ${s.name} ${dates[r.endIdx]}`);
            if (r.len > maxRun && maxRun < 99) { over++; if (r.len > maxRun + 1 || over > 1) err(`${r.len}連勤 ${s.name} 〜${dates[r.endIdx]} (上限${maxRun})`); }
        });

        openingCounts[s.name] = dates.reduce((n, ds) => n + (['1','3','10'].includes(row[ds]) ? 1 : 0), 0);
        weekendWork[s.name] = dates.reduce((n, ds) => n + (isWeekendish(ds) && isWork(row[ds] || '') ? 1 : 0), 0);
    }

    // --- 日ごとの検査 ---
    dates.forEach(ds => {
        let work = 0, one = 0, ten = 0, tenFt = 0, third = 0, core = false;
        for (const s of staff) {
            const v = (sched[s.name] || {})[ds] || '';
            if (isWork(v)) work++;
            if (v === '1') one++;
            if (v === '10') { ten++; if (s.isFulltime) tenFt++; }
            if (v === '3') third++;
            if (isWork(v) && CORE.has(s.name)) core = true;
        }
        if (one !== 1) err(`①=${one}人 ${ds}`);
        if (ten > 0 && tenFt === 0) err(`⑩全員パート ${ds}`);
        if (!core) err(`コア全員休み ${ds}`);
        const need = thirdByDate[ds] || 0;
        if (third !== need && need > 0) err(`③=${third}人(指定${need}) ${ds}`);
        if (need === 0 && third > 0) err(`③指定なし日に${third}人 ${ds}`);
    });

    // --- 公平さの観測（エラーではなく統計） ---
    const openingPool = staff.filter(s => !s.manualOnly && (s.canWorkOneShift || s.canWorkTenShift || s.canWorkThirdShift));
    const oc = openingPool.map(s => openingCounts[s.name]);
    const wePool = staff.filter(s => !s.manualOnly && !s.weekendLight && !MANUAL_ONLY.has(s.name));
    const wc = wePool.map(s => weekendWork[s.name]);
    const stats = a => a.length ? `min${Math.min(...a)} max${Math.max(...a)} 差${Math.max(...a)-Math.min(...a)}` : '-';

    return {
        label: `${year}-${month}`,
        errors,
        elapsed: result.elapsedMs,
        score: result.score,
        opening: stats(oc),
        openingDetail: openingPool.map(s => `${s.name}${openingCounts[s.name]}`).join(' '),
        weekend: stats(wc),
        weekendDetail: staff.filter(s=>!s.manualOnly).map(s => `${s.name}${weekendWork[s.name]}${s.weekendLight?'*':''}`).join(' '),
        thirds: dates.reduce((n, ds) => n + staff.reduce((m, s) => m + ((sched[s.name]||{})[ds] === '3' ? 1 : 0), 0), 0),
        minShort: (result.issues || []).filter(i => i.kind === 'daily-shortage').length
    };
}

const months = [[2026,4],[2026,5],[2026,6],[2026,7],[2026,8],[2026,9]];
let totalErrors = 0;
for (const [y, m] of months) {
    for (const seed of [1, 20260810, 777]) {
        const opts = {};
        if (scenario === 'events') {
            // 行事シナリオ: 8月度の行事日に③2人・出勤15人、前日13人
            opts.thirdByDate = { '2026-08-05': 2 };
            opts.minByDate = { '2026-08-05': 15, '2026-08-04': 13 };
        }
        const r = checkMonth(y, m, seed, opts);
        totalErrors += r.errors.length;
        console.log(`\n=== ${r.label} seed=${seed} score=${Math.round(r.score)} ${r.elapsed}ms ③=${r.thirds} 人数不足警告=${r.minShort}`);
        console.log(`  ①③⑩合計: ${r.opening}  [${r.openingDetail}]`);
        console.log(`  土日祝出勤: ${r.weekend}  [${r.weekendDetail}]`);
        if (r.errors.length) {
            console.log('  ✗ エラー ' + r.errors.length + '件');
            r.errors.slice(0, 12).forEach(e => console.log('    - ' + e));
        } else {
            console.log('  ✓ ルール違反なし');
        }
    }
}
console.log(`\n合計エラー: ${totalErrors}`);
process.exit(totalErrors ? 1 : 0);
