# Hermes Agent — runtime Elion (keputusan: Hermes)

Part VI spek v4.3 menyuruh pilih SATU: OpenClaw atau Hermes. **Gilang memilih
Hermes** (`NousResearch/hermes-agent`). Dokumen ini = checklist pemasangan di
mesin Gilang + peta cara Elion Suite nyambung ke sana. Perintah persisnya bisa
bergeser (repo Hermes rilis cepat) — cek `--help` sebelum jalan.

> Instal HANYA dari repo resmi. Jangan pakai mirror tidak resmi (risiko malware).

## 1. Install

```bash
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
hermes setup
```

`hermes setup` menuntun: provider/model, direktori kerja, izin channel.
Verifikasi:

```bash
hermes --help
hermes agent-stats   # kalau tersedia — angka inilah yang nanti tampil di
                     # dashboard Monitoring (dipakai apa adanya, bukan dihitung ulang)
```

## 2. Peta Elion Suite → Hermes

| Elion Suite (repo ini) | Hermes |
|---|---|
| Memory 6 lapis (`memories` Dexie) | Memory/skills Hermes — ekspor JSON dari Elion jadi seed awal kalau perlu |
| `agentEvents` feed | `sessiondb` — sumber trace buat self-evolution (Part VII) |
| Skill Ledger (`skills` Dexie) | Direktori skills Hermes — `/evolve` / GEPA menulis ke dua sisi |
| Permission Center (allow/ask/deny) | Command approval + DM pairing + sandbox (Docker/Modal/SSH) |
| Tabel Part IV | Kebijakan approval Hermes: email keluar = confirm, API key = never autonomous |

## 3. Self-evolution (Part VII)

Jalan di atas trace sesi Hermes:

```bash
git clone https://github.com/NousResearch/hermes-agent-self-evolution.git
cd hermes-agent-self-evolution && pip install -e ".[dev]"
export HERMES_AGENT_REPO=~/.hermes/hermes-agent
python -m evolution.skills.evolve_skill --skill <skill-name> --iterations 10 --eval-source sessiondb
```

Aturan main (tidak berubah): skill BARU dari `/evolve` = otonom, langsung
masuk Skill Ledger; skill/kode yang DIUBAH = lewat PR, direview dulu.
Sampai pipeline ini jalan, ledger + heatmap di dashboard jujur menampilkan
"Not enough data yet".

## 4. Batas yang tetap berlaku

- Hermes jalan di mesin Gilang, data tidak keluar tanpa izin (Part II §5).
- API key provider: hanya Permission Center yang pegang — Hermes tidak
  pernah diberi kuasa rotasi (Part IV ⛔).
- Aksi ireversibel/keuangan/publikasi: confirm first, di Hermes
  diimplementasikan sebagai approval, bukan kebiasaan.
