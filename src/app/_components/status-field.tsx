'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStatuses } from '@/app/_hooks/use-statuses';
import { useStatusMutations } from '@/app/_hooks/use-status-mutations';
import { ApiError } from '@/app/_lib/api';
import { STATUS_COLORS, type StatusColor } from '@/core/statuses/schema';
import { cn } from '@/lib/utils';

// Radix Select forbids an empty value, so the create affordance gets a sentinel that opens the inline
// form instead of selecting a status.
const ADD = '__add_status__';

// Solid swatch dot per palette token (the badge uses bg/text pairs; the picker just needs a color dot).
const DOT_CLASS: Record<StatusColor, string> = {
  zinc: 'bg-zinc-400',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  violet: 'bg-violet-500',
  rose: 'bg-rose-500',
};

type StatusFieldProps = {
  value: string | undefined; // statusId
  onChange: (statusId: string) => void;
  disabled?: boolean;
  size?: 'sm' | 'default';
  triggerClassName?: string;
  ariaLabel?: string;
};

// The one status control: a data-driven select over the live status list plus an inline "Add status…"
// affordance that creates a status and selects it in place (create-and-select). Reused by the inline
// `StatusSelect` (cards/table) and the task dialog so there is a single add-status implementation.
export function StatusField({
  value,
  onChange,
  disabled,
  size = 'default',
  triggerClassName,
  ariaLabel = 'Status',
}: StatusFieldProps) {
  const { statuses } = useStatuses();
  const { create } = useStatusMutations();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<StatusColor>('zinc');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setAdding(false);
    setName('');
    setColor('zinc');
    setError(null);
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter a status name');
      return;
    }
    try {
      const created = await create.mutateAsync({ name: trimmed, color });
      onChange(created.id); // create-and-select in place (the cache already holds the new status)
      reset();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not add status');
    }
  };

  return (
    <div className="space-y-2">
      <Select
        value={value}
        onValueChange={(v) => {
          // Radix can emit a spurious empty value while the option list changes (e.g. right after a
          // create-and-select adds a new option); there is no empty option, so ignore it rather than
          // clobber the just-selected status.
          if (v === ADD) setAdding(true);
          else if (v) onChange(v);
        }}
        disabled={disabled}
      >
        <SelectTrigger size={size} className={triggerClassName} aria-label={ariaLabel}>
          <SelectValue placeholder="Select status" />
        </SelectTrigger>
        <SelectContent>
          {statuses.map((status) => (
            <SelectItem key={status.id} value={status.id}>
              {status.name}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={ADD}>
            <span className="flex items-center gap-2">
              <Plus className="size-4" />
              Add status
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      {adding ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Status name"
            aria-label="New status name"
            autoFocus
            className="h-8 min-w-[9rem] flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <Select value={color} onValueChange={(v) => setColor(v as StatusColor)}>
            <SelectTrigger size="sm" className="w-[130px]" aria-label="Status color">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_COLORS.map((token) => (
                <SelectItem key={token} value={token}>
                  <span className="flex items-center gap-2">
                    <span
                      className={cn('size-3 rounded-full border', DOT_CLASS[token])}
                      aria-hidden
                    />
                    <span className="capitalize">{token}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" onClick={() => void submit()} disabled={create.isPending}>
            Add
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={reset}>
            Cancel
          </Button>
          {error ? (
            <p role="alert" className="text-destructive w-full text-sm">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
