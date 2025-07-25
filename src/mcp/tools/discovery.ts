import { z } from 'zod';
import { BaseQSysTool } from './base.js';
import type { ToolCallResult } from '../handlers/index.js';
import type { ToolExecutionContext } from './base.js';
import type { QRWCClientInterface } from '../qrwc/adapter.js';
import { MCPError, MCPErrorCode, ValidationError } from '../../shared/types/errors.js';

/**
 * Parameters for the qsys_get_all_controls tool
 */
export const GetAllControlsParamsSchema = z.object({
  mode: z
    .enum(['summary', 'filtered', 'full'])
    .optional()
    .describe("Response mode: 'summary' (default), 'filtered', or 'full'"),
  filter: z
    .object({
      component: z
        .string()
        .optional()
        .describe('Component name or regex pattern'),
      type: z
        .enum(['gain', 'mute', 'select', 'trigger', 'text', 'other'])
        .optional(),
      namePattern: z.string().optional().describe('Control name regex pattern'),
      hasNonDefaultValue: z.boolean().optional(),
    })
    .optional()
    .describe("Filters for 'filtered' mode"),
  pagination: z
    .object({
      limit: z
        .number()
        .min(1)
        .max(500)
        .optional()
        .describe('Max controls to return (default: 100)'),
      offset: z.number().min(0).optional().describe('Skip this many controls'),
    })
    .optional(),
  includeValues: z
    .boolean()
    .optional()
    .describe('Include current control values (default: true)'),
  componentFilter: z
    .string()
    .optional()
    .describe('DEPRECATED: Use filter.component instead'),
});

export type GetAllControlsParams = z.infer<typeof GetAllControlsParamsSchema>;

/**
 * Tool to get all controls from all components in the Q-SYS system
 *
 * Retrieves all controls system-wide in a single request, useful for:
 * - System-wide monitoring and diagnostics
 * - Building complete control maps
 * - Discovery of available controls
 *
 * @example
 * // Get all controls with values
 * { includeValues: true }
 *
 * @example
 * // Get only controls from APM components
 * { includeValues: true, componentFilter: "APM" }
 */
export class GetAllControlsTool extends BaseQSysTool<GetAllControlsParams> {
  constructor(qrwcClient: QRWCClientInterface) {
    super(
      qrwcClient,
      'qsys_get_all_controls',
      "Bulk control retrieval with filtering and pagination. Modes: 'summary' for system stats, 'filtered' for targeted retrieval with filters (component/type/hasNonDefaultValue), 'full' for all controls. Supports pagination with limit/offset. Optimized for large systems (2000+ controls). Example: {mode:'filtered',filter:{type:'gain'},includeValues:true} for all gain controls.",
      GetAllControlsParamsSchema
    );
  }

  protected async executeInternal(
    params: GetAllControlsParams,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    try {
      const mode = params.mode || 'summary';

      // Validate filtered mode requires filters
      if (mode === 'filtered' && !params.filter && !params.componentFilter) {
        throw new ValidationError(
          "Filter required when using 'filtered' mode. Use mode='full' for all controls.",
          [{ field: 'filter', message: 'Required when mode is filtered', code: 'REQUIRED_FIELD' }],
          { mode }
        );
      }

      const response = await this.qrwcClient.sendCommand(
        'Component.GetAllControls'
      );

      if (
        !response ||
        typeof response !== 'object' ||
        !('result' in response)
      ) {
        throw new MCPError(
          'Invalid response from Component.GetAllControls',
          MCPErrorCode.TOOL_EXECUTION_ERROR,
          { response }
        );
      }

      const result = response.result as { Controls?: unknown[] };
      const allControls = result.Controls || [];

      if (!Array.isArray(allControls)) {
        throw new MCPError(
          'Invalid response format: expected array of controls',
          MCPErrorCode.TOOL_EXECUTION_ERROR,
          { allControls }
        );
      }

      // Return summary mode
      if (mode === 'summary') {
        return this.generateSummaryResponse(allControls);
      }

      // Apply filters for filtered/full modes
      const filteredControls = this.applyFilters(allControls, params);

      // Apply pagination
      const limit =
        params.pagination?.limit ||
        (mode === 'filtered' ? 100 : allControls.length);
      const offset = params.pagination?.offset || 0;
      const paginatedControls = filteredControls.slice(offset, offset + limit);

      // Format response
      const formattedResponse = {
        mode,
        summary: {
          totalControls: allControls.length,
          filteredControls: filteredControls.length,
          returnedControls: paginatedControls.length,
          offset,
          limit,
        },
        controls:
          params.includeValues !== false
            ? paginatedControls
            : paginatedControls.map((c: any) => ({
                name: c.Name,
                component: c.Component,
              })),
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(formattedResponse),
          },
        ],
        isError: false,
      };
    } catch (error) {
      this.logger.error('Failed to get all controls', {
        error,
        params,
        context,
      });
      throw new MCPError(
        `Failed to get all controls: ${error instanceof Error ? error.message : String(error)}`,
        MCPErrorCode.TOOL_EXECUTION_ERROR,
        { originalError: error, params }
      );
    }
  }

  private generateSummaryResponse(controls: unknown[]): ToolCallResult {
    const byComponent: Record<string, unknown[]> = {};
    const byType: Record<string, number> = {
      gain: 0,
      mute: 0,
      select: 0,
      trigger: 0,
      text: 0,
      other: 0,
    };
    let nonDefaultCount = 0;

    controls.forEach((ctrl: unknown) => {
      const control = ctrl as any;
      const componentName = control.Component || 'Unknown';

      // Group by component
      if (!byComponent[componentName]) {
        byComponent[componentName] = [];
      }
      byComponent[componentName].push(ctrl);

      // Count by type
      const type = this.inferControlType(control);
      if (type in byType) {
        (byType as any)[type]++;
      }

      // Count non-default values
      if (this.hasNonDefaultValue(control)) {
        nonDefaultCount++;
      }
    });

    // Get top components by control count
    const topComponents = Object.entries(byComponent)
      .map(([name, ctrls]) => ({ name, count: ctrls.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const summary = {
      totalControls: controls.length,
      totalComponents: Object.keys(byComponent).length,
      controlsByType: byType,
      componentsWithMostControls: topComponents,
      activeControls: nonDefaultCount,
      suggestions: [
        "Use mode='filtered' with filter.component='ComponentName' to see specific component controls",
        "Use mode='filtered' with filter.type='gain' to see all gain controls",
        "Use mode='full' to get all controls (warning: large response)",
      ],
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ summary }),
        },
      ],
      isError: false,
    };
  }

  private applyFilters(
    controls: unknown[],
    params: GetAllControlsParams
  ): unknown[] {
    let filtered = controls;

    // Legacy component filter support
    const componentFilter = params.filter?.component || params.componentFilter;
    if (componentFilter) {
      const regex = new RegExp(componentFilter, 'i');
      filtered = filtered.filter((ctrl: any) =>
        regex.test(ctrl.Component || '')
      );
    }

    // Type filter
    if (params.filter?.type) {
      filtered = filtered.filter(
        (ctrl: any) => this.inferControlType(ctrl) === params.filter!.type
      );
    }

    // Name pattern filter
    if (params.filter?.namePattern) {
      const regex = new RegExp(params.filter.namePattern, 'i');
      filtered = filtered.filter((ctrl: any) => regex.test(ctrl.Name || ''));
    }

    // Non-default value filter
    if (params.filter?.hasNonDefaultValue) {
      filtered = filtered.filter((ctrl: any) => this.hasNonDefaultValue(ctrl));
    }

    return filtered;
  }

  private inferControlType(control: any): string {
    const name = (control.Name || '').toLowerCase();
    const type = control.Type;

    if (name.includes('gain') || name.includes('level')) return 'gain';
    if (name.includes('mute') || type === 'Boolean') return 'mute';
    if (name.includes('select') || name.includes('input.select'))
      return 'select';
    if (name.includes('trigger')) return 'trigger';
    if (type === 'String' || type === 'Text') return 'text';

    return 'other';
  }

  private hasNonDefaultValue(control: any): boolean {
    const value = control.Value;
    const type = control.Type;

    if (type === 'Boolean') return value === true || value === 1;
    if (type === 'Float' || type === 'Number') return value !== 0;
    if (type === 'String' || type === 'Text')
      return value !== '' && value != null;

    return false;
  }
}

/**
 * Export the tool factory function for registration
 */
export const createGetAllControlsTool = (qrwcClient: QRWCClientInterface) =>
  new GetAllControlsTool(qrwcClient);
