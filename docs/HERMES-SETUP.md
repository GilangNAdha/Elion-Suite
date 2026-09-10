# Hermes Agent — runtime Elion (keputusan: Hermes)

Part VI spek v4.3 menyuruh pilih SATU: OpenClaw atau Hermes. **Gilang memilih
Hermes** (`NousResearch/hermes-agent`). Dokumen ini = checklist pemasangan di
mesin Gilang + peta cara Elion Suite nyambung ke sana. Perintah persisnya bisa
bergeser (repo Hermes rilis cepat) — cek `--help` sebelum jalan.

> Instal HANYA dari repo resmi. Jangan pakai mirror tidak resmi (risiko malware).

## 0. Inti Hermes sudah embedded di Elion (tanpa instalasi)

Feature-set inti Hermes sekarang jalan **native di dalam Elion** — tanpa
instal apa pun:

| Kemampuan Hermes | Padanan embedded di Elion |
|---|---|
| Skills (SKILL.md + langkah) | **Executable skills** — `skills.create` / `skills.run`, panel Settings › ELION runtime › Skills; skill buatan agent masuk Skill Ledger otomatis (origin `authored`) |
| Cron unattended | **In-app cron** — `agent.jobs.create` / `agent.jobs.list`, dieksekusi loop Sentient lewat `agent.reason` (LLM + tools) via antrean prioritas yang sama (scheduled commitments) |
| Sesi persisten (state.db) | **Chat sessions** di Dexie — chat selamat dari refresh, 10 sesi terakhir disimpan |
| Permission/approval | Permission Center (allow/ask/deny) yang sudah ada — tabel Part IV |
| Memory (`~/.hermes/memories/`) | Memory 6 lapis (`memories` Dexie) dengan recall/reinforce/consolidation |

Jadi kamu TIDAK perlu memasang Hermes untuk memakai Elion. Bagian di bawah
hanya untuk menghubungkan gateway Hermes sungguhan sebagai **lengan opsional**
(tool server-side + kerja saat app tertutup).

## 0. Yang SUDAH terintegrasi di Elion Suite (tanpa setup tambahan di kode)

Elion sekarang punya jembatan Hermes bawaan (`src/lib/hermes.ts`) yang bicara
langsung ke REST API server Hermes (`hermes gateway` di `127.0.0.1:8642`):

| Integrasi | Di mana | Keterangan |
|---|---|---|
| Provider chat "Hermes Agent (local runtime)" | Settings › AI assistant | Chat mengalir via `/v1/chat/completions` gateway; toolset server-side Hermes jalan di sana, tool Elion tetap tersedia di app |
| Tool `hermes.status` | /elion chat | Probe `/health` + `/v1/skills` + `/v1/toolsets` + `/api/jobs` — jawaban jujur walau offline |
| Tool `hermes.ask` | /elion chat | Delegasi kerja ke Hermes (permission `hermes.delegate`, default **ask**) — context dirangkai gateway lewat `conversation: elion` |
| Tool `hermes.skills.import` | /elion chat + Settings | Tarik `/v1/skills` → Skill Ledger (origin `hermes-import`), duplikat dilewati |
| Tool `hermes.job.create` / `hermes.jobs.list` | /elion chat | Cron unattended di gateway (permission `hermes.control`, default **ask**) |
| Panel "Hermes agent bridge" | Settings › ELION runtime | Status, gateway URL + API key, Test, impor skill, kelola job (pause/resume/run/delete) |

Kejujuran tetap berlaku (§67/§68): gateway mati = status offline + langkah
setup; tidak ada hasil palsu. Kunci API (`API_SERVER_KEY`) disimpan di local
storage app — sama seperti key provider lain, tidak pernah dikirim ke mana pun
selain gateway.

## 1. Install

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

Sinkronisasi skill saat ini = impor satu arah dari gateway ke ledger
(`hermes.skills.import`, atau tombol *Import into Skill Ledger* di Settings ›
ELION runtime › Hermes). Skill yang DIUBAH di sisi Hermes tidak pernah
menimpa ledger otomatis — tetap lewat PR/review.

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
