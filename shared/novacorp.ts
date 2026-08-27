export type AgentName = "Coordinator" | "Patient Agent" | "Insurance RAG" | "Appointment Agent" | "Summary Agent";

export type ActivityState = "complete" | "active" | "waiting" | "error";

export type AgentActivity = {
  agent: AgentName;
  action: string;
  state: ActivityState;
  detail: string;
};

export type PolicyEvidence = {
  id: string;
  document: string;
  section: string;
  page: number;
  plan: string;
  relevance: number;
  excerpt: string;
};

export type AppointmentSlot = {
  id: string;
  clinician: string;
  specialty: string;
  dayLabel: string;
  timeLabel: string;
  location: string;
};

export type BookingConfirmation = AppointmentSlot & {
  confirmationCode: string;
  status: "confirmed";
};

export type CareWorkspace = {
  patient: {
    id: string;
    name: string;
    initials: string;
    dateOfBirth: string;
    plan: string;
    memberId: string;
    planStatus: "Active" | "Inactive";
    specialistCopay: string;
    deductibleRemaining: string;
    address: PostalAddress;
    memberCard?: MemberCard;
    medications: Array<{ name: string; dosage: string }>;
    allergies: string[];
    upcomingAppointment?: {
      id: string;
      clinician: string;
      specialty: string;
      dateLabel: string;
      timeLabel: string;
    };
  };
  policyEvidence: PolicyEvidence[];
  appointmentSlots: AppointmentSlot[];
  initialActivity: AgentActivity[];
};

export type PostalAddress = {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type MemberCard = {
  cardNumber: string;
  issuedAt: string;
  status: "active";
};

export type LostMemberCardRequest = {
  reference: string;
  status: "submitted";
  submittedAt: string;
};

export type CoordinatorResult = {
  reply: string;
  activities: AgentActivity[];
  evidence: PolicyEvidence[];
  slots: AppointmentSlot[];
  needsConfirmation: boolean;
  bookingDraft?: AppointmentSlot;
  coordinatorMode: "adk" | "safe-fallback";
};
