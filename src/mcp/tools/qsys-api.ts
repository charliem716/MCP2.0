import { z } from "zod";
import { BaseQSysTool } from "./base.js";
import type { ToolCallResult } from "../handlers/index.js";
import type { ToolExecutionContext } from "./base.js";
import { QSysAPIReference } from "./api-reference.js";
import type { QRWCClientInterface } from "../qrwc/adapter.js";

/**
 * Parameters for the query_qsys_api tool
 */
export const QueryQSysAPIParamsSchema = z.object({
  requestId: z.string().uuid().optional().describe("Optional request ID for tracking"),
  query_type: z.enum(['tools', 'methods', 'components', 'controls', 'examples'])
    .describe("Type of query to perform. Use 'tools' for available MCP tools and their usage"),
  component_type: z.enum(['mixer', 'gain', 'router', 'snapshot', 'delay', 'eq']).optional()
    .describe("Filter methods by component type"),
  method_category: z.enum(['Authentication', 'Component', 'Mixer', 'Control', 'Snapshot', 'ChangeGroup', 'Status']).optional()
    .describe("Filter methods by category"),
  search: z.string().optional()
    .describe("Search in method names or descriptions"),
  component_name: z.string().optional()
    .describe("Get methods for specific component"),
  method_name: z.string().optional()
    .describe("Get details for specific method")
});

export type QueryQSysAPIParams = z.infer<typeof QueryQSysAPIParamsSchema>;

/**
 * Tool to query Q-SYS API reference for available methods and parameters
 */
export class QueryQSysAPITool extends BaseQSysTool<QueryQSysAPIParams> {
  private apiReference: QSysAPIReference;
  
  constructor(qrwcClient: QRWCClientInterface) {
    super(
      qrwcClient,
      "query_qsys_api",
      "Query Q-SYS API reference and MCP tools documentation. Types: 'tools' (available MCP tools with examples), 'methods' (Q-SYS commands), 'components' (component types), 'controls' (control types), 'examples' (usage). Examples: {query_type:'tools'} for all MCP tools, {query_type:'methods',search:'gain'} for gain methods, {query_type:'examples',method_name:'Component.Set'} for examples.",
      QueryQSysAPIParamsSchema
    );
    
    this.apiReference = new QSysAPIReference();
  }
  
  protected async executeInternal(
    params: QueryQSysAPIParams,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    try {
      let response: Record<string, unknown> = {};
      
      switch (params.query_type) {
        case 'tools':
          response = this.queryMCPTools();
          break;
        case 'methods':
          response = this.queryMethods(params);
          break;
        case 'components':
          response = this.queryComponentTypes();
          break;
        case 'controls':
          response = this.queryControlTypes();
          break;
        case 'examples':
          response = this.queryExamples(params);
          break;
      }
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(response, null, 2)
        }],
        isError: false
      };
    } catch (error) {
      throw new Error(
        `Failed to query API reference: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  
  private queryMethods(params: QueryQSysAPIParams) {
    const methods = this.apiReference.queryMethods({
      component_type: params.component_type,
      method_category: params.method_category,
      search: params.search,
      method_name: params.method_name
    });
    
    return {
      query_type: 'methods',
      count: methods.length,
      methods: methods.map(m => ({
        name: m.name,
        category: m.category,
        description: m.description,
        params: m.params,
        example: m.example
      }))
    };
  }
  
  private queryComponentTypes() {
    const types = this.apiReference.getComponentTypes();
    
    return {
      query_type: 'components',
      count: types.length,
      component_types: types
    };
  }
  
  private queryControlTypes() {
    const types = this.apiReference.getControlTypes();
    
    return {
      query_type: 'controls',
      count: types.length,
      control_types: types
    };
  }
  
  private queryExamples(params: QueryQSysAPIParams) {
    const examples = this.apiReference.getExamples(params.method_name);
    
    return {
      query_type: 'examples',
      count: examples.length,
      examples: examples,
      hint: examples.length === 0 && params.method_name 
        ? `No example found for '${params.method_name}'. Try searching for the method first.`
        : undefined
    };
  }
  
  private queryMCPTools() {
    return {
      query_type: 'tools',
      overview: {
        description: "Available MCP Tools for Q-SYS Control",
        note: "The send_raw_command tool has been deprecated for stability. Use these dedicated tools instead."
      },
      tools: [
        {
          name: "list_components",
          description: "Lists all available Q-SYS components in the current design",
          usage: "No parameters required",
          example: {
            tool: "list_components",
            arguments: {}
          },
          returns: "Array of components with their names, types, and properties"
        },
        {
          name: "qsys_component_get",
          description: "Get specific control values from a Q-SYS component",
          parameters: {
            component_name: "Name of the component (e.g., 'Main Gain')",
            controls: "Array of control names to retrieve (e.g., ['gain', 'mute'])"
          },
          example: {
            tool: "qsys_component_get",
            arguments: {
              component_name: "Main Gain",
              controls: ["gain", "mute"]
            }
          },
          returns: "Control values with their current state"
        },
        {
          name: "list_controls",
          description: "Lists all controls for a specific component",
          parameters: {
            component_name: "Name of the component to inspect"
          },
          example: {
            tool: "list_controls",
            arguments: {
              component_name: "Zone 1 Gain"
            }
          },
          returns: "Array of control names and their properties"
        },
        {
          name: "get_control_values",
          description: "Get values for specific controls by their full names",
          parameters: {
            controls: "Array of control names (can be 'ControlName' or 'Component.ControlName' format)"
          },
          example: {
            tool: "get_control_values",
            arguments: {
              controls: ["Main Gain.gain", "Zone 1 Gain.mute", "Master Volume"]
            }
          },
          returns: "Current values for each requested control"
        },
        {
          name: "set_control_values",
          description: "Set values for Q-SYS controls with optional ramp time",
          parameters: {
            controls: "Array of control objects with name, value, and optional ramp"
          },
          examples: [
            {
              tool: "set_control_values",
              arguments: {
                controls: [
                  { name: "Main Gain.gain", value: -10 },
                  { name: "Zone 1 Gain.mute", value: true }
                ]
              }
            },
            {
              tool: "set_control_values",
              arguments: {
                controls: [
                  { name: "Master Volume", value: -20, ramp: 2.5 }
                ]
              },
              note: "Ramp creates a smooth 2.5-second transition"
            }
          ],
          value_ranges: {
            gain: "Typically -100 to 20 (dB)",
            mute: "true/false (converted to 1/0 for Q-SYS)",
            position: "0.0 to 1.0",
            crosspoint: "Input number for router selection"
          }
        },
        {
          name: "query_core_status",
          description: "Get Q-SYS Core connection status and basic information",
          usage: "No parameters required",
          example: {
            tool: "query_core_status",
            arguments: {}
          },
          returns: "Connection status, platform info, and system state",
          note: "Limited information available without raw command access"
        },
        {
          name: "qsys_get_all_controls",
          description: "Get all controls from all components in the design",
          usage: "No parameters required",
          example: {
            tool: "qsys_get_all_controls",
            arguments: {}
          },
          returns: "Complete list of all controls with their current values",
          warning: "Can return large amounts of data for complex designs"
        },
        {
          name: "query_qsys_api",
          description: "Query Q-SYS API reference (this tool)",
          parameters: {
            query_type: "One of: tools, methods, components, controls, examples",
            search: "Optional search term",
            method_name: "Optional specific method to look up"
          },
          example: {
            tool: "query_qsys_api",
            arguments: {
              query_type: "methods",
              search: "gain"
            }
          }
        }
      ],
      best_practices: [
        "Use list_components first to discover available components",
        "Use list_controls to see what controls a component has",
        "For simple operations, use get_control_values and set_control_values",
        "Use component.control naming format (e.g., 'Main Gain.gain') for clarity",
        "Boolean values (true/false) are automatically converted to Q-SYS format (1/0)",
        "Add ramp parameter for smooth audio transitions"
      ],
      common_workflows: [
        {
          task: "Mute a zone",
          steps: [
            "1. Use list_components to find the zone gain component",
            "2. Use set_control_values with {name: 'Zone 1 Gain.mute', value: true}"
          ]
        },
        {
          task: "Adjust volume with fade",
          steps: [
            "1. Use get_control_values to check current level",
            "2. Use set_control_values with ramp parameter for smooth transition"
          ]
        },
        {
          task: "Monitor multiple controls",
          steps: [
            "1. Use get_control_values with array of control names",
            "2. Poll periodically to track changes"
          ]
        }
      ]
    };
  }
}

/**
 * Export the tool factory function
 */
export const createQueryQSysAPITool = (qrwcClient: QRWCClientInterface) => 
  new QueryQSysAPITool(qrwcClient);