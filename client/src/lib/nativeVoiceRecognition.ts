export type VoiceLanguage = "en" | "es" | "fr" | "de" | "hi";

const nativeLocales: Record<VoiceLanguage, string> = {
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  hi: "hi-IN",
};

export function nativeRecognitionLocale(language: VoiceLanguage) {
  return nativeLocales[language];
}

export function isEmptySpeechRecognitionError(error: string) {
  return error === "no-speech" || error === "aborted";
}

export function emptySpeechRetryNotice() {
  return "Nova is ready when you are. Select Speak to Nova, then begin speaking once Listening appears.";
}
