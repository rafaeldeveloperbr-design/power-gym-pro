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

Only fichas continue to use localStorage. Old local library/category/template
keys are ignored and are never imported. RAW/BASE and initial template
definitions remain available for the existing initial local fichas.

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
