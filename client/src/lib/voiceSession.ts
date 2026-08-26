export const VOICE_INACTIVITY_MS = 10_000;
export const VOICE_SILENCE_THRESHOLD_MS = 1_400;
export const MINIMUM_CAPTURE_MS = 650;

export function shouldAutoSubmitAfterPause({ elapsedMs, silenceMs, hasDetectedSpeech }: { elapsedMs: number; silenceMs: number; hasDetectedSpeech: boolean }) {
  return hasDetectedSpeech && elapsedMs >= MINIMUM_CAPTURE_MS && silenceMs >= VOICE_SILENCE_THRESHOLD_MS;
}

export function shouldPromptForVoiceInactivity({ elapsedMs, sessionActive, awaitingResponse, isListening = false, isRecording = false, isTranscribing = false, isSpeaking = false, resumePending = false }: { elapsedMs: number; sessionActive: boolean; awaitingResponse: boolean; isListening?: boolean; isRecording?: boolean; isTranscribing?: boolean; isSpeaking?: boolean; resumePending?: boolean }) {
  return sessionActive && !awaitingResponse && !isListening && !isRecording && !isTranscribing && !isSpeaking && !resumePending && elapsedMs >= VOICE_INACTIVITY_MS;
}

export function confirmsNoFurtherHelp(transcript: string) {
  const normalized = transcript.toLowerCase().replace(/[^a-z\s']/g, " ").replace(/\s+/g, " ").trim();
  return /^(no|nope|nothing|nothing else|no thanks|end|end session|goodbye|bye|that's all|thats all)$/.test(normalized);
}

export function decideVoiceSessionResponse(transcript: string) {
  return confirmsNoFurtherHelp(transcript) ? "end" : "continue";
}
