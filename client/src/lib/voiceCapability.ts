export type VoiceCapability = "checking" | "native" | "fallback" | "unavailable";

export function detectVoiceCapability({ hasNativeRecognition, hasFallbackRecording }: { hasNativeRecognition: boolean; hasFallbackRecording: boolean }): VoiceCapability {
  return hasNativeRecognition ? "native" : hasFallbackRecording ? "fallback" : "unavailable";
}
