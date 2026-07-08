"use client";

import { motion } from "framer-motion";
import { MapPin, Briefcase, Languages } from "lucide-react";
import { GitHubIcon, LinkedInIcon } from "./BrandIcons";
import { resume } from "@/data/resume";

export default function About() {
  return (
    <section id="about" className="py-24 max-w-5xl mx-auto px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="grid md:grid-cols-3 gap-10 items-start"
      >
        {/* Bio */}
        <div className="md:col-span-2">
          <h2 className="text-xs font-semibold text-cyan-500 uppercase tracking-widest mb-4">
            About
          </h2>
          <p className="text-2xl font-semibold text-white leading-snug mb-6">
            Building at the intersection of{" "}
            <span className="text-cyan-400">product strategy</span> and{" "}
            <span className="text-cyan-400">technical depth</span>.
          </p>
          <p className="text-zinc-400 leading-relaxed">{resume.bio}</p>
        </div>

        {/* Quick facts card */}
        <div className="rounded-2xl border border-[#222222] bg-[#111111] p-6 space-y-4">
          <div className="flex items-center gap-3 text-sm">
            <MapPin size={15} className="text-cyan-500 shrink-0" />
            <span className="text-zinc-300">{resume.location}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Briefcase size={15} className="text-cyan-500 shrink-0" />
            <span className="text-zinc-300">{resume.availability}</span>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <Languages size={15} className="text-cyan-500 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-0.5">
              {resume.languages.map((lang) => (
                <span key={lang.name} className="text-zinc-300">
                  {lang.name}{" "}
                  <span className="text-zinc-500 text-xs">— {lang.level}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="border-t border-[#222222] pt-4 flex items-center gap-4">
            <a
              href={resume.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 hover:text-cyan-400 transition-colors"
              aria-label="LinkedIn"
            >
              <LinkedInIcon size={18} />
            </a>
            <a
              href={resume.github}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 hover:text-cyan-400 transition-colors"
              aria-label="GitHub"
            >
              <GitHubIcon size={18} />
            </a>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
