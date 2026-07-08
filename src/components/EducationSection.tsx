"use client";

import { motion } from "framer-motion";
import { resume } from "@/data/resume";

export default function EducationSection() {
  return (
    <section id="education" className="max-w-3xl mx-auto px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.08)" }}
      >
        <div className="px-8 pt-6 pb-4 border-b border-[#e0ddd7]">
          <h2 className="text-xl font-semibold text-black">Education</h2>
        </div>

        <div className="divide-y divide-[#e0ddd7]">
          {resume.education.map((entry, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.08, ease: "easeOut" }}
              className="px-8 py-6 flex gap-4"
            >
              {/* Badge */}
              <div
                className="w-12 h-12 rounded-lg shrink-0 flex items-center justify-center text-lg font-bold select-none"
                style={{ backgroundColor: entry.badgeBg, color: entry.badgeColor }}
              >
                {entry.institution[0]}
              </div>

              {/* Content */}
              <div>
                <p className="text-[15px] font-semibold text-black leading-snug">
                  {entry.institution}
                </p>
                <p className="text-sm text-[#666] mt-0.5">{entry.degree}</p>
                <p className="text-sm text-[#666]">
                  {entry.start} – {entry.end}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
