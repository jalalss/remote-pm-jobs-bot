"use client";

import { motion } from "framer-motion";

interface TimelineItemProps {
  title: string;
  subtitle: string;
  start: string;
  end: string;
  highlights: readonly string[];
  index: number;
}

export default function TimelineItem({
  title,
  subtitle,
  start,
  end,
  highlights,
  index,
}: TimelineItemProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45, delay: index * 0.06, ease: "easeOut" }}
      className="grid sm:grid-cols-[220px_1fr] gap-y-3 sm:gap-x-12 py-8 border-b border-[#e8e5e1] last:border-0"
    >
      {/* Left: company + dates */}
      <div className="sm:pt-0.5">
        <p className="text-[15px] font-semibold text-[#1a1a1a]">{subtitle}</p>
        <p className="text-sm text-[#a0a0a0] mt-1 font-light">
          {start} – {end}
        </p>
      </div>

      {/* Right: role + bullets */}
      <div>
        <p className="text-[15px] font-medium text-[#2eb3b8] mb-4">{title}</p>
        <ul className="space-y-2.5">
          {highlights.map((point, i) => (
            <li key={i} className="flex gap-3 text-sm text-[#5c5c5c] leading-relaxed">
              <span className="text-[#c8c8c8] shrink-0 mt-0.5 select-none">—</span>
              {point}
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}
