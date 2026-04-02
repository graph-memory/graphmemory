// ---------------------------------------------------------------------------
// Tags (per-project entities, linked to other entities via edges)
//
// Tags are managed internally by each store's create/update methods.
// No separate TagsStore — tags flow through Create/Patch/Record interfaces
// and are stored in the `tags` table + `edges` table (kind='tagged').
// ---------------------------------------------------------------------------
