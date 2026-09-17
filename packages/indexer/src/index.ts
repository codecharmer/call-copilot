/**
 * @call-copilot/indexer — repository ingestion.
 *
 * Phase 1 scope so far: discovery, ignore rules, default exclusions, secret
 * redaction, line handling, chunking, identifier splitting and generation
 * manifests. All zero-dependency and platform-neutral. SQLite storage,
 * tree-sitter parsing and local embeddings land next, one CI-gated commit each
 * (see docs/ROADMAP.md).
 */

export * from './paths.js';
export * from './ignore.js';
export * from './exclusions.js';
export * from './secrets.js';
export * from './lines.js';
export * from './chunk.js';
export * from './identifiers.js';
export * from './manifest.js';
export * from './discover.js';
