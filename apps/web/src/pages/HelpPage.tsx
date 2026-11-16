import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Input, Panel } from '@downora/ui';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageHeader } from '@/components/shared/PageHeader';

interface Article {
  id: string;
  topic: 'Getting started' | 'Downloads' | 'Formats' | 'Privacy and limits' | 'Coming next';
  q: string;
  a: string;
}

const ARTICLES: Article[] = [
  { id: 'what-link', topic: 'Getting started', q: 'What kind of link does Downora need?', a: 'A direct link to the media file itself, usually ending in .mp4, .webm, .mp3, .m4a or .wav. A link to a web page that plays a video is not a file link. On most sites you can find the file link by right-clicking the player, if the site offers one.' },
  { id: 'where-saved', topic: 'Getting started', q: 'Where do my files go?', a: 'The web app hands the finished file to your browser, which saves it to your usual downloads folder. The desktop app will let you pick a folder.' },
  { id: 'paste-blocked', topic: 'Getting started', q: 'The Paste button doesn’t work', a: 'Some browsers ask before a site can read the clipboard, and some block it. Click into the link field and press Ctrl+V (⌘V on Mac) instead.' },
  { id: 'progress', topic: 'Downloads', q: 'How is progress measured?', a: 'From the bytes your browser has actually received. If the server doesn’t report the file size, Downora shows how much has arrived instead of a percentage.' },
  { id: 'pause', topic: 'Downloads', q: 'Why does Resume sometimes start over?', a: 'Resuming needs the server to support partial requests. Downora checks this and labels the button “Restart” when the server can’t continue from where it stopped.' },
  { id: 'reload', topic: 'Downloads', q: 'What happens if I close the tab mid-download?', a: 'The bytes received so far are lost, because the browser holds them in memory. The download is marked as interrupted in History, and Retry starts it again.' },
  { id: 'blocked', topic: 'Downloads', q: 'What does “Open file in a new tab” mean?', a: 'Some servers don’t let other sites read their files. Downora can’t track progress for those, so it hands the link to your browser to open and save directly.' },
  { id: 'big-files', topic: 'Downloads', q: 'Is there a size limit?', a: 'The browser keeps a file in memory until it’s saved, so the web app has a limit you can set in Settings (1 GB by default). The desktop app will write straight to disk without this limit.' },
  { id: 'quality', topic: 'Formats', q: 'Why can’t I pick 4K or 8K?', a: 'Downora only lists qualities the file really has. A direct link is one file at one resolution, so that’s the one option shown.' },
  { id: 'convert', topic: 'Formats', q: 'Can I convert video to MP3 or MKV?', a: 'Not yet. Conversion runs on FFmpeg in the Downora media service, which isn’t connected. Until then Downora saves the original file unchanged and says so.' },
  { id: 'drm', topic: 'Privacy and limits', q: 'Does Downora work with streaming services?', a: 'No. Downora never bypasses DRM, paywalls or sign-ins. A site is only added when downloading from it is explicitly allowed.' },
  { id: 'privacy', topic: 'Privacy and limits', q: 'What does Downora know about me?', a: 'In the web app, nothing leaves your browser: history and settings are stored locally, and files go straight from the source to your device. You can export or erase that data from Profile.' },
  { id: 'extension', topic: 'Coming next', q: 'When is the Chrome extension coming?', a: 'It’s in development. It will show a small Downora button next to supported videos on the page you’re viewing, without reading your browsing history.' },
  { id: 'desktop', topic: 'Coming next', q: 'When is the desktop app coming?', a: 'It’s in development for Windows and macOS. Installers will be published once they’ve been built and tested on both systems.' },
];

export function HelpPage() {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? ARTICLES.filter((a) => `${a.q} ${a.a}`.toLowerCase().includes(q)) : ARTICLES;
  }, [query]);
  const topics = [...new Set(results.map((a) => a.topic))];

  return (
    <>
      <PageHeader title="Help center" description="Answers about links, downloads, formats and privacy." />
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-ink-faint" aria-hidden />
        <Input
          type="search"
          aria-label="Search help articles"
          placeholder="Search, for example “resume” or “4K”"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-12 pl-11 text-base"
        />
      </div>
      <p className="sr-only" role="status">
        {results.length} articles found
      </p>

      {results.length === 0 ? (
        <EmptyState icon={Search} title="No articles match" className="mt-8">
          Try a shorter word, or check the <Link to="/sources" className="text-violet-soft hover:underline">supported sources</Link>.
        </EmptyState>
      ) : (
        <div className="mt-8 flex flex-col gap-8">
          {topics.map((topic) => (
            <section key={topic}>
              <h2 className="mb-2 text-xl font-semibold">{topic}</h2>
              <Panel className="px-5">
                <Accordion type="multiple" defaultValue={query ? results.map((r) => r.id) : []}>
                  {results
                    .filter((a) => a.topic === topic)
                    .map((article) => (
                      <AccordionItem key={article.id} value={article.id}>
                        <AccordionTrigger>{article.q}</AccordionTrigger>
                        <AccordionContent>{article.a}</AccordionContent>
                      </AccordionItem>
                    ))}
                </Accordion>
              </Panel>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
