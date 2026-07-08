"use client";

import { motion } from "framer-motion";
import { Mail, ArrowRight } from "lucide-react";
import { LinkedInIcon } from "./BrandIcons";
import { resume } from "@/data/resume";

export default function Contact() {
  return (
    <section id="contact" className="max-w-3xl mx-auto px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.08)" }}
      >
        <div className="px-8 pt-6 pb-4 border-b border-[#e0ddd7]">
          <h2 className="text-xl font-semibold text-black">Get in touch</h2>
        </div>

        <div className="px-8 py-6">
          <p className="text-sm text-[#666] mb-6 max-w-md">
            Whether you have a role in mind, a project to discuss, or just want to connect — my
            inbox is open.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href={`mailto:${resume.email}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#2eb3b8] text-white text-sm font-semibold hover:bg-[#24999e] transition-colors"
            >
              <Mail size={15} />
              {resume.email}
            </a>
            <a
              href={resume.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#e0ddd7] text-[#333] text-sm font-medium hover:border-[#2eb3b8] hover:text-[#2eb3b8] transition-colors group"
            >
              <LinkedInIcon size={15} />
              LinkedIn profile
              <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
            </a>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
