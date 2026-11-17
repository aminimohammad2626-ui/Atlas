ATLAS 1.0.0 — Delivery Package
==============================

Contents
--------
- Atlas.html            The complete self-contained application (Persian RTL default,
                        English LTR secondary, Jalali + Gregorian calendars, 3 themes).
                        Open it directly in any modern desktop or mobile browser.
                        No internet connection, server, or installation is required.
- Atlas-patch1          Initial patch package (JSON). Install via:
                        Patch Center (مرکز به‌روزرسانی) → Select file → Install.
                        Adds the Announcements module and migrates the data schema to v2.
                        A recovery backup is created automatically before installation.
- Atlas-User-Guide-FA.pdf   Persian user guide: installation, first setup, users/roles,
                            projects/tasks, progress reporting, calendar, saving,
                            backup/restore, patch install & rollback, troubleshooting.
- Atlas-QA-Report.pdf   Quality assurance report: features, 5 test rounds (120 checks,
                        0 failures), defect register, browser/device coverage, limitations.

First steps
-----------
1. Open Atlas.html in Chrome, Edge, or Firefox.
2. On the first-run setup screen press "بارگذاری داده‌های نمونه" (Load demo data)
   or create the first administrator account.
3. Demo accounts (if demo data is loaded): admin / pm.user / team.lead / employee
   — password for all: atlas1234

Saving your data
----------------
Your data is stored in the browser and inside the application file itself.
Use Save (ذخیره) in the app to download an updated Atlas.html containing your data,
or grant the File System Access API permission when your browser offers it, so the
open file is updated in place. Move that file to another computer to carry your data.

Backups: use Backup (پشتیبان‌گیری) to export a full validated backup file,
and the restore wizard to bring it back (a recovery checkpoint is created first).
