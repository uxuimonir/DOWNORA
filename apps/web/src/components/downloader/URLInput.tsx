import { Button, cn, Input, toast } from '@downora/ui';
import type { MediaKind } from '@downora/types';
import { ClipboardPaste, Link2, Search, X } from 'lucide-react';
import { useId, useRef, type FormEvent } from 'react';
import { SAMPLES, sampleUrl } from '@/lib/samples';

export interface URLInputProps {
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

export function URLInput({ value, onChange, onSubmit, busy, error, kind = 'any', size = 'md', autoFocus }: URLInputProps) {
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
      <div className={cn('rounded-[0.875rem] border border-line bg-raised', error && 'border-danger/60')}>
        <form
          onSubmit={submit}
          role="search"
          aria-label="Analyze a media link"
          className={cn(
            '-m-px rounded-[0.875rem] border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-shadow',
            'focus-within:border-accent/60 focus-within:shadow-[0_0_0_4px_rgb(112_71_235/0.12)]',
            error && 'border-danger/60',
          )}
        >
          <label htmlFor={inputId} className="sr-only">
            Media link
          </label>
          <div className="relative flex items-center">
            <Link2 className="pointer-events-none absolute left-3.5 size-4 text-ink-faint" aria-hidden />
            <Input
              ref={inputRef}
              id={inputId}
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              autoFocus={autoFocus}
              placeholder="Paste a link to a media file…"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? errorId : undefined}
              className={cn('rounded-none border-0 bg-transparent pr-11 pl-10 shadow-none focus-visible:ring-0', lg ? 'h-14 text-base' : 'h-12')}
            />
            {value ? (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  inputRef.current?.focus();
                }}
                className="absolute right-1.5 grid size-9 place-items-center rounded-md text-ink-faint hover:bg-fill hover:text-ink"
                aria-label="Clear link"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 px-2.5 pb-2.5">
            <Button type="button" variant="secondary" size="sm" onClick={paste} className="h-8">
              <ClipboardPaste />
              Paste
            </Button>
            <span className="tag-mono hidden text-ink-faint sm:inline">MP4 · WebM · MP3 · M4A · WAV</span>
            <Button type="submit" variant="primary" size={lg ? 'md' : 'sm'} loading={busy} className={cn('ml-auto', lg ? 'h-10' : 'h-8')}>
              {busy ? null : <Search />}
              {busy ? 'Analyzing' : 'Analyze'}
            </Button>
          </div>
        </form>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2.5 text-[0.8125rem] text-ink-muted">
          <span>Try a sample</span>
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
              className="hit-area rounded-[6px] border border-line bg-surface px-2 py-0.5 text-[0.75rem] font-medium text-ink transition-colors hover:border-line-strong disabled:opacity-50"
            >
              {sample.label}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="mt-2 px-1 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
