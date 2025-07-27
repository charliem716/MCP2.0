import { z } from 'zod';
import { BaseQSysTool, ToolExecutionContext } from './base.js';
import type { ToolCallResult } from '../handlers/index.js';
import { QSysAPIReference } from './api-reference.js';
import type { QRWCClientInterface } from '../qrwc/adapter.js';
import { MCPError, MCPErrorCode } from '../../shared/types/errors.js';

/**
 * Parameters for the query_qsys_api tool
 */
export const QueryQSysAPIParamsSchema = z.object({
  requestId: z
    .string()
    .uuid()
    .optional()
    .describe('Optional request ID for tracking'),
  query_type: z
    .enum(['tools', 'methods', 'components', 'controls', 'examples'])
    .describe(
      "Type of query to perform. Use 'tools' for available MCP tools and their usage"
    ),
  component_type: z
    .enum(['mixer', 'gain', 'router', 'snapshot', 'delay', 'eq'])
    .optional()
    .describe('Filter methods by component type'),
  method_category: z
    .enum([
      'Authentication',
      'Component',
      'Mixer',
      'Control',
      'Snapshot',
      'ChangeGroup',
      'Status',
    ])
    .optional()
    .describe('Filter methods by category'),
  search: z
    .string()
    .optional()
    .describe('Search in method names or descriptions'),
  component_name: z
    .string()
    .optional()
    .describe('Get methods for specific component'),
  method_name: z
    .string()
    .optional()
    .describe('Get details for specific method'),
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
      'query_qsys_api',
      "Interactive API documentation for all Q-SYS MCP tools. Query types: 'tools' for tool reference, 'methods' for API commands, 'components' for component types, 'controls' for control types, 'examples' for usage patterns. Supports fuzzy search and filtering. Features learning paths and contextual examples. Example: {query_type:'tools'} for complete tool documentation.",
      QueryQSysAPIParamsSchema
    );

    this.apiReference = new QSysAPIReference();
  }

  protected executeInternal(
    params: QueryQSysAPIParams,
    context: ToolExecutionContext
  ): ToolCallResult {
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
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
        isError: false,
      };
    } catch (error) {
      throw new MCPError(
        `Failed to query API reference: ${error instanceof Error ? error.message : String(error)}`,
        MCPErrorCode.TOOL_EXECUTION_ERROR,
        { originalError: error, params }
      );
    }
  }

  private queryMethods(params: QueryQSysAPIParams) {
    const methods = this.apiReference.queryMethods({
      component_type: params.component_type ?? '',
      method_category: params.method_category ?? '',
      search: params.search ?? '',
      method_name: params.method_name ?? '',
    });

    return {
      query_type: 'methods',
      count: methods.length,
      methods: methods.map(m => ({
        name: m.name,
        category: m.category,
        description: m.description,
        params: m.params,
        example: m.example,
      })),
    };
  }

  private queryComponentTypes() {
    const types = this.apiReference.getComponentTypes();

    return {
      query_type: 'components',
      count: types.length,
      component_types: types,
    };
  }

  private queryControlTypes() {
    const types = this.apiReference.getControlTypes();

    return {
      query_type: 'controls',
      count: types.length,
      control_types: types,
    };
  }

  private queryExamples(params: QueryQSysAPIParams) {
    const examples = this.apiReference.getExamples(params.method_name);

    return {
      query_type: 'examples',
      count: examples.length,
      examples,
      hint:
        examples.length === 0 && params.method_name
          ? `No example found for '${params.method_name}'. Try searching for the method first.`
          : undefined,
    };
  }

  private queryMCPTools() {
    return {
      query_type: 'tools',
      overview: {
        description:
          'Available MCP Tools for Q-SYS Control - 17 specialized tools for comprehensive system management',
        note: 'The send_raw_command tool has been deprecated for stability. Use these dedicated tools instead.',
        categories: {
          discovery: 'list_components, list_controls, qsys_get_all_controls',
          control: 'get_control_values, set_control_values, qsys_component_get',
          monitoring:
            'create_change_group, add_controls_to_change_group, poll_change_group, set_change_group_auto_poll, list_change_groups, remove_controls_from_change_group, clear_change_group, destroy_change_group',
          system: 'query_core_status, query_qsys_api, echo',
        },
      },
      tools: [
        {
          name: 'list_components',
          description:
            'Discover Q-SYS components with advanced filtering and detailed property information',
          usage:
            'Parameters: filter (string, optional), includeProperties (boolean, optional)',
          parameters: {
            filter:
              "Regex filter for names/types: 'mixer', '^Main', 'Gain|Delay', 'HDMI.*Input'",
            includeProperties:
              'Include detailed properties (channel counts, ranges, configuration)',
          },
          example: {
            tool: 'list_components',
            arguments: {
              filter: 'gain',
              includeProperties: true,
            },
          },
          examples: [
            { arguments: {}, description: 'List all components' },
            {
              arguments: { filter: 'gain', includeProperties: true },
              description: 'Gain components with min/max ranges',
            },
            {
              arguments: { filter: 'mixer', includeProperties: true },
              description: 'Mixers with input/output counts',
            },
            {
              arguments: {
                filter: 'gain|mixer|filter',
                includeProperties: true,
              },
              description:
                'Find all audio processing components with gain ranges, channel counts, processing capabilities',
            },
            {
              arguments: { filter: 'router|switch', includeProperties: true },
              description:
                'Discover video routing infrastructure with input/output matrices and routing capabilities',
            },
          ],
          returns: {
            basic: 'Array of components with names and types',
            with_properties:
              'Components with channel counts, parameter ranges, configuration settings',
          },
          property_data: {
            gain_components:
              'max_gain: 20, min_gain: -100, enable_stepper: True, multi_channel_count: 6',
            mixer_components:
              'n_inputs: 8, n_outputs: 4, crosspoint_gain_type: 0, matrix_panner: False',
            filter_components: 'max_slope, frequency_ranges, filter_types',
            camera_components:
              'resolution: 4K, stream_capabilities: H.264, control_features: PTZ',
          },
          performance_guidance: [
            'Use includeProperties sparingly on large systems (adds processing time)',
            'Filter first, then get properties for targeted discovery',
            'Cache component lists for repeated operations',
          ],
          real_world_scenarios: [
            'Building custom control surfaces - filter by component type + get properties',
            'System documentation - get all components with full property details',
            'Troubleshooting - find components matching specific configuration patterns',
          ],
          filter_examples: [
            "'mixer' - All mixer components",
            "'^Main' - Components starting with 'Main'",
            "'Gain|Filter' - Gain OR Filter components",
            "'HDMI.*Input' - HDMI input components",
          ],
          use_cases: [
            'Component discovery for control surfaces',
            'System documentation and inventory',
            'Configuration analysis and planning',
            'Automated system setup and routing',
          ],
        },
        {
          name: 'qsys_component_get',
          description:
            'Get specific control values from Q-SYS components with position data, string formatting, and UI-ready metadata for custom control surface development',
          usage: 'Parameters: component (required), controls (required array)',
          parameters: {
            component:
              "Name of the component (e.g., 'Main Mixer', 'Parametric_EQ_Left')",
            controls:
              "Array of control names relative to component (e.g., ['gain', 'mute', 'input.1.level'])",
          },
          example: {
            tool: 'qsys_component_get',
            arguments: {
              component: 'Main Mixer',
              controls: ['gain', 'mute', 'input.1.level'],
            },
          },
          examples: [
            {
              component: 'Main Mixer',
              controls: ['gain', 'mute', 'input.1.level'],
              description:
                'Retrieves controls with position data and string formatting',
            },
            {
              component: 'Parametric_EQ_Left',
              controls: ['frequency', 'gain', 'q_factor'],
              description:
                "Returns Frequency: '1.2kHz' (pos: 0.45), Gain: '+3.2dB' (pos: 0.66), Q: '2.1' (pos: 0.31)",
            },
            {
              component: 'Main_Mixer_Ch1',
              controls: ['gain', 'mute', 'eq_high', 'eq_mid', 'eq_low'],
              description:
                'Complete channel strip data with position values for physical faders',
            },
          ],
          returns: {
            standard: 'Control values with name, value, string, position',
            position: '0-1 normalized values perfect for UI sliders',
            string:
              "Human-readable values like '-12.0dB', '20.0kHz', 'unmuted'",
            efficiency:
              'More efficient than individual get_control_values calls for same component',
          },
          value_added_features: [
            'Position data eliminates need for range calculations in UIs',
            'String values reduce formatting overhead in display applications',
            "Control names are relative to component (use 'gain' not 'Main Mixer.gain')",
            'UI integration ready-to-display values for touchscreen interfaces',
          ],
          use_cases: [
            'Custom control surface development',
            'Touchscreen interface creation',
            'Real-time parameter monitoring',
            'Snapshot comparison and analysis',
          ],
          performance_tips: [
            'More efficient than calling get_control_values multiple times for same component',
            'Batch related controls from same component in single call',
            'Cache position values for UI animations',
          ],
        },
        {
          name: 'list_controls',
          description:
            'Discover component controls with advanced filtering and rich metadata',
          usage:
            'Parameters: component (optional), controlType (optional), includeMetadata (optional)',
          parameters: {
            component:
              'Component name to inspect. If omitted, returns controls from all components',
            controlType:
              "Filter by type: 'gain', 'mute', 'input_select', 'output_select', 'all'",
            includeMetadata:
              'Include rich metadata: direction, values, ranges, specifications',
          },
          example: {
            tool: 'list_controls',
            arguments: {
              component: 'Matrix_Mixer 9x6',
              controlType: 'mute',
              includeMetadata: true,
            },
          },
          examples: [
            {
              component: 'Main System Gain',
              description: 'All controls for specific component',
            },
            {
              controlType: 'gain',
              includeMetadata: true,
              description: 'All gain controls with values/ranges',
            },
            {
              component: 'Matrix_Mixer 9x6',
              controlType: 'mute',
              includeMetadata: true,
              description: 'Mute controls with states',
            },
            {
              controlType: 'gain',
              includeMetadata: true,
              description:
                'Find all fader controls across entire system - Building universal fader control interface',
            },
            {
              controlType: 'select',
              includeMetadata: true,
              description:
                'Discover routing controls for matrix operations - Automated routing and switching',
            },
          ],
          returns: {
            basic: 'Array of control names organized by component',
            with_metadata:
              'Controls with direction, current values, types, and operational parameters',
          },
          metadata_includes: [
            'direction: Read/Write access permissions (Read/Write = controllable, Read = monitoring only)',
            'value: Current control value',
            'type: Control data type (gain, mute, select, etc.)',
            'ranges: Min/max values where applicable',
            'position: Normalized 0-1 position for faders (0.0 = minimum, 1.0 = maximum - perfect for UI sliders)',
          ],
          metadata_explanation: {
            position_values:
              '0.0 = minimum, 1.0 = maximum (perfect for UI sliders)',
            direction_usage:
              'Read/Write = controllable, Read = monitoring only',
            value_interpretation:
              'Gain: dB values, Mute: 0/1 boolean, Select: input numbers',
          },
          performance_optimization: [
            'Use controlType filtering to reduce response size',
            'includeMetadata adds ~30% processing time but provides UI-ready data',
            'Component-specific calls are faster than system-wide discovery',
          ],
          integration_patterns: [
            'Control surface builders: component + controlType + includeMetadata',
            "System monitoring: controlType='gain' to track all audio levels",
            'Automation scripts: specific component to minimize data transfer',
          ],
          control_types: {
            gain: 'Audio level controls in dB',
            mute: 'Boolean on/off switches',
            input_select: 'Input routing selectors',
            output_select: 'Output routing selectors',
            trigger: 'Momentary action controls',
          },
          use_cases: [
            'Building custom control interfaces',
            'System control discovery and mapping',
            'Automated control validation',
            'Control surface layout planning',
          ],
        },
        {
          name: 'get_control_values',
          description: 'Get values for specific controls by their full names',
          parameters: {
            controls:
              "Array of control names (can be 'ControlName' or 'Component.ControlName' format)",
          },
          example: {
            tool: 'get_control_values',
            arguments: {
              controls: ['Main Gain.gain', 'Zone 1 Gain.mute', 'Master Volume'],
            },
          },
          returns: 'Current values for each requested control',
        },
        {
          name: 'set_control_values',
          description: 'Set values for Q-SYS controls with optional ramp time',
          parameters: {
            controls:
              'Array of control objects with name, value, and optional ramp',
          },
          examples: [
            {
              tool: 'set_control_values',
              arguments: {
                controls: [
                  { name: 'Main Gain.gain', value: -10 },
                  { name: 'Zone 1 Gain.mute', value: true },
                ],
              },
            },
            {
              tool: 'set_control_values',
              arguments: {
                controls: [{ name: 'Master Volume', value: -20, ramp: 2.5 }],
              },
              note: 'Ramp creates a smooth 2.5-second transition',
            },
          ],
          value_ranges: {
            gain: 'Typically -100 to 20 (dB)',
            mute: 'true/false (converted to 1/0 for Q-SYS)',
            position: '0.0 to 1.0',
            crosspoint: 'Input number for router selection',
          },
        },
        {
          name: 'query_core_status',
          description:
            'Comprehensive Q-SYS system telemetry and health monitoring with real-time data from all networked devices',
          usage:
            'Parameters: includeDetails, includeNetworkInfo, includePerformance (all boolean, optional)',
          parameters: {
            includeDetails:
              'Include firmware versions, platform details, hardware specifications',
            includeNetworkInfo:
              'Include IP configuration, network status, connectivity details',
            includePerformance:
              'Include detailed performance metrics and system telemetry',
          },
          example: {
            tool: 'query_core_status',
            arguments: {
              includeDetails: true,
              includeNetworkInfo: true,
              includePerformance: true,
            },
          },
          examples: [
            { arguments: {}, description: 'Basic connection status' },
            {
              arguments: {
                includeDetails: true,
                includeNetworkInfo: true,
                includePerformance: true,
              },
              description: 'Complete system telemetry (recommended)',
            },
            {
              arguments: { includePerformance: true },
              description: 'Performance monitoring only',
            },
          ],
          returns: {
            PeripheralStatus:
              'Real-time data from touchpanels, mics, speakers: temperatures (°C), memory usage %, screen brightness, network status, user interaction states',
            GeneralStatus:
              'Device health: PoE power consumption, audio streaming quality, system temperatures, voltage monitoring, network performance',
            CoreStatus:
              'Infrastructure telemetry: fan speeds (RPM), processor temps, voltage rails, network bitrates, hardware health',
          },
          real_time_data: {
            temperatures: 'e.g., Touchpanel: 44.4°C, Core: 53°C',
            fan_speeds: 'e.g., Core fan: 1425 RPM',
            memory_usage: 'Device memory utilization percentages',
            power_status: 'PoE consumption and power management states',
            network_health: 'Link status, speeds, and performance metrics',
          },
          use_cases: [
            'System health monitoring and alerting',
            'Temperature trend analysis',
            'Performance optimization',
            'Network troubleshooting',
            'Preventive maintenance scheduling',
            'Real-time dashboard creation',
          ],
          note: 'Enterprise-grade monitoring comparable to dedicated network management systems',
        },
        {
          name: 'qsys_get_all_controls',
          description:
            'Advanced bulk control management with intelligent filtering, pagination, and system analytics for large Q-SYS designs',
          usage:
            "Parameters: mode ('summary'/'filtered'/'full'), filter object (component, type, hasNonDefaultValue, namePattern), pagination (limit/offset), includeValues",
          parameters: {
            mode: "'summary' (default) for stats, 'filtered' for targeted retrieval, 'full' for complete dump",
            filter:
              'Smart filters: component name, type (gain/mute/select/trigger/text), non-default values, name regex',
            pagination:
              'limit (max 1000, default 100), offset for large datasets',
            includeValues:
              'Include current values (default: false, increases processing time)',
          },
          example: {
            tool: 'qsys_get_all_controls',
            arguments: {
              mode: 'filtered',
              filter: { component: 'Matrix_Mixer 9x6', type: 'gain' },
              includeValues: true,
            },
          },
          examples: [
            {
              mode: 'summary',
              description: 'System overview (recommended first call)',
            },
            {
              mode: 'filtered',
              filter: { hasNonDefaultValue: true },
              description: 'Find all modified controls',
            },
            {
              mode: 'filtered',
              filter: { type: 'mute' },
              pagination: { limit: 50 },
              description: 'Paginated mute controls',
            },
          ],
          returns:
            'Summary: system stats; Filtered: control array with metadata; Full: complete control dump',
          warning:
            "Handles 2,997+ controls efficiently. Avoid 'full' mode on systems >1000 controls",
          best_practices: [
            'Start with summary mode to understand system size',
            'Use filtered mode for targeted operations',
            'Use pagination for UI applications',
          ],
        },
        {
          name: 'query_qsys_api',
          description:
            'Comprehensive self-documenting API reference system with intelligent search, contextual examples, and guided learning paths for Q-SYS MCP mastery',
          usage:
            'Required: query_type. Optional: search, method_name, component_type, method_category',
          parameters: {
            query_type: {
              required: true,
              options: [
                'tools',
                'methods',
                'components',
                'controls',
                'examples',
              ],
              descriptions: {
                tools:
                  'Complete reference for all 17 MCP tools with parameters, examples, and workflows',
                methods: 'Q-SYS Core API methods and command reference',
                components: 'Available component types and their capabilities',
                controls: 'Control types, data formats, and value ranges',
                examples:
                  'Practical usage examples and implementation patterns',
              },
            },
            search:
              'Filter results by keyword with intelligent fuzzy matching across all documentation',
            method_name:
              'Get specific method documentation and contextual examples',
            component_type:
              'Filter by component type (mixer, gain, router, etc.) with smart suggestions',
            method_category:
              'Filter by category: Authentication, Component, Mixer, Control, Snapshot, ChangeGroup, Status',
          },
          intelligent_features: {
            contextual_search:
              'Smart keyword matching across all documentation with fuzzy logic',
            guided_learning:
              'Progressive skill-building paths tailored to experience level',
            example_generation:
              'Dynamic examples based on current system state and configuration',
            best_practice_recommendations:
              'Context-aware optimization suggestions and patterns',
          },
          learning_paths: [
            {
              beginner: 'tools → basic examples → simple workflows',
              intermediate: 'components → controls → automation patterns',
              advanced:
                'bulk operations → system monitoring → integration patterns',
            },
          ],
          contextual_examples: [
            {
              description:
                'Get examples relevant to current system configuration',
              call: { query_type: 'examples', search: 'mixer' },
              returns: 'Examples using actual mixers found in current design',
            },
            {
              description:
                'Find integration patterns for specific component types',
              call: { query_type: 'examples', component_type: 'gain' },
              returns: 'Real-world patterns for gain control automation',
            },
          ],
          advanced_search_features: [
            'Fuzzy matching for partial keyword searches',
            'Cross-reference linking between related topics',
            'Usage frequency recommendations based on common patterns',
            'Error pattern identification with diagnostic solutions',
          ],
          meta_capabilities: [
            'Self-updating documentation based on system configuration',
            'Usage analytics for identifying popular patterns',
            'Error diagnosis with suggested solutions and fixes',
            'Performance optimization recommendations',
          ],
          example: {
            tool: 'query_qsys_api',
            arguments: {
              query_type: 'methods',
              search: 'gain',
            },
          },
          examples: [
            {
              query_type: 'tools',
              description: 'Complete tool reference with guided learning path',
            },
            {
              query_type: 'methods',
              search: 'gain',
              description: 'Smart search for gain-related functionality',
            },
            {
              query_type: 'examples',
              method_name: 'Component.Set',
              description: 'Contextual examples for specific method',
            },
            {
              query_type: 'components',
              component_type: 'mixer',
              description: 'Mixer capabilities with real system examples',
            },
          ],
          agent_workflow: [
            "1. Start with {'query_type': 'tools'} for complete overview and learning path",
            "2. Use {'query_type': 'examples'} for contextual implementation patterns",
            "3. Search specific topics with fuzzy matching via 'search' parameter",
            '4. Follow learning paths: beginner → intermediate → advanced',
            '5. Reference anytime for intelligent suggestions and optimization tips',
          ],
          self_help_capability:
            'This tool provides complete documentation for itself and all other tools with intelligent features like contextual search, guided learning paths, and dynamic examples based on current system state',
          use_cases: [
            'New agent onboarding with progressive learning paths',
            'Finding contextual examples based on current system',
            'Parameter validation with error prevention',
            'Troubleshooting with diagnostic assistance',
            'API exploration with smart recommendations',
            'Performance optimization with best practices',
          ],
        },
        {
          name: 'echo',
          description:
            'Connection validation and communication testing tool for Q-SYS MCP channel',
          usage: 'Required parameter: message (string)',
          parameters: {
            message: 'Text message to echo back for connectivity verification',
          },
          example: {
            tool: 'echo',
            arguments: {
              message: 'Testing Q-SYS connection',
            },
          },
          examples: [
            {
              message: 'Testing Q-SYS connection',
              returns: 'Echo: Testing Q-SYS connection',
            },
            {
              message: 'Connection test 2025-07-22',
              returns: 'Echo: Connection test 2025-07-22',
            },
          ],
          returns:
            "Exact message string prefixed with 'Echo: ' confirming successful communication",
          use_cases: [
            'Verify MCP connection before complex operations',
            'Test communication latency and responsiveness',
            'Validate tool access and permissions',
            'Debug connection issues and timeouts',
            'Health check in automated monitoring systems',
            'Network connectivity troubleshooting',
          ],
          best_practices: [
            'Run echo test before starting complex Q-SYS operations',
            'Use for periodic health checks in automated systems',
            'Include timestamps in messages for latency testing',
            'Test with various message lengths for communication validation',
          ],
          integration_notes:
            'Essential tool for robust Q-SYS automation - always verify connectivity before attempting system modifications or bulk operations',
        },
        {
          name: 'create_change_group',
          description:
            'Create a new change group for monitoring control value changes. Groups allow efficient polling of multiple controls at once',
          usage: 'Parameters: groupId (string, required)',
          parameters: {
            groupId:
              'Unique identifier for the change group. Must be non-empty string',
          },
          example: {
            tool: 'create_change_group',
            arguments: {
              groupId: 'mixer-controls',
            },
          },
          examples: [
            {
              arguments: { groupId: 'mixer-controls' },
              description: 'Create group for monitoring mixer-related controls',
            },
            {
              arguments: { groupId: 'ui-page-1' },
              description: 'Create group for specific UI page monitoring',
            },
            {
              arguments: { groupId: 'critical-alarms' },
              description: 'Create group for system alarm monitoring',
            },
          ],
          returns: {
            success: 'true/false indicating operation success',
            groupId: 'The created group identifier',
            message: 'Success or warning message',
            warning: 'Present if group already exists',
          },
          use_cases: [
            'Initialize monitoring session for specific UI page',
            'Create separate groups for different subsystems (audio, video, control)',
            'Set up monitoring for user-adjustable controls',
            'Prepare for efficient bulk control monitoring',
            'Organize controls by functional area or user interface',
          ],
          best_practices: [
            'Use descriptive group IDs that indicate purpose',
            'Create logical groups based on UI pages or functional areas',
            'Always destroy groups when no longer needed',
            'Check for existing groups with list_change_groups before creating',
          ],
          errors: [
            'Throws if groupId is empty string',
            'Throws if Q-SYS Core is not connected',
            'Returns warning if group already exists (non-fatal)',
          ],
        },
        {
          name: 'add_controls_to_change_group',
          description:
            'Add Named Controls to a change group for monitoring. Controls must exist in Q-SYS design',
          usage:
            'Parameters: groupId (string), controlNames (array of strings)',
          parameters: {
            groupId: 'Change group identifier (must exist)',
            controlNames:
              "Array of control names to add (e.g., 'Gain1.gain', 'Mixer.level')",
          },
          example: {
            tool: 'add_controls_to_change_group',
            arguments: {
              groupId: 'mixer-controls',
              controlNames: [
                'MainMixer.gain',
                'MainMixer.mute',
                'MainMixer.input_1_gain',
              ],
            },
          },
          examples: [
            {
              arguments: {
                groupId: 'mixer-controls',
                controlNames: ['MainMixer.gain', 'MainMixer.mute'],
              },
              description: 'Add basic mixer controls',
            },
            {
              arguments: {
                groupId: 'channel-strip',
                controlNames: [
                  'Channel1.gain',
                  'Channel1.mute',
                  'Channel1.eq_high',
                  'Channel1.eq_mid',
                  'Channel1.eq_low',
                ],
              },
              description: 'Add complete channel strip controls',
            },
            {
              arguments: {
                groupId: 'dynamic-monitoring',
                controlNames: ['Zone1.level', 'Zone2.level', 'Zone3.level'],
              },
              description: 'Add zone level controls for multi-zone monitoring',
            },
          ],
          returns: {
            success: 'true/false indicating operation success',
            groupId: 'The group identifier',
            controlsAdded: 'Number of controls successfully added',
            message: 'Success message with count',
          },
          notes: [
            "Invalid control names are logged but don't cause operation to fail",
            'Controls can be added incrementally to existing group',
            'Duplicate controls are automatically filtered out',
            'Control names must match exactly (case-sensitive)',
          ],
          use_cases: [
            'Build monitoring groups incrementally as UI sections open',
            'Add controls dynamically based on user interaction',
            'Group related controls for efficient state tracking',
            'Monitor controls across multiple components',
          ],
          errors: [
            'Throws if groupId is empty',
            'Throws if controlNames array is empty',
            "Throws if change group doesn't exist",
            'Throws if Q-SYS Core is not connected',
          ],
        },
        {
          name: 'poll_change_group',
          description:
            'Poll a change group for control value changes since last poll. Returns only controls whose values changed',
          usage: 'Parameters: groupId (string, required)',
          parameters: {
            groupId: 'Change group identifier to poll',
          },
          example: {
            tool: 'poll_change_group',
            arguments: {
              groupId: 'mixer-controls',
            },
          },
          examples: [
            {
              arguments: { groupId: 'mixer-controls' },
              returns: {
                groupId: 'mixer-controls',
                changes: [
                  { Name: 'MainMixer.gain', Value: -6.5, String: '-6.5 dB' },
                  { Name: 'MainMixer.mute', Value: true, String: 'muted' },
                ],
                changeCount: 2,
                hasChanges: true,
              },
              description: 'Poll with changes detected',
            },
            {
              arguments: { groupId: 'stable-controls' },
              returns: {
                groupId: 'stable-controls',
                changes: [],
                changeCount: 0,
                hasChanges: false,
              },
              description: 'Poll with no changes',
            },
          ],
          returns: {
            groupId: 'The polled group identifier',
            changes:
              'Array of changed controls with Name, Value, and String properties',
            changeCount: 'Number of controls that changed',
            hasChanges: 'Boolean indicating if any changes occurred',
          },
          behavior: [
            "First poll returns all controls as 'changed'",
            'Subsequent polls only return controls with value changes',
            'Empty changes array indicates no changes since last poll',
            'String property provides human-readable control value',
          ],
          use_cases: [
            'Efficient UI updates - only redraw changed controls',
            'State change detection for automation triggers',
            'Activity monitoring and logging',
            'Building reactive control surfaces',
            'Implementing custom event systems',
          ],
          performance_tips: [
            'More efficient than polling individual controls',
            'Reduces network traffic for multi-control monitoring',
            'Ideal for UI refresh cycles',
          ],
          errors: [
            'Throws if groupId is empty',
            "Throws if change group doesn't exist",
            'Throws if Q-SYS Core is not connected',
          ],
        },
        {
          name: 'set_change_group_auto_poll',
          description:
            'Configure automatic polling for a change group. When enabled, polls at specified interval (0.1-300 seconds)',
          usage:
            'Parameters: groupId (string), enabled (boolean), intervalSeconds (number, optional)',
          parameters: {
            groupId: 'Change group identifier',
            enabled: 'Enable or disable automatic polling',
            intervalSeconds:
              'Polling interval in seconds (0.1-300, default: 1.0)',
          },
          example: {
            tool: 'set_change_group_auto_poll',
            arguments: {
              groupId: 'mixer-controls',
              enabled: true,
              intervalSeconds: 0.5,
            },
          },
          examples: [
            {
              arguments: {
                groupId: 'realtime-meters',
                enabled: true,
                intervalSeconds: 0.1,
              },
              description: 'Fast polling for real-time meters (100ms)',
            },
            {
              arguments: {
                groupId: 'ui-controls',
                enabled: true,
                intervalSeconds: 0.5,
              },
              description: 'Standard UI update rate (500ms)',
            },
            {
              arguments: {
                groupId: 'status-monitors',
                enabled: true,
                intervalSeconds: 5.0,
              },
              description: 'Slow polling for status indicators (5s)',
            },
            {
              arguments: { groupId: 'mixer-controls', enabled: false },
              description: 'Disable auto-polling',
            },
          ],
          returns: {
            success: 'true/false indicating operation success',
            groupId: 'The group identifier',
            autoPollEnabled: 'Current auto-poll state',
            intervalSeconds: 'Current interval (when enabled)',
            message: 'Success message',
          },
          important_notes: [
            'Minimum interval: 0.1 seconds (100ms)',
            'Maximum interval: 300 seconds (5 minutes)',
            'Auto-poll stops automatically after 10 consecutive failures',
            'Only one auto-poll timer per group (new settings replace existing)',
            'Use enabled:false to stop polling',
          ],
          use_cases: [
            'Real-time UI updates for control surfaces',
            'Continuous monitoring for alarm conditions',
            'Background state tracking',
            'Meter and level monitoring',
            'Activity detection and timeout handling',
          ],
          performance_considerations: [
            'Higher frequencies increase network and CPU load',
            'Consider round-trip time when setting intervals',
            'Each auto-poll group runs independently',
            'Balance responsiveness with system resources',
          ],
          errors: [
            'Throws if groupId is empty',
            'Throws if intervalSeconds is outside 0.1-300 range',
            "Throws if change group doesn't exist",
            'Throws if Q-SYS Core is not connected',
          ],
        },
        {
          name: 'list_change_groups',
          description:
            'List all active change groups showing ID, control count, and auto-poll status',
          usage: 'No parameters required',
          parameters: {},
          example: {
            tool: 'list_change_groups',
            arguments: {},
          },
          examples: [
            {
              arguments: {},
              returns: {
                groups: [
                  { id: 'mixer-controls', controlCount: 4, hasAutoPoll: true },
                  { id: 'room-controls', controlCount: 8, hasAutoPoll: false },
                ],
                totalGroups: 2,
                message: 'Found 2 active change group(s)',
              },
              description: 'System with multiple active groups',
            },
            {
              arguments: {},
              returns: {
                groups: [],
                totalGroups: 0,
                message: 'No active change groups',
              },
              description: 'Clean system with no groups',
            },
          ],
          returns: {
            groups:
              'Array of group objects with id, controlCount, and hasAutoPoll',
            totalGroups: 'Total number of active groups',
            message: 'Summary message',
          },
          use_cases: [
            'Monitor system state and resource usage',
            'Verify cleanup after operations',
            'Debug missing or orphaned groups',
            'Audit active monitoring sessions',
            'System health checks',
          ],
          best_practices: [
            'Check periodically to ensure groups are cleaned up',
            'Use before creating new groups to avoid duplicates',
            'Monitor total group count for resource management',
          ],
          errors: [
            'Throws if Q-SYS Core is not connected',
            "Throws if adapter doesn't support group listing",
          ],
        },
        {
          name: 'remove_controls_from_change_group',
          description:
            'Remove specific controls from a change group without destroying the group',
          usage:
            'Parameters: groupId (string), controlNames (array of strings)',
          parameters: {
            groupId: 'Change group identifier',
            controlNames: 'Array of control names to remove',
          },
          example: {
            tool: 'remove_controls_from_change_group',
            arguments: {
              groupId: 'mixer-controls',
              controlNames: [
                'MainMixer.input_1_gain',
                'MainMixer.input_2_gain',
              ],
            },
          },
          examples: [
            {
              arguments: {
                groupId: 'dynamic-group',
                controlNames: ['TempControl1', 'TempControl2'],
              },
              description: 'Remove temporary controls',
            },
            {
              arguments: {
                groupId: 'ui-page',
                controlNames: [
                  'HiddenSection.control1',
                  'HiddenSection.control2',
                ],
              },
              description: 'Remove controls for collapsed UI section',
            },
          ],
          returns: {
            success: 'true/false indicating operation success',
            groupId: 'The group identifier',
            controlsRemoved: 'Number of controls removed',
            message: 'Success message',
          },
          use_cases: [
            'Dynamically adjust monitoring scope',
            'Remove controls when UI sections close',
            'Optimize polling by removing inactive controls',
            'Fine-tune monitoring without recreating groups',
          ],
          notes: [
            'Group remains active after control removal',
            'Can remove controls that were never added (no error)',
            'Use clear_change_group to remove all controls at once',
          ],
          errors: [
            'Throws if groupId is empty',
            'Throws if controlNames array is empty',
            "Throws if change group doesn't exist",
            'Throws if Q-SYS Core is not connected',
          ],
        },
        {
          name: 'clear_change_group',
          description:
            'Remove all controls from a change group while keeping it active. Useful for reconfiguring monitoring',
          usage: 'Parameters: groupId (string, required)',
          parameters: {
            groupId: 'Change group identifier to clear',
          },
          example: {
            tool: 'clear_change_group',
            arguments: {
              groupId: 'mixer-controls',
            },
          },
          examples: [
            {
              arguments: { groupId: 'reconfigurable-group' },
              description: 'Clear group before reconfiguring with new controls',
            },
            {
              arguments: { groupId: 'session-controls' },
              description: 'Clear controls between user sessions',
            },
          ],
          returns: {
            success: 'true/false indicating operation success',
            groupId: 'The cleared group identifier',
            message: 'Success message',
          },
          use_cases: [
            'Reconfigure monitoring without destroying/recreating group',
            'Clear controls between different operational modes',
            'Reset monitoring scope while preserving group settings',
            'Prepare group for completely new set of controls',
          ],
          advantages: [
            'Preserves group ID and auto-poll settings',
            'More efficient than destroy/create cycle',
            'Maintains any group-specific configuration',
          ],
          errors: [
            'Throws if groupId is empty',
            "Throws if change group doesn't exist",
            'Throws if Q-SYS Core is not connected',
          ],
        },
        {
          name: 'destroy_change_group',
          description:
            'Destroy a change group and clean up all resources including auto-poll timers. Always destroy groups when no longer needed',
          usage: 'Parameters: groupId (string, required)',
          parameters: {
            groupId: 'Change group identifier to destroy',
          },
          example: {
            tool: 'destroy_change_group',
            arguments: {
              groupId: 'mixer-controls',
            },
          },
          examples: [
            {
              arguments: { groupId: 'ui-page-1' },
              description: 'Clean up when user navigates away from page',
            },
            {
              arguments: { groupId: 'temp-monitoring' },
              description: 'Remove temporary monitoring group',
            },
            {
              arguments: { groupId: 'session-controls' },
              description: 'Clean up at end of user session',
            },
          ],
          returns: {
            success: 'true/false indicating operation success',
            groupId: 'The destroyed group identifier',
            message: 'Success message',
          },
          cleanup_actions: [
            'Stops any active auto-poll timers',
            'Clears all stored control values and history',
            'Removes group from active groups list',
            'Frees all associated memory',
          ],
          use_cases: [
            'Clean up when UI page closes',
            'End monitoring session',
            'Free resources after temporary operations',
            'Prevent memory leaks in long-running applications',
          ],
          best_practices: [
            'Always destroy groups in cleanup/teardown code',
            'Destroy groups before application shutdown',
            'Use try/finally blocks to ensure cleanup',
            'Group ID can be reused after destruction',
          ],
          errors: [
            'Throws if groupId is empty',
            "Throws if change group doesn't exist",
            'Throws if Q-SYS Core is not connected',
          ],
        },
      ],
      best_practices: [
        'Use list_components first to discover available components',
        'Use list_controls to see what controls a component has',
        'For simple operations, use get_control_values and set_control_values',
        "Use component.control naming format (e.g., 'Main Gain.gain') for clarity",
        'Boolean values (true/false) are automatically converted to Q-SYS format (1/0)',
        'Add ramp parameter for smooth audio transitions',
        'Use change groups for efficient monitoring of multiple controls',
        'Always destroy change groups when no longer needed to prevent memory leaks',
        'Set appropriate auto-poll intervals based on use case (0.1s for meters, 0.5-2s for UI)',
        'Group related controls logically (by UI page, subsystem, or function)',
      ],
      common_workflows: [
        {
          task: 'Mute a zone',
          steps: [
            '1. Use list_components to find the zone gain component',
            "2. Use set_control_values with {name: 'Zone 1 Gain.mute', value: true}",
          ],
        },
        {
          task: 'Adjust volume with fade',
          steps: [
            '1. Use get_control_values to check current level',
            '2. Use set_control_values with ramp parameter for smooth transition',
          ],
        },
        {
          task: 'Monitor multiple controls efficiently',
          steps: [
            '1. Use create_change_group to create a monitoring group',
            '2. Use add_controls_to_change_group to add controls to monitor',
            '3. Use poll_change_group periodically or set_change_group_auto_poll for automatic updates',
            '4. Use destroy_change_group when monitoring is complete',
          ],
        },
        {
          task: 'Build reactive UI',
          steps: [
            "1. Create change group for UI page: create_change_group({groupId: 'page-1'})",
            "2. Add all UI controls: add_controls_to_change_group({groupId: 'page-1', controlNames: [...]})",
            "3. Enable auto-polling: set_change_group_auto_poll({groupId: 'page-1', enabled: true, intervalSeconds: 0.5})",
            '4. Update UI only for changed controls from poll results',
            "5. Destroy group on page exit: destroy_change_group({groupId: 'page-1'})",
          ],
        },
        {
          task: 'Monitor system alarms',
          steps: [
            "1. Create alarm group: create_change_group({groupId: 'alarms'})",
            "2. Add alarm controls: add_controls_to_change_group({groupId: 'alarms', controlNames: ['System.alarm1', 'System.alarm2']})",
            "3. Set slow auto-poll: set_change_group_auto_poll({groupId: 'alarms', enabled: true, intervalSeconds: 5})",
            '4. Process changes to trigger alerts',
          ],
        },
      ],
      change_group_patterns: {
        ui_monitoring: {
          description: 'Monitor controls for a UI page',
          pattern: 'create → add controls → enable auto-poll → destroy on exit',
        },
        event_driven: {
          description: 'Check for changes on demand',
          pattern:
            'create → add controls → manual poll when needed → destroy when done',
        },
        dynamic_scope: {
          description: 'Adjust monitoring scope dynamically',
          pattern:
            'create → add/remove controls as needed → clear to reset → destroy when done',
        },
      },
    };
  }
}

/**
 * Export the tool factory function
 */
export const createQueryQSysAPITool = (qrwcClient: QRWCClientInterface) =>
  new QueryQSysAPITool(qrwcClient);
