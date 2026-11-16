import { useEffect } from 'react';
import { Navigation } from '@/components/site/Navigation';
import {
  Anatomy,
  AUDIO_ITEMS,
  AudioVisual,
  ExtensionShowcase,
  FAQ,
  FeatureSection,
  FinalCTA,
  Footer,
  Hero,
  HowItWorks,
  Privacy,
  QUEUE_ITEMS,
  QueueVisual,
  SupportedSources,
  VIDEO_ITEMS,
  VideoVisual,
} from '@/components/site/sections';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useAccount } from '@/stores/account';

const NO_OUTPUTS: string[] = [];

export function LandingPage() {
  useDocumentTitle('');
  const init = useAccount((s) => s.init);
  const outputs = useAccount((s) => s.health?.outputs ?? NO_OUTPUTS);
  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="min-h-dvh overflow-x-clip">
      <a href="#main" className="sr-only z-[60] rounded-full bg-ink px-4 py-2 text-sm font-medium text-canvas focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <Navigation />
      <main id="main">
        <Hero />
        <Anatomy />
        <HowItWorks />
        <ExtensionShowcase />
        <SupportedSources outputs={outputs} />
        <div id="features" className="scroll-mt-20">
          <FeatureSection title="Video, at the quality it really is." body="Downora reads the stream, not the label. Keep the original, or make a smaller copy." items={VIDEO_ITEMS} visual={<VideoVisual />} />
          <FeatureSection flip title="Sound, set free." body="Save audio files as they are, or take the soundtrack out of a video." items={AUDIO_ITEMS} visual={<AudioVisual />} />
          <FeatureSection title="Downloads that stay in hand." body="A queue that tells the truth: real bytes, real speed, and a plain reason when something stops." items={QUEUE_ITEMS} visual={<QueueVisual />} />
        </div>
        <Privacy />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
