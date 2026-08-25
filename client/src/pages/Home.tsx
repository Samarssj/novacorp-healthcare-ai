import { AIChatBox, type Message } from "@/components/AIChatBox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import type { AgentActivity, AppointmentSlot, BookingConfirmation, CoordinatorResult, PolicyEvidence } from "@shared/novacorp";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  HeartPulse,
  Loader2,
  MapPin,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

const suggestedPrompts = [
  "Does my NovaCorp Gold Plus plan cover an orthopedic consultation?",
  "What is my specialist copay and earliest orthopedic appointment?",
  "Does my plan cover knee replacement surgery?",
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="nova-label">{children}</p>;
}

function ActivityItem({ item, isLast }: { item: AgentActivity; isLast?: boolean }) {
  const isActive = item.state === "active";
  const isError = item.state === "error";
  return (
    <div className="relative flex gap-3 pb-5 last:pb-0">
      {!isLast && <span className="absolute left-[9px] top-[19px] h-[calc(100%-5px)] border-l border-dashed border-black/20" />}
      <span className={`relative z-10 mt-0.5 grid size-5 place-items-center rounded-full border ${isError ? "border-red-800 bg-red-100 text-red-800" : isActive ? "border-[#005a48] bg-[#dff0e9] text-[#005a48]" : "border-black/25 bg-[#f7f3ec] text-black"}`}>
        {isActive ? <Loader2 className="size-3 animate-spin" /> : isError ? <X className="size-3" /> : <Check className="size-3" />}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="font-editorial text-[17px] leading-none">{item.agent}</p>
          <span className="text-[10px] uppercase tracking-[0.17em] text-black/45">{item.action}</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-black/60">{item.detail}</p>
      </div>
    </div>
  );
}

function EvidenceCard({ evidence }: { evidence: PolicyEvidence[] }) {
  return (
    <section className="nova-panel bg-[#efeae0]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <SectionLabel>Policy evidence</SectionLabel>
          <h2 className="mt-2 font-editorial text-2xl">Retrieved, not assumed.</h2>
        </div>
        <FileText className="size-5 text-[#005a48]" />
      </div>
      <div className="mt-6 space-y-4">
        {evidence.length === 0 ? (
          <div className="border-l-2 border-[#b55239] pl-4 py-1">
            <p className="font-editorial text-lg">No evidence retrieved</p>
            <p className="mt-1 text-xs leading-5 text-black/60">NovaCorp Health cannot make a policy or coverage claim until relevant fictional evidence is returned.</p>
          </div>
        ) : evidence.map((item) => (
          <article key={item.id} className="border-t border-black/15 pt-4 first:border-t-0 first:pt-0">
            <div className="flex items-start justify-between gap-3">
              <p className="max-w-[75%] text-[10px] font-semibold uppercase tracking-[0.16em] text-[#005a48]">{item.document}</p>
              <Badge variant="outline" className="rounded-none border-black/25 bg-transparent px-2 py-1 text-[10px] font-normal tracking-wide">{Math.round(item.relevance * 100)}% relevant</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-black/75">“{item.excerpt}”</p>
            <p className="mt-3 text-[10px] uppercase tracking-[0.12em] text-black/45">{item.section} · p. {item.page}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function AppointmentPanel({
  bookingDraft,
  confirmation,
  onAskToBook,
  onConfirm,
  onDismiss,
}: {
  bookingDraft?: AppointmentSlot;
  confirmation?: BookingConfirmation | null;
  onAskToBook: () => void;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  if (confirmation) {
    return (
      <section className="nova-panel border-[#005a48]/40 bg-[#e7f1eb]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <SectionLabel>Appointment outcome</SectionLabel>
            <h2 className="mt-2 font-editorial text-2xl">Booking confirmed</h2>
          </div>
          <Check className="mt-1 size-5 text-[#005a48]" />
        </div>
        <p className="mt-4 text-sm leading-6"><strong>{confirmation.clinician}</strong> · {confirmation.specialty}<br />{confirmation.dayLabel} at {confirmation.timeLabel}</p>
        <p className="mt-4 border-t border-[#005a48]/20 pt-3 text-[10px] uppercase tracking-[0.15em] text-[#005a48]">Confirmation {confirmation.confirmationCode}</p>
      </section>
    );
  }

  if (!bookingDraft) return null;

  return (
    <section className="nova-panel border-[#b55239]/45 bg-[#fbf1e9]">
      <SectionLabel>Action requires confirmation</SectionLabel>
      <h2 className="mt-2 font-editorial text-2xl">Review before booking</h2>
      <div className="mt-5 border-y border-[#b55239]/25 py-4 text-sm leading-6">
        <p className="font-semibold">{bookingDraft.clinician} · {bookingDraft.specialty}</p>
        <p>{bookingDraft.dayLabel} at {bookingDraft.timeLabel}</p>
        <p className="mt-1 text-black/60">{bookingDraft.location}</p>
      </div>
      <p className="mt-4 text-xs leading-5 text-black/65">This is fictional demo data. No appointment is booked until you explicitly confirm this exact slot.</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={onAskToBook} className="rounded-none bg-[#161513] px-4 text-xs uppercase tracking-[0.12em] hover:bg-[#005a48]">Confirm demo booking <ChevronRight className="ml-1 size-3" /></Button>
        <Button variant="outline" onClick={onDismiss} className="rounded-none border-black/25 bg-transparent text-xs uppercase tracking-[0.12em]">Not now</Button>
      </div>
      <p className="mt-3 text-[10px] uppercase tracking-[0.11em] text-[#b55239]">Explicit confirmation is required</p>
    </section>
  );
}

export default function Home() {
  const workspaceQuery = trpc.care.getWorkspace.useQuery();
  const [messages, setMessages] = useState<Message[]>([]);
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [evidence, setEvidence] = useState<PolicyEvidence[]>([]);
  const [bookingDraft, setBookingDraft] = useState<AppointmentSlot | undefined>();
  const [bookingConfirmation, setBookingConfirmation] = useState<BookingConfirmation | null>(null);
  const [bookingReviewOpen, setBookingReviewOpen] = useState(false);
  const [cancellationReviewOpen, setCancellationReviewOpen] = useState(false);
  const [cancellationMessage, setCancellationMessage] = useState<string | null>(null);
  const [coordinatorMode, setCoordinatorMode] = useState<"gemini" | "safe-fallback">("safe-fallback");
  const [isChatPending, setIsChatPending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const patient = workspaceQuery.data?.patient;
  const displayedActivities = activities.length > 0 ? activities : (workspaceQuery.data?.initialActivity ?? []);
  const displayedEvidence = evidence.length > 0 ? evidence : (workspaceQuery.data?.policyEvidence ?? []);

  const sendChatMessage = (message: string) => {
    if (isChatPending) return;
    setMessages(current => [...current, { role: "user", content: message }]);
    setChatError(null);
    setIsChatPending(true);
    const stream = new EventSource(`/api/novacorp/chat-stream?message=${encodeURIComponent(message)}`);
    stream.addEventListener("activity", event => {
      setActivities(JSON.parse((event as MessageEvent<string>).data) as AgentActivity[]);
    });
    stream.addEventListener("result", event => {
      const result = JSON.parse((event as MessageEvent<string>).data) as CoordinatorResult;
      stream.close();
      setMessages(current => [...current, { role: "assistant", content: result.reply }]);
      setActivities(result.activities);
      setEvidence(result.evidence);
      setBookingDraft(result.bookingDraft);
      setCoordinatorMode(result.coordinatorMode);
      setIsChatPending(false);
    });
    stream.addEventListener("error", event => {
      const errorMessage = (event as MessageEvent<string>).data ? (() => {
        try { return JSON.parse((event as MessageEvent<string>).data).message as string; } catch { return "The fictional demo coordinator could not complete this request."; }
      })() : "The fictional demo coordinator could not complete this request.";
      stream.close();
      setChatError(errorMessage);
      setActivities([{ agent: "Coordinator", action: "Unable to respond", state: "error", detail: errorMessage }]);
      setIsChatPending(false);
    });
  };

  const bookingMutation = trpc.care.confirmBooking.useMutation({
    onSuccess: (result) => {
      setBookingConfirmation(result);
      setBookingReviewOpen(false);
      setBookingDraft(undefined);
      setMessages(current => [...current, { role: "assistant", content: `**NovaCorp Health fictional-demo-data booking confirmed**\n\n${result.clinician} · ${result.specialty}\n${result.dayLabel} at ${result.timeLabel}\n\nConfirmation: **${result.confirmationCode}**` }]);
    },
  });

  const cancellationMutation = trpc.care.confirmCancellation.useMutation({
    onSuccess: (result) => {
      setCancellationReviewOpen(false);
      setCancellationMessage(`Fictional demo cancellation confirmed for ${result.clinician} on ${result.dateLabel} at ${result.timeLabel}. Reference: ${result.confirmationCode}.`);
    },
  });

  const isWorking = isChatPending || bookingMutation.isPending || cancellationMutation.isPending;
  const cancelError = cancellationMutation.error?.message;
  const bookingError = bookingMutation.error?.message;

  const greeting = useMemo(() => `Good afternoon${patient ? `, ${patient.name.split(" ")[0]}` : ""}.`, [patient]);

  if (workspaceQuery.isLoading) {
    return <div className="min-h-screen bg-[#f7f3ec] p-6 lg:p-12"><Skeleton className="mx-auto h-[70vh] max-w-7xl rounded-none bg-black/10" /></div>;
  }

  if (workspaceQuery.error || !patient) {
    return <div className="grid min-h-screen place-items-center bg-[#f7f3ec] p-6"><div className="max-w-md border border-red-900/35 bg-[#fbf1e9] p-6"><CircleAlert className="size-5 text-red-800" /><h1 className="mt-4 font-editorial text-3xl">Demo workspace unavailable</h1><p className="mt-2 text-sm leading-6 text-black/65">The fictional NovaCorp workspace could not load. Refresh and try again.</p></div></div>;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f7f3ec] text-[#191815] selection:bg-[#d7e8dc] selection:text-[#191815]">
      <div className="mx-auto max-w-[1520px] px-5 py-5 sm:px-8 lg:px-12 lg:py-8">
        <header className="border-b border-black/30 pb-5">
          <div className="flex items-center justify-between gap-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-black/65">
            <div className="flex items-center gap-3"><HeartPulse className="size-4 text-[#005a48]" /> NovaCorp Health <span className="hidden text-black/35 sm:inline">/ Patient care workspace</span></div>
            <div className="flex items-center gap-3"><span className="size-1.5 rounded-full bg-[#005a48]" /> Secure fictional environment</div>
          </div>
        </header>

        <div className="mt-5 flex items-start gap-3 border border-[#b55239]/35 bg-[#fbf1e9] px-4 py-3 text-xs leading-5 text-black/70">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-[#b55239]" />
          <p><strong className="font-semibold text-black">Fictional demo data only.</strong> NovaCorp Health, its policies, patient information, clinicians, availability, and outcomes are simulated for demonstration. Do not use this workspace for medical, insurance, or real appointment decisions.</p>
        </div>

        <section className="grid gap-8 border-b border-black/30 py-10 lg:grid-cols-12 lg:gap-10 lg:py-14">
          <div className="lg:col-span-3 lg:pt-3"><SectionLabel>Care coordination · 01</SectionLabel><p className="mt-4 max-w-[16rem] font-editorial text-xl leading-7 text-black/65">A closer reading of the care journey.</p></div>
          <div className="lg:col-span-6"><h1 className="font-editorial text-[clamp(3.35rem,8.5vw,8.35rem)] font-semibold leading-[0.83] tracking-[-0.065em]">Care, <em className="font-normal text-[#005a48]">considered.</em></h1></div>
          <div className="flex flex-col justify-between lg:col-span-3 lg:pt-3"><p className="max-w-xs text-sm leading-6 text-black/62">A grounded, evidence-led workspace for navigating fictional NovaCorp Health benefits, appointments, and patient context.</p><div className="mt-8 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em]"><Sparkles className="size-3 text-[#005a48]" /> Gemini-powered, guardrailed</div></div>
        </section>

        <main className="grid gap-8 py-9 lg:grid-cols-12 lg:gap-x-10 lg:gap-y-9">
          <section className="lg:col-span-7">
            <div className="flex items-end justify-between gap-5 border-b border-black/30 pb-4">
              <div><SectionLabel>Assistant</SectionLabel><h2 className="mt-2 font-editorial text-[clamp(2rem,3vw,3rem)] leading-none">{greeting}</h2></div>
              <Badge variant="outline" className={`mb-1 rounded-none border-black/25 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] ${coordinatorMode === "gemini" ? "text-[#005a48]" : "text-black/55"}`}>{coordinatorMode === "gemini" ? "Gemini validated" : "Safe response mode"}</Badge>
            </div>
            <p className="mt-4 max-w-2xl font-editorial text-xl leading-7 text-black/62">Ask about the fictional plan, retrieved policy evidence, or available appointments. The assistant can only answer from approved tool outputs.</p>
            <div className="mt-6">
              <AIChatBox
                messages={messages}
                onSendMessage={sendChatMessage}
                isLoading={isWorking}
                suggestedPrompts={suggestedPrompts}
                placeholder="Ask about fictional benefits or appointments…"
                emptyStateMessage="Begin with a grounded question."
                height="510px"
                className="!rounded-none !border-black/30 !bg-[#fcfaf6] !shadow-none"
              />
            </div>
            {chatError && <p role="alert" className="mt-3 border-l-2 border-red-800 pl-3 text-xs leading-5 text-red-800">{chatError} No booking or policy conclusion was made.</p>}
          </section>

          <aside className="space-y-8 lg:col-span-5">
            <section className="nova-panel">
              <div className="flex items-start justify-between gap-5"><div><SectionLabel>Patient summary</SectionLabel><h2 className="mt-2 font-editorial text-3xl">{patient.name}</h2><p className="mt-1 text-xs uppercase tracking-[0.14em] text-black/50">Member {patient.memberId}</p></div><span className="grid size-12 place-items-center rounded-full bg-[#005a48] font-editorial text-lg text-white">{patient.initials}</span></div>
              <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-5 border-y border-black/15 py-5 text-sm"><div><p className="nova-label">Plan</p><p className="mt-1 font-editorial text-lg">{patient.plan}</p></div><div><p className="nova-label">Status</p><p className="mt-1 flex items-center gap-1.5 font-editorial text-lg"><span className="size-1.5 rounded-full bg-[#005a48]" /> {patient.planStatus}</p></div><div><p className="nova-label">Specialist copay</p><p className="mt-1 font-editorial text-lg">{patient.specialistCopay}</p></div><div><p className="nova-label">Deductible left</p><p className="mt-1 font-editorial text-lg">{patient.deductibleRemaining}</p></div></div>
              <div className="mt-5 grid gap-5 sm:grid-cols-2"><div><p className="nova-label">Medications</p><ul className="mt-2 space-y-1.5 text-xs leading-5 text-black/70">{patient.medications.map(medication => <li key={medication.name}><strong className="text-black">{medication.name}</strong><br />{medication.dosage}</li>)}</ul></div><div><p className="nova-label">Allergies</p><div className="mt-2 flex flex-wrap gap-1.5">{patient.allergies.map(allergy => <Badge key={allergy} variant="outline" className="rounded-none border-[#b55239]/35 bg-[#fbf1e9] text-[10px] font-normal text-[#7d2c1d]">{allergy}</Badge>)}</div></div></div>
            </section>

            <section className="nova-panel bg-[#dcece4]">
              <div className="flex items-start justify-between"><div><SectionLabel>Upcoming appointment</SectionLabel><h2 className="mt-2 font-editorial text-2xl">{patient.upcomingAppointment.clinician}</h2></div><Stethoscope className="size-5 text-[#005a48]" /></div>
              <p className="mt-3 text-sm text-black/70">{patient.upcomingAppointment.specialty}</p>
              <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-y border-[#005a48]/20 py-3 text-xs text-black/70"><span className="flex items-center gap-1.5"><Clock3 className="size-3.5 text-[#005a48]" /> {patient.upcomingAppointment.dateLabel} · {patient.upcomingAppointment.timeLabel}</span><span className="flex items-center gap-1.5"><MapPin className="size-3.5 text-[#005a48]" /> Demo clinic</span></div>
              {!cancellationReviewOpen && !cancellationMessage && <button onClick={() => setCancellationReviewOpen(true)} className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#005a48] underline-offset-4 hover:underline">Manage fictional appointment <ArrowUpRight className="ml-0.5 inline size-3" /></button>}
              {cancellationReviewOpen && <div className="mt-4 border-t border-[#005a48]/20 pt-4"><p className="text-xs leading-5 text-black/70">Cancelling is consequential, even in this demo. Confirm you want to cancel this exact fictional appointment.</p><div className="mt-3 flex gap-2"><Button size="sm" onClick={() => cancellationMutation.mutate({ patientId: "patient-demo-001", appointmentId: "appointment-demo-pcp-01", confirmed: true })} disabled={isWorking} className="rounded-none bg-[#161513] text-[10px] uppercase tracking-[0.11em] hover:bg-[#b55239]">Confirm cancellation</Button><Button size="sm" variant="outline" onClick={() => setCancellationReviewOpen(false)} className="rounded-none border-black/25 bg-transparent text-[10px] uppercase tracking-[0.11em]">Keep it</Button></div>{cancelError && <p role="alert" className="mt-2 text-xs text-red-800">{cancelError}</p>}</div>}
              {cancellationMessage && <p className="mt-4 border-t border-[#005a48]/20 pt-4 text-xs leading-5 text-[#005a48]">{cancellationMessage}</p>}
            </section>

            <AppointmentPanel bookingDraft={bookingDraft} confirmation={bookingConfirmation} onAskToBook={() => setBookingReviewOpen(true)} onConfirm={() => bookingDraft && bookingMutation.mutate({ patientId: "patient-demo-001", slotId: bookingDraft.id, confirmed: true })} onDismiss={() => setBookingDraft(undefined)} />
            {bookingReviewOpen && bookingDraft && <div className="border border-[#005a48]/40 bg-[#e7f1eb] p-5"><SectionLabel>Final confirmation</SectionLabel><p className="mt-2 font-editorial text-xl">Book the displayed fictional slot?</p><p className="mt-2 text-xs leading-5 text-black/65">This action is confirmation-gated. Selecting “Book now” sends only the displayed slot ID to the validated demo tool.</p><div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => bookingMutation.mutate({ patientId: "patient-demo-001", slotId: bookingDraft.id, confirmed: true })} disabled={isWorking} className="rounded-none bg-[#005a48] text-xs uppercase tracking-[0.12em] hover:bg-[#003d32]">Book now</Button><Button variant="outline" onClick={() => setBookingReviewOpen(false)} className="rounded-none border-black/25 bg-transparent text-xs uppercase tracking-[0.12em]">Go back</Button></div>{bookingError && <p role="alert" className="mt-3 text-xs text-red-800">{bookingError}</p>}</div>}

            <EvidenceCard evidence={displayedEvidence} />

            <section className="nova-panel">
              <div className="flex items-start justify-between"><div><SectionLabel>Live agent activity</SectionLabel><h2 className="mt-2 font-editorial text-2xl">The reading room</h2></div><ShieldCheck className="size-5 text-[#005a48]" /></div>
              <div className="mt-6">{displayedActivities.map((item, index) => <ActivityItem key={`${item.agent}-${index}-${item.action}`} item={item} isLast={index === displayedActivities.length - 1} />)}</div>
            </section>
          </aside>
        </main>

        <footer className="flex flex-col justify-between gap-3 border-t border-black/30 py-5 text-[10px] uppercase tracking-[0.14em] text-black/45 sm:flex-row"><p>NovaCorp Health · Fictional demonstration workspace</p><p>Grounded responses use retrieved evidence and approved operations only</p></footer>
      </div>
    </div>
  );
}
