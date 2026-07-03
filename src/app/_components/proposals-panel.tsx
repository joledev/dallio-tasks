'use client';

import { Check, CircleDot, ThumbsDown, ThumbsUp, Vote, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBoard } from '@/app/_components/board-context';
import {
  useBoardMode,
  useBoardParticipants,
  useBoardProposalMutations,
  useBoardProposals,
} from '@/app/_hooks/use-board-data';
import type { GuestParticipantDTO, ProposalDTO } from '@/app/_lib/types';
import { PRIORITY_LABEL } from '@/app/_lib/labels';
import { cn } from '@/lib/utils';

const DOT_CLASSES = [
  'bg-blue-500',
  'bg-green-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-cyan-500',
] as const;

function dotClassFor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return DOT_CLASSES[hash % DOT_CLASSES.length];
}

function participantName(id: string | null, participants: GuestParticipantDTO[]): string {
  if (!id) return 'System';
  return participants.find((participant) => participant.id === id)?.displayName ?? 'Someone';
}

function proposalTitle(proposal: ProposalDTO): string {
  const payload = proposal.payload as Record<string, unknown>;
  if (proposal.kind === 'CREATE_TASK') return `Create "${String(payload.title ?? 'Untitled')}"`;
  if (proposal.kind === 'UPDATE_TASK') return `Update "${String(payload.title ?? 'task')}"`;
  if (proposal.kind === 'MOVE_TASK') return 'Move task';
  if (proposal.kind === 'DELETE_TASK') return 'Delete task';
  if (proposal.kind === 'ASSIGN_TASK') return 'Change assignee';
  return 'Task change';
}

function proposalDetail(proposal: ProposalDTO, participants: GuestParticipantDTO[]): string {
  const payload = proposal.payload as Record<string, unknown>;
  if (proposal.kind === 'CREATE_TASK') {
    return `Priority ${PRIORITY_LABEL[String(payload.priority ?? 'MEDIUM') as keyof typeof PRIORITY_LABEL]}`;
  }
  if (proposal.kind === 'UPDATE_TASK') return Object.keys(payload).join(', ');
  if (proposal.kind === 'MOVE_TASK') return `Position ${String(payload.position ?? 0)}`;
  if (proposal.kind === 'ASSIGN_TASK') {
    const id =
      typeof payload.assigneeParticipantId === 'string' ? payload.assigneeParticipantId : null;
    return id ? `Assign to ${participantName(id, participants)}` : 'Clear assignee';
  }
  return 'Pending approval';
}

export function BoardModeToggle() {
  const board = useBoard();
  const { mode } = useBoardMode(board.token);
  const { data: participants = [] } = useBoardParticipants(board.token);
  const { setMode } = useBoardProposalMutations(board.token);
  const isCreator = Boolean(board.participant && participants[0]?.id === board.participant.id);

  return (
    <Button
      type="button"
      variant={mode === 'VOTE' ? 'default' : 'outline'}
      size="sm"
      disabled={!isCreator || setMode.isPending}
      onClick={() => setMode.mutate({ mode: mode === 'VOTE' ? 'DIRECT' : 'VOTE' })}
      title={isCreator ? 'Toggle voting mode' : 'Only the first participant can change voting mode'}
    >
      <Vote className="size-4" />
      {mode === 'VOTE' ? 'Voting' : 'Direct'}
    </Button>
  );
}

export function ProposalsPanel() {
  const board = useBoard();
  const { mode } = useBoardMode(board.token);
  const { proposals } = useBoardProposals(board.token);
  const { data: participants = [] } = useBoardParticipants(board.token);
  const { vote } = useBoardProposalMutations(board.token);

  if (mode !== 'VOTE') return null;

  const pending = proposals.filter((proposal) => proposal.status === 'PENDING');

  return (
    <aside aria-label="Proposals" className="border-border rounded-md border">
      <div className="border-border flex items-center gap-2 border-b px-3 py-2 text-sm font-medium">
        <Vote className="size-4" aria-hidden />
        <span>Proposals</span>
      </div>
      <div className="max-h-96 space-y-3 overflow-y-auto p-3">
        {pending.length === 0 ? (
          <p className="text-muted-foreground py-3 text-sm">No pending proposals</p>
        ) : (
          pending.map((proposal) => {
            const approvals = proposal.votes.filter((item) => item.value === 'APPROVE');
            const rejections = proposal.votes.filter((item) => item.value === 'REJECT');
            const myVote = proposal.votes.find(
              (item) => item.participantId === board.participant?.id,
            );
            return (
              <article key={proposal.id} className="bg-card rounded-md border p-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{proposalTitle(proposal)}</p>
                  <p className="text-muted-foreground text-xs">
                    Proposed by {participantName(proposal.createdByParticipantId, participants)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {proposalDetail(proposal, participants)}
                  </p>
                </div>

                <div className="mt-3 flex items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1">
                    <Check className="size-3.5 text-green-600" aria-hidden />
                    {approvals.length}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <X className="size-3.5 text-red-600" aria-hidden />
                    {rejections.length}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {proposal.votes.map((item) => (
                    <span
                      key={item.id}
                      className="border-border inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-1 text-xs"
                      title={participantName(item.participantId, participants)}
                    >
                      <span
                        className={cn('size-2 rounded-full', dotClassFor(item.participantId))}
                        aria-hidden
                      />
                      {item.value === 'APPROVE' ? (
                        <ThumbsUp className="size-3" aria-label="Approved" />
                      ) : (
                        <ThumbsDown className="size-3" aria-label="Rejected" />
                      )}
                    </span>
                  ))}
                  {proposal.votes.length === 0 ? (
                    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                      <CircleDot className="size-3" aria-hidden />
                      No votes
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={myVote?.value === 'APPROVE' ? 'default' : 'outline'}
                    size="sm"
                    disabled={vote.isPending}
                    onClick={() => vote.mutate({ id: proposal.id, value: 'APPROVE' })}
                  >
                    <ThumbsUp className="size-4" />
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant={myVote?.value === 'REJECT' ? 'destructive' : 'outline'}
                    size="sm"
                    disabled={vote.isPending}
                    onClick={() => vote.mutate({ id: proposal.id, value: 'REJECT' })}
                  >
                    <ThumbsDown className="size-4" />
                    Reject
                  </Button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </aside>
  );
}
