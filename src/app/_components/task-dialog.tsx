'use client';

import { useEffect, useRef } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
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
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createTaskSchema,
  updateTaskSchema,
  PriorityEnum,
  type TaskPriority,
} from '@/core/tasks/schema';
import { ApiError } from '@/app/_lib/api';
import { PRIORITY_LABEL } from '@/app/_lib/labels';
import { useTaskMutations } from '@/app/_hooks/use-task-mutations';
import { useStatuses } from '@/app/_hooks/use-statuses';
import { StatusField } from '@/app/_components/status-field';
import type { TaskDTO } from '@/app/_lib/types';

// One form shape for both modes. Status is now a real create-time choice (the server resolves the
// default only when `statusId` is omitted), so it is surfaced in both create and edit.
type TaskFormValues = {
  title: string;
  description: string;
  priority: TaskPriority;
  statusId: string;
};

type TaskDialogProps =
  | { mode: 'create'; task?: undefined; open: boolean; onOpenChange: (open: boolean) => void }
  | { mode: 'edit'; task: TaskDTO; open: boolean; onOpenChange: (open: boolean) => void };

const emptyDefaults: TaskFormValues = {
  title: '',
  description: '',
  priority: 'MEDIUM',
  statusId: '',
};

// Create pre-selects the owner's default status (falling back to the first column) so the field is
// never empty; edit shows the task's current status. An empty create `statusId` lets the server pick.
function defaultsFor(task: TaskDTO | undefined, defaultStatusId: string): TaskFormValues {
  if (!task) return { ...emptyDefaults, statusId: defaultStatusId };
  return {
    title: task.title,
    description: task.description ?? '',
    priority: task.priority,
    statusId: task.statusId,
  };
}

export function TaskDialog(props: TaskDialogProps) {
  const { mode, task, open, onOpenChange } = props;
  const { create, update } = useTaskMutations();
  const { statuses } = useStatuses();

  const defaultStatusId = statuses.find((s) => s.isDefault)?.id ?? statuses[0]?.id ?? '';

  const form = useForm<TaskFormValues>({
    // Cast: the resolver is a create/update schema union while the form is one fixed shape — the shapes
    // don't line up structurally (optional vs required fields), so we assert the target.
    resolver: zodResolver(
      mode === 'create' ? createTaskSchema : updateTaskSchema,
    ) as Resolver<TaskFormValues>,
    defaultValues: defaultsFor(task, defaultStatusId),
  });

  // Keep the latest default status id in a ref so the reset can read it without depending on it —
  // otherwise a status-list refetch (e.g. an inline create-and-select) would re-run the reset and
  // clobber the statusId that StatusField just set.
  const defaultStatusIdRef = useRef(defaultStatusId);
  defaultStatusIdRef.current = defaultStatusId;

  // Refresh the form only when it (re)opens or the edited task changes — never when the status list
  // updates — so edit shows the latest task, create starts clean, and an inline create-and-select sticks.
  useEffect(() => {
    if (open) form.reset(defaultsFor(task, defaultStatusIdRef.current));
  }, [open, task, form]);

  // The server re-validates and is authoritative; map a VALIDATION_ERROR's flattened field errors
  // back onto the corresponding form fields.
  const applyServerErrors = (error: unknown) => {
    if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return;
    const details = error.details as { fieldErrors?: Record<string, string[]> } | undefined;
    for (const [field, messages] of Object.entries(details?.fieldErrors ?? {})) {
      if (messages?.[0] && field in emptyDefaults) {
        form.setError(field as keyof TaskFormValues, { type: 'server', message: messages[0] });
      }
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    const description = values.description.trim();
    try {
      if (mode === 'create') {
        await create.mutateAsync({
          title: values.title,
          description: description === '' ? undefined : description,
          statusId: values.statusId || undefined, // omitted → server resolves the default
          priority: values.priority,
        });
        toast.success('Task created.');
      } else {
        await update.mutateAsync({
          id: task.id,
          patch: {
            title: values.title,
            description: description === '' ? null : description,
            statusId: values.statusId,
            priority: values.priority,
          },
        });
        toast.success('Task updated.');
      }
      onOpenChange(false);
    } catch (error) {
      applyServerErrors(error); // toast already surfaced by the mutation
    }
  });

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'New task' : 'Edit task'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Add a task. Pick a status or leave the default; it starts unassigned.'
              : 'Update the task details.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Task title" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Optional details" rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PriorityEnum.options.map((value) => (
                        <SelectItem key={value} value={value}>
                          {PRIORITY_LABEL[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="statusId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <StatusField
                    value={field.value || undefined}
                    onChange={field.onChange}
                    triggerClassName="w-full"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {mode === 'create' ? 'Create task' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
