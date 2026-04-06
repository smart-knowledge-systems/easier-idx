import type { TokenUsage } from "@easier/core/usage";

export interface GlossaryTerm {
  keyword: string;
  definition: string;
}

export interface GenerateTermsResult {
  terms: GlossaryTerm[];
  usage?: TokenUsage;
  meta?: Record<string, unknown>;
}
