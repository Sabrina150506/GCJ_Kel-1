const SUPABASE_URL = 'https://suwbhvgczuqnsefarvpv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_tN7N4UW8QwIISqLLrxyGNg_PrO2KDmS';

window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// === CUSTOM MODAL UI (PENGGANTI POP-UP BAWAAN BROWSER) ===
window.sgConfirm = function ({
  title = 'Konfirmasi Tindakan',
  message = 'Apakah kamu yakin ingin melanjutkan?',
  confirmText = 'Ya, Lanjutkan',
  cancelText = 'Batal',
  danger = false
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed; inset:0; background:rgba(15,23,42,0.45); backdrop-filter:blur(4px);
      display:flex; align-items:center; justify-content:center; z-index:99999; padding:16px;
      font-family:'Plus Jakarta Sans',sans-serif;
    `;

    const accentBg = danger ? '#fee2e2' : '#edf6e5';
    const accentColor = danger ? '#dc2626' : '#467810';
    const btnBg = danger ? '#dc2626' : '#65a30d';

    overlay.innerHTML = `
      <div style="background:#fff; border-radius:20px; max-width:390px; width:100%; padding:24px;
                  box-shadow:0 20px 40px rgba(0,0,0,0.16); border:1px solid #e2e8f0;">
        <div style="width:42px; height:42px; border-radius:12px; background:${accentBg}; color:${accentColor};
                    display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:800; margin-bottom:14px;">
          ${danger ? '!' : '?'}
        </div>
        <h3 style="margin:0 0 6px; font-size:16px; font-weight:800; color:#0f172a;">${title}</h3>
        <p style="margin:0 0 20px; font-size:13px; color:#64748b; line-height:1.55;">${message}</p>
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button type="button" id="sgModalCancel" style="padding:9px 16px; border-radius:10px; border:1px solid #cbd5e1;
                  background:#fff; color:#334155; font-weight:600; font-size:13px; cursor:pointer;">
            ${cancelText}
          </button>
          <button type="button" id="sgModalOk" style="padding:9px 18px; border-radius:10px; border:none;
                  background:${btnBg}; color:#fff; font-weight:700; font-size:13px; cursor:pointer;">
            ${confirmText}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const cleanup = (val) => {
      overlay.remove();
      resolve(val);
    };

    overlay.querySelector('#sgModalCancel').onclick = () => cleanup(false);
    overlay.querySelector('#sgModalOk').onclick = () => cleanup(true);
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
  });
};

// Custom Modal Input (Pengganti prompt() Bawaan Browser)
window.sgPrompt = function ({
  title = 'Ubah Data',
  label = 'Masukkan teks baru:',
  defaultValue = '',
  confirmText = 'Simpan',
  cancelText = 'Batal'
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed; inset:0; background:rgba(15,23,42,0.45); backdrop-filter:blur(4px);
      display:flex; align-items:center; justify-content:center; z-index:99999; padding:16px;
      font-family:'Plus Jakarta Sans',sans-serif;
    `;

    overlay.innerHTML = `
      <div style="background:#fff; border-radius:20px; max-width:390px; width:100%; padding:24px;
                  box-shadow:0 20px 40px rgba(0,0,0,0.16); border:1px solid #e2e8f0;">
        <h3 style="margin:0 0 6px; font-size:16px; font-weight:800; color:#0f172a;">${title}</h3>
        <p style="margin:0 0 12px; font-size:13px; color:#64748b;">${label}</p>
        <input type="text" id="sgPromptInput" value="${defaultValue.replace(/"/g, '&quot;')}"
               style="width:100%; box-sizing:border-box; padding:10px 12px; border-radius:10px;
                      border:1.5px solid #cbd5e1; font-size:13.5px; font-family:inherit; margin-bottom:18px; outline:none;" />
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button type="button" id="sgPromptCancel" style="padding:9px 16px; border-radius:10px; border:1px solid #cbd5e1;
                  background:#fff; color:#334155; font-weight:600; font-size:13px; cursor:pointer;">
            ${cancelText}
          </button>
          <button type="button" id="sgPromptOk" style="padding:9px 18px; border-radius:10px; border:none;
                  background:#65a30d; color:#fff; font-weight:700; font-size:13px; cursor:pointer;">
            ${confirmText}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const inp = overlay.querySelector('#sgPromptInput');
    inp.focus();
    inp.select();

    const cleanup = (val) => {
      overlay.remove();
      resolve(val);
    };

    overlay.querySelector('#sgPromptCancel').onclick = () => cleanup(null);
    overlay.querySelector('#sgPromptOk').onclick = () => cleanup(inp.value);
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') cleanup(inp.value);
      if (e.key === 'Escape') cleanup(null);
    };
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(null); };
  });
};

// Otomatis aktifkan Custom Modal Logout di SEMUA halaman tanpa ubah file JS lain
document.addEventListener('click', async (e) => {
  const logoutBtn = e.target.closest('#logoutBtn');
  if (!logoutBtn) return;

  e.preventDefault();
  e.stopImmediatePropagation();

  const yakin = await window.sgConfirm({
    title: 'Keluar dari Akun?',
    message: 'Kamu akan keluar dari sesi saat ini dan kembali ke halaman Login.',
    confirmText: 'Ya, Keluar',
    danger: true
  });

  if (yakin && window.sb) {
    await window.sb.auth.signOut();
    window.location.href = 'index.html';
  }
}, true);