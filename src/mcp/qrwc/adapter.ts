/**
 * QRWC Client Adapter
 * 
 * Adapts the OfficialQRWCClient to the interface expected by MCP tools.
 * This allows us to use the real Q-SYS connection while maintaining
 * compatibility with existing tool implementations.
 */

import { globalLogger as logger } from "../../shared/utils/logger.js";
import type { OfficialQRWCClient } from "../../qrwc/officialClient.js";

/**
 * Interface that MCP tools expect from a QRWC client
 */
export interface QRWCClientInterface {
  isConnected(): boolean;
  sendCommand(command: string, params?: Record<string, unknown>): Promise<unknown>;
}

/**
 * Retry options for sendCommand
 */
export interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  retryBackoff?: number;
}

/**
 * Adapter that wraps OfficialQRWCClient to provide the expected interface
 */
export class QRWCClientAdapter implements QRWCClientInterface {
  private controlIndex = new Map<string, {componentName: string, controlName: string}>();
  private indexBuilt = false;

  constructor(private readonly officialClient: OfficialQRWCClient) {
    // Extract host and port from the official client if possible
    // We'll initialize the raw command client lazily when needed
  }

  /**
   * Build control index for O(1) lookups
   */
  private buildControlIndex(): void {
    try {
      const qrwc = this.officialClient.getQrwc();
      if (!qrwc) {
        logger.warn("Cannot build control index: QRWC instance not available");
        return;
      }

      this.controlIndex.clear();
      let controlCount = 0;

      for (const [componentName, component] of Object.entries(qrwc.components)) {
        if (component?.controls) {
          for (const controlName of Object.keys(component.controls)) {
            const fullName = `${componentName}.${controlName}`;
            this.controlIndex.set(fullName, { componentName, controlName });
            controlCount++;
          }
        }
      }

      this.indexBuilt = true;
      logger.debug(`Built control index with ${controlCount} controls from ${Object.keys(qrwc.components).length} components`);
    } catch (error) {
      logger.error("Failed to build control index", { error });
      this.indexBuilt = false;
    }
  }

  /**
   * Invalidate control index (call when components change)
   */
  invalidateControlIndex(): void {
    this.indexBuilt = false;
    this.controlIndex.clear();
    logger.debug("Control index invalidated");
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.officialClient.isConnected();
  }

  /**
   * Send a command to Q-SYS Core
   * 
   * Delegates to the official QRWC client instead of providing mock responses.
   * This eliminates code duplication and provides real Q-SYS data.
   * Includes retry logic for transient failures.
   */
  async sendCommand(
    command: string, 
    params?: Record<string, unknown>,
    options: RetryOptions = {}
  ): Promise<unknown> {
    const {
      maxRetries = 3,
      retryDelay = 1000,
      retryBackoff = 2
    } = options;

    let lastError: Error = new Error("Unknown error");
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Allow Status.Get to work even when disconnected
        if (!this.isConnected() && command !== "Status.Get" && command !== "StatusGet") {
          throw new Error("QRWC client not connected");
        }

        logger.debug("Sending QRWC command via adapter", { command, params, attempt });

        return await this.executeCommand(command, params, options);
        
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry non-transient errors
        if (!this.isRetryableError(error)) {
          throw error;
        }
        
        if (attempt < maxRetries) {
          const delay = retryDelay * Math.pow(retryBackoff, attempt);
          logger.warn(`Command failed, retrying in ${delay}ms`, {
            command,
            attempt: attempt + 1,
            error: lastError.message
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error(`Command failed after ${maxRetries + 1} attempts: ${lastError.message}`);
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (!error) return false;
    
    // Network errors, timeouts, and specific Q-SYS errors
    const errorMessage = error.message?.toLowerCase() || '';
    return error.code === 'ETIMEDOUT' || 
           error.code === 'ECONNRESET' ||
           error.code === 'ECONNREFUSED' ||
           error.code === 'ENOTFOUND' ||
           errorMessage.includes('timeout') ||
           errorMessage.includes('network') ||
           errorMessage.includes('connection');
  }

  /**
   * Execute the actual command (extracted for retry logic)
   */
  private async executeCommand(command: string, params?: Record<string, unknown>, options: RetryOptions = {}): Promise<unknown> {
    try {
      // Delegate to official client methods instead of providing mock responses
      switch (command) {
        case "Component.GetComponents":
        case "ComponentGetComponents":
          // Get QRWC instance to access components
          const qrwc = this.officialClient.getQrwc();
          if (!qrwc) {
            throw new Error("QRWC instance not available");
          }
          
          // Get all components from the QRWC instance
          const componentNames = Object.keys(qrwc.components);
          const components = componentNames.map(name => {
            const component = qrwc.components[name];
            
            // Extract component type from state
            const componentType = component?.state?.Type || "Component";
            
            // Extract properties from state
            const properties = component?.state?.Properties || [];
            
            return {
              Name: name,
              Type: componentType,
              Properties: properties
            };
          });
          
          logger.info(`Returning ${components.length} components from Q-SYS Core`);
          return {
            result: components
          };

        case "Component.GetControls":
        case "ComponentGetControls":
          const componentName = params?.['Name'] || params?.['name'];
          if (!componentName || typeof componentName !== 'string') {
            throw new Error("Component name is required");
          }
          
          try {
            const component = this.officialClient.getComponent(componentName);
            if (!component || !component.controls) {
              throw new Error(`Component '${componentName}' not found or has no controls`);
            }
            
            return {
              result: Object.entries(component.controls).map(([name, control]: [string, any]) => ({
                Name: name,
                Value: control.state,
                Type: "unknown" // Control type not available in current interface
              }))
            };
          } catch (error) {
            logger.error(`Failed to get controls for component ${componentName}`, { error });
            throw error;
          }

        case "Control.Get":
        case "Control.GetValues":
        case "ControlGetValues":
        case "Control.GetMultiple":
          let controlsList: any[];
          
          // Support both formats
          if (Array.isArray(params)) {
            // Direct array format (API spec)
            controlsList = params;
          } else if (params?.['Controls']) {
            // Object wrapped format (current)
            controlsList = Array.isArray(params['Controls']) ? params['Controls'] : [params['Controls']];
          } else if (params?.['Names']) {
            // Alternative naming
            controlsList = Array.isArray(params['Names']) ? params['Names'] : [params['Names']];
          } else {
            controlsList = [];
          }
          
          // Build index on first use if not already built
          if (!this.indexBuilt && this.officialClient.isConnected()) {
            this.buildControlIndex();
          }
          
          return {
            result: controlsList.map((ctrl: any) => {
              const name = typeof ctrl === 'string' ? ctrl : (ctrl.Name || ctrl.name);
              
              try {
                const qrwc = this.officialClient.getQrwc();
                if (!qrwc) {
                  throw new Error("QRWC instance not available");
                }
                
                let controlValue = null;
                let controlFound = false;
                
                // Use control index for O(1) lookup
                const indexEntry = this.controlIndex.get(name);
                if (indexEntry) {
                  const { componentName, controlName } = indexEntry;
                  const control = qrwc.components[componentName]?.controls?.[controlName];
                  if (control) {
                    controlValue = control.state;
                    controlFound = true;
                  }
                }
                
                // Fallback: try direct component.control format if not in index
                if (!controlFound && name.includes('.')) {
                  const lastDotIndex = name.lastIndexOf('.');
                  const componentName = name.substring(0, lastDotIndex);
                  const controlName = name.substring(lastDotIndex + 1);
                  
                  if (qrwc.components[componentName]?.controls?.[controlName]) {
                    const control = qrwc.components[componentName].controls[controlName];
                    controlValue = control.state;
                    controlFound = true;
                    
                    // Add to index for future lookups
                    this.controlIndex.set(name, { componentName, controlName });
                  }
                }
                
                return {
                  Name: name,
                  Value: controlValue,
                  String: controlFound ? String(controlValue || '') : 'N/A'
                };
              } catch (error) {
                logger.warn(`Failed to get control value for ${name}`, { error });
                return {
                  Name: name,
                  Value: null,
                  String: "N/A",
                  Error: error instanceof Error ? error.message : String(error)
                };
              }
            })
          };

        case "Control.Set":
        case "Control.SetValues":
        case "ControlSetValues":
          let setControlsArray: any[];
          
          // Support both single control and array formats
          if (params?.['Controls']) {
            // Current array format
            setControlsArray = Array.isArray(params['Controls']) ? params['Controls'] : [params['Controls']];
          } else if (params?.['Name'] !== undefined && params?.['Value'] !== undefined) {
            // Single control format (API spec)
            setControlsArray = [{
              Name: params['Name'],
              Value: params['Value'],
              Ramp: params['Ramp']
            }];
          } else {
            // Empty or invalid params
            setControlsArray = [];
          }
          
          const setResults = [];
          
          for (const ctrl of setControlsArray) {
            try {
              const name = ctrl.Name || ctrl.name;
              const value = ctrl.Value !== undefined ? ctrl.Value : ctrl.value;
              const ramp = ctrl.Ramp || ctrl.ramp;
              const dotIndex = name.indexOf('.');
              const [compName, ctrlName] = dotIndex > -1 ? 
                [name.substring(0, dotIndex), name.substring(dotIndex + 1)] : 
                ['', name];
              
              // Try to get control info for validation
              let controlInfo = null;
              if (compName) {
                const qrwc = this.officialClient.getQrwc();
                if (qrwc?.components?.[compName]?.controls?.[ctrlName]) {
                  controlInfo = qrwc.components[compName].controls[ctrlName];
                }
              }
              
              // Validate the value
              const validation = this.validateControlValue(name, value, controlInfo);
              if (!validation.valid) {
                logger.debug('Validation failed', { name, value, controlInfo, validation });
                throw new Error(validation.error || 'Invalid value');
              }
              
              // Use validated value
              const validatedValue = validation.value;
              
              // Use the official client to set control value
              // Note: The official client doesn't support ramp parameter directly
              if (ramp !== undefined) {
                logger.warn('Ramp parameter specified but not supported by current implementation', {
                  control: name,
                  ramp
                });
              }
              
              if (compName) {
                await this.retryOperation(
                  () => this.officialClient.setControlValue(compName, ctrlName, validatedValue),
                  options
                );
              } else {
                await this.retryOperation(
                  () => this.officialClient.setControlValue('', name, validatedValue),
                  options
                );
              }
              
              setResults.push({ Name: name, Result: "Success" });
            } catch (error) {
              logger.error(`Failed to set control value`, { ctrl, error });
              setResults.push({ 
                Name: ctrl.Name || ctrl.name, 
                Result: "Error",
                Error: error instanceof Error ? error.message : String(error)
              });
            }
          }
          
          return { result: setResults };

        case "StatusGet":
        case "Status.Get":
          // Return status based on connection state and available information
          // Note: Without raw command access, we can't query full Q-SYS status
          // This is a simplified implementation until proper status API is available
          return {
            result: {
              // Core identification - simplified without raw command
              Platform: "Q-SYS Core",
              Version: "Unknown",
              
              // Design information - not available through QRWC
              DesignName: "Unknown",
              DesignCode: "",
              
              // Status information
              Status: {
                Name: this.officialClient.isConnected() ? "OK" : "Disconnected",
                Code: this.officialClient.isConnected() ? 0 : -1,
                PercentCPU: 0,
                PercentMemory: 0
              },
              
              // Connection and system info
              IsConnected: this.officialClient.isConnected(),
              IsRedundant: false,
              IsEmulator: false,
              State: this.officialClient.isConnected() ? "Active" : "Disconnected",
              
              // Additional fields for compatibility
              name: `Q-SYS-Core-${this.officialClient.isConnected() ? 'Connected' : 'Disconnected'}`,
              version: "Unknown",
              uptime: "Unknown",
              status: this.officialClient.isConnected() ? "OK" : "Disconnected",
              connected: this.officialClient.isConnected(),
              client: "official-qrwc",
              
              // Note about limited functionality
              note: "Limited status information available without raw command access"
            }
          };

        case "Component.GetAllControls":
        case "ComponentGetAllControls":
          // Get all controls from all components
          const qrwcInstance = this.officialClient.getQrwc();
          if (!qrwcInstance) {
            throw new Error("QRWC instance not available");
          }
          
          const allControls: any[] = [];
          const allComponentNames = Object.keys(qrwcInstance.components);
          
          for (const componentName of allComponentNames) {
            const component = qrwcInstance.components[componentName];
            if (component && component.controls) {
              const controlNames = Object.keys(component.controls);
              for (const controlName of controlNames) {
                const control = component.controls[controlName];
                allControls.push({
                  Name: `${componentName}.${controlName}`,
                  Value: control?.state || null,
                  String: String(control?.state || ''),
                  Type: "unknown",
                  Component: componentName
                });
              }
            }
          }
          
          logger.info(`Returning ${allControls.length} controls from Q-SYS Core`);
          return {
            result: allControls
          };

        case "Component.Get":
          const getComponentName = params?.['Name'];
          const getControlsList = (params?.['Controls'] || []) as any[];
          
          if (!getComponentName || typeof getComponentName !== 'string') {
            throw new Error("Component name is required");
          }
          
          try {
            const component = this.officialClient.getComponent(getComponentName);
            if (!component || !component.controls) {
              throw new Error(`Component '${getComponentName}' not found or has no controls`);
            }
            
            const controlResults = getControlsList.map((ctrlSpec: any) => {
              const controlName = ctrlSpec.Name || ctrlSpec.name;
              const control = component.controls?.[controlName];
              
              if (!control) {
                return {
                  Name: controlName,
                  Value: null,
                  String: "N/A",
                  Position: 0,
                  Error: "Control not found"
                };
              }
              
              const state = control.state;
              return {
                Name: controlName,
                Value: state?.Value !== undefined ? state.Value : state,
                String: state?.String || String(state || ''),
                Position: state?.Position !== undefined ? state.Position : 0
              };
            });
            
            return {
              result: {
                Name: getComponentName,
                Controls: controlResults
              }
            };
          } catch (error) {
            logger.error(`Failed to get component controls`, { component: getComponentName, error });
            throw error;
          }

        case "Component.Set":
          const setComponentName = params?.['Name'];
          const setControlsList = (params?.['Controls'] || []) as any[];
          
          if (!setComponentName || typeof setComponentName !== 'string') {
            throw new Error("Component name is required");
          }
          
          const componentSetResults: any[] = [];
          
          for (const ctrlSpec of setControlsList) {
            try {
              const controlName = ctrlSpec.Name || ctrlSpec.name;
              const value = ctrlSpec.Value !== undefined ? ctrlSpec.Value : ctrlSpec.value;
              const ramp = ctrlSpec.Ramp || ctrlSpec.ramp;
              
              // Get control info for validation
              const component = this.officialClient.getComponent(setComponentName);
              if (!component || !component.controls) {
                throw new Error(`Component '${setComponentName}' not found`);
              }
              
              const control = component.controls[controlName];
              if (!control) {
                throw new Error(`Control '${controlName}' not found on component '${setComponentName}'`);
              }
              
              // Validate the value
              const validation = this.validateControlValue(`${setComponentName}.${controlName}`, value, control);
              if (!validation.valid) {
                throw new Error(validation.error || 'Invalid value');
              }
              
              // Set the control value
              await this.officialClient.setControlValue(setComponentName, controlName, validation.value!);
              
              // Note: The official client doesn't support ramp parameter directly
              // If ramp support is needed, we would need to extend the official client
              if (ramp !== undefined) {
                logger.warn('Ramp parameter specified but not supported by current implementation', {
                  component: setComponentName,
                  control: controlName,
                  ramp
                });
              }
              
              componentSetResults.push({
                Name: controlName,
                Result: "Success"
              });
            } catch (error) {
              logger.error(`Failed to set control value`, { 
                component: setComponentName,
                control: ctrlSpec,
                error 
              });
              componentSetResults.push({
                Name: ctrlSpec.Name || ctrlSpec.name,
                Result: "Error",
                Error: error instanceof Error ? error.message : String(error)
              });
            }
          }
          
          // Return success even if some controls failed
          return { 
            result: true,
            details: componentSetResults 
          };

        default:
          // For unknown commands, throw an error instead of returning mock data
          throw new Error(`Unknown QRWC command: ${command}. Please implement this command in the adapter or official client.`);
      }

    } catch (error) {
      logger.error("Error in QRWC adapter", { command, params, error });
      throw error;
    }
  }

  /**
   * Validate and convert control value based on control type
   */
  private validateControlValue(
    controlName: string,
    value: any,
    controlInfo?: any
  ): { valid: boolean; value?: any; error?: string } {
    // If no control info provided, pass through (backwards compatibility)
    if (!controlInfo) {
      return { valid: true, value };
    }

    const type = controlInfo.type || controlInfo.Type;
    
    switch (type) {
      case 'Boolean':
        // Q-SYS expects 0/1 for boolean controls
        if (typeof value === 'boolean') {
          logger.debug('Boolean validation', { value, converted: value ? 1 : 0 });
          return { valid: true, value: value ? 1 : 0 };
        }
        if (value === 0 || value === 1 || value === '0' || value === '1') {
          return { valid: true, value: Number(value) };
        }
        // Also accept string representations
        if (value === 'true' || value === 'false') {
          return { valid: true, value: value === 'true' ? 1 : 0 };
        }
        return { 
          valid: false, 
          error: 'Boolean control expects true/false or 0/1' 
        };
        
      case 'Number':
      case 'Float':
      case 'Integer':
        const num = Number(value);
        if (isNaN(num)) {
          return { 
            valid: false, 
            error: `Numeric control expects a number, got ${typeof value}` 
          };
        }
        // Check range if available
        if (controlInfo.min !== undefined && num < controlInfo.min) {
          return { 
            valid: false, 
            error: `Value ${num} below minimum ${controlInfo.min}` 
          };
        }
        if (controlInfo.max !== undefined && num > controlInfo.max) {
          return { 
            valid: false, 
            error: `Value ${num} above maximum ${controlInfo.max}` 
          };
        }
        return { valid: true, value: num };
        
      case 'String':
        // Convert to string if not already
        const stringValue = String(value);
        if (typeof value === 'object' && value !== null) {
          return { 
            valid: false, 
            error: `String control expects text, got ${typeof value}` 
          };
        }
        const maxLength = controlInfo.maxLength || 255;
        if (stringValue.length > maxLength) {
          return { 
            valid: false, 
            error: `String too long (${stringValue.length} > ${maxLength})` 
          };
        }
        return { valid: true, value: stringValue };
        
      default:
        // Unknown type - pass through
        return { valid: true, value };
    }
  }

  /**
   * Retry an individual operation with exponential backoff
   * Used for operations within commands that need retry logic
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      retryDelay = 1000,
      retryBackoff = 2
    } = options;

    let lastError: Error = new Error("Unknown error");
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry non-transient errors
        if (!this.isRetryableError(error)) {
          throw error;
        }
        
        if (attempt < maxRetries) {
          const delay = retryDelay * Math.pow(retryBackoff, attempt);
          logger.debug(`Operation failed, retrying in ${delay}ms`, {
            attempt: attempt + 1,
            error: lastError.message
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }


  /**
   * Clear all caches (should be called after long disconnections)
   */
  clearAllCaches(): void {
    // Clear control index
    this.invalidateControlIndex();
    
    // Clear any other cached data
    // Note: The actual component cache is maintained in the official client,
    // so we just need to clear our local index
    
    logger.info('All caches cleared due to long disconnection');
  }
} 