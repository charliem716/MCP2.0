import { QRCCommands } from '../../../src/qrwc/commands.js';
import { QRWCClient } from '../../../src/qrwc/client.js';
import { QSysMethod } from '../../../src/shared/types/qsys.js';
import { QSysErrorCode } from '../../../src/shared/types/errors.js';

// Mock QRWCClient
jest.mock('../../../src/qrwc/client.js');
const MockedQRWCClient = QRWCClient as jest.MockedClass<typeof QRWCClient>;

// Mock logger
jest.mock('../../../src/shared/utils/logger.js', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }))
}));

describe('QRCCommands', () => {
  let commands: QRCCommands;
  let mockClient: jest.Mocked<QRWCClient>;

  beforeEach(() => {
    mockClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
    } as any;

    MockedQRWCClient.mockImplementation(() => mockClient);
    
    commands = new QRCCommands(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Methods', () => {
    describe('getComponents', () => {
      it('should retrieve all components', async () => {
        const mockComponents = [
          { name: 'Gain1', type: 'gain' },
          { name: 'Mixer1', type: 'mixer' }
        ];

        mockClient.sendCommand.mockResolvedValue({ components: mockComponents });

        const result = await commands.getComponents();

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.COMPONENT_GET_COMPONENTS,
          params: {}
        });
        expect(result).toEqual(mockComponents);
      });

      it('should return empty array when no components', async () => {
        mockClient.sendCommand.mockResolvedValue({});

        const result = await commands.getComponents();

        expect(result).toEqual([]);
      });

      it('should handle errors', async () => {
        mockClient.sendCommand.mockRejectedValue(new Error('Network error'));

        await expect(commands.getComponents()).rejects.toThrow('Failed to get components');
      });
    });

    describe('getComponent', () => {
      it('should retrieve specific component', async () => {
        const mockComponent = { name: 'Gain1', type: 'gain', controls: [] };
        mockClient.sendCommand.mockResolvedValue({ component: mockComponent });

        const result = await commands.getComponent('Gain1');

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.COMPONENT_GET,
          params: { Name: 'Gain1' }
        });
        expect(result).toEqual(mockComponent);
      });

      it('should throw error when component not found', async () => {
        mockClient.sendCommand.mockResolvedValue({});

        await expect(commands.getComponent('NonExistent')).rejects.toThrow('Component not found');
      });
    });

    describe('getControls', () => {
      it('should retrieve component controls', async () => {
        const mockControls = [
          { name: 'gain', type: 'float', value: 0.5 },
          { name: 'mute', type: 'boolean', value: false }
        ];
        mockClient.sendCommand.mockResolvedValue({ controls: mockControls });

        const result = await commands.getControls('Gain1');

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.COMPONENT_GET_CONTROLS,
          params: { Name: 'Gain1' }
        });
        expect(result).toEqual(mockControls);
      });

      it('should return empty array when no controls', async () => {
        mockClient.sendCommand.mockResolvedValue({});

        const result = await commands.getControls('EmptyComponent');

        expect(result).toEqual([]);
      });
    });
  });

  describe('Control Value Methods', () => {
    describe('getControlValue', () => {
      it('should get control value with component', async () => {
        mockClient.sendCommand.mockResolvedValue({ value: 0.75 });

        const result = await commands.getControlValue('gain', 'Gain1');

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.CONTROL_GET,
          params: { Name: 'gain', Component: 'Gain1' }
        });
        expect(result).toBe(0.75);
      });

      it('should get control value without component', async () => {
        mockClient.sendCommand.mockResolvedValue({ value: true });

        const result = await commands.getControlValue('mute');

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.CONTROL_GET,
          params: { Name: 'mute' }
        });
        expect(result).toBe(true);
      });

      it('should handle invalid control', async () => {
        mockClient.sendCommand.mockRejectedValue(new Error('Control not found'));

        await expect(commands.getControlValue('invalid')).rejects.toThrow('Failed to get control value');
      });
    });

    describe('setControlValue', () => {
      it('should set control value with component', async () => {
        mockClient.sendCommand.mockResolvedValue({});

        await commands.setControlValue('gain', 0.8, 'Gain1');

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.CONTROL_SET,
          params: { Name: 'gain', Value: 0.8, Component: 'Gain1' }
        });
      });

      it('should set control value without component', async () => {
        mockClient.sendCommand.mockResolvedValue({});

        await commands.setControlValue('mute', true);

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.CONTROL_SET,
          params: { Name: 'mute', Value: true }
        });
      });

      it('should handle ramp parameter', async () => {
        mockClient.sendCommand.mockResolvedValue({});

        await commands.setControlValue('gain', 0.5, 'Gain1', 2000);

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.CONTROL_SET,
          params: { Name: 'gain', Value: 0.5, Component: 'Gain1', Ramp: 2000 }
        });
      });
    });

    describe('getControlValues', () => {
      it('should get multiple control values', async () => {
        const mockControls = [
          { Name: 'gain', Component: 'Gain1' },
          { Name: 'mute', Component: 'Gain1' }
        ];
        const mockResult = { controls: [{ value: 0.5 }, { value: false }] };
        mockClient.sendCommand.mockResolvedValue(mockResult);

        const result = await commands.getControlValues(mockControls);

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.CONTROL_GET_MULTIPLE,
          params: { Controls: mockControls }
        });
        expect(result).toEqual([{ value: 0.5 }, { value: false }]);
      });

      it('should return empty array when no controls', async () => {
        mockClient.sendCommand.mockResolvedValue({});

        const result = await commands.getControlValues([]);

        expect(result).toEqual([]);
      });
    });

    describe('setControlValues', () => {
      it('should set multiple control values', async () => {
        const mockControls = [
          { Name: 'gain', Value: 0.5, Component: 'Gain1' },
          { Name: 'mute', Value: true, Component: 'Gain1' }
        ];
        mockClient.sendCommand.mockResolvedValue({});

        await commands.setControlValues(mockControls);

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.CONTROL_SET_MULTIPLE,
          params: { Controls: mockControls }
        });
      });
    });
  });

  describe('Mixer Methods', () => {
    describe('getMixerInputs', () => {
      it('should get mixer inputs', async () => {
        const mockInputs = [
          { name: 'Input 1', gain: 0.5 },
          { name: 'Input 2', gain: 0.3 }
        ];
        mockClient.sendCommand.mockResolvedValue({ inputs: mockInputs });

        const result = await commands.getMixerInputs('Mixer1');

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.MIXER_GET_INPUTS,
          params: { Name: 'Mixer1' }
        });
        expect(result).toEqual(mockInputs);
      });
    });

    describe('getMixerOutputs', () => {
      it('should get mixer outputs', async () => {
        const mockOutputs = [
          { name: 'Output 1', gain: 0.7 },
          { name: 'Output 2', gain: 0.8 }
        ];
        mockClient.sendCommand.mockResolvedValue({ outputs: mockOutputs });

        const result = await commands.getMixerOutputs('Mixer1');

        expect(result).toEqual(mockOutputs);
      });
    });

    describe('setCrosspointMute', () => {
      it('should set crosspoint mute', async () => {
        mockClient.sendCommand.mockResolvedValue({});

        await commands.setCrosspointMute('Mixer1', 1, 2, true);

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.MIXER_SET_CROSSPOINT_MUTE,
          params: { Name: 'Mixer1', Input: 1, Output: 2, Mute: true }
        });
      });
    });

    describe('setCrosspointGain', () => {
      it('should set crosspoint gain', async () => {
        mockClient.sendCommand.mockResolvedValue({});

        await commands.setCrosspointGain('Mixer1', 1, 2, 0.5);

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.MIXER_SET_CROSSPOINT_GAIN,
          params: { Name: 'Mixer1', Input: 1, Output: 2, Gain: 0.5 }
        });
      });
    });

    describe('getCrosspointMute', () => {
      it('should get crosspoint mute state', async () => {
        mockClient.sendCommand.mockResolvedValue({ mute: true });

        const result = await commands.getCrosspointMute('Mixer1', 1, 2);

        expect(result).toBe(true);
      });
    });

    describe('getCrosspointGain', () => {
      it('should get crosspoint gain value', async () => {
        mockClient.sendCommand.mockResolvedValue({ gain: 0.6 });

        const result = await commands.getCrosspointGain('Mixer1', 1, 2);

        expect(result).toBe(0.6);
      });
    });
  });

  describe('Snapshot Methods', () => {
    describe('loadSnapshot', () => {
      it('should load snapshot without ramp', async () => {
        mockClient.sendCommand.mockResolvedValue({});

        await commands.loadSnapshot(1, 5);

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.SNAPSHOT_LOAD,
          params: { Bank: 1, Snapshot: 5 }
        });
      });

      it('should load snapshot with ramp', async () => {
        mockClient.sendCommand.mockResolvedValue({});

        await commands.loadSnapshot(1, 5, 2000);

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.SNAPSHOT_LOAD,
          params: { Bank: 1, Snapshot: 5, Ramp: 2000 }
        });
      });
    });

    describe('saveSnapshot', () => {
      it('should save snapshot without name', async () => {
        mockClient.sendCommand.mockResolvedValue({});

        await commands.saveSnapshot(1, 5);

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.SNAPSHOT_SAVE,
          params: { Bank: 1, Snapshot: 5 }
        });
      });

      it('should save snapshot with name', async () => {
        mockClient.sendCommand.mockResolvedValue({});

        await commands.saveSnapshot(1, 5, 'Test Snapshot');

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.SNAPSHOT_SAVE,
          params: { Bank: 1, Snapshot: 5, Name: 'Test Snapshot' }
        });
      });
    });

    describe('getSnapshotBanks', () => {
      it('should get snapshot banks', async () => {
        const mockBanks = [
          { id: 1, name: 'Bank 1', snapshots: 10 },
          { id: 2, name: 'Bank 2', snapshots: 5 }
        ];
        mockClient.sendCommand.mockResolvedValue({ banks: mockBanks });

        const result = await commands.getSnapshotBanks();

        expect(result).toEqual(mockBanks);
      });
    });

    describe('getSnapshots', () => {
      it('should get snapshots for bank', async () => {
        const mockSnapshots = [
          { id: 1, name: 'Snapshot 1' },
          { id: 2, name: 'Snapshot 2' }
        ];
        mockClient.sendCommand.mockResolvedValue({ snapshots: mockSnapshots });

        const result = await commands.getSnapshots(1);

        expect(result).toEqual(mockSnapshots);
      });
    });
  });

  describe('Status Methods', () => {
    describe('getStatus', () => {
      it('should get core status', async () => {
        const mockStatus = {
          isRedundant: false,
          isEmulator: false,
          status: 'ok',
          platform: 'Q-SYS Core 110f'
        };
        mockClient.sendCommand.mockResolvedValue({ status: mockStatus });

        const result = await commands.getStatus();

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.STATUS_GET,
          params: {}
        });
        expect(result).toEqual(mockStatus);
      });
    });
  });

  describe('Change Group Methods', () => {
    describe('addControlToChangeGroup', () => {
      it('should add control with component to change group', async () => {
        mockClient.sendCommand.mockResolvedValue({});

        await commands.addControlToChangeGroup('gain', 'Gain1');

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.CHANGE_GROUP_ADD_CONTROL,
          params: { Name: 'gain', Component: 'Gain1' }
        });
      });

      it('should add control without component to change group', async () => {
        mockClient.sendCommand.mockResolvedValue({});

        await commands.addControlToChangeGroup('mute');

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.CHANGE_GROUP_ADD_CONTROL,
          params: { Name: 'mute' }
        });
      });
    });

    describe('removeControlFromChangeGroup', () => {
      it('should remove control from change group', async () => {
        mockClient.sendCommand.mockResolvedValue({});

        await commands.removeControlFromChangeGroup('gain', 'Gain1');

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.CHANGE_GROUP_REMOVE_CONTROL,
          params: { Name: 'gain', Component: 'Gain1' }
        });
      });
    });

    describe('clearChangeGroup', () => {
      it('should clear change group', async () => {
        mockClient.sendCommand.mockResolvedValue({});

        await commands.clearChangeGroup();

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.CHANGE_GROUP_CLEAR,
          params: {}
        });
      });
    });

    describe('invalidateChangeGroup', () => {
      it('should invalidate change group', async () => {
        mockClient.sendCommand.mockResolvedValue({});

        await commands.invalidateChangeGroup();

        expect(mockClient.sendCommand).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: QSysMethod.CHANGE_GROUP_INVALIDATE,
          params: {}
        });
      });
    });
  });

  describe('Local Change Group Management', () => {
    describe('createChangeGroup', () => {
      it('should create and store change group', () => {
        const controls = [
          { control: 'gain', component: 'Gain1' },
          { control: 'mute', component: 'Gain1' }
        ];

        const changeGroup = commands.createChangeGroup('testGroup', controls);

        expect(changeGroup).toEqual({
          id: 'testGroup',
          controls: controls,
          autoPoll: false
        });
      });
    });

    describe('getChangeGroup', () => {
      it('should retrieve stored change group', () => {
        const controls = [{ control: 'gain', component: 'Gain1' }];
        commands.createChangeGroup('testGroup', controls);

        const changeGroup = commands.getChangeGroup('testGroup');

        expect(changeGroup?.id).toBe('testGroup');
        expect(changeGroup?.controls).toEqual(controls);
      });

      it('should return undefined for non-existent change group', () => {
        const changeGroup = commands.getChangeGroup('nonExistent');

        expect(changeGroup).toBeUndefined();
      });
    });

    describe('deleteChangeGroup', () => {
      it('should delete stored change group', () => {
        const controls = [{ control: 'gain', component: 'Gain1' }];
        commands.createChangeGroup('testGroup', controls);

        const deleted = commands.deleteChangeGroup('testGroup');

        expect(deleted).toBe(true);
        expect(commands.getChangeGroup('testGroup')).toBeUndefined();
      });

      it('should return false for non-existent change group', () => {
        const deleted = commands.deleteChangeGroup('nonExistent');

        expect(deleted).toBe(false);
      });
    });

    describe('listChangeGroups', () => {
      it('should list all change groups', () => {
        commands.createChangeGroup('group1', [{ control: 'gain', component: 'Gain1' }]);
        commands.createChangeGroup('group2', [{ control: 'mute', component: 'Gain1' }]);

        const groups = commands.listChangeGroups();

        expect(groups).toHaveLength(2);
        expect(groups.map(g => g.id)).toEqual(['group1', 'group2']);
      });

      it('should return empty array when no change groups', () => {
        const groups = commands.listChangeGroups();

        expect(groups).toEqual([]);
      });
    });
  });

  describe('Parameter Validation', () => {
    it('should validate required parameters', async () => {
      await expect(commands.getComponent('')).rejects.toThrow();
      await expect(commands.getControls('')).rejects.toThrow();
      await expect(commands.getControlValue('')).rejects.toThrow();
    });

    it('should validate numeric parameters', async () => {
      await expect(commands.loadSnapshot(-1, 1)).rejects.toThrow();
      await expect(commands.loadSnapshot(1, -1)).rejects.toThrow();
      await expect(commands.setCrosspointGain('Mixer1', 1, 2, 2.0)).rejects.toThrow(); // Gain > 1
    });

    it('should validate mixer parameters', async () => {
      await expect(commands.getMixerInputs('')).rejects.toThrow();
      await expect(commands.setCrosspointMute('', 1, 2, true)).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      mockClient.sendCommand.mockRejectedValue(new Error('Network timeout'));

      await expect(commands.getComponents()).rejects.toThrow('Failed to get components');
    });

    it('should handle Q-SYS errors', async () => {
      mockClient.sendCommand.mockRejectedValue({
        code: QSysErrorCode.INVALID_COMPONENT,
        message: 'Component not found'
      });

      await expect(commands.getComponent('Invalid')).rejects.toThrow();
    });

    it('should handle malformed responses', async () => {
      mockClient.sendCommand.mockResolvedValue(null);

      await expect(commands.getComponents()).rejects.toThrow();
    });
  });
}); 