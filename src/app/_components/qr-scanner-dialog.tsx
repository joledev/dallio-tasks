'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, ScanLine } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
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
import { extractSameOriginBoardToken } from '@/app/_lib/qr-token';

type ScanState = 'idle' | 'starting' | 'scanning' | 'disabled' | 'fallback';

function mediaAvailable(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

function secureContext(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext;
}

export function QrScannerDialog() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<{ stop(): void } | null>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ScanState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [canScan, setCanScan] = useState(false);

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const pushToken = useCallback(
    (raw: string): boolean => {
      const token = extractSameOriginBoardToken(raw, window.location.origin);
      if (!token) {
        setMessage('Use a Dallio board URL from this site.');
        return false;
      }
      stopCamera();
      setOpen(false);
      router.push(`/b/${encodeURIComponent(token)}`);
      return true;
    },
    [router, stopCamera],
  );

  useEffect(() => {
    setCanScan(mediaAvailable() && secureContext());
  }, []);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setState('idle');
      setMessage(null);
      return;
    }

    if (!secureContext()) {
      setState('disabled');
      setMessage('Camera scanning needs HTTPS. Paste a board URL or token instead.');
      return;
    }

    if (!mediaAvailable()) {
      setState('fallback');
      setMessage('No camera is available on this device. Paste a board URL or token instead.');
      return;
    }

    let cancelled = false;
    setState('starting');
    setMessage(null);

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 300 });
        controlsRef.current = await reader.decodeFromVideoElement(video, (result) => {
          const text = result?.getText();
          if (text) pushToken(text);
        });
        if (!cancelled) setState('scanning');
      } catch (error) {
        stopCamera();
        const name = error instanceof DOMException ? error.name : '';
        if (name === 'NotAllowedError') {
          setMessage('Camera permission was blocked. Paste a board URL or token instead.');
        } else if (name === 'NotFoundError') {
          setMessage('No camera was found. Paste a board URL or token instead.');
        } else {
          setMessage('Camera scanning is unavailable. Paste a board URL or token instead.');
        }
        setState('fallback');
      }
    }

    void start();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, pushToken, stopCamera]);

  const manualSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = manual.trim();
    if (!value) return;
    const normalized = value.includes('/') ? value : `/b/${value}`;
    if (pushToken(normalized)) setManual('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {canScan ? (
        <DialogTrigger asChild>
          <Button type="button" variant="outline" className="min-h-11">
            <ScanLine aria-hidden />
            Scan QR
          </Button>
        </DialogTrigger>
      ) : null}
      {!canScan ? (
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(true)}>
          <Camera aria-hidden />
          Enter invite
        </Button>
      ) : null}
      {/* Cap the dialog to the viewport and let it scroll: on a short phone the camera preview + form
          must never overflow off-screen or push the manual-input fallback out of reach. */}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Scan QR</DialogTitle>
          <DialogDescription>Scan a Dallio board invite or paste its URL.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {canScan ? (
            // Cap the preview height so a tall/narrow phone doesn't give the camera the whole screen.
            <div className="bg-muted relative aspect-[4/3] max-h-[45vh] w-full overflow-hidden rounded-md border">
              <video
                ref={videoRef}
                muted
                playsInline
                className="h-full w-full object-cover"
                aria-label="Camera preview"
              />
              {state === 'starting' ? (
                <div className="text-muted-foreground absolute inset-0 grid place-items-center text-sm">
                  Starting camera
                </div>
              ) : null}
            </div>
          ) : null}

          {message ? (
            <p role="status" className="text-muted-foreground text-sm">
              {message}
            </p>
          ) : null}

          <form onSubmit={manualSubmit} className="space-y-3">
            <Input
              value={manual}
              onChange={(event) => setManual(event.target.value)}
              placeholder="Paste /b/token, full URL, or token"
              aria-label="Board invite URL or token"
              className="min-h-11"
            />
            <DialogFooter>
              <Button type="submit" className="min-h-11 w-full sm:w-auto">
                Open board
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
