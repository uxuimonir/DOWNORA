import { Button, cn, Input, toast } from '@downora/ui';
import type { MediaKind } from '@downora/types';
import { ClipboardPaste, Link2, Search, X } from 'lucide-react';
import { useId, useRef, type FormEvent } from 'react';
import { SAMPLES, sampleUrl } from '@/lib/samples';

export interface UrlBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  busy: boolean;
  error?: string;
  /** Which samples to offer. */
  kind?: MediaKind | 'any';
  size?: 'md' | 'lg';
  autoFocus?: boolean;
}

export function UrlBar({ value, onChange, onSubmit, busy, error, kind = 'any', size = 'md', autoFocus }: UrlBarProps) {
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const samples = SAMPLES.filter((s) => kind === 'any' || s.kind === kind).slice(0, kind === 'any' ? 3 : 3);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(value);
  };

  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        toast('Your clipboard is empty', { description: 'Copy a link to a media file, then try again.' });
        return;
      }
      onChange(text);
      onSubmit(text);
    } catch {
      toast.error('Downora can’t read your clipboard', {
        description: 'Your browser blocked access. Press Ctrl+V (⌘V on Mac) in the link field instead.',
      });
      inputRef.current?.focus();
    }
  };

  const lg = size === 'lg';

  return (
    <div>
      <form onSubmit={submit} role="search" aria-label="Analyze a media link">
        <label htmlFor={inputId} className="sr-only">
          Media link
        </label>
        <div
          className={cn(
            'flex flex-col gap-2 rounded-[1.375rem] border bg-surface p-1.5 transition-[border-color,box-shadow] sm:flex-row sm:items-center sm:rounded-full',
            'focus-within:border-line-strong focus-within:shadow-[0_0_0_4px_rgb(243_100_68/0.12)]',
            error ? 'border-danger/70' : 'border-line',
          )}
        >
          <div className="relative flex min-w-0 flex-1 items-center">
            <Link2 className="pointer-events-none absolute left-3.5 size-[18px] text-ink-faint" aria-hidden />
            <Input
              ref={inputRef}
              id={inputId}
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              autoFocus={autoFocus}
              placeholder="https://example.com/media/clip.mp4"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? errorId : undefined}
              className={cn(
                'rounded-full border-transparent bg-transparent pr-9 pl-11 hover:border-transparent focus-visible:border-transparent focus-visible:ring-0',
                lg ? 'h-12 text-base' : 'h-10',
              )}
            />
            {value ? (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  inputRef.current?.focus();
                }}
                className="absolute right-2 grid size-7 place-items-center rounded-md text-ink-faint hover:bg-raised hover:text-ink"
                aria-label="Clear link"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size={lg ? 'lg' : 'md'} onClick={paste} className="flex-1 sm:flex-none">
              <ClipboardPaste />
              Paste
            </Button>
            <Button type="submit" variant="primary" size={lg ? 'lg' : 'md'} loading={busy} className="flex-1 sm:flex-none">
              {busy ? null : <Search />}
              {busy ? 'Analyzing' : 'Analyze'}
            </Button>
          </div>
        </div>
      </form>
      {error ? (
        <p id={errorId} role="alert" className="mt-2 px-1 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 px-1 text-sm text-ink-muted">
        <span className="label-mono">Try a sample</span>
        {samples.map((sample) => (
          <button
            key={sample.path}
            type="button"
            disabled={busy}
            onClick={() => {
              const url = sampleUrl(sample);
              onChange(url);
              onSubmit(url);
            }}
            className="rounded-full border border-line bg-surface px-3 py-1 font-mono text-[0.6875rem] font-medium tracking-[0.04em] text-ink uppercase transition-colors hover:border-line-strong hover:bg-raised disabled:opacity-50"
          >
            {sample.label}
          </button>
        ))}
      </div>
    </div>
  );
}
