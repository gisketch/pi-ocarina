# 14 — Images and file attachments

**What to build:** Allow images and files to reach Pi through picker, clipboard paste, drag-and-drop, and mentions while drafts remain recoverable.

**Blocked by:** 13 — Composer controls and runtime commands

**Status:** complete

- [x] Native picker, paste, and drag/drop create the same validated attachment model in both composer surfaces.
- [x] Attachment previews can be removed and clear after successful submission.
- [x] Draft attachments persist separately from general UI state and migrate safely from legacy inline state when encountered.
- [x] A live Pi run receives attached files and images as usable context.
