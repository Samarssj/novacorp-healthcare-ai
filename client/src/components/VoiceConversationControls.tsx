import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { detectVoiceCapability, type VoiceCapability } from "@/lib/voiceCapability";
import { CircleAlert, CircleCheck, Loader2, Mic, Square, Volume2 } from "lucide-react";
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

function toBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not prepare the recording."));
    reader.onerror = () => reject(new Error("Could not read the recording."));
    reader.readAsDataURL(blob);
  });
}

function preferredMimeType() {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"].find(type => MediaRecorder.isTypeSupported(type));
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [capability, setCapability] = useState<VoiceCapability>("checking");
  const [isListening, setIsListening] = useState(false);
  const [isRecordingFallback, setIsRecordingFallback] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcribeVoice = trpc.care.transcribeVoice.useMutation({
    onSuccess: result => {
      if (!result.text) {
        setError("Nova could not detect speech in that recording. Please try again.");
      } else {
        onTranscript(result.text);
      }
    },
    onError: () => setError("Nova could not transcribe that recording. Please try again or type your message."),
  });

  const getRecognitionConstructor = () => {
    if (typeof window === "undefined") return undefined;
    const browser = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
  };

  useEffect(() => {
    const hasNativeRecognition = Boolean(getRecognitionConstructor());
    const hasFallbackRecording = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
    setCapability(detectVoiceCapability({ hasNativeRecognition, hasFallbackRecording }));
    return () => {
      recognitionRef.current?.stop();
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach(track => track.stop());
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  const startNativeListening = () => {
    const VoiceRecognition = getRecognitionConstructor();
    if (!VoiceRecognition) return;
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

  const startFallbackRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = preferredMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        setIsRecordingFallback(false);
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) return setError("Nova did not receive an audio recording. Please try again.");
        if (blob.size > 8 * 1024 * 1024) return setError("The recording is too large. Keep voice messages under one minute.");
        try {
          const audioBase64 = await toBase64(blob);
          transcribeVoice.mutate({ audioBase64, mimeType: (recorder.mimeType || "audio/webm") as "audio/webm" });
        } catch {
          setError("Nova could not prepare that recording. Please try again or type your message.");
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setIsRecordingFallback(true);
    } catch {
      setError("Microphone permission is required to record a voice message.");
    }
  };

  const stopRecording = () => {
    if (isListening) recognitionRef.current?.stop();
    if (isRecordingFallback) recorderRef.current?.stop();
  };
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

  const isRecording = isListening || isRecordingFallback;
  const isTranscribing = transcribeVoice.isPending;
  const support = capability === "native"
    ? { label: "Native voice input ready", detail: "Your browser can transcribe speech directly.", className: "text-[#005a48]" }
    : capability === "fallback"
      ? { label: "Server transcription fallback ready", detail: "Nova will securely transcribe a short recording when you speak.", className: "text-[#9a5d00]" }
      : capability === "unavailable"
        ? { label: "Voice input unavailable", detail: "Use typed chat in this browser.", className: "text-[#7d2c1d]" }
        : { label: "Checking voice support", detail: "Nova is checking this browser.", className: "text-black/50" };

  return <div className={cn("mt-3 flex flex-wrap items-center gap-2", className)}>
    <p className={cn("basis-full flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]", support.className)}>
      {capability === "unavailable" ? <CircleAlert className="size-3.5" /> : <CircleCheck className="size-3.5" />} {support.label}
      <span className="font-normal normal-case tracking-normal text-black/50">· {support.detail}</span>
    </p>
    <Button type="button" variant="outline" size="sm" disabled={disabled || capability === "checking" || capability === "unavailable" || isTranscribing} onClick={isRecording ? stopRecording : capability === "native" ? startNativeListening : startFallbackRecording} className={cn("rounded-none border-black/25 bg-transparent text-[10px] uppercase tracking-[0.12em]", isRecording && "border-[#005a48] bg-[#e7f1eb] text-[#005a48]")}> 
      {isTranscribing ? <><Loader2 className="mr-1.5 size-3 animate-spin" />Transcribing</> : isRecording ? <><Square className="mr-1.5 size-3" />Stop recording</> : <><Mic className="mr-1.5 size-3" />{capability === "fallback" ? "Record for Nova" : "Speak to Nova"}</>}
    </Button>
    <Button type="button" variant="ghost" size="sm" disabled={!reply || isSpeaking} onClick={speakReply} className="rounded-none text-[10px] uppercase tracking-[0.12em] text-black/60 hover:bg-transparent hover:text-[#005a48]">
      {isSpeaking ? <Loader2 className="mr-1.5 size-3 animate-spin" /> : <Volume2 className="mr-1.5 size-3" />} Hear Nova
    </Button>
    {isRecording && <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#005a48]">{isRecordingFallback ? "Recording…" : "Listening…"}</span>}
    {error && <p role="status" className="basis-full border-l-2 border-[#b55239] pl-3 text-xs leading-5 text-[#7d2c1d]">{error}</p>}
  </div>;
}
