import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, BadgeCheck, HeartPulse, Loader2, ShieldCheck } from "lucide-react";
import React, { useState } from "react";
import { useLocation } from "wouter";

type RegistrationForm = {
  name: string;
  dateOfBirth: string;
  phoneNumber: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

const initialForm: RegistrationForm = { name: "", dateOfBirth: "", phoneNumber: "", line1: "", line2: "", city: "", state: "", postalCode: "", country: "United States" };

export default function MemberRegistration() {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState<RegistrationForm>(initialForm);
  const registerMember = trpc.care.registerMember.useMutation({
    onSuccess: () => {
      setLocation("/member");
    },
  });
  const update = (field: keyof RegistrationForm) => (event: React.ChangeEvent<HTMLInputElement>) => setForm(current => ({ ...current, [field]: event.target.value }));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    registerMember.mutate({
      name: form.name,
      dateOfBirth: form.dateOfBirth,
      phoneNumber: form.phoneNumber,
      address: { line1: form.line1, ...(form.line2.trim() ? { line2: form.line2.trim() } : {}), city: form.city, state: form.state, postalCode: form.postalCode, country: form.country },
    });
  };

  return <main className="min-h-screen bg-[#f7f3ec] px-5 py-5 text-[#191815] sm:px-8 lg:px-12 lg:py-8"><div className="mx-auto max-w-[1100px]"><header className="flex items-center justify-between border-b border-black/30 pb-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-black/65"><button type="button" onClick={() => setLocation("/")} className="flex items-center gap-2 hover:text-[#005a48]"><ArrowLeft className="size-3.5" /> NovaCorp Health</button><span className="flex items-center gap-2"><ShieldCheck className="size-3.5 text-[#005a48]" /> Secure enrollment</span></header><div className="grid gap-12 py-12 lg:grid-cols-12 lg:gap-16 lg:py-20"><section className="lg:col-span-5"><p className="nova-label">Member enrollment</p><h1 className="mt-5 font-editorial text-[clamp(3.6rem,7vw,6.5rem)] font-semibold leading-[0.86] tracking-[-0.06em]">Your care,<br /><em className="font-normal text-[#005a48]">identified.</em></h1><p className="mt-7 max-w-md font-editorial text-xl leading-7 text-black/65">Create a permanent NovaCorp member profile and receive a healthcare ID card in one secure step.</p><div className="mt-10 space-y-4 border-t border-black/20 pt-5 text-sm leading-6 text-black/65"><p className="flex gap-3"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-[#005a48]" />A unique member ID is issued after registration.</p><p className="flex gap-3"><HeartPulse className="mt-0.5 size-4 shrink-0 text-[#005a48]" />Your profile can be reviewed and updated after you enter the care workspace.</p></div></section><section className="border border-black/25 bg-[#fcfaf6] p-6 sm:p-8 lg:col-span-7"><div className="flex items-start justify-between gap-4"><div><p className="nova-label">Create your profile</p><h2 className="mt-3 font-editorial text-3xl">Member details</h2></div><span className="grid size-10 place-items-center rounded-full bg-[#005a48] text-white"><HeartPulse className="size-4" /></span></div><form className="mt-8 space-y-6" onSubmit={submit}><div className="grid gap-5 sm:grid-cols-2"><Field label="Full name" required><Input value={form.name} onChange={update("name")} autoComplete="name" required /></Field><Field label="Date of birth" required><Input type="date" value={form.dateOfBirth} onChange={update("dateOfBirth")} autoComplete="bday" required /></Field></div><Field label="Mobile number" required hint="Used with your member ID for future verification."><Input type="tel" value={form.phoneNumber} onChange={update("phoneNumber")} autoComplete="tel" placeholder="555-010-1234" required /></Field><div className="border-t border-black/15 pt-6"><p className="nova-label">Postal address</p><div className="mt-4 space-y-5"><Field label="Address line 1" required><Input value={form.line1} onChange={update("line1")} autoComplete="address-line1" required /></Field><Field label="Address line 2"><Input value={form.line2} onChange={update("line2")} autoComplete="address-line2" /></Field><div className="grid gap-5 sm:grid-cols-3"><Field label="City" required><Input value={form.city} onChange={update("city")} autoComplete="address-level2" required /></Field><Field label="State / region" required><Input value={form.state} onChange={update("state")} autoComplete="address-level1" required /></Field><Field label="Postal code" required><Input value={form.postalCode} onChange={update("postalCode")} autoComplete="postal-code" required /></Field></div><Field label="Country" required><Input value={form.country} onChange={update("country")} autoComplete="country-name" required /></Field></div></div>{registerMember.error && <p role="alert" className="border-l-2 border-[#b55239] pl-3 text-sm text-[#7d2c1d]">{registerMember.error.message}</p>}<div className="flex flex-wrap items-center gap-4 border-t border-black/15 pt-6"><Button type="submit" disabled={registerMember.isPending} className="rounded-none bg-[#005a48] px-5 text-xs uppercase tracking-[0.13em] hover:bg-[#003d32]">{registerMember.isPending ? <><Loader2 className="mr-2 size-3.5 animate-spin" />Creating profile</> : "Create healthcare ID"}</Button><p className="text-xs leading-5 text-black/55">You will enter your secure member workspace after registration.</p></div></form></section></div></div></main>;
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-black/70"><span>{label}{required && <span className="ml-1 text-[#005a48]">*</span>}</span>{hint && <span className="mt-1 block font-normal text-black/45">{hint}</span>}<span className="mt-2 block">{children}</span></label>;
}
