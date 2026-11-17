ATLAS 1.1.0 — Delivery Package
==============================

Contents
--------
- Atlas-updated2.html  LATEST build (1.1.0) — first-run setup fix, in-place
                        saving (File System Access API: connect your file once
                        via Save, then every save writes into the same file),
                        Kanban board with drag & drop, command palette (Ctrl+K),
                        keyboard shortcuts (Ctrl+S save, / search).
- Atlas.html           Canonical build (identical to Atlas-updated2.html).
- Atlas-patch1         Initial patch package (JSON). Install via:
                        Patch Center -> Select file -> Install.
                        Adds the Announcements module and migrates the data
                        schema to v2. A recovery backup is created first.
- Atlas-User-Guide-FA.pdf   Persian user guide.
- Atlas-QA-Report.pdf  QA report: 6 test rounds, 135/135 checks, defect register.

First steps
-----------
1. Open Atlas-updated2.html in Chrome or Edge (in-place saving needs the
   File System Access API; Firefox/Safari fall back to download-on-save).
2. On the first-run setup screen create your administrator account
   (or press "بارگذاری داده‌های نمونه" for demo data).
3. Demo accounts (if demo data is loaded): admin / pm.user / team.lead /
   employee — password for all: atlas1234

Saving your data
----------------
Click Save (ذخیره) in the app. The first time, the browser asks which file to
connect — choose your Atlas file. After that, every save silently updates that
same file with your data embedded. Move the file to another computer to carry
your data with you.

Backups: use Backup (پشتیبان‌گیری) to export a full validated backup file,
and the restore wizard to bring it back (a recovery checkpoint is created first).
