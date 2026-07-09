// Ground-truth fixtures: real job descriptions hand-labeled by the candidate and Claude
// together. The classifier must reproduce these verdicts (`npm run jobs:test`).
// Text is faithful to the originals, preserving the governing location lines.
import type { RawJob, Verdict } from "../types.js";

export interface Fixture {
  name: string;
  job: RawJob;
  expected: Verdict;
  /** Why we labeled it this way — shown on failure. */
  note: string;
}

function job(partial: Omit<RawJob, "id" | "source" | "url">): RawJob {
  return {
    id: `fixture:${partial.title}`,
    source: "fixture",
    url: "",
    ...partial,
  };
}

export const fixtures: Fixture[] = [
  {
    name: "Booksy",
    expected: "REJECT",
    note: "Hard-lock: 'based in the country/region this role is advertised in' + explicit country list.",
    job: job({
      title: "Product Manager, Payments",
      company: "Booksy",
      descriptionText: `Please note this role is available to candidates based in Spain, UK, Poland and Portugal.

What started in Poland is now an international, cloud-based marketplace that's scaling rapidly. As a Product Manager in our Payments team, you will own the Booksy Wallet.

Benefits: We're proudly distributed across the globe, with each market being remote-first. Depending on which market you're joining, you might have office access or be fully remote - either works. All we ask is that you're based in the country/region this role is advertised in.`,
    }),
  },
  {
    name: "Material Bank",
    expected: "REJECT",
    note: "Hard-lock: 'located in Raleigh, North Carolina (Hybrid) or Boston, MA (Remote)' + 401(k) US tell.",
    job: job({
      title: "Director of Product",
      company: "Material Bank",
      descriptionText: `Material Bank is the world's largest material marketplace for the architecture and design industry. Operating in 37 countries, our platform has become the standard for design professionals around the globe.

As the Director of Product, you'll lead and drive key areas of the Material Bank platform. Ideal candidate will be located in Raleigh, North Carolina (Hybrid) or Boston, MA (Remote).

Plan for your Retirement: 401(k) eligible after your first 90 days employed! Flexible Work Schedules: Material Technologies has embraced a hybrid working model. Material Bank is proud to be an equal opportunity employer without attention to status protected under any applicable federal, state or local law.`,
    }),
  },
  {
    name: "Canonical",
    expected: "REJECT",
    note: "Hard-lock: 'home based in the EMEA time zone. You will be expected to be located in this region.'",
    job: job({
      title: "Product Manager",
      company: "Canonical",
      descriptionText: `Canonical is a leading provider of open source software and operating systems. The company is a pioneer of global distributed collaboration, with 1200+ colleagues in 75+ countries and very few office based roles.

This is a general application track for the product management positions at Canonical. You will set a clear vision and prioritize work effectively.

Location: These roles are home based in the EMEA time zone. You will be expected to be located in this region.

We recruit on a global basis and set a very high standard for people joining the company. Most colleagues at Canonical have worked from home since its inception in 2004.`,
    }),
  },
  {
    name: "Okendo",
    expected: "REJECT",
    note: "Hybrid with a required physical office: 'Flexible hybrid working model with the convenience of a Sydney CBD office.'",
    job: job({
      title: "Senior Product Manager",
      company: "Okendo",
      descriptionText: `Okendo is a customer-marketing platform trusted by 6,000+ of the world's fastest-growing consumer brands. Reporting to the Head of Product, the Senior Product Manager will develop and lead key product areas within the Okendo Platform.

Workplace Benefits: Highly competitive compensation package. Generous PTO and vacation policy. Exposure to the biggest and best eCommerce brands globally. Flexible hybrid working model with the convenience of a Sydney CBD office.`,
    }),
  },
  {
    name: "OneOcean",
    expected: "MAYBE",
    note: "Bare 'Location: Singapore' with no 'must be based' language — ambiguous, worth the EOR question.",
    job: job({
      title: "Senior Product Manager - Solutions",
      company: "OneOcean",
      structuredLocation: "Singapore",
      descriptionText: `Department: Product. Employment Type: Full Time. Location: Singapore.

OneOcean is a unified brand born from the integration of OneOcean and Ocean Technologies Group, owned by Lloyd's Register. As Senior Product Manager - Solutions, you will define, build and lead solution-oriented products and propositions across Lloyd's Register's different product lines.

Essential: Demonstrable experience in senior product management, ideally in a B2B technology, services or data-driven environment. Exceptional stakeholder management skills.`,
    }),
  },
  {
    name: "M32 AI (Wing)",
    expected: "PASS",
    note: "Explicit 'Remote-first culture' + 'Work from anywhere'; optional hack-weeks in HK/India/London (APAC-friendly).",
    job: job({
      title: "Product Manager",
      company: "Wing / M32 AI",
      descriptionText: `Wing is seeking elite talent to join M32 AI (backed by top-tier Silicon Valley VCs), dedicated to building agentic AI for SMBs globally. We are looking for a Product Manager to work directly with our CPO, building innovative AI products from 0 to 1.

What You Get: Remote-first culture. Work from anywhere. Competitive salary. Performance-based bonuses. Paid Time Off. Health Insurance. High autonomy, low bureaucracy. Optional in-person hack-weeks in Hong Kong, India, or London. Access to best-in-class tooling.`,
    }),
  },
  {
    name: "Himalayas worldwide (structured field)",
    expected: "PASS",
    note: "JD body is silent on location, but Himalayas' structured fields say worldwide + hiring timezones include UTC+7 — a positive signal that should drive a PASS.",
    job: job({
      title: "Senior Product Owner",
      company: "Verisma",
      structuredLocation: "Open to all countries (worldwide) — Himalayas structured field",
      structuredTimezone: "Hiring timezones include UTC+7 (Bangkok); range spans the globe",
      descriptionText: `Verisma is a leader in release-of-information technology for the healthcare industry. We are hiring a Senior Product Owner to own the roadmap for our core platform.

You will work with engineering and design to define requirements, prioritize the backlog, and deliver features that meet customer needs. Strong stakeholder-management and analytical skills required. 5+ years of product experience preferred.`,
    }),
  },
  {
    name: "Structured US, but JD says worldwide",
    expected: "PASS",
    note: "Structured location says 'United States' and hiring timezones exclude UTC+7, but the JD body explicitly says fully remote / work from anywhere — the body overrides; the restrictive structured field must NOT cause a reject.",
    job: job({
      title: "Product Manager",
      company: "Globex Remote",
      structuredLocation: "United States",
      structuredTimezone: "Hiring timezones (UTC -8, -7, -6, -5) do NOT include UTC+7 (Bangkok)",
      descriptionText: `We're a fully distributed company hiring a Product Manager. This is a fully remote role and you can work from anywhere in the world — we have no office and hire globally.

You'll own discovery-to-delivery for a key product area, partnering with engineering and design across time zones. We care about outcomes, not where you sit.`,
    }),
  },
  {
    name: "Greek-language posting",
    expected: "REJECT",
    note: "English title but the body is written entirely in Greek — signals a local-language (Greek) audience, so REJECT even with no stated geo restriction.",
    job: job({
      title: "Product Manager",
      company: "Technologies Hellas",
      descriptionText: `Η εταιρεία μας αναζητά έναν έμπειρο Product Manager για να ενταχθεί στην ομάδα μας.

Θα είστε υπεύθυνος για τη στρατηγική του προϊόντος, τον σχεδιασμό του οδικού χάρτη και τη στενή συνεργασία με τις ομάδες μηχανικής και σχεδιασμού. Θα αναλύετε δεδομένα, θα ιεραρχείτε τις προτεραιότητες και θα παραδίδετε προϊόντα που ικανοποιούν τις ανάγκες των πελατών.

Απαιτούνται τουλάχιστον 5 χρόνια εμπειρίας στη διαχείριση προϊόντων. Προσφέρουμε ανταγωνιστικό μισθό, ευκαιρίες εξέλιξης και ένα σύγχρονο περιβάλλον εργασίας.`,
    }),
  },
];
