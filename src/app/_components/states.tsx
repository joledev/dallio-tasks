import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { messageFor } from '@/app/_lib/errors';

// Shared loading placeholder — `rows` skeleton lines. Table and board pass their own count.
export function LoadingState({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={className} role="status" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

// One empty presentation, two meanings: callers pass copy for "no data yet" vs "no match", plus an
// optional action (New task CTA / Clear filters).
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

// Maps the failed query's `error.code` to shared copy and offers a Retry that refetches.
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = messageFor(error);
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center"
    >
      <p className="text-sm font-medium">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
