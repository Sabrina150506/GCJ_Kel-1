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

  function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // Tanggal Pembaruan Otomatis di dalam Badge Kuning
  const todayLabel = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const updatedEl = document.getElementById('repUpdatedDate');
  if (updatedEl) updatedEl.textContent = `Diperbarui ${todayLabel}`;

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

  const jurusanText = `${profile?.jurusan || user.user_metadata?.jurusan || 'Ilmu Komputer'} UB`;
  const rawSem = user.user_metadata?.semester || profile?.semester || 'Semester Genap 2026';
  const semesterText = rawSem.replace(/^Smtr\s*/i, 'Semester ');

  document.getElementById('sidebarUserName').textContent = displayName;
  const sidebarRoleEl = document.getElementById('sidebarUserRole') || document.querySelector('.profile-meta span');
  if (sidebarRoleEl) sidebarRoleEl.textContent = jurusanText;

  document.getElementById('topUserName').textContent = firstName + '.';

  // Sinkronisasi Foto Profil di Pojok Kanan Atas & Kartu Mindful Thought
  const savedAvatar = user.user_metadata?.avatar_url || localStorage.getItem(`sg_avatar_${user.id}`) || '';
  const isValidAvatar = savedAvatar.startsWith('data:image/') || savedAvatar.startsWith('http');
  const imgTag = `<img src="${savedAvatar}" alt="" onerror="this.parentElement.textContent='${initials}'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" />`;

  const topAvEl = document.getElementById('topAvatarInitials');
  if (topAvEl) {
    if (isValidAvatar) {
      topAvEl.style.overflow = 'hidden';
      topAvEl.innerHTML = imgTag;
    } else {
      topAvEl.textContent = initials;
    }
  }

  const repNameEl = document.getElementById('repProfileName');
  const repAvatarEl = document.getElementById('repProfileAvatar');
  const repMetaEl = document.getElementById('repProfileMeta');
  if (repNameEl) repNameEl.textContent = displayName;
  if (repAvatarEl) {
    if (isValidAvatar) {
      repAvatarEl.style.overflow = 'hidden';
      repAvatarEl.innerHTML = imgTag;
    } else {
      repAvatarEl.textContent = initials;
    }
  }
  if (repMetaEl) repMetaEl.textContent = `${jurusanText} • ${semesterText}`;

  const achSubEl = document.getElementById('achSubtitle');
  if (achSubEl) {
    achSubEl.textContent = `Peta kemajuan finansial per masing-masing pos tabungan aktif ${firstName}.`;
  }

  // 3. Muat Data Target (saving_goals) & Transaksi (saving_transactions) dari Supabase
  const [{ data: goalsData }, { data: txData }] = await Promise.all([
    window.sb
      .from('saving_goals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
    window.sb
      .from('saving_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('tanggal_transaksi', { ascending: true })
  ]);

  const goals = goalsData || [];
  const transactions = txData || [];
  let isAllocExpanded = false;

  // Helper: Hanya hitung yang murni dari Catatan Cepat Micro-Budgeting
  function isMicroHabitTx(tx) {
    const nom = Number(tx.nominal || 0);
    if (nom <= 0) return false;
    const src = (tx.sumber_dana || '').toLowerCase();
    return src === 'micro-budgeting kilat';
  }

  // Update Widget Target Tercapai di Sidebar Kiri
  const completedGoalsCount = goals.filter(
    (g) => Number(g.nominal_terkumpul || 0) >= Number(g.target_nominal || 1)
  ).length;
  const avgGoalPct = goals.length > 0
    ? Math.round(
        goals.reduce(
          (acc, g) =>
            acc + Math.min(100, (Number(g.nominal_terkumpul || 0) / Math.max(1, Number(g.target_nominal || 1))) * 100),
          0
        ) / goals.length
      )
    : 0;

  const sidebarRatioEl = document.getElementById('sidebarTargetRatio');
  const sidebarBarEl = document.getElementById('sidebarTargetBar');
  if (sidebarRatioEl) sidebarRatioEl.textContent = `${completedGoalsCount} / ${goals.length}`;
  if (sidebarBarEl) sidebarBarEl.style.width = `${avgGoalPct}%`;

  // Badge Header Ringkasan Pencapaian
  const achCountBadge = document.getElementById('achCountBadge');
  const achPctBadge = document.getElementById('achPctBadge');
  if (achCountBadge) achCountBadge.textContent = `${goals.length} Pos Terdaftar`;
  if (achPctBadge) achPctBadge.textContent = `${completedGoalsCount} Target Tercapai 100%`;

  // 4. Hitung & Render Grafik Pertumbuhan Sesuai Periode ('3m', '6m', '1y')
  function renderGrowthChart(periodKey) {
    const monthCount = periodKey === '3m' ? 3 : (periodKey === '1y' ? 12 : 6);
    const now = new Date();

    const buckets = [];
    for (let i = monthCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthShort = d.toLocaleDateString('id-ID', { month: 'short' });
      buckets.push({
        key,
        month: monthShort,
        routine: 0,
        habit: 0,
        isCurrent: i === 0
      });
    }

    const startCutoff = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1), 1);

    transactions.forEach((tx) => {
      const txDate = new Date(tx.tanggal_transaksi);
      if (txDate < startCutoff) return;
      const key = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.find((b) => b.key === key);
      if (!bucket) return;

      const nom = Number(tx.nominal || 0);
      if (isMicroHabitTx(tx)) {
        bucket.habit += nom;
      } else {
        bucket.routine += nom;
      }
    });

    const totalGoalSaved = goals.reduce((s, g) => s + Number(g.nominal_terkumpul || 0), 0);
    const totalTxPeriod = buckets.reduce((s, b) => s + b.routine + b.habit, 0);
    const baseOffset = Math.max(0, totalGoalSaved - totalTxPeriod);

    let runningTotal = baseOffset;
    const points = buckets.map((b) => {
      const monthAdd = b.routine + b.habit;
      runningTotal += monthAdd;
      const displayVal = runningTotal;
      const shortLabel = displayVal >= 1000000
        ? `Rp ${(displayVal / 1000000).toFixed(2).replace('.', ',').replace(/,00$/, '')} Jt`
        : `Rp ${Math.round(displayVal / 1000)} Rb`;

      return {
        month: b.month,
        label: shortLabel,
        routine: b.routine > 0 ? b.routine : Math.round(displayVal * 0.7),
        habit: b.habit > 0 ? b.habit : Math.round(displayVal * 0.3),
        total: displayVal,
        active: b.isCurrent
      };
    });

    const displayPoints = periodKey === '1y'
      ? points.filter((_, idx) => idx % 2 === 1)
      : points;

    // Update 4 Kartu Metrik Atas
    const totalTargetAll = goals.reduce((s, g) => s + Number(g.target_nominal || 0), 0);
    const successPct = totalTargetAll > 0
      ? Math.min(100, Math.round((totalGoalSaved / totalTargetAll) * 100))
      : 0;

    const habitTxs = transactions.filter(isMicroHabitTx);
    const habitSum = habitTxs.reduce((s, tx) => s + Number(tx.nominal || 0), 0);

    const weeksCount = Math.max(1, monthCount * 4);
    const weeklyAvg = Math.round((totalTxPeriod || totalGoalSaved) / weeksCount);

    const prevBucket = buckets.length >= 2 ? buckets[buckets.length - 2] : null;
    const currBucket = buckets[buckets.length - 1];
    const prevSum = prevBucket ? prevBucket.routine + prevBucket.habit : 0;
    const currSum = currBucket ? currBucket.routine + currBucket.habit : 0;
    let growthPct = 0;
    if (prevSum > 0) {
      growthPct = Math.round(((currSum - prevSum) / prevSum) * 100);
    } else if (currSum > 0) {
      growthPct = 100;
    }

    document.getElementById('repAccumulation').innerHTML = `<small>Rp</small>${formatDots(totalGoalSaved)}`;
    document.getElementById('repGrowthBadge').textContent = `${growthPct >= 0 ? '+' : ''}${growthPct}%`;

    document.getElementById('repSuccessPct').textContent = `${successPct}%`;
    const successStatusEl = document.getElementById('repSuccessStatus');
    const successBarEl = document.getElementById('repSuccessBar');
    if (successStatusEl) {
      successStatusEl.textContent = goals.length === 0
        ? 'Belum ada target'
        : (successPct >= 100 ? 'Tercapai' : 'On Schedule');
    }
    if (successBarEl) successBarEl.style.width = `${successPct}%`;

    document.getElementById('repHabitSaved').innerHTML = `<small>Rp</small>${formatDots(habitSum)}`;
    const habitCountEl = document.getElementById('repHabitCount');
    if (habitCountEl) habitCountEl.textContent = `${habitTxs.length} Setoran Mikro`;

    document.getElementById('repWeeklyAvg').innerHTML = `<small>Rp</small>${formatDots(weeklyAvg)}`;
    const weeklySubEl = document.getElementById('repWeeklySub');
    if (weeklySubEl) weeklySubEl.textContent = `Rata-rata per pekan (${weeksCount} pekan)`;

    const chartSubEl = document.getElementById('chartRangeSubtitle');
    if (chartSubEl && buckets.length > 0) {
      chartSubEl.textContent = `Visualisasi akumulatif: Tabungan Pokok & Penghematan Mikro (${buckets[0].month} – ${currBucket.month})`;
    }

    const cbTitle = document.getElementById('cbTitle');
    const cbDesc = document.getElementById('cbDesc');
    const cbBadge = document.getElementById('cbBadge');
    if (transactions.length === 0) {
      if (cbTitle) cbTitle.textContent = 'Mulai Catat Setoran Pertamamu';
      if (cbDesc) cbDesc.textContent = 'Grafik perkembangan dan konsistensi menabungmu akan terhitung otomatis dari setiap transaksi masuk.';
      if (cbBadge) cbBadge.textContent = '0% Efisiensi';
    } else if (growthPct >= 0) {
      if (cbTitle) cbTitle.textContent = 'Tren Menabung Terjaga Positif';
      if (cbDesc) cbDesc.textContent = `Total setoran bulan ${currBucket.month} tercatat sebesar ${formatRp(currSum)} dari ${transactions.length} transaksi.`;
      if (cbBadge) cbBadge.textContent = `+${growthPct}% Bulan Ini`;
    } else {
      if (cbTitle) cbTitle.textContent = 'Evaluasi Ritme Tabungan Bulan Ini';
      if (cbDesc) cbDesc.textContent = `Setoran bulan ${currBucket.month} (${formatRp(currSum)}) lebih rendah dari bulan sebelumnya. Yuk sisihkan sedikit lagi!`;
      if (cbBadge) cbBadge.textContent = `${growthPct}% Bulan Ini`;
    }

    // Render SVG Chart
    const rawMax = Math.max(...displayPoints.map((p) => p.total), 1000000);
    const maxVal = Math.ceil(rawMax / 1000000) * 1000000;

    const width = 560;
    const height = 215;
    const padLeft = 52;
    const padRight = 24;
    const padTop = 18;
    const padBottom = 48;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    let gridSvg = '';
    for (let step = 4; step >= 0; step--) {
      const tickVal = (maxVal / 4) * step;
      const y = padTop + plotH - (tickVal / maxVal) * plotH;
      const tickLabel = tickVal >= 1000000
        ? `Rp ${(tickVal / 1000000).toFixed(1).replace('.', ',').replace(/,0$/, '')} Jt`
        : `Rp ${Math.round(tickVal / 1000)} Rb`;

      gridSvg += `
        <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="#e7efe1" stroke-width="1" />
        <text x="4" y="${y + 4}" fill="#4b6b32" font-size="10" font-weight="600">${tickLabel}</text>
      `;
    }

    const stepX = plotW / Math.max(1, displayPoints.length);
    let barsSvg = '';
    let lineCoords = [];
    let labelsSvg = '';

    displayPoints.forEach((p, idx) => {
      const centerX = padLeft + stepX * idx + stepX / 2;
      const barW = 14;
      const totalH = p.total > 0 ? Math.max(6, (p.total / maxVal) * plotH) : 2;
      const habitRatio = p.total > 0 ? Math.min(1, p.habit / (p.routine + p.habit || 1)) : 0;
      const habitH = totalH * habitRatio;
      const routineH = totalH - habitH;

      const yTop = padTop + plotH - totalH;
      const ySplit = yTop + habitH;

      lineCoords.push(`${centerX},${yTop}`);

      if (p.total > 0) {
        barsSvg += `
          <rect x="${centerX - barW / 2}" y="${yTop}" width="${barW}" height="${habitH}" rx="4" fill="#9bc524" />
          <rect x="${centerX - barW / 2}" y="${ySplit}" width="${barW}" height="${routineH}" rx="3" fill="#4f6b18" />
        `;
      }
      barsSvg += `
        <circle cx="${centerX}" cy="${yTop}" r="4.5" fill="#ffffff" stroke="#4f6b18" stroke-width="2.5" />
      `;

      if (p.active) {
        labelsSvg += `
          <rect x="${centerX - 32}" y="${padTop + plotH + 8}" width="64" height="34" rx="8" fill="#eaf4e2" stroke="#b9d99e" />
          <text x="${centerX}" y="${padTop + plotH + 22}" text-anchor="middle" fill="#26430d" font-size="10.5" font-weight="800">${p.month}</text>
          <text x="${centerX}" y="${padTop + plotH + 35}" text-anchor="middle" fill="#3f6e11" font-size="9.5" font-weight="800">${p.label}</text>
        `;
      } else {
        labelsSvg += `
          <text x="${centerX}" y="${padTop + plotH + 22}" text-anchor="middle" fill="#26430d" font-size="10.5" font-weight="700">${p.month}</text>
          <text x="${centerX}" y="${padTop + plotH + 35}" text-anchor="middle" fill="#4b6b32" font-size="9.5" font-weight="600">${p.label}</text>
        `;
      }
    });

    const polylineSvg = `
      <polyline fill="none" stroke="#4f6b18" stroke-width="2.5" points="${lineCoords.join(' ')}" />
    `;

    document.getElementById('growthChartContainer').innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" width="100%" style="min-width:440px; display:block;">
        ${gridSvg}
        ${polylineSvg}
        ${barsSvg}
        ${labelsSvg}
      </svg>
    `;
  }

  // 4B. Render Komposisi Alokasi Simpanan
  function renderDonutComposition() {
    const donutEl = document.getElementById('repMiniDonut');
    const holeEl = document.getElementById('repDonutHole');
    const legendsEl = document.getElementById('repDonutLegends');
    if (!donutEl || !holeEl || !legendsEl) return;

    const totalSaved = goals.reduce((s, g) => s + Number(g.nominal_terkumpul || 0), 0);
    if (goals.length === 0 || totalSaved === 0) {
      donutEl.style.background = '#e2e8f0';
      holeEl.textContent = '0%';
      legendsEl.innerHTML = goals.length === 0
        ? '<span style="font-size:12px;">Belum ada pos tabungan</span>'
        : goals.map((g, i) => `<span><i class="lg-dot c${(i % 4) + 1}"></i> ${g.nama_tujuan} (0%)</span>`).join('');
      return;
    }

    const palette = ['#4f6b18', '#9bc524', '#cbe58e', '#6fb088', '#8bb8d0', '#e8dc88'];
    const sortedGoals = [...goals]
      .sort((a, b) => Number(b.nominal_terkumpul || 0) - Number(a.nominal_terkumpul || 0));

    let accPct = 0;
    const stops = [];
    legendsEl.innerHTML = '';

    sortedGoals.forEach((g, idx) => {
      const exactShare = (Number(g.nominal_terkumpul || 0) / totalSaved) * 100;
      const pct = Math.round(exactShare);
      const start = accPct;
      accPct = idx === sortedGoals.length - 1 ? 100 : Math.min(100, accPct + exactShare);
      const color = palette[idx % palette.length];
      stops.push(`${color} ${start.toFixed(1)}% ${accPct.toFixed(1)}%`);
      legendsEl.innerHTML += `<span><i class="lg-dot" style="background:${color}"></i> ${g.nama_tujuan} (${pct}%)</span>`;
    });

    donutEl.style.background = `conic-gradient(${stops.join(', ')})`;
    holeEl.textContent = '100%';
  }

  // 5. Render Kartu Pencapaian Tabungan & Status Target dari saving_goals
  function renderAchievements() {
    const grid = document.getElementById('achievementCardsGrid');
    if (goals.length === 0) {
      grid.innerHTML = '<p style="font-size:13px;">Belum ada target tabungan yang tercatat.</p>';
      return;
    }

    grid.innerHTML = goals.map((g) => {
      const saved = Number(g.nominal_terkumpul || 0);
      const target = Number(g.target_nominal || 1);
      const pct = Math.min(100, Math.round((saved / target) * 100));
      const rem = Math.max(0, target - saved);
      const completed = saved >= target;

      let deadlineText = 'Target Fleksibel';
      let rightFoot = 'Berjalan';
      if (g.target_waktu) {
        const tDate = new Date(g.target_waktu);
        deadlineText = `Tenggat: ${tDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`;
        const diffMonths = Math.max(1, Math.round((tDate - new Date()) / (1000 * 60 * 60 * 24 * 30)));
        rightFoot = completed ? '✓' : `~${diffMonths} bln lagi`;
      }

      const titleLower = (g.nama_tujuan || '').toLowerCase();
      let icon = 'target';
      if (completed) icon = 'check-circle-2';
      else if (titleLower.includes('laptop')) icon = 'laptop';
      else if (titleLower.includes('kos') || titleLower.includes('darurat')) icon = 'home';
      else if (titleLower.includes('sertifikasi')) icon = 'badge-check';

      const badge = completed
        ? 'SELESAI ✓'
        : (pct >= 70 ? 'Mendekati Selesai' : 'Sesuai Jadwal');
      const badgeClass = !completed && pct >= 70 ? 'warm' : '';

      return `
        <div class="ach-card ${completed ? 'completed-highlight' : ''}">
          <div class="ach-top">
            <div class="ach-icon"><i data-lucide="${icon}" width="17" height="17"></i></div>
            <span class="ach-status-pill ${badgeClass}">${badge}</span>
          </div>

          <div class="ach-title">
            <strong>${g.nama_tujuan}</strong>
            <span>${deadlineText}</span>
          </div>

          <div class="ach-amounts">
            <strong><small>Rp</small>${formatDots(saved)}</strong>
            <span>Target:<br>${formatRp(target)}</span>
          </div>

          <div>
            <div class="ach-prog-labels">
              <span>${completed ? 'Kemajuan Sempurna' : 'Kemajuan'}</span>
              <span>${pct}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width:${pct}%"></div>
            </div>
          </div>

          <div class="ach-footer">
            <span>${completed ? 'Dana Siap Digunakan' : `Sisa: ${formatRp(rem)}`}</span>
            <strong>${rightFoot}</strong>
          </div>
        </div>
      `;
    }).join('');
  }

  // 6. Render Distribusi Alokasi (Maks 3 + Tombol Panah Ekspansi) & Ringkasan Statistik Tabungan
  function renderAllocationsAndStats() {
    const listEl = document.getElementById('allocationList');
    const totalAllSaved = goals.reduce((s, g) => s + Number(g.nominal_terkumpul || 0), 0);

    const allocTotalEl = document.getElementById('allocTotalPill');
    if (allocTotalEl) allocTotalEl.textContent = `Total Setoran: ${formatRp(totalAllSaved)}`;

    const avgDeposit = transactions.length > 0
      ? Math.round(transactions.reduce((s, t) => s + Number(t.nominal || 0), 0) / transactions.length)
      : 0;

    let topGoalName = '-';
    let topGoalAmount = 0;
    if (goals.length > 0) {
      const sortedGoals = [...goals].sort(
        (a, b) => Number(b.nominal_terkumpul || 0) - Number(a.nominal_terkumpul || 0)
      );
      if (Number(sortedGoals[0].nominal_terkumpul || 0) > 0) {
        topGoalName = sortedGoals[0].nama_tujuan;
        topGoalAmount = Number(sortedGoals[0].nominal_terkumpul || 0);
      }
    }

    const onTimeGoals = goals.filter((g) => {
      if (!g.target_waktu) return true;
      return new Date(g.target_waktu) >= new Date() || Number(g.nominal_terkumpul || 0) >= Number(g.target_nominal || 1);
    }).length;
    const onTimePct = goals.length > 0 ? Math.round((onTimeGoals / goals.length) * 100) : 0;

    const avgEl = document.getElementById('statAvgDeposit');
    const topNameEl = document.getElementById('statTopGoalName');
    const topAmtEl = document.getElementById('statTopGoalAmount');
    const onTimeEl = document.getElementById('statOnTimePct');

    if (avgEl) avgEl.textContent = formatRp(avgDeposit);
    if (topNameEl) topNameEl.textContent = topGoalName;
    if (topAmtEl) topAmtEl.textContent = formatRp(topGoalAmount);
    if (onTimeEl) onTimeEl.textContent = `${onTimePct}% Tepat Waktu`;

    if (goals.length === 0) {
      listEl.innerHTML = '<p style="font-size:13px;">Belum ada distribusi alokasi.</p>';
      return;
    }

    // Batasi maksimal 3 pos secara default agar tingginya seimbang dengan Ringkasan Statistik
    const MAX_VISIBLE_ALLOC = 3;
    const visibleGoals = isAllocExpanded ? goals : goals.slice(0, MAX_VISIBLE_ALLOC);
    const hiddenCount = goals.length - MAX_VISIBLE_ALLOC;

    let html = visibleGoals.map((g) => {
      const saved = Number(g.nominal_terkumpul || 0);
      const target = Number(g.target_nominal || 1);
      const sharePct = totalAllSaved > 0 ? ((saved / totalAllSaved) * 100).toFixed(1) : '0.0';
      const txCount = transactions.filter((t) => t.goal_id === g.goal_id).length;

      const titleLower = (g.nama_tujuan || '').toLowerCase();
      let icon = 'wallet';
      if (saved >= target) icon = 'check-circle';
      else if (titleLower.includes('laptop')) icon = 'laptop';
      else if (titleLower.includes('kos') || titleLower.includes('darurat')) icon = 'shield';
      else if (titleLower.includes('trip') || titleLower.includes('liburan')) icon = 'plane';

      return `
        <div class="alloc-item">
          <div class="ai-left">
            <div class="ai-icon"><i data-lucide="${icon}" width="16" height="16"></i></div>
            <div>
              <strong>${g.nama_tujuan}</strong>
              <span>${txCount} transaksi setoran terdata</span>
            </div>
          </div>
          <div class="ai-right">
            <strong>${formatRp(saved)}</strong>
            <span>${sharePct}% dari total simpanan</span>
          </div>
        </div>
      `;
    }).join('');

    if (hiddenCount > 0) {
      html += `
        <button type="button" class="btn-expand-alloc" id="btnToggleAllocExpand">
          ${isAllocExpanded
            ? 'Sembunyikan sebagian pos <i data-lucide="chevron-up" width="15" height="15"></i>'
            : `Tampilkan ${hiddenCount} pos lainnya <i data-lucide="chevron-down" width="15" height="15"></i>`}
        </button>
      `;
    }

    listEl.innerHTML = html;

    const toggleBtn = document.getElementById('btnToggleAllocExpand');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        isAllocExpanded = !isAllocExpanded;
        renderAllocationsAndStats();
        if (window.lucide) lucide.createIcons();
      });
    }
  }

  // Event Filter Periode & Tombol Unduh PDF
  document.getElementById('periodFilterSelect').addEventListener('change', (e) => {
    renderGrowthChart(e.target.value);
    if (window.lucide) lucide.createIcons();
    showToast('Grafik laporan diperbarui sesuai periode.');
  });

  document.getElementById('btnDownloadPdf').addEventListener('click', () => {
    showToast('Menyiapkan dokumen PDF laporan tabungan...');
    setTimeout(() => window.print(), 450);
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

  renderGrowthChart('6m');
  renderDonutComposition();
  renderAchievements();
  renderAllocationsAndStats();
  if (window.lucide) lucide.createIcons();
});