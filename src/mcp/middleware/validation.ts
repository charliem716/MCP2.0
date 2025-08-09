/**
 * Input Validation for MCP Server
 * 
 * Provides Zod-based validation schemas for all MCP tool inputs
 * to ensure data integrity and prevent malformed requests.
 */

import { z } from 'zod';
import type { ILogger } from '../interfaces/logger.js';

/**
 * Common validation patterns
 */
const ComponentNameSchema = z.string()
  .min(1, 'Component name cannot be empty')
  .max(100, 'Component name too long')
  .regex(/^[a-zA-Z0-9_.-]+$/, 'Component name contains invalid characters');

const ControlNameSchema = z.string()
  .min(1, 'Control name cannot be empty')
  .max(100, 'Control name too long')
  .regex(/^[a-zA-Z0-9_.-]+$/, 'Control name contains invalid characters');

const ControlValueSchema = z.union([
  z.number().finite(),
  z.string().max(1000),
  z.boolean(),
]);

/**
 * Tool-specific validation schemas
 */
export const ToolSchemas = {
  // Component discovery tools
  'qsys.list_components': z.object({}).strict(),
  
  'qsys.discover_components': z.object({}).strict(),
  
  'qsys.get_component_details': z.object({
    component_name: ComponentNameSchema,
  }).strict(),

  // Control manipulation tools
  'qsys.get_control': z.object({
    component_name: ComponentNameSchema,
    control_name: ControlNameSchema,
  }).strict(),

  'qsys.set_control': z.object({
    component_name: ComponentNameSchema,
    control_name: ControlNameSchema,
    value: ControlValueSchema,
    ramp_time: z.number().min(0).max(60).optional(),
  }).strict(),

  'qsys.get_controls': z.object({
    component_name: ComponentNameSchema,
  }).strict(),

  // Status monitoring tools
  'qsys.get_system_status': z.object({}).strict(),

  'qsys.monitor_control': z.object({
    component_name: ComponentNameSchema,
    control_name: ControlNameSchema,
    duration_seconds: z.number().min(1).max(300).default(10),
  }).strict(),

  // Change group tools
  'qsys.start_change_group': z.object({
    group_id: z.string().min(1).max(50).optional(),
  }).strict(),

  'qsys.add_to_change_group': z.object({
    group_id: z.string().min(1).max(50),
    component_name: ComponentNameSchema,
    control_name: ControlNameSchema,
    value: ControlValueSchema,
  }).strict(),

  'qsys.execute_change_group': z.object({
    group_id: z.string().min(1).max(50),
  }).strict(),

  'qsys.cancel_change_group': z.object({
    group_id: z.string().min(1).max(50),
  }).strict(),

  // API reference tools
  'qsys.search_api': z.object({
    query: z.string().min(1).max(200),
    category: z.enum(['all', 'methods', 'controls', 'components']).optional(),
  }).strict(),

  'qsys.get_api_details': z.object({
    method_name: z.string().min(1).max(100),
  }).strict(),

  // Raw command tool (advanced users)
  'qsys.send_raw_command': z.object({
    method: z.string().min(1).max(100),
    params: z.unknown(), // Allow any params but validate method exists
  }).strict(),

  // Echo tool (for testing)
  'echo': z.object({
    message: z.string().max(1000),
  }).strict(),
};

/**
 * Validation error formatter
 */
export function formatValidationError(error: z.ZodError): {
  code: number;
  message: string;
  data: {
    type: string;
    errors: Array<{
      path: string;
      message: string;
    }>;
  };
} {
  return {
    code: -32602, // Invalid params
    message: 'Invalid tool parameters',
    data: {
      type: 'validation_error',
      errors: error.errors.map(err => ({
        path: err.path.join('.'),
        message: err.message,
      })),
    },
  };
}

/**
 * Input Validator
 * 
 * Validates MCP tool inputs against predefined schemas
 */
export class InputValidator {
  private readonly logger: ILogger;
  private readonly schemas: typeof ToolSchemas;
  private validationStats = {
    total: 0,
    passed: 0,
    failed: 0,
  };

  constructor(logger: ILogger) {
    this.logger = logger;
    this.schemas = ToolSchemas;
    
    this.logger.info('Input validator initialized', {
      toolCount: Object.keys(this.schemas).length,
    });
  }

  /**
   * Validate tool input
   */
  validate(toolNameOrInput: string | unknown, inputOrSchema?: unknown): {
    valid: boolean;
    data?: unknown;
    error?: ReturnType<typeof formatValidationError> | string;
  } {
    this.validationStats.total++;

    // Support both signatures
    let schema: { parse: (input: unknown) => unknown } | undefined;
    let input: unknown;
    let toolName: string | undefined;
    
    if (typeof toolNameOrInput === 'string') {
      // Original signature: validate(toolName, input)
      toolName = toolNameOrInput;
      input = inputOrSchema;
      schema = this.schemas[toolName as keyof typeof ToolSchemas];
      
      if (!schema) {
        this.logger.warn('No validation schema for tool', { toolName });
        // Allow tools without schemas but log warning
        this.validationStats.passed++;
        return { valid: true, data: input };
      }
    } else {
      // Test signature: validate(params, schema)
      input = toolNameOrInput;
      schema = inputOrSchema as { parse: (input: unknown) => unknown } | undefined;
    }

    try {
      const validated = schema ? schema.parse(input) : input;
      this.validationStats.passed++;
      
      this.logger.debug('Validation passed', { 
        toolName,
        inputKeys: input && typeof input === 'object' ? Object.keys(input) : [],
      });
      
      return { valid: true, data: validated };
    } catch (error) {
      this.validationStats.failed++;
      
      if (error instanceof z.ZodError) {
        // For test compatibility, return string error when no toolName
        if (!toolName) {
          const errorMessages = error.errors.map(e => {
            const field = e.path.join('.');
            if (e.code === 'invalid_type' && e.received === 'undefined') {
              return `Required`;
            }
            return field ? `${field}` : e.message;
          }).join(', ');
          return { valid: false, error: errorMessages };
        }
        
        const formattedError = formatValidationError(error);
        
        this.logger.warn('Validation failed', {
          toolName,
          errors: formattedError.data.errors,
        });
        
        return { valid: false, error: formattedError };
      }

      // Unexpected error
      this.logger.error('Unexpected validation error', { error, toolName });
      
      return {
        valid: false,
        error: toolName ? {
          code: -32603,
          message: 'Internal validation error',
          data: { 
            type: 'internal_error',
            errors: []
          },
        } : 'Internal validation error',
      };
    }
  }

  /**
   * Get validation statistics
   */
  getStats() {
    return {
      ...this.validationStats,
      successRate: this.validationStats.total > 0
        ? (this.validationStats.passed / this.validationStats.total) * 100
        : 0,
    };
  }

  /**
   * Reset validation statistics
   */
  resetStats(): void {
    this.validationStats = {
      total: 0,
      passed: 0,
      failed: 0,
    };
    
    this.logger.debug('Validation statistics reset');
  }

  /**
   * Create middleware function for request validation
   */
  middleware(schemas: Record<string, { parse: (input: unknown) => unknown }>) {
    return async (context: { method: string; params?: unknown }, next: () => Promise<unknown>) => {
      const schema = schemas[context.method];
      if (schema) {
        const result = this.validate(context.params, schema);
        if (!result.valid) {
          throw new Error(`Validation failed: ${JSON.stringify(result.error)}`);
        }
      }
      return next();
    };
  }
}

/**
 * Create sanitized error message (remove sensitive data)
 */
export function sanitizeErrorMessage(message: string): string {
  // Remove IP addresses
  message = message.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP_REDACTED]');
  
  // Remove potential passwords or tokens
  message = message.replace(/password[']?\s*[:=]\s*[']?[^'\s]+/gi, 'password=[REDACTED]');
  message = message.replace(/token[']?\s*[:=]\s*[']?[^'\s]+/gi, 'token=[REDACTED]');
  message = message.replace(/key[']?\s*[:=]\s*[']?[^'\s]+/gi, 'key=[REDACTED]');
  
  return message;
}