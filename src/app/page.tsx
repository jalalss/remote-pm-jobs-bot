import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import ExperienceSection from "@/components/ExperienceSection";
import EducationSection from "@/components/EducationSection";
import Skills from "@/components/Skills";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="pt-24 pb-12 space-y-6">
        <Hero />
        <ExperienceSection />
        <EducationSection />
        <Skills />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
