import { EventEmitter } from 'events';
import { 
  QSysApiResponse, 
  QSysComponent, 
  QSysControl,
  QSysComponentControl,
  QSysComponentsResponse,
  QSysComponentControlsResponse,
  QSysStatusResponse
} from '../../src/types/qsys.js';

export interface MockCoreConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  failureMode?: 'none' | 'connection' | 'timeout' | 'invalid-response';
  connectionDelay?: number;
  responseDelay?: number;
}

export class QSysCoreMock extends EventEmitter {
  private components: Map<string, any> = new Map();
  private controls: Map<string, QSysComponentControl[]> = new Map();
  private controlValues: Map<string, any> = new Map();
  private connected = false;
  private config: MockCoreConfig;
  private clients = new Set<string>();
  private changeGroups: Map<string, Set<string>> = new Map();
  private autoPollGroups = new Set<string>();

  constructor(config: MockCoreConfig) {
    super();
    this.config = config;
    this.initializeDefaultComponents();
  }

  private initializeDefaultComponents(): void {
    // Add standard Q-SYS components with Properties as array format
    const defaultComponents = [
      { 
        Name: 'AudioPlayer1', 
        Type: 'Audio Player', 
        Properties: []
      },
      { 
        Name: 'Mixer1', 
        Type: 'Mixer', 
        Properties: [{ Name: 'Channels', Value: '8' }]
      },
      { 
        Name: 'Gain1', 
        Type: 'Gain', 
        Properties: []
      },
      { 
        Name: 'Router1', 
        Type: 'Router', 
        Properties: [
          { Name: 'Inputs', Value: '4' },
          { Name: 'Outputs', Value: '4' }
        ]
      },
      { 
        Name: 'Snapshot1', 
        Type: 'Snapshot Controller', 
        Properties: []
      },
      { 
        Name: 'StatusComponent', 
        Type: 'Status', 
        Properties: []
      }
    ];

    defaultComponents.forEach(comp => {
      this.components.set(comp.Name, comp);
      this.initializeComponentControls(comp);
    });
  }

  private initializeComponentControls(component: any): void {
    const controls: QSysComponentControl[] = [];
    
    switch (component.Type) {
      case 'Audio Player':
        controls.push(
          { Name: 'play', Type: 'Boolean', Value: 0, ValueType: 'Boolean' },
          { Name: 'pause', Type: 'Boolean', Value: 0, ValueType: 'Boolean' },
          { Name: 'stop', Type: 'Boolean', Value: 1, ValueType: 'Boolean' },
          { Name: 'gain', Type: 'Float', Value: 0, ValueType: 'Float', Range: { Min: -100, Max: 20 } },
          { Name: 'position', Type: 'Float', Value: 0, ValueType: 'Float' }
        );
        break;
      
      case 'Mixer':
        for (let i = 1; i <= 8; i++) {
          controls.push(
            { Name: `input.${i}.gain`, Type: 'Float', Value: 0, ValueType: 'Float', Range: { Min: -100, Max: 20 } },
            { Name: `input.${i}.mute`, Type: 'Boolean', Value: 0, ValueType: 'Boolean' }
          );
        }
        controls.push(
          { Name: 'output.gain', Type: 'Float', Value: 0, ValueType: 'Float', Range: { Min: -100, Max: 20 } }
        );
        break;
      
      case 'Gain':
        controls.push(
          { Name: 'gain', Type: 'Float', Value: 0, ValueType: 'Float', Range: { Min: -100, Max: 20 } },
          { Name: 'mute', Type: 'Boolean', Value: 0, ValueType: 'Boolean' }
        );
        break;
      
      case 'Router':
        for (let i = 1; i <= 4; i++) {
          controls.push(
            { Name: `select.${i}`, Type: 'Integer', Value: i, ValueType: 'Integer', Range: { Min: 1, Max: 4 } }
          );
        }
        break;
      
      case 'Status':
        controls.push(
          { Name: 'Status', Type: 'String', Value: 'OK', ValueType: 'String' },
          { Name: 'Code', Type: 'Integer', Value: 0, ValueType: 'Integer' }
        );
        break;
    }

    this.controls.set(component.Name, controls);
    
    // Initialize control values
    controls.forEach(control => {
      this.controlValues.set(`${component.Name}.${control.Name}`, control.Value);
    });
  }

  async connect(): Promise<void> {
    if (this.config.failureMode === 'connection') {
      throw new Error('Connection refused');
    }

    if (this.config.connectionDelay) {
      await new Promise(resolve => setTimeout(resolve, this.config.connectionDelay));
    }

    this.connected = true;
    this.emit('connected');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.clients.clear();
    this.changeGroups.clear();
    this.autoPollGroups.clear();
    this.emit('disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  registerClient(clientId: string): void {
    this.clients.add(clientId);
  }

  unregisterClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  async sendCommand(method: string, params?: any): Promise<QSysApiResponse<any>> {
    if (!this.connected) {
      return { error: { code: -32603, message: 'Not connected' } };
    }

    if (this.config.failureMode === 'timeout') {
      await new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 5000)
      );
    }

    if (this.config.responseDelay) {
      await new Promise(resolve => setTimeout(resolve, this.config.responseDelay));
    }

    if (this.config.failureMode === 'invalid-response') {
      return { error: { code: -32602, message: 'Invalid params' } };
    }

    switch (method) {
      case 'Component.GetComponents':
        return this.handleGetComponents();
      
      case 'Component.GetControls':
        return this.handleGetControls(params);
      
      case 'Control.Get':
        return this.handleControlGet(params);
      
      case 'Control.Set':
        return this.handleControlSet(params);
      
      case 'Component.Set':
        return this.handleComponentSet(params);
      
      case 'ChangeGroup.Create':
        return this.handleChangeGroupCreate(params);
      
      case 'ChangeGroup.Destroy':
        return this.handleChangeGroupDestroy(params);
      
      case 'ChangeGroup.AddControl':
      case 'ChangeGroup.AddComponentControl':
        return this.handleChangeGroupAddControl(params);
      
      case 'ChangeGroup.Remove':
        return this.handleChangeGroupRemove(params);
      
      case 'ChangeGroup.Poll':
        return this.handleChangeGroupPoll(params);
      
      case 'ChangeGroup.AutoPoll':
        return this.handleChangeGroupAutoPoll(params);
      
      case 'StatusGet':
        return this.handleStatusGet();
      
      default:
        return { error: { code: -32601, message: 'Method not found' } };
    }
  }

  private handleGetComponents(): QSysApiResponse<QSysComponentsResponse> {
    return {
      result: {
        Components: Array.from(this.components.values())
      }
    };
  }

  private handleGetControls(params: any): QSysApiResponse<QSysComponentControlsResponse> {
    const componentName = params?.Name;
    if (!componentName || !this.components.has(componentName)) {
      return { error: { code: -32602, message: 'Component not found' } };
    }

    const controls = this.controls.get(componentName) || [];
    return {
      result: {
        Controls: controls.map(control => ({
          ...control,
          Value: this.controlValues.get(`${componentName}.${control.Name}`) ?? control.Value
        }))
      }
    };
  }

  private handleControlGet(params: any): QSysApiResponse<{ Controls: QSysControl[] }> {
    const controlNames = params?.Controls || [];
    const controls: QSysControl[] = [];

    for (const name of controlNames) {
      const value = this.controlValues.get(name);
      if (value !== undefined) {
        controls.push({
          Name: name,
          Value: value,
          String: String(value)
        });
      }
    }

    return { result: { Controls: controls } };
  }

  private handleControlSet(params: any): QSysApiResponse<{ Controls: QSysControl[] }> {
    const controlsToSet = params?.Controls || [];
    const controls: QSysControl[] = [];

    for (const control of controlsToSet) {
      this.controlValues.set(control.Name, control.Value);
      controls.push({
        Name: control.Name,
        Value: control.Value,
        String: String(control.Value)
      });

      // Emit change events for change groups
      this.emitControlChange(control.Name, control.Value);
    }

    return { result: { Controls: controls } };
  }

  private handleComponentSet(params: any): QSysApiResponse<{ Controls: QSysComponentControl[] }> {
    const componentName = params?.Name;
    if (!componentName || !this.components.has(componentName)) {
      return { error: { code: -32602, message: 'Component not found' } };
    }

    const controlsToSet = params?.Controls || [];
    const controls: QSysComponentControl[] = [];

    for (const control of controlsToSet) {
      const fullName = `${componentName}.${control.Name}`;
      this.controlValues.set(fullName, control.Value);
      
      const existingControl = this.controls.get(componentName)?.find(c => c.Name === control.Name);
      if (existingControl) {
        controls.push({
          ...existingControl,
          Value: control.Value
        });
      }

      // Emit change events
      this.emitControlChange(fullName, control.Value);
    }

    return { result: { Controls: controls } };
  }

  private handleChangeGroupCreate(params: any): QSysApiResponse<{ Id: string }> {
    const groupId = params?.Id || `group-${Date.now()}`;
    this.changeGroups.set(groupId, new Set());
    return { result: { Id: groupId } };
  }

  private handleChangeGroupDestroy(params: any): QSysApiResponse<{}> {
    const groupId = params?.Id;
    if (groupId) {
      this.changeGroups.delete(groupId);
      this.autoPollGroups.delete(groupId);
    }
    return { result: {} };
  }

  private handleChangeGroupAddControl(params: any): QSysApiResponse<{}> {
    const groupId = params?.Id;
    const controls = params?.Controls || [];
    
    if (!groupId || !this.changeGroups.has(groupId)) {
      return { error: { code: -32602, message: 'Change group not found' } };
    }

    const group = this.changeGroups.get(groupId)!;
    controls.forEach((control: any) => {
      if (typeof control === 'string') {
        group.add(control);
      } else if (control.Name) {
        group.add(control.Name);
      }
    });

    return { result: {} };
  }

  private handleChangeGroupRemove(params: any): QSysApiResponse<{}> {
    const groupId = params?.Id;
    const controls = params?.Controls || [];
    
    if (!groupId || !this.changeGroups.has(groupId)) {
      return { error: { code: -32602, message: 'Change group not found' } };
    }

    const group = this.changeGroups.get(groupId)!;
    controls.forEach((control: any) => {
      const name = typeof control === 'string' ? control : control.Name;
      group.delete(name);
    });

    return { result: {} };
  }

  private handleChangeGroupPoll(params: any): QSysApiResponse<{ Changes: QSysControl[] }> {
    const groupId = params?.Id;
    if (!groupId || !this.changeGroups.has(groupId)) {
      return { error: { code: -32602, message: 'Change group not found' } };
    }

    // Return current values for all controls in the group
    const group = this.changeGroups.get(groupId)!;
    const changes: QSysControl[] = [];
    
    group.forEach(controlName => {
      const value = this.controlValues.get(controlName);
      if (value !== undefined) {
        changes.push({
          Name: controlName,
          Value: value,
          String: String(value)
        });
      }
    });

    return { result: { Changes: changes } };
  }

  private handleChangeGroupAutoPoll(params: any): QSysApiResponse<{}> {
    const groupId = params?.Id;
    const enabled = params?.Enabled;
    
    if (!groupId || !this.changeGroups.has(groupId)) {
      return { error: { code: -32602, message: 'Change group not found' } };
    }

    if (enabled) {
      this.autoPollGroups.add(groupId);
    } else {
      this.autoPollGroups.delete(groupId);
    }

    return { result: {} };
  }

  private handleStatusGet(): QSysApiResponse<QSysStatusResponse> {
    return {
      result: {
        Platform: 'Core 110f',
        State: 'Active',
        DesignName: 'MockDesign',
        DesignCode: 'MOCK123',
        IsRedundant: false,
        IsEmulator: true,
        Status: {
          Code: 0,
          String: 'OK'
        }
      }
    };
  }

  private emitControlChange(controlName: string, value: any): void {
    // Emit changes to all change groups containing this control
    this.changeGroups.forEach((controls, groupId) => {
      if (controls.has(controlName) && this.autoPollGroups.has(groupId)) {
        this.emit('changeGroup:changes', {
          groupId,
          changes: [{
            Name: controlName,
            Value: value,
            String: String(value)
          }]
        });
      }
    });
  }

  // Test helper methods
  injectFailure(mode: 'none' | 'connection' | 'timeout' | 'invalid-response'): void {
    this.config.failureMode = mode;
  }

  simulateDisconnect(): void {
    this.connected = false;
    this.emit('disconnected');
  }

  simulateControlChange(controlName: string, value: any): void {
    this.controlValues.set(controlName, value);
    this.emitControlChange(controlName, value);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getChangeGroupCount(): number {
    return this.changeGroups.size;
  }
}