"use client";

import { motion } from "framer-motion";
import { resume } from "@/data/resume";

export default function Skills() {
  const categories = Object.entries(resume.skills) as [string, string[]][];

  return (
    <section id="skills" className="max-w-3xl mx-auto px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.08)" }}
      >
        <div className="px-8 pt-6 pb-4 border-b border-[#e0ddd7]">
          <h2 className="text-xl font-semibold text-black">Skills</h2>
        </div>

        <div className="divide-y divide-[#e0ddd7]">
          {categories.map(([category, tags], i) => (
            <motion.div
              key={category}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.06, ease: "easeOut" }}
              className="px-8 py-6"
            >
              <p className="text-[15px] font-semibold text-black mb-3">{category}</p>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-sm px-3 py-1 rounded-full border border-[#e0ddd7] text-[#333] hover:border-[#2eb3b8] hover:text-[#2eb3b8] hover:bg-[#f0fafa] transition-colors cursor-default"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
