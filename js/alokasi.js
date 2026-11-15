document.addEventListener('DOMContentLoaded', async () => {
  // 1. Cek Sesi Login Supabase
  const { data: { session }, error: sessionError } = await window.sb.auth.getSession();
  if (sessionError || !session) {
    window.location.href = 'index.html';
    return;
  }

  const user = session.user;
  const formatRp = (num) => 'Rp ' + Math.round(Number(num || 0)).toLocaleString('id-ID');
  const formatDots = (num) => Math.round(Number(num || 0)).toLocaleString('id-ID');

  function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3200);
  }

  // 2. Ambil Profil User & Foto Avatar dari Supabase / LocalStorage
  const metaName = user.user_metadata?.full_name || user.user_metadata?.name || '';
  const fallbackName = metaName.trim() || user.email.split('@')[0];

  const { data: profile } = await window.sb
    .from('users')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  const displayName = profile?.nama || fallbackName;
  const jurusan = profile?.jurusan || 'Ilmu Komputer';
  const nameParts = displayName.trim().split(/\s+/);
  const firstName = nameParts[0];
  const initials = nameParts.length > 1
    ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
    : displayName.slice(0, 2).toUpperCase();

  const sidebarUserEl = document.getElementById('sidebarUserName');
  const sidebarRoleEl = document.getElementById('sidebarUserRole');
  const topUserEl = document.getElementById('topUserName');
  const topMajorEl = document.getElementById('topUserMajor');
  const topAvatarEl = document.getElementById('topAvatarInitials');

  if (sidebarUserEl) sidebarUserEl.textContent = displayName;
  if (sidebarRoleEl) sidebarRoleEl.textContent = `${jurusan} UB`;
  if (topUserEl) topUserEl.textContent = `${firstName}.`;
  if (topMajorEl) topMajorEl.textContent = jurusan;

  if (topAvatarEl) {
    topAvatarEl.textContent = initials;
    const savedAvatar =
      profile?.avatar_url ||
      user.user_metadata?.avatar_url ||
      localStorage.getItem(`sg_avatar_${user.id}`);
    if (savedAvatar) {
      topAvatarEl.style.overflow = 'hidden';
      topAvatarEl.innerHTML = `<img src="${savedAvatar}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" />`;
    }
  }

  // 3. Ambil Target Tabungan User dari Supabase
  const { data: goalsData } = await window.sb
    .from('saving_goals')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  const goals = goalsData || [];

  // State UI
  let selectedMode = 'split';
  let selectedSource = 'Gaji & Tabungan';

  const allocAmountInput = document.getElementById('allocAmount');
  const getNumericAmount = () => Number((allocAmountInput?.value || '0').replace(/\D/g, '')) || 0;

  function computeWeights(activeGoals) {
    if (activeGoals.length === 0) return [];
    if (activeGoals.length === 1) return [100];
    if (activeGoals.length === 2) return [60, 40];
    if (activeGoals.length === 3) return [50, 30, 20];

    const base = Math.floor(100 / activeGoals.length);
    const remainder = 100 - base * activeGoals.length;
    return activeGoals.map((_, i) => (i === 0 ? base + remainder : base));
  }

  function addDaysToMonthLabel(daysFromNow, shortMonth = true) {
    const d = new Date();
    d.setDate(d.getDate() + Math.max(0, daysFromNow));
    return d.toLocaleDateString('id-ID', {
      month: shortMonth ? 'short' : 'long',
      year: 'numeric'
    });
  }

  function renderAll() {
    const completedGoals = goals.filter(
      (g) => Number(g.nominal_terkumpul) >= Number(g.target_nominal)
    ).length;
    const avgPct = goals.length > 0
      ? Math.round(
          goals.reduce(
            (acc, g) =>
              acc + Math.min(100, (Number(g.nominal_terkumpul) / Math.max(1, Number(g.target_nominal))) * 100),
            0
          ) / goals.length
        )
      : 0;

    const ratioEl = document.getElementById('sidebarTargetRatio');
    const barEl = document.getElementById('sidebarTargetBar');
    if (ratioEl) ratioEl.textContent = `${completedGoals} / ${goals.length}`;
    if (barEl) barEl.style.width = `${avgPct}%`;

    const amount = getNumericAmount();
    const weights = computeWeights(goals);
    const barColors = ['#4f6b18', '#9bc524', '#c5e384', '#7ca81b', '#a8d149'];

    // Render Distribusi Target Tabungan (Kolom Kiri)
    const modeGridContainer = document.getElementById('modeGridContainer');
    const btnSubmit = document.getElementById('btnSubmitAlloc');

    if (goals.length === 0) {
      modeGridContainer.innerHTML = `
        <div class="empty-goal-notice">
          <strong>Belum ada target tabungan aktif.</strong><br/>
          Buat minimal 1 target terlebih dahulu agar dana setoran bisa dialokasikan.
          <br/>
          <a href="goals.html">+ Buat Target Baru</a>
        </div>
      `;
      if (btnSubmit) btnSubmit.disabled = true;
    } else {
      if (btnSubmit) btnSubmit.disabled = false;
      const splitSummary = goals
        .map((g, i) => `${g.nama_tujuan.split(' ')[0]} ${weights[i]}%`)
        .join(' • ');

      let cardsHtml = `
        <div class="mode-grid">
          <label class="mode-card ${selectedMode === 'split' ? 'active' : ''}" data-mode="split">
            <input type="radio" name="distMode" value="split" ${selectedMode === 'split' ? 'checked' : ''} />
            <div>
              <strong>Smart Split Proporsional</strong>
              <span>${splitSummary}</span>
            </div>
          </label>
      `;

      goals.forEach((g) => {
        const isChecked = selectedMode === g.goal_id;
        cardsHtml += `
          <label class="mode-card ${isChecked ? 'active' : ''}" data-mode="${g.goal_id}">
            <input type="radio" name="distMode" value="${g.goal_id}" ${isChecked ? 'checked' : ''} />
            <div>
              <strong>${g.nama_tujuan}</strong>
              <span>100% Masuk ke ${g.nama_tujuan}</span>
            </div>
          </label>
        `;
      });

      cardsHtml += `</div>`;
      modeGridContainer.innerHTML = cardsHtml;

      modeGridContainer.querySelectorAll('.mode-card').forEach((card) => {
        card.addEventListener('click', () => {
          selectedMode = card.dataset.mode;
          renderAll();
        });
      });
    }

    // Render Formula Alokasi Otomatis (Kolom Kanan Atas)
    const stackedBar = document.getElementById('formulaStackedBar');
    const totalPctEl = document.getElementById('formulaTotalPct');
    const formulaListEl = document.getElementById('formulaListContainer');

    if (goals.length === 0) {
      stackedBar.innerHTML = '';
      totalPctEl.textContent = 'Total Terdistribusi: 0%';
      formulaListEl.innerHTML = `
        <div class="empty-goal-notice">
          Belum ada target tabungan untuk ditampilkan dalam formula alokasi.
        </div>
      `;
    } else {
      stackedBar.innerHTML = goals
        .map(
          (_, i) =>
            `<span style="width:${weights[i]}%; background:${barColors[i % barColors.length]}; display:inline-block; height:100%;"></span>`
        )
        .join('');
      totalPctEl.textContent = 'Total Terdistribusi: 100%';

      formulaListEl.innerHTML = goals
        .map((g, i) => {
          const pct = selectedMode === 'split'
            ? weights[i]
            : selectedMode === g.goal_id
              ? 100
              : 0;
          const allocNominal = Math.round((amount * pct) / 100);
          const color = barColors[i % barColors.length];
          const posLabel = `Pos ${i + 1}`;

          return `
            <div class="formula-item">
              <div class="fi-top">
                <span><i class="dot" style="background:${color}"></i> ${posLabel}: ${g.nama_tujuan}</span>
                <strong>${pct}%</strong>
              </div>
              <div class="fi-sub">
                <span>Target: ${formatRp(g.target_nominal)}</span>
                <strong>Alokasi: ${formatRp(allocNominal)}</strong>
              </div>
            </div>
          `;
        })
        .join('');
    }

    // Render Proyeksi Percepatan (Kolom Kanan Bawah)
    const totalSaved = goals.reduce((acc, g) => acc + Number(g.nominal_terkumpul || 0), 0);
    const dailyRate = Math.max(5000, Math.round(amount / 3));
    const monthlyAdd = dailyRate * 30;

    document.getElementById('projDailyRate').textContent = `+${formatRp(dailyRate)}/hari`;
    document.getElementById('projMonthlyAdd').textContent = `+${formatRp(monthlyAdd)}`;
    document.getElementById('projCurrentTotal').textContent = formatRp(totalSaved);

    const svgMonthEl = document.getElementById('projSvgMonthLabel');

    if (goals.length === 0) {
      document.getElementById('projGoalLabel').textContent = 'ESTIMASI TARGET TERCAPAI';
      document.getElementById('projFasterDays').textContent = '0 Hari (Belum Ada Target)';
      document.getElementById('projNormalDate').textContent = 'Normal (-)';
      document.getElementById('projBoostDate').textContent = 'Ditambah Setor Kilat (-)';
      if (svgMonthEl) svgMonthEl.textContent = '-';
    } else {
      const primaryGoal = selectedMode === 'split'
        ? goals[0]
        : goals.find((g) => g.goal_id === selectedMode) || goals[0];
      const remaining = Math.max(
        0,
        Number(primaryGoal.target_nominal) - Number(primaryGoal.nominal_terkumpul)
      );

      const boostDaysNeeded = remaining === 0 ? 0 : Math.ceil(remaining / dailyRate);
      const fasterDays = remaining === 0 ? 0 : Math.max(1, Math.min(90, Math.round(remaining / dailyRate / 4)));
      const normalDaysNeeded = boostDaysNeeded + fasterDays;

      const normalShortDate = addDaysToMonthLabel(normalDaysNeeded, true);
      const boostShortDate = addDaysToMonthLabel(boostDaysNeeded, true);
      const boostLongDate = addDaysToMonthLabel(boostDaysNeeded, false);

      document.getElementById('projGoalLabel').innerHTML =
        `ESTIMASI ${primaryGoal.nama_tujuan.toUpperCase()}<br/>TERCAPAI`;
      document.getElementById('projFasterDays').innerHTML =
        remaining === 0 ? 'Target Tercapai!' : `${fasterDays} Hari Lebih<br/>Cepat`;
      document.getElementById('projNormalDate').textContent = `Normal (${normalShortDate})`;
      document.getElementById('projBoostDate').textContent =
        remaining === 0 ? 'Tercapai 100%' : `Ditambah Setor Kilat (${boostShortDate})`;
      if (svgMonthEl) svgMonthEl.textContent = `Target: ${boostLongDate}`;
    }

    if (window.lucide) lucide.createIcons();
  }

  // Event Input Nominal & Chip Cepat
  if (allocAmountInput) {
    allocAmountInput.addEventListener('input', () => {
      const val = getNumericAmount();
      allocAmountInput.value = val ? formatDots(val) : '';
      renderAll();
    });
  }

  document.querySelectorAll('.amt-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.amt-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      allocAmountInput.value = formatDots(Number(chip.dataset.val));
      renderAll();
    });
  });

  // Event Pilih Sumber Dana
  document.querySelectorAll('.source-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.source-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedSource = btn.dataset.source;
    });
  });

  // Reset Formula ke Smart Split
  const resetBtn = document.getElementById('resetFormulaBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      selectedMode = 'split';
      renderAll();
      showToast('Formula alokasi dikembalikan ke Smart Split Proporsional.');
    });
  }

  // Toggle Auto-Roundup QRIS (UI Saja)
  const qrisToggle = document.getElementById('qrisToggle');
  if (qrisToggle) {
    qrisToggle.addEventListener('change', () => {
      showToast(
        qrisToggle.checked
          ? 'Auto-Roundup QRIS diaktifkan!'
          : 'Auto-Roundup QRIS dinonaktifkan.'
      );
    });
  }

  // 4. Submit Konfirmasi Alokasi & Setor ke Supabase
  document.getElementById('allocDepositForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (goals.length === 0) {
      showToast('Buat target tabungan dulu di halaman Saving Goals.');
      return;
    }

    const totalAmount = getNumericAmount();
    if (!totalAmount || totalAmount <= 0) {
      showToast('Masukkan nominal setoran yang valid.');
      return;
    }

    const submitBtn = document.getElementById('btnSubmitAlloc');
    submitBtn.disabled = true;

    const noteText =
      document.getElementById('reflectionNote')?.value.trim() || 'Setoran Alokasi Kilat';
    const weights = computeWeights(goals);

    const allocations = [];
    if (selectedMode === 'split') {
      let distributed = 0;
      goals.forEach((g, idx) => {
        const part =
          idx === goals.length - 1
            ? totalAmount - distributed
            : Math.round((totalAmount * weights[idx]) / 100);
        distributed += part;
        if (part > 0) allocations.push({ goal: g, amount: part });
      });
    } else {
      const targetGoal = goals.find((g) => g.goal_id === selectedMode) || goals[0];
      allocations.push({ goal: targetGoal, amount: totalAmount });
    }

    for (const item of allocations) {
      const newSaved = Number(item.goal.nominal_terkumpul) + item.amount;
      const isDone = newSaved >= Number(item.goal.target_nominal);

      await window.sb
        .from('saving_goals')
        .update({
          nominal_terkumpul: newSaved,
          status: isDone ? 'selesai' : 'aktif',
          updated_at: new Date().toISOString()
        })
        .eq('goal_id', item.goal.goal_id);

      item.goal.nominal_terkumpul = newSaved;

      await window.sb.from('saving_transactions').insert({
        user_id: user.id,
        goal_id: item.goal.goal_id,
        nominal: item.amount,
        sumber_dana: selectedSource,
        keterangan: noteText
      });
    }

    submitBtn.disabled = false;
    renderAll();
    showToast(`Berhasil menyetor ${formatRp(totalAmount)} sesuai formula alokasi!`);

    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 1100);
  });

  // Mobile Sidebar Toggle
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const menuToggle = document.getElementById('menuToggle');
  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.add('open');
      overlay.classList.add('show');
    });
  }
  const closeSidebar = () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
  };
  const closeSidebarBtn = document.getElementById('closeSidebarBtn');
  if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);
  if (overlay) overlay.addEventListener('click', closeSidebar);

  renderAll();
});