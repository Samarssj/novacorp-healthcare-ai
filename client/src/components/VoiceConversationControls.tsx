import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { detectVoiceCapability, type VoiceCapability } from "@/lib/voiceCapability";
import { emptySpeechRetryNotice, isEmptySpeechRecognitionError, nativeRecognitionLocale } from "@/lib/nativeVoiceRecognition";
import { FALLBACK_RECORDING_SECONDS, formatRecordingCountdown, remainingRecordingSeconds } from "@/lib/voiceRecording";
import { decideVoiceSessionResponse, shouldAutoSubmitAfterPause, shouldPromptForVoiceInactivity, VOICE_INACTIVITY_MS } from "@/lib/voiceSession";
import { activeMicrophoneBars, normalizeMicrophoneLevel } from "../lib/microphoneLevel";
import { CircleAlert, CircleCheck, Loader2, Mic, PhoneOff } from "lucide-react";
import React from "react";
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
type CaptureMode = "message" | "presence" | "end-confirmation";
type VoiceSessionWindow = typeof window & { __novaHandsFreeSession?: boolean };

const languageOptions = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "hi", label: "Hindi" },
] as const;
type TranscriptionLanguage = (typeof languageOptions)[number]["value"];

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

function hasPersistedHandsFreeSession() {
  return typeof window !== "undefined" && Boolean((window as VoiceSessionWindow).__novaHandsFreeSession);
}

function setPersistedHandsFreeSession(active: boolean) {
  if (typeof window !== "undefined") (window as VoiceSessionWindow).__novaHandsFreeSession = active;
}

export function VoiceConversationControls({
  onTranscript,
  reply,
  onAssistantVoiceMessage,
  initialVoicePrompt,
  autoStartVoiceSession = false,
  onVoiceSessionStart,
  disabled = false,
  className,
}: {
  onTranscript: (transcript: string) => void;
  reply?: string;
  onAssistantVoiceMessage?: (content: string) => void;
  initialVoicePrompt?: string;
  autoStartVoiceSession?: boolean;
  onVoiceSessionStart?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const recognitionRef = useRef<Recognition | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceFrameRef = useRef<number | null>(null);
  const meterStreamRef = useRef<MediaStream | null>(null);
  const meterContextRef = useRef<AudioContext | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const inactivityTimerRef = useRef<number | null>(null);
  const captureModeRef = useRef<CaptureMode>("message");
  const nativeSubmittedRef = useRef(false);
  const shouldSpeakNextReplyRef = useRef(false);
  const lastVoicePlayedReplyRef = useRef<string | undefined>(undefined);
  const hasStartedOpeningPromptRef = useRef(false);
  const voiceSessionActiveRef = useRef(false);
  const resumeListeningTimerRef = useRef<number | null>(null);
  const voiceRuntimeRef = useRef({ isListening: false, isRecordingFallback: false, isTranscribing: false, isSpeaking: false, awaitingPresence: false, isEndingSession: false });
  const [capability, setCapability] = useState<VoiceCapability>("checking");
  const [isListening, setIsListening] = useState(false);
  const [isRecordingFallback, setIsRecordingFallback] = useState(false);
  const [isVoiceSessionActive, setIsVoiceSessionActive] = useState(false);
  const [awaitingPresence, setAwaitingPresence] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [language, setLanguage] = useState<TranscriptionLanguage>("en");
  const [remainingSeconds, setRemainingSeconds] = useState(FALLBACK_RECORDING_SECONDS);
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const getRecognitionConstructor = () => {
    if (typeof window === "undefined") return undefined;
    const browser = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
  };

  const clearInactivityTimer = () => {
    if (inactivityTimerRef.current) window.clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = null;
  };

  const clearResumeListeningTimer = () => {
    if (resumeListeningTimerRef.current) window.clearTimeout(resumeListeningTimerRef.current);
    resumeListeningTimerRef.current = null;
  };

  const stopSilenceDetector = () => {
    if (silenceFrameRef.current) window.cancelAnimationFrame(silenceFrameRef.current);
    silenceFrameRef.current = null;
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    setMicrophoneLevel(0);
  };

  const stopMicrophoneLevelMeter = () => {
    if (meterFrameRef.current) window.cancelAnimationFrame(meterFrameRef.current);
    meterFrameRef.current = null;
    meterStreamRef.current?.getTracks().forEach(track => track.stop());
    meterStreamRef.current = null;
    meterContextRef.current?.close().catch(() => undefined);
    meterContextRef.current = null;
    setMicrophoneLevel(0);
  };

  const startNativeMicrophoneLevelMeter = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof window.AudioContext === "undefined") return;
    stopMicrophoneLevelMeter();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      meterStreamRef.current = stream;
      const context = new window.AudioContext();
      meterContextRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const updateLevel = () => {
        analyser.getByteTimeDomainData(samples);
        setMicrophoneLevel(normalizeMicrophoneLevel(samples));
        meterFrameRef.current = window.requestAnimationFrame(updateLevel);
      };
      meterFrameRef.current = window.requestAnimationFrame(updateLevel);
    } catch {
      setMicrophoneLevel(0);
    }
  };

  const speakText = (text: string, onEnd?: () => void) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      onEnd?.();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(plainText(text));
    utterance.rate = 0.96;
    utterance.onend = () => {
      setIsSpeaking(false);
      onEnd?.();
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      onEnd?.();
    };
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const signOutPatient = trpc.care.signOutPatient.useMutation({
    onSuccess: () => window.location.reload(),
    onError: () => {
      setIsEndingSession(false);
      setError("Nova could not end the session. Please use the session control in the workspace.");
    },
  });

  const endVoiceSession = () => {
    clearInactivityTimer();
    clearResumeListeningTimer();
    voiceSessionActiveRef.current = false;
    setPersistedHandsFreeSession(false);
    setIsEndingSession(true);
    setAwaitingPresence(false);
    const farewell = "Thank you for contacting NovaCorp Health. Your care session is now ending. Goodbye.";
    onAssistantVoiceMessage?.(farewell);
    speakText(farewell, () => {
      window.setTimeout(() => signOutPatient.mutate(), 350);
    });
  };

  const handleVoiceTranscript = (transcript: string) => {
    clearInactivityTimer();
    const mode = captureModeRef.current;
    if (mode === "presence" || mode === "end-confirmation") {
      if (decideVoiceSessionResponse(transcript) === "end") {
        endVoiceSession();
      } else {
        setAwaitingPresence(false);
        captureModeRef.current = "message";
        setIsVoiceSessionActive(true);
        const continuation = "I’m still here. What else can I help you with?";
        onAssistantVoiceMessage?.(continuation);
        speakText(continuation, () => {
          if (getRecognitionConstructor()) window.setTimeout(() => startNativeListening("message"), 250);
        });
      }
      return;
    }
    shouldSpeakNextReplyRef.current = true;
    setIsVoiceSessionActive(true);
    voiceSessionActiveRef.current = true;
    onTranscript(transcript);
  };

  const startNativeListening = (mode: CaptureMode = "message") => {
    const VoiceRecognition = getRecognitionConstructor();
    if (!VoiceRecognition) return;
    clearInactivityTimer();
    captureModeRef.current = mode;
    nativeSubmittedRef.current = false;
    setError(null);
    setNotice(null);
    const recognition = new VoiceRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = nativeRecognitionLocale(language);
    recognition.onresult = event => {
      const transcript = Array.from(event.results).map(result => result[0]?.transcript ?? "").join(" ").trim();
      if (transcript && !nativeSubmittedRef.current) {
        nativeSubmittedRef.current = true;
        handleVoiceTranscript(transcript);
      }
    };
    recognition.onerror = event => {
      setIsListening(false);
      if (isEmptySpeechRecognitionError(event.error)) {
        setAwaitingPresence(false);
        captureModeRef.current = "message";
        setNotice(emptySpeechRetryNotice());
        stopMicrophoneLevelMeter();
        if (voiceSessionActiveRef.current && mode === "message") scheduleInactivityCheck();
        return;
      }
      setAwaitingPresence(false);
      setError(event.error === "not-allowed" ? "Microphone permission is required to use voice input." : "Nova could not hear that. Please try again or type your response.");
    };
    recognition.onend = () => {
      setIsListening(false);
      stopMicrophoneLevelMeter();
      if (!nativeSubmittedRef.current && mode === "message") {
        setNotice(emptySpeechRetryNotice());
        if (voiceSessionActiveRef.current) scheduleInactivityCheck();
      }
    };
    recognitionRef.current = recognition;
    setIsListening(true);
    void startNativeMicrophoneLevelMeter();
    try {
      recognition.start();
    } catch {
      setIsListening(false);
      stopMicrophoneLevelMeter();
      setError("Nova could not start voice input. Please try again or type your response.");
    }
  };

  const startFallbackRecording = async (mode: CaptureMode = "message") => {
    try {
      clearInactivityTimer();
      captureModeRef.current = mode;
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
        stopSilenceDetector();
        setIsRecordingFallback(false);
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) return setError("Nova did not receive an audio recording. Please try again.");
        if (blob.size > 8 * 1024 * 1024) return setError("The recording is too large. Keep voice messages under one minute.");
        try {
          const audioBase64 = await toBase64(blob);
          transcribeVoice.mutate({ audioBase64, mimeType: (recorder.mimeType || "audio/webm") as "audio/webm", language });
        } catch {
          setError("Nova could not prepare that recording. Please try again or type your message.");
        }
      };
      recorderRef.current = recorder;
      setRemainingSeconds(FALLBACK_RECORDING_SECONDS);
      recorder.start();
      setIsRecordingFallback(true);
      const AudioContextConstructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextConstructor) {
        const context = new AudioContextConstructor();
        audioContextRef.current = context;
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        context.createMediaStreamSource(stream).connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        const startedAt = Date.now();
        let lastSpeechAt: number | null = null;
        const watchForSilence = () => {
          analyser.getByteTimeDomainData(samples);
          const averageAmplitude = samples.reduce((total, sample) => total + Math.abs(sample - 128), 0) / samples.length;
          setMicrophoneLevel(normalizeMicrophoneLevel(samples));
          const now = Date.now();
          if (averageAmplitude > 2.6) lastSpeechAt = now;
          const hasNaturalPause = shouldAutoSubmitAfterPause({ elapsedMs: now - startedAt, silenceMs: lastSpeechAt === null ? 0 : now - lastSpeechAt, hasDetectedSpeech: lastSpeechAt !== null });
          if (hasNaturalPause && recorder.state !== "inactive") {
            recorder.stop();
            return;
          }
          silenceFrameRef.current = window.requestAnimationFrame(watchForSilence);
        };
        silenceFrameRef.current = window.requestAnimationFrame(watchForSilence);
      }
    } catch {
      setAwaitingPresence(false);
      setError("Microphone permission is required to record a voice message.");
    }
  };

  const beginHandsFreeVoiceSession = (openingPrompt?: string) => {
    clearInactivityTimer();
    clearResumeListeningTimer();
    hasStartedOpeningPromptRef.current = true;
    setError(null);
    setNotice(null);
    setIsVoiceSessionActive(true);
    voiceSessionActiveRef.current = true;
    setPersistedHandsFreeSession(true);
    onVoiceSessionStart?.();
    const prompt = openingPrompt?.trim();
    if (prompt) {
      onAssistantVoiceMessage?.(prompt);
      speakText(prompt, () => {
        if (getRecognitionConstructor()) window.setTimeout(() => startNativeListening("message"), 250);
      });
      return;
    }
    if (capability === "native") startNativeListening("message");
    else startFallbackRecording("message");
  };

  const requestInactivityCheck = () => {
    const runtime = voiceRuntimeRef.current;
    if (!shouldPromptForVoiceInactivity({ elapsedMs: VOICE_INACTIVITY_MS, sessionActive: voiceSessionActiveRef.current, awaitingResponse: runtime.awaitingPresence, isListening: runtime.isListening, isRecording: runtime.isRecordingFallback, isTranscribing: runtime.isTranscribing, isSpeaking: runtime.isSpeaking, resumePending: resumeListeningTimerRef.current !== null })) return;
    setAwaitingPresence(true);
    captureModeRef.current = "presence";
    const prompt = "Are you still there? Say yes to continue, or say no if you do not need anything else and I will end your session.";
    const spokenPrompt = capability === "native" ? prompt : `${prompt} Use Record for Nova to reply.`;
    onAssistantVoiceMessage?.(spokenPrompt);
    if (capability === "native") {
      speakText(prompt, () => window.setTimeout(() => startNativeListening("presence"), 250));
    } else {
      speakText(spokenPrompt);
    }
  };

  const scheduleInactivityCheck = () => {
    clearInactivityTimer();
    if (!voiceSessionActiveRef.current) return;
    inactivityTimerRef.current = window.setTimeout(() => requestInactivityCheck(), VOICE_INACTIVITY_MS);
  };

  const requestVoiceSessionEnd = () => {
    clearInactivityTimer();
    setAwaitingPresence(true);
    captureModeRef.current = "end-confirmation";
    const prompt = "Would you like to end your care session? Say no to confirm ending the session, or say yes to continue.";
    const spokenPrompt = capability === "native" ? prompt : `${prompt} Use Record for Nova to reply.`;
    onAssistantVoiceMessage?.(spokenPrompt);
    if (capability === "native") {
      speakText(prompt, () => window.setTimeout(() => startNativeListening("end-confirmation"), 250));
    } else {
      speakText(spokenPrompt);
    }
  };

  const transcribeVoice = trpc.care.transcribeVoice.useMutation({
    onSuccess: result => {
      if (!result.text) {
        setError("Nova could not detect speech in that recording. Please try again.");
      } else {
        handleVoiceTranscript(result.text);
      }
    },
    onError: () => setError("Nova could not transcribe that recording. Please try again or type your message."),
  });

  useEffect(() => {
    const hasNativeRecognition = Boolean(getRecognitionConstructor());
    const hasFallbackRecording = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
    setCapability(detectVoiceCapability({ hasNativeRecognition, hasFallbackRecording }));
    return () => {
      recognitionRef.current?.stop();
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach(track => track.stop());
      stopSilenceDetector();
      stopMicrophoneLevelMeter();
      clearInactivityTimer();
      clearResumeListeningTimer();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    voiceSessionActiveRef.current = isVoiceSessionActive;
  }, [isVoiceSessionActive]);

  useEffect(() => {
    voiceRuntimeRef.current = { isListening, isRecordingFallback, isTranscribing: transcribeVoice.isPending, isSpeaking, awaitingPresence, isEndingSession };
  }, [isListening, isRecordingFallback, transcribeVoice.isPending, isSpeaking, awaitingPresence, isEndingSession]);

  useEffect(() => {
    if ((!autoStartVoiceSession && !hasPersistedHandsFreeSession()) || hasStartedOpeningPromptRef.current) return;
    hasStartedOpeningPromptRef.current = true;
    beginHandsFreeVoiceSession(initialVoicePrompt ?? "You are verified. What can I help you with today?");
  }, [autoStartVoiceSession, initialVoicePrompt]);

  useEffect(() => {
    if (!isRecordingFallback) return;
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const remaining = remainingRecordingSeconds(startedAt);
      setRemainingSeconds(remaining);
      if (remaining === 0) recorderRef.current?.stop();
    }, 250);
    return () => window.clearInterval(interval);
  }, [isRecordingFallback]);

  useEffect(() => {
    if (!reply || !shouldSpeakNextReplyRef.current || lastVoicePlayedReplyRef.current === reply) return;
    shouldSpeakNextReplyRef.current = false;
    lastVoicePlayedReplyRef.current = reply;
    speakText(reply, () => {
      if (voiceSessionActiveRef.current && getRecognitionConstructor()) {
        clearResumeListeningTimer();
        resumeListeningTimerRef.current = window.setTimeout(() => {
          resumeListeningTimerRef.current = null;
          startNativeListening("message");
        }, 250);
      }
    });
  }, [reply]);

  const isRecording = isListening || isRecordingFallback;
  const isTranscribing = transcribeVoice.isPending;
  const countdown = formatRecordingCountdown(remainingSeconds);
  const activeMeterBars = activeMicrophoneBars(microphoneLevel);
  const support = capability === "native"
    ? { label: "Native voice input ready", detail: "Nova submits speech after you naturally pause.", className: "text-[#005a48]" }
    : capability === "fallback"
      ? { label: "Server transcription fallback ready", detail: "Nova stops and transcribes a short recording after a pause.", className: "text-[#9a5d00]" }
      : capability === "unavailable"
        ? { label: "Voice input unavailable", detail: "Use typed chat in this browser.", className: "text-[#7d2c1d]" }
        : { label: "Checking voice support", detail: "Nova is checking this browser.", className: "text-black/50" };

  return <div className={cn("mt-3 flex flex-wrap items-center gap-2", className)}>
    <p className={cn("basis-full flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]", support.className)}>
      {capability === "unavailable" ? <CircleAlert className="size-3.5" /> : <CircleCheck className="size-3.5" />} {support.label}
      <span className="font-normal normal-case tracking-normal text-black/50">· {support.detail}</span>
    </p>
    <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-black/55">
      Transcription language
      <select value={language} onChange={event => setLanguage(event.target.value as TranscriptionLanguage)} disabled={isRecording || isTranscribing} className="h-7 border border-black/25 bg-transparent px-2 text-[11px] font-normal normal-case tracking-normal text-black outline-none focus:border-[#005a48]">
        {languageOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
    <Button type="button" variant="outline" size="sm" disabled={disabled || capability === "checking" || capability === "unavailable" || isTranscribing || isRecording || isEndingSession} onClick={() => beginHandsFreeVoiceSession(initialVoicePrompt)} className={cn("rounded-none border-black/25 bg-transparent text-[10px] uppercase tracking-[0.12em]", isRecording && "border-[#005a48] bg-[#e7f1eb] text-[#005a48]")}> 
      {isTranscribing ? <><Loader2 className="mr-1.5 size-3 animate-spin" />Transcribing</> : isRecording ? <><Loader2 className="mr-1.5 size-3 animate-spin" />Listening</> : <><Mic className="mr-1.5 size-3" />{capability === "fallback" ? "Record for Nova" : "Speak to Nova"}</>}
    </Button>
    {isVoiceSessionActive && <Button type="button" variant="ghost" size="sm" disabled={isRecording || isEndingSession} onClick={requestVoiceSessionEnd} className="rounded-none text-[10px] uppercase tracking-[0.12em] text-black/60 hover:bg-transparent hover:text-[#b55239]"><PhoneOff className="mr-1.5 size-3" />End session</Button>}
    {isRecording && <div role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={microphoneLevel} className="flex h-7 items-end gap-0.5 border-l border-[#005a48]/25 pl-2" title={`Microphone level ${microphoneLevel}%`}>
      {activeMeterBars.map((isActive, index) => <span key={index} className={cn("w-1 rounded-sm transition-all duration-100", isActive ? "bg-[#005a48]" : "bg-[#005a48]/15")} style={{ height: `${7 + index * 2}px`, opacity: isActive ? 1 : 0.45 }} />)}
    </div>}
    {isListening && <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#005a48]">Listening · Nova sends when you pause…</span>}
    {isRecordingFallback && <div className="flex basis-full items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7d2c1d]" role="status" aria-live="polite"><span>Recording · {countdown} left</span><span className="h-1.5 w-32 overflow-hidden bg-[#b55239]/15"><span className="block h-full bg-[#b55239] transition-[width] duration-200" style={{ width: `${(remainingSeconds / FALLBACK_RECORDING_SECONDS) * 100}%` }} /></span><span className="font-normal normal-case tracking-normal text-black/50">Nova sends automatically after a brief pause.</span></div>}
    {awaitingPresence && <p role="status" className="basis-full border-l-2 border-[#005a48] pl-3 text-xs leading-5 text-[#005a48]">Nova is checking whether you need anything else. Say “no” to end your session, or “yes” to continue.</p>}
    {isEndingSession && <p role="status" className="basis-full border-l-2 border-[#005a48] pl-3 text-xs leading-5 text-[#005a48]">Nova is ending your session. Goodbye.</p>}
    {notice && <p role="status" className="basis-full border-l-2 border-[#005a48] pl-3 text-xs leading-5 text-[#005a48]">{notice}</p>}
    {error && <p role="status" className="basis-full border-l-2 border-[#b55239] pl-3 text-xs leading-5 text-[#7d2c1d]">{error}</p>}
  </div>;
}
