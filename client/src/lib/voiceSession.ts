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
  return /^(no|nope|nothing|nothing else|no thanks|end|end session|please end|please end the session|goodbye|bye|that's all|thats all|and the session|thank you that's all|thanks that's all|i (?:do not|don't|dont) (?:want|need|have) (?:anything|anthing|anyting)(?: else| more)?(?: help)?|i'?m all set|im all set|we(?:'re| are) all good|all good|(?:have )?(?:a )?(?:good|great|nice) day|have a good day|(?:ok(?:ay)? )?(?:thanks|thank you) (?:and )?(?:have )?(?:a )?(?:good|great|nice) day|(?:ok(?:ay)? )?(?:thanks|thank you) (?:and )?(?:goodbye|bye))$/.test(normalized);
}

export function isPartialEndSessionPhrase(transcript: string) {
  const normalized = transcript.toLowerCase().replace(/[^a-z\s']/g, " ").replace(/\s+/g, " ").trim();
  return /^(?:and )?the session$/.test(normalized);
}

export function decideVoiceSessionResponse(transcript: string) {
  return confirmsNoFurtherHelp(transcript) ? "end" : "continue";
}

/** A session-end button asks an affirmative question, so only a clear yes ends care. */
export function confirmsEndSession(transcript: string) {
  const normalized = transcript.toLowerCase().replace(/[^a-z\s']/g, " ").replace(/\s+/g, " ").trim();
  return /^(yes|yeah|yep|yes please|yes please end|yes please end my session|please do|confirm|confirm end|end it|please end|please end the session|i want to end|i want to end the session|i do|that's all|thats all|goodbye|bye)$/.test(normalized) || confirmsNoFurtherHelp(normalized);
}

export function decideEndSessionConfirmation(transcript: string) {
  return confirmsEndSession(transcript) || isPartialEndSessionPhrase(transcript) ? "end" : "continue";
}
