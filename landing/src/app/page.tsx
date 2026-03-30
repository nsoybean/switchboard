import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { CTASection } from "@/components/cta";
import { FAQ } from "@/components/faq";
import { Footer } from "@/components/footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="overflow-hidden">
        <Hero />
        <HowItWorks />
        <CTASection />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}
