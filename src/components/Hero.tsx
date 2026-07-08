"use client";

import { motion } from "framer-motion";
import { Mail, MapPin, ArrowRight } from "lucide-react";
import { LinkedInIcon } from "./BrandIcons";
import { resume } from "@/data/resume";

export default function Hero() {
  return (
    <section id="hero" className="max-w-3xl mx-auto px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.08)" }}
      >
        {/* Top accent bar */}
        <div className="h-1.5 bg-gradient-to-r from-[#2eb3b8] to-[#0891b2]" />

        <div className="px-8 pt-8 pb-8">
          {/* Greeting + Name */}
          <p
            className="text-sm text-[#999] font-light mb-1 tracking-wide"
            style={{ fontFamily: "var(--font-sans-var)" }}
          >
            Hello, I&apos;m
          </p>
          <h1
            className="text-[56px] sm:text-[72px] font-bold italic leading-none text-black mb-5"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {resume.name}.
          </h1>

          {/* Title + location */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-5">
            <span className="text-lg font-semibold text-[#2eb3b8]">{resume.title}</span>
            <span className="text-[#e0ddd7] hidden sm:inline">·</span>
            <span className="flex items-center gap-1 text-sm text-[#666]">
              <MapPin size={13} />
              {resume.location}
            </span>
          </div>

          {/* Bio */}
          <p className="text-[15px] text-[#444] leading-relaxed max-w-xl mb-7">
            {resume.bio}
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <a
              href={`mailto:${resume.email}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#2eb3b8] text-white text-sm font-semibold hover:bg-[#24999e] transition-colors"
            >
              <Mail size={14} />
              Get in touch
            </a>
            <a
              href={resume.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#e0ddd7] text-[#333] text-sm font-medium hover:border-[#2eb3b8] hover:text-[#2eb3b8] transition-colors group"
            >
              <LinkedInIcon size={14} />
              LinkedIn
              <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
            </a>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-[#999] pt-5 border-t border-[#e0ddd7]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {resume.availability}
            </span>
            {resume.languages.map((lang) => (
              <span key={lang.name}>
                {lang.name}
                <span className="text-[#ccc] ml-1">— {lang.level}</span>
              </span>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
