import TimelineItem from "./TimelineItem";

interface TimelineEntry {
  role?: string;
  degree?: string;
  company?: string;
  institution?: string;
  start: string;
  end: string;
  highlights: readonly string[];
}

interface TimelineProps {
  id: string;
  heading: string;
  items: TimelineEntry[];
}

export default function Timeline({ id, heading, items }: TimelineProps) {
  return (
    <section id={id} className="max-w-5xl mx-auto px-8 py-20">
      <h2
        className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a0a0a0] mb-12"
      >
        {heading}
      </h2>
      <div>
        {items.map((item, i) => (
          <TimelineItem
            key={i}
            index={i}
            title={(item.role ?? item.degree) as string}
            subtitle={(item.company ?? item.institution) as string}
            start={item.start}
            end={item.end}
            highlights={item.highlights}
          />
        ))}
      </div>
    </section>
  );
}
