import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, Mic, Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type RecognitionEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type RecognitionErrorEvent = { error: string };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};
type RecognitionConstructor = new () => Recognition;

function plainText(markdown: string) {
  return markdown.replace(/\*\*/g, "").replace(/\[(.*?)\]\(.*?\)/g, "$1").replace(/[#*_>`]/g, " ").replace(/\s+/g, " ").trim();
}

export function VoiceConversationControls({
  onTranscript,
  reply,
  disabled = false,
  className,
}: {
  onTranscript: (transcript: string) => void;
  reply?: string;
  disabled?: boolean;
  className?: string;
}) {
  const recognitionRef = useRef<Recognition | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  const startListening = () => {
    if (typeof window === "undefined") return;
    const VoiceRecognition = (window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }).SpeechRecognition
      ?? (window as typeof window & { webkitSpeechRecognition?: RecognitionConstructor }).webkitSpeechRecognition;
    if (!VoiceRecognition) {
      setError("Voice input is not supported in this browser. Please type your response instead.");
      return;
    }
    setError(null);
    const recognition = new VoiceRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = event => {
      const transcript = Array.from(event.results).map(result => result[0]?.transcript ?? "").join(" ").trim();
      if (transcript) onTranscript(transcript);
    };
    recognition.onerror = event => {
      setIsListening(false);
      setError(event.error === "not-allowed" ? "Microphone permission is required to use voice input." : "Nova could not hear that. Please try again or type your response.");
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const stopListening = () => recognitionRef.current?.stop();
  const speakReply = () => {
    if (!reply || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(plainText(reply));
    utterance.rate = 0.96;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  return <div className={cn("mt-3 flex flex-wrap items-center gap-2", className)}>
    <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={isListening ? stopListening : startListening} className={cn("rounded-none border-black/25 bg-transparent text-[10px] uppercase tracking-[0.12em]", isListening && "border-[#005a48] bg-[#e7f1eb] text-[#005a48]")}> 
      {isListening ? <><Square className="mr-1.5 size-3" />Stop listening</> : <><Mic className="mr-1.5 size-3" />Speak to Nova</>}
    </Button>
    <Button type="button" variant="ghost" size="sm" disabled={!reply || isSpeaking} onClick={speakReply} className="rounded-none text-[10px] uppercase tracking-[0.12em] text-black/60 hover:bg-transparent hover:text-[#005a48]">
      {isSpeaking ? <Loader2 className="mr-1.5 size-3 animate-spin" /> : <Volume2 className="mr-1.5 size-3" />} Hear Nova
    </Button>
    {isListening && <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#005a48]">Listening…</span>}
    {error && <p role="status" className="basis-full border-l-2 border-[#b55239] pl-3 text-xs leading-5 text-[#7d2c1d]">{error}</p>}
  </div>;
}
