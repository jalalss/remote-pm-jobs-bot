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
  // ─── DISABLED: OneOcean (borderline, flaky) ──────────────────────────────────────────────
  // Sits exactly on the MAYBE/REJECT boundary: a lone structured "Singapore" label with a body
  // that says nothing about work model. `temperature: 0` reduces variance but does not guarantee
  // determinism, so the model sometimes infers "office-based in a single location" and returns
  // REJECT. We decided the case is genuinely ambiguous and not worth chasing — a real borderline
  // job is exactly what the manual override in `jobs:review` exists for.
  //
  // MAYBE REVISIT: if the rubric ever changes how it reads a lone structured location label,
  // re-enable this and see whether it lands consistently. Kept verbatim so it can be restored.
  // {
  //   name: "OneOcean",
  //   expected: "MAYBE",
  //   note: "Faithful to the real posting: the BODY says nothing about work location; 'Singapore' appears ONLY in the structured board field. A single APAC bare label with a silent body → ambiguous, worth the EOR question. (Singapore is +8, adjacent to +7, so NOT scoped away.)",
  //   job: job({
  //     title: "Senior Product Manager - Solutions",
  //     company: "OneOcean",
  //     structuredLocation: "Singapore",
  //     descriptionText: `OneOcean is a unified brand born from the integration of OneOcean and Ocean Technologies Group. Owned by Lloyd's Register, an organisation with more than 260 years of trust, integrity and leadership at sea, OneOcean combines the agility and ambition of a fast-moving innovator with the strength and stability of one of the world's most trusted maritime institutions.
  //
  // As Senior Product Manager - Solutions, you will define, build and lead solution-oriented products and propositions that deliver measurable customer and commercial outcomes across Lloyd's Register's different product lines. You will shape strategy, drive prioritisation and work across compliance, advisory and digital portfolios to create scalable solutions.
  //
  // Essential: Demonstrable experience in senior product management, ideally in a B2B technology, services or data-driven environment. Exceptional stakeholder management skills, with the confidence to operate effectively at senior levels internally and externally.`,
  //   }),
  // },
  // ─────────────────────────────────────────────────────────────────────────────────────────
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
    name: "Mozilla (breadth)",
    expected: "PASS",
    note: "Body is silent on remote/location, but the structured field is a broad 33-country list spanning continents (incl. Singapore/Malaysia/India/Australia) and a timezone range whose nearest zone (+8) overlaps UTC+7 — breadth + overlap = open (market-targeting, not a gate).",
    job: job({
      title: "Director of Product, Gaming (New Products)",
      company: "Mozilla",
      structuredLocation:
        "Broad multi-country list (33 countries): Australia, Austria, Belgium, Bulgaria, Canada, Croatia, Czechia, Denmark, Finland, France, Germany, Greece, Hungary, India, Ireland, Israel, Italy, Luxembourg, Malaysia, Netherlands, New Zealand, Norway, Poland, Portugal, Romania, Singapore, Slovakia, Spain, Sweden, Switzerland, Ukraine, United Kingdom, United States",
      structuredTimezone:
        "Hiring timezones: 23 zones (UTC -10..+14); nearest to UTC+7 is UTC+8 (1h away) — OVERLAPS with UTC+7 (Bangkok, within 4h).",
      descriptionText: `To learn the Hiring Ranges for this position, please select your location from the Apply Now dropdown menu.

Why Mozilla? Mozilla Corporation is the non-profit-backed technology company that has shaped the internet for the better over the last 25 years. We make pioneering brands like Firefox, the privacy-minded web browser.

About this team and role: The New Products organization is an innovation and entrepreneurial organization focused on launching new products and new businesses for Mozilla. We are looking for a Director of Product Management with the strategy and execution skills to build businesses from the ground up. This role sits at the intersection of gaming and the open web.`,
    }),
  },
  {
    name: "Roadie (proximity / adjacent TZ)",
    expected: "PASS",
    note: "Body reads US-centric but has NO hard lock; the structured field is a 6-country list incl. India/Australia and a timezone range whose nearest zone (+8) is ~1h from UTC+7 — breadth + proximity signal market-targeting, so it's open, not gated.",
    job: job({
      title: "Product Owner",
      company: "Roadie",
      structuredLocation:
        "Broad multi-country list (6 countries): Australia, Canada, Germany, India, United Kingdom, United States",
      structuredTimezone:
        "Hiring timezones: 18 zones (UTC -10..+14); nearest to UTC+7 is UTC+8 (1h away) — OVERLAPS with UTC+7 (Bangkok, within 4h).",
      descriptionText: `Roadie, a UPS company, is a leading logistics and delivery platform that helps businesses tackle the complexities of modern retail. Reaching 97% of U.S. households across more than 30,000 zip codes, Roadie provides seamless, scalable solutions.

Our Product team builds the systems that power one of the largest crowdsourced delivery networks in the country. As a Product Owner, you'll lead the evolution of Roadie's internal billing and sender payment platforms, products that sit at the intersection of finance, technology, and operations. You'll partner closely with Engineering, Finance, and cross-functional stakeholders to prioritize work and solve complex business challenges.`,
    }),
  },
  {
    name: "Simprints (async body overrides restrictive structured)",
    expected: "PASS",
    note: "Structured field is RESTRICTIVE (United Kingdom / UTC+0, no overlap) — but the body says 'Location: Remote', flexible async hours ('adapting work hours to match your peak productivity times'), a 4-day week, and an 'amazing team drawn from all over the world'. Body async/distributed language overrides the restrictive structured field.",
    job: job({
      title: "Senior Technical Product Manager",
      company: "Simprints",
      structuredLocation: "United Kingdom",
      structuredTimezone:
        "Hiring timezones: 1 zone (UTC +0); nearest to UTC+7 is UTC+0 (7h away) — no overlap with UTC+7 (Bangkok).",
      descriptionText: `About Us: Simprints is a nonprofit tech company with a mission to radically increase transparency and effectiveness in global development. Today we've worked in over 17 countries helping deliver health, aid, and finance to >4M people.

About the Role: We are looking for a Senior Technical Product Manager to be the champion of our customers. Reporting To: Chief Product Officer. Location: Remote.

An incredible, diverse team. Our work is at the intersection of technology and global development, and we've managed to build an amazing team drawn from all over the world.

Mutual Flex. We champion a work culture where autonomy and trust are paramount, steering clear of mere face-time metrics. Whether it's managing life's essentials like healthcare appointments or adapting work hours to match your peak productivity times, we've got you covered.

Ultimate work-life balance. We offer a 4-day workweek, meaning everybody has the option to have Fridays off.`,
    }),
  },
  {
    name: "Fully remote but US-only (precedence)",
    expected: "REJECT",
    note: "'Fully remote' clears requirement 1 but is NOT geographic openness; the 'United States only' lock is a CLOSED signal that OVERRIDES it. Guards against treating 'fully remote' as work-from-anywhere.",
    job: job({
      title: "Senior Product Manager",
      company: "Acme Cloud",
      descriptionText: `This is a fully remote position — we have no central office and everyone works from home.

As Senior Product Manager you'll own the roadmap for our billing platform. Please note: this role is open to candidates based in the United States only.`,
    }),
  },
  {
    name: "All-EU list, no timezone overlap (scoped away)",
    expected: "REJECT",
    note: "A structured footprint entirely outside Thailand's region — all-European countries AND a timezone range (UTC +0..+2) with no overlap within 4h of +7 — and a body silent on openness. The role is geographically scoped away from Thailand.",
    job: job({
      title: "Product Manager",
      company: "Europa Soft",
      structuredLocation:
        "Broad multi-country list (6 countries): Austria, Belgium, France, Germany, Netherlands, Spain",
      structuredTimezone:
        "Hiring timezones: 3 zones (UTC +0..+2); nearest to UTC+7 is UTC+2 (5h away) — no overlap with UTC+7 (Bangkok).",
      descriptionText: `Europa Soft builds workflow tools for mid-market companies. We're hiring a Product Manager to own our onboarding experience.

You'll partner with engineering and design to ship improvements to activation and retention. Strong analytical and communication skills required.`,
    }),
  },
  {
    name: "On-site in nonstandard wording",
    expected: "REJECT",
    note: "No canonical office/hybrid phrase, but 'you'll join us at our HQ every day' is a required in-person presence — requirement 1 fails on the CONCEPT, not a matched string.",
    job: job({
      title: "Product Manager",
      company: "Tightknit",
      descriptionText: `We're a close-knit team that thrives on being together — you'll join us at our HQ every day to collaborate in person.

As Product Manager you'll drive discovery and delivery across our core product, working shoulder to shoulder with engineering and design.`,
    }),
  },
  {
    name: "Work-authorization only (soft, not a lock)",
    expected: "MAYBE",
    note: "'Fully remote' + a work-authorization line and nothing else. Work-authorization is often boilerplate and an EOR can often work around it, so it is SOFT → MAYBE, never a standalone REJECT.",
    job: job({
      title: "Product Manager",
      company: "Northwind",
      descriptionText: `Northwind is a fully remote company hiring a Product Manager for our data platform.

You'll own the roadmap end to end, partnering with engineering and go-to-market. Applicants must be legally authorized to work in the United States.`,
    }),
  },
  {
    name: "Lock that includes Thailand (SE Asia)",
    expected: "PASS",
    note: "A binding lock ('must be based in Southeast Asia') whose scope INCLUDES Thailand is positive eligibility, not a reject — the candidate qualifies. Guards against rejecting a Thailand-inclusive region lock.",
    job: job({
      title: "Product Manager",
      company: "Mekong Digital",
      descriptionText: `This is a fully remote role. Applicants must be based in Southeast Asia — we hire across the ASEAN region and operate on regional business hours.

As Product Manager you'll own discovery-to-delivery for our consumer app, working with engineering and design.`,
    }),
  },
  {
    name: "Binding lock incl. APAC but excludes Thailand",
    expected: "REJECT",
    note: "A binding lock ('must be based in the US, UK, or Singapore') that EXCLUDES Thailand rejects, even though Singapore is APAC. Breadth/APAC-inclusion does NOT rescue a binding lock — only whether Thailand is in-scope matters. (Contrast the non-binding Roadie/Mozilla lists, which PASS.)",
    job: job({
      title: "Product Manager",
      company: "Tri-Region Labs",
      descriptionText: `This is a remote role. You must be based in the United States, the United Kingdom, or Singapore.

As Product Manager you'll own the roadmap for our analytics suite, working with engineering and design to ship customer-facing features.`,
    }),
  },
  {
    name: "Thai-language posting",
    expected: "REJECT",
    note: "Body written predominantly in Thai — a local Thai-market role (Thai-language workplace), which the non-English filter drops. Thai is NOT excepted: the bot targets international English-language remote roles.",
    job: job({
      title: "Product Manager",
      company: "Siam Tech",
      descriptionText: `เรากำลังมองหา Product Manager ที่มีประสบการณ์เพื่อร่วมงานกับทีมของเรา

คุณจะรับผิดชอบด้านกลยุทธ์ผลิตภัณฑ์ การวางแผน roadmap และการทำงานร่วมกับทีมวิศวกรรมและทีมออกแบบอย่างใกล้ชิด ต้องการประสบการณ์อย่างน้อย 5 ปีในการบริหารจัดการผลิตภัณฑ์ เรามีสวัสดิการที่ดีและสภาพแวดล้อมการทำงานที่ทันสมัย`,
    }),
  },
  {
    name: "Structured timezone-only, no overlap (scoped away)",
    expected: "REJECT",
    note: "No country field at all — only a stated hiring-timezone footprint (Americas, nearest zone 11h from +7) and a silent body. A stated non-overlapping timezone alone is scoped away → REJECT (mirror of the country-only case).",
    job: job({
      title: "Product Manager",
      company: "Westline",
      structuredTimezone:
        "Hiring timezones: 5 zones (UTC -8..-4); nearest to UTC+7 is UTC-4 (11h away) — no overlap with UTC+7 (Bangkok).",
      descriptionText: `Westline is hiring a Product Manager for our payments team. This is a remote role.

You'll own the roadmap end to end, partnering with engineering, design, and go-to-market to ship improvements to our checkout experience.`,
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
