'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { boardApi, ApiError } from '@/app/_lib/api';
import { useBoard } from '@/app/_components/board-context';
import { joinBoardSchema, type JoinBoardInput } from '@/core/participants/schema';

// The join gate. Blocking + non-dismissible while `!isJoined` (Escape / outside-click / close button all
// suppressed) — the guest cannot reach the board without a display name. Radix focus-traps the dialog and
// wires the labelled title/description (WCAG 2.2). Validation reuses `joinBoardSchema` (the SAME 1..40
// trimmed non-empty contract the server enforces). On success the server has set the httpOnly session
// cookie; we call `router.refresh()` (UI-H5) so the server component re-runs `resolveActor`, re-derives
// `participant`/`isJoined`, and swaps this dialog for the board. This dialog is UX only — it is NEVER the
// auth control (the server re-checks the cookie on every call).
export function JoinDialog({ boardName }: { boardName: string }) {
  const { token, isJoined } = useBoard();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<JoinBoardInput>({
    resolver: zodResolver(joinBoardSchema),
    defaultValues: { displayName: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await boardApi(token).join(values);
      router.refresh(); // UI-H5 — re-derive session state on the server; the dialog then unmounts.
    } catch (error) {
      // Surface the API message (e.g. LIMIT_EXCEEDED → "This board is full"). A stale/garbage cookie
      // does not block a fresh join — the server mints a new session.
      setFormError(error instanceof ApiError ? error.message : 'Could not join. Please try again.');
    }
  });

  const isPending = form.formState.isSubmitting;

  return (
    <Dialog open={!isJoined}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Join {boardName}</DialogTitle>
          <DialogDescription>
            Choose a display name so others on the board can see who made each change.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Grace" autoFocus maxLength={40} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {formError ? (
              <p role="alert" className="text-destructive text-sm">
                {formError}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="submit" className="w-full sm:w-auto" disabled={isPending}>
                {isPending ? 'Joining…' : 'Join board'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
