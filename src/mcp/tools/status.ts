import { z } from 'zod';
import { BaseQSysTool, BaseToolParamsSchema, type ToolExecutionContext } from './base.js';
import type { ToolCallResult } from '../handlers/index.js';
import type { IControlSystem } from '../interfaces/control-system.js';
import { isQSysApiResponse, type QSysStatusGetResponse, type QSysApiResponse, type QSysComponentInfo, type QSysControl } from '../types/qsys-api-responses.js';
import { MCPError, MCPErrorCode } from '../../shared/types/errors.js';

/**
 * Parameters for the query_core_status tool
 */
export const QueryCoreStatusParamsSchema = BaseToolParamsSchema.extend({
  includeDetails: z
    .boolean()
    .optional()
    .describe('Include detailed system information'),
  includeNetworkInfo: z
    .boolean()
    .optional()
    .describe('Include network configuration details'),
  includePerformance: z
    .boolean()
    .optional()
    .describe('Include performance metrics'),
});

export type QueryCoreStatusParams = z.infer<typeof QueryCoreStatusParamsSchema>;

/**
 * ## query_core_status - Enhanced System Telemetry Monitor
 *
 * Get comprehensive Q-SYS system status including real-time telemetry from all networked devices
 *
 * **Enhanced Returns:**
 * - **PeripheralStatus**: Real-time status from touchpanels, microphones, speakers
 *   - Temperature readings (°C)
 *   - Memory usage percentages
 *   - Screen brightness and power states
 *   - Network link status and speeds
 * - **GeneralStatus**: Device health monitoring
 *   - PoE power consumption and status
 *   - Audio streaming status
 *   - System temperatures and voltages
 * - **CoreStatus**: Network video core telemetry
 *   - Fan speeds (RPM)
 *   - Processor temperatures
 *   - Voltage rail monitoring
 *   - Network statistics and bitrates
 */
export class QueryCoreStatusTool extends BaseQSysTool<QueryCoreStatusParams> {
  constructor(qrwcClient: IControlSystem) {
    super(
      qrwcClient,
      'query_core_status',
      'Get Q-SYS system health telemetry. Use includeDetails for firmware/hardware info, includeNetworkInfo for network status, includePerformance for metrics. Returns device temperatures, fan speeds, memory usage, power consumption, and network health from Core and peripherals. Example: {includePerformance:true} for temperature monitoring. For complete telemetry details, use query_qsys_api {query_type:\'tools\',search:\'status\'}.',
      QueryCoreStatusParamsSchema
    );
  }

  protected async executeInternal(
    params: QueryCoreStatusParams,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    try {
      // Send command to get core status
      const response = await this.controlSystem.sendCommand('Status.Get');

      if (!response.result) {
        throw new MCPError(
          'No result in response from Q-SYS Core',
          MCPErrorCode.PROTOCOL_ERROR,
          { response }
        );
      }

      const status = this.parseStatusResponse(response.result, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(status),
          },
        ],
        isError: false,
      };
    } catch (error) {
      this.logger.warn(
        'StatusGet command failed, falling back to component-based status',
        { error }
      );

      // Fallback: Get status from status components
      try {
        const statusData = await this.getStatusFromComponents(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(statusData),
            },
          ],
          isError: false,
        };
      } catch (fallbackError) {
        this.logger.error('Failed to get status from components', {
          error: fallbackError,
          context,
        });
        throw fallbackError;
      }
    }
  }

  /**
   * Helper to safely access nested properties
   */
  private getNestedValue(obj: unknown, path: string): unknown {
    if (!obj || typeof obj !== 'object') return undefined;
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return current;
  }

  /**
   * Extract and validate the status response
   */
  private extractStatusResult(response: unknown): QSysStatusGetResponse {
    if (isQSysApiResponse<QSysStatusGetResponse>(response) && response.result) {
      return response.result;
    } else if (typeof response === 'object' && response !== null && 'Platform' in response) {
      return response as QSysStatusGetResponse;
    } else {
      throw new MCPError('Invalid status response format', MCPErrorCode.TOOL_EXECUTION_ERROR);
    }
  }

  /**
   * Build core information from status response
   */
  private buildCoreInfo(result: QSysStatusGetResponse): QSysCoreStatus['coreInfo'] {
    const record = result as unknown as Record<string, unknown>;
    return {
      name: String(result.Platform),
      version: String(result.Version ?? 'Unknown'),
      model: String(result.Platform),
      platform: String(result.Platform),
      serialNumber: record['SerialNumber'] ? String(record['SerialNumber']) : 'Unknown',
      firmwareVersion: record['FirmwareVersion'] ? String(record['FirmwareVersion']) : (result.Version ? String(result.Version) : 'Unknown'),
      buildTime: String('Unknown'),
      designName: String(result.DesignName),
    };
  }

  /**
   * Build connection status from response
   */
  private buildConnectionStatus(result: QSysStatusGetResponse): QSysCoreStatus['connectionStatus'] {
    return {
      connected: Boolean(result.IsConnected ?? true),
      uptime: String('Unknown'),
      lastSeen: new Date().toISOString(),
    };
  }

  /**
   * Build system health information
   */
  private buildSystemHealth(result: QSysStatusGetResponse): QSysCoreStatus['systemHealth'] {
    const record = result as unknown as Record<string, unknown>;
    return {
      status: result.Status.String ? String(result.Status.String) : 'unknown',
      temperature: Number(record['temperature'] ?? record['Temperature'] ?? 0),
      fanSpeed: Number(record['fanSpeed'] ?? record['FanSpeed'] ?? 0),
      powerSupplyStatus: String('unknown'),
    };
  }

  /**
   * Build design information
   */
  private buildDesignInfo(result: QSysStatusGetResponse): QSysCoreStatus['designInfo'] {
    return {
      designCompiled: Boolean(result.State === 'Active'),
      compileTime: String('Unknown'),
      processingLoad: Number(this.getNestedValue(result, 'designInfo.processingLoad') ?? 0),
      componentCount: Number(this.getNestedValue(result, 'designInfo.componentsCount') ?? 0),
      snapshotCount: Number(0),
      activeServices: [] as string[],
    };
  }

  /**
   * Build network information
   */
  private buildNetworkInfo(result: QSysStatusGetResponse): QSysCoreStatus['networkInfo'] {
    const record = result as unknown as Record<string, unknown>;
    const lanIp = this.getNestedValue(result, 'Network.LAN_A.IP');
    const gateway = this.getNestedValue(result, 'Network.LAN_A.Gateway');
    
    return {
      ipAddress: this.formatValue(lanIp) ?? this.formatValue(record['ipAddress']) ?? 'Unknown',
      macAddress: this.formatValue(record['macAddress']) ?? 'Unknown',
      gateway: this.formatValue(gateway) ?? this.formatValue(record['gateway']) ?? 'Unknown',
      dnsServers: [] as string[],
      ntpServer: 'Unknown',
      networkMode: 'Unknown',
    };
  }

  /**
   * Format a value to string safely
   */
  private formatValue(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (typeof value === 'object' && 'address' in value) {
      return this.formatValue((value as { address: unknown }).address);
    }
    if (typeof value === 'object' && 'value' in value) {
      return this.formatValue((value as { value: unknown }).value);
    }
    // For other objects, try to get a meaningful representation
    try {
      const str = JSON.stringify(value);
      return str === '{}' ? null : str;
    } catch {
      return null;
    }
  }

  /**
   * Build performance metrics
   */
  private buildPerformanceMetrics(result: QSysStatusGetResponse): QSysCoreStatus['performanceMetrics'] {
    const record = result as unknown as Record<string, unknown>;
    return {
      cpuUsage: Number(this.getNestedValue(result, 'Performance.CPU') ?? record['cpuUsage'] ?? record['CPUUsage'] ?? 0),
      memoryUsage: Number(this.getNestedValue(result, 'Performance.Memory') ?? record['memoryUsage'] ?? record['MemoryUsage'] ?? 0),
      memoryUsedMB: Number(0),
      memoryTotalMB: Number(0),
      audioLatency: Number(0),
      networkLatency: Number(0),
      fanSpeed: Number(record['fanSpeed'] ?? record['FanSpeed'] ?? 0),
    };
  }

  /**
   * Parse the QRWC response for status information
   */
  private parseStatusResponse(
    response: unknown,
    params: QueryCoreStatusParams
  ): QSysCoreStatus {
    this.logger.debug('Parsing status response', { response });

    // Extract and validate the result
    const result = this.extractStatusResult(response);

    // Check if this is fallback data from adapter
    if (result.Platform.includes('StatusGet not supported')) {
      throw new MCPError(
        'StatusGet returned fallback data - will scan for status components',
        MCPErrorCode.METHOD_NOT_FOUND,
        { platform: result.Platform }
      );
    }

    // Build comprehensive status object using helper methods
    return {
      coreInfo: this.buildCoreInfo(result),
      connectionStatus: this.buildConnectionStatus(result),
      systemHealth: this.buildSystemHealth(result),
      designInfo: this.buildDesignInfo(result),
      networkInfo: this.buildNetworkInfo(result),
      performanceMetrics: this.buildPerformanceMetrics(result),
      // Additional fields from Q-SYS response
      Platform: String(result.Platform),
      Version: String(result.Version ?? 'Unknown'),
      DesignName: String(result.DesignName),
      DesignCode: String(result.DesignCode),
      Status: {
        Name: String(result.Status.String),
        Code: Number(result.Status.Code),
        PercentCPU: Number(0),
      },
      IsConnected: Boolean(result.IsConnected ?? true),
    };
  }

  /**
   * Format status response for display
  // eslint-disable-next-line max-statements -- Format comprehensive status information   */
  private formatStatusResponse(
    status: QSysCoreStatus,
    params: QueryCoreStatusParams
  ): string {
    let result = `Q-SYS Core Status\n\n`;
    
    // Core info
    result += `Design: ${status.coreInfo.designName}\n`;
    result += `Platform: ${status.coreInfo.platform}\n`;
    if (status.coreInfo.model) {
      result += `Model: ${status.coreInfo.model}\n`;
    }
    
    // Connection status
    result += `\nConnection: ${status.connectionStatus.connected ? 'Connected' : 'Disconnected'}\n`;
    
    // System health
    result += `\nSystem Status: ${status.systemHealth.status}\n`;
    
    // Network info if requested
    if (params.includeNetworkInfo) {
      result += '\nNetwork Information:\n';
      if (status.networkInfo.ipAddress && status.networkInfo.ipAddress !== 'Unknown') {
        result += `  IP Address: ${status.networkInfo.ipAddress}\n`;
      }
    }
    
    // Performance metrics if requested
    if (params.includePerformance) {
      result += '\nPerformance:\n';
      if (status.performanceMetrics.cpuUsage > 0) {
        result += `  CPU Usage: ${status.performanceMetrics.cpuUsage}%\n`;
      }
      if (status.performanceMetrics.memoryUsage > 0) {
        result += `  Memory Usage: ${status.performanceMetrics.memoryUsage}%\n`;
      }
    }
    
    return result.trim();
  }

  /**
   * Get status from status components when StatusGet fails
   */
  // eslint-disable-next-line max-statements -- Complex status component parsing and aggregation
  private async getStatusFromComponents(
    params: QueryCoreStatusParams
  ): Promise<unknown> {
    // Get all components
    const componentsResponse = await this.controlSystem.sendCommand(
      'Component.GetComponents'
    );
    
    if (!isQSysApiResponse<QSysComponentInfo[]>(componentsResponse) || !componentsResponse.result) {
      this.logger.warn('Invalid components response');
      return {};
    }
    
    const components = componentsResponse.result;

    // Detect status components using scoring system
    const statusComponents = this.detectStatusComponents(components);

    if (statusComponents.length === 0) {
      return {
        message: 'No status components detected',
        componentCount: components.length,
        suggestion: "Status components typically have 'Status' in their name",
      };
    }

    // Get control values for all status components
    const statusData: Record<string, Record<string, unknown>> = {};

    for (const component of statusComponents) {
      try {
        const controlsResponse = await this.controlSystem.sendCommand(
          'Component.GetControls',
          {
            Name: component.Name,
          }
        );

        if (!isQSysApiResponse(controlsResponse) || !controlsResponse.result) {
          this.logger.warn('Invalid controls response for component', { component: component.Name });
          continue;
        }
        
        const controlsResult = controlsResponse.result as { Controls?: QSysControl[] };
        const controls = controlsResult.Controls ?? [];

        // Process controls into meaningful status data
        const componentStatus: Record<string, unknown> = {};

        for (const control of controls) {
          // Include all controls from status components
          const normalizedName = this.normalizeControlName(control.Name);
          componentStatus[normalizedName] = {
            value: control.Value,
            string: control.String,
            type: control.Type,
            direction: control.Direction,
          };
        }

        // Group by component category if possible
        const category = this.categorizeComponent(component.Name);
        statusData[category] ??= {};

        statusData[category][component.Name] = componentStatus;
      } catch (error) {
        this.logger.warn(
          `Failed to get controls for status component ${component.Name}`,
          { error }
        );
      }
    }

    // Return organized status data
    return this.organizeStatusData(statusData);
  }

  /**
   * Detect status components using hybrid scoring system
   */
  private detectStatusComponents(components: QSysComponentInfo[]): QSysComponentInfo[] {
    const statusComponents: Array<{ component: QSysComponentInfo; score: number }> = [];

    for (const component of components) {
      const score = this.getStatusScore(component);
      if (score >= 3) {
        statusComponents.push({ component, score });
      }
    }

    // Sort by score descending and return components
    return statusComponents
      .sort((a, b) => b.score - a.score)
      .map(item => item.component);
  }

  /**
   * Calculate status score for a component
   */
  private getStatusScore(component: QSysComponentInfo): number {
    let score = 0;
    const name = component.Name.toLowerCase();

    // Name pattern matching (3 points)
    const statusPatterns = ['status', 'monitor', 'health', 'diagnostic'];
    const statusSuffixes = ['_state', '_status'];
    const statusPrefixes = ['sys_', 'system_'];

    if (statusPatterns.some(pattern => name.includes(pattern))) {
      score += 3;
    }
    if (statusSuffixes.some(suffix => name.endsWith(suffix))) {
      score += 3;
    }
    if (statusPrefixes.some(prefix => name.startsWith(prefix))) {
      score += 3;
    }

    // Known status component types (5 points)
    const knownStatusTypes = [
      'Status Combiner',
      'System Monitor',
      'Device Monitor',
      'Core Status',
    ];
    if (knownStatusTypes.includes(component.Type)) {
      score += 5;
    }

    // Component properties analysis (2 points for relevant properties)
    if (Array.isArray(component.Properties)) {
      const hasStatusProperties = component.Properties.some((prop) =>
        ['status', 'health', 'state', 'online'].some(keyword =>
          prop.Name
            .toLowerCase()
            .includes(keyword)
        )
      );
      if (hasStatusProperties) {
        score += 2;
      }
    }

    // Negative indicators
    const audioPatterns = [
      'gain',
      'mixer',
      'eq',
      'compressor',
      'limiter',
      'crossover',
    ];
    if (audioPatterns.some(pattern => name.includes(pattern))) {
      score -= 5;
    }

    return score;
  }

  /**
   * Normalize control names for display
   */
  private normalizeControlName(name: string): string {
    // Remove common prefixes/suffixes and convert to readable format
    return name
      .replace(/^(status_|state_|health_)/i, '')
      .replace(/(_state|_status)$/i, '')
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Categorize component based on name
   */
  private categorizeComponent(name: string): string {
    const lowerName = name.toLowerCase();

    if (
      lowerName.includes('core') ||
      lowerName.includes('system') ||
      lowerName.includes('health')
    ) {
      return 'CoreStatus';
    }
    if (lowerName.includes('network') || lowerName.includes('ethernet')) {
      return 'NetworkStatus';
    }
    if (
      lowerName.includes('touchpanel') ||
      lowerName.includes('mic') ||
      lowerName.includes('camera') ||
      lowerName.includes('display')
    ) {
      return 'PeripheralStatus';
    }

    return 'GeneralStatus';
  }

  /**
   * Organize status data into a clean structure
   */
  private organizeStatusData(statusData: Record<string, Record<string, unknown>>): unknown {
    const organized: Record<string, unknown> = {};

    // Process each category
    for (const [category, components] of Object.entries(statusData)) {
      if (Object.keys(components).length > 0) {
        // Keep component structure for clarity
        organized[category] = components;
      }
    }

    // Add metadata
    organized['_metadata'] = {
      source: 'status_components',
      timestamp: new Date().toISOString(),
      method: 'component_scan',
    };

    return organized;
  }
}

/**
 * Q-SYS Core Status interface
 */
interface QSysCoreStatus {
  coreInfo: {
    name: string;
    version: string;
    model: string;
    platform: string;
    serialNumber: string;
    firmwareVersion: string;
    buildTime: string;
    designName: string;
  };
  connectionStatus: {
    connected: boolean;
    uptime: string;
    lastSeen: string;
  };
  systemHealth: {
    status: string;
    temperature: number;
    fanSpeed: number;
    powerSupplyStatus: string;
  };
  designInfo: {
    designCompiled: boolean;
    compileTime: string;
    processingLoad: number;
    componentCount: number;
    snapshotCount: number;
    activeServices: string[];
  };
  networkInfo: {
    ipAddress: string;
    macAddress: string;
    gateway: string;
    dnsServers: string[];
    ntpServer: string;
    networkMode: string;
  };
  performanceMetrics: {
    cpuUsage: number;
    memoryUsage: number;
    memoryUsedMB: number;
    memoryTotalMB: number;
    audioLatency: number;
    networkLatency: number;
    fanSpeed: number;
  };
  // Additional fields for compatibility
  Platform: string;
  Version: string;
  DesignName: string;
  DesignCode: string;
  Status: {
    Name: string;
    Code: number;
    PercentCPU: number;
  };
  IsConnected: boolean;
}

/**
 * Factory function to create the tool
 */
export const createQueryCoreStatusTool = (qrwcClient: IControlSystem) =>
  new QueryCoreStatusTool(qrwcClient);
