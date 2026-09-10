# Elion's own Gmail — setup (sekali saja)

Elion dapat akun Gmail **miliknya sendiri** — bukan akun pribadi Gilang.
Kredensial OAuth tinggal di vault main process aplikasi desktop dan tidak
pernah masuk ke model/chat. Alur login ada di UI: Settings › Elion's email.

## 1. Buat akun + project Google (di browser)

1. Buat akun Google baru untuk Elion (mis. `elion.assistant.[sesuatu]@gmail.com`).
2. Login sebagai akun itu, buka [Google Cloud Console](https://console.cloud.google.com).
3. Buat project baru (mis. `elion-suite`).
4. **APIs & Services › Library** → cari `Gmail API` → **Enable**.
5. **APIs & Services › OAuth consent screen** → tipe **External** → isi nama
   aplikasi + email support (akun Elion) → **Create**.
6. Masih di consent screen → **Test users** → **Add users** → masukkan alamat
   akun Elion itu sendiri → **Save**.
7. **APIs & Services › Credentials** → **Create Credentials › OAuth client ID** →
   tipe aplikasi **Desktop app** → **Create** → salin **Client ID** + **Client secret**.

## 2. Sambungkan di aplikasi desktop

1. Buka Elion Suite **desktop** (bukan web — vault token hanya ada di sana).
2. Settings › **Elion's email** → tempel Client ID + Client secret → **Save client**.
3. Isi **your own email** (alamat Gilang — untuk laporan Elion ke kamu) → **Save**.
4. **Connect with Google** → jendela sign-in Google resmi terbuka → login
   sebagai akun Elion → **Allow** → kembali ke aplikasi. Status berubah
   jadi `Connected as …`.

## 3. Cabut / ganti

- **Disconnect** di halaman yang sama menghapus token (client tetap tersimpan).
- Ganti client = sesi lama otomatis hangus, Connect ulang.
- Akses juga bisa dicabut dari sisi Google: akun Elion › Security ›
  Third-party access.

## Catatan jujur

- Consent **testing mode**: Google mengharuskan re-consent ± tiap 7 hari —
  kalau mail tiba-tiba `expired`, cukup Connect ulang. (Menerbitkan aplikasi
  ke production menghapus batas ini tapi butuh verifikasi Google.)
- Scope yang diminta: baca + kirim Gmail saja (`gmail.readonly`,
  `gmail.send`). Tidak ada akses Drive/dokumen.
- Web build tidak bisa connect mail — disengaja (boleh jadi bahan
  pertimbangan sebelum share link web ke siapa pun).
