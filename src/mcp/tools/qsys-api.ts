import { z } from "zod";
import { BaseQSysTool } from "./base.js";
import type { ToolCallResult } from "../handlers/index.js";
import type { ToolExecutionContext } from "./base.js";
import { QSysAPIReference } from "./api-reference.js";

/**
 * Parameters for the query_qsys_api tool
 */
export const QueryQSysAPIParamsSchema = z.object({
  requestId: z.string().uuid().optional().describe("Optional request ID for tracking"),
  query_type: z.enum(['methods', 'components', 'controls', 'examples', 'raw_commands'])
    .describe("Type of query to perform. Use 'raw_commands' for complete raw command reference"),
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
  
  constructor(qrwcClient: any) {
    super(
      qrwcClient,
      "query_qsys_api",
      "Query Q-SYS API reference. IMPORTANT: Use query_type='raw_commands' for send_raw_command documentation! Shows naming conventions (camelCase vs dot notation), common commands, examples. Other types: 'methods' (find commands), 'components' (component types), 'controls' (control types), 'examples' (usage). Examples: {query_type:'raw_commands'} for raw command guide, {query_type:'methods',search:'gain'} for gain methods, {query_type:'examples',method_name:'Component.Set'} for examples.",
      QueryQSysAPIParamsSchema
    );
    
    this.apiReference = new QSysAPIReference();
  }
  
  protected async executeInternal(
    params: QueryQSysAPIParams,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    try {
      let response: any = {};
      
      switch (params.query_type) {
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
        case 'raw_commands':
          response = this.queryRawCommands(params);
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
  
  private queryRawCommands(params: QueryQSysAPIParams) {
    const rawCommandsGuide = {
      query_type: 'raw_commands',
      overview: {
        description: "Q-SYS JSON-RPC API Reference for send_raw_command tool",
        important_notes: [
          "Q-SYS uses INCONSISTENT naming: some methods use camelCase (StatusGet, NoOp), others use dot notation (Control.Set, Component.Get)",
          "Always check the exact method name format in this reference",
          "Q-SYS has a bug where responses have 'id: null' - this is handled automatically"
        ]
      },
      naming_conventions: {
        camelCase: ["StatusGet", "NoOp", "Logon", "ComponentGetComponents", "ComponentGetControls"],
        dot_notation: ["Control.Get", "Control.Set", "Component.Get", "Component.Set", "ChangeGroup.*", "Snapshot.*"]
      },
      common_commands: [
        {
          name: "StatusGet",
          description: "Get Core status",
          format: "camelCase",
          example: { method: "StatusGet", params: {} }
        },
        {
          name: "NoOp",
          description: "Ping/keep-alive",
          format: "camelCase",
          example: { method: "NoOp", params: {} }
        },
        {
          name: "Control.Get",
          description: "Get Named Control values",
          format: "dot notation",
          example: { method: "Control.Get", params: ["Volume1", "Mute1"] }
        },
        {
          name: "Control.Set",
          description: "Set Named Control value",
          format: "dot notation",
          example: { method: "Control.Set", params: { Name: "Volume1", Value: -10, Ramp: 2.0 } }
        },
        {
          name: "Component.Get",
          description: "Get component control values",
          format: "dot notation",
          example: { 
            method: "Component.Get", 
            params: { 
              Name: "Mixer1", 
              Controls: [{ Name: "gain" }, { Name: "mute" }] 
            } 
          }
        },
        {
          name: "Component.Set",
          description: "Set component control values",
          format: "dot notation",
          example: { 
            method: "Component.Set", 
            params: { 
              Name: "Mixer1", 
              Controls: [
                { Name: "gain", Value: -10, Ramp: 2.0 },
                { Name: "mute", Value: true }
              ] 
            } 
          }
        }
      ],
      blocked_commands: [
        "Design.Save", "DesignSave",
        "Design.Delete", "DesignDelete", 
        "Design.Deploy", "DesignDeploy",
        "Core.Reboot", "CoreReboot",
        "Core.Shutdown", "CoreShutdown",
        "Core.FactoryReset", "CoreFactoryReset",
        "Network.Set", "NetworkSet"
      ],
      full_documentation: "For complete API documentation, use the Read tool on /QSYS_API_REFERENCE.md",
      tips: [
        "Use dedicated MCP tools (get_control_values, set_control_values) when possible",
        "Test with NoOp first to verify connectivity",
        "Component.Set and Control.Set support optional Ramp parameter for smooth transitions",
        "Use ChangeGroups for efficient monitoring of multiple controls"
      ]
    };
    
    // If search parameter provided, filter results
    if (params.search) {
      const search = params.search.toLowerCase();
      rawCommandsGuide.common_commands = rawCommandsGuide.common_commands.filter(cmd => 
        cmd.name.toLowerCase().includes(search) || 
        cmd.description.toLowerCase().includes(search)
      );
    }
    
    return rawCommandsGuide;
  }
}

/**
 * Export the tool factory function
 */
export const createQueryQSysAPITool = (qrwcClient: any) => 
  new QueryQSysAPITool(qrwcClient);