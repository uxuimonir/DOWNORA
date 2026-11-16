import { useSearchParams } from 'react-router';
import { Downloader } from '@/components/downloader/Downloader';
import { PageHeader } from '@/components/shared/PageHeader';

function useInitialUrl(): string | undefined {
  const [params] = useSearchParams();
  return params.get('url') ?? undefined;
}

export function VideoDownloaderPage() {
  const initialUrl = useInitialUrl();
  return (
    <>
      <PageHeader
        title="Video downloader"
        description="Paste a direct link to an MP4 or WebM file. Downora reads its resolution, length and size, then saves the original file."
      />
      <Downloader kind="video" autoFocus={!initialUrl} initialUrl={initialUrl} />
    </>
  );
}

export function AudioDownloaderPage() {
  const initialUrl = useInitialUrl();
  return (
    <>
      <PageHeader
        title="Audio downloader"
        description="Paste a direct link to an MP3, M4A or WAV file. Downora checks its length and size, then saves the original file."
      />
      <Downloader kind="audio" autoFocus={!initialUrl} initialUrl={initialUrl} />
    </>
  );
}
