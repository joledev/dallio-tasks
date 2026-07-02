'use client';

import { useEffect } from 'react';
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
  StatusEnum,
  type TaskPriority,
  type TaskStatus,
} from '@/core/tasks/schema';
import { ApiError } from '@/app/_lib/api';
import { STATUS_LABEL, PRIORITY_LABEL } from '@/app/_lib/labels';
import { useTaskMutations } from '@/app/_hooks/use-task-mutations';
import type { TaskDTO } from '@/app/_lib/types';

// One form shape for both modes. `status` is only surfaced (and validated) in edit mode — create
// forbids it (the server sets TODO) and forbids assignee (assignment has its own path).
type TaskFormValues = {
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
};

type TaskDialogProps =
  | { mode: 'create'; task?: undefined; open: boolean; onOpenChange: (open: boolean) => void }
  | { mode: 'edit'; task: TaskDTO; open: boolean; onOpenChange: (open: boolean) => void };

const emptyDefaults: TaskFormValues = {
  title: '',
  description: '',
  priority: 'MEDIUM',
  status: 'TODO',
};

function defaultsFor(task: TaskDTO | undefined): TaskFormValues {
  if (!task) return emptyDefaults;
  return {
    title: task.title,
    description: task.description ?? '',
    priority: task.priority,
    status: task.status,
  };
}

export function TaskDialog(props: TaskDialogProps) {
  const { mode, task, open, onOpenChange } = props;
  const { create, update } = useTaskMutations();

  const form = useForm<TaskFormValues>({
    // Cast: the resolver is a create/update schema union while the form is one fixed shape (status is
    // only submitted in edit mode) — the shapes don't line up structurally, so we assert the target.
    resolver: zodResolver(
      mode === 'create' ? createTaskSchema : updateTaskSchema,
    ) as Resolver<TaskFormValues>,
    defaultValues: defaultsFor(task),
  });

  // Refresh the form whenever it (re)opens so edit shows the latest task and create starts clean.
  useEffect(() => {
    if (open) form.reset(defaultsFor(task));
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
          priority: values.priority,
        });
        toast.success('Task created.');
      } else {
        await update.mutateAsync({
          id: task.id,
          patch: {
            title: values.title,
            description: description === '' ? null : description,
            status: values.status,
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
              ? 'Add a task. It starts in To do and unassigned.'
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

            {mode === 'edit' ? (
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {StatusEnum.options.map((value) => (
                          <SelectItem key={value} value={value}>
                            {STATUS_LABEL[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

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
