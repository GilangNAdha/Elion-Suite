// Compatibility entry point. There is no second engine in this module.
// All mounted controls consume this same offline dictation service.
export { VoiceDictationService, voiceDictation, useVoiceDictation } from './voice/VoiceDictationService'
export { captureVoiceTarget, applyDictionary, insertTranscript } from './voice/textTarget'
export type { VoiceBackend, VoiceOptions, VoiceModel } from './voice/types'
