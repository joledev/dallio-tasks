'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Clipboard, ExternalLink, Plus, QrCode } from 'lucide-react';
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
import { ownerBoardKeys } from '@/app/_lib/query-keys';
import type { BoardDTO } from '@/app/_lib/types';
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
        <p className="text-muted-foreground truncate text-xs">{url || 'Preparing invite link'}</p>
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

function BoardCard({ board }: { board: BoardDTO }) {
  const href = `/b/${encodeURIComponent(board.shareToken)}`;
  const taskLabel = board.taskCount === 1 ? '1 task' : `${board.taskCount ?? 0} tasks`;

  return (
    <Card>
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
      <CardContent>
        <BoardInvite board={board} />
      </CardContent>
      <CardFooter>
        <Button type="button" className="min-h-11 w-full" asChild>
          <Link href={href}>
            <ExternalLink aria-hidden />
            Open board
          </Link>
        </Button>
      </CardFooter>
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
