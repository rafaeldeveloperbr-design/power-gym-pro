Apply `migrations/202610270001_catalog_rpc.sql` manually in the Supabase SQL
Editor before using the updated frontend. Nothing in the app runs migrations
or seeds the library. The migration is transactional and may be reapplied.

It preserves the existing tables, columns, foreign keys and RLS policies. It
adds unique indexes on trimmed, case-insensitive names and two RPC functions.
If existing names conflict, the migration fails without changing data; resolve
the duplicates manually and run it again. Accent-insensitive duplicate checks
also run in the existing frontend, while database uniqueness uses case and
whitespace normalization.

`pgp_save_template` validates the complete payload, checks `auth.uid()` and
`funcionario_ativo()`, and runs with the caller's permissions and RLS. Creation
and replacement children commit together. Updating preserves the template ID
and creation date. Child snapshots preserve every exercise field even after
the library changes. Deleting a template uses the existing cascading foreign
key. `pgp_delete_category` checks the live exercise table under a write-blocking
table lock before deletion. Neither function uses service-role credentials.

All workout plans now load from Supabase as well. Old local workout,
library/category/template keys are ignored and are never imported. RAW/BASE
and initial template definitions remain in the source.

Validation:

```powershell
node --test tests/catalog.test.mjs
npm run build
git diff --check
```

The SQL regression test runs against disposable PGlite PostgreSQL, never the
remote project. To run it without adding a project dependency:

```powershell
$testRoot = Join-Path $env:TEMP 'power-gym-sql-validation'
npm install --prefix $testRoot --no-save --package-lock=false @electric-sql/pglite
$env:PGLITE_MODULE_PATH = Join-Path $testRoot 'node_modules/@electric-sql/pglite/dist/index.js'
node --test tests/catalog.test.mjs tests/catalog-rpc.test.mjs
```

After applying the migration, verify login as an active employee, CRUD for all
three domains, template duplication and ordering, and reload persistence on
the actual project. The isolated tests cannot verify deployed RLS policies,
production grants, or connectivity. Simultaneous edits use the last successful
save; this change does not add version conflict detection.

Workout plans and divisions
--------------------------

Apply `migrations/202610270002_workout_rpc.sql` manually before saving workout
plans. It only adds `pgp_save_workout`; it does not import records or change
tables, foreign keys, constraints or RLS. The function requires an active
authenticated employee and runs with the caller's permissions.

The existing `UNIQUE(aluno_id)` enforces one plan per student. Updates reject
changes to the student and reject division IDs belonging to other plans.
Plan and retained division IDs are preserved; exercise snapshot rows are
replaced atomically. All replacement children are inserted before old
children are removed. Any validation, constraint, permission or write failure
rolls back the complete operation. Parent deletion uses the existing cascade.

Division order follows the editor's tab order; exercises follow their editor
order. Codes are normalized to uppercase and may continue beyond Z to AA,
AB, etc. Empty divisions are supported while building a plan. At least one
division and a name for each division are required.

Templates replace only the selected division after confirmation if it already
contains exercises. The student-card attachment action opens the editor and
adds a new division to an existing plan for review before saving. It never
overwrites other divisions. PDF/PNG generation remains unchanged; the detail
table now includes division headings.

Run all targeted tests with the external PGlite setup above:

```powershell
node --test tests/*.test.mjs
npm run build
git diff --check
```

After manual migration, verify actual-project login, creation, reload,
division switching, selected-division template application, update and deletion.
The SQL tests use the provided schemas and RLS policies in an isolated database;
they cannot verify the deployed project's configuration. Concurrent edits to
the same plan serialize at the database and use the last successful save.
