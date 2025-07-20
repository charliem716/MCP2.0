import { z } from "zod";
import { BaseQSysTool, BaseToolParamsSchema } from "./base.js";
import type { ToolCallResult } from "../handlers/index.js";
import type { ToolExecutionContext } from "./base.js";

/**
 * Parameters for the query_core_status tool
 */
export const QueryCoreStatusParamsSchema = BaseToolParamsSchema.extend({
  includeDetails: z.boolean().optional().describe("Include detailed system information"),
  includeNetworkInfo: z.boolean().optional().describe("Include network configuration details"),
  includePerformance: z.boolean().optional().describe("Include performance metrics"),
});

export type QueryCoreStatusParams = z.infer<typeof QueryCoreStatusParamsSchema>;

/**
 * Tool to query the Q-SYS Core status and system information
 * 
 * Returns comprehensive status information about the Q-SYS Core including:
 * - Connection status and uptime
 * - System health and temperature
 * - Network configuration
 * - Design information
 * - Performance metrics
 */
export class QueryCoreStatusTool extends BaseQSysTool<QueryCoreStatusParams> {
  constructor(qrwcClient: any) {
    super(
      qrwcClient,
      "query_core_status",
      "Get Q-SYS Core status including CPU/memory usage, active design, uptime. Use includeDetails=true for firmware version and platform info. Use includeNetworkInfo=true for IP configuration. Use includePerformance=true for detailed metrics. Returns health indicators - Status.Code 0 means OK, non-zero indicates issues.",
      QueryCoreStatusParamsSchema
    );
  }

  protected async executeInternal(
    params: QueryCoreStatusParams,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    try {
      // Send command to get core status
      const response = await this.qrwcClient.sendCommand("Status.Get");
      
      if (!response || typeof response !== 'object') {
        throw new Error("Invalid response from Q-SYS Core");
      }

      const status = this.parseStatusResponse(response, params);

      return {
        content: [{
          type: 'text',
          text: this.formatStatusResponse(status, params)
        }],
        isError: false
      };

    } catch (error) {
      this.logger.error("Failed to query core status", { error, context });
      throw error;
    }
  }

  /**
   * Parse the QRWC response for status information
   */
  private parseStatusResponse(response: any, params: QueryCoreStatusParams): QSysCoreStatus {
    this.logger.debug("Parsing status response", { response });

    // Extract status information from response
    const result = response.result || response;
    
    // Build comprehensive status object
    return {
      coreInfo: {
        name: result.name || "Unknown Core",
        version: result.version || "Unknown",
        model: result.model || "Unknown",
        platform: result.platform || "Unknown",
        serialNumber: result.serialNumber || "Unknown",
        firmwareVersion: result.firmwareVersion || "Unknown",
        buildTime: result.buildTime || "Unknown",
        designName: result.designName || "No Design Loaded"
      },
      connectionStatus: {
        connected: result.connected ?? true,
        uptime: result.uptime || "Unknown",
        lastSeen: new Date().toISOString()
      },
      systemHealth: {
        status: result.status || "unknown",
        temperature: result.temperature || 0,
        fanSpeed: result.fanSpeed || 0,
        powerSupplyStatus: result.powerSupplyStatus || "unknown"
      },
      designInfo: {
        designCompiled: result.designCompiled ?? false,
        compileTime: result.compileTime || "Unknown",
        processingLoad: result.processingLoad || 0,
        componentCount: result.componentCount || 0,
        snapshotCount: result.snapshotCount || 0,
        activeServices: result.activeServices || []
      },
      networkInfo: {
        ipAddress: result.ipAddress || "Unknown",
        macAddress: result.macAddress || "Unknown",
        gateway: result.gateway || "Unknown",
        dnsServers: result.dnsServers || [],
        ntpServer: result.ntpServer || "Unknown",
        networkMode: result.networkMode || "Unknown"
      },
      performanceMetrics: {
        cpuUsage: result.cpuUsage || 0,
        memoryUsage: result.memoryUsage || 0,
        memoryUsedMB: result.memoryUsedMB || 0,
        memoryTotalMB: result.memoryTotalMB || 0,
        audioLatency: result.audioLatency || 0,
        networkLatency: result.networkLatency || 0,
        fanSpeed: result.fanSpeed || 0
      },
      // Additional fields from Q-SYS response
      Platform: result.Platform || result.platform || "Unknown",
      Version: result.Version || result.version || "Unknown",
      DesignName: result.DesignName || result.designName || "Unknown",
      DesignCode: result.DesignCode || result.designCode || "",
      Status: {
        Name: result.Status?.String || result.status || "Unknown",
        Code: result.Status?.Code ?? result.statusCode ?? -1,
        PercentCPU: result.Status?.PercentCPU || result.cpuUsage || 0
      },
      IsConnected: result.IsConnected ?? result.connected ?? true
    };
  }

  /**
   * Format status response for display
   */
  private formatStatusResponse(status: QSysCoreStatus, params: QueryCoreStatusParams): string {
    // Return JSON string for MCP protocol compliance
    return JSON.stringify(status);
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
export const createQueryCoreStatusTool = (qrwcClient: any) => 
  new QueryCoreStatusTool(qrwcClient);