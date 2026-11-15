document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) lucide.createIcons();

  // 1. Cek Sesi Login Supabase (Auth Guard)
  const { data: { session }, error: sessionError } = await window.sb.auth.getSession();
  if (sessionError || !session) {
    window.location.href = 'index.html';
    return;
  }

  const user = session.user;
  const formatRp = (num) => 'Rp ' + Number(num || 0).toLocaleString('id-ID');
  const formatDots = (num) => Number(num || 0).toLocaleString('id-ID');
  const parseDigits = (str) => Number(String(str).replace(/\D/g, '')) || 0;

  function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // Normalisasi format semester lama ke format angka ("1", "2", "3", "4", "5", "6+")
  function normalizeSemester(raw) {
    const cleaned = String(raw || '3')
      .replace(/^Smtr\s*/i, '')
      .replace(/\s*\(.*?\)/g, '')
      .trim();
    return ['1', '2', '3', '4', '5', '6+'].includes(cleaned) ? cleaned : '3';
  }

  // 2. Ambil Profil User, Target, dan Transaksi dari Supabase
  const metaName = user.user_metadata?.full_name || user.user_metadata?.name || '';
  const fallbackName = metaName.trim() || user.email.split('@')[0];

  const [{ data: profile }, { data: goalsData }, { data: txData }] = await Promise.all([
    window.sb.from('users').select('*').eq('user_id', user.id).maybeSingle(),
    window.sb.from('saving_goals').select('*').eq('user_id', user.id),
    window.sb
      .from('saving_transactions')
      .select('tanggal_transaksi')
      .eq('user_id', user.id)
      .order('tanggal_transaksi', { ascending: false })
  ]);

  const goalsList = goalsData || [];
  const transactions = txData || [];

  // Hitung Saving Streak otomatis dari riwayat transaksi
  function calculateStreak(txs) {
    if (!txs.length) return 0;
    const uniqueDays = [
      ...new Set(
        txs.map((t) => new Date(t.tanggal_transaksi).toISOString().slice(0, 10))
      )
    ].sort((a, b) => (a < b ? 1 : -1));

    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (uniqueDays[0] !== todayStr && uniqueDays[0] !== yesterdayStr) return 0;

    let streak = 1;
    for (let i = 1; i < uniqueDays.length; i++) {
      const prev = new Date(uniqueDays[i - 1]);
      const curr = new Date(uniqueDays[i]);
      const diffDays = Math.round((prev - curr) / 86400000);
      if (diffDays === 1) streak += 1;
      else break;
    }
    return streak;
  }

  const defaultWallets = [
    { id: 'w1', name: 'BCA Mahasiswa', num: '•••• 4892', tag: 'Utama' },
    { id: 'w2', name: 'GoPay Tabungan', num: '0812 •••• 9920', tag: 'Jago Pocket' },
    { id: 'w3', name: 'ShopeePay', num: '0812 •••• 9920', tag: 'Siaga' }
  ];

  const defaultSettings = {
    fullName: profile?.nama || fallbackName,
    npm: user.id.slice(0, 10).toUpperCase(),
    univ: profile?.universitas || 'Universitas Brawijaya',
    faculty: profile?.jurusan || 'Ilmu Komputer',
    semester: normalizeSemester(profile?.semester || user.user_metadata?.semester || '3'),
    allowance: Number(profile?.uang_saku_bulanan) || 2500000,
    allocPct: 30,
    activeWalletId: 'w1',
    wallets: defaultWallets,
    notifs: [true, true, true],
    avatarUrl: user.user_metadata?.avatar_url || localStorage.getItem(`sg_avatar_${user.id}`) || ''
  };

  const localPrefs = JSON.parse(localStorage.getItem(`sg_prefs_${user.id}`) || '{}');
  let settings = { ...defaultSettings, ...localPrefs };
  settings.fullName = profile?.nama || settings.fullName;
  settings.univ = profile?.universitas || settings.univ;
  settings.faculty = profile?.jurusan || settings.faculty;
  settings.semester = normalizeSemester(profile?.semester || user.user_metadata?.semester || settings.semester);
  if (profile?.uang_saku_bulanan != null) {
    settings.allowance = Number(profile.uang_saku_bulanan);
  }
  if (user.user_metadata?.avatar_url) {
    settings.avatarUrl = user.user_metadata.avatar_url;
  }
  if (!Array.isArray(settings.wallets) || settings.wallets.length === 0) {
    settings.wallets = defaultWallets;
  }
  if (!settings.activeWalletId || !settings.wallets.some((w) => w.id === settings.activeWalletId)) {
    settings.activeWalletId = settings.wallets[0].id;
  }

  // Referensi Elemen Input
  const inpFullName = document.getElementById('inpFullName');
  const inpNpm = document.getElementById('inpNpm');
  const inpUniv = document.getElementById('inpUniv');
  const inpFaculty = document.getElementById('inpFaculty');
  const inpAllowance = document.getElementById('inpAllowance');
  const allocSlider = document.getElementById('allocSlider');
  const notifToggles = document.querySelectorAll('.notif-toggle');

  // Helper render avatar
  function renderAvatars(initials) {
    const topAv = document.getElementById('topAvatarInitials');
    const cardAv = document.getElementById('cardAvatarDisplay');
    const url = String(settings.avatarUrl || '').trim();
    const isValidImg = url.startsWith('data:image/') || url.startsWith('http://') || url.startsWith('https://');

    if (isValidImg) {
      if (topAv) {
        topAv.innerHTML = `<img src="${url}" alt="" onerror="this.parentElement.textContent='${initials}'" style="width:100%; height:100%; object-fit:cover; border-radius:50%; display:block;" />`;
      }
      if (cardAv) {
        cardAv.innerHTML = `<img src="${url}" alt="" onerror="this.parentElement.textContent='${initials}'" style="width:100%; height:100%; object-fit:cover; border-radius:50%; display:block;" />`;
      }
    } else {
      if (topAv) topAv.textContent = initials;
      if (cardAv) cardAv.textContent = initials;
    }
  }

  // Upload & Kompres Foto Profil Otomatis (160x160 px)
  const avatarTrigger = document.getElementById('avatarUploadTrigger');
  const avatarInput = document.getElementById('avatarFileInput');
  if (avatarTrigger && avatarInput) {
    avatarTrigger.addEventListener('click', (e) => {
      if (e.target === avatarInput) return;
      avatarInput.click();
    });

    avatarInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        showToast('Pilih file gambar (JPG/PNG).');
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const size = 160;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');

          const minSide = Math.min(img.width, img.height);
          const sx = (img.width - minSide) / 2;
          const sy = (img.height - minSide) / 2;
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

          settings.avatarUrl = canvas.toDataURL('image/jpeg', 0.82);
          const nameParts = settings.fullName.trim().split(/\s+/);
          const initials = nameParts.length > 1
            ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
            : settings.fullName.slice(0, 2).toUpperCase();
          renderAvatars(initials);
          showToast('Foto profil dipilih! Klik "Simpan Perubahan" untuk menyimpan.');
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function updateAllocationDisplay() {
    const allowanceVal = parseDigits(inpAllowance.value);
    const pctVal = Number(allocSlider.value);
    const monthlyAlloc = Math.round((allowanceVal * pctVal) / 100);

    document.getElementById('allocPctLabel').textContent = `${pctVal}%`;
    document.getElementById('monthlyAllocDisplay').textContent = formatRp(monthlyAlloc);

    document.querySelectorAll('.pct-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.pct) === pctVal);
    });
  }

  function updateNotifBadge() {
    const activeCount = Array.from(notifToggles).filter((cb) => cb.checked).length;
    document.getElementById('activeNotifCount').textContent = `${activeCount} Notifikasi Aktif`;
  }

  // Render Kartu Rekening / E-Wallet (Bisa Tambah, Edit & Hapus Sendiri)
  let editingWalletId = null;
  const walletGrid = document.getElementById('walletGrid');
  const walletEditor = document.getElementById('walletEditorBox');

  function deleteWalletById(id) {
    if (settings.wallets.length <= 1) {
      showToast('Minimal harus tersisa 1 rekening penampungan.');
      return;
    }
    settings.wallets = settings.wallets.filter((w) => w.id !== id);
    if (settings.activeWalletId === id) {
      settings.activeWalletId = settings.wallets[0].id;
    }
    if (editingWalletId === id && walletEditor) {
      walletEditor.style.display = 'none';
      editingWalletId = null;
    }
    renderWallets();
    showToast('Rekening dihapus! Klik "Simpan Perubahan" untuk menyimpan permanen.');
  }

  function renderWallets() {
    if (!walletGrid) return;
    walletGrid.innerHTML = settings.wallets.map((w) => {
      const isAct = w.id === settings.activeWalletId;
      return `
        <div class="wallet-card ${isAct ? 'active' : ''}" data-wallet-id="${w.id}">
          <div class="wc-top">
            <strong>${w.name}</strong>
            <span class="wc-dot"></span>
          </div>
          <span class="wc-num">${w.num}</span>
          <div class="wc-foot">
            <span>${w.tag || 'Tabungan'}</span>
            <div class="wc-card-actions">
              <button type="button" class="wc-edit-btn" data-edit-id="${w.id}">Edit</button>
              <button type="button" class="wc-del-btn" data-del-id="${w.id}">Hapus</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    walletGrid.querySelectorAll('.wallet-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.wc-edit-btn') || e.target.closest('.wc-del-btn')) return;
        settings.activeWalletId = card.dataset.walletId;
        renderWallets();
      });
    });

    walletGrid.querySelectorAll('.wc-edit-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = settings.wallets.find((x) => x.id === btn.dataset.editId);
        if (!target || !walletEditor) return;
        editingWalletId = target.id;
        document.getElementById('inpWalletName').value = target.name;
        document.getElementById('inpWalletNum').value = target.num;
        document.getElementById('inpWalletTag').value = target.tag || '';
        walletEditor.style.display = 'flex';
      });
    });

    walletGrid.querySelectorAll('.wc-del-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteWalletById(btn.dataset.delId);
      });
    });
  }

  const btnToggleWalletForm = document.getElementById('btnToggleWalletForm');
  if (btnToggleWalletForm && walletEditor) {
    btnToggleWalletForm.addEventListener('click', () => {
      editingWalletId = null;
      document.getElementById('inpWalletName').value = '';
      document.getElementById('inpWalletNum').value = '';
      document.getElementById('inpWalletTag').value = '';
      walletEditor.style.display = walletEditor.style.display === 'none' ? 'flex' : 'none';
    });
  }

  const btnCancelWallet = document.getElementById('btnCancelWallet');
  if (btnCancelWallet && walletEditor) {
    btnCancelWallet.addEventListener('click', () => {
      walletEditor.style.display = 'none';
      editingWalletId = null;
    });
  }

  const btnSaveWallet = document.getElementById('btnSaveWallet');
  if (btnSaveWallet && walletEditor) {
    btnSaveWallet.addEventListener('click', () => {
      const name = document.getElementById('inpWalletName').value.trim();
      const num = document.getElementById('inpWalletNum').value.trim();
      const tag = document.getElementById('inpWalletTag').value.trim() || 'Tabungan';

      if (!name || !num) {
        showToast('Isi nama bank/e-wallet dan nomor rekening terlebih dahulu.');
        return;
      }

      if (editingWalletId) {
        settings.wallets = settings.wallets.map((w) =>
          w.id === editingWalletId ? { ...w, name, num, tag } : w
        );
      } else {
        const newId = 'w_' + Date.now();
        settings.wallets.push({ id: newId, name, num, tag });
        settings.activeWalletId = newId;
      }

      walletEditor.style.display = 'none';
      editingWalletId = null;
      renderWallets();
      showToast('Rekening diperbarui! Klik "Simpan Perubahan" untuk menyimpan permanen.');
    });
  }

  function applySettingsToUI() {
    inpFullName.value = settings.fullName;
    if (inpNpm) inpNpm.value = settings.npm;
    inpUniv.value = settings.univ;
    inpFaculty.value = settings.faculty;
    inpAllowance.value = formatDots(settings.allowance);
    allocSlider.value = settings.allocPct;

    const nameParts = settings.fullName.trim().split(/\s+/);
    const firstName = nameParts[0];
    const initials = nameParts.length > 1
      ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
      : settings.fullName.slice(0, 2).toUpperCase();

    renderAvatars(initials);

    document.getElementById('topUserName').textContent = firstName + '.';

    document.getElementById('cardProfileName').innerHTML =
      `${settings.fullName} <i data-lucide="badge-check" width="16" height="16" style="color:#467810;"></i>`;
    const npmEl = document.getElementById('cardProfileNpm');
    if (npmEl) npmEl.textContent = user.email;

    const emailHintEl = document.getElementById('notifEmailHint');
    if (emailHintEl) {
      emailHintEl.textContent = `Kirim evaluasi ke ${user.email} setiap hari Minggu`;
    }

    document.getElementById('ktmUniv').textContent = settings.univ;
    const facShort = settings.faculty.includes('/')
      ? settings.faculty.split('/')[1].trim()
      : settings.faculty;
    document.getElementById('ktmFaculty').textContent = `Program Studi ${facShort}`;

    // Statistik asli dari Supabase
    const completedCount = goalsList.filter(
      (g) => Number(g.nominal_terkumpul || 0) >= Number(g.target_nominal || 1)
    ).length;
    const avgPct = goalsList.length > 0
      ? Math.round(
          goalsList.reduce(
            (acc, g) =>
              acc + Math.min(100, (Number(g.nominal_terkumpul || 0) / Math.max(1, Number(g.target_nominal || 1))) * 100),
            0
          ) / goalsList.length
        )
      : 0;

    const completedEl = document.getElementById('statCompletedGoals');
    if (completedEl) completedEl.textContent = completedCount;

    const streakEl = document.getElementById('statSavingStreak');
    if (streakEl) streakEl.textContent = `${calculateStreak(transactions)} Hari`;

    const sidebarRatioEl = document.getElementById('sidebarTargetRatio');
    const sidebarBarEl = document.getElementById('sidebarTargetBar');
    if (sidebarRatioEl) sidebarRatioEl.textContent = `${completedCount} / ${goalsList.length}`;
    if (sidebarBarEl) sidebarBarEl.style.width = `${avgPct}%`;

    document.querySelectorAll('.sem-radio').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.sem === settings.semester);
    });

    renderWallets();

    notifToggles.forEach((cb, idx) => {
      cb.checked = settings.notifs[idx] !== false;
    });

    updateAllocationDisplay();
    updateNotifBadge();
    if (window.lucide) lucide.createIcons();
  }

  // Format input uang saku otomatis dengan titik
  inpAllowance.addEventListener('input', () => {
    const val = parseDigits(inpAllowance.value);
    inpAllowance.value = val ? formatDots(val) : '';
    updateAllocationDisplay();
  });

  allocSlider.addEventListener('input', updateAllocationDisplay);

  document.querySelectorAll('.pct-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      allocSlider.value = btn.dataset.pct;
      updateAllocationDisplay();
    });
  });

  // Pilihan Semester (1, 2, 3, 4, 5, 6+)
  document.querySelectorAll('.sem-radio').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sem-radio').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      settings.semester = btn.dataset.sem;
    });
  });

  notifToggles.forEach((cb) => {
    cb.addEventListener('change', updateNotifBadge);
  });

  // Tab navigasi halus ke section terkait
  document.querySelectorAll('.stab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.stab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const targetEl = document.getElementById(tab.dataset.target);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // 3. Simpan Perubahan Profil, Semester, Rekening & Foto ke Supabase
  async function saveAllSettings() {
    const saveBtns = [document.getElementById('btnSaveTop'), document.getElementById('btnSaveBottom')];
    saveBtns.forEach((b) => { if (b) b.disabled = true; });

    settings.fullName = inpFullName.value.trim() || defaultSettings.fullName;
    settings.univ = inpUniv.value.trim() || defaultSettings.univ;
    settings.faculty = inpFaculty.value.trim() || defaultSettings.faculty;
    settings.allowance = parseDigits(inpAllowance.value) || defaultSettings.allowance;
    settings.allocPct = Number(allocSlider.value);
    settings.notifs = Array.from(notifToggles).map((cb) => cb.checked);

    const { error: upsertErr } = await window.sb
      .from('users')
      .upsert({
        user_id: user.id,
        email: user.email,
        nama: settings.fullName,
        universitas: settings.univ,
        jurusan: settings.faculty,
        semester: settings.semester,
        uang_saku_bulanan: settings.allowance
      }, { onConflict: 'user_id' });

    if (upsertErr) {
      saveBtns.forEach((b) => { if (b) b.disabled = false; });
      showToast('Gagal menyimpan profil ke database: ' + upsertErr.message);
      return;
    }

    const monthlyAlloc = Math.round((settings.allowance * settings.allocPct) / 100);
    const activeWalletObj = settings.wallets.find((w) => w.id === settings.activeWalletId) || settings.wallets[0];

    const authPayload = {
      full_name: settings.fullName,
      semester: settings.semester,
      monthly_allowance: settings.allowance,
      saving_pct: settings.allocPct,
      monthly_alloc: monthlyAlloc
    };
    if (settings.avatarUrl) {
      authPayload.avatar_url = settings.avatarUrl;
      localStorage.setItem(`sg_avatar_${user.id}`, settings.avatarUrl);
    }

    const { error: authErr } = await window.sb.auth.updateUser({ data: authPayload });
    if (authErr && settings.avatarUrl) {
      await window.sb.auth.updateUser({
        data: {
          full_name: settings.fullName,
          semester: settings.semester,
          monthly_allowance: settings.allowance,
          saving_pct: settings.allocPct,
          monthly_alloc: monthlyAlloc
        }
      });
    }

    localStorage.setItem(`sg_prefs_${user.id}`, JSON.stringify({
      semester: settings.semester,
      allocPct: settings.allocPct,
      monthlyAlloc,
      activeWalletId: settings.activeWalletId,
      wallet: activeWalletObj?.name || 'BCA Mahasiswa',
      wallets: settings.wallets,
      notifs: settings.notifs
    }));

    saveBtns.forEach((b) => { if (b) b.disabled = false; });
    applySettingsToUI();
    showToast('Perubahan pengaturan & profil berhasil disimpan!');
  }

  function cancelChanges() {
    settings = { ...defaultSettings, ...localPrefs };
    applySettingsToUI();
    showToast('Perubahan dibatalkan.');
  }

  document.getElementById('btnSaveTop').addEventListener('click', saveAllSettings);
  document.getElementById('btnSaveBottom').addEventListener('click', saveAllSettings);
  document.getElementById('btnCancelTop').addEventListener('click', cancelChanges);
  document.getElementById('btnCancelBottom').addEventListener('click', cancelChanges);

  // Fungsi Ikon Lonceng Pengingat
  const btnNotifBell = document.getElementById('btnNotifBell');
  if (btnNotifBell) {
    btnNotifBell.addEventListener('click', () => {
      if (goalsList.length === 0) {
        showToast('Pengingat: Belum ada target tabungan aktif. Yuk buat target pertamamu!');
        return;
      }
      const unfinished = goalsList
        .map((g) => ({
          ...g,
          remaining: Math.max(0, Number(g.target_nominal || 0) - Number(g.nominal_terkumpul || 0))
        }))
        .filter((g) => g.remaining > 0)
        .sort((a, b) => a.remaining - b.remaining);

      if (unfinished.length === 0) {
        showToast('Selamat! Semua target tabunganmu sudah tercapai 100%!');
      } else {
        const nearest = unfinished[0];
        showToast(`Pengingat: "${nearest.nama_tujuan}" kurang ${formatRp(nearest.remaining)} lagi!`);
      }
    });
  }

  // 4. Ekspor Data Tabungan (.CSV) dari Supabase
  document.getElementById('btnExportCsv').addEventListener('click', async () => {
    const { data: freshGoals } = await window.sb
      .from('saving_goals')
      .select('*')
      .eq('user_id', user.id);

    let csvContent = 'Nama Target,Deskripsi,Terkumpul (Rp),Target Akhir (Rp),Tenggat,Status\n';
    (freshGoals || []).forEach((g) => {
      const cleanDesc = (g.deskripsi || '').replace(/,/g, ' ');
      csvContent += `"${g.nama_tujuan}","${cleanDesc}",${g.nominal_terkumpul},${g.target_nominal},"${g.target_waktu || '-'}","${g.status}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeFileName = settings.fullName.replace(/\s+/g, '_');
    link.download = `Saving_Goals_${safeFileName}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Data tabungan berhasil diunduh (.CSV)!');
  });

  // 5. Reset Target & Riwayat di Supabase (Custom Modal)
  document.getElementById('btnResetData').addEventListener('click', async () => {
    const yakin = await window.sgConfirm({
      title: 'Reset Target & Riwayat?',
      message: 'Semua target dan riwayat transaksi tabunganmu di database akan dihapus permanen.',
      confirmText: 'Ya, Reset Semua',
      danger: true
    });

    if (yakin) {
      await window.sb.from('saving_transactions').delete().eq('user_id', user.id);
      await window.sb.from('saving_goals').delete().eq('user_id', user.id);
      showToast('Data target & transaksi berhasil dihapus! Mengarahkan ke Dashboard...');
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 900);
    }
  });

  // 6. Hapus Seluruh Data & Keluar (Custom Modal)
  document.getElementById('btnDeleteAccount').addEventListener('click', async () => {
    const yakin = await window.sgConfirm({
      title: 'Hapus Seluruh Data & Keluar?',
      message: 'Seluruh data tabungan dan preferensi akun ini akan dihapus permanen, lalu kamu akan diarahkan ke halaman Login.',
      confirmText: 'Ya, Hapus & Keluar',
      danger: true
    });

    if (yakin) {
      await window.sb.from('saving_transactions').delete().eq('user_id', user.id);
      await window.sb.from('saving_goals').delete().eq('user_id', user.id);
      localStorage.removeItem(`sg_prefs_${user.id}`);
      localStorage.removeItem(`sg_avatar_${user.id}`);
      await window.sb.auth.signOut();
      window.location.href = 'index.html';
    }
  });

  // Sidebar Mobile Toggle & Logout
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  document.getElementById('menuToggle').addEventListener('click', () => {
    sidebar.classList.add('open');
    overlay.classList.add('show');
  });
  const closeSidebar = () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
  };
  document.getElementById('closeSidebarBtn').addEventListener('click', closeSidebar);
  overlay.addEventListener('click', closeSidebar);

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    if (confirm('Keluar dan kembali ke halaman Login?')) {
      await window.sb.auth.signOut();
      window.location.href = 'index.html';
    }
  });

  applySettingsToUI();
});