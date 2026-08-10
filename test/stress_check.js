/*
 * シフト作るくん — 自動生成の総点検
 * ===========================================================================
 * お客さんの実データを使い、いろいろな条件で大量に生成して
 * 「決めたルールが守られているか」を独立に検査する。
 *
 * 大事な考え方:
 *   エンジン自身の採点は使わない。ここに書いた検査だけで判定する。
 *   （エンジンの採点が間違っていたら、採点で検査しても気づけないため）
 *
 * 使い方:  node test/stress_check.js          全パターン
 *          node test/stress_check.js base 12  1パターンをシード12個で
 * ===========================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');
require(path.join(__dirname, '..', 'engine.js'));
const E = globalThis.ShiftEngine;

// ------------------------------------------------------------- 設定（config.js と合わせる）
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
const BIRTHDAYS = {
    "梶本":"05-24","田渕":"12-14","北窪":"03-22","八田":"09-11","石川":"06-10",
    "岩田泰":"03-25","岸本":"09-05","中川":"11-12","清水":"06-10","柿林":"08-08",
    "竹田":"08-12","岩田美":"06-28","岡本梨":"12-15","岡崎":"04-01","大野":"07-19","太田":"07-29"
};
const THIRD_STAFF = new Set(["梶本","田渕","北窪","八田","石川","岸本","中川"]);
const FOURTH_STAFF = new Set(["岡崎"]);
const NO_TEN = new Set(["太田"]);
const CONSECUTIVE_TEN_OK = new Set(["竹田","岩田美","石川","大野"]);
const CORE = new Set(["梶本","田渕","北窪","八田"]);
const MANUAL_ONLY = new Set(["中西"]);
const MAX_RUN_BY_STAFF = { "太田": 3 };
const WEEKDAY_MIN = 11, WEEKEND_MIN = 10;

const backup = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'backups', '本番実データ_20260731.json'), 'utf8'));
const rawStaff = JSON.parse(backup.data.shiftApp_staffData);
const baseRequests = JSON.parse(backup.data.shiftApp_requestData);
const baseEvents = JSON.parse(backup.data.shiftApp_eventData);

function datesOf(year, month) {
    const out = [];
    const cur = new Date(year, month - 2, 21), end = new Date(year, month - 1, 20);
    while (cur <= end) {
        out.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`);
        cur.setDate(cur.getDate() + 1);
    }
    return out;
}

function buildStaff(opt) {
    const o = opt || {};
    const all = [];
    const push = (s, grp) => {
        if ((o.drop || []).includes(s.name)) return;
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
            weekendLight: (o.weekendLight || []).includes(s.name),
            maxConsecutive: MAX_RUN_BY_STAFF[s.name] || 0,
            pubHolidays: o.pubHolidays || s.pubHolidays,
            birthday: BIRTHDAYS[s.name] || ''
        });
    };
    rawStaff.fulltime.filter(s => s.checked).forEach(s => push(s, 'fulltime'));
    rawStaff.parttime.filter(s => s.checked).forEach(s => push(s, 'parttime'));
    rawStaff.irregular.filter(s => s.checked).forEach(s => push(s, 'irregular'));
    return all;
}

// ------------------------------------------------------------- 検査本体
const isWork = v => /^(?:10|[1-9])$/.test(v);
const countsInQuota = v => v === '公' || v === '誕' || v === '特';   // 公休の枠に入る休み
const isOff = v => !isWork(v);

function inspect(res, ctx) {
    const { dates, staff, requests, thirdByDate, minByDate, events } = ctx;
    const sched = res.schedule;
    const bad = [];
    const add = (kind, msg) => bad.push({ kind, msg });

    const requested = (n, d) => {
        const r = (requests[d] || {})[n];
        return r !== undefined && r !== null && r !== '';
    };
    // エンジンが「指定のせいで避けられない」と申告したもの
    const floorOf = {}, isolatedOk = new Set();
    (res.notes || []).forEach(n => {
        if (n.kind === 'consecutive-impossible') {
            const m = n.message.match(/最大(\d+)連勤/);
            if (m) floorOf[n.staff] = Math.max(floorOf[n.staff] || 0, +m[1]);
        }
        if (n.kind === 'consecutive-unsatisfiable') floorOf[n.staff] = 999;
        if (n.kind === 'isolated-day') isolatedOk.add(`${n.staff}|${n.date}`);
        if (n.kind === 'public-impossible' || n.kind === 'public-over') floorOf['__quota_' + n.staff] = true;
    });

    // 1) 指定が100%残っているか（最優先ルール）
    if ((res.brokenLocks || []).length) {
        res.brokenLocks.forEach(b => add('指定破れ', `${b.staff} ${b.date} ${b.expected}→${b.got || '空'}`));
    }
    for (const ds of dates) {
        for (const [name, req] of Object.entries(requests[ds] || {})) {
            if (!sched[name]) continue;
            const expected = ({'休':'公','公':'公','有':'有','特':'特'})[req] || req;
            if (expected === '出') continue;                 // 旧データ（中西さん）
            const got = sched[name][ds] || '';
            if (got !== expected) add('指定破れ', `${name} ${ds} 希望${req}→${got || '空'}`);
        }
    }

    // 2) 人ごとのルール
    for (const s of staff) {
        if (s.manualOnly) continue;
        const row = sched[s.name] || {};
        let quota = 0, tenRun = 0, run = 0;
        const runs = [];

        dates.forEach((ds, i) => {
            const v = row[ds] || '';
            const prev = i > 0 ? (row[dates[i-1]] || '') : '';

            if (v === '') add('空欄', `${s.name} ${ds}`);
            if (countsInQuota(v)) quota++;
            if (isWork(v)) run++; else { if (run) runs.push({ len: run, end: i - 1 }); run = 0; }

            // ⑩の連続
            if (v === '10') tenRun++; else tenRun = 0;
            if (tenRun === 2 && !s.allowsConsecutiveTen && !requested(s.name, ds)) add('⑩2連続', `${s.name} ${ds}`);
            if (tenRun >= 3 && !requested(s.name, ds)) add('⑩3連続', `${s.name} ${ds}`);

            // 希望休・有休・特休の前日に⑩を入れない
            if (v === '10' && i + 1 < dates.length && !requested(s.name, ds)) {
                const nr = (requests[dates[i+1]] || {})[s.name];
                if (['休','公','有','特'].includes(nr)) add('希望休前日の⑩', `${s.name} ${ds}`);
            }
            // ①の翌日は休み
            if (v === '1' && i + 1 < dates.length && isWork(row[dates[i+1]] || '')) add('①翌日出勤', `${s.name} ${ds}`);
            // ①の前日は⑩にしない
            if (v === '1' && prev === '10' && !requested(s.name, ds) && !requested(s.name, dates[i-1]))
                add('①前日⑩', `${s.name} ${ds}`);
            // 区分の資格
            if (v === '1' && !s.canWorkOneShift) add('①資格なし', `${s.name} ${ds}`);
            if (v === '10' && !s.canWorkTenShift) add('⑩資格なし', `${s.name} ${ds}`);
            if (v === '4' && !s.usesFourthShift) add('④が岡崎以外', `${s.name} ${ds}`);
            if (v === '6' && s.usesFourthShift) add('岡崎に⑥', `${s.name} ${ds}`);
            if (v === '3' && !requested(s.name, ds)) {
                if (!s.canWorkThirdShift) add('③資格なし', `${s.name} ${ds}`);
                if (!(thirdByDate[ds] > 0)) add('③が指定外の日', `${s.name} ${ds}`);
            }
            // 誕生日は休み（指定が入っている日を除く）
            if (s.birthday && ds.slice(5) === s.birthday && !requested(s.name, ds) && isWork(v))
                add('誕生日が休みでない', `${s.name} ${ds}`);
        });
        if (run) runs.push({ len: run, end: dates.length - 1 });

        // 公休＋特休 ＝ 設定した公休数
        if (quota !== s.pubHolidays && !floorOf['__quota_' + s.name])
            add('公休数ちがい', `${s.name} ${quota}日(設定${s.pubHolidays}日)`);

        // 連勤（月の境目は前後の月と続くので下限を免除）
        const cap = Math.max(s.maxConsecutive || 4, floorOf[s.name] || 0);
        let over = 0;
        runs.forEach(r => {
            const startEdge = r.end - r.len + 1 === 0, endEdge = r.end === dates.length - 1;
            if (!startEdge && !endEdge && r.len < 2 && !isolatedOk.has(`${s.name}|${dates[r.end]}`))
                add('1勤', `${s.name} ${dates[r.end]}`);
            if (r.len > cap && cap < 999) {
                over++;
                if (r.len > cap + 1 || over > 1) add('連勤オーバー', `${s.name} ${r.len}連勤〜${dates[r.end]}(上限${cap})`);
            }
        });
    }

    // 3) 日ごとのルール
    dates.forEach(ds => {
        let work = 0, one = 0, ten = 0, tenFt = 0, third = 0, core = false;
        staff.forEach(s => {
            const v = (sched[s.name] || {})[ds] || '';
            if (!isWork(v)) return;
            work++;
            if (CORE.has(s.name)) core = true;
            if (v === '1') one++;
            if (v === '3') third++;
            if (v === '10') { ten++; if (s.isFulltime) tenFt++; }
        });
        if (one !== 1) add('①の人数', `${ds} ${one}人`);
        if (ten > 0 && tenFt === 0) add('⑩が全員パート', `${ds}`);
        if (!core) add('コア全員休み', `${ds}`);
        const need = thirdByDate[ds] || 0;
        // ③は「指定人数ちょうど」。ただし休み希望で足された分は超えてよい
        const manualThird = staff.filter(s => (requests[ds] || {})[s.name] === '3').length;
        if (third < need) add('③が足りない', `${ds} ${third}/${need}`);
        if (third > need + manualThird) add('③が多い', `${ds} ${third}/${need}+指定${manualThird}`);
    });

    return bad;
}

// ------------------------------------------------------------- パターン
const SCENARIOS = {
    base:         { label: '本番と同じ設定' },
    pub7:         { label: '公休を全員7日', staffOpt: { pubHolidays: 7 } },
    pub10:        { label: '公休を全員10日', staffOpt: { pubHolidays: 10 } },
    fewstaff:     { label: 'スタッフ2名欠', staffOpt: { drop: ['清水', '柿林'] } },
    weekendlight: { label: '土日祝少なめ2名', staffOpt: { weekendLight: ['清水', '大野'] } },
    thirds:       { label: '③を休み希望で多数指定', extraThirdRequests: true },
    events:       { label: '行事日に③と人数を指定', eventOverrides: true }
};

function run(name, seedCount) {
    const sc = SCENARIOS[name];
    const months = [[2026,4],[2026,5],[2026,6],[2026,7],[2026,8],[2026,9]];
    const tally = {};
    let runs = 0, ms = 0, worst = 0, examples = [];

    for (const [y, m] of months) {
        for (let k = 0; k < seedCount; k++) {
            const seed = 100 + k * 613;
            const dates = datesOf(y, m);
            const staff = buildStaff(sc.staffOpt);
            const requests = JSON.parse(JSON.stringify(baseRequests));
            const thirdByDate = {}, minByDate = {};

            if (sc.extraThirdRequests) {
                // ③に入れる人・入れない人を混ぜて、行事日でない日にも指定する
                const targets = [['石川', 4], ['中川', 9], ['大野', 12], ['清水', 15], ['岡本梨', 18]];
                targets.forEach(([n, off]) => {
                    const d = dates[off];
                    if (!requests[d]) requests[d] = {};
                    if (!requests[d][n]) requests[d][n] = '3';
                });
            }
            if (sc.eventOverrides) {
                thirdByDate[dates[10]] = 2; minByDate[dates[10]] = 15; minByDate[dates[9]] = 13;
                thirdByDate[dates[20]] = 3; minByDate[dates[20]] = 14;
            }

            let res;
            const t0 = Date.now();
            try {
                res = E.generate({
                    dates, staff, requests, events: baseEvents, manualLocks: {},
                    isHolidayDate: isHoliday,
                    rules: {
                        weekdayMinimum: WEEKDAY_MIN, weekendMinimum: WEEKEND_MIN,
                        oneShiftCount: 1, tenShiftCount: 3,
                        minConsecutiveWork: 2, maxConsecutiveWork: 4,
                        allowFiveConsecutiveOnce: true, tenFulltimeRandom: false,
                        thirdShiftDefault: 0, thirdShiftByDate: thirdByDate,
                        minimumByDate: minByDate, busyDayBoost: 1, seed
                    }
                });
            } catch (e) {
                tally['エラー停止'] = (tally['エラー停止'] || 0) + 1;
                examples.push(`${y}-${m} seed${seed}: ${e.message}`);
                runs++;
                continue;
            }
            const el = Date.now() - t0;
            ms += el; worst = Math.max(worst, el); runs++;

            const bad = inspect(res, { dates, staff, requests, thirdByDate, minByDate, events: baseEvents });
            bad.forEach(b => {
                tally[b.kind] = (tally[b.kind] || 0) + 1;
                if (examples.length < 6) examples.push(`${y}-${m} seed${seed} [${b.kind}] ${b.msg}`);
            });
        }
    }
    return { runs, ms, worst, tally, examples };
}

// ------------------------------------------------------------- 実行
const only = process.argv[2];
const seedCount = parseInt(process.argv[3], 10) || 6;
const names = only && SCENARIOS[only] ? [only] : Object.keys(SCENARIOS);

console.log(`\n===== 自動生成の総点検（各パターン 6ヶ月 × ${seedCount}シード）=====\n`);
let grandBad = 0, grandRuns = 0;
const critical = ['指定破れ', 'エラー停止', '公休数ちがい', '①の人数', '①翌日出勤', '①前日⑩',
                  '⑩2連続', '⑩3連続', '⑩が全員パート', '希望休前日の⑩', 'コア全員休み',
                  '④が岡崎以外', '岡崎に⑥', '①資格なし', '⑩資格なし', '③資格なし',
                  '③が指定外の日', '誕生日が休みでない', '空欄'];

for (const name of names) {
    const r = run(name, seedCount);
    grandRuns += r.runs;
    const total = Object.values(r.tally).reduce((a, b) => a + b, 0);
    grandBad += total;
    const crit = Object.entries(r.tally).filter(([k]) => critical.includes(k));
    const minor = Object.entries(r.tally).filter(([k]) => !critical.includes(k));
    const mark = crit.length ? '❌' : (minor.length ? '△' : '✅');
    console.log(`${mark} ${name.padEnd(13)} ${SCENARIOS[name].label.padEnd(22)} ${r.runs}回 平均${Math.round(r.ms/r.runs)}ms 最大${r.worst}ms`);
    if (crit.length) console.log(`     重大: ${crit.map(([k,v]) => `${k}×${v}`).join(' / ')}`);
    if (minor.length) console.log(`     軽微: ${minor.map(([k,v]) => `${k}×${v}`).join(' / ')}`);
    if (crit.length && r.examples.length) r.examples.slice(0,3).forEach(e => console.log(`       例) ${e}`));
}
console.log(`\n合計 ${grandRuns}回生成 / 見つかった問題 ${grandBad}件`);
console.log('（重大＝お客さんと決めた絶対ルールの違反。軽微＝1勤や連勤など、指定の入り方で起きうるもの）\n');
