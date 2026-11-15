document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) lucide.createIcons();

  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const nameGroup = document.getElementById('nameGroup');
  const fullNameInput = document.getElementById('fullName');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const togglePasswordBtn = document.getElementById('togglePassword');
  const formTitle = document.getElementById('formTitle');
  const formSubtitle = document.getElementById('formSubtitle');
  const submitBtn = document.getElementById('submitBtn');
  const rememberRow = document.getElementById('rememberRow');
  const forgotLink = document.getElementById('forgotLink');
  const errorMsg = document.getElementById('errorMsg');
  const authForm = document.getElementById('authForm');
  const btnGoogle = document.getElementById('btnGoogle');

  let currentMode = 'login'; // 'login' atau 'register'

  // Cek apakah user sudah punya sesi aktif di Supabase -> langsung ke dashboard
  const { data: { session } } = await window.sb.auth.getSession();
  if (session) {
    window.location.href = 'dashboard.html';
    return;
  }

  function showMessage(text, isSuccess = false) {
    errorMsg.textContent = text;
    errorMsg.style.color = isSuccess ? '#15803d' : '#dc2626';
  }

  // Switch Mode Login / Register
  function setMode(mode) {
    currentMode = mode;
    showMessage('');

    if (mode === 'login') {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      nameGroup.classList.add('hidden');
      fullNameInput.required = false;
      rememberRow.classList.remove('hidden');
      forgotLink.style.display = 'inline';
      formTitle.textContent = 'Selamat Datang Kembali';
      formSubtitle.textContent = 'Lanjutkan kebiasaan finansial cerdas kampusmu.';
      submitBtn.innerHTML = 'Masuk ke Dompet <i data-lucide="arrow-right" width="16" height="16"></i>';
    } else {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      nameGroup.classList.remove('hidden');
      fullNameInput.required = true;
      rememberRow.classList.add('hidden');
      forgotLink.style.display = 'none';
      formTitle.textContent = 'Mulai Kebiasaan Baru';
      formSubtitle.textContent = 'Buat akun mahasiswa dan atur target tabunganmu.';
      submitBtn.innerHTML = 'Daftar & Mulai Menabung <i data-lucide="arrow-right" width="16" height="16"></i>';
    }

    if (window.lucide) lucide.createIcons();
  }

  tabLogin.addEventListener('click', () => setMode('login'));
  tabRegister.addEventListener('click', () => setMode('register'));

  // Toggle Show/Hide Password dengan Lucide Icon
  togglePasswordBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    togglePasswordBtn.innerHTML = isPassword
      ? '<i data-lucide="eye-off" width="16" height="16"></i>'
      : '<i data-lucide="eye" width="16" height="16"></i>';
    if (window.lucide) lucide.createIcons();
  });

  // Lupa Password
  forgotLink.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!email) {
      showMessage('Masukkan alamat emailmu terlebih dahulu pada kolom email.');
      return;
    }
    const { error } = await window.sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/index.html`,
    });
    if (error) {
      showMessage(error.message);
    } else {
      showMessage('Tautan reset kata sandi telah dikirim ke emailmu.', true);
    }
  });

  // Login / Register dengan Supabase Auth
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMessage('');

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (password.length < 6) {
      showMessage('Kata sandi minimal 6 karakter.');
      return;
    }

    submitBtn.disabled = true;
    const originalBtnHTML = submitBtn.innerHTML;
    submitBtn.textContent = 'Memproses...';

    try {
      if (currentMode === 'register') {
        const name = fullNameInput.value.trim() || 'Mahasiswa UB';
        const { data, error } = await window.sb.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name, semester: 'Semester 4' }
          }
        });

        if (error) throw error;

        if (data.user) {
          await window.sb.from('users').upsert({
            user_id: data.user.id,
            email: email,
            nama: name
          });
        }

        window.location.href = 'dashboard.html';
      } else {
        const { error } = await window.sb.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;

        window.location.href = 'dashboard.html';
      }
    } catch (err) {
      let msg = err.message;
      if (msg.includes('Invalid login credentials')) {
        msg = 'Email atau kata sandi salah.';
      } else if (msg.includes('User already registered')) {
        msg = 'Email ini sudah terdaftar. Silakan pindah ke tab Masuk.';
      }
      showMessage(msg);
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHTML;
      if (window.lucide) lucide.createIcons();
    }
  });

  // Lanjutkan dengan Google (Supabase OAuth)
  btnGoogle.addEventListener('click', async () => {
    showMessage('');
    btnGoogle.disabled = true;
    const { error } = await window.sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard.html`
      }
    });
    if (error) {
      btnGoogle.disabled = false;
      showMessage('Gagal menghubungkan Google: ' + error.message);
    }
  });
});