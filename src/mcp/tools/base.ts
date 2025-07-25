import { z } from 'zod';
import { globalLogger as logger } from '../../shared/utils/logger.js';
import type { QRWCClientInterface } from '../qrwc/adapter.js';
import type { ToolCallResult } from '../handlers/index.js';
import { QSysError, QSysErrorCode, ValidationError } from '../../shared/types/errors.js';

/**
 * Base schema for all Q-SYS tool parameters
 */
export const BaseToolParamsSchema = z.object({
  requestId: z
    .string()
    .uuid()
    .optional()
    .describe('Optional request ID for tracking'),
});

/**
 * Tool execution context with request metadata
 */
export interface ToolExecutionContext {
  requestId?: string;
  startTime: number;
  toolName: string;
}

/**
 * Tool execution result with metadata
 */
export interface ToolExecutionResult extends ToolCallResult {
  executionTimeMs: number;
  context: ToolExecutionContext;
}

/**
 * Abstract base class for all Q-SYS control tools
 *
 * Provides:
 * - Zod schema validation for parameters
 * - Standardized error handling
 * - Execution timing and logging
 * - Type-safe QRWC client access
 */
export abstract class BaseQSysTool<TParams = Record<string, unknown>> {
  protected readonly logger = logger;

  constructor(
    protected readonly qrwcClient: QRWCClientInterface,
    public readonly name: string,
    public readonly description: string,
    protected readonly paramsSchema: z.ZodSchema<TParams>
  ) {}

  /**
   * Tool input schema for MCP registration
   */
  get inputSchema() {
    // Convert Zod schema to JSON Schema for MCP compatibility
    return {
      type: 'object' as const,
      properties: this.getSchemaProperties(),
      required: this.getRequiredFields(),
      additionalProperties: false,
    };
  }

  /**
   * Execute the tool with validated parameters
   */
  async execute(rawParams: unknown): Promise<ToolExecutionResult> {
    const requestId = this.extractRequestId(rawParams);
    const context: ToolExecutionContext = {
      ...(requestId && { requestId }),
      startTime: Date.now(),
      toolName: this.name,
    };

    try {
      this.logger.debug(`Executing tool: ${this.name}`, {
        context,
        rawParams,
      });

      // Validate parameters using Zod
      const validatedParams = await this.validateParams(rawParams);

      // Check QRWC connection
      if (!this.qrwcClient.isConnected()) {
        throw new QSysError('Q-SYS Core not connected', QSysErrorCode.CONNECTION_FAILED);
      }

      // Execute the tool-specific logic
      const result = await this.executeInternal(validatedParams, context);

      const executionTime = Date.now() - context.startTime;

      this.logger.debug(`Tool execution completed: ${this.name}`, {
        context,
        executionTimeMs: executionTime,
        success: !result.isError,
      });

      return {
        ...result,
        executionTimeMs: executionTime,
        context,
      };
    } catch (error) {
      const executionTime = Date.now() - context.startTime;

      this.logger.error(`Tool execution failed: ${this.name}`, {
        context,
        error: error instanceof Error ? error.message : String(error),
        executionTimeMs: executionTime,
      });

      return {
        content: [
          {
            type: 'text',
            text: this.formatErrorResponse(error),
          },
        ],
        isError: true,
        executionTimeMs: executionTime,
        context,
      };
    }
  }

  /**
   * Validate parameters using Zod schema
   */
  protected async validateParams(rawParams: unknown): Promise<TParams> {
    try {
      // Use Zod's parse for strict validation
      return this.paramsSchema.parse(rawParams || {});
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors
          .map(err => `${err.path.join('.')}: ${err.message}`)
          .join('; ');
        throw new ValidationError(
          'Parameter validation failed',
          error.errors.map((err: any) => ({
            field: err.path.join('.'),
            message: err.message,
            code: 'VALIDATION_ERROR',
          }))
        );
      }
      throw error;
    }
  }

  /**
   * Abstract method for tool-specific implementation
   */
  protected abstract executeInternal(
    params: TParams,
    context: ToolExecutionContext
  ): Promise<ToolCallResult>;

  /**
   * Format successful response data as JSON string
   * Ensures all tool responses are consistent JSON format
   */
  protected formatResponse(data: unknown): string {
    // Always return JSON stringified data for MCP protocol compliance
    return JSON.stringify(data);
  }

  /**
   * Format error response as JSON string
   * Provides consistent error structure across all tools
   */
  protected formatErrorResponse(error: unknown): string {
    // Always return JSON for consistency with MCP protocol
    const errorObj: any = {
      error: true,
      toolName: this.name,
      message: error instanceof Error ? error.message : String(error),
      code: (error as { code?: string })?.code || 'UNKNOWN_ERROR',
      timestamp: new Date().toISOString(),
    };
    
    // For validation errors, include field details in the error object
    if (error instanceof ValidationError) {
      errorObj.code = 'VALIDATION_ERROR';
      errorObj.message = 'Parameter validation failed';
      errorObj.fields = error.fields;
      errorObj.fieldErrors = error.fields
        .map(f => `${f.field}: ${f.message}`)
        .join('; ');
    }
    
    return JSON.stringify(errorObj);
  }

  /**
   * Format error message for user-friendly display
   * @deprecated Use formatErrorResponse for JSON compliance
   */
  protected formatErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return `${this.name} failed: ${error.message}`;
    }
    return `${this.name} failed: ${String(error)}`;
  }

  /**
   * Extract request ID from raw parameters if available
   */
  private extractRequestId(rawParams: unknown): string | undefined {
    if (typeof rawParams === 'object' && rawParams !== null) {
      const params = rawParams as Record<string, unknown>;
      return typeof params['requestId'] === 'string'
        ? params['requestId']
        : undefined;
    }
    return undefined;
  }

  /**
   * Get schema properties for JSON Schema conversion
   */
  private getSchemaProperties(): Record<string, unknown> {
    // This is a simplified conversion - for production, consider using zod-to-json-schema
    // Check if schema has shape property (indicating it's a ZodObject)
    if (!this.paramsSchema || typeof this.paramsSchema !== 'object') {
      return {};
    }

    // Type guard to check if this is a ZodObject
    // Define interface for Zod schema with internal properties
    interface ZodSchemaWithInternals {
      _def?: {
        typeName?: string;
      };
      shape?: Record<string, unknown>;
    }

    const schemaWithShape = this
      .paramsSchema as unknown as ZodSchemaWithInternals;
    if (
      !schemaWithShape._def ||
      schemaWithShape._def.typeName !== z.ZodFirstPartyTypeKind.ZodObject
    ) {
      return {};
    }

    const shape = schemaWithShape.shape;
    if (!shape) return {};

    const properties: Record<string, unknown> = {};

    for (const [key, zodSchema] of Object.entries(shape)) {
      const schema = zodSchema as z.ZodSchema;
      properties[key] = this.zodSchemaToJsonSchema(schema);
    }

    return properties;
  }

  /**
   * Get required fields from Zod schema
   */
  private getRequiredFields(): string[] {
    // Check if schema is a ZodObject before accessing shape
    if (!(this.paramsSchema instanceof z.ZodObject)) {
      return [];
    }

    const shape = this.paramsSchema.shape;
    if (!shape) return [];

    const required: string[] = [];

    for (const [key, zodSchema] of Object.entries(shape)) {
      const schema = zodSchema as z.ZodSchema;
      if (!schema.isOptional()) {
        required.push(key);
      }
    }

    return required;
  }

  /**
   * Convert Zod schema to basic JSON Schema (simplified)
   */
  private zodSchemaToJsonSchema(schema: z.ZodSchema): unknown {
    // Access Zod internal definition - required for schema introspection
    const def = (schema as z.ZodTypeAny)._def;

    switch (def.typeName) {
      case 'ZodString':
        return { type: 'string', description: def.description };
      case 'ZodNumber':
        return { type: 'number', description: def.description };
      case 'ZodBoolean':
        return { type: 'boolean', description: def.description };
      case 'ZodArray':
        return {
          type: 'array',
          items: this.zodSchemaToJsonSchema(def.type),
          description: def.description,
        };
      case 'ZodObject':
        const properties: Record<string, unknown> = {};
        const shape = def.shape();
        for (const [key, nestedSchema] of Object.entries(shape)) {
          properties[key] = this.zodSchemaToJsonSchema(
            nestedSchema as z.ZodSchema
          );
        }
        return { type: 'object', properties, description: def.description };
      case 'ZodOptional':
        return this.zodSchemaToJsonSchema(def.innerType);
      case 'ZodEnum':
        return {
          type: 'string',
          enum: def.values,
          description: def.description,
        };
      default:
        return { type: 'string', description: def.description };
    }
  }
}
