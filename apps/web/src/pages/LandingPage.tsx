import { useEffect } from 'react';
import { Frame, Rails } from '@/components/site/grid';
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
  Stats,
  SupportedSources,
  VideoQuality,
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
    <Frame>
      <a href="#main" className="sr-only z-[60] rounded-md bg-ink px-4 py-2 text-sm font-medium text-canvas focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <Navigation />
      <main id="main">
        <Rails>
          <Hero />
          <HowItWorks />
          <Anatomy />
          <VideoQuality />
          <Stats />
          <ExtensionShowcase />
          <SupportedSources outputs={outputs} />
          <FeatureSection
            id="audio"
            tag="Audio"
            lead="Sound,"
            rest="set free."
            body="Save audio files as they are, or take the soundtrack out of a video."
            items={AUDIO_ITEMS}
            visual={<AudioVisual />}
          />
          <FeatureSection
            id="queue"
            flip
            tag="Download management"
            lead="Downloads that"
            rest="stay in hand."
            body="A queue that tells the truth: real bytes, real speed, and a plain reason when something stops."
            items={QUEUE_ITEMS}
            visual={<QueueVisual />}
          />
          <Privacy />
          <FAQ />
        </Rails>
        <FinalCTA />
      </main>
      <Footer />
    </Frame>
  );
}
