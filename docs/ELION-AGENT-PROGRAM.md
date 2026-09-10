# ELION Agent Program — peta implementasi spesifikasi master (73 §)

Dokumen ini hasil **PHASE 1 (Architecture Audit)**. Aturan mainnya dari spek itu
sendiri (§67, §68): klaim harus sesuai isi repo, fitur yang tidak bisa nyata di
platform ini diisolasi di belakang antarmuka — tidak dipura-purakan.

## Yang SUDAH nyata di codebase (jangan dibangun ulang)

| Kebutuhan spek | Implementasi yang sudah ada |
|---|---|
| §16 dokumen persisten | `pagesStore` + Dexie (`pages`, `snapshots`, Bloksuite) — create/edit/rename/duplicate/version/restore sudah jalan |
| §4.4 task state | `itemsStore` + Dexie `items` — status, priority, dueDate, sprint, history (`statusHistory`) |
| §39 notifikasi desktop | `notifyStore` (Notification API + center + chime) & `alarmEngine` tick |
| §53 scheduling | `alarmEngine` (daily/weekly/once) — jalan selagi app terbuka |
| §10 AI calls | `aiProviders.ts` — 9 preset streaming (OpenAI-compat & Anthropic) |
| §60 multi-interface | chat panel, workspace, tasks, calendar, alarms sudah satu store graph |
| §12 akses sistem (desktop) | `electron/` bridge IPC (main process) — CORS bridge sudah ada, jadi fondasi tool executor |

## Yang dibangun turn ini — PHASE 2 + sebagian PHASE 4

- **`src/lib/memory.ts`** — engine memori 6 lapis (§4): record terstruktur (§5:
  importance, confidence, lastAccessedAt, relatedEntities, retention), lifecycle
  penuh (§6: create → retrieve → reinforce → update → conflict → delete).
  Konflik: `explicit-user > tool > inference`, imbang → terbaru; yang kalah
  diarsipkan dengan `supersededBy` (riwayat utuh).
- **§7 retrieval kontekstual**: `buildMemoryContext(query)` skor
  overlap-token + importance + confidence + decay 28 hari; HANYA relevan yang
  masuk prompt (maks 6). Wiring di `companionStore.send()` + ekstraksi
  preferensi eksplisit user ID/EN (`captureFromUserText`).
- **§4.3 semantic abstraction**: `consolidate()` deterministik — ≥3 memori mirip
  (Jaccard > 0.6) dilebur jadi 1 memori `semantic` ber-evidence kumulatif.
  Jujur: ini pengelompokan terukur, bukan "makin pinter" yang diklaim.
- **`src/lib/activity.ts` + tabel `agentEvents`** — event sungguhan yang ditulis
  lapisan eksekusi (§35–37: memory.*, task.*, dst.), persist di Dexie
  (v2 migration, data lama aman), feed 500 terakhir di store. UI monitor tinggal
  baca sini.
- **§44 object-switch bug — FIXED by root cause**: `ItemModal` dulunya form
  dengan ±16 `useState` yang hanya terisi saat mount → ganti objek A→B
  memakai snapshot basi, save bisa menimpa B dengan isi A. Sekarang wrapper
  mem-remount form per **item id** dan hydrate dari salinan LIVE store.
  Regression test membuktikan tes gagal di kode lama (`tests/itemModalSwitch.test.tsx`).
- **§45 done**: teks "Tell Elion what's on your mind — replies come from…"
  dihapus dari sumber (grep 0 hasil).
- Bonus kejujuran: abort saat retrieval memori tidak lagi memulai stream palsu,
  dan tanpa IndexedDB chat tetap jalan (degradasi sadar, bukan error).

## Batas platform — apa yang TIDAK akan dibuat berpura-pura

| Fitur | Realita | Rencana |
|---|---|---|
| §32 background runtime saat app tertutup | Web/Chrome tidak mengizinkan proses abadi; SW mati-mati | Loop jalan di **app open/tab** (worker) + **Electron main process** untuk always-on; UI jujur menampilkan status runtime |
| §13 browser control | Tidak ada API web untuk mengontrol browser user | Electron: `webContents` + permission-gated IPC; web build: tool `browser.read` via fetch + ekstraksi teks, TANPA klaim "sudah membuka tab" |
| §15 Gmail | Butuh OAuth client milik user; token TIDAK boleh masuk ke model | Interface `EmailProvider` + adapter Gmail (Electron main menyimpan token, chat cuma lihat hasil); sampai dikonfigurasi, tool melaporkan `unconfigured` — bukan draft palsu |
| §54 cek schedule via website | Sama seperti browser control | `ScheduleProvider` interface; Google Calendar API via key user; tanpa key → `unconfigured` |
| §8 adaptasi perilaku | Tidak ada "self-improvement" mistis | Yang ada: memory + reinforcement + consolidation + preference-driven context — teruji, terlihat di timeline |

## Status terbaru

| Fase | Isi | Status |
|---|---|---|
| 1 Audit | dokumen ini | ✅ |
| 2 Persistent state | memory engine + Dexie v2 + chat wiring | ✅ (10 test) |
| 3 Agent runtime | `permissions.ts` (allow/ask/deny + approval queue), `tools.ts` (router + 8 tool nyata + 5 gap tergunaci), `agentTasks.ts` (antrean prioritas, backoff, pause/resume, recover), `agentRuntime.ts` (loop §24, preemption §25–27, idle hanya bila tak ada kerja) | ✅ (17 test) |
| 4 Event system | `activity.ts` + instrumentasi nyata (document.created di pagesStore, notification.created di notifyStore, task.* & tool.* di engine) | ✅ |
| 5 Tools | workspace/docs/tasks/schedule/notifications/memory/browser.read = NYATA. Gmail/Calendar/browser.interact/files/system = interface siap, `unconfigured` jujur — butuh host Electron + credential user | ◐ (adapter Electron = kerja berikutnya) |
| 6 Sentient mode | loop nyata, stop/pause/resume, event sentient.*, persist enable; background hanya selagi app terbuka (web) — jujur di UI | ◐ (worker/Electron always-on menyusul) |
| 7 Workspace | create/edit/version/restore SUDAH ada; export multi-dokumen UI = belum | ◐ |
| 8 UI | Settings › ELION runtime: status, approval, objectives, antrean task, permission center, timeline event (semua baca state asli) | ◐ (/elion page, dock modes, separators = menyusul) |
| 9 Bugs | §44 fixed by root cause; race re-entrancy tick + abort-selesai-retrieval ditemukan & diperbaiki oleh test | ✅ (slice) |
| 10 Validasi | 147 unit/integration test hijau; e2e CI 26/26 | ✅ (berjalan terus) |

## Spek v4.3 (konsolidasi) — peta delta & status

Sumber: `docs/ELION-MASTER-SPEC-v4.3.md` (single entry point; tiga dokumen
deep-detail tetap otoritatif). Yang dikerjakan turn ini:

| Kebutuhan v4.3 | Status | Implementasi |
|---|---|---|
| §13 Monitoring dashboard (4 panel, 1 sumber data, "Not enough data yet") | ✅ | `src/lib/monitoring.ts` (fungsi murni: queue, tier, outcomes, latensi, hourly, memops, errors, heatmap, curve, velocity, stop/resume) + `src/components/settings/MonitoringDashboard.tsx` di Settings › ELION runtime |
| Skill Ledger permanen | ✅ | tabel Dexie `skills` (v4) + `src/lib/skills.ts` — `recordSkill()` satu-satunya penulis, selalu berpasangan dgn event `skill.promoted`; mulai kosong dgn jujur |
| Latensi tool nyata per kategori | ✅ | `elapsedMs` di `AgentEventRecord` (tanpa index → tanpa migrasi) + diukur di `runTool()` |
| Memory reads nyata | ✅ | event `memory.recalled` ditulis `recall()` (query + hit count, tanpa isi memori) |
| Part IV baris API-key (⛔ never autonomous) | ✅ | tidak ada tool settings/key (dikunci `tests/capabilityTable.test.ts` + snapshot registry) |
| §12 known fix (string provider) | ✅ sudah | diverifikasi: grep 0 hasil di `src/` |
| §44/§12 object-switch bug | ✅ sudah | `ItemModal` remount per id + regression test tetap hijau |
| Part IV tabel → Gateway enforcement | ◐ eksternal | butuh pilihan runtime Gilang (lihat bawah) |
| Part VI OpenClaw ATAU Hermes | ✅ resolved natively | Agent core bawaan mengimplementasikan feature-set kelas ini TANPA runtime eksternal: skills `skills.*`, cron `agent.jobs.*` + `agent.reason`, chat sessions persisten, permission table. Tidak ada gateway/daemon eksternal yang dibutuhkan atau disertakan |
| Part VII /evolve + GEPA-PR | ◐ partial | Skill Ledger + heatmap siap; skill buatan agent (`skills.create`, origin `authored`) terpromosi otomatis ke ledger; GEPA/PR eksternal = kerja berikutnya |
| Gmail milik Elion | ✅ | login di UI (Settings › Elion's email) + vault token main process + `docs/GMAIL-SETUP.md`; tool `email.*` nyata kalau connected |
| Electron system adapter | ✅ | `electron/sys.cjs`: files.read + allow-list perintah; UI di runtime section; desktop-only jujur |
| /elion agent chat + Sentient di UI | ✅ | `src/pages/ElionPage.tsx`: chat tool-capable (function calling OpenAI/Anthropic, fallback jujur buat MiniCPM), panel Sentient §11, While-you-were-away dari event |
| /elion page + dock side/below | ◐ menyusul | monitor tinggal pindah ke tab Monitoring saat halaman /elion dibangun |
| Cost/token di dashboard | ◐ jujur-kosong | runtime belum expose → "Not enough data yet" + catatan |

## Sisa fase (urutan kerja berikutnya)

1. **PHASE 3 — Agent runtime**: tool router + permission manager (tabel
   `permissions`), task engine di atas `itemsStore` dengan state §27
   (QUEUED/RUNNING/PAUSED/…), eksekutor tool nyata (workspace.docs.*,
   workspace.tasks.*, memory.*, notify.*, schedule.*, browser.read).
2. **PHASE 6 — Sentient loop**: worker (Web Worker) — OBSERVE → EVALUATE →
   RANK → PERMISSION CHECK → EXECUTE → RECORD; preemption user input (§25-26)
   lewat antrean prioritas; idle HANYA kalau tak ada aksi berguna yang diizinkan.
3. **PHASE 8 — UI**: halaman `/elion` (chat penuh + status runtime), Activity
   Monitor (baca `agentEvents`), Permission Center, Sentient Control Center,
   dock side/below toggle (§42), export multi-dokumen UI (§19 — mesin export
   sebagian sudah ada di pagesStore).
4. **PHASE 5/9/10**: adapter Gmail/Calendar (Electron), sapu bug, test
   skenario §66 end-to-end di Playwright.
