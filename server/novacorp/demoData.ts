import type { AppointmentSlot, CareWorkspace, PolicyEvidence } from "@shared/novacorp";

const ORTHOPEDIC_CONSULTATION: PolicyEvidence = {
  id: "policy-orthopedic-consultation",
  document: "NovaCorp Gold Plus Member Handbook",
  section: "Specialist office consultations",
  page: 42,
  plan: "NovaCorp Gold Plus",
  relevance: 0.94,
  excerpt:
    "For eligible NovaCorp Gold Plus members, medically necessary specialist office consultations are covered after the applicable specialist office-visit copay. Referral rules must be verified against the member's current plan record.",
};

const JOINT_REPLACEMENT: PolicyEvidence = {
  id: "policy-joint-replacement",
  document: "NovaCorp Orthopedic Coverage Policy",
  section: "Joint replacement review",
  page: 16,
  plan: "NovaCorp Gold Plus",
  relevance: 0.91,
  excerpt:
    "Knee replacement procedures require prior authorization and clinical review. Coverage remains subject to plan eligibility and member cost share. This excerpt does not establish approval for an individual case.",
};

const APPOINTMENT_SLOTS: AppointmentSlot[] = [
  {
    id: "orthopedics-early-01",
    clinician: "Dr. Mara Leung",
    specialty: "Orthopedics",
    dayLabel: "Tomorrow",
    timeLabel: "8:40 AM",
    location: "NovaCorp Health Demo Clinic · North Pavilion",
  },
  {
    id: "orthopedics-early-02",
    clinician: "Dr. Julian Reyes",
    specialty: "Orthopedics",
    dayLabel: "Tomorrow",
    timeLabel: "10:20 AM",
    location: "NovaCorp Health Demo Clinic · North Pavilion",
  },
];

export const demoWorkspace: CareWorkspace = {
  patient: {
    id: "patient-demo-001",
    name: "Avery Carter",
    initials: "AC",
    dateOfBirth: "May 18, 1988",
    plan: "NovaCorp Gold Plus",
    memberId: "NCG-DEMO-48219",
    planStatus: "Active",
    specialistCopay: "$55",
    deductibleRemaining: "$245",
    address: { line1: "18 North Harbor Way", city: "Riverton", state: "CA", postalCode: "90210", country: "United States" },
    medications: [
      { name: "Lisinopril", dosage: "10 mg · once daily" },
      { name: "Vitamin D3", dosage: "1,000 IU · once daily" },
    ],
    allergies: ["Penicillin", "Shellfish"],
    upcomingAppointment: {
      id: "appointment-demo-pcp-01",
      clinician: "Dr. Elena Park",
      specialty: "Primary care",
      dateLabel: "September 3",
      timeLabel: "2:15 PM",
    },
  },
  policyEvidence: [ORTHOPEDIC_CONSULTATION, JOINT_REPLACEMENT],
  appointmentSlots: APPOINTMENT_SLOTS,
  initialActivity: [
    {
      agent: "Coordinator",
      action: "Workspace initialized",
      state: "complete",
      detail: "Approved care operations are ready.",
    },
    {
      agent: "Patient Agent",
      action: "Patient record ready",
      state: "complete",
      detail: "Typed patient profile loaded for Avery Carter.",
    },
    {
      agent: "Insurance RAG",
      action: "Evidence index ready",
      state: "complete",
      detail: "Two NovaCorp Gold Plus policy excerpts are indexed.",
    },
    {
      agent: "Appointment Agent",
      action: "Availability service ready",
      state: "complete",
      detail: "Booking remains confirmation-gated.",
    },
  ],
};

export function getDemoPatient() {
  return demoWorkspace.patient;
}

export function searchPolicyEvidence(query: string): PolicyEvidence[] {
  const normalized = query.toLowerCase();
  const matchesOrthopedics = /knee|orthopedic|orthopaedic|specialist|consultation|surger|replacement/.test(normalized);
  if (!matchesOrthopedics) return [];

  if (/replacement|surger/.test(normalized)) {
    return [JOINT_REPLACEMENT, ORTHOPEDIC_CONSULTATION];
  }

  return [ORTHOPEDIC_CONSULTATION];
}

export function searchPolicyEvidenceForPlan(query: string, plan: string): PolicyEvidence[] {
  return plan === "NovaCorp Gold Plus" ? searchPolicyEvidence(query) : [];
}

export function searchAppointmentAvailability(query: string): AppointmentSlot[] {
  const normalized = query.toLowerCase();
  return /appointment|book|orthopedic|orthopaedic|knee|specialist/.test(normalized)
    ? APPOINTMENT_SLOTS
    : [];
}

export function findDemoSlot(slotId: string): AppointmentSlot | undefined {
  return APPOINTMENT_SLOTS.find(slot => slot.id === slotId);
}
