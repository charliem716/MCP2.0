import { z } from 'zod';
import { BaseQSysTool, BaseToolParamsSchema, type ToolExecutionContext } from './base.js';
import type { ToolCallResult } from '../handlers/index.js';
import type { IControlSystem } from '../interfaces/control-system.js';
import type {
  QSysComponentInfo,
  QSysComponentGetResponse,
} from '../types/qsys-api-responses.js';
import { QSysError, QSysErrorCode, MCPError, MCPErrorCode } from '../../shared/types/errors.js';
import { discoveryCache } from '../state/discovery-cache.js';

/**
 * Parameters for the list_components tool
 */
export const ListComponentsParamsSchema = BaseToolParamsSchema.extend({
  filter: z
    .string()
    .optional()
    .describe('Optional filter pattern for component names'),
  includeProperties: z
    .boolean()
    .optional()
    .describe('Include detailed component properties'),
});

export type ListComponentsParams = z.infer<typeof ListComponentsParamsSchema>;

/**
 * Tool to list all components in the Q-SYS design
 *
 * Returns information about all components available in the current Q-SYS design,
 * optionally filtered by name pattern. Useful for discovering available controls
 * and understanding the system architecture.
 */
export class ListComponentsTool extends BaseQSysTool<ListComponentsParams> {
  constructor(controlSystem: IControlSystem) {
    super(
      controlSystem,
      'list_components',
      "List Q-SYS components with regex filtering. Filter by name/type patterns ('mixer', '^Main', 'gain|delay'). Use includeProperties=true for details. Example: {filter:'mixer',includeProperties:true}.",
      ListComponentsParamsSchema
    );
  }

  protected async executeInternal(
    params: ListComponentsParams,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    try {
      let components: QSysComponent[];

      // Check cache first (lightweight component list)
      const cachedComponents = discoveryCache.getComponents();
      
      if (cachedComponents) {
        this.logger.debug('Using cached component list', { 
          count: cachedComponents.length,
          context 
        });
        
        // Convert cached components to full format
        components = cachedComponents.map(comp => ({
          name: comp.name,
          type: comp.type,
          properties: params.includeProperties ? {} : undefined,
        }));
        
        // If properties are needed, we'll need to fetch from Q-SYS
        if (params.includeProperties) {
          this.logger.debug('Properties requested, fetching fresh data from Q-SYS');
          const response = await this.controlSystem.sendCommand(
            'Component.GetComponents'
          );
          
          if (typeof response !== 'object') {
            throw new QSysError('Invalid response from Q-SYS Core', QSysErrorCode.COMMAND_FAILED,
              { response });
          }
          
          components = this.parseComponentsResponse(response);
          // Don't cache the full response with properties to keep cache lightweight
        }
      } else {
        // Cache miss - fetch from Q-SYS
        this.logger.debug('Component cache miss, fetching from Q-SYS', { context });
        
        const response = await this.controlSystem.sendCommand(
          'Component.GetComponents'
        );

        if (typeof response !== 'object') {
          throw new QSysError('Invalid response from Q-SYS Core', QSysErrorCode.COMMAND_FAILED,
            { response });
        }

        components = this.parseComponentsResponse(response);
        
        // Cache the lightweight component list (names and types only)
        const componentInfos: QSysComponentInfo[] = components.map(comp => ({
          Name: comp.name,
          Type: comp.type,
          Properties: comp.properties,
        }));
        discoveryCache.setComponents(componentInfos);
      }

      const filteredComponents = params.filter
        ? this.filterComponents(components, params.filter)
        : components;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(filteredComponents),
          },
        ],
        isError: false,
      };
    } catch (error) {
      this.logger.error('Failed to list components', { error, context });
      throw error;
    }
  }

  /**
   * Parse the QRWC response for components
   */
  private parseComponentsResponse(response: unknown): QSysComponent[] {
    this.logger.debug('Parsing components response', { response });

    // Handle different response formats from QRWC client
    let components: QSysComponentInfo[] = [];

    // Type guard for response with result property
    if (response && typeof response === 'object' && 'result' in response) {
      const result = (response as { result: unknown }).result;
      
      if (result && typeof result === 'object' && 'Components' in result && Array.isArray((result as { Components: unknown }).Components)) {
        // Handle { result: { Components: [...] } } format
        components = (result as { Components: QSysComponentInfo[] }).Components;
      } else if (Array.isArray(result)) {
        // Handle { result: [...] } format
        components = result as QSysComponentInfo[];
      }
    } else if (Array.isArray(response)) {
      // Handle direct array format
      components = response as QSysComponentInfo[];
    } else {
      this.logger.warn('No components found in response', { response });
      return [];
    }

    return components.map((comp: QSysComponentInfo) => {
      return {
        Name: comp.Name,
        Type: comp.Type,
        Properties: comp.Properties.reduce(
          (acc, prop) => {
            acc[prop.Name] = prop.Value;
            return acc;
          },
          {} as Record<string, unknown>
        ),
      };
    });
  }

  /**
   * Filter components by name pattern
   */
  private filterComponents(
    components: QSysComponent[],
    filter: string
  ): QSysComponent[] {
    const pattern = new RegExp(filter, 'i'); // Case-insensitive regex
    return components.filter(
      comp => pattern.test(comp.Name) || pattern.test(comp.Type)
    );
  }

  /**
   * Format components for display
   */
  private formatComponentsResponse(
    components: QSysComponent[],
    params: ListComponentsParams
  ): string {
    if (components.length === 0) {
      return 'No components found';
    }

    let result = `Found ${components.length} components\n\n`;
    
    for (const comp of components) {
      result += `${comp.Name} (${comp.Type})`;
      
      if (params.includeProperties && comp.Properties) {
        result += '\n  Properties:\n';
        for (const [key, value] of Object.entries(comp.Properties)) {
          result += `    ${key}: ${String(value)}\n`;
        }
      }
      
      result += '\n';
    }
    
    return result.trim();
  }
}

/**
 * Q-SYS Component interface
 */
interface QSysComponent {
  Name: string;
  Type: string;
  Properties?: Record<string, unknown>;
}

/**
 * Export the tool factory function for registration
 */
export const createListComponentsTool = (controlSystem: IControlSystem) =>
  new ListComponentsTool(controlSystem);

/**
 * Parameters for the qsys_component_get tool
 */
export const GetComponentControlsParamsSchema = BaseToolParamsSchema.extend({
  component: z.string().describe('The name of the component'),
  controls: z.array(z.string()).describe('List of control names to retrieve'),
});

export type GetComponentControlsParams = z.infer<
  typeof GetComponentControlsParamsSchema
>;

/**
 * Tool to get specific control values from a named component
 *
 * More efficient than listing all controls then getting values,
 * this allows getting specific controls from a component in a single request.
 */
export class GetComponentControlsTool extends BaseQSysTool<GetComponentControlsParams> {
  constructor(controlSystem: IControlSystem) {
    super(
      controlSystem,
      'qsys_component_get',
      "Get control values from a single component efficiently. Returns values, positions (0-1), and formatted strings. Example: {component:'Main Mixer',controls:['gain','mute']}.",
      GetComponentControlsParamsSchema
    );
  }

  protected async executeInternal(
    params: GetComponentControlsParams,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    try {
      const response = await this.controlSystem.sendCommand('Component.GetControls', {
        Name: params.component,
      });

      if (
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime validation of API response
        !response ||
        typeof response !== 'object' ||
        !('result' in response)
      ) {
        throw new MCPError('Invalid response from Component.Get', MCPErrorCode.TOOL_EXECUTION_ERROR,
          { response });
      }

      const typedResponse = response as unknown as { result: QSysComponentGetResponse };
      const result = typedResponse.result;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime validation
      if (!result?.Controls || !Array.isArray(result.Controls)) {
        throw new MCPError('Invalid response format: missing Controls array', 
          MCPErrorCode.TOOL_EXECUTION_ERROR, { result });
      }

      const controls = result.Controls;

      // Format as JSON for consistent MCP protocol compliance
      const formattedControls = controls.map(ctrl => {
        return {
          name: ctrl.Name,
          value: ctrl.Value,
          string: ctrl.String,
          position: ctrl.Position,
          error: undefined,
        };
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              component: params.component,
              controls: formattedControls,
            }),
          },
        ],
        isError: false,
      };
    } catch (error) {
      this.logger.error('Failed to get component controls', {
        error,
        component: params.component,
        controls: params.controls,
        context,
      });
      throw new MCPError(
        `Failed to get component controls: ${error instanceof Error ? error.message : String(error)}`,
        MCPErrorCode.TOOL_EXECUTION_ERROR,
        { originalError: error, component: params.component }
      );
    }
  }
}

/**
 * Export the tool factory function for registration
 */
export const createGetComponentControlsTool = (
  controlSystem: IControlSystem
) => new GetComponentControlsTool(controlSystem);
