/*
 * シフト作るくん — 生成エンジン（2026-07-31 版）
 * ===========================================================================
 * 旧エンジン（generate.js 内の後処理パス25本の直列実行）を置き換える。
 *
 * 旧エンジンの問題:
 *   後のパスが前のパスの結果を壊す前提の作りで、ルールを1つ足すたびに
 *   パス同士の綱引きが増えていた（同じパスを3〜4回呼び直して辻褄を合わせていた）。
 *
 * 新エンジンの考え方:
 *   ルールを「絶対に破らない(hard)」「できれば守る(soft)」の重み付き減点として
 *   1つの採点関数にまとめる。あとは局所探索で点数を下げていくだけ。
 *   ルールが増えても、パスを足すのではなく採点に1項目足せばよい。
 *   守れなかったルールは採点関数がそのまま教えてくれるので、
 *   画面の警告と生成ロジックがズレない。
 *
 * 速度のため、内部は「名前×日付の文字列キー」ではなく
 * grid[スタッフ番号][日付番号] の二次元配列で持つ。
 *
 * このファイルは DOM に触らない。Node でもブラウザでも同じように動く。
 * ===========================================================================
 */
(function (global) {
    'use strict';

    // ------------------------------------------------------------ 値の定義
    // 内部は数値コードで扱う（文字列比較を避けて速くするため）
    const C = {
        BLANK: 0,      // 空欄（休み扱い。新エンジンでは原則作らない）
        PUBLIC: 1,     // 公休
        PAID: 2,       // 有休
        SPECIAL: 3,    // 特休
        BIRTHDAY: 4,   // 誕生日休（公休に含める）
        ONE: 10,       // ① 06:00-14:30
        THIRD: 11,     // ③ 07:00-15:30（行事の日のみ）
        FOURTH: 12,    // ④ 07:30-16:00（岡崎さんだけ）
        SIX: 13,       // ⑥ 08:30-17:00
        TEN: 14        // ⑩ 10:30-19:00
    };
    const CODE_TO_TEXT = {
        0: '', 1: '公', 2: '有', 3: '特', 4: '誕',
        10: '1', 11: '3', 12: '4', 13: '6', 14: '10'
    };
    const TEXT_TO_CODE = {
        '': C.BLANK, '公': C.PUBLIC, '休': C.PUBLIC, '有': C.PAID, '特': C.SPECIAL, '誕': C.BIRTHDAY,
        '1': C.ONE, '3': C.THIRD, '4': C.FOURTH, '6': C.SIX, '10': C.TEN
    };
    const WORK_MIN = 10;                       // これ以上は出勤
    const isWorkCode = c => c >= WORK_MIN;
    const isOffCode = c => c < WORK_MIN;
    const countsAsPublic = c => c === C.PUBLIC || c === C.BIRTHDAY;
    // 希望で入れた休み（この翌日は⑩を入れない）
    const isFixedOffCode = c => c === C.PUBLIC || c === C.PAID || c === C.SPECIAL;

    function toCode(text) {
        if (text === undefined || text === null) return C.BLANK;
        const t = String(text).trim();
        const c = TEXT_TO_CODE[t];
        if (c !== undefined) return c;
        // ②⑤⑦⑧⑨など、自動生成では使わないが手入力ではあり得る番号
        if (/^[2-9]$/.test(t)) return WORK_MIN + 100 + Number(t);
        return C.BLANK;
    }
    function toText(code) {
        if (CODE_TO_TEXT[code] !== undefined) return CODE_TO_TEXT[code];
        if (code > WORK_MIN + 100) return String(code - WORK_MIN - 100);
        return '';
    }

    // ------------------------------------------------------------ 小道具
    function makeRandom(seed) {
        // 再現できる乱数。同じ種なら同じシフトが出る（不具合を追いやすくするため）
        let s = (seed >>> 0) || 1;
        return function () {
            s ^= s << 13; s >>>= 0;
            s ^= s >> 17;
            s ^= s << 5; s >>>= 0;
            return s / 4294967296;
        };
    }

    // ------------------------------------------------------------ 減点の重み
    // 絶対制約は桁を大きく、努力目標は小さく。合計が小さいほど良いシフト。
    const W = {
        // 絶対に破らない
        publicCount: 100000,        // 公休日数が設定と違う
        oneCount: 60000,            // ①が毎日ちょうど1人でない
        oneNextDayWork: 60000,      // ①の翌日が出勤
        oneIneligible: 90000,       // ①に入れない人が①
        tenAllPart: 50000,          // ⑩が全員パート
        tenBeforeFixedOff: 40000,   // 希望休・有休・特休の前日に⑩
        tenTriple: 40000,           // ⑩3連続
        tenDouble: 20000,           // ⑩2連続（竹田・岩田美以外）
        singleWorkDay: 30000,       // 1勤（休→出勤→休）
        overConsecutive: 30000,     // 5連勤以上（許容1回を超えた分）
        coreCoverage: 25000,        // 梶本・田渕・北窪・八田が全員休み
        thirdIneligible: 90000,     // ③に入れない人が③
        thirdOnNonEvent: 40000,     // 行事の日でないのに③
        fourthWrongPerson: 90000,   // 岡崎さん以外が④

        // 崩してよい（お客さん指定の順）
        dailyShortage: 900,         // 1番目: その日の出勤が下限を1人下回るごと
        fiveConsecutiveOnce: 350,   // 2番目: 5連勤を1回だけ許す（その1回分）
        tenCount: 600,              // ⑩が3人に足りない
        thirdCount: 600,            // ③が指定人数に足りない

        // できれば
        tenFulltimeTwo: 40,         // ⑩の正社員が2人（1人が理想）
        tenFulltimeThree: 90,       // ⑩の正社員が3人
        tenFairness: 12,            // ⑩の回数の偏り
        oneFairness: 12,            // ①の回数の偏り
        blankCell: 25               // 空欄を作らない
    };

    // ==================================================================
    //  入力の正規化
    // ==================================================================
    function buildContext(input) {
        const dates = input.dates.slice();
        const nD = dates.length;
        const dateIndex = new Map(dates.map((d, i) => [d, i]));
        const isHolidayDate = input.isHolidayDate || (() => false);

        const rules = Object.assign({
            weekdayMinimum: 11,
            weekendMinimum: 10,
            oneShiftCount: 1,
            tenShiftCount: 3,
            maxConsecutiveWork: 4,
            minConsecutiveWork: 2,
            allowFiveConsecutiveOnce: true,
            thirdShiftByDate: {},
            thirdShiftDefault: 0,
            iterations: 60000,
            restarts: 3,
            seed: 20260731
        }, input.rules || {});

        const staff = input.staff.map((s, i) => ({
            index: i,
            name: s.name,
            isFulltime: !!s.isFulltime,
            isFulltimeCore: !!s.isFulltimeCore,
            isIrregular: !!s.isIrregular,
            manualOnly: !!s.manualOnly,
            canWorkOneShift: !!s.canWorkOneShift,
            canWorkTenShift: s.canWorkTenShift !== false,
            canWorkThirdShift: !!s.canWorkThirdShift,
            usesFourthShift: !!s.usesFourthShift,
            allowsConsecutiveTen: !!s.allowsConsecutiveTen,
            pubHolidays: Number(s.pubHolidays) || 0,
            birthday: s.birthday || ''
        }));
        const nS = staff.length;

        const minimum = new Int32Array(nD);
        const busyDay = new Uint8Array(nD);
        const events = input.events || {};
        for (let d = 0; d < nD; d++) {
            const key = dates[d];
            const day = new Date(key + 'T00:00:00').getDay();
            const weekendish = day === 0 || day === 6 || isHolidayDate(key);
            minimum[d] = weekendish ? rules.weekendMinimum : rules.weekdayMinimum;
            busyDay[d] = (events[key] && events[key].busyDay) ? 1 : 0;
        }

        // 行事の日ごとの③の必要人数
        const thirdNeed = new Int32Array(nD);
        for (let d = 0; d < nD; d++) {
            if (!busyDay[d]) { thirdNeed[d] = 0; continue; }
            const byDate = rules.thirdShiftByDate[dates[d]];
            thirdNeed[d] = byDate !== undefined ? byDate : rules.thirdShiftDefault;
        }

        return {
            dates, nD, dateIndex, staff, nS, rules,
            requests: input.requests || {}, events,
            minimum, busyDay, thirdNeed, isHolidayDate
        };
    }

    // ------------------------------------------------------------------
    //  「その人はどう頑張っても最大何連勤になるか」を先に計算する
    // ------------------------------------------------------------------
    //  指定休の入り方と公休の残り日数によっては、どう置いても
    //  5連勤・10連勤を避けられないことがある（お客さんが月前半に休みを
    //  固めて指定した場合など）。これを事前に知っておかないと、
    //  エンジンは直せないものを直そうとして時間を浪費し、
    //  画面には「守れませんでした」とだけ出て理由が分からない。
    //
    //  休みを「置けるぎりぎりまで遅らせる」貪欲法が最小本数になるので、
    //  上限Lを1から上げていって、最初に足りる L が答え。
    function minimumPossibleRun(nD, lockedRow, baseRow, quota, minRun) {
        //  上限Lで組めるかを、動的計画法で厳密に判定する。
        //  「1勤禁止」があるため貪欲法では判定できない
        //  （休みを置きたくても、直前の連勤が1日だと置けない）。
        //  状態は (何日目, 今の連勤日数, 使った公休の数)。
        //  月の初日から続く連勤と、月末で終わる連勤は前後の月とつながるので
        //  下限のチェックを免除する。
        const fits = (L) => {
            let cur = new Set([0 * (quota + 1) + 0]);   // run=0, used=0
            const enc = (run, used) => run * (quota + 1) + used;
            let startRun = true;                        // まだ月初の連勤の中か
            for (let d = 0; d < nD; d++) {
                const next = new Set();
                const isLocked = lockedRow[d] === 1;
                const lockedWork = isLocked && isWorkCode(baseRow[d]);
                const lockedOff = isLocked && !lockedWork;
                for (const st of cur) {
                    const run = Math.floor(st / (quota + 1));
                    const used = st % (quota + 1);
                    const canCloseRun = run === 0 || run >= minRun || (startRun && run > 0 && d - run === 0);
                    if (!lockedWork) {          // ここを休みにする
                        if (canCloseRun) {
                            if (lockedOff) next.add(enc(0, used));
                            else if (used < quota) next.add(enc(0, used + 1));
                        }
                    }
                    if (!lockedOff) {           // ここを出勤にする
                        if (run + 1 <= L) next.add(enc(run + 1, used));
                    }
                }
                if (!next.size) return false;
                cur = next;
                if (d === 0) startRun = true;
            }
            // 最後は、公休を使い切っていて、月末の連勤は下限を免除
            for (const st of cur) {
                const used = st % (quota + 1);
                if (used === quota) return true;
            }
            return false;
        };
        for (let L = 1; L <= nD; L++) if (fits(L)) return L;
        return Infinity;
    }


    // ==================================================================
    //  固定セル（指定・誕生日）を置く
    // ==================================================================
    function placeFixedCells(ctx, manualLocks) {
        const { dates, nD, staff, nS, requests } = ctx;
        const base = [];      // 固定セルだけ入った盤面
        const locked = [];    // 動かしてはいけないセル
        const source = [];    // 'request' | 'manual' | 'birthday'
        for (let s = 0; s < nS; s++) {
            base.push(new Int32Array(nD));
            locked.push(new Uint8Array(nD));
            source.push(new Array(nD).fill(null));
        }
        const notes = [];

        // 1. 希望入力（最優先。絶対に動かさない）
        for (let d = 0; d < nD; d++) {
            const dayReq = requests[dates[d]];
            if (!dayReq) continue;
            for (let s = 0; s < nS; s++) {
                const raw = dayReq[staff[s].name];
                if (raw === undefined || raw === null || raw === '') continue;
                base[s][d] = toCode(raw);
                locked[s][d] = 1;
                source[s][d] = 'request';
            }
        }

        // 2. 手動編集（再生成しても残す — お客さん確認済みの仕様変更）
        const manual = manualLocks || {};
        for (let s = 0; s < nS; s++) {
            const perStaff = manual[staff[s].name];
            if (!perStaff) continue;
            for (const dateStr of Object.keys(perStaff)) {
                const d = ctx.dateIndex.get(dateStr);
                if (d === undefined || locked[s][d]) continue;   // 希望入力のほうが強い
                base[s][d] = toCode(perStaff[dateStr]);
                locked[s][d] = 1;
                source[s][d] = 'manual';
            }
        }

        // 3. 誕生日休（人数が不足しても必ず休みにする＝絶対制約）
        for (let s = 0; s < nS; s++) {
            const st = staff[s];
            if (st.manualOnly || !st.birthday) continue;
            for (let d = 0; d < nD; d++) {
                if (dates[d].slice(5) !== st.birthday) continue;
                if (locked[s][d]) {
                    // 指定が入っている日は指定を優先する（ルール1: 指定は100%保持）
                    if (isWorkCode(base[s][d])) {
                        notes.push({
                            level: 'info', kind: 'birthday-overridden', staff: st.name, date: dates[d],
                            message: `${st.name}さんの誕生日ですが、${toText(base[s][d])}の指定が入っているため出勤のままにしました。`
                        });
                    }
                    continue;
                }
                base[s][d] = C.BIRTHDAY;
                locked[s][d] = 1;
                source[s][d] = 'birthday';
            }
        }

        // 4. 各人が「あと何日 公休を入れるか」
        const quota = new Int32Array(nS);
        for (let s = 0; s < nS; s++) {
            const st = staff[s];
            if (st.manualOnly) { quota[s] = 0; continue; }
            let already = 0, lockedDays = 0;
            for (let d = 0; d < nD; d++) {
                if (countsAsPublic(base[s][d])) already++;
                if (locked[s][d]) lockedDays++;
            }
            quota[s] = st.pubHolidays - already;
            if (quota[s] < 0) {
                notes.push({
                    level: 'warn', kind: 'public-over', staff: st.name,
                    message: `${st.name}さんは指定した休みだけで公休が${already}日になり、設定の${st.pubHolidays}日を超えています。設定を見直してください。`
                });
                quota[s] = 0;
            }
            const freeDays = nD - lockedDays;
            if (quota[s] > freeDays) {
                notes.push({
                    level: 'warn', kind: 'public-impossible', staff: st.name,
                    message: `${st.name}さんは公休${st.pubHolidays}日を入れる空きがありません（指定で${lockedDays}日埋まっています）。`
                });
                quota[s] = freeDays;
            }
        }

        // 各人の「どう置いても避けられない最大連勤」
        const consecutiveFloor = new Int32Array(nS);
        for (let s = 0; s < nS; s++) {
            const st = staff[s];
            if (st.manualOnly) { consecutiveFloor[s] = nD; continue; }
            const floor = minimumPossibleRun(nD, locked[s], base[s], quota[s], ctx.rules.minConsecutiveWork);
            consecutiveFloor[s] = floor;
            if (floor === Infinity) {
                // どんな置き方でも連勤ルールを満たせない（1勤禁止と公休日数がぶつかる）
                consecutiveFloor[s] = ctx.rules.maxConsecutiveWork;
                notes.push({
                    level: 'warn', kind: 'consecutive-unsatisfiable', staff: st.name,
                    message: `${st.name}さんは、指定された休みの入り方と公休${st.pubHolidays}日では、`
                        + `連勤${ctx.rules.minConsecutiveWork}〜${ctx.rules.maxConsecutiveWork}日のルールをどう組んでも満たせません。`
                        + `休み希望が1日おきに入っていないか確認してください。`
                });
            } else if (floor > ctx.rules.maxConsecutiveWork) {
                let lockedOff = 0;
                for (let d = 0; d < nD; d++) if (locked[s][d] && !isWorkCode(base[s][d])) lockedOff++;
                notes.push({
                    level: 'warn', kind: 'consecutive-impossible', staff: st.name,
                    message: `${st.name}さんは、指定された休み${lockedOff}日と公休${st.pubHolidays}日の入り方では、`
                        + `どう組んでも最大${floor}連勤になります（${ctx.rules.maxConsecutiveWork}連勤以内にできません）。`
                        + `休み希望を月内に散らすか、公休日数を増やしてください。`
                });
            }
        }

        // 指定休にはさまれた1日（そこは必ず「1勤」か「余分な休み」になる）
        for (let s = 0; s < nS; s++) {
            const st = staff[s];
            if (st.manualOnly) continue;
            for (let d = 1; d < nD - 1; d++) {
                if (locked[s][d]) continue;
                const prevOff = locked[s][d - 1] && !isWorkCode(base[s][d - 1]);
                const nextOff = locked[s][d + 1] && !isWorkCode(base[s][d + 1]);
                if (!prevOff || !nextOff) continue;
                notes.push({
                    level: 'warn', kind: 'isolated-day', staff: st.name, date: dates[d],
                    message: `${st.name}さんは ${dates[d - 1]} と ${dates[d + 1]} が休み希望のため、`
                        + `${dates[d]} が1日だけの出勤になるか、公休を1日多く使うことになります。`
                });
            }
        }

        // 希望休の翌日フラグ（⑩を入れてはいけない日）
        const noTenBefore = [];
        for (let s = 0; s < nS; s++) {
            const row = new Uint8Array(nD);
            for (let d = 0; d < nD - 1; d++) {
                if (locked[s][d + 1] && source[s][d + 1] === 'request' && isFixedOffCode(base[s][d + 1])) row[d] = 1;
            }
            noTenBefore.push(row);
        }

        return { base, locked, source, quota, notes, noTenBefore, consecutiveFloor };
    }

    // ==================================================================
    //  採点
    // ==================================================================
    function makeEvaluator(ctx, fixed) {
        const { nS, nD, staff, dates, rules, minimum, busyDay, thirdNeed } = ctx;
        const { locked, base, noTenBefore, consecutiveFloor } = fixed;

        const autoIdx = [], manualIdx = [];
        for (let s = 0; s < nS; s++) (staff[s].manualOnly ? manualIdx : autoIdx).push(s);

        // 自動対象外の人（中西さんなど）が指定で出勤している日は、
        // 人数だけでなく①③⑩の枠としても数える。
        // これを数えていないと「⑩が3人」の指定に自動で3人足して4人になってしまう。
        const manualWork = new Int32Array(nD);
        const manualTen = new Int32Array(nD);
        const manualTenFulltime = new Int32Array(nD);
        const manualOne = new Int32Array(nD);
        const manualThird = new Int32Array(nD);
        for (const s of manualIdx) {
            for (let d = 0; d < nD; d++) {
                const v = base[s][d];
                if (!isWorkCode(v)) continue;
                manualWork[d]++;
                if (v === C.TEN) { manualTen[d]++; if (staff[s].isFulltime) manualTenFulltime[d]++; }
                else if (v === C.ONE) manualOne[d]++;
                else if (v === C.THIRD) manualThird[d]++;
            }
        }

        // その日、どう頑張っても出せる最大人数（指定の休みは動かせないため）
        const maxPossibleWork = new Int32Array(nD);
        for (let d = 0; d < nD; d++) {
            let n = manualWork[d];
            for (const s of autoIdx) {
                if (locked[s][d] && !isWorkCode(base[s][d])) continue;   // 指定の休み
                n++;
            }
            maxPossibleWork[d] = n;
        }

        const oneEligible = autoIdx.filter(s => staff[s].canWorkOneShift);
        const tenEligible = autoIdx.filter(s => staff[s].canWorkTenShift);

        function evaluate(grid, collect) {
            let score = 0;
            const issues = collect ? [] : null;
            // extra.si / extra.di が指定セルを指しているときは「指定が原因」と印をつける。
            // 直せない warning（お客さんの入力どうしの矛盾）と、
            // エンジンが力及ばず守れなかった warning を画面で区別するため。
            const hit = (w, kind, level, message, extra) => {
                score += w;
                if (!issues) return;
                const item = Object.assign({ kind, level, message, weight: w }, extra || {});
                if (item.si !== undefined && item.di !== undefined) {
                    item.fromRequest = !!locked[item.si][item.di];
                    delete item.si; delete item.di;
                }
                issues.push(item);
            };

            // ---- 人ごと ----
            for (let k = 0; k < autoIdx.length; k++) {
                const s = autoIdx[k], st = staff[s], row = grid[s];
                let publicCount = 0, blanks = 0, longRuns = 0;
                let run = 0, tenRun = 0;

                for (let d = 0; d <= nD; d++) {
                    const v = d < nD ? row[d] : C.PUBLIC;
                    if (d < nD) {
                        if (countsAsPublic(v)) publicCount++;
                        else if (v === C.BLANK) blanks++;
                    }
                    if (d < nD && isWorkCode(v)) { run++; } else {
                        if (run > 0) {
                            const startsAtEdge = (d - run) === 0;
                            const endsAtEdge = d === nD;
                            // 月の境目は前後の月とつながるので判定しない
                            if (!startsAtEdge && !endsAtEdge && run < rules.minConsecutiveWork) {
                                hit(W.singleWorkDay, 'single-work-day', 'hard',
                                    `${st.name}さん ${dates[d - 1]} が1日だけの出勤（前後が休み）になっています。`,
                                    { staff: st.name, date: dates[d - 1], si: s, di: d - 1 });
                            }
                            // どう置いても避けられない長さは減点しない（直せないものを追いかけない）
                            const limit = Math.max(rules.maxConsecutiveWork, consecutiveFloor[s]);
                            if (run > limit) {
                                longRuns++;
                                if (rules.allowFiveConsecutiveOnce && run === limit + 1 && longRuns === 1) {
                                    hit(W.fiveConsecutiveOnce, 'five-consecutive-allowed', 'soft',
                                        `${st.name}さん ${dates[d - run]} から5連勤になりました（月1回までは許容）。`,
                                        { staff: st.name, date: dates[d - run], si: s, di: d - run });
                                } else {
                                    // 超えた日数に比例させる。同点だと探索が
                                    // 14連勤から6連勤へ向かう手がかりを失うため。
                                    hit(W.overConsecutive * (run - limit), 'over-consecutive', 'hard',
                                        `${st.name}さん ${dates[d - run]} から${run}連勤になっています。`,
                                        { staff: st.name, date: dates[d - run], si: s, di: d - run });
                                }
                            }
                        }
                        run = 0;
                    }

                    if (d < nD) {
                        // ⑩の連続
                        if (v === C.TEN) {
                            tenRun++;
                            if (tenRun === 2 && !st.allowsConsecutiveTen) {
                                hit(W.tenDouble, 'ten-double', 'hard',
                                    `${st.name}さん ${dates[d - 1]}〜${dates[d]} で⑩が2日続いています。`,
                                    { staff: st.name, date: dates[d], si: s, di: d });
                            } else if (tenRun >= 3) {
                                hit(W.tenTriple, 'ten-triple', 'hard',
                                    `${st.name}さん ${dates[d - 2]}〜${dates[d]} で⑩が3日続いています。`,
                                    { staff: st.name, date: dates[d], si: s, di: d });
                            }
                            // 希望休の前日は⑩を入れない
                            if (noTenBefore[s][d]) {
                                hit(W.tenBeforeFixedOff, 'ten-before-off', 'hard',
                                    `${st.name}さん ${dates[d]} の⑩は、翌日が希望休のため入れられません。`,
                                    { staff: st.name, date: dates[d], si: s, di: d });
                            }
                        } else tenRun = 0;

                        // ①の翌日は休み
                        if (v === C.ONE && d + 1 < nD && isWorkCode(row[d + 1])) {
                            hit(W.oneNextDayWork, 'one-next-day-work', 'hard',
                                `${st.name}さん ${dates[d]} の①の翌日が出勤になっています。`,
                                { staff: st.name, date: dates[d], si: s, di: d });
                        }
                    }
                }

                if (publicCount !== st.pubHolidays) {
                    hit(W.publicCount * Math.abs(publicCount - st.pubHolidays), 'public-count', 'hard',
                        `${st.name}さんの公休が${publicCount}日で、設定の${st.pubHolidays}日と違います。`,
                        { staff: st.name });
                }
                if (blanks) {
                    hit(W.blankCell * blanks, 'blank-cell', 'soft',
                        `${st.name}さんに空欄が${blanks}日あります。`, { staff: st.name });
                }
            }

            // ---- 日ごと ----
            for (let d = 0; d < nD; d++) {
                let workCount = manualWork[d];
                let tenTotal = manualTen[d], tenFulltime = manualTenFulltime[d];
                let oneTotal = manualOne[d], thirdTotal = manualThird[d];
                let coreWorking = false;

                for (let k = 0; k < autoIdx.length; k++) {
                    const s = autoIdx[k], v = grid[s][d];
                    if (!isWorkCode(v)) continue;
                    const st = staff[s];
                    workCount++;
                    if (st.isFulltimeCore) coreWorking = true;
                    if (v === C.TEN) { tenTotal++; if (st.isFulltime) tenFulltime++; }
                    else if (v === C.ONE) {
                        oneTotal++;
                        if (!st.canWorkOneShift) hit(W.oneIneligible, 'one-ineligible', 'hard',
                            `${dates[d]} の①に${st.name}さんが入っていますが、①に参加しない設定です。`,
                            { staff: st.name, date: dates[d] });
                    }
                    else if (v === C.THIRD) {
                        thirdTotal++;
                        if (!st.canWorkThirdShift) hit(W.thirdIneligible, 'third-ineligible', 'hard',
                            `${dates[d]} の③に${st.name}さんが入っていますが、③に入れない人です。`,
                            { staff: st.name, date: dates[d] });
                    }
                    else if (v === C.FOURTH && !st.usesFourthShift) {
                        hit(W.fourthWrongPerson, 'fourth-wrong-person', 'hard',
                            `${dates[d]} に${st.name}さんが④になっています（④は岡崎さんだけ）。`,
                            { staff: st.name, date: dates[d] });
                    }
                    // 岡崎さんの通常勤務は⑥ではなく④。⑩に入る日以外は④にする
                    else if (v === C.SIX && st.usesFourthShift) {
                        hit(W.fourthWrongPerson, 'fourth-should-be-used', 'hard',
                            `${dates[d]} の${st.name}さんが⑥になっています（通常は④です）。`,
                            { staff: st.name, date: dates[d], si: s, di: d });
                    }
                }

                // 指定だけで休みが埋まっていて、全員出しても下限に届かない日は減点しない
                const reachable = maxPossibleWork[d];
                if (workCount < minimum[d] && workCount < reachable) {
                    hit(W.dailyShortage * (Math.min(minimum[d], reachable) - workCount), 'daily-shortage', 'soft',
                        `${dates[d]} の出勤が${workCount}人で、下限の${minimum[d]}人に${minimum[d] - workCount}人足りません。`,
                        { date: dates[d] });
                }
                if (!coreWorking) {
                    hit(W.coreCoverage, 'core-coverage', 'hard',
                        `${dates[d]} は梶本・田渕・北窪・八田さんが全員休みになっています。`, { date: dates[d] });
                }
                if (oneTotal !== rules.oneShiftCount) {
                    hit(W.oneCount * Math.abs(oneTotal - rules.oneShiftCount), 'one-count', 'hard',
                        `${dates[d]} の①が${oneTotal}人です（${rules.oneShiftCount}人にしてください）。`, { date: dates[d] });
                }
                if (tenTotal !== rules.tenShiftCount) {
                    hit(W.tenCount * Math.abs(tenTotal - rules.tenShiftCount), 'ten-count', 'soft',
                        `${dates[d]} の⑩が${tenTotal}人です（${rules.tenShiftCount}人が目標）。`, { date: dates[d] });
                }
                if (tenTotal > 0) {
                    if (tenFulltime === 0) {
                        hit(W.tenAllPart, 'ten-all-part', 'hard',
                            `${dates[d]} の⑩が全員パートになっています（正社員を1人以上入れてください）。`, { date: dates[d] });
                    } else if (tenFulltime === 2) {
                        hit(W.tenFulltimeTwo, 'ten-fulltime-2', 'soft',
                            `${dates[d]} の⑩の正社員が2人になりました（1人が理想）。`, { date: dates[d] });
                    } else if (tenFulltime >= 3) {
                        hit(W.tenFulltimeThree, 'ten-fulltime-3', 'soft',
                            `${dates[d]} の⑩が正社員${tenFulltime}人になりました（1人が理想）。`, { date: dates[d] });
                    }
                }
                if (!busyDay[d] && thirdTotal > 0) {
                    hit(W.thirdOnNonEvent * thirdTotal, 'third-on-non-event', 'hard',
                        `${dates[d]} は行事の日ではないのに③が入っています。`, { date: dates[d] });
                }
                if (thirdNeed[d] > thirdTotal) {
                    hit(W.thirdCount * (thirdNeed[d] - thirdTotal), 'third-count', 'soft',
                        `${dates[d]} の③が${thirdTotal}人で、指定の${thirdNeed[d]}人に足りません。`, { date: dates[d] });
                } else if (busyDay[d] && thirdTotal > thirdNeed[d]) {
                    // 行事の日の③は「指定人数ちょうど」。多い分も戻す。
                    // 足りない側しか見ていなかったため、③が必要以上に増えていた。
                    hit(W.thirdCount * (thirdTotal - thirdNeed[d]), 'third-over', 'soft',
                        `${dates[d]} の③が${thirdTotal}人で、指定の${thirdNeed[d]}人より多く入っています。`, { date: dates[d] });
                }
            }

            // ---- 公平性 ----
            score += spread(grid, tenEligible, C.TEN) * W.tenFairness;
            score += spread(grid, oneEligible, C.ONE) * W.oneFairness;

            return collect ? { score, issues } : score;
        }

        function spread(grid, pool, code) {
            if (pool.length < 2) return 0;
            let max = -1, min = 1e9;
            for (let k = 0; k < pool.length; k++) {
                const row = grid[pool[k]];
                let c = 0;
                for (let d = 0; d < nD; d++) if (row[d] === code) c++;
                if (c > max) max = c;
                if (c < min) min = c;
            }
            return max - min;
        }

        return { evaluate, autoIdx, manualIdx, oneEligible, tenEligible };
    }

    global.ShiftEngine = {
        CODES: C, W, toCode, toText, isWorkCode, isOffCode, countsAsPublic, isFixedOffCode,
        makeRandom, buildContext, placeFixedCells, makeEvaluator
    };
})(typeof window !== 'undefined' ? window : globalThis);

/*
 * ===========================================================================
 *  解を作る（初期解 → 局所探索）
 * ===========================================================================
 */
(function (global) {
    'use strict';
    const E = global.ShiftEngine;
    const C = E.CODES;
    const { isWorkCode, countsAsPublic } = E;

    // ------------------------------------------------------------ 初期解
    function buildInitial(ctx, fixed, rand) {
        const { nS, nD, staff, rules, minimum, busyDay, thirdNeed } = ctx;
        const { base, locked, quota } = fixed;

        const grid = [];
        for (let s = 0; s < nS; s++) grid.push(Int32Array.from(base[s]));

        // 1. 自動対象者の空きセルを、いったん全部「出勤(⑥)」にする
        const autoIdx = [];
        for (let s = 0; s < nS; s++) {
            if (staff[s].manualOnly) continue;
            autoIdx.push(s);
            for (let d = 0; d < nD; d++) if (!locked[s][d]) grid[s][d] = C.SIX;
        }

        // 2. 公休を置く。連勤が長いところを優先して切り、人数に余裕のある日から使う
        for (const s of autoIdx) {
            let need = quota[s];
            while (need > 0) {
                let bestD = -1, bestScore = -Infinity;
                for (let d = 0; d < nD; d++) {
                    if (locked[s][d] || !isWorkCode(grid[s][d])) continue;
                    // その日の出勤人数の余裕
                    let count = 0;
                    for (let t = 0; t < nS; t++) if (isWorkCode(grid[t][d])) count++;
                    const surplus = count - minimum[d];
                    // 今この人が何連勤の途中か（長いほど切りたい）
                    let runLen = 1;
                    for (let k = d - 1; k >= 0 && isWorkCode(grid[s][k]); k--) runLen++;
                    for (let k = d + 1; k < nD && isWorkCode(grid[s][k]); k++) runLen++;
                    const v = surplus * 2 + runLen * 3 + rand() * 3;
                    if (v > bestScore) { bestScore = v; bestD = d; }
                }
                if (bestD < 0) break;
                grid[s][bestD] = C.PUBLIC;
                need--;
            }
        }

        // 3. 出勤日に区分を割り当てる（公休は増やさない＝日数を崩さない）
        assignTypes(ctx, fixed, grid, rand, autoIdx);
        return grid;
    }

    function assignTypes(ctx, fixed, grid, rand, autoIdx) {
        const { nD, nS, staff, rules, thirdNeed } = ctx;
        const { locked } = fixed;

        for (let d = 0; d < nD; d++) {
            const working = [];
            for (const s of autoIdx) if (!locked[s][d] && isWorkCode(grid[s][d])) working.push(s);
            if (!working.length) continue;
            // 日ごとに順番を散らす
            for (let i = working.length - 1; i > 0; i--) {
                const j = Math.floor(rand() * (i + 1));
                [working[i], working[j]] = [working[j], working[i]];
            }
            const done = new Set();

            // ③ — 行事の日だけ
            if (thirdNeed[d] > 0) {
                let placed = 0;
                for (const s of working) {
                    if (placed >= thirdNeed[d]) break;
                    if (!staff[s].canWorkThirdShift || done.has(s)) continue;
                    grid[s][d] = C.THIRD; done.add(s); placed++;
                }
            }

            // ① — 翌日が休みの人だけを候補にする（公休は増やさない）
            let onePlaced = 0;
            for (const s of working) {
                if (onePlaced >= rules.oneShiftCount) break;
                if (done.has(s) || !staff[s].canWorkOneShift) continue;
                const next = d + 1;
                if (next < nD && isWorkCode(grid[s][next]) ) continue;   // 翌日が出勤なら①にしない
                grid[s][d] = C.ONE; done.add(s); onePlaced++;
            }

            // ⑩ — 正社員1人＋パート2人を狙う。足りなければ正社員を足す
            const ft = [], pt = [];
            for (const s of working) {
                if (done.has(s) || !staff[s].canWorkTenShift) continue;
                if (fixed.noTenBefore[s][d]) continue;                    // 希望休の前日は⑩に入れない
                (staff[s].isFulltime ? ft : pt).push(s);
            }
            const chosen = [];
            if (ft.length) chosen.push(ft.shift());
            while (chosen.length < rules.tenShiftCount && pt.length) chosen.push(pt.shift());
            while (chosen.length < rules.tenShiftCount && ft.length) chosen.push(ft.shift());
            for (const s of chosen) { grid[s][d] = C.TEN; done.add(s); }

            // ④ — 岡崎さんだけ。⑩などに選ばれていなければ④
            for (const s of working) {
                if (done.has(s) || !staff[s].usesFourthShift) continue;
                grid[s][d] = C.FOURTH; done.add(s);
            }

            // 残りは⑥
            for (const s of working) if (!done.has(s)) grid[s][d] = C.SIX;
        }
    }

    // ------------------------------------------------------------ 局所探索
    function refine(ctx, fixed, grid, evaluate, rand, iterations) {
        const { nS, nD, staff, rules } = ctx;
        const { locked } = fixed;

        const autoIdx = [];
        for (let s = 0; s < nS; s++) if (!staff[s].manualOnly) autoIdx.push(s);
        if (!autoIdx.length) return { grid, score: evaluate(grid) };

        // 人ごとの「動かせる日」を先に出しておく
        const freeDays = [];
        for (let s = 0; s < nS; s++) {
            const list = [];
            for (let d = 0; d < nD; d++) if (!locked[s][d]) list.push(d);
            freeDays.push(list);
        }

        const workTypes = [C.SIX, C.TEN, C.ONE];
        // その人の「ふつうの出勤」。岡崎さんだけ④、ほかは⑥。
        const normalWork = new Int32Array(nS);
        for (let s2 = 0; s2 < nS; s2++) normalWork[s2] = staff[s2].usesFourthShift ? C.FOURTH : C.SIX;
        let current = grid;
        let currentScore = evaluate(current);
        let best = current.map(r => Int32Array.from(r));
        let bestScore = currentScore;

        const undoS = new Int32Array(8), undoD = new Int32Array(8), undoV = new Int32Array(8);
        let undoN = 0;
        const put = (s, d, v) => { undoS[undoN] = s; undoD[undoN] = d; undoV[undoN] = current[s][d]; undoN++; current[s][d] = v; };
        const rollback = () => { for (let k = undoN - 1; k >= 0; k--) current[undoS[k]][undoD[k]] = undoV[k]; };

        const pickFrom = arr => arr[(rand() * arr.length) | 0];

        for (let it = 0; it < iterations; it++) {
            undoN = 0;
            const temp = Math.max(0.5, 500 * (1 - it / iterations));
            const s = pickFrom(autoIdx);
            const days = freeDays[s];
            if (days.length < 2) continue;
            const roll = rand();

            if (roll < 0.40) {
                // 手1: 同じ人の「休み」と「出勤」を入れ替える（公休日数は変わらない）
                let offD = -1, workD = -1;
                for (let tries = 0; tries < 12 && (offD < 0 || workD < 0); tries++) {
                    const d = pickFrom(days);
                    if (offD < 0 && countsAsPublic(current[s][d])) offD = d;
                    else if (workD < 0 && isWorkCode(current[s][d])) workD = d;
                }
                if (offD < 0 || workD < 0) continue;
                put(s, offD, normalWork[s]);
                put(s, workD, C.PUBLIC);
            } else if (roll < 0.70) {
                // 手2: 出勤している人の区分を変える
                let d = -1;
                for (let tries = 0; tries < 12; tries++) {
                    const x = pickFrom(days);
                    if (isWorkCode(current[s][x])) { d = x; break; }
                }
                if (d < 0) continue;
                let v = workTypes[(rand() * workTypes.length) | 0];
                if (v === C.ONE && !staff[s].canWorkOneShift) v = C.SIX;
                if (v === C.TEN && !staff[s].canWorkTenShift) v = C.SIX;
                if (v === C.SIX && staff[s].usesFourthShift) v = C.FOURTH;
                if (ctx.busyDay[d] && ctx.thirdNeed[d] > 0 && staff[s].canWorkThirdShift && rand() < 0.3) v = C.THIRD;
                put(s, d, v);
            } else if (roll < 0.90) {
                // 手3: 同じ日の2人で区分を交換する
                const d = (rand() * nD) | 0;
                const pool = [];
                for (const t of autoIdx) if (!locked[t][d] && isWorkCode(current[t][d])) pool.push(t);
                if (pool.length < 2) continue;
                const a = pickFrom(pool), b = pickFrom(pool);
                if (a === b) continue;
                const va = current[a][d], vb = current[b][d];
                if (va === vb) continue;
                if (vb === C.ONE && !staff[a].canWorkOneShift) continue;
                if (va === C.ONE && !staff[b].canWorkOneShift) continue;
                if (vb === C.THIRD && !staff[a].canWorkThirdShift) continue;
                if (va === C.THIRD && !staff[b].canWorkThirdShift) continue;
                if (vb === C.FOURTH && !staff[a].usesFourthShift) continue;
                if (va === C.FOURTH && !staff[b].usesFourthShift) continue;
                if (vb === C.TEN && !staff[a].canWorkTenShift) continue;
                if (va === C.TEN && !staff[b].canWorkTenShift) continue;
                // 岡崎さんに⑥を渡さない（通常勤務は④）
                if (vb === C.SIX && staff[a].usesFourthShift) continue;
                if (va === C.SIX && staff[b].usesFourthShift) continue;
                put(a, d, vb);
                put(b, d, va);
            } else if (roll < 0.96) {
                // 手5: 長すぎる連勤の真ん中に休みを差し込む（狙い撃ちの修理）
                //   ランダムな手だけだと、11連勤のような大きな崩れを直すのに
                //   都合のよい一手が引けるまで待つことになる。ここは直接ほぐす。
                let start = -1, len = 0, run = 0;
                for (let d = 0; d <= nD; d++) {
                    const w = d < nD && isWorkCode(current[s][d]);
                    if (w) { run++; continue; }
                    if (run > len) { len = run; start = d - run; }
                    run = 0;
                }
                if (len <= rules.maxConsecutiveWork || start < 0) continue;
                // その連勤のなかで動かせる日を探す
                const inside = [];
                for (let d = start; d < start + len; d++) if (!locked[s][d]) inside.push(d);
                if (!inside.length) continue;
                const target = inside[(rand() * inside.length) | 0];
                // 埋め合わせに、別の場所の休みを1つ出勤へ回す（公休日数を保つ）
                let donor = -1;
                for (let tries = 0; tries < 20 && donor < 0; tries++) {
                    const x = pickFrom(days);
                    if (x >= start && x < start + len) continue;
                    if (countsAsPublic(current[s][x])) donor = x;
                }
                if (donor < 0) continue;
                put(s, target, C.PUBLIC);
                put(s, donor, normalWork[s]);
            } else if (roll < 0.98) {
                // 手6: 1日だけの出勤（前後が休み）を、休みに変えてほぐす
                let target = -1;
                for (let d = 1; d < nD - 1; d++) {
                    if (locked[s][d]) continue;
                    if (isWorkCode(current[s][d]) && !isWorkCode(current[s][d - 1]) && !isWorkCode(current[s][d + 1])) { target = d; break; }
                }
                if (target < 0) continue;
                // 隣り合う休みのどちらかを出勤に回して、2連勤以上にする
                const side = (rand() < 0.5 ? target - 1 : target + 1);
                if (side < 0 || side >= nD || locked[s][side] || !countsAsPublic(current[s][side])) continue;
                put(s, side, normalWork[s]);
            } else {
                // 手7: 同じ日で2人の休み／出勤を交換する（その日の人数を保ったまま入れ替え）
                const d = (rand() * nD) | 0;
                const offs = [], works = [];
                for (const t of autoIdx) {
                    if (locked[t][d]) continue;
                    if (countsAsPublic(current[t][d])) offs.push(t);
                    else if (isWorkCode(current[t][d])) works.push(t);
                }
                if (!offs.length || !works.length) continue;
                const a = pickFrom(offs), b = pickFrom(works);
                // それぞれ別の日で埋め合わせて公休日数を保つ
                let aWork = -1, bOff = -1;
                for (let tries = 0; tries < 12 && aWork < 0; tries++) {
                    const x = pickFrom(freeDays[a]);
                    if (x !== d && isWorkCode(current[a][x])) aWork = x;
                }
                for (let tries = 0; tries < 12 && bOff < 0; tries++) {
                    const x = pickFrom(freeDays[b]);
                    if (x !== d && countsAsPublic(current[b][x])) bOff = x;
                }
                if (aWork < 0 || bOff < 0) continue;
                put(a, d, normalWork[a]);
                put(a, aWork, C.PUBLIC);
                put(b, d, C.PUBLIC);
                put(b, bOff, normalWork[b]);
            }

            const next = evaluate(current);
            const delta = next - currentScore;
            if (delta <= 0 || rand() < Math.exp(-delta / temp)) {
                currentScore = next;
                if (next < bestScore) {
                    bestScore = next;
                    for (let k = 0; k < nS; k++) best[k].set(current[k]);
                }
            } else {
                rollback();
            }
        }
        return { grid: best, score: bestScore };
    }

    // ------------------------------------------------------------ 入口
    function generate(input) {
        const started = Date.now();
        const ctx = E.buildContext(input);
        const fixed = E.placeFixedCells(ctx, input.manualLocks);
        const ev = E.makeEvaluator(ctx, fixed);

        // 何回か作り直して一番良かったものを採用する
        // 絶対制約（重み1万以上）が残っているうちは、手数を増やしてやり直す。
        // 1回で決まる月は速く終わり、難しい月だけ粘る。
        //  ・絶対制約が残っていなければ即終了（ふつうの月は1回で終わる）
        //  ・残っていても、やり直して良くならないなら打ち切る
        //    （指定だけで詰んでいる月を延々と回さないため）
        const HARD_FLOOR = 10000;
        let best = null;
        const restarts = Math.max(1, ctx.rules.restarts);
        for (let r = 0; r < restarts; r++) {
            const rand = E.makeRandom(ctx.rules.seed + r * 7919);
            const initial = buildInitial(ctx, fixed, rand);
            const out = refine(ctx, fixed, initial, ev.evaluate, rand, ctx.rules.iterations);
            const improved = !best || out.score < best.score;
            if (improved) best = out;
            if (best.score < HARD_FLOOR) break;
            if (r > 0 && !improved) break;
        }

        const final = ev.evaluate(best.grid, true);

        // 指定セルが動いていないことを最後に必ず確かめる（ルール1の砦）
        const brokenLocks = [];
        for (let s = 0; s < ctx.nS; s++) {
            for (let d = 0; d < ctx.nD; d++) {
                if (!fixed.locked[s][d]) continue;
                if (best.grid[s][d] !== fixed.base[s][d]) {
                    brokenLocks.push({
                        staff: ctx.staff[s].name, date: ctx.dates[d],
                        expected: E.toText(fixed.base[s][d]), got: E.toText(best.grid[s][d])
                    });
                }
            }
        }

        // 文字列の盤面に戻す
        const schedule = {};
        for (let s = 0; s < ctx.nS; s++) {
            const row = {};
            for (let d = 0; d < ctx.nD; d++) row[ctx.dates[d]] = E.toText(best.grid[s][d]);
            schedule[ctx.staff[s].name] = row;
        }
        const lockInfo = {};
        for (let s = 0; s < ctx.nS; s++) {
            const row = {};
            for (let d = 0; d < ctx.nD; d++) if (fixed.locked[s][d]) row[ctx.dates[d]] = fixed.source[s][d];
            lockInfo[ctx.staff[s].name] = row;
        }

        return {
            schedule, lockInfo,
            score: best.score,
            issues: final.issues,
            notes: fixed.notes,
            brokenLocks,
            elapsedMs: Date.now() - started
        };
    }

    E.generate = generate;
    E.buildInitial = buildInitial;
    E.refine = refine;
})(typeof window !== 'undefined' ? window : globalThis);
