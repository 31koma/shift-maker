(function () {
    const AUTH_KEY = 'shiftApp_auth_ok';
    const LOCAL_TEST_PASSWORD = '33';
    const LOCAL_HOSTNAMES = new Set(['', 'localhost', '127.0.0.1', '::1']);

    document.documentElement.classList.add('auth-checking');

    function isAuthed() {
        return sessionStorage.getItem(AUTH_KEY) === '1';
    }

    function unlockApp() {
        sessionStorage.setItem(AUTH_KEY, '1');
        document.documentElement.classList.remove('auth-checking');
        document.documentElement.classList.remove('auth-locked');
        const overlay = document.getElementById('auth-overlay');
        if (overlay) overlay.remove();
    }

    function isLocalEnvironment() {
        const { protocol, hostname } = window.location;
        if (protocol === 'file:') return true;
        if (LOCAL_HOSTNAMES.has(hostname)) return true;
        if (/^192\.168\./.test(hostname)) return true;
        if (/^10\./.test(hostname)) return true;
        if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return true;
        if (hostname.endsWith('.local')) return true;
        return false;
    }

    if (isAuthed()) {
        document.documentElement.classList.remove('auth-checking');
        return;
    }

    document.documentElement.classList.add('auth-locked');

    function ensureStyles() {
        if (document.getElementById('auth-inline-style')) return;
        const style = document.createElement('style');
        style.id = 'auth-inline-style';
        style.textContent = `
html.auth-checking .app-container,
html.auth-locked .app-container {
  visibility: hidden;
}
.auth-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: grid;
  place-items: center;
  padding: 16px;
  background: radial-gradient(circle at 15% 15%, rgba(99,102,241,0.14), transparent 32%),
              radial-gradient(circle at 85% 10%, rgba(16,185,129,0.12), transparent 33%),
              rgba(15,23,42,0.08);
  backdrop-filter: blur(4px);
}
.auth-card {
  width: min(440px, 100%);
  background: rgba(255,255,255,0.96);
  border: 1px solid rgba(255,255,255,0.65);
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(15,23,42,0.14);
  padding: 22px;
}
.auth-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 800;
  color: #334155;
}
.auth-desc {
  margin: 8px 0 0;
  font-size: .92rem;
  color: #64748b;
}
.auth-form {
  margin-top: 14px;
  display: grid;
  gap: 10px;
}
.auth-input {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 12px;
  font-size: 16px;
}
.auth-input:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99,102,241,.2);
}
.auth-btn {
  border: 0;
  border-radius: 10px;
  padding: 12px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  cursor: pointer;
}
.auth-btn[disabled] {
  opacity: .7;
  cursor: wait;
}
.auth-error {
  min-height: 1.1em;
  margin: 0;
  color: #dc2626;
  font-size: .85rem;
}
`;
        document.head.appendChild(style);
    }

    function renderLogin() {
        ensureStyles();
        const overlay = document.createElement('div');
        overlay.id = 'auth-overlay';
        overlay.className = 'auth-overlay';
        overlay.innerHTML = `
<div class="auth-card">
  <h2 class="auth-title">ログイン</h2>
  <p class="auth-desc">パスワードを入力して続行してください。</p>
  <form class="auth-form" id="auth-form">
    <input id="auth-password" class="auth-input" type="password" autocomplete="current-password" placeholder="パスワード" required />
    <button id="auth-submit" class="auth-btn" type="submit">ログイン</button>
    <p id="auth-error" class="auth-error"></p>
  </form>
</div>`;

        document.body.appendChild(overlay);

        const form = overlay.querySelector('#auth-form');
        const passInput = overlay.querySelector('#auth-password');
        const submitBtn = overlay.querySelector('#auth-submit');
        const errorEl = overlay.querySelector('#auth-error');

        passInput.focus();

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            errorEl.textContent = '';
            submitBtn.disabled = true;
            const trimmedPassword = passInput.value.trim();

            if (isLocalEnvironment()) {
                if (trimmedPassword === LOCAL_TEST_PASSWORD) {
                    unlockApp();
                } else {
                    errorEl.textContent = 'パスワードが違います。';
                }
                submitBtn.disabled = false;
                return;
            }

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: trimmedPassword })
                });

                const data = await res.json().catch(() => ({}));
                if (res.ok && data.ok) {
                    unlockApp();
                    return;
                }

                if (res.status === 404 && trimmedPassword === LOCAL_TEST_PASSWORD) {
                    unlockApp();
                    return;
                }

                errorEl.textContent = data && data.message ? data.message : 'パスワードが違います。';
            } catch (err) {
                errorEl.textContent = '通信エラーが発生しました。';
            } finally {
                submitBtn.disabled = false;
            }
        });

        document.documentElement.classList.remove('auth-checking');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderLogin);
    } else {
        renderLogin();
    }
})();
