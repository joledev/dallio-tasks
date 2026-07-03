'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, QrCode } from 'lucide-react';
import { ActivityFeed } from '@/app/_components/activity-feed';
import { PresenceStrip } from '@/app/_components/presence-strip';
import { useBoard } from '@/app/_components/board-context';
import { Button } from '@/components/ui/button';

export function PresentScreen({ boardName }: { boardName: string }) {
  const { token } = useBoard();
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const path = `/b/${encodeURIComponent(token)}`;
  const url = origin ? `${origin}${path}` : '';

  return (
    <main className="flex-1">
      <div className="mx-auto grid min-h-dvh w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:px-8">
        <section className="flex min-w-0 flex-col justify-center gap-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
                {boardName}
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">Scan to join this board.</p>
            </div>
            <Button type="button" variant="outline" className="min-h-11" asChild>
              <Link href={path}>
                <ArrowLeft aria-hidden />
                Board
              </Link>
            </Button>
          </div>

          <div className="grid place-items-center rounded-md border bg-white p-4 sm:p-8">
            {url ? (
              <QRCodeSVG
                value={url}
                size={360}
                level="M"
                includeMargin
                className="h-auto w-full max-w-[min(72vw,420px)]"
                title={`${boardName} invite QR`}
              />
            ) : (
              <div className="text-muted-foreground grid aspect-square w-full max-w-[min(72vw,420px)] place-items-center rounded-md border bg-zinc-50">
                <QrCode className="size-16" aria-hidden />
                <span className="sr-only">Preparing QR</span>
              </div>
            )}
          </div>

          {url ? (
            <p className="text-muted-foreground text-center text-sm break-all">{url}</p>
          ) : (
            <div className="h-5" aria-hidden />
          )}
        </section>

        <aside className="min-w-0 space-y-4">
          <PresenceStrip />
          <ActivityFeed />
        </aside>
      </div>
    </main>
  );
}
