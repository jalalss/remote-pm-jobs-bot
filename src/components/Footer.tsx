import { Sparkles } from "lucide-react";
import { resume } from "@/data/resume";

export default function Footer() {
  return (
    <footer className="max-w-3xl mx-auto px-4 pb-8">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#999]">
        <span>© {new Date().getFullYear()} {resume.name}</span>
        <a
          href="https://claude.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 hover:text-[#2eb3b8] transition-colors"
        >
          <Sparkles size={11} />
          Built with Claude
        </a>
      </div>
    </footer>
  );
}
