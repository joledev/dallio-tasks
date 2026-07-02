import { NextResponse } from 'next/server';
import { ok, err } from '@/core/shared/envelope';
import { pingDatabase } from '@/core/shared/health';

export async function GET() {
  const okDb = await pingDatabase();
  return NextResponse.json(okDb ? ok({ status: 'ready' }) : err('INTERNAL', 'db down'), {
    status: okDb ? 200 : 503,
  });
}
