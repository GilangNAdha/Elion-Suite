# Elion voice dictation — implemented scope and validation

Updated 8 September 2026. This is the implementation status for the supplied v6 dictation specification; it does **not** claim the native desktop portion is complete.

## Implemented

One `VoiceDictationService` owns capture, a single worker backend, model selection, progress, cancellation and the insertion target. The legacy `src/lib/stt.ts` now re-exports that service; it no longer creates another recognizer.

Entry points:

- Immersive-editor toolbar and inline text-block mic; block-menu dictation uses the same service.
- Lockdown Notes widget.
- The shared task/habit creation and edit dialog.
- Global search.
- In-app shortcuts and optional Electron shortcut capture, scoped to a focused Elion window.

Pipeline:

1. Explicit microphone permission and local mono capture.
2. Resampling to 16 kHz when needed.
3. **Real Silero VAD** in a dedicated Web Worker, using the bundled 16 kHz ONNX model. Silence is rejected before the speech recognizer is loaded.
4. **Whisper through Transformers.js / ONNX Runtime WASM**, in the same worker. Tiny, Base and Small are supported choices; model files are downloaded on demand and cached by the browser.
5. Dictionary spelling/capitalization correction.
6. Replacement of the captured selection in the original text target. An editor adapter creates a real, named, undoable history entry; no clipboard API is used.

Audio and transcripts are never sent to a speech provider. First-use model downloads require a connection. The PWA precaches the app, fonts, art, Silero model, worker and WASM runtime (roughly 23 MiB for the app precache); large Whisper weights are **not** bundled into Git or the app precache. Browser model caches may be evicted under storage pressure.

The mic can be clicked to toggle or held to talk. The in-app shortcut follows that preference. Recording is capped at two minutes. Cancel, target removal, navigation and pending-permission cancellation release capture and prevent late insertion. If the target was edited while inference ran, Elion rejects insertion rather than overwriting newer text.

Settings also exposes language, a custom spelling dictionary, shortcut choice and **Prepare offline model**. Dictionary matching is post-transcription correction, not acoustic fine-tuning.

## Desktop boundary — not implemented or verified

- **No native Whisper / transcribe-rs addon is shipped.** Electron currently consumes the same renderer worker implementation as web. `VoiceBackend` is the explicit integration seam for a future native backend.
- GPU acceleration, Whisper Medium/Large/Turbo and Parakeet V3 are **not** available in this build.
- The optional Electron `globalShortcut` registration only acts while Elion is focused. It uses toggle mode because Electron's API does not provide key-release events for global press-and-hold. Browser shortcuts require the app to have focus.
- Windows packaging and microphone/hotkey behavior on a real Windows installation still need desktop verification. Hash routing and a stable file asset base avoid broken Electron deep-link asset paths; they are not a substitute for a Windows smoke test.
- The implementation is batch transcription with progress feedback, not token-by-token live transcript streaming.

The misspelled/ambiguous native library names in the supplied prose have not been turned into fabricated dependencies. Handy is credited for the architecture and interaction pattern; its application, name/logo assets and Tauri shell are not embedded.

## Tests actually run

### Automated

- `npm test`: service ownership, shared model/language selection across target types, cancellation races, denied permission, dictionary handling, resampling, controlled-input selection replacement, editor adapter insertion, theme contrast, timers and existing block/filter/date regressions.
- `npm run test:e2e`: real browser microphone-control flow with a **stubbed neural result**, inserted into the actual editor at the selected text range and undone/redone through its history. This tests integration, not speech recognition accuracy.
- The same nine browser checks passed against the built production server as well as Vite development.

### Actual neural VAD and offline production check

The bundled **production worker** processed the public `samples/jfk.wav` speech fixture from `ggml-org/whisper.cpp`, at 16 kHz, with the browser offline. Silero returned **172,928 speech-bound samples**. The production app also reloaded offline with successful cached requests for both fonts, wallpaper, sprite sheets and the Silero model. This verifies local VAD execution and asset availability; it does not verify Whisper recognition accuracy.

### Still outstanding

A full known-text transcription accuracy run with downloaded Whisper weights, live human microphone testing, cache-eviction recovery across target browsers, and native Windows/GPU/Parakeet QA are **not claimed as passed**.
