/**
 * Input Validation for MCP Server
 * 
 * Provides Zod-based validation schemas for all MCP tool inputs
 * to ensure data integrity and prevent malformed requests.
 */

import { z } from 'zod';
import { createLogger, type Logger } from '../../shared/utils/logger.js';

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
  private readonly logger: Logger;
  private readonly schemas: typeof ToolSchemas;
  private validationStats = {
    total: 0,
    passed: 0,
    failed: 0,
  };

  constructor() {
    this.logger = createLogger('mcp-input-validator');
    this.schemas = ToolSchemas;
    
    this.logger.info('Input validator initialized', {
      toolCount: Object.keys(this.schemas).length,
    });
  }

  /**
   * Validate tool input
   */
  validate(toolName: string, input: unknown): {
    valid: boolean;
    data?: unknown;
    error?: ReturnType<typeof formatValidationError>;
  } {
    this.validationStats.total++;

    const schema = this.schemas[toolName as keyof typeof ToolSchemas];
    
    if (!schema) {
      this.logger.warn('No validation schema for tool', { toolName });
      // Allow tools without schemas but log warning
      this.validationStats.passed++;
      return { valid: true, data: input };
    }

    try {
      const validated = schema.parse(input);
      this.validationStats.passed++;
      
      this.logger.debug('Validation passed', { 
        toolName,
        inputKeys: input && typeof input === 'object' ? Object.keys(input) : [],
      });
      
      return { valid: true, data: validated };
    } catch (error) {
      this.validationStats.failed++;
      
      if (error instanceof z.ZodError) {
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
        error: {
          code: -32603,
          message: 'Internal validation error',
          data: { type: 'internal_error' },
        },
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