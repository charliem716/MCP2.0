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
      "Interactive API documentation for all Q-SYS MCP tools. Query types: 'tools' for tool reference, 'methods' for API commands, 'components' for component types, 'controls' for control types, 'examples' for usage patterns. Supports fuzzy search and filtering. Features learning paths and contextual examples. Example: {query_type:'tools'} for complete tool documentation.",
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
      component_type: params.component_type || '',
      method_category: params.method_category || '',
      search: params.search || '',
      method_name: params.method_name || ''
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
          description: "Discover Q-SYS components with advanced filtering and detailed property information",
          usage: "Parameters: filter (string, optional), includeProperties (boolean, optional)",
          parameters: {
            filter: "Regex filter for names/types: 'mixer', '^Main', 'Gain|Delay', 'HDMI.*Input'",
            includeProperties: "Include detailed properties (channel counts, ranges, configuration)"
          },
          example: {
            tool: "list_components",
            arguments: {
              filter: "gain",
              includeProperties: true
            }
          },
          examples: [
            { arguments: {}, description: "List all components" },
            { arguments: { filter: "gain", includeProperties: true }, description: "Gain components with min/max ranges" },
            { arguments: { filter: "mixer", includeProperties: true }, description: "Mixers with input/output counts" },
            { arguments: { filter: "gain|mixer|filter", includeProperties: true }, description: "Find all audio processing components with gain ranges, channel counts, processing capabilities" },
            { arguments: { filter: "router|switch", includeProperties: true }, description: "Discover video routing infrastructure with input/output matrices and routing capabilities" }
          ],
          returns: {
            basic: "Array of components with names and types",
            with_properties: "Components with channel counts, parameter ranges, configuration settings"
          },
          property_data: {
            gain_components: "max_gain: 20, min_gain: -100, enable_stepper: True, multi_channel_count: 6",
            mixer_components: "n_inputs: 8, n_outputs: 4, crosspoint_gain_type: 0, matrix_panner: False",
            filter_components: "max_slope, frequency_ranges, filter_types",
            camera_components: "resolution: 4K, stream_capabilities: H.264, control_features: PTZ"
          },
          performance_guidance: [
            "Use includeProperties sparingly on large systems (adds processing time)",
            "Filter first, then get properties for targeted discovery",
            "Cache component lists for repeated operations"
          ],
          real_world_scenarios: [
            "Building custom control surfaces - filter by component type + get properties",
            "System documentation - get all components with full property details",
            "Troubleshooting - find components matching specific configuration patterns"
          ],
          filter_examples: [
            "'mixer' - All mixer components",
            "'^Main' - Components starting with 'Main'",
            "'Gain|Filter' - Gain OR Filter components",
            "'HDMI.*Input' - HDMI input components"
          ],
          use_cases: [
            "Component discovery for control surfaces",
            "System documentation and inventory",
            "Configuration analysis and planning",
            "Automated system setup and routing"
          ]
        },
        {
          name: "qsys_component_get",
          description: "Get specific control values from Q-SYS components with position data, string formatting, and UI-ready metadata for custom control surface development",
          usage: "Parameters: component (required), controls (required array)",
          parameters: {
            component: "Name of the component (e.g., 'Main Mixer', 'Parametric_EQ_Left')",
            controls: "Array of control names relative to component (e.g., ['gain', 'mute', 'input.1.level'])"
          },
          example: {
            tool: "qsys_component_get",
            arguments: {
              component: "Main Mixer",
              controls: ["gain", "mute", "input.1.level"]
            }
          },
          examples: [
            {
              component: "Main Mixer",
              controls: ["gain", "mute", "input.1.level"],
              description: "Retrieves controls with position data and string formatting"
            },
            {
              component: "Parametric_EQ_Left",
              controls: ["frequency", "gain", "q_factor"],
              description: "Returns Frequency: '1.2kHz' (pos: 0.45), Gain: '+3.2dB' (pos: 0.66), Q: '2.1' (pos: 0.31)"
            },
            {
              component: "Main_Mixer_Ch1",
              controls: ["gain", "mute", "eq_high", "eq_mid", "eq_low"],
              description: "Complete channel strip data with position values for physical faders"
            }
          ],
          returns: {
            standard: "Control values with name, value, string, position",
            position: "0-1 normalized values perfect for UI sliders",
            string: "Human-readable values like '-12.0dB', '20.0kHz', 'unmuted'",
            efficiency: "More efficient than individual get_control_values calls for same component"
          },
          value_added_features: [
            "Position data eliminates need for range calculations in UIs",
            "String values reduce formatting overhead in display applications",
            "Control names are relative to component (use 'gain' not 'Main Mixer.gain')",
            "UI integration ready-to-display values for touchscreen interfaces"
          ],
          use_cases: [
            "Custom control surface development",
            "Touchscreen interface creation",
            "Real-time parameter monitoring",
            "Snapshot comparison and analysis"
          ],
          performance_tips: [
            "More efficient than calling get_control_values multiple times for same component",
            "Batch related controls from same component in single call",
            "Cache position values for UI animations"
          ]
        },
        {
          name: "list_controls",
          description: "Discover component controls with advanced filtering and rich metadata",
          usage: "Parameters: component (optional), controlType (optional), includeMetadata (optional)",
          parameters: {
            component: "Component name to inspect. If omitted, returns controls from all components",
            controlType: "Filter by type: 'gain', 'mute', 'input_select', 'output_select', 'all'",
            includeMetadata: "Include rich metadata: direction, values, ranges, specifications"
          },
          example: {
            tool: "list_controls",
            arguments: {
              component: "Matrix_Mixer 9x6",
              controlType: "mute",
              includeMetadata: true
            }
          },
          examples: [
            { component: "Main System Gain", description: "All controls for specific component" },
            { controlType: "gain", includeMetadata: true, description: "All gain controls with values/ranges" },
            { component: "Matrix_Mixer 9x6", controlType: "mute", includeMetadata: true, description: "Mute controls with states" },
            { controlType: "gain", includeMetadata: true, description: "Find all fader controls across entire system - Building universal fader control interface" },
            { controlType: "select", includeMetadata: true, description: "Discover routing controls for matrix operations - Automated routing and switching" }
          ],
          returns: {
            basic: "Array of control names organized by component",
            with_metadata: "Controls with direction, current values, types, and operational parameters"
          },
          metadata_includes: [
            "direction: Read/Write access permissions (Read/Write = controllable, Read = monitoring only)",
            "value: Current control value",
            "type: Control data type (gain, mute, select, etc.)",
            "ranges: Min/max values where applicable",
            "position: Normalized 0-1 position for faders (0.0 = minimum, 1.0 = maximum - perfect for UI sliders)"
          ],
          metadata_explanation: {
            position_values: "0.0 = minimum, 1.0 = maximum (perfect for UI sliders)",
            direction_usage: "Read/Write = controllable, Read = monitoring only",
            value_interpretation: "Gain: dB values, Mute: 0/1 boolean, Select: input numbers"
          },
          performance_optimization: [
            "Use controlType filtering to reduce response size",
            "includeMetadata adds ~30% processing time but provides UI-ready data",
            "Component-specific calls are faster than system-wide discovery"
          ],
          integration_patterns: [
            "Control surface builders: component + controlType + includeMetadata",
            "System monitoring: controlType='gain' to track all audio levels",
            "Automation scripts: specific component to minimize data transfer"
          ],
          control_types: {
            gain: "Audio level controls in dB",
            mute: "Boolean on/off switches",
            input_select: "Input routing selectors",
            output_select: "Output routing selectors",
            trigger: "Momentary action controls"
          },
          use_cases: [
            "Building custom control interfaces",
            "System control discovery and mapping",
            "Automated control validation",
            "Control surface layout planning"
          ]
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
          description: "Comprehensive Q-SYS system telemetry and health monitoring with real-time data from all networked devices",
          usage: "Parameters: includeDetails, includeNetworkInfo, includePerformance (all boolean, optional)",
          parameters: {
            includeDetails: "Include firmware versions, platform details, hardware specifications",
            includeNetworkInfo: "Include IP configuration, network status, connectivity details",
            includePerformance: "Include detailed performance metrics and system telemetry"
          },
          example: {
            tool: "query_core_status",
            arguments: {
              includeDetails: true,
              includeNetworkInfo: true,
              includePerformance: true
            }
          },
          examples: [
            { arguments: {}, description: "Basic connection status" },
            { arguments: { includeDetails: true, includeNetworkInfo: true, includePerformance: true }, description: "Complete system telemetry (recommended)" },
            { arguments: { includePerformance: true }, description: "Performance monitoring only" }
          ],
          returns: {
            PeripheralStatus: "Real-time data from touchpanels, mics, speakers: temperatures (°C), memory usage %, screen brightness, network status, user interaction states",
            GeneralStatus: "Device health: PoE power consumption, audio streaming quality, system temperatures, voltage monitoring, network performance",
            CoreStatus: "Infrastructure telemetry: fan speeds (RPM), processor temps, voltage rails, network bitrates, hardware health"
          },
          real_time_data: {
            temperatures: "e.g., Touchpanel: 44.4°C, Core: 53°C",
            fan_speeds: "e.g., Core fan: 1425 RPM",
            memory_usage: "Device memory utilization percentages",
            power_status: "PoE consumption and power management states",
            network_health: "Link status, speeds, and performance metrics"
          },
          use_cases: [
            "System health monitoring and alerting",
            "Temperature trend analysis",
            "Performance optimization",
            "Network troubleshooting",
            "Preventive maintenance scheduling",
            "Real-time dashboard creation"
          ],
          note: "Enterprise-grade monitoring comparable to dedicated network management systems"
        },
        {
          name: "qsys_get_all_controls",
          description: "Advanced bulk control management with intelligent filtering, pagination, and system analytics for large Q-SYS designs",
          usage: "Parameters: mode ('summary'/'filtered'/'full'), filter object (component, type, hasNonDefaultValue, namePattern), pagination (limit/offset), includeValues",
          parameters: {
            mode: "'summary' (default) for stats, 'filtered' for targeted retrieval, 'full' for complete dump",
            filter: "Smart filters: component name, type (gain/mute/select/trigger/text), non-default values, name regex",
            pagination: "limit (max 1000, default 100), offset for large datasets",
            includeValues: "Include current values (default: false, increases processing time)"
          },
          example: {
            tool: "qsys_get_all_controls",
            arguments: {
              mode: "filtered",
              filter: { component: "Matrix_Mixer 9x6", type: "gain" },
              includeValues: true
            }
          },
          examples: [
            { mode: "summary", description: "System overview (recommended first call)" },
            { mode: "filtered", filter: { hasNonDefaultValue: true }, description: "Find all modified controls" },
            { mode: "filtered", filter: { type: "mute" }, pagination: { limit: 50 }, description: "Paginated mute controls" }
          ],
          returns: "Summary: system stats; Filtered: control array with metadata; Full: complete control dump",
          warning: "Handles 2,997+ controls efficiently. Avoid 'full' mode on systems >1000 controls",
          best_practices: [
            "Start with summary mode to understand system size",
            "Use filtered mode for targeted operations",
            "Use pagination for UI applications"
          ]
        },
        {
          name: "query_qsys_api",
          description: "Comprehensive self-documenting API reference system with intelligent search, contextual examples, and guided learning paths for Q-SYS MCP mastery",
          usage: "Required: query_type. Optional: search, method_name, component_type, method_category",
          parameters: {
            query_type: {
              required: true,
              options: ["tools", "methods", "components", "controls", "examples"],
              descriptions: {
                tools: "Complete reference for all 9 MCP tools with parameters, examples, and workflows",
                methods: "Q-SYS Core API methods and command reference",
                components: "Available component types and their capabilities",
                controls: "Control types, data formats, and value ranges",
                examples: "Practical usage examples and implementation patterns"
              }
            },
            search: "Filter results by keyword with intelligent fuzzy matching across all documentation",
            method_name: "Get specific method documentation and contextual examples",
            component_type: "Filter by component type (mixer, gain, router, etc.) with smart suggestions",
            method_category: "Filter by category: Authentication, Component, Mixer, Control, Snapshot, ChangeGroup, Status"
          },
          intelligent_features: {
            contextual_search: "Smart keyword matching across all documentation with fuzzy logic",
            guided_learning: "Progressive skill-building paths tailored to experience level",
            example_generation: "Dynamic examples based on current system state and configuration",
            best_practice_recommendations: "Context-aware optimization suggestions and patterns"
          },
          learning_paths: [
            {
              beginner: "tools → basic examples → simple workflows",
              intermediate: "components → controls → automation patterns",
              advanced: "bulk operations → system monitoring → integration patterns"
            }
          ],
          contextual_examples: [
            {
              description: "Get examples relevant to current system configuration",
              call: { query_type: "examples", search: "mixer" },
              returns: "Examples using actual mixers found in current design"
            },
            {
              description: "Find integration patterns for specific component types",
              call: { query_type: "examples", component_type: "gain" },
              returns: "Real-world patterns for gain control automation"
            }
          ],
          advanced_search_features: [
            "Fuzzy matching for partial keyword searches",
            "Cross-reference linking between related topics",
            "Usage frequency recommendations based on common patterns",
            "Error pattern identification with diagnostic solutions"
          ],
          meta_capabilities: [
            "Self-updating documentation based on system configuration",
            "Usage analytics for identifying popular patterns",
            "Error diagnosis with suggested solutions and fixes",
            "Performance optimization recommendations"
          ],
          example: {
            tool: "query_qsys_api",
            arguments: {
              query_type: "methods",
              search: "gain"
            }
          },
          examples: [
            { query_type: "tools", description: "Complete tool reference with guided learning path" },
            { query_type: "methods", search: "gain", description: "Smart search for gain-related functionality" },
            { query_type: "examples", method_name: "Component.Set", description: "Contextual examples for specific method" },
            { query_type: "components", component_type: "mixer", description: "Mixer capabilities with real system examples" }
          ],
          agent_workflow: [
            "1. Start with {'query_type': 'tools'} for complete overview and learning path",
            "2. Use {'query_type': 'examples'} for contextual implementation patterns",
            "3. Search specific topics with fuzzy matching via 'search' parameter",
            "4. Follow learning paths: beginner → intermediate → advanced",
            "5. Reference anytime for intelligent suggestions and optimization tips"
          ],
          self_help_capability: "This tool provides complete documentation for itself and all other tools with intelligent features like contextual search, guided learning paths, and dynamic examples based on current system state",
          use_cases: [
            "New agent onboarding with progressive learning paths",
            "Finding contextual examples based on current system",
            "Parameter validation with error prevention",
            "Troubleshooting with diagnostic assistance",
            "API exploration with smart recommendations",
            "Performance optimization with best practices"
          ]
        },
        {
          name: "echo",
          description: "Connection validation and communication testing tool for Q-SYS MCP channel",
          usage: "Required parameter: message (string)",
          parameters: {
            message: "Text message to echo back for connectivity verification"
          },
          example: {
            tool: "echo",
            arguments: {
              message: "Testing Q-SYS connection"
            }
          },
          examples: [
            { message: "Testing Q-SYS connection", returns: "Echo: Testing Q-SYS connection" },
            { message: "Connection test 2025-07-22", returns: "Echo: Connection test 2025-07-22" }
          ],
          returns: "Exact message string prefixed with 'Echo: ' confirming successful communication",
          use_cases: [
            "Verify MCP connection before complex operations",
            "Test communication latency and responsiveness",
            "Validate tool access and permissions",
            "Debug connection issues and timeouts",
            "Health check in automated monitoring systems",
            "Network connectivity troubleshooting"
          ],
          best_practices: [
            "Run echo test before starting complex Q-SYS operations",
            "Use for periodic health checks in automated systems",
            "Include timestamps in messages for latency testing",
            "Test with various message lengths for communication validation"
          ],
          integration_notes: "Essential tool for robust Q-SYS automation - always verify connectivity before attempting system modifications or bulk operations"
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