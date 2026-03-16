import { request, unwrapList, type ListResponse } from '@/shared/api/client.ts';

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  [key: string]: unknown;
}

export interface JsonSchemaProperty {
  type?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  items?: JsonSchemaProperty;
  [key: string]: unknown;
}

export interface ToolInfo {
  name: string;
  description: string;
  category: string;
  inputSchema: JsonSchema;
}

export interface ToolCallResult {
  result: Array<{ type: string; text?: string }>;
  isError: boolean;
  duration: number;
}

export function listTools(projectId: string) {
  return request<ListResponse<ToolInfo>>(`/projects/${projectId}/tools`).then(unwrapList);
}

export function getTool(projectId: string, toolName: string) {
  return request<ToolInfo>(`/projects/${projectId}/tools/${toolName}`);
}

export function callTool(projectId: string, toolName: string, args: Record<string, unknown>) {
  return request<ToolCallResult>(`/projects/${projectId}/tools/${toolName}/call`, {
    method: 'POST',
    body: JSON.stringify({ arguments: args }),
  });
}
