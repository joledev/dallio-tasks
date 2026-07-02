# Dallio — Task Tracker Take-Home

Thanks for taking the time on this. This is a **from-scratch build**: the repo
ships with a spec and our engineering conventions, and **no starter code**. We
want to see how you take a bounded-but-ambiguous problem from zero to a working,
reviewable application.

## What you're building

A small **task tracker**. At minimum, a team should be able to:

- Create, read, update, and delete **tasks** (title, description, status, priority).
- **Assign** a task to a user.
- Set and change a task's **priority**.
- List tasks with basic **filtering** (by status, assignee, priority) and **sorting**.

It must run end-to-end: a backend with a persistent store, plus a client (web)
that a human can actually click through. Responsive / mobile-friendly web is a
plus, not a requirement.

## Deliverables

The working app, with run instructions (in this README or a `RUNNING.md`).

## Bonus

- **App Deployed**: app available over the internet.
- **Auth**: signup / login, and scope tasks to the signed-in user or team. Roll
  your own or use any third-party provider.
- **An agent interface**: a CLI or MCP server that can drive the tracker
  (create / list / update tasks) without the web UI.
- **Tests**: show us how you think about testing.
