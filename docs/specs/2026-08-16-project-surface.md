# The project's own commands and instructions

Status: **NEED GRILLING.** High-level. Not an approved contract.

## Problem

The slash menu offers three commands: `commit`, `compact`, `model`. The app
hard-codes all three. A project cannot add its own, and pi's own commands never
reach the menu.

The instruction file has the same shape of problem. pi reads a project's
instruction file at the start of a session. PiOcarina never shows which file that
was, or what it said. A reader who wonders why the agent behaves a certain way
has to leave the app to find out.

## Desired outcome

The reader sees what the project told the agent, and can run what the project
defines, from the same menu as the built-in commands.

## In scope

- Discovering the commands a project defines, and pi's own commands.
- Showing them in the slash menu with their source.
- Showing which instruction file the session loaded, and its content.
- What happens when a command or the instruction file changes on disk.

## Out of scope

- Authoring commands inside PiOcarina. A file on disk stays the source.
- Running a project command outside a thread.
- Any instruction file format PiOcarina invents. The project uses what pi uses.

## Acceptance behavior

- A project with its own commands shows them in the slash menu.
- Each entry states where it came from: built in, project, or pi.
- A project with no commands shows the built-in three, as today.
- The reader can read the loaded instruction file without leaving the app.
- A malformed command file names itself in an error, and the rest still work.

## Constraints

- Discovery happens in the main process. The renderer receives a list.
- Reading files a project owns is a read. It never writes to them.
- The slash menu is a spotlight. Its filtering and keys stay as they are.
- Command names come from disk, which is untrusted text. A name is data, never
  markup, and never a shell fragment.

## Validation

- Tests over a fixture project: commands present, absent, and malformed.
- A live pass: a project command runs and its result appears in the ledger.

## Questions the grill must answer

1. Does pi expose its commands over the SDK, or must PiOcarina read the files?
2. Does a project command produce a prompt, run a shell command, or either?
3. What does a project command mean for a terminal column, which has no session?
4. Is the instruction file a block in the transcript, an overlay, or a settings
   panel entry?
5. Does the app watch these files, or read them when a session starts?
6. Do arguments to a command need a syntax, and is it pi's syntax or ours?
