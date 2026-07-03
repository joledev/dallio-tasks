'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowRight,
  Check,
  Clipboard,
  ExternalLink,
  Inbox,
  Pencil,
  Plus,
  QrCode,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/app/_lib/api';
import { messageFor } from '@/app/_lib/errors';
import { ownerBoardKeys, boardRequestKeys } from '@/app/_lib/query-keys';
import type { BoardDTO, BoardRequestDTO } from '@/app/_lib/types';
import { QrScannerDialog } from '@/app/_components/qr-scanner-dialog';

function BoardInvite({ board }: { board: BoardDTO }) {
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const href = `/b/${encodeURIComponent(board.shareToken)}`;
  const url = origin ? `${origin}${href}` : '';

  return (
    <div className="flex items-center gap-3">
      <div className="grid size-20 shrink-0 place-items-center rounded-md border bg-white p-2">
        {url ? (
          <QRCodeSVG value={url} size={64} level="M" title={`${board.name} invite QR`} />
        ) : (
          <QrCode className="size-8 text-zinc-400" aria-hidden />
        )}
      </div>
      <div className="min-w-0 space-y-2">
        {/* break-all (not truncate): a nowrap URL sets the grid track's min-content width and pushes the
            whole card — and the page — wider than a phone screen. Wrapping keeps the dashboard in-bounds. */}
        <p className="text-muted-foreground text-xs break-all">{url || 'Preparing invite link'}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="min-h-11" asChild>
            <Link href={`${href}/present`}>
              <QrCode aria-hidden />
              Present
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={!url}
            onClick={() => {
              if (url) void navigator.clipboard?.writeText(url);
            }}
          >
            <Clipboard aria-hidden />
            Copy
          </Button>
        </div>
      </div>
    </div>
  );
}

function RenameBoardDialog({
  board,
  open,
  onOpenChange,
}: {
  board: BoardDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(board.name);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(board.name);
      setError(null);
    }
  }, [open, board.name]);

  const mutation = useMutation({
    mutationFn: () => api.renameBoard(board.shareToken, { name }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ownerBoardKeys.all });
      toast.success('Board renamed.');
      onOpenChange(false);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Could not rename board.');
    },
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename board</DialogTitle>
          <DialogDescription>Choose a new name for &quot;{board.name}&quot;.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rename-board-name">Board name</Label>
            <Input
              id="rename-board-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
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
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteBoardDialog({
  board,
  open,
  onOpenChange,
}: {
  board: BoardDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => api.deleteBoard(board.shareToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ownerBoardKeys.all });
      toast.success('Board deleted.');
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete board.');
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this board?</AlertDialogTitle>
          <AlertDialogDescription>
            &quot;{board.name}&quot; and all of its tasks will be permanently removed. This
            can&apos;t be undone.
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
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const REQUEST_KIND_LABEL: Record<BoardRequestDTO['kind'], string> = {
  RENAME: 'Rename',
  DELETE: 'Delete',
};

function BoardRequestsDialog({
  board,
  open,
  onOpenChange,
}: {
  board: BoardDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const requests = useQuery({
    queryKey: boardRequestKeys(board.shareToken).all,
    queryFn: () => api.listBoardRequests(board.shareToken),
    enabled: open,
  });

  const resolve = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      api.resolveBoardRequest(board.shareToken, id, action),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: boardRequestKeys(board.shareToken).all }),
        queryClient.invalidateQueries({ queryKey: ownerBoardKeys.all }),
      ]);
      toast.success(variables.action === 'approve' ? 'Request approved.' : 'Request rejected.');
    },
    onError: (err) => toast.error(messageFor(err)),
  });

  const pending = requests.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pending requests</DialogTitle>
          <DialogDescription>
            Guests on &quot;{board.name}&quot; have asked for these changes.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {requests.isLoading ? <Skeleton className="h-16 w-full" /> : null}
          {!requests.isLoading && pending.length === 0 ? (
            <p className="text-muted-foreground py-3 text-sm">No pending requests.</p>
          ) : null}
          {pending.map((request) => (
            <div
              key={request.id}
              className="border-border flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {REQUEST_KIND_LABEL[request.kind]}
                  {request.kind === 'RENAME' && request.proposedName
                    ? ` to "${request.proposedName}"`
                    : null}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  Requested by {request.requesterName ?? 'a guest'}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="min-h-11 min-w-11"
                  disabled={resolve.isPending}
                  aria-label="Approve request"
                  onClick={() => resolve.mutate({ id: request.id, action: 'approve' })}
                >
                  <Check aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="min-h-11 min-w-11"
                  disabled={resolve.isPending}
                  aria-label="Reject request"
                  onClick={() => resolve.mutate({ id: request.id, action: 'reject' })}
                >
                  <X aria-hidden />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BoardCard({ board }: { board: BoardDTO }) {
  const href = `/b/${encodeURIComponent(board.shareToken)}`;
  const taskLabel = board.taskCount === 1 ? '1 task' : `${board.taskCount ?? 0} tasks`;
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);

  return (
    // min-w-0: let this grid item shrink below its content width so a long child can't widen the row.
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{board.name}</CardTitle>
            <CardDescription>{taskLabel}</CardDescription>
          </div>
          <Button type="button" size="icon" variant="ghost" className="min-h-11 min-w-11" asChild>
            <Link href={href} aria-label={`Open ${board.name}`}>
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <BoardInvite board={board} />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => setRenameOpen(true)}
          >
            <Pencil aria-hidden />
            Rename
          </Button>
          {!board.protected ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 aria-hidden />
              Delete
            </Button>
          ) : null}
          {board.pendingRequestCount ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => setRequestsOpen(true)}
            >
              <Inbox aria-hidden />
              {board.pendingRequestCount === 1
                ? '1 request'
                : `${board.pendingRequestCount} requests`}
            </Button>
          ) : null}
        </div>
      </CardContent>
      <CardFooter>
        <Button type="button" className="min-h-11 w-full" asChild>
          <Link href={href}>
            <ExternalLink aria-hidden />
            Open board
          </Link>
        </Button>
      </CardFooter>

      <RenameBoardDialog board={board} open={renameOpen} onOpenChange={setRenameOpen} />
      <DeleteBoardDialog board={board} open={deleteOpen} onOpenChange={setDeleteOpen} />
      <BoardRequestsDialog board={board} open={requestsOpen} onOpenChange={setRequestsOpen} />
    </Card>
  );
}

function CreateBoardDialog() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.createBoard({ name }),
    onSuccess: async (board) => {
      await queryClient.invalidateQueries({ queryKey: ownerBoardKeys.all });
      setOpen(false);
      setName('');
      router.push(`/b/${encodeURIComponent(board.shareToken)}`);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Could not create board.');
    },
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" className="min-h-11">
          <Plus aria-hidden />
          New board
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create board</DialogTitle>
          <DialogDescription>
            Name the board, then invite collaborators from its card.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="board-name">Board name</Label>
            <Input
              id="board-name"
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
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Creating...' : 'Create board'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BoardGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-20" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function Home() {
  const boards = useQuery({
    queryKey: ownerBoardKeys.all,
    queryFn: api.listBoards,
  });

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Boards</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Create a board, open its live workspace, or share an invite QR.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <QrScannerDialog />
            <CreateBoardDialog />
          </div>
        </header>

        {boards.isLoading ? <BoardGridSkeleton /> : null}
        {boards.isError ? (
          <Card>
            <CardContent className="pt-4 sm:pt-5">
              <p role="alert" className="text-destructive text-sm">
                Could not load boards.
              </p>
            </CardContent>
          </Card>
        ) : null}
        {boards.data?.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No boards yet</CardTitle>
              <CardDescription>Create your first board to start collaborating.</CardDescription>
            </CardHeader>
          </Card>
        ) : null}
        {boards.data && boards.data.length > 0 ? (
          <section aria-label="Your boards" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {boards.data.map((board) => (
              <BoardCard key={board.shareToken} board={board} />
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}
