document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) lucide.createIcons();

  // 1. Cek Sesi Login Supabase (Auth Guard)
  const { data: { session }, error: sessionError } = await window.sb.auth.getSession();
  if (sessionError || !session) {
    window.location.href = 'index.html';
    return;
  }

  const user = session.user;
  const urlParams = new URLSearchParams(window.location.search);
  let queryId = urlParams.get('id');

  let goalsList = [];
  let activeGoal = null;
  let transactions = [];
  let selectedMethod = 'Transfer Bank';
  let txRange = 'all';
  let showAllTx = false;

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

  // Helper format estimasi waktu
  function getDeadlineInfo(targetWaktu) {
    if (!targetWaktu) {
      return { daysLeft: 'Fleksibel', deadlineFormatted: 'Tanpa Tenggat', deadlineTimestamp: Number.MAX_SAFE_INTEGER };
    }
    const targetDate = new Date(targetWaktu);
    const diffDays = Math.ceil((targetDate - new Date()) / (1000 * 60 * 60 * 24));
    const daysLeft = diffDays <= 0 ? 'Jatuh Tempo' : `${diffDays} Hari Tersisa`;
    const deadlineFormatted = targetDate.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    return { daysLeft, deadlineFormatted, deadlineTimestamp: targetDate.getTime() };
  }

  function updateSidebarWidget() {
    const completedCount = goalsList.filter((g) => g.saved >= g.target).length;
    const avgPct = goalsList.length > 0
      ? Math.round(
          goalsList.reduce((acc, g) => acc + Math.min(100, (g.saved / Math.max(1, g.target)) * 100), 0) /
            goalsList.length
        )
      : 0;
    const ratioEl = document.getElementById('sidebarTargetRatio');
    const barEl = document.getElementById('sidebarTargetBar');
    if (ratioEl) ratioEl.textContent = `${completedCount} / ${goalsList.length}`;
    if (barEl) barEl.style.width = `${avgPct}%`;
  }

  // 3. Muat Daftar Target dari public.saving_goals
  async function loadGoalsAndDetail() {
    const { data, error } = await window.sb
      .from('saving_goals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      showToast('Gagal memuat data target: ' + error.message);
      return;
    }

    goalsList = (data || []).map((row) => {
      const { daysLeft, deadlineFormatted, deadlineTimestamp } = getDeadlineInfo(row.target_waktu);
      return {
        id: row.goal_id,
        title: row.nama_tujuan,
        categoryLabel: row.deskripsi || 'Target Tabungan Mahasiswa',
        saved: Number(row.nominal_terkumpul || 0),
        target: Number(row.target_nominal || 1),
        rawDate: row.target_waktu ? String(row.target_waktu).slice(0, 10) : '',
        statusRight: daysLeft,
        deadline: deadlineFormatted,
        deadlineTimestamp
      };
    });

    updateSidebarWidget();

    const emptyStateEl = document.getElementById('emptyDetailState');
    const activeWrapEl = document.getElementById('detailActiveWrapper');

    if (goalsList.length === 0) {
      if (emptyStateEl) emptyStateEl.style.display = 'block';
      if (activeWrapEl) activeWrapEl.style.display = 'none';
      if (window.lucide) lucide.createIcons();
      return;
    }

    if (emptyStateEl) emptyStateEl.style.display = 'none';
    if (activeWrapEl) activeWrapEl.style.display = 'flex';

    activeGoal = goalsList.find((g) => g.id === queryId) || goalsList[0];
    queryId = activeGoal.id;

    await loadTransactionsForGoal(activeGoal.id);
    renderDetailPage();
  }

  // 4. Muat Riwayat Transaksi Khusus Target Aktif dari public.saving_transactions
  async function loadTransactionsForGoal(goalId) {
    const { data, error } = await window.sb
      .from('saving_transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('goal_id', goalId)
      .order('tanggal_transaksi', { ascending: false });

    if (error) {
      transactions = [];
      return;
    }

    const now = new Date();
    transactions = (data || []).map((tx) => {
      const txDate = new Date(tx.tanggal_transaksi);
      const isThisMonth = txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
      const dateLabel = txDate.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
      const method = tx.sumber_dana || 'Transfer Bank';
      const iconName = method.toLowerCase().includes('wallet')
        ? 'smartphone'
        : (method.toLowerCase().includes('tunai') ? 'banknote' : 'landmark');

      const shortId = String(tx.transaction_id).slice(0, 4).toUpperCase();

      return {
        title: tx.keterangan ? tx.keterangan.slice(0, 38) : `Setoran via ${method}`,
        meta: `${dateLabel} • ${method}`,
        note: tx.keterangan ? `"${tx.keterangan}"` : '"Konsisten menyisihkan dari uang saku."',
        amount: Number(tx.nominal || 0),
        ref: `Ref: #TRX-${shortId}`,
        iconName,
        isThisMonth
      };
    });
  }

  // 5. Render Seluruh Komponen Halaman Detail
  function renderDetailPage() {
    if (!activeGoal) return;

    updateSidebarWidget();

    const pctRaw = (activeGoal.saved / activeGoal.target) * 100;
    const pctClamped = Math.min(100, pctRaw);
    const remaining = Math.max(0, activeGoal.target - activeGoal.saved);

    document.getElementById('bcGoalTitle').textContent = activeGoal.title;
    document.getElementById('detailGoalTitle').textContent = activeGoal.title;
    document.getElementById('detailCatBadge').textContent =
      (activeGoal.categoryLabel || 'Target Tabungan').replace(/^•\s*/, '');

    document.getElementById('detailDaysLeft').textContent = activeGoal.statusRight;
    document.getElementById('detailDeadline').textContent = activeGoal.deadline;

    document.getElementById('detailSavedAmount').textContent = formatRp(activeGoal.saved);
    document.getElementById('detailPctSub').textContent = `${Math.round(pctClamped)}% dari sasaran`;
    document.getElementById('detailRemainingAmount').textContent = formatRp(remaining);
    document.getElementById('detailTargetAmount').textContent = formatRp(activeGoal.target);

    document.getElementById('detailProgressPct').textContent = `${pctClamped.toFixed(1)}% Selesai`;
    document.getElementById('detailProgressBar').style.width = `${pctClamped}%`;

    // Render 4 Milestones
    const milestonesData = [
      {
        label: 'Milestone 25%',
        amount: Math.round(activeGoal.target * 0.25),
        desc: 'Langkah awal pondasi dana terkumpul.',
        doneText: 'Tercapai ✓'
      },
      {
        label: 'Milestone 50%',
        amount: Math.round(activeGoal.target * 0.50),
        desc: 'Setengah jalan menuju target utama.',
        doneText: 'Tercapai ✓'
      },
      {
        label: 'Milestone 75%',
        amount: Math.round(activeGoal.target * 0.75),
        desc: 'Tinggal seperempat langkah terakhir.',
        doneText: 'Tercapai ✓'
      },
      {
        label: 'Target 100%',
        amount: activeGoal.target,
        desc: 'Target penuh tercapai sesuai rencana!',
        doneText: 'Target Selesai ✓'
      }
    ];

    let completedStages = 0;
    let foundNext = false;
    const msGrid = document.getElementById('milestonesGrid');
    msGrid.innerHTML = '';

    milestonesData.forEach((m, idx) => {
      const isDone = activeGoal.saved >= m.amount;
      let stateClass = '';
      let statusLine = '';
      let iconName = 'circle';

      if (isDone) {
        completedStages += 1;
        stateClass = 'done';
        statusLine = m.doneText;
        iconName = 'check-circle-2';
      } else if (!foundNext) {
        foundNext = true;
        stateClass = 'active';
        const shortBy = m.amount - activeGoal.saved;
        statusLine = `Sedang Dikejar (Kurang ${formatRp(shortBy)})`;
        iconName = 'hourglass';
      } else {
        statusLine = idx === 3 ? 'Siap Dicapai!' : 'Tahap Berikutnya';
        iconName = idx === 3 ? 'trophy' : 'circle';
      }

      msGrid.innerHTML += `
        <div class="ms-card ${stateClass}">
          <div class="ms-card-top">
            <span class="ms-pill">${m.label}</span>
            <i data-lucide="${iconName}" width="15" height="15"></i>
          </div>
          <strong>${formatRp(m.amount)}</strong>
          <span class="ms-status">${statusLine}</span>
          <p>${m.desc}</p>
        </div>
      `;
    });

    document.getElementById('milestoneCountPill').textContent =
      `Tahap ${completedStages} dari 4 Selesai`;

    // Dropdown Pilih Target
    const goalSelect = document.getElementById('detailGoalSelect');
    goalSelect.innerHTML = '';
    goalsList.forEach((g) => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = `${g.title} ${g.id === activeGoal.id ? '(Aktif)' : ''}`;
      if (g.id === activeGoal.id) opt.selected = true;
      goalSelect.appendChild(opt);
    });

    // Mini Stats Frekuensi & Rata-rata
    const totalFreq = transactions.length;
    const avgVal = totalFreq > 0
      ? Math.round(transactions.reduce((s, t) => s + t.amount, 0) / totalFreq)
      : 0;
    document.getElementById('freqCountText').textContent = `${totalFreq} Kali Setoran`;
    document.getElementById('avgDepositText').textContent = formatRp(avgVal);

    // Render Riwayat Tabungan
    const filteredTx = txRange === 'month'
      ? transactions.filter((t) => t.isThisMonth)
      : transactions;

    const visibleTx = showAllTx ? filteredTx : filteredTx.slice(0, 4);
    const txListEl = document.getElementById('txHistoryList');

    if (visibleTx.length === 0) {
      txListEl.innerHTML = `
        <p style="color:#4b6b32; font-size:14px; padding:12px 0;">
          Belum ada catatan setoran untuk target ini. Yuk catat setoran pertamamu di samping!
        </p>
      `;
    } else {
      txListEl.innerHTML = visibleTx.map((tx) => `
        <div class="tx-item">
          <div class="tx-left">
            <div class="tx-icon"><i data-lucide="${tx.iconName || 'wallet'}" width="16" height="16"></i></div>
            <div>
              <strong>${tx.title}</strong>
              <span class="tx-meta">${tx.meta}</span>
              ${tx.note ? `<span class="tx-note">${tx.note}</span>` : ''}
            </div>
          </div>
          <div class="tx-right">
            <span class="tx-badge">Berhasil</span>
            <span class="tx-amount">+${formatRp(tx.amount)}</span>
            <span class="tx-ref">${tx.ref}</span>
          </div>
        </div>
      `).join('');
    }

    const toggleBtn = document.getElementById('btnToggleMoreTx');
    if (filteredTx.length <= 4) {
      toggleBtn.style.display = 'none';
    } else {
      toggleBtn.style.display = 'block';
      toggleBtn.textContent = showAllTx
        ? 'Sembunyikan riwayat tambahan ⌃'
        : `Tampilkan ${filteredTx.length - 4} riwayat transaksi lainnya ⌄`;
    }

    if (window.lucide) lucide.createIcons();
  }

  // Format input nominal dengan titik (50.000)
  const amountInput = document.getElementById('detailAmountInput');
  amountInput.addEventListener('input', () => {
    const val = parseDigits(amountInput.value);
    amountInput.value = val ? formatDots(val) : '';
  });

  document.querySelectorAll('.p-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.p-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      amountInput.value = formatDots(Number(chip.dataset.val));
    });
  });

  // Ganti target aktif dari dropdown -> muat transaksi target yang dipilih
  document.getElementById('detailGoalSelect').addEventListener('change', async (e) => {
    const chosen = goalsList.find((g) => g.id === e.target.value);
    if (chosen) {
      activeGoal = chosen;
      queryId = chosen.id;
      const newUrl = new URL(window.location);
      newUrl.searchParams.set('id', chosen.id);
      window.history.replaceState({}, '', newUrl);
      await loadTransactionsForGoal(chosen.id);
      renderDetailPage();
    }
  });

  // Pilih metode sumber dana
  document.querySelectorAll('.method-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.method-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMethod = btn.dataset.method;
    });
  });

  // 6. Submit Setoran Baru -> Update public.saving_goals & Insert public.saving_transactions + Auto-Overflow Deadline Terdekat
  document.getElementById('detailSaveForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseDigits(amountInput.value);
    if (!amount || amount <= 0 || !activeGoal) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const noteVal = document.getElementById('detailNoteInput').value.trim();
    const remainingBefore = Math.max(0, activeGoal.target - activeGoal.saved);
    const excessAmount = amount > remainingBefore ? amount - remainingBefore : 0;

    // Cari target lain yang belum selesai dengan deadline paling cepat
    const otherUnfinished = goalsList
      .filter((x) => x.id !== activeGoal.id && x.saved < x.target)
      .sort((a, b) => a.deadlineTimestamp - b.deadlineTimestamp);

    if (excessAmount > 0 && otherUnfinished.length > 0 && typeof window.sgConfirm === 'function') {
      const nextTarget = otherUnfinished[0];
      const allocMain = remainingBefore;

      const splitToNext = await window.sgConfirm({
        title: 'Kelebihan Dana Tabungan',
        message: `Target "${activeGoal.title}" hanya butuh ${formatRp(allocMain)} lagi untuk mencapai 100%. Kelebihan ${formatRp(excessAmount)} direkomendasikan masuk ke "${nextTarget.title}" (deadline terdekat: ${nextTarget.deadline}). Alihkan otomatis?`,
        confirmText: 'Ya, Alihkan Sisa',
        cancelText: 'Tetap di Target Ini'
      });

      if (splitToNext) {
        if (allocMain > 0) {
          const mainFinal = activeGoal.saved + allocMain;
          await window.sb
            .from('saving_goals')
            .update({
              nominal_terkumpul: mainFinal,
              status: 'selesai',
              updated_at: new Date().toISOString()
            })
            .eq('goal_id', activeGoal.id);

          await window.sb.from('saving_transactions').insert({
            user_id: user.id,
            goal_id: activeGoal.id,
            nominal: allocMain,
            sumber_dana: selectedMethod,
            keterangan: noteVal || `Pelunasan target ${activeGoal.title}`
          });

          activeGoal.saved = mainFinal;
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
          sumber_dana: selectedMethod,
          keterangan: `Kelebihan setoran dari ${activeGoal.title}`
        });

        nextTarget.saved = nextNewSaved;
        document.getElementById('detailNoteInput').value = '';
        submitBtn.disabled = false;

        await loadTransactionsForGoal(activeGoal.id);
        renderDetailPage();
        showToast(`${formatRp(allocMain)} melunasi "${activeGoal.title}" & sisa ${formatRp(excessAmount)} masuk ke "${nextTarget.title}"!`);
        return;
      }
    }

    const newSaved = activeGoal.saved + amount;
    const isDone = newSaved >= activeGoal.target;

    const { error: upErr } = await window.sb
      .from('saving_goals')
      .update({
        nominal_terkumpul: newSaved,
        status: isDone ? 'selesai' : 'aktif',
        updated_at: new Date().toISOString()
      })
      .eq('goal_id', activeGoal.id);

    if (upErr) {
      showToast('Gagal menyimpan setoran: ' + upErr.message);
      submitBtn.disabled = false;
      return;
    }

    const { error: txErr } = await window.sb
      .from('saving_transactions')
      .insert({
        user_id: user.id,
        goal_id: activeGoal.id,
        nominal: amount,
        sumber_dana: selectedMethod,
        keterangan: noteVal || 'Setoran Tabungan Mikro'
      });

    if (txErr) {
      showToast('Setoran tersimpan, gagal mencatat riwayat: ' + txErr.message);
    }

    activeGoal.saved = newSaved;
    document.getElementById('detailNoteInput').value = '';
    submitBtn.disabled = false;

    await loadTransactionsForGoal(activeGoal.id);
    renderDetailPage();
    showToast(`Berhasil menambah ${formatRp(amount)} ke ${activeGoal.title}!`);
  });

  // Filter Riwayat (Semua / Bulan Ini)
  document.querySelectorAll('.hp-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.hp-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      txRange = tab.dataset.range;
      renderDetailPage();
    });
  });

  document.getElementById('btnToggleMoreTx').addEventListener('click', () => {
    showAllTx = !showAllTx;
    renderDetailPage();
  });

  // 7. Edit Target (Nama, Nominal Target, & Tanggal Selesai) di Supabase
  function openEditTargetModal(goal) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(20,32,12,0.42);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;';

      const safeTitle = String(goal.title || '').replace(/"/g, '&quot;');
      backdrop.innerHTML = `
        <div style="background:#ffffff;border-radius:20px;width:100%;max-width:440px;padding:22px 24px;color:#26430d;box-shadow:0 24px 60px rgba(0,0,0,0.18);font-family:'Plus Jakarta Sans',sans-serif;">
          <h3 style="font-size:18px;font-weight:800;color:#26430d;margin-bottom:4px;">Edit Target Tabungan</h3>
          <p style="font-size:12px;color:#4b6b32;margin-bottom:16px;">Perbarui nama, nominal sasaran, atau tenggat waktu targetmu:</p>
          <form id="sgEditTargetForm" style="display:flex;flex-direction:column;gap:12px;">
            <div>
              <label style="display:block;font-size:12px;font-weight:700;color:#26430d;margin-bottom:5px;">Nama Target</label>
              <input type="text" id="sgEditTitleInput" value="${safeTitle}" required style="width:100%;height:42px;border-radius:11px;border:1.5px solid #cde0be;background:#f8fbf6;padding:0 12px;font-family:inherit;font-size:13.5px;font-weight:700;color:#26430d;outline:none;" />
            </div>
            <div>
              <label style="display:block;font-size:12px;font-weight:700;color:#26430d;margin-bottom:5px;">Total Nominal Target (Rp)</label>
              <div style="display:flex;align-items:center;gap:8px;height:42px;border-radius:11px;border:1.5px solid #cde0be;background:#f8fbf6;padding:0 12px;">
                <span style="font-size:13px;font-weight:800;color:#2f5b12;">Rp</span>
                <input type="text" id="sgEditTargetInput" value="${formatDots(goal.target)}" required style="border:none;background:transparent;width:100%;font-family:inherit;font-size:14px;font-weight:800;color:#26430d;outline:none;" />
              </div>
            </div>
            <div>
              <label style="display:block;font-size:12px;font-weight:700;color:#26430d;margin-bottom:5px;">Target Tanggal Selesai</label>
              <input type="date" id="sgEditDateInput" value="${goal.rawDate || ''}" style="width:100%;height:42px;border-radius:11px;border:1.5px solid #cde0be;background:#f8fbf6;padding:0 12px;font-family:inherit;font-size:13px;font-weight:700;color:#26430d;outline:none;" />
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px;">
              <button type="button" id="sgEditCancelBtn" style="height:40px;padding:0 16px;border-radius:11px;border:1px solid #d4e3c8;background:#f5f9f2;font-family:inherit;font-size:12.5px;font-weight:700;color:#4b6b32;cursor:pointer;">Batal</button>
              <button type="submit" style="height:40px;padding:0 18px;border-radius:11px;border:none;background:#8ec31e;font-family:inherit;font-size:12.5px;font-weight:800;color:#ffffff;cursor:pointer;">Simpan Perubahan</button>
            </div>
          </form>
        </div>
      `;

      document.body.appendChild(backdrop);

      const titleInput = backdrop.querySelector('#sgEditTitleInput');
      const targetInput = backdrop.querySelector('#sgEditTargetInput');
      const dateInput = backdrop.querySelector('#sgEditDateInput');

      targetInput.addEventListener('input', () => {
        const val = parseDigits(targetInput.value);
        targetInput.value = val ? formatDots(val) : '';
      });

      const close = (result) => {
        backdrop.remove();
        resolve(result);
      };

      backdrop.querySelector('#sgEditCancelBtn').addEventListener('click', () => close(null));
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) close(null);
      });

      backdrop.querySelector('#sgEditTargetForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const newTitle = titleInput.value.trim();
        const newTarget = parseDigits(targetInput.value);
        const newDate = dateInput.value || null;
        if (!newTitle || newTarget <= 0) return;
        close({ title: newTitle, target: newTarget, targetWaktu: newDate });
      });

      titleInput.focus();
      titleInput.select();
    });
  }

  document.getElementById('btnEditTarget').addEventListener('click', async () => {
    if (!activeGoal) return;
    const edited = await openEditTargetModal(activeGoal);
    if (!edited) return;

    const isDone = activeGoal.saved >= edited.target;
    const { error } = await window.sb
      .from('saving_goals')
      .update({
        nama_tujuan: edited.title,
        target_nominal: edited.target,
        target_waktu: edited.targetWaktu,
        status: isDone ? 'selesai' : 'aktif',
        updated_at: new Date().toISOString()
      })
      .eq('goal_id', activeGoal.id);

    if (error) {
      showToast('Gagal memperbarui target: ' + error.message);
      return;
    }

    const { daysLeft, deadlineFormatted, deadlineTimestamp } = getDeadlineInfo(edited.targetWaktu);
    activeGoal.title = edited.title;
    activeGoal.target = edited.target;
    activeGoal.rawDate = edited.targetWaktu || '';
    activeGoal.statusRight = daysLeft;
    activeGoal.deadline = deadlineFormatted;
    activeGoal.deadlineTimestamp = deadlineTimestamp;

    renderDetailPage();
    showToast('Detail target berhasil diperbarui di database.');
  });

  document.getElementById('btnDeleteTarget').addEventListener('click', async () => {
    if (!activeGoal) return;
    const yakin = await window.sgConfirm({
      title: 'Hapus Target Tabungan?',
      message: `Yakin ingin menghapus target "${activeGoal.title}" beserta seluruh riwayat transaksinya?`,
      confirmText: 'Ya, Hapus',
      danger: true
    });
    if (yakin) {
      const { error } = await window.sb
        .from('saving_goals')
        .delete()
        .eq('goal_id', activeGoal.id);

      if (error) {
        showToast('Gagal menghapus target: ' + error.message);
        return;
      }

      window.location.href = 'goals.html';
    }
  });

  // Fungsi Ikon Lonceng Pengingat Target Terdekat
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

  await loadGoalsAndDetail();
});