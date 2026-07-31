/*
 * シフト作るくん — バックアップ機構
 * ---------------------------------------------------------------------------
 * このアプリのデータは全部ブラウザの localStorage にある。
 * localStorage は次のどれかで「一瞬で全部消える」:
 *   ・ブラウザの「閲覧データを削除」
 *   ・別のブラウザ / 別プロファイル / シークレットウィンドウで開く
 *   ・localhost と 127.0.0.1 を混ぜて開く（別サイト扱いになる）
 *   ・OS 再セットアップ、ブラウザ再インストール
 *
 * そこでこのファイルが、データが変わるたびにローカルサーバーへ送り、
 * フォルダ内の backups/ に実ファイルとして残す。
 *
 * 重要: このスクリプトは各ページの他のスクリプトより「先に」読み込むこと。
 *       アプリが localStorage を書き換える前の状態を記録するため。
 */
(function () {
    'use strict';

    var PREFIX = 'shiftApp_';
    var OWN_PREFIX = 'shiftBackup_';
    var SCHEMA_VERSION = 1;
    var DEBOUNCE_MS = 2500;
    var META_KEY = OWN_PREFIX + 'meta';

    var state = {
        // 'unknown' → 判定前 / 'server' → ローカルサーバーあり（自動保存できる）
        // 'manual'  → 公開サイト等でサーバーの保存先がない（手動の書き出しのみ）
        mode: 'unknown',
        serverRoot: null,
        serverAvailable: null,
        lastSavedAt: null,
        lastError: null,
        pending: null,
        inFlight: false,
        bannerDismissed: false
    };

    // 手動書き出しを促す間隔（この日数を過ぎたらやさしく知らせる）
    var EXPORT_REMIND_DAYS = 7;

    // --- localStorage の生アクセス（パッチ前の関数を確保） -------------------
    var rawSetItem = localStorage.setItem.bind(localStorage);
    var rawRemoveItem = localStorage.removeItem.bind(localStorage);
    var rawGetItem = localStorage.getItem.bind(localStorage);

    function appKeys() {
        var keys = [];
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (key && key.indexOf(PREFIX) === 0) keys.push(key);
        }
        return keys.sort();
    }

    /** 現在の localStorage の中身をそのまま（文字列のまま）集める */
    function collect() {
        var data = {};
        appKeys().forEach(function (key) {
            data[key] = rawGetItem(key);
        });
        return {
            schemaVersion: SCHEMA_VERSION,
            app: 'シフト作るくん',
            savedAt: new Date().toISOString(),
            origin: location.origin,
            page: location.pathname,
            userAgent: navigator.userAgent,
            data: data
        };
    }

    function totalBytes(payload) {
        var sum = 0;
        Object.keys(payload.data || {}).forEach(function (key) {
            sum += key.length + String(payload.data[key] || '').length;
        });
        return sum;
    }

    function readMeta() {
        try {
            return JSON.parse(rawGetItem(META_KEY)) || {};
        } catch (e) {
            return {};
        }
    }

    function writeMeta(meta) {
        try {
            rawSetItem(META_KEY, JSON.stringify(meta));
        } catch (e) {
            /* 容量オーバーでも本体機能は止めない */
        }
    }

    // --- サーバーへ送る -----------------------------------------------------
    function sendToServer(source) {
        var payload = collect();
        payload.source = source || 'auto';

        state.inFlight = true;
        return fetch('/__shift_backup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            cache: 'no-store'
        }).then(function (res) {
            return res.json().catch(function () { return { ok: false, error: 'bad response' }; });
        }).then(function (result) {
            state.inFlight = false;
            if (!result || result.ok !== true) {
                state.serverAvailable = false;
                state.lastError = (result && result.error) || '保存に失敗しました';
                renderStatus();
                return result;
            }
            state.serverAvailable = true;
            state.lastError = null;
            if (!result.skipped) {
                state.lastSavedAt = new Date().toISOString();
                var meta = readMeta();
                meta.lastSavedAt = state.lastSavedAt;
                meta.lastFile = result.saved || meta.lastFile || '';
                meta.bytes = totalBytes(payload);
                writeMeta(meta);
                flashBadge('バックアップ保存');
            }
            renderStatus();
            return result;
        }).catch(function (error) {
            state.inFlight = false;
            state.serverAvailable = false;
            state.lastError = String(error && error.message ? error.message : error);
            renderStatus();
            return { ok: false, error: state.lastError };
        });
    }

    /** 保存先がない環境用: 「書き出していない変更」を数えておく */
    function countUnsavedChange(n) {
        var meta = readMeta();
        meta.changesSinceExport = (meta.changesSinceExport || 0) + (n || 1);
        writeMeta(meta);
        renderStatus();
    }

    function scheduleSend(source) {
        if (state.mode === 'manual') {
            countUnsavedChange(1);
            return;
        }
        // まだ mode を判定中の場合もここに来る。
        // 判定後に manual だと分かったら、送信ではなく変更カウントに回す。
        state.pendingCount = (state.pendingCount || 0) + 1;
        if (state.pending) clearTimeout(state.pending);
        state.pending = setTimeout(function () {
            state.pending = null;
            var queued = state.pendingCount || 0;
            state.pendingCount = 0;
            if (state.mode === 'manual') {
                countUnsavedChange(queued);
                return;
            }
            sendToServer(source || 'change');
        }, DEBOUNCE_MS);
    }

    /** 保存先サーバーがあるかを1回だけ調べる */
    function detectMode() {
        if (location.protocol === 'file:') {
            state.mode = 'manual';
            return Promise.resolve(state.mode);
        }
        return fetch('/__shift_dev_root', { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('no server')); })
            .then(function (json) {
                state.mode = 'server';
                state.serverRoot = json.root || null;
                return state.mode;
            })
            .catch(function () {
                state.mode = 'manual';
                return state.mode;
            });
    }

    function daysSince(iso) {
        if (!iso) return null;
        var t = new Date(iso).getTime();
        if (isNaN(t)) return null;
        return Math.floor((Date.now() - t) / 86400000);
    }

    // --- localStorage 書き込みを監視 ----------------------------------------
    // 各画面のコードを1行も変えずに、全部の保存を拾うためのフック。
    localStorage.setItem = function (key, value) {
        rawSetItem(key, value);
        if (typeof key === 'string' && key.indexOf(PREFIX) === 0) {
            scheduleSend('change');
        }
    };
    localStorage.removeItem = function (key) {
        rawRemoveItem(key);
        if (typeof key === 'string' && key.indexOf(PREFIX) === 0) {
            scheduleSend('change');
        }
    };

    // --- ファイルへの書き出し / 読み込み ------------------------------------
    function exportToFile() {
        var payload = collect();
        payload.source = 'manual';
        var stamp = new Date();
        var pad = function (n) { return String(n).padStart(2, '0'); };
        var name = 'shift_backup_' + stamp.getFullYear() + pad(stamp.getMonth() + 1) + pad(stamp.getDate())
            + '-' + pad(stamp.getHours()) + pad(stamp.getMinutes()) + '.json';

        var blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);

        var meta = readMeta();
        meta.lastExportAt = new Date().toISOString();
        meta.changesSinceExport = 0;
        writeMeta(meta);
        state.bannerDismissed = true;
        renderStatus();
        return name;
    }

    /** 復元。既存データは復元直前に safety バックアップを取ってから置き換える。 */
    function restoreFromPayload(payload, options) {
        options = options || {};
        if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
            throw new Error('バックアップの形式が正しくありません');
        }
        var incoming = payload.data;
        var incomingKeys = Object.keys(incoming).filter(function (k) { return k.indexOf(PREFIX) === 0; });
        if (!incomingKeys.length) {
            throw new Error('復元できるデータが入っていません');
        }

        // 念のため、上書き前の状態をサーバーに残す（同期を待つ）
        var before = sendToServer('prerestore');

        return Promise.resolve(before).then(function () {
            if (options.replaceAll !== false) {
                appKeys().forEach(function (key) {
                    if (incomingKeys.indexOf(key) === -1) rawRemoveItem(key);
                });
            }
            incomingKeys.forEach(function (key) {
                var value = incoming[key];
                if (value === null || value === undefined) {
                    rawRemoveItem(key);
                } else {
                    rawSetItem(key, String(value));
                }
            });
            return sendToServer('restored');
        }).then(function () {
            return incomingKeys;
        });
    }

    function readFile(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () {
                try {
                    resolve(JSON.parse(String(reader.result)));
                } catch (e) {
                    reject(new Error('JSONとして読めませんでした'));
                }
            };
            reader.onerror = function () { reject(new Error('ファイルを読めませんでした')); };
            reader.readAsText(file);
        });
    }

    function importFromFile(file) {
        return readFile(file).then(function (payload) {
            return restoreFromPayload(payload);
        });
    }

    // --- サーバー上のバックアップ一覧 / 復元 --------------------------------
    function listServerBackups() {
        return fetch('/__shift_backup_list', { cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (r) {
                state.serverAvailable = !!(r && r.ok);
                renderStatus();
                if (!r || r.ok !== true) throw new Error((r && r.error) || 'バックアップ一覧を取得できません');
                return r;
            });
    }

    function restoreFromServer(name) {
        return fetch('/__shift_backup_get?name=' + encodeURIComponent(name), { cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (r) {
                if (!r || r.ok !== true) throw new Error((r && r.error) || '取得できません');
                return restoreFromPayload(r.payload);
            });
    }

    // --- 現在のデータ状況 ---------------------------------------------------
    /** 人が見て意味のある件数を出す（キーごとに数え方が違う） */
    function countEntries(key, parsed) {
        if (parsed === null || parsed === undefined) return 0;
        function sumOf(obj, type) {
            return Object.keys(obj).reduce(function (acc, k) {
                var v = obj[k];
                if (type === 'array' && Array.isArray(v)) return acc + v.length;
                if (type === 'object' && v && typeof v === 'object' && !Array.isArray(v)) return acc + Object.keys(v).length;
                return acc;
            }, 0);
        }
        if (key === 'shiftApp_staffData' && parsed && typeof parsed === 'object') {
            return sumOf(parsed, 'array');                 // スタッフの人数
        }
        if (key === 'shiftApp_requestData' && parsed && typeof parsed === 'object') {
            return sumOf(parsed, 'object');                // 希望の入力件数
        }
        if (Array.isArray(parsed)) return parsed.length;
        if (typeof parsed === 'object') return Object.keys(parsed).length;
        return 1;
    }

    function stats() {
        var out = { keys: [], totalBytes: 0 };
        appKeys().forEach(function (key) {
            var raw = rawGetItem(key) || '';
            var count = null;
            try {
                count = countEntries(key, JSON.parse(raw));
            } catch (e) { /* 数えられなければ null */ }
            out.keys.push({ key: key, bytes: raw.length, count: count });
            out.totalBytes += raw.length + key.length;
        });
        var meta = readMeta();
        out.lastSavedAt = state.lastSavedAt || meta.lastSavedAt || null;
        out.lastFile = meta.lastFile || null;
        out.serverAvailable = state.serverAvailable;
        out.lastError = state.lastError;
        out.origin = location.origin;
        out.mode = state.mode;
        out.serverRoot = state.serverRoot;
        out.lastExportAt = meta.lastExportAt || null;
        out.changesSinceExport = meta.changesSinceExport || 0;
        return out;
    }

    // --- 画面表示（バッジと警告バナー） -------------------------------------
    var badgeEl = null;
    var badgeTimer = null;

    function ensureBadge() {
        if (badgeEl || !document.body) return badgeEl;
        badgeEl = document.createElement('div');
        badgeEl.id = 'shift-backup-badge';
        badgeEl.setAttribute('role', 'status');
        badgeEl.style.cssText = [
            'position:fixed', 'right:14px', 'bottom:14px', 'z-index:99999',
            'padding:7px 13px', 'border-radius:999px',
            'font-size:12px', 'font-weight:700', 'letter-spacing:.02em',
            'font-family:"Noto Sans JP",system-ui,sans-serif',
            'background:rgba(17,24,39,.92)', 'color:#fff',
            'box-shadow:0 6px 20px rgba(0,0,0,.25)',
            'opacity:0', 'transition:opacity .25s ease', 'pointer-events:none'
        ].join(';');
        document.body.appendChild(badgeEl);
        return badgeEl;
    }

    function flashBadge(text) {
        var el = ensureBadge();
        if (!el) return;
        var now = new Date();
        var pad = function (n) { return String(n).padStart(2, '0'); };
        el.textContent = '✓ ' + text + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
        el.style.background = 'rgba(17,24,39,.92)';
        el.style.opacity = '1';
        if (badgeTimer) clearTimeout(badgeTimer);
        badgeTimer = setTimeout(function () { el.style.opacity = '0'; }, 2600);
    }

    var bannerEl = null;

    function renderStatus() {
        if (!document.body) return;

        var level = null;      // 'error'（赤） / 'notice'（琥珀）
        var message = '';

        if (location.hostname === 'localhost') {
            level = 'error';
            message = 'このURLは localhost です。127.0.0.1 とは別の保存領域になります。起動用ファイルから開き直してください。';
        } else if (state.mode === 'server' && state.serverAvailable === false) {
            level = 'error';
            message = '自動バックアップに失敗しています（' + (state.lastError || '原因不明') + '）。サーバーが起動しているか確認してください。';
        } else if (state.mode === 'manual' && !state.bannerDismissed) {
            // 公開サイトなど、保存先サーバーが無い環境。
            // 自動保存できないので、間隔が空いたら書き出しをやさしく促す。
            var meta = readMeta();
            var since = daysSince(meta.lastExportAt);
            var changes = meta.changesSinceExport || 0;
            var hasData = appKeys().length > 0;
            if (since === null && hasData) {
                level = 'notice';
                message = 'データのバックアップがまだ一度も取られていません。「バックアップ」画面から書き出しておいてください。';
            } else if (since !== null && since >= EXPORT_REMIND_DAYS && changes > 0) {
                level = 'notice';
                message = 'バックアップを書き出してから' + since + '日たっています（未書き出しの変更 ' + changes + '件）。「バックアップ」画面から書き出しておいてください。';
            }
        }

        if (!level) {
            if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
            bannerEl = null;
            return;
        }

        if (!bannerEl) {
            bannerEl = document.createElement('div');
            bannerEl.id = 'shift-backup-banner';
            document.body.appendChild(bannerEl);
        }
        var isError = level === 'error';
        bannerEl.style.cssText = [
            'position:fixed', 'left:0', 'right:0', 'top:0', 'z-index:100000',
            'padding:10px 44px 10px 16px',
            'background:' + (isError ? '#b91c1c' : '#b45309'),
            'color:#fff', 'font-size:13px', 'font-weight:700', 'line-height:1.5',
            'font-family:"Noto Sans JP",system-ui,sans-serif',
            'box-shadow:0 4px 14px rgba(0,0,0,.3)', 'text-align:center'
        ].join(';');
        bannerEl.innerHTML = '';
        bannerEl.appendChild(document.createTextNode((isError ? '\u26a0 ' : '\ud83d\udcbe ') + message));

        if (!isError) {
            var close = document.createElement('button');
            close.type = 'button';
            close.textContent = '\u00d7';
            close.setAttribute('aria-label', '閉じる');
            close.style.cssText = [
                'position:absolute', 'right:10px', 'top:6px',
                'background:transparent', 'border:0', 'color:#fff',
                'font-size:20px', 'line-height:1', 'cursor:pointer', 'padding:2px 6px'
            ].join(';');
            close.addEventListener('click', function () {
                state.bannerDismissed = true;
                renderStatus();
            });
            bannerEl.appendChild(close);
        }
    }

    // --- 起動時 -------------------------------------------------------------
    // ページを開いた瞬間の状態を先に確保する。
    // （各画面のスクリプトはこの後に動いて localStorage を書き換えることがある）
    var bootPayload = collect();

    function boot() {
        detectMode().then(function (mode) {
            renderStatus();
            if (mode !== 'server') {
                // 公開サイトなど保存先が無い環境。自動保存はせず、手動書き出しに任せる。
                console.info('[シフト作るくん] このURLでは自動バックアップは使えません。'
                    + 'バックアップ画面から「ファイルに書き出す」をお使いください。');
                return;
            }
            // 開いた時点のスナップショットを送る（アプリが書き換える前の中身）
            bootPayload.source = 'pageload';
            state.inFlight = true;
            return fetch('/__shift_backup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bootPayload),
                cache: 'no-store'
            }).then(function (r) { return r.json(); }).then(function (result) {
                state.inFlight = false;
                state.serverAvailable = !!(result && result.ok);
                if (result && result.ok && !result.skipped) {
                    state.lastSavedAt = new Date().toISOString();
                    var meta = readMeta();
                    meta.lastSavedAt = state.lastSavedAt;
                    meta.lastFile = result.saved || '';
                    writeMeta(meta);
                }
                renderStatus();
            }).catch(function (error) {
                state.inFlight = false;
                state.serverAvailable = false;
                state.lastError = String(error && error.message ? error.message : error);
                renderStatus();
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    // ページを閉じる直前に、未送信の変更があれば送る
    window.addEventListener('pagehide', function () {
        if (state.mode !== 'server') return;
        if (!state.pending) return;
        clearTimeout(state.pending);
        state.pending = null;
        try {
            var payload = collect();
            payload.source = 'unload';
            var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            navigator.sendBeacon('/__shift_backup', blob);
        } catch (e) { /* 失敗しても閉じる動作は妨げない */ }
    });

    window.ShiftBackup = {
        collect: collect,
        stats: stats,
        backupNow: function () { return sendToServer('manual'); },
        exportToFile: exportToFile,
        importFromFile: importFromFile,
        listServerBackups: listServerBackups,
        restoreFromServer: restoreFromServer,
        restoreFromPayload: restoreFromPayload,
        bootSnapshot: function () { return bootPayload; },
        ready: function () { return detectMode(); },
        mode: function () { return state.mode; }
    };
})();
