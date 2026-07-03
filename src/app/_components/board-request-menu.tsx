'use client';

import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { boardApi, ApiError } from '@/app/_lib/api';
import { useBoard } from '@/app/_components/board-context';

// Guests can never rename/delete a board directly (only the owner can, from the dashboard) — this is
// the request surface: a subtle menu that files a RENAME or DELETE request for the owner to
// approve/reject. Success is a toast only; there is no client-visible request list for guests.

function RequestRenameDialog({
  token,
  open,
  onOpenChange,
}: {
  token: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      boardApi(token).requestBoardChange({ kind: 'RENAME', proposedName: name.trim() }),
    onSuccess: () => {
      toast.success('Request sent to the board owner.');
      onOpenChange(false);
      setName('');
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Could not send the request.');
    },
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a rename</DialogTitle>
          <DialogDescription>
            The board owner will see this request and can approve or reject it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="request-rename-name">New name</Label>
            <Input
              id="request-rename-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Launch plan"
              className="min-h-11"
              autoFocus
            />
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="submit"
              className="min-h-11 w-full sm:w-auto"
              disabled={mutation.isPending || name.trim().length === 0}
            >
              {mutation.isPending ? 'Sending...' : 'Send request'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RequestDeleteDialog({
  token,
  open,
  onOpenChange,
}: {
  token: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const mutation = useMutation({
    mutationFn: () => boardApi(token).requestBoardChange({ kind: 'DELETE' }),
    onSuccess: () => {
      toast.success('Request sent to the board owner.');
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Could not send the request.');
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Request board deletion?</AlertDialogTitle>
          <AlertDialogDescription>
            The board owner will be asked to approve deleting this board. This cannot be undone if
            approved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
            disabled={mutation.isPending}
          >
            Send request
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function BoardRequestMenu() {
  const { token } = useBoard();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="min-h-11">
            <MessageSquarePlus className="size-4" aria-hidden />
            Request changes
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setRenameOpen(true);
            }}
          >
            Request rename
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={(event) => {
              event.preventDefault();
              setDeleteOpen(true);
            }}
          >
            Request delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RequestRenameDialog token={token} open={renameOpen} onOpenChange={setRenameOpen} />
      <RequestDeleteDialog token={token} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  );
}
