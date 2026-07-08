"use client";

import { motion } from "framer-motion";
import { resume, type CompanyEntry } from "@/data/resume";

function CompanyBadge({ company, bg, color }: { company: string; bg: string; color: string }) {
  return (
    <div
      className="w-12 h-12 rounded-lg shrink-0 flex items-center justify-center text-lg font-bold select-none"
      style={{ backgroundColor: bg, color }}
    >
      {company[0]}
    </div>
  );
}

function SingleRoleEntry({ entry }: { entry: CompanyEntry }) {
  const role = entry.roles[0];
  return (
    <div className="flex gap-4">
      <CompanyBadge company={entry.company} bg={entry.badgeBg} color={entry.badgeColor} />
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold text-black leading-snug">{role.title}</p>
        <p className="text-sm text-[#666] mt-0.5">
          {entry.company}
          {!entry.isBreak && ` · ${role.type}`}
        </p>
        <p className="text-sm text-[#666]">
          {role.start} – {role.end} · {role.duration}
        </p>
        {entry.location && (
          <p className="text-sm text-[#666]">{entry.location}</p>
        )}
        {role.highlights.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {role.highlights.map((h, i) => (
              <li key={i} className="flex gap-2 text-sm text-[#333] leading-relaxed">
                <span className="text-[#999] shrink-0 mt-0.5 select-none">•</span>
                {h}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MultiRoleEntry({ entry }: { entry: CompanyEntry }) {
  return (
    <div className="flex gap-4">
      <CompanyBadge company={entry.company} bg={entry.badgeBg} color={entry.badgeColor} />
      <div className="flex-1 min-w-0">
        {/* Company header */}
        <p className="text-[15px] font-semibold text-black leading-snug">{entry.company}</p>
        <p className="text-sm text-[#666] mt-0.5">
          {entry.totalDuration}
          {entry.location ? ` · ${entry.location}` : ""}
        </p>

        {/* Role list with connecting line */}
        <div className="mt-4 relative">
          {/* Vertical connecting line */}
          <div className="absolute left-[5px] top-[10px] bottom-[10px] w-px bg-[#ccc]" />

          <div className="space-y-5">
            {entry.roles.map((role, i) => (
              <div key={i} className="flex gap-4">
                {/* Dot */}
                <div className="w-[11px] h-[11px] rounded-full bg-[#666] border-[2px] border-white ring-1 ring-[#ccc] shrink-0 mt-[3px] z-10" />
                <div className="flex-1 min-w-0 -mt-0.5">
                  <p className="text-[14px] font-semibold text-black leading-snug">{role.title}</p>
                  <p className="text-sm text-[#666]">
                    {role.type} · {role.start} – {role.end} · {role.duration}
                  </p>
                  {role.highlights.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {role.highlights.map((h, j) => (
                        <li key={j} className="flex gap-2 text-sm text-[#333] leading-relaxed">
                          <span className="text-[#999] shrink-0 mt-0.5 select-none">•</span>
                          {h}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ExperienceSection() {
  return (
    <section id="experience" className="max-w-3xl mx-auto px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.08)" }}
      >
        {/* Card header */}
        <div className="px-8 pt-6 pb-4 border-b border-[#e0ddd7]">
          <h2 className="text-xl font-semibold text-black">Experience</h2>
        </div>

        {/* Entries */}
        <div className="divide-y divide-[#e0ddd7]">
          {resume.experience.map((entry, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.05, ease: "easeOut" }}
              className="px-8 py-6"
            >
              {entry.roles.length === 1 ? (
                <SingleRoleEntry entry={entry} />
              ) : (
                <MultiRoleEntry entry={entry} />
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
