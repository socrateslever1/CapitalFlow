export type ToolError =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'AMBIGUOUS'
  | 'NOT_AUTHORIZED'
  | 'CONFIRMATION_REQUIRED'
  | 'BACKEND_ERROR'
  | 'BUSINESS_RULE_BLOCKED'
  | 'TOOL_DISABLED';

export type ToolResult<T> =
  | { ok: true; data: T; metadata?: Record<string, unknown> }
  | { ok: false; error: ToolError; message: string };

export const toolSuccess = <T>(data: T, metadata?: Record<string, unknown>): ToolResult<T> => ({
  ok: true,
  data,
  ...(metadata ? { metadata } : {}),
});

export const toolFailure = <T = never>(error: ToolError, message: string): ToolResult<T> => ({
  ok: false,
  error,
  message,
});
