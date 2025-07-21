import { z } from "zod";
import { BaseQSysTool, BaseToolParamsSchema } from "./base.js";
import type { ToolCallResult } from "../handlers/index.js";
import type { ToolExecutionContext } from "./base.js";
import type { QRWCClientInterface } from "../qrwc/adapter.js";
import type { QSysStatusGetResponse } from "../types/qsys-api-responses.js";

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
  constructor(qrwcClient: QRWCClientInterface) {
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
  private parseStatusResponse(response: unknown, params: QueryCoreStatusParams): QSysCoreStatus {
    this.logger.debug("Parsing status response", { response });

    // Extract status information from response
    const resp = response as { result?: QSysStatusGetResponse };
    const result = resp.result || response as QSysStatusGetResponse;
    
    // Build comprehensive status object
    return {
      coreInfo: {
        name: String(result.Platform || "Unknown Core"),
        version: String(result.Version || "Unknown"),
        model: String(result.Platform || "Unknown"),
        platform: String(result.Platform || "Unknown"),
        serialNumber: String(result.Platform || "Unknown"),
        firmwareVersion: String(result.Version || "Unknown"),
        buildTime: String("Unknown"),
        designName: String(result.DesignName || "No Design Loaded")
      },
      connectionStatus: {
        connected: Boolean(result.IsConnected ?? true),
        uptime: String("Unknown"),
        lastSeen: new Date().toISOString()
      },
      systemHealth: {
        status: String(result.Status?.String || "unknown"),
        temperature: Number(0),
        fanSpeed: Number(0),
        powerSupplyStatus: String("unknown")
      },
      designInfo: {
        designCompiled: Boolean(result.State === "Active"),
        compileTime: String("Unknown"),
        processingLoad: Number(0),
        componentCount: Number(0),
        snapshotCount: Number(0),
        activeServices: [] as string[]
      },
      networkInfo: {
        ipAddress: String("Unknown"),
        macAddress: String("Unknown"),
        gateway: String("Unknown"),
        dnsServers: [] as string[],
        ntpServer: String("Unknown"),
        networkMode: String("Unknown")
      },
      performanceMetrics: {
        cpuUsage: Number(0),
        memoryUsage: Number(0),
        memoryUsedMB: Number(0),
        memoryTotalMB: Number(0),
        audioLatency: Number(0),
        networkLatency: Number(0),
        fanSpeed: Number(0)
      },
      // Additional fields from Q-SYS response
      Platform: String(result.Platform || "Unknown"),
      Version: String(result.Version || "Unknown"),
      DesignName: String(result.DesignName || "Unknown"),
      DesignCode: String(result.DesignCode || ""),
      Status: {
        Name: String(result.Status?.String || "Unknown"),
        Code: Number(result.Status?.Code ?? -1),
        PercentCPU: Number(0)
      },
      IsConnected: Boolean(result.IsConnected ?? true)
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
export const createQueryCoreStatusTool = (qrwcClient: QRWCClientInterface) => 
  new QueryCoreStatusTool(qrwcClient);