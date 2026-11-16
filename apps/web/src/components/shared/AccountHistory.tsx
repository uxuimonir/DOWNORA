import type { HistoryEntry } from '@downora/types';
import { Badge, Button, Panel, PanelHeader, PanelTitle, toast } from '@downora/ui';
import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { formatBytes, relativeTime } from '@/lib/format';
import { useAccount } from '@/stores/account';

const SOURCE: Record<HistoryEntry['source'], string> = { web: 'Web app', extension: 'Extension', server: 'Converted' };

/** History stored in the user's account: web app, extension and server jobs together. */
export function AccountHistory() {
  const status = useAccount((s) => s.status);
  const [items, setItems] = useState<HistoryEntry[] | null>(null);
  useEffect(() => {
    if (status === 'signed_in') void api.history().then(setItems, () => setItems([]));
  }, [status]);
  if (status !== 'signed_in') return null;
  return (
    <Panel className="mt-8" data-testid="account-history">
      <PanelHeader>
        <PanelTitle>In your account</PanelTitle>
        <span className="text-xs text-ink-muted">From this browser, the extension and server conversions</span>
      </PanelHeader>
      {items === null ? (
        <p className="px-5 py-4 text-sm text-ink-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink-muted">Nothing synced yet. Downloads you finish while signed in appear here.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((h) => (
            <li key={h.id} className="flex items-center gap-4 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{h.fileName}</p>
                <p className="truncate text-xs text-ink-muted">
                  {[h.container.toUpperCase(), h.qualityLabel, h.sizeBytes ? formatBytes(h.sizeBytes) : null, relativeTime(h.createdAt)].filter(Boolean).join(', ')}
                </p>
              </div>
              <Badge tone={h.source === 'server' ? 'accent' : 'neutral'}>{SOURCE[h.source]}</Badge>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${h.fileName} from account history`}
                onClick={() =>
                  void api.deleteHistory(h.id).then(
                    () => setItems((c) => c?.filter((x) => x.id !== h.id) ?? null),
                    () => toast.error('Couldn’t remove it. Try again.'),
                  )
                }
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
