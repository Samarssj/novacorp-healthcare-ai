import { z } from "zod";
import type { TranscriptionResponse } from "../_core/voiceTranscription";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export const transcriptionLanguages = ["en", "es", "fr", "de", "hi"] as const;
export type TranscriptionLanguage = (typeof transcriptionLanguages)[number];

export const transcriptionLanguageLabels: Record<TranscriptionLanguage, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  hi: "Hindi",
};

export const voiceFallbackInput = z.object({
  audioBase64: z.string().trim().min(16).max(11_200_000),
  mimeType: z.enum(["audio/webm", "audio/ogg", "audio/wav", "audio/mp4", "audio/mpeg"]),
  language: z.enum(transcriptionLanguages).default("en"),
}).strict();

export function buildEphemeralAudioDataUrl(input: unknown) {
  const parsed = voiceFallbackInput.parse(input);
  const base64 = parsed.audioBase64.replace(/^data:[^,]+,/, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error("Audio payload must be base64 encoded.");
  const byteLength = Buffer.byteLength(base64, "base64");
  if (byteLength > MAX_AUDIO_BYTES) throw new Error("Audio recording exceeds the 8 MB fallback limit.");
  return `data:${parsed.mimeType};base64,${base64}`;
}

export async function runVoiceFallback(
  input: unknown,
  transcribe: (options: { audioUrl: string; language: string; prompt: string }) => Promise<TranscriptionResponse | { error: string }>,
) {
  const parsed = voiceFallbackInput.parse(input);
  return transcribe({
    audioUrl: buildEphemeralAudioDataUrl(parsed),
    language: parsed.language,
    prompt: `Transcribe a NovaCorp Health member-care conversation accurately in ${transcriptionLanguageLabels[parsed.language]}.`,
  });
}
