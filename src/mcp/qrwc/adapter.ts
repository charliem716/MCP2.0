/**
 * QRWC Client Adapter
 * 
 * Adapts the OfficialQRWCClient to the interface expected by MCP tools.
 * This allows us to use the real Q-SYS connection while maintaining
 * compatibility with existing tool implementations.
 */

import { globalLogger as logger } from "../../shared/utils/logger.js";
import type { OfficialQRWCClient } from "../../qrwc/officialClient.js";
import { 
  validateControlValue,
  isRetryableError as isRetryableErrorValidator 
} from "./validators.js";
import {
  extractControlValue
} from "./converters.js";

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
interface SimpleChangeGroup {
  id: string;
  controls: string[];
}

export class QRWCClientAdapter implements QRWCClientInterface {
  private controlIndex = new Map<string, {componentName: string, controlName: string}>();
  private indexBuilt = false;
  private changeGroups = new Map<string, SimpleChangeGroup>();
  private autoPollTimers = new Map<string, NodeJS.Timeout>();
  private changeGroupLastValues = new Map<string, Map<string, unknown>>();

  constructor(private readonly officialClient: OfficialQRWCClient) {
    // Extract host and port from the official client if possible
    // We'll initialize the raw command client lazily when needed
  }

  // ===== Connection Management =====

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
   * Count all controls across all components
   */
  private countAllControls(qrwc: any): number {
    if (!qrwc || !qrwc.components) return 0;
    
    let count = 0;
    for (const component of Object.values(qrwc.components)) {
      if ((component as any)?.controls) {
        count += Object.keys((component as any).controls).length;
      }
    }
    return count;
  }

  // ===== Control Methods =====
  
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
  private isRetryableError(error: unknown): boolean {
    return isRetryableErrorValidator(error);
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
            
            const controls = Object.entries(component.controls).map(([name, control]: [string, any]) => {
              const state = control.state as any;
              
              // Extract value from state object
              const { value, type } = extractControlValue(state);
              
              return {
                Name: name,
                Value: value,
                String: String(value || ''),
                Type: type,
                Direction: 'Read/Write' // Most controls are read/write
              };
            });
            
            return {
              result: {
                Name: componentName,
                Controls: controls
              }
            };
          } catch (error) {
            logger.error(`Failed to get controls for component ${componentName}`, { error });
            throw error;
          }

        case "Control.Get":
        case "Control.GetValues":
        case "ControlGetValues":
        case "Control.GetMultiple":
          let controlsList: unknown[];
          
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
            result: controlsList.map((ctrl: unknown) => {
              const controlObj = ctrl as Record<string, unknown>;
              const name = typeof ctrl === 'string' ? ctrl : String(controlObj['Name'] || controlObj['name'] || '');
              
              try {
                const qrwc = this.officialClient.getQrwc();
                if (!qrwc) {
                  throw new Error("QRWC instance not available");
                }
                
                let controlValue = null;
                let controlFound = false;
                let controlState = null;
                
                // Use control index for O(1) lookup
                const indexEntry = this.controlIndex.get(name);
                if (indexEntry) {
                  const { componentName, controlName } = indexEntry;
                  const control = qrwc.components[componentName]?.controls?.[controlName];
                  if (control) {
                    controlState = control.state as any;
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
                    controlState = control.state as any;
                    controlFound = true;
                    
                    // Add to index for future lookups
                    this.controlIndex.set(name, { componentName, controlName });
                  }
                }
                
                // Extract value from state object
                if (controlFound && controlState !== null && controlState !== undefined) {
                  const extracted = extractControlValue(controlState);
                  controlValue = extracted.value;
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
          let setControlsArray: unknown[];
          
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
            let name = '';
            try {
              const controlObj = ctrl as Record<string, unknown>;
              name = String(controlObj['Name'] || controlObj['name'] || '');
              if (!name) {
                throw new Error('Control name is required');
              }
              const value = controlObj['Value'] !== undefined ? controlObj['Value'] : controlObj['value'];
              const ramp = controlObj['Ramp'] || controlObj['ramp'];
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
                  async () => {
                    await this.officialClient.setControlValue(compName, ctrlName, validatedValue as string | number | boolean);
                    return true;
                  },
                  options
                );
              } else {
                await this.retryOperation(
                  async () => {
                    await this.officialClient.setControlValue('', name, validatedValue as string | number | boolean);
                    return true;
                  },
                  options
                );
              }
              
              setResults.push({ Name: name, Result: "Success" });
            } catch (error) {
              logger.error(`Failed to set control value`, { control: name, error });
              setResults.push({ 
                Name: name, 
                Result: "Error",
                Error: error instanceof Error ? error.message : String(error)
              });
            }
          }
          
          return { result: setResults };

        // ===== Status Methods =====
        
        case "StatusGet":
        case "Status.Get":
          // Try to get actual Q-SYS Core status, but provide fallback
          try {
            // Q-SYS API uses "StatusGet" without the dot
            logger.info("Attempting StatusGet command...");
            const statusResponse = await this.officialClient.sendRawCommand("StatusGet", 0);
            logger.info("Received actual StatusGet response", { response: statusResponse });
            
            // sendRawCommand already returns the result object, don't double-wrap
            return statusResponse;
          } catch (error) {
            logger.error("StatusGet command failed", { 
              error: error instanceof Error ? error.message : String(error),
              errorType: error?.constructor?.name,
              errorDetails: error
            });
            
            // Provide useful fallback data based on what we know
            const qrwc = this.officialClient.getQrwc();
            const componentCount = qrwc ? Object.keys(qrwc.components).length : 0;
            const controlCount = this.countAllControls(qrwc);
            
            // Get some actual component info for better status
            const components = qrwc ? Object.keys(qrwc.components) : [];
            const hasAudio = components.some(c => c.toLowerCase().includes('gain') || c.toLowerCase().includes('mixer'));
            const hasVideo = components.some(c => c.toLowerCase().includes('hdmi') || c.toLowerCase().includes('video'));
            
            return {
              Platform: "Q-SYS Core (API: StatusGet not supported)",
              State: this.isConnected() ? "Active" : "Idle",
              DesignName: componentCount > 0 ? `Design with ${componentCount} components` : "No Design",
              DesignCode: `${componentCount}_components`,
              IsRedundant: false,
              IsEmulator: false,
              Status: {
                Code: this.isConnected() ? 0 : -1,
                String: this.isConnected() ? "OK" : "Disconnected"
              },
              Version: "QRWC Connection Active",
              IsConnected: this.isConnected(),
              // Additional useful info
              ComponentCount: componentCount,
              ControlCount: controlCount,
              HasAudioComponents: hasAudio,
              HasVideoComponents: hasVideo,
              ConnectionInfo: {
                Host: (this.officialClient as any).options?.host || "Unknown",
                Port: (this.officialClient as any).options?.port || 443
              }
            };
          }

        case "Component.GetAllControls":
        case "ComponentGetAllControls":
          // Get all controls from all components
          const qrwcInstance = this.officialClient.getQrwc();
          if (!qrwcInstance) {
            throw new Error("QRWC instance not available");
          }
          
          const allControls: unknown[] = [];
          const allComponentNames = Object.keys(qrwcInstance.components);
          
          for (const componentName of allComponentNames) {
            const component = qrwcInstance.components[componentName];
            if (component && component.controls) {
              const controlNames = Object.keys(component.controls);
              for (const controlName of controlNames) {
                const control = component.controls[controlName];
                const state = control?.state as any;
                
                // Extract value from state object
                const { value, type } = extractControlValue(state);
                
                allControls.push({
                  Name: `${componentName}.${controlName}`,
                  Value: value !== undefined ? value : null,
                  String: String(value || ''),
                  Type: type,
                  Direction: 'Read/Write',
                  Component: componentName
                });
              }
            }
          }
          
          logger.info(`Returning ${allControls.length} controls from Q-SYS Core`);
          return {
            result: {
              Name: "All Components",
              Controls: allControls
            }
          };

        case "Component.Get":
          const getComponentName = params?.['Name'];
          const getControlsList = (params?.['Controls'] || []) as unknown[];
          
          if (!getComponentName || typeof getComponentName !== 'string') {
            throw new Error("Component name is required");
          }
          
          try {
            const component = this.officialClient.getComponent(getComponentName);
            if (!component || !component.controls) {
              throw new Error(`Component '${getComponentName}' not found or has no controls`);
            }
            
            const controlResults = getControlsList.map((ctrlSpec: unknown) => {
              const spec = ctrlSpec as { Name?: string; name?: string };
              const controlName = spec.Name || spec.name || '';
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
              
              const state = control.state as any;
              
              // Extract value from state object
              const { value } = extractControlValue(state);
              const stringValue = String(value || '');
              const position = (state && typeof state === 'object' && 'Position' in state) ? state.Position : 0;
              
              return {
                Name: controlName,
                Value: value,
                String: stringValue,
                Position: position
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
          const setControlsList = (params?.['Controls'] || []) as unknown[];
          
          if (!setComponentName || typeof setComponentName !== 'string') {
            throw new Error("Component name is required");
          }
          
          const componentSetResults: unknown[] = [];
          
          for (const ctrlSpec of setControlsList) {
            let controlName = '';
            try {
              if (!ctrlSpec || typeof ctrlSpec !== 'object') {
                throw new Error("Invalid control specification");
              }
              
              const ctrl = ctrlSpec as Record<string, unknown>;
              controlName = String(ctrl['Name'] || ctrl['name'] || '');
              const value = ctrl['Value'] !== undefined ? ctrl['Value'] : ctrl['value'];
              const ramp = ctrl['Ramp'] || ctrl['ramp'];
              
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
              const controlNameStr = typeof controlName === 'string' ? controlName : String(controlName);
              await this.officialClient.setControlValue(setComponentName, controlNameStr, validation.value as string | number | boolean);
              
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
                Name: controlName,
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

        // ===== Change Group Methods =====
        
        case "ChangeGroup.AddControl": {
          const id = params?.['Id'] as string;
          const controls = params?.['Controls'] as string[] || [];
          
          if (!id) throw new Error("Change group ID required");
          
          let group = this.changeGroups.get(id);
          if (!group) {
            group = { id, controls: [] };
            this.changeGroups.set(id, group);
            this.changeGroupLastValues.set(id, new Map());
          }
          
          // Build index if needed
          if (!this.indexBuilt && this.officialClient.isConnected()) {
            this.buildControlIndex();
          }
          
          // Validate and add controls
          for (const control of controls) {
            if (!this.controlIndex.has(control)) {
              logger.warn(`Control not found: ${control}`);
              continue;
            }
            if (!group.controls.includes(control)) {
              group.controls.push(control);
            }
          }
          
          return { result: true };
        }

        case "ChangeGroup.AddComponentControl": {
          const id = params?.['Id'] as string;
          const component = params?.['Component'] as Record<string, unknown>;
          
          if (!id) throw new Error("Change group ID required");
          if (!component?.['Name']) throw new Error("Component name required");
          
          const componentName = String(component['Name']);
          const controlSpecs = (component['Controls'] || []) as Array<{Name: string}>;
          
          let group = this.changeGroups.get(id);
          if (!group) {
            group = { id, controls: [] };
            this.changeGroups.set(id, group);
            this.changeGroupLastValues.set(id, new Map());
          }
          
          // Add component controls
          for (const spec of controlSpecs) {
            const fullName = `${componentName}.${spec.Name}`;
            if (!group.controls.includes(fullName)) {
              group.controls.push(fullName);
            }
          }
          
          return { result: true };
        }

        case "ChangeGroup.Remove": {
          const id = params?.['Id'] as string;
          const controls = params?.['Controls'] as string[] || [];
          
          if (!id) throw new Error("Change group ID required");
          
          const group = this.changeGroups.get(id);
          if (!group) throw new Error(`Change group not found: ${id}`);
          
          // Remove controls
          group.controls = group.controls.filter(c => !controls.includes(c));
          
          return { result: true };
        }

        case "ChangeGroup.Poll": {
          const id = params?.['Id'] as string;
          if (!id) throw new Error("Change group ID required");
          
          const group = this.changeGroups.get(id);
          if (!group) throw new Error(`Change group not found: ${id}`);
          
          const lastValues = this.changeGroupLastValues.get(id)!;
          const changes = [];
          
          for (const controlName of group.controls) {
            const current = await this.getControlValue(controlName);
            const last = lastValues.get(controlName);
            
            if (current?.Value !== last) {
              changes.push({
                Name: controlName,
                Value: current?.Value,
                String: current?.String || String(current?.Value)
              });
              lastValues.set(controlName, current?.Value);
            }
          }
          
          return { result: { Id: id, Changes: changes } };
        }

        case "ChangeGroup.Clear": {
          const id = params?.['Id'] as string;
          if (!id) throw new Error("Change group ID required");
          
          const group = this.changeGroups.get(id);
          if (!group) throw new Error(`Change group not found: ${id}`);
          
          group.controls = [];
          this.changeGroupLastValues.get(id)?.clear();
          
          return { result: true };
        }

        case "ChangeGroup.Destroy": {
          const id = params?.['Id'] as string;
          if (!id) throw new Error("Change group ID required");
          
          // Clear timer if exists
          const timer = this.autoPollTimers.get(id);
          if (timer) {
            clearInterval(timer);
            this.autoPollTimers.delete(id);
          }
          
          // Remove group
          this.changeGroups.delete(id);
          this.changeGroupLastValues.delete(id);
          
          return { result: true };
        }

        case "ChangeGroup.Invalidate": {
          const id = params?.['Id'] as string;
          if (!id) throw new Error("Change group ID required");
          
          const group = this.changeGroups.get(id);
          if (!group) throw new Error(`Change group not found: ${id}`);
          
          // Clear last values to force all controls to report as changed
          this.changeGroupLastValues.get(id)?.clear();
          
          return { result: true };
        }

        case "ChangeGroup.AutoPoll": {
          const id = params?.['Id'] as string;
          const rate = params?.['Rate'] as number || 1;
          
          if (!id) throw new Error("Change group ID required");
          
          const group = this.changeGroups.get(id);
          if (!group) throw new Error(`Change group not found: ${id}`);
          
          // Clear existing timer
          const existingTimer = this.autoPollTimers.get(id);
          if (existingTimer) {
            clearInterval(existingTimer);
          }
          
          // Set up new timer
          const timer = setInterval(async () => {
            try {
              await this.sendCommand("ChangeGroup.Poll", { Id: id });
            } catch (error) {
              logger.error(`AutoPoll error for group ${id}`, { error });
            }
          }, rate * 1000);
          
          this.autoPollTimers.set(id, timer);
          
          return { result: true };
        }

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
   * Get control value by name
   */
  private async getControlValue(controlName: string): Promise<{Value: unknown; String?: string} | null> {
    try {
      const result = await this.sendCommand("Control.Get", { Controls: [controlName] });
      const controls = (result as any)?.result;
      if (Array.isArray(controls) && controls.length > 0) {
        return controls[0];
      }
      return null;
    } catch (error) {
      logger.error(`Failed to get control value for ${controlName}`, { error });
      return null;
    }
  }

  /**
   * Validate and convert control value based on control type
   */
  private validateControlValue(
    controlName: string,
    value: unknown,
    controlInfo?: unknown
  ): { valid: boolean; value?: unknown; error?: string } {
    return validateControlValue(controlName, value, controlInfo);
  }

  // ===== Event Handling =====
  
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
    
    // Clear all autoPoll timers
    for (const [id, timer] of this.autoPollTimers) {
      clearInterval(timer);
      logger.debug(`Cleared AutoPoll timer for change group ${id}`);
    }
    this.autoPollTimers.clear();
    
    // Clear change groups
    this.changeGroups.clear();
    this.changeGroupLastValues.clear();
    
    logger.info('All caches cleared due to long disconnection');
  }
} 