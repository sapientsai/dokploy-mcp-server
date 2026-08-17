// Stub for optional schema libraries that never load in this Worker.
//
// `xsschema` (a transitive fastmcp dependency) probes for every schema library
// it supports — valibot, effect, sury — via `tryImport(import("..."))`. We only
// use zod, so those branches are dead code, but esbuild still has to resolve the
// specifiers at bundle time and fails because the packages aren't installed.
//
// Aliasing them here satisfies the bundler. `tryImport` swallows the resulting
// empty module and falls through to the zod path, which is what we actually use.
export default {}
