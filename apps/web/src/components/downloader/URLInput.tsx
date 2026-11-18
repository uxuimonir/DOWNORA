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
      <form onSubmit={submit} role="search" aria-label="Analyze a media link">
        <label htmlFor={inputId} className="sr-only">
          Media link
        </label>
        <div
          className={cn(
            'flex flex-col gap-2 rounded-[1.25rem] bg-cell p-2 shadow-panel transition-shadow sm:flex-row sm:items-center',
            'focus-within:shadow-[0_0_0_4px_rgb(139_92_246/0.22)]',
            error && 'shadow-[0_0_0_2px_var(--color-danger)]',
          )}
        >
          <div className="relative flex min-w-0 flex-1 items-center">
            <Link2 className="pointer-events-none absolute left-3 size-[18px] text-ink-muted" aria-hidden />
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
                'rounded-[0.75rem] border-transparent pr-11 pl-10 focus-visible:border-transparent focus-visible:ring-0',
                lg ? 'h-12' : 'h-11',
              )}
            />
            {value ? (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  inputRef.current?.focus();
                }}
                className="absolute right-1 grid size-10 place-items-center rounded-full text-ink-faint hover:text-ink-muted"
                aria-label="Clear link"
              >
                <span className="grid size-[18px] place-items-center rounded-full bg-ink-faint/70 text-cell">
                  <X className="size-3" strokeWidth={3} />
                </span>
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="tinted" size={lg ? 'lg' : 'md'} onClick={paste} className="flex-1 rounded-[0.75rem] sm:flex-none">
              <ClipboardPaste />
              Paste
            </Button>
            <Button type="submit" variant="primary" size={lg ? 'lg' : 'md'} loading={busy} className="flex-1 rounded-[0.75rem] sm:flex-none">
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
        <span className="text-[0.8125rem] text-ink-muted">Try a sample</span>
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
            className="hit-area rounded-full bg-fill px-3 py-1 text-[0.8125rem] font-semibold text-accent-soft transition-colors hover:bg-fill-strong active:opacity-70 disabled:opacity-50"
          >
            {sample.label}
          </button>
        ))}
      </div>
    </div>
  );
}
