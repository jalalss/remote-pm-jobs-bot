// PLACEHOLDER portfolio data (fictional persona) — committed so the site builds in the
// public repo without exposing real personal info. Real CV lives in the gitignored
// `resume.local.ts` (copy it over locally if you want the real data). Same shape/types.
export type Role = {
  title: string;
  type: string;
  start: string;
  end: string;
  duration: string;
  highlights: string[];
};

export type CompanyEntry = {
  company: string;
  location: string;
  totalDuration: string;
  badgeColor: string;
  badgeBg: string;
  isBreak?: boolean;
  roles: Role[];
};

export type EducationEntry = {
  institution: string;
  degree: string;
  start: string;
  end: string;
  badgeColor: string;
  badgeBg: string;
};

export const resume = {
  name: "Alex Morgan",
  title: "Senior Product Manager",
  bio: "Senior PM with 8+ years building and scaling digital products across B2B and B2C. Former software engineer, so the technical depth helps me collaborate closely with engineering and make sharper trade-off calls. Focused on data-driven product strategy, funnel optimization, and end-to-end delivery of initiatives that move business metrics.",
  location: "Remote",
  availability: "Open to opportunities",
  email: "hello@example.com",
  phone: "+00 000 000 0000",
  linkedin: "https://linkedin.com/in/example",
  github: "https://github.com/example",

  languages: [
    { name: "English", level: "Native" },
    { name: "Spanish", level: "Professional" },
  ],

  experience: [
    {
      company: "Northwind Marketplace",
      location: "Remote",
      totalDuration: "1 yr 3 mos",
      badgeColor: "#ffffff",
      badgeBg: "#e2133c",
      roles: [
        {
          title: "Senior Product Manager",
          type: "Full-time",
          start: "Apr 2025",
          end: "Present",
          duration: "1 yr 3 mos",
          highlights: [
            "Led funnel-optimization initiatives to increase conversion and lifetime value across the booking flow.",
            "Drove strategic technical migrations to accelerate engineering velocity and improve UX consistency.",
          ],
        },
      ],
    },
    {
      company: "Career Break",
      location: "",
      totalDuration: "6 mos",
      badgeColor: "#ffffff",
      badgeBg: "#64748b",
      isBreak: true,
      roles: [
        {
          title: "Career Break",
          type: "Travel",
          start: "Oct 2024",
          end: "Mar 2025",
          duration: "6 mos",
          highlights: ["Took time to travel and recharge after several years in demanding product roles."],
        },
      ],
    },
    {
      company: "Brightlane Foods",
      location: "Remote",
      totalDuration: "3 yrs 8 mos",
      badgeColor: "#ffffff",
      badgeBg: "#00a082",
      roles: [
        {
          title: "Senior Product Manager",
          type: "Full-time",
          start: "Jun 2023",
          end: "Sep 2024",
          duration: "1 yr 4 mos",
          highlights: [
            "Led the MVP of a social layer to drive engagement through recommendations.",
            "Improved delivery-address accuracy, reducing wait times and checkout errors.",
          ],
        },
        {
          title: "Product Manager",
          type: "Full-time",
          start: "Feb 2021",
          end: "Jun 2023",
          duration: "2 yrs 5 mos",
          highlights: [
            "Shipped catalog-driven upselling features that grew average basket size.",
            "Led integration of third-party catalog systems, unlocking new commerce features.",
          ],
        },
      ],
    },
    {
      company: "Nimbus Logistics",
      location: "Remote",
      totalDuration: "5 yrs 7 mos",
      badgeColor: "#ffffff",
      badgeBg: "#2563eb",
      roles: [
        {
          title: "Lead Product Manager",
          type: "Full-time",
          start: "Aug 2020",
          end: "Feb 2021",
          duration: "7 mos",
          highlights: [
            "Led third-party integrations and courier-experience upgrades, launching a new business line.",
            "Drove a public GraphQL API and its adoption among integration partners.",
          ],
        },
        {
          title: "Senior Product Manager",
          type: "Full-time",
          start: "Jun 2018",
          end: "Jul 2020",
          duration: "2 yrs 2 mos",
          highlights: ["Improved logistics ML and courier tools, boosting deliveries per hour."],
        },
        {
          title: "Software Engineer",
          type: "Full-time",
          start: "Aug 2015",
          end: "May 2018",
          duration: "2 yrs 9 mos",
          highlights: ["Built and maintained client and courier mobile apps across cross-functional teams."],
        },
      ],
    },
  ] as CompanyEntry[],

  education: [
    {
      institution: "Technical University",
      degree: "M.Sc. Information and Communication Technologies",
      start: "2008",
      end: "2012",
      badgeColor: "#ffffff",
      badgeBg: "#0f766e",
    },
    {
      institution: "State University",
      degree: "Telecommunications Engineering",
      start: "2003",
      end: "2008",
      badgeColor: "#ffffff",
      badgeBg: "#b45309",
    },
  ] as EducationEntry[],

  skills: {
    "Product": [
      "Product Vision & Strategy",
      "Funnel Optimization",
      "Product Experimentation",
      "Go-to-market Strategies",
      "Roadmap Planning",
    ],
    "Data & Research": ["Data Analytics", "SQL", "UXR Methodologies", "A/B Testing", "KPI Definition"],
    "Leadership": ["Cross-functional Team Leadership", "Agile / Scrum", "Stakeholder Management", "Talent Selection"],
    "Technical Background": ["Mobile Development", "GraphQL", "API Integration", "System Design"],
  },
};
