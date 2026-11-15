document.addEventListener('DOMContentLoaded', async () => {
  // Render ikon Lucide bawaan HTML sejak awal
  if (window.lucide) lucide.createIcons();

  // 1. Cek Sesi Login Supabase (Auth Guard)
  const { data: { session }, error: sessionError } = await window.sb.auth.getSession();
  if (sessionError || !session) {
    window.location.href = 'index.html';
    return;
  }

  const user = session.user;
  let goals = [];
  let currentFilter = 'all';
  let searchQuery = '';
  let selectedCategory = 'Gadget & Karir';
  let selectedCatIcon = 'laptop';
  let selectedMonths = 6;
  let activeDepositGoalId = null;

  const formatRp = (num) => 'Rp ' + Number(num || 0).toLocaleString('id-ID');
  const formatDots = (num) => Number(num || 0).toLocaleString('id-ID');
  const parseDigits = (str) => Number(String(str).replace(/\D/g, '')) || 0;

  function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }

  // Ambil rekomendasi Total Biaya Target dari alokasi tabungan bulanan di Settings (fallback: 5.000.000)
  function getRecommendedTargetFromSettings() {
    const localPrefs = JSON.parse(localStorage.getItem(`sg_prefs_${user.id}`) || '{}');
    const savedAlloc = Number(localPrefs.monthlyAlloc || user.user_metadata?.monthly_alloc || 0);
    return savedAlloc > 0 ? savedAlloc : 5000000;
  }

  // 2. Ambil Profil User dari public.users
  const metaName = user.user_metadata?.full_name || user.user_metadata?.name || '';
  const fallbackName = metaName.trim() || user.email.split('@')[0];

  const { data: profile } = await window.sb
    .from('users')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  const displayName = profile?.nama || fallbackName;
  const nameParts = displayName.trim().split(/\s+/);
  const firstName = nameParts[0];
  const initials = nameParts.length > 1
    ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
    : displayName.slice(0, 2).toUpperCase();

  document.getElementById('sidebarUserName').textContent = displayName;
  const sidebarRoleEl = document.getElementById('sidebarUserRole') || document.querySelector('.profile-meta span');
  if (sidebarRoleEl) {
    sidebarRoleEl.textContent = `${profile?.jurusan || 'Ilmu Komputer'} UB`;
  }
  document.getElementById('topUserName').textContent = firstName + '.';

  // Sinkronisasi Foto Profil di Pojok Kanan Atas
  const savedAvatar = user.user_metadata?.avatar_url || localStorage.getItem(`sg_avatar_${user.id}`) || '';
  const isValidAvatar = savedAvatar.startsWith('data:image/') || savedAvatar.startsWith('http');
  const topAvEl = document.getElementById('topAvatarInitials');
  if (topAvEl) {
    if (isValidAvatar) {
      topAvEl.style.overflow = 'hidden';
      topAvEl.innerHTML = `<img src="${savedAvatar}" alt="" onerror="this.parentElement.textContent='${initials}'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" />`;
    } else {
      topAvEl.textContent = initials;
    }
  }

  // Hitung Konsistensi Pekan Ini secara dinamis dari saving_transactions (7 hari terakhir)
  async function updateWeeklyConsistency() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const { data: recentTx } = await window.sb
      .from('saving_transactions')
      .select('tanggal_transaksi')
      .eq('user_id', user.id)
      .gte('tanggal_transaksi', sevenDaysAgo.toISOString());

    const activeDays = new Set(
      (recentTx || []).map((t) => new Date(t.tanggal_transaksi).toISOString().split('T')[0])
    ).size;

    const consistencyPct = Math.min(100, Math.round((activeDays / 7) * 100));
    const consistencyEl = document.getElementById('weeklyConsistencyPct');
    if (consistencyEl) consistencyEl.textContent = `${consistencyPct}%`;
  }

  // 3. Muat Daftar Target dari public.saving_goals
  async function loadGoalsFromSupabase() {
    const { data, error } = await window.sb
      .from('saving_goals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      showToast('Gagal memuat target: ' + error.message);
      return;
    }

    goals = (data || []).map((row) => {
      const saved = Number(row.nominal_terkumpul || 0);
      const target = Number(row.target_nominal || 1);
      const rem = Math.max(0, target - saved);

      let diffDays = 90;
      let deadlineStr = 'Fleksibel';
      let statusRight = 'On Track';
      let deadlineTimestamp = Number.MAX_SAFE_INTEGER;

      if (row.target_waktu) {
        const targetDate = new Date(row.target_waktu);
        deadlineTimestamp = targetDate.getTime();
        diffDays = Math.ceil((targetDate - new Date()) / (1000 * 60 * 60 * 24));
        deadlineStr = targetDate.toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
        if (diffDays <= 0) statusRight = 'Jatuh Tempo';
        else if (diffDays <= 30) statusRight = `${Math.max(1, Math.ceil(diffDays / 7))} Minggu Lagi!`;
        else statusRight = `${Math.round(diffDays / 30)} Bulan Lagi`;
      }

      const daily = Math.ceil(rem / Math.max(1, diffDays) / 500) * 500;
      const catText = (row.deskripsi || '').toLowerCase();

      let iconName = 'target';
      if (catText.includes('laptop') || catText.includes('gadget') || row.nama_tujuan.toLowerCase().includes('laptop')) {
        iconName = 'laptop';
      } else if (catText.includes('kos') || catText.includes('darurat') || row.nama_tujuan.toLowerCase().includes('kos')) {
        iconName = 'home';
      } else if (catText.includes('pendidikan') || catText.includes('riset')) {
        iconName = 'graduation-cap';
      } else if (catText.includes('travelling') || catText.includes('trip')) {
        iconName = 'compass';
      } else if (catText.includes('sertifikasi') || catText.includes('karier')) {
        iconName = 'badge-check';
      }

      return {
        id: row.goal_id,
        title: row.nama_tujuan,
        categoryLabel: row.deskripsi || 'Target Tabungan Mahasiswa',
        iconName,
        saved,
        target,
        statusRight,
        deadline: deadlineStr,
        deadlineTimestamp,
        dailyRate: `${formatRp(daily)} / hari`,
        badgeWarm: diffDays <= 45,
        isPriority: Number(row.porsi_alokasi || 0) >= 30 || target >= 3000000,
        isShortTerm: diffDays <= 120
      };
    });

    await updateWeeklyConsistency();
    renderGoals();
  }

  // 4. Render Kartu Target & Statistik
  function renderGoals() {
    const totalSaved = goals.reduce((sum, g) => sum + g.saved, 0);
    document.getElementById('activeTotalSaved').innerHTML =
      `<small>Rp</small>${formatDots(totalSaved)}`;

    document.getElementById('countAll').textContent = goals.length;
    document.getElementById('countPriority').textContent = goals.filter((g) => g.isPriority).length;
    document.getElementById('countShort').textContent = goals.filter((g) => g.isShortTerm).length;
    const completedCount = goals.filter((g) => g.saved >= g.target).length;
    document.getElementById('countDone').textContent = completedCount;

    // Update Widget Target Tercapai di Sidebar Kiri secara dinamis
    const avgPct = goals.length > 0
      ? Math.round(
          goals.reduce((acc, g) => acc + Math.min(100, (g.saved / Math.max(1, g.target)) * 100), 0) /
            goals.length
        )
      : 0;
    const ratioEl = document.getElementById('sidebarTargetRatio');
    const barEl = document.getElementById('sidebarTargetBar');
    if (ratioEl) ratioEl.textContent = `${completedCount} / ${goals.length}`;
    if (barEl) barEl.style.width = `${avgPct}%`;

    const filtered = goals.filter((g) => {
      const matchSearch =
        g.title.toLowerCase().includes(searchQuery) ||
        g.categoryLabel.toLowerCase().includes(searchQuery);
      if (!matchSearch) return false;
      if (currentFilter === 'priority') return g.isPriority;
      if (currentFilter === 'short') return g.isShortTerm;
      if (currentFilter === 'done') return g.saved >= g.target;
      return true;
    });

    const grid = document.getElementById('goalsCardsGrid');
    grid.innerHTML = '';

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="g-card" style="grid-column: 1 / -1; text-align:center; padding: 26px 20px;">
          <h3 style="font-size: 16px; font-weight: 800; margin-bottom: 6px;">Tidak ada target pada kategori ini</h3>
          <p style="color:#64748b; font-size: 12.5px; max-width: 420px; margin: 0 auto; line-height: 1.5;">
            Klik tombol <strong>+ Buat Target Tabungan Baru</strong> untuk menambahkan rencana tabunganmu.
          </p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    filtered.forEach((g) => {
      const pct = Math.min(100, Math.round((g.saved / g.target) * 100));
      const remaining = Math.max(0, g.target - g.saved);

      const card = document.createElement('div');
      card.className = 'g-card';
      card.innerHTML = `
        <div>
          <div class="gc-top">
            <div class="gc-left">
              <div class="gc-icon"><i data-lucide="${g.iconName}" width="19" height="19"></i></div>
              <div>
                <span class="gc-cat-label">${g.categoryLabel}</span>
                <h3>${g.title}</h3>
              </div>
            </div>
            <span class="gc-pct-badge ${g.badgeWarm ? 'warm' : ''}">${pct}%<br>Terkumpul</span>
          </div>
        </div>

        <div>
          <div class="gc-amounts-row">
            <div>
              <small>Terkumpul Saat Ini</small>
              <strong>${formatRp(g.saved)}</strong>
            </div>
            <div class="gc-target-side">
              <small>Target Akhir</small>
              <strong>${formatRp(g.target)}</strong>
            </div>
          </div>

          <div class="progress-track" style="margin-top:8px;">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>

          <div class="gc-meta-row">
            <span>Sisa: ${formatRp(remaining)}</span>
            <span>${pct >= 100 ? 'Target Tercapai!' : g.statusRight}</span>
          </div>

          <div class="gc-deadline-row">
            <span><i data-lucide="calendar" width="13" height="13"></i> ${g.deadline}</span>
            <span class="gc-daily-rate"><i data-lucide="wallet" width="13" height="13"></i> ${g.dailyRate}</span>
          </div>
        </div>

        <div class="gc-actions">
          <a href="goal-detail.html?id=${g.id}" class="btn-gc-detail">
            <i data-lucide="eye" width="14" height="14"></i> Detail & Riwayat
          </a>
          <button type="button" class="btn-gc-add" data-id="${g.id}">
            + Tambah Uang Tabungan
          </button>
        </div>
      `;
      grid.appendChild(card);
    });

    document.querySelectorAll('.btn-gc-add').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeDepositGoalId = btn.dataset.id;
        const targetObj = goals.find((x) => x.id === activeDepositGoalId);
        if (!targetObj) return;
        document.getElementById('depositGoalTitle').textContent = targetObj.title;
        document.getElementById('quickDepositModal').classList.add('open');
      });
    });

    if (window.lucide) lucide.createIcons();
  }

  // Tab Filter
  document.querySelectorAll('.ftab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ftab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      renderGoals();
    });
  });

  // Search Input
  document.getElementById('searchGoalInput').addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderGoals();
  });

  // Modal Buat Target Baru
  const createModal = document.getElementById('createGoalModal');
  const targetInput = document.getElementById('newGoalTarget');
  const initialInput = document.getElementById('newGoalInitial');
  const dateInput = document.getElementById('newGoalDate');

  // Set nilai awal Total Biaya Target sesuai Alokasi Tabungan Bulanan dari Settings (fallback: 5.000.000)
  targetInput.value = formatDots(getRecommendedTargetFromSettings());

  function setDefaultDate(months) {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    dateInput.value = d.toISOString().split('T')[0];
  }
  setDefaultDate(6);

  function updateModalCalc() {
    const tVal = parseDigits(targetInput.value);
    const iVal = parseDigits(initialInput.value);
    const rem = Math.max(0, tVal - iVal);

    document.getElementById('remainingCalcText').textContent =
      `Sisa yang perlu ditabung: ${formatRp(rem)}`;

    const totalDays = Math.max(1, selectedMonths * 30);
    const daily = Math.ceil(rem / totalDays / 500) * 500;
    const weekly = daily * 7;

    document.getElementById('recommendationText').innerHTML =
      `Untuk mencapai target dalam ${selectedMonths} bulan, kamu cukup menyisihkan <strong>${formatRp(daily)}/hari</strong> atau <strong>${formatRp(weekly)}/minggu</strong> dari uang saku.`;
  }

  [targetInput, initialInput].forEach((inp) => {
    inp.addEventListener('input', () => {
      const val = parseDigits(inp.value);
      inp.value = val ? formatDots(val) : '';
      updateModalCalc();
    });
  });

  document.querySelectorAll('.amt-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      targetInput.value = formatDots(Number(chip.dataset.target));
      updateModalCalc();
    });
  });

  document.querySelectorAll('.dur-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.dur-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      selectedMonths = Number(chip.dataset.months);
      setDefaultDate(selectedMonths);
      updateModalCalc();
    });
  });

  document.querySelectorAll('.cat-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedCategory = btn.dataset.cat;
      selectedCatIcon = btn.dataset.icon;
    });
  });

  document.getElementById('openCreateModalBtn').addEventListener('click', () => {
    // Setiap modal dibuka, isi Total Biaya Target dengan alokasi tabungan bulanan dari Settings (atau 5.000.000 jika belum diatur)
    targetInput.value = formatDots(getRecommendedTargetFromSettings());
    updateModalCalc();
    createModal.classList.add('open');
  });

  const closeCreateModal = () => createModal.classList.remove('open');
  document.getElementById('closeModalBtn').addEventListener('click', closeCreateModal);
  document.getElementById('cancelModalBtn').addEventListener('click', closeCreateModal);

  // 5. Submit Buat Target Baru -> Simpan ke public.saving_goals
  document.getElementById('createGoalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('newGoalTitle').value.trim() || 'Target Tabungan Baru';
    const target = parseDigits(targetInput.value) || getRecommendedTargetFromSettings();
    const saved = parseDigits(initialInput.value);
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const palette = ['#4f6b18', '#9bc524', '#d2ea9c', '#65a30d', '#3f6212'];
    const pickedColor = palette[goals.length % palette.length];

    const { data: insertedGoal, error: insertErr } = await window.sb
      .from('saving_goals')
      .insert({
        user_id: user.id,
        nama_tujuan: title,
        deskripsi: `Prioritas • ${selectedCategory}`,
        target_nominal: target,
        nominal_terkumpul: saved,
        target_waktu: dateInput.value || null,
        porsi_alokasi: 25,
        warna: pickedColor,
        status: saved >= target ? 'selesai' : 'aktif'
      })
      .select()
      .single();

    if (insertErr) {
      showToast('Gagal menyimpan target: ' + insertErr.message);
      submitBtn.disabled = false;
      return;
    }

    // Jika ada saldo awal > 0, catat juga ke saving_transactions
    if (insertedGoal && saved > 0) {
      await window.sb.from('saving_transactions').insert({
        user_id: user.id,
        goal_id: insertedGoal.goal_id,
        nominal: saved,
        sumber_dana: 'Saldo Awal Target',
        keterangan: `Saldo awal target ${title}`
      });
    }

    submitBtn.disabled = false;
    closeCreateModal();
    document.getElementById('newGoalTitle').value = '';
    initialInput.value = '0';
    await loadGoalsFromSupabase();
    showToast(`Target "${title}" berhasil disimpan ke database!`);
  });

  // 6. Modal Tambah Uang Tabungan -> Update saving_goals & Catat saving_transactions + Auto-Overflow Deadline Terdekat
  const depositModal = document.getElementById('quickDepositModal');
  const depositInput = document.getElementById('depositAmountInput');

  depositInput.addEventListener('input', () => {
    const val = parseDigits(depositInput.value);
    depositInput.value = val ? formatDots(val) : '';
  });

  document.querySelectorAll('.dep-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      depositInput.value = formatDots(Number(chip.dataset.val));
    });
  });

  const closeDepositModal = () => depositModal.classList.remove('open');
  document.getElementById('closeDepositModal').addEventListener('click', closeDepositModal);
  document.getElementById('cancelDepositBtn').addEventListener('click', closeDepositModal);

  document.getElementById('quickDepositForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const addVal = parseDigits(depositInput.value);
    if (!addVal || !activeDepositGoalId) return;

    const gObj = goals.find((x) => x.id === activeDepositGoalId);
    if (!gObj) return;

    const submitDepBtn = e.target.querySelector('button[type="submit"]');
    submitDepBtn.disabled = true;

    const remainingBefore = Math.max(0, gObj.target - gObj.saved);
    const excessAmount = addVal > remainingBefore ? addVal - remainingBefore : 0;

    // Cari target lain yang belum selesai dengan deadline paling cepat
    const otherUnfinished = goals
      .filter((x) => x.id !== gObj.id && x.saved < x.target)
      .sort((a, b) => a.deadlineTimestamp - b.deadlineTimestamp);

    if (excessAmount > 0 && otherUnfinished.length > 0) {
      const nextTarget = otherUnfinished[0];
      const allocMain = remainingBefore;

      const splitToNext = await window.sgConfirm({
        title: 'Kelebihan Dana Tabungan',
        message: `Target "${gObj.title}" hanya butuh ${formatRp(allocMain)} lagi untuk mencapai 100%. Kelebihan ${formatRp(excessAmount)} direkomendasikan masuk ke "${nextTarget.title}" (deadline terdekat: ${nextTarget.deadline}). Alihkan otomatis?`,
        confirmText: 'Ya, Alihkan Sisa',
        cancelText: 'Tetap di Target Ini'
      });

      if (splitToNext) {
        if (allocMain > 0) {
          await window.sb
            .from('saving_goals')
            .update({
              nominal_terkumpul: gObj.saved + allocMain,
              status: 'selesai',
              updated_at: new Date().toISOString()
            })
            .eq('goal_id', gObj.id);

          await window.sb.from('saving_transactions').insert({
            user_id: user.id,
            goal_id: gObj.id,
            nominal: allocMain,
            sumber_dana: 'Setoran Halaman Target',
            keterangan: `Pelunasan target ${gObj.title}`
          });
        }

        const nextNewSaved = nextTarget.saved + excessAmount;
        await window.sb
          .from('saving_goals')
          .update({
            nominal_terkumpul: nextNewSaved,
            status: nextNewSaved >= nextTarget.target ? 'selesai' : 'aktif',
            updated_at: new Date().toISOString()
          })
          .eq('goal_id', nextTarget.id);

        await window.sb.from('saving_transactions').insert({
          user_id: user.id,
          goal_id: nextTarget.id,
          nominal: excessAmount,
          sumber_dana: 'Pengalihan Kelebihan Setoran',
          keterangan: `Kelebihan setoran dari ${gObj.title}`
        });

        submitDepBtn.disabled = false;
        closeDepositModal();
        depositInput.value = '';
        await loadGoalsFromSupabase();
        showToast(`${formatRp(allocMain)} melunasi "${gObj.title}" & sisa ${formatRp(excessAmount)} masuk ke "${nextTarget.title}"!`);
        return;
      }
    }

    const newSaved = gObj.saved + addVal;
    const isDone = newSaved >= gObj.target;

    const { error: upErr } = await window.sb
      .from('saving_goals')
      .update({
        nominal_terkumpul: newSaved,
        status: isDone ? 'selesai' : 'aktif',
        updated_at: new Date().toISOString()
      })
      .eq('goal_id', gObj.id);

    if (upErr) {
      showToast('Gagal menyimpan setoran: ' + upErr.message);
      submitDepBtn.disabled = false;
      return;
    }

    await window.sb.from('saving_transactions').insert({
      user_id: user.id,
      goal_id: gObj.id,
      nominal: addVal,
      sumber_dana: 'Setoran Halaman Target',
      keterangan: `Setoran ke ${gObj.title}`
    });

    submitDepBtn.disabled = false;
    closeDepositModal();
    depositInput.value = '';
    await loadGoalsFromSupabase();
    showToast(`Berhasil menambah ${formatRp(addVal)} ke ${gObj.title}!`);
  });

  // Fungsi Ikon Lonceng Pengingat Target Terdekat
  const btnNotifBell = document.getElementById('btnNotifBell');
  if (btnNotifBell) {
    btnNotifBell.addEventListener('click', () => {
      if (goals.length === 0) {
        showToast('Pengingat: Belum ada target tabungan aktif. Yuk buat target pertamamu!');
        return;
      }
      const unfinished = goals
        .map((g) => ({
          ...g,
          remaining: Math.max(0, g.target - g.saved)
        }))
        .filter((g) => g.remaining > 0)
        .sort((a, b) => a.remaining - b.remaining);

      if (unfinished.length === 0) {
        showToast('Selamat! Semua target tabunganmu sudah tercapai 100%!');
      } else {
        const nearest = unfinished[0];
        showToast(`Pengingat: "${nearest.title}" kurang ${formatRp(nearest.remaining)} lagi!`);
      }
    });
  }

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

  await loadGoalsFromSupabase();
});