"use client";

import { useState, useEffect } from "react";
import { resume } from "@/data/resume";

const links = [
  { label: "Experience", href: "#experience" },
  { label: "Education", href: "#education" },
  { label: "Skills", href: "#skills" },
  { label: "Contact", href: "#contact" },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
        scrolled
          ? "bg-white/96 backdrop-blur-sm border-b border-[#e0ddd7] shadow-sm"
          : "bg-[#f3f2ef]/80 backdrop-blur-sm"
      }`}
    >
      <nav className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <a
          href="#hero"
          className="text-base font-bold italic text-black hover:text-[#2eb3b8] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {resume.name.split(" ")[0]}.
        </a>

        <ul className="hidden sm:flex items-center gap-6">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-sm text-[#666] hover:text-black transition-colors"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <a
          href={`mailto:${resume.email}`}
          className="text-sm font-semibold px-4 py-2 rounded-full bg-[#2eb3b8] text-white hover:bg-[#24999e] transition-colors"
        >
          Hire me
        </a>
      </nav>
    </header>
  );
}
