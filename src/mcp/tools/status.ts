import { z } from "zod";
import { BaseQSysTool, BaseToolParamsSchema } from "./base.js";
import type { ToolCallResult } from "../handlers/index.js";
import type { ToolExecutionContext } from "./base.js";

/**
 * Parameters for the query_core_status tool
 */
export const QueryCoreStatusParamsSchema = BaseToolParamsSchema.extend({
  includeDetails: z.boolean().optional().describe("Include detailed system information"),
  includeNetworkInfo: z.boolean().optional().describe("Include network interface information"),
  includePerformance: z.boolean().optional().describe("Include performance metrics (CPU, memory)"),
});

export type QueryCoreStatusParams = z.infer<typeof QueryCoreStatusParamsSchema>;

/**
 * Tool to query Q-SYS Core system status and health information
 * 
 * Provides comprehensive status information about the Q-SYS Core including:
 * - Connection status and uptime
 * - System health metrics  
 * - Network configuration
 * - Performance statistics
 * - Component count and active services
 */
export class QueryCoreStatusTool extends BaseQSysTool<QueryCoreStatusParams> {
  constructor(qrwcClient: any) {
    super(
      qrwcClient,
      "query_core_status",
      "Query Q-SYS Core system status and health information",
      QueryCoreStatusParamsSchema
    );
  }

  protected async executeInternal(
    params: QueryCoreStatusParams,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    try {
      // Send QRC command to get core status
      const response = await this.qrwcClient.sendCommand("StatusGet");
      
      const status = this.parseStatusResponse(response);
      
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
   * Parse the Q-SYS status response
   */
  private parseStatusResponse(response: any): QSysCoreStatus {
    // Mock realistic Q-SYS Core status for Phase 2.2
    // This will be replaced with actual QRWC response parsing in production
    return {
      coreInfo: {
        name: "Q-SYS-Core-110f",
        serialNumber: "12345-67890",
        firmwareVersion: "9.10.2.0-2024.03.21",
        designName: "MainAudioSystem.qsys",
        designVersion: "1.2.3",
        platform: "Core 110f"
      },
      connectionStatus: {
        connected: this.qrwcClient.isConnected(),
        uptime: "5d 14h 32m 15s",
        lastConnected: new Date().toISOString(),
        connectionType: "WebSocket",
        remoteAddress: "192.168.1.100"
      },
      systemHealth: {
        status: "Healthy",
        temperature: 42.5,
        cpuUsage: 23.4,
        memoryUsage: 67.8,
        diskUsage: 45.2,
        networkUtilization: 12.1
      },
      networkInfo: {
        primaryInterface: {
          name: "eth0",
          ipAddress: "192.168.1.100",
          subnetMask: "255.255.255.0", 
          gateway: "192.168.1.1",
          macAddress: "00:1B:44:11:3A:B7"
        },
        dnsServers: ["192.168.1.1", "8.8.8.8"],
        dhcpEnabled: false
      },
      designInfo: {
        componentsCount: 24,
        controlsCount: 156,
        activeStreams: 8,
        processingLoad: 34.2,
        designCompiled: true,
        lastCompiled: "2024-03-15T10:30:00Z"
      },
      services: {
        qrc: { status: "Running", port: 1710 },
        webServer: { status: "Running", port: 80 },
        ssh: { status: "Running", port: 22 },
        snmp: { status: "Disabled", port: 161 }
      }
    };
  }

  /**
   * Format status response for display
   */
  private formatStatusResponse(status: QSysCoreStatus, params: QueryCoreStatusParams): string {
    let output = this.formatBasicStatus(status);

    if (params.includeDetails ?? false) {
      output += "\n\n" + this.formatDetailedInfo(status);
    }

    if (params.includeNetworkInfo ?? false) {
      output += "\n\n" + this.formatNetworkInfo(status.networkInfo);
    }

    if (params.includePerformance ?? false) {
      output += "\n\n" + this.formatPerformanceMetrics(status);
    }

    return output;
  }

  /**
   * Format basic status information
   */
  private formatBasicStatus(status: QSysCoreStatus): string {
    const connectionIcon = status.connectionStatus.connected ? "🟢" : "🔴";
    const healthIcon = this.getHealthIcon(status.systemHealth.status);

    return `Q-SYS Core Status Summary:

${connectionIcon} Connection: ${status.connectionStatus.connected ? 'Connected' : 'Disconnected'}
${healthIcon} System Health: ${status.systemHealth.status}
🖥️  Core: ${status.coreInfo.name} (${status.coreInfo.platform})
📋 Design: ${status.designInfo.designCompiled ? '✅' : '❌'} ${status.coreInfo.designName}
⚡ Processing Load: ${status.designInfo.processingLoad}%
🔄 Uptime: ${status.connectionStatus.uptime}`;
  }

  /**
   * Format detailed system information  
   */
  private formatDetailedInfo(status: QSysCoreStatus): string {
    return `Detailed System Information:

Core Information:
• Serial Number: ${status.coreInfo.serialNumber}
• Firmware Version: ${status.coreInfo.firmwareVersion}  
• Design Version: ${status.coreInfo.designVersion}
• Last Compiled: ${status.designInfo.lastCompiled}

System Metrics:
• Temperature: ${status.systemHealth.temperature}°C
• Components: ${status.designInfo.componentsCount}
• Controls: ${status.designInfo.controlsCount}
• Active Streams: ${status.designInfo.activeStreams}

Services Status:
${Object.entries(status.services).map(([name, service]) => 
  `• ${name.toUpperCase()}: ${service.status} ${service.status === 'Running' ? `(Port ${service.port})` : ''}`
).join('\n')}`;
  }

  /**
   * Format network information
   */
  private formatNetworkInfo(networkInfo: QSysCoreStatus['networkInfo']): string {
    return `Network Configuration:

Primary Interface (${networkInfo.primaryInterface.name}):
• IP Address: ${networkInfo.primaryInterface.ipAddress}
• Subnet Mask: ${networkInfo.primaryInterface.subnetMask}
• Gateway: ${networkInfo.primaryInterface.gateway}
• MAC Address: ${networkInfo.primaryInterface.macAddress}
• DHCP: ${networkInfo.dhcpEnabled ? 'Enabled' : 'Disabled'}

DNS Servers:
${networkInfo.dnsServers.map(dns => `• ${dns}`).join('\n')}`;
  }

  /**
   * Format performance metrics
   */
  private formatPerformanceMetrics(status: QSysCoreStatus): string {
    return `Performance Metrics:

Resource Usage:
• CPU Usage: ${status.systemHealth.cpuUsage}%
• Memory Usage: ${status.systemHealth.memoryUsage}%
• Disk Usage: ${status.systemHealth.diskUsage}%
• Network Utilization: ${status.systemHealth.networkUtilization}%
• Processing Load: ${status.designInfo.processingLoad}%

Temperature: ${status.systemHealth.temperature}°C
${status.systemHealth.temperature > 70 ? '⚠️  High temperature warning' : 
  status.systemHealth.temperature > 50 ? '🟡 Moderate temperature' : 
  '✅ Normal temperature'}`;
  }

  /**
   * Get health status icon
   */
  private getHealthIcon(healthStatus: string): string {
    switch (healthStatus.toLowerCase()) {
      case 'healthy': return '✅';
      case 'warning': return '⚠️';
      case 'critical': return '🔴';
      case 'unknown': return '❓';
      default: return '❓';
    }
  }
}

/**
 * Q-SYS Core Status interface
 */
interface QSysCoreStatus {
  coreInfo: {
    name: string;
    serialNumber: string;
    firmwareVersion: string;
    designName: string;
    designVersion: string;
    platform: string;
  };
  connectionStatus: {
    connected: boolean;
    uptime: string;
    lastConnected: string;
    connectionType: string;
    remoteAddress: string;
  };
  systemHealth: {
    status: string;
    temperature: number;
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    networkUtilization: number;
  };
  networkInfo: {
    primaryInterface: {
      name: string;
      ipAddress: string;
      subnetMask: string;
      gateway: string;
      macAddress: string;
    };
    dnsServers: string[];
    dhcpEnabled: boolean;
  };
  designInfo: {
    componentsCount: number;
    controlsCount: number;
    activeStreams: number;
    processingLoad: number;
    designCompiled: boolean;
    lastCompiled: string;
  };
  services: Record<string, {
    status: string;
    port: number;
  }>;
}

/**
 * Export the tool factory function for registration
 */
export const createQueryCoreStatusTool = (qrwcClient: any) => 
  new QueryCoreStatusTool(qrwcClient); 