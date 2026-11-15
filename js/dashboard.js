document.addEventListener('DOMContentLoaded', async () => {
  // 1. Cek Sesi Login Supabase (Auth Guard)
  const { data: { session }, error: sessionError } = await window.sb.auth.getSession();
  if (sessionError || !session) {
    window.location.href = 'index.html';
    return;
  }

  const user = session.user;
  const formatRp = (num) => 'Rp ' + Number(num).toLocaleString('id-ID');
  const formatDots = (num) => Number(num).toLocaleString('id-ID');

  // Format singkat bahasa Indonesia (Ribu, Juta, Miliar) untuk tengah donut chart
  function formatRpSingkatIndo(num) {
    const val = Number(num) || 0;
    if (val >= 1000000000) {
      return `Rp ${(val / 1000000000).toFixed(2).replace('.', ',').replace(/,00$/, '')} Miliar`;
    }
    if (val >= 1000000) {
      return `Rp ${(val / 1000000).toFixed(2).replace('.', ',').replace(/,00$/, '')} Juta`;
    }
    if (val >= 1000) {
      return `Rp ${Math.round(val / 1000).toLocaleString('id-ID')} Ribu`;
    }
    return formatRp(val);
  }

  function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }

  // 2. Ambil atau Buat Profil User di Tabel public.users
  const metaName = user.user_metadata?.full_name || user.user_metadata?.name || '';
  const fallbackName = metaName.trim() || user.email.split('@')[0];

  let { data: profile } = await window.sb
    .from('users')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile) {
    const { data: newProfile } = await window.sb
      .from('users')
      .upsert({
        user_id: user.id,
        email: user.email,
        nama: fallbackName,
        universitas: 'Universitas Brawijaya',
        jurusan: 'Ilmu Komputer'
      })
      .select()
      .single();

    profile = newProfile || {
      user_id: user.id,
      nama: fallbackName,
      email: user.email,
      universitas: 'Universitas Brawijaya',
      jurusan: 'Ilmu Komputer'
    };
  }

  // Render Nama, Jurusan & Inisial User yang Login
  const displayName = profile.nama || fallbackName;
  const nameParts = displayName.trim().split(/\s+/);
  const firstName = nameParts[0];
  const initials = nameParts.length > 1
    ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
    : displayName.slice(0, 2).toUpperCase();

  document.getElementById('sidebarUserName').textContent = displayName;
  const sidebarRoleEl = document.querySelector('.profile-meta span');
  if (sidebarRoleEl) {
    sidebarRoleEl.textContent = `${profile.jurusan || 'Ilmu Komputer'} UB`;
  }

  document.getElementById('topUserName').textContent = firstName + '.';
  document.getElementById('topAvatarInitials').textContent = initials;
  const savedAvatar = user.user_metadata?.avatar_url || localStorage.getItem(`sg_avatar_${user.id}`);
  if (savedAvatar) {
    const topAvEl = document.getElementById('topAvatarInitials');
    if (topAvEl) {
      topAvEl.style.overflow = 'hidden';
      topAvEl.innerHTML = `<img src="${savedAvatar}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" />`;
    }
  }
  document.getElementById('greetingTitle').innerHTML =
    `Halo, ${firstName}! <i data-lucide="sprout" width="24" height="24"></i>`;

  // 3. Ambil Target Tabungan dari public.saving_goals
  const { data: goalsData } = await window.sb
    .from('saving_goals')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  const goals = goalsData || [];

  // 4. Ambil Riwayat Transaksi dari public.saving_transactions
  const { data: activitiesData } = await window.sb
    .from('saving_transactions')
    .select('*, saving_goals(nama_tujuan)')
    .eq('user_id', user.id)
    .order('tanggal_transaksi', { ascending: false })
    .limit(30);

  const activities = activitiesData || [];
  let isActivityExpanded = false;

  // 5. Cek Status Challenge Pekan Ini
  const { data: activeChallenge } = await window.sb
    .from('saving_challenges')
    .select('*')
    .limit(1)
    .maybeSingle();

  let userChallenge = null;
  if (activeChallenge) {
    const { data: uc } = await window.sb
      .from('user_challenges')
      .select('*')
      .eq('user_id', user.id)
      .eq('challenge_id', activeChallenge.challenge_id)
      .maybeSingle();
    userChallenge = uc;
  }

  function getStreakDaysCount() {
    const uniqueDays = new Set(
      activities
        .filter((a) => a.sumber_dana !== 'Reward Streak')
        .map((a) => new Date(a.tanggal_transaksi).toISOString().split('T')[0])
    );
    return uniqueDays.size;
  }

  const STREAK_MILESTONES = [
    { days: 3, title: 'Bonus Reward Streak 3 Hari', subtitle: 'Voucher Kopi Kampus' },
    { days: 7, title: 'Bonus Reward Streak 7 Hari', subtitle: 'Voucher Makan Siang Kantin' },
    { days: 15, title: 'Bonus Reward Streak 15 Hari', subtitle: 'Voucher Buku Akademik' },
    { days: 30, title: 'Bonus Reward Streak 30 Hari', subtitle: 'Sertifikat Disiplin Finansial' }
  ];

  async function checkAndGrantStreakReward(goalId) {
    const currentStreak = getStreakDaysCount();
    const milestone = STREAK_MILESTONES.find((m) => m.days === currentStreak);
    if (!milestone) return;

    const alreadyClaimed = activities.some(
      (a) => a.sumber_dana === 'Reward Streak' && a.keterangan === milestone.title
    );
    if (alreadyClaimed) return;

    const { data: rewardTx } = await window.sb
      .from('saving_transactions')
      .insert({
        user_id: user.id,
        goal_id: goalId,
        nominal: 0,
        sumber_dana: 'Reward Streak',
        keterangan: milestone.title
      })
      .select('*, saving_goals(nama_tujuan)')
      .single();

    if (rewardTx) {
      activities.unshift(rewardTx);
      showToast(`Selamat! ${milestone.title} (${milestone.subtitle}) berhasil diklaim!`);
    }
  }

  function getGoalVisuals(g, idx) {
    const titleLower = (g.nama_tujuan || '').toLowerCase();
    let iconName = 'target';
    if (titleLower.includes('laptop')) iconName = 'laptop';
    else if (titleLower.includes('kos') || titleLower.includes('darurat')) iconName = 'home';
    else if (titleLower.includes('sertifikasi') || titleLower.includes('portofolio')) iconName = 'shield-check';

    let eta = 'Berjalan';
    let etaWarm = false;
    if (g.target_waktu) {
      const diffDays = Math.ceil((new Date(g.target_waktu) - new Date()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 0) {
        eta = 'Jatuh tempo';
        etaWarm = true;
      } else if (diffDays <= 30) {
        eta = `${Math.max(1, Math.ceil(diffDays / 7))} minggu lagi`;
        etaWarm = true;
      } else {
        eta = `${Math.round(diffDays / 30)} bulan lagi`;
      }
    }

    const palette = ['#8ec31e', '#6fb088', '#e8dc88', '#8bb8d0'];

    return {
      iconName,
      eta,
      etaWarm,
      color: palette[idx % palette.length],
      dotColor: palette[idx % palette.length]
    };
  }

  function formatTimeLabel(isoStr) {
    if (!isoStr) return 'Baru saja';
    const diffMins = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60000);
    if (diffMins < 1) return 'Baru saja';
    if (diffMins < 60) return `${diffMins} menit lalu`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} jam lalu`;
    return new Date(isoStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  }

  // 6. Render Seluruh Tampilan Dashboard
  function renderAll() {
    const totalSaved = goals.reduce((acc, g) => acc + Number(g.nominal_terkumpul || 0), 0);

    // Penghematan Mindful: khusus setoran mikro/challenge (tidak termasuk Saldo Awal Target & Reward Streak)
    const totalMindful = activities
      .filter((a) => a.sumber_dana !== 'Saldo Awal Target' && a.sumber_dana !== 'Reward Streak')
      .reduce((acc, a) => acc + Number(a.nominal || 0), 0);

    const completedGoals = goals.filter((g) => Number(g.nominal_terkumpul) >= Number(g.target_nominal)).length;
    const avgPct = goals.length > 0
      ? Math.round(
          goals.reduce(
            (acc, g) => acc + Math.min(100, (Number(g.nominal_terkumpul) / Number(g.target_nominal)) * 100),
            0
          ) / goals.length
        )
      : 0;

    const sidebarRatioEl = document.getElementById('sidebarTargetRatio');
    const sidebarBarEl = document.getElementById('sidebarTargetBar');
    if (sidebarRatioEl) sidebarRatioEl.textContent = `${completedGoals} / ${goals.length}`;
    if (sidebarBarEl) sidebarBarEl.style.width = `${avgPct}%`;

    const streakDays = getStreakDaysCount();

    document.getElementById('totalSavedDisplay').innerHTML =
      `<small>Rp</small>${formatDots(totalSaved)}`;

    document.getElementById('activeGoalsCount').textContent = goals.length;
    document.getElementById('totalGoalsLink').textContent = goals.length;
    document.getElementById('avgProgressText').textContent = goals.length > 0
      ? `Rata-rata progres tercapai ${avgPct}%`
      : 'Belum ada sasaran aktif';
    document.getElementById('mindfulSavedDisplay').textContent = formatRp(totalMindful);
    document.getElementById('streakDays').textContent = streakDays;
    document.getElementById('donutTotalText').textContent = formatRpSingkatIndo(totalSaved);

    const goalsContainer = document.getElementById('goalsListContainer');
    const targetSelect = document.getElementById('targetSelect');
    const currentSelectedId = targetSelect.value;
    goalsContainer.innerHTML = '';
    targetSelect.innerHTML = '';

    if (goals.length === 0) {
      goalsContainer.innerHTML = `
      <div class="goal-card" style="text-align:center; padding: 24px 18px;">
        <h3 style="font-size: 16px; font-weight: 800; margin-bottom: 6px;">Belum Ada Target Tabungan</h3>
        <p style="font-size: 12.5px; max-width: 400px; margin: 0 auto 14px; line-height: 1.5;">
          Mulai buat target pertamamu untuk melacak progres tabungan dari Rp 0.
        </p>
        <a href="goals.html" class="btn-goal-quick" style="display:inline-flex; padding: 8px 16px; font-size: 12px; text-decoration:none;">
          + Buat Target Baru
        </a>
      </div>
    `;
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = '-- Buat target dulu di Saving Goals --';
      targetSelect.appendChild(emptyOpt);
    } else {
      goals.forEach((g, idx) => {
        const saved = Number(g.nominal_terkumpul || 0);
        const target = Number(g.target_nominal || 1);
        const pct = Math.min(100, Math.round((saved / target) * 100));
        const remaining = Math.max(0, target - saved);
        const visuals = getGoalVisuals(g, idx);

        const leftText = remaining === 0
          ? 'Target Tercapai!'
          : `Sisa kekurangan: ${formatRp(remaining)}`;
        const rightStatus = pct >= 100 ? 'Selesai' : 'On Track';

        const card = document.createElement('div');
        card.className = 'goal-card';
        card.innerHTML = `
          <div class="goal-top">
            <div class="goal-title-group">
              <div class="goal-icon"><i data-lucide="${visuals.iconName}" width="18" height="18"></i></div>
              <div>
                <h3>${g.nama_tujuan}</h3>
                <p>${g.deskripsi || ''}</p>
              </div>
            </div>
            <div class="goal-badges">
              <span class="eta-pill ${visuals.etaWarm ? 'warm' : ''}">${visuals.eta}</span>
              <button type="button" class="btn-goal-quick" data-id="${g.goal_id}">Nabung Sekarang</button>
            </div>
          </div>
          <div class="goal-amounts">
            <div><strong>${formatRp(saved)}</strong> <span>dari ${formatRp(target)}</span></div>
            <strong>${pct}%</strong>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${pct}%"></div>
          </div>
          <div class="goal-footer">
            <span>${leftText}</span>
            <span class="goal-status">${rightStatus}</span>
          </div>
        `;
        goalsContainer.appendChild(card);

        const opt = document.createElement('option');
        opt.value = g.goal_id;
        opt.textContent = g.nama_tujuan;
        targetSelect.appendChild(opt);
      });

      if (currentSelectedId && goals.some((g) => g.goal_id === currentSelectedId)) {
        targetSelect.value = currentSelectedId;
      }
    }

    document.querySelectorAll('.btn-goal-quick[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.location.href = `goal-detail.html?id=${btn.dataset.id}`;
      });
    });

    // Aktivitas Micro-Saving Terakhir (default 3 item + tombol panah ekspansi)
    const activityList = document.getElementById('activityList');
    if (activities.length === 0) {
      activityList.innerHTML = '<p style="font-size:14px;">Belum ada aktivitas tabungan.</p>';
    } else {
      const MAX_VISIBLE_ACT = 3;
      const visibleActivities = isActivityExpanded ? activities : activities.slice(0, MAX_VISIBLE_ACT);
      const hiddenActCount = activities.length - MAX_VISIBLE_ACT;

      let actHtml = visibleActivities.map((act) => {
        const isReward = act.sumber_dana === 'Reward Streak' || Number(act.nominal) === 0;
        const goalTitle = act.saving_goals?.nama_tujuan || act.goal_title || 'Target Tabungan';
        const title = act.keterangan || act.sumber_dana || 'Setoran Tabungan';
        const milestoneInfo = STREAK_MILESTONES.find((m) => m.title === title);

        const iconName = isReward ? 'award' : 'arrow-down';
        const subtitleText = isReward
          ? `${milestoneInfo ? milestoneInfo.subtitle : 'Reward Konsistensi'} • ${formatTimeLabel(act.tanggal_transaksi)}`
          : `Masuk ke: ${goalTitle} • ${formatTimeLabel(act.tanggal_transaksi)}`;
        const rightLabel = isReward ? 'Terklaim' : `+${formatRp(act.nominal)}`;

        return `
          <div class="activity-item">
            <div class="act-left">
              <div class="act-icon"><i data-lucide="${iconName}" width="15" height="15"></i></div>
              <div>
                <strong>${title}</strong>
                <span>${subtitleText}</span>
              </div>
            </div>
            <span class="act-amount">${rightLabel}</span>
          </div>
        `;
      }).join('');

      if (hiddenActCount > 0) {
        actHtml += `
          <button type="button" id="btnToggleActivityExpand" style="
            margin-top: 6px;
            padding-top: 12px;
            border-top: 1px solid rgba(190, 214, 174, 0.65);
            border-left: none;
            border-right: none;
            border-bottom: none;
            background: transparent;
            width: 100%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            font-family: inherit;
            font-size: 12.5px;
            font-weight: 800;
            color: #3f6e11;
            cursor: pointer;
          ">
            ${isActivityExpanded
              ? 'Sembunyikan sebagian aktivitas <i data-lucide="chevron-up" width="15" height="15"></i>'
              : `Tampilkan ${hiddenActCount} aktivitas lainnya <i data-lucide="chevron-down" width="15" height="15"></i>`}
          </button>
        `;
      }

      activityList.innerHTML = actHtml;

      const toggleActBtn = document.getElementById('btnToggleActivityExpand');
      if (toggleActBtn) {
        toggleActBtn.addEventListener('click', () => {
          isActivityExpanded = !isActivityExpanded;
          renderAll();
        });
      }
    }

    // Donut Chart (Warna Potongan & Titik Legenda Sama Persis & Kontras)
    let cumulative = 0;
    const gradientParts = [];
    const legendList = document.getElementById('legendList');
    legendList.innerHTML = '';

    if (goals.length === 0 || totalSaved === 0) {
      document.getElementById('donutChart').style.background = '#e2e8f0';
      legendList.innerHTML = '<p style="font-size:13px;">Belum ada distribusi dana tersimpan.</p>';
    } else {
      goals.forEach((g, idx) => {
        const visuals = getGoalVisuals(g, idx);
        const share = (Number(g.nominal_terkumpul) / totalSaved) * 100;
        const start = cumulative;
        const end = cumulative + share;
        cumulative = end;
        gradientParts.push(`${visuals.color} ${start.toFixed(1)}% ${end.toFixed(1)}%`);

        legendList.innerHTML += `
          <div class="legend-item">
            <span class="legend-label">
              <span class="legend-dot" style="background:${visuals.dotColor}"></span>
              ${g.nama_tujuan.split(' ').slice(0, 2).join(' ')}
            </span>
            <strong>${share.toFixed(1)}%</strong>
          </div>
        `;
      });

      document.getElementById('donutChart').style.background = `conic-gradient(${gradientParts.join(', ')})`;
    }

    if (window.lucide) lucide.createIcons();
  }

  const quickAmountInput = document.getElementById('quickAmount');
  quickAmountInput.type = 'text';
  quickAmountInput.value = '20.000';

  const getNumericQuickAmount = () => Number(quickAmountInput.value.replace(/\D/g, '')) || 0;

  quickAmountInput.addEventListener('input', () => {
    const val = getNumericQuickAmount();
    quickAmountInput.value = val ? formatDots(val) : '';
  });

  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      quickAmountInput.value = formatDots(Number(btn.dataset.val));
    });
  });

  // 7. Submit Tabungan Kilat -> Simpan ke Supabase + Auto-Overflow Deadline Terdekat
  document.getElementById('quickSaveForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = getNumericQuickAmount();
    const goalId = document.getElementById('targetSelect').value;
    if (!amount || amount <= 0) return;

    if (!goalId) {
      showToast('Buat target tabungan terlebih dahulu di halaman Saving Goals.');
      return;
    }

    const targetGoal = goals.find((g) => g.goal_id === goalId);
    if (!targetGoal) return;

    const submitQsBtn = e.target.querySelector('button[type="submit"]');
    submitQsBtn.disabled = true;

    const savedBefore = Number(targetGoal.nominal_terkumpul || 0);
    const targetNominal = Number(targetGoal.target_nominal || 0);
    const remainingBefore = Math.max(0, targetNominal - savedBefore);
    const excessAmount = amount > remainingBefore ? amount - remainingBefore : 0;

    // Cari target lain yang belum selesai dengan deadline paling cepat
    const otherUnfinished = goals
      .filter((x) => x.goal_id !== targetGoal.goal_id && Number(x.nominal_terkumpul || 0) < Number(x.target_nominal || 0))
      .sort((a, b) => {
        const da = a.target_waktu ? new Date(a.target_waktu).getTime() : Number.MAX_SAFE_INTEGER;
        const db = b.target_waktu ? new Date(b.target_waktu).getTime() : Number.MAX_SAFE_INTEGER;
        return da - db;
      });

    if (excessAmount > 0 && otherUnfinished.length > 0 && typeof window.sgConfirm === 'function') {
      const nextTarget = otherUnfinished[0];
      const nextDeadlineStr = nextTarget.target_waktu
        ? new Date(nextTarget.target_waktu).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'Fleksibel';
      const allocMain = remainingBefore;

      const splitToNext = await window.sgConfirm({
        title: 'Kelebihan Dana Tabungan',
        message: `Target "${targetGoal.nama_tujuan}" hanya butuh ${formatRp(allocMain)} lagi untuk mencapai 100%. Kelebihan ${formatRp(excessAmount)} direkomendasikan masuk ke "${nextTarget.nama_tujuan}" (deadline terdekat: ${nextDeadlineStr}). Alihkan otomatis?`,
        confirmText: 'Ya, Alihkan Sisa',
        cancelText: 'Tetap di Target Ini'
      });

      if (splitToNext) {
        if (allocMain > 0) {
          const mainFinal = savedBefore + allocMain;
          await window.sb
            .from('saving_goals')
            .update({
              nominal_terkumpul: mainFinal,
              status: 'selesai',
              updated_at: new Date().toISOString()
            })
            .eq('goal_id', targetGoal.goal_id);

          targetGoal.nominal_terkumpul = mainFinal;

          const { data: txMain } = await window.sb
            .from('saving_transactions')
            .insert({
              user_id: user.id,
              goal_id: targetGoal.goal_id,
              nominal: allocMain,
              sumber_dana: 'Micro-Budgeting Kilat',
              keterangan: `Pelunasan target ${targetGoal.nama_tujuan}`
            })
            .select('*, saving_goals(nama_tujuan)')
            .single();

          if (txMain) activities.unshift(txMain);
        }

        const nextNewSaved = Number(nextTarget.nominal_terkumpul || 0) + excessAmount;
        await window.sb
          .from('saving_goals')
          .update({
            nominal_terkumpul: nextNewSaved,
            status: nextNewSaved >= Number(nextTarget.target_nominal) ? 'selesai' : 'aktif',
            updated_at: new Date().toISOString()
          })
          .eq('goal_id', nextTarget.goal_id);

        nextTarget.nominal_terkumpul = nextNewSaved;

        const { data: txNext } = await window.sb
          .from('saving_transactions')
          .insert({
            user_id: user.id,
            goal_id: nextTarget.goal_id,
            nominal: excessAmount,
            sumber_dana: 'Pengalihan Kelebihan Setoran',
            keterangan: `Kelebihan setoran dari ${targetGoal.nama_tujuan}`
          })
          .select('*, saving_goals(nama_tujuan)')
          .single();

        if (txNext) activities.unshift(txNext);

        await checkAndGrantStreakReward(targetGoal.goal_id);

        submitQsBtn.disabled = false;
        renderAll();
        showToast(`${formatRp(allocMain)} melunasi "${targetGoal.nama_tujuan}" & sisa ${formatRp(excessAmount)} masuk ke "${nextTarget.nama_tujuan}"!`);
        return;
      }
    }

    const newSavedAmount = savedBefore + amount;
    const isCompleted = newSavedAmount >= targetNominal;

    const { error: updateErr } = await window.sb
      .from('saving_goals')
      .update({
        nominal_terkumpul: newSavedAmount,
        status: isCompleted ? 'selesai' : 'aktif',
        updated_at: new Date().toISOString()
      })
      .eq('goal_id', targetGoal.goal_id);

    if (updateErr) {
      showToast('Gagal menyimpan: ' + updateErr.message);
      submitQsBtn.disabled = false;
      return;
    }

    targetGoal.nominal_terkumpul = newSavedAmount;

    const { data: newTx } = await window.sb
      .from('saving_transactions')
      .insert({
        user_id: user.id,
        goal_id: targetGoal.goal_id,
        nominal: amount,
        sumber_dana: 'Micro-Budgeting Kilat',
        keterangan: 'Setoran Kilat Micro-Budgeting'
      })
      .select('*, saving_goals(nama_tujuan)')
      .single();

    if (newTx) activities.unshift(newTx);

    await checkAndGrantStreakReward(targetGoal.goal_id);

    submitQsBtn.disabled = false;
    renderAll();
    showToast(`Berhasil menyisihkan ${formatRp(amount)} ke ${targetGoal.nama_tujuan}!`);
  });

  // 8. Klik Card Tantangan Pekan Ini
  const challengeWidget = document.querySelector('.challenge-widget');
  if (challengeWidget) {
    challengeWidget.addEventListener('click', async () => {
      if (userChallenge && userChallenge.status === 'selesai') {
        showToast('Tantangan Hemat Boba pekan ini sudah diklaim.');
        return;
      }
      if (goals.length === 0) {
        showToast('Buat minimal 1 target tabungan sebelum mengklaim tantangan.');
        return;
      }

      const bonus = Number(activeChallenge?.target_nominal || 25000);
      const newSaved = Number(goals[0].nominal_terkumpul) + bonus;
      goals[0].nominal_terkumpul = newSaved;

      await window.sb
        .from('saving_goals')
        .update({ nominal_terkumpul: newSaved, updated_at: new Date().toISOString() })
        .eq('goal_id', goals[0].goal_id);

      if (activeChallenge) {
        const { data: savedUc } = await window.sb
          .from('user_challenges')
          .upsert({
            user_id: user.id,
            challenge_id: activeChallenge.challenge_id,
            tanggal_selesai: new Date().toISOString().split('T')[0],
            progres: bonus,
            status: 'selesai'
          })
          .select()
          .single();
        userChallenge = savedUc || { status: 'selesai' };
      } else {
        userChallenge = { status: 'selesai' };
      }

      const { data: newTx } = await window.sb
        .from('saving_transactions')
        .insert({
          user_id: user.id,
          goal_id: goals[0].goal_id,
          nominal: bonus,
          sumber_dana: 'Challenge Mingguan',
          keterangan: 'Tantangan Hemat Boba Pekan Ini'
        })
        .select('*, saving_goals(nama_tujuan)')
        .single();

      if (newTx) activities.unshift(newTx);

      await checkAndGrantStreakReward(goals[0].goal_id);

      renderAll();
      showToast(`Tantangan Hemat Boba diklaim! +${formatRp(bonus)} ditambahkan.`);
    });
  }

  // 9. Fungsi Ikon Lonceng Pengingat Target Terdekat
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
          remaining: Math.max(0, Number(g.target_nominal) - Number(g.nominal_terkumpul))
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

  const btnQuickSave = document.getElementById('btnFocusQuickSave');
  if (btnQuickSave) {
    btnQuickSave.addEventListener('click', () => {
      window.location.href = goals.length > 0 ? `goal-detail.html?id=${goals[0].goal_id}` : 'goal-detail.html';
    });
  }

  const btnAlokasi = document.getElementById('btnAlokasiInfo');
  if (btnAlokasi) {
    btnAlokasi.addEventListener('click', () => {
      window.location.href = 'alokasi.html';
    });
  }

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

  // 10. Logout Supabase Asli
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (confirm('Keluar dan kembali ke halaman Login?')) {
        await window.sb.auth.signOut();
        window.location.href = 'index.html';
      }
    });
  }

  renderAll();
});