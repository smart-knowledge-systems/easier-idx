// ---------------------------------------------------------------------------
// Query rewriter — interface for session-aware query transformation
// ---------------------------------------------------------------------------

/** Context available to query rewriters. */
export interface QueryRewriteContext {
  readonly sessionQueries: string[];
}

/** A query rewriter transforms a raw query before search. */
export interface QueryRewriter {
  rewrite(query: string, ctx: QueryRewriteContext): string;
}
