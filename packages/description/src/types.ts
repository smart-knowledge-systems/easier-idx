import type { TokenUsage } from "@easier/core/usage";

export interface GenerateDescriptionResult<T = string> {
  description: T;
  usage?: TokenUsage;
  meta?: Record<string, unknown>;
}
