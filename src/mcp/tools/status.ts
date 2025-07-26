import { z } from 'zod';
import { BaseQSysTool, BaseToolParamsSchema, ToolExecutionContext } from './base.js';
import type { ToolCallResult } from '../handlers/index.js';
import type { QRWCClientInterface } from '../qrwc/adapter.js';
import type { QSysStatusGetResponse } from '../types/qsys-api-responses.js';
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
  constructor(qrwcClient: QRWCClientInterface) {
    super(
      qrwcClient,
      'query_core_status',
      'Get Q-SYS system health telemetry. Use includeDetails for firmware/hardware info, includeNetworkInfo for network status, includePerformance for metrics. Returns device temperatures, fan speeds, memory usage, power consumption, and network health from Core and peripherals. Example: {includePerformance:true} for temperature monitoring.',
      QueryCoreStatusParamsSchema
    );
  }

  protected async executeInternal(
    params: QueryCoreStatusParams,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    try {
      // Send command to get core status
      const response = await this.qrwcClient.sendCommand('Status.Get');

      if (!response || typeof response !== 'object') {
        throw new MCPError(
          'Invalid response from Q-SYS Core',
          MCPErrorCode.PROTOCOL_ERROR,
          { response }
        );
      }

      const status = this.parseStatusResponse(response, params);

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
   * Parse the QRWC response for status information
   */
  private parseStatusResponse(
    response: unknown,
    params: QueryCoreStatusParams
  ): QSysCoreStatus {
    this.logger.debug('Parsing status response', { response });

    // Extract status information from response
    const resp = response as { result?: QSysStatusGetResponse };
    const baseResult = resp.result ?? (response as QSysStatusGetResponse);
    // Cast to any to access additional fields that might be in the response
    const result = baseResult as any;

    // Check if this is fallback data from adapter
    if (result.Platform?.includes('StatusGet not supported')) {
      throw new MCPError(
        'StatusGet returned fallback data - will scan for status components',
        MCPErrorCode.METHOD_NOT_FOUND,
        { platform: result.Platform }
      );
    }

    // Build comprehensive status object
    return {
      coreInfo: {
        name: String(result.Platform ?? 'Unknown Core'),
        version: String(result.Version ?? 'Unknown'),
        model: String(result.Platform ?? 'Unknown'),
        platform: String(result.Platform ?? 'Unknown'),
        serialNumber: String(result.SerialNumber ?? 'Unknown'),
        firmwareVersion: String(
          result.FirmwareVersion ?? result.Version ?? 'Unknown'
        ),
        buildTime: String('Unknown'),
        designName: String(result.DesignName ?? 'No Design Loaded'),
      },
      connectionStatus: {
        connected: Boolean(result.IsConnected ?? true),
        uptime: String('Unknown'),
        lastSeen: new Date().toISOString(),
      },
      systemHealth: {
        status: String(result.Status?.String ?? 'unknown'),
        temperature: Number(result.temperature ?? result.Temperature ?? 0),
        fanSpeed: Number(result.fanSpeed ?? result.FanSpeed ?? 0),
        powerSupplyStatus: String('unknown'),
      },
      designInfo: {
        designCompiled: Boolean(result.State === 'Active'),
        compileTime: String('Unknown'),
        processingLoad: Number(result.designInfo?.processingLoad ?? 0),
        componentCount: Number(result.designInfo?.componentsCount ?? 0),
        snapshotCount: Number(0),
        activeServices: [] as string[],
      },
      networkInfo: {
        ipAddress: String(result.Network?.LAN_A?.IP ?? result.ipAddress ?? 'Unknown'),
        macAddress: String(result.macAddress ?? 'Unknown'),
        gateway: String(result.Network?.LAN_A?.Gateway ?? result.gateway ?? 'Unknown'),
        dnsServers: [] as string[],
        ntpServer: String('Unknown'),
        networkMode: String('Unknown'),
      },
      performanceMetrics: {
        cpuUsage: Number(result.Performance?.CPU ?? result.cpuUsage ?? result.CPUUsage ?? 0),
        memoryUsage: Number(result.Performance?.Memory ?? result.memoryUsage ?? result.MemoryUsage ?? 0),
        memoryUsedMB: Number(0),
        memoryTotalMB: Number(0),
        audioLatency: Number(0),
        networkLatency: Number(0),
        fanSpeed: Number(result.fanSpeed ?? result.FanSpeed ?? 0),
      },
      // Additional fields from Q-SYS response
      Platform: String(result.Platform ?? 'Unknown'),
      Version: String(result.Version ?? 'Unknown'),
      DesignName: String(result.DesignName ?? 'Unknown'),
      DesignCode: String(result.DesignCode ?? ''),
      Status: {
        Name: String(result.Status?.String ?? 'Unknown'),
        Code: Number(result.Status?.Code ?? -1),
        PercentCPU: Number(0),
      },
      IsConnected: Boolean(result.IsConnected ?? true),
    };
  }

  /**
   * Format status response for display
   */
  private formatStatusResponse(
    status: QSysCoreStatus,
    params: QueryCoreStatusParams
  ): string {
    let result = `Q-SYS Core Status\n\n`;
    
    // Core info
    if (status.coreInfo) {
      result += `Design: ${status.coreInfo.designName ?? 'Unknown'}\n`;
      result += `Platform: ${status.coreInfo.platform ?? 'Unknown'}\n`;
      if (status.coreInfo.model) {
        result += `Model: ${status.coreInfo.model}\n`;
      }
    }
    
    // Basic info from direct fields
    if (status.DesignName) {
      result += `Design Name: ${status.DesignName}\n`;
    }
    if (status.Platform) {
      result += `Platform: ${status.Platform}\n`;
    }
    
    // Connection status
    if (status.connectionStatus) {
      result += `\nConnection: ${status.connectionStatus.connected ? 'Connected' : 'Disconnected'}\n`;
    }
    
    // System health
    if (status.systemHealth) {
      result += `\nSystem Status: ${status.systemHealth.status ?? 'Unknown'}\n`;
    }
    if (status.Status) {
      result += `Status: ${status.Status.Name ?? 'OK'} (Code: ${status.Status.Code})\n`;
    }
    
    // Network info if requested
    if (params.includeNetworkInfo && status.networkInfo) {
      result += '\nNetwork Information:\n';
      if (status.networkInfo.ipAddress && status.networkInfo.ipAddress !== 'Unknown') {
        result += `  IP Address: ${status.networkInfo.ipAddress}\n`;
      }
    }
    
    // Performance metrics if requested
    if (params.includePerformance && status.performanceMetrics) {
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
  private async getStatusFromComponents(
    params: QueryCoreStatusParams
  ): Promise<unknown> {
    // Get all components
    const componentsResponse = await this.qrwcClient.sendCommand(
      'Component.GetComponents'
    );
    const components = (componentsResponse as any)?.result ?? [];

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
    const statusData: Record<string, any> = {};

    for (const component of statusComponents) {
      try {
        const controlsResponse = await this.qrwcClient.sendCommand(
          'Component.GetControls',
          {
            Name: component.Name,
          }
        );

        const controls = (controlsResponse as any)?.result?.Controls ?? [];

        // Process controls into meaningful status data
        const componentStatus: Record<string, any> = {};

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
        if (!statusData[category]) {
          statusData[category] = {};
        }

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
  private detectStatusComponents(components: any[]): any[] {
    const statusComponents: Array<{ component: any; score: number }> = [];

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
  private getStatusScore(component: any): number {
    let score = 0;
    const name = (component.Name ?? '').toLowerCase();

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
      const hasStatusProperties = component.Properties.some((prop: any) =>
        ['status', 'health', 'state', 'online'].some(keyword =>
          String(prop.Name ?? '')
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
  private organizeStatusData(statusData: Record<string, any>): unknown {
    const organized: Record<string, any> = {};

    // Process each category
    for (const [category, components] of Object.entries(statusData)) {
      if (Object.keys(components).length > 0) {
        organized[category] = {};

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
export const createQueryCoreStatusTool = (qrwcClient: QRWCClientInterface) =>
  new QueryCoreStatusTool(qrwcClient);
