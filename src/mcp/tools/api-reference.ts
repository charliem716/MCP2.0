/**
 * Q-SYS API Reference Data
 * Provides structured API documentation for the query_qsys_api tool
 */

export interface APIMethodExample {
  method: string;
  params?: Record<string, unknown> | unknown[];
  description?: string;
  response?: unknown;
  alternativeExamples?: APIMethodExample[];
}

export interface APIMethod {
  name: string;
  description: string;
  category: string;
  params: Record<string, string>;
  example?: APIMethodExample;
  componentTypes?: string[];
}

export interface APIMethodFilters {
  component_type?: string;
  method_category?: string;
  search?: string;
  method_name?: string;
}

export class QSysAPIReference {
  private methods: APIMethod[] = [
    // Authentication Methods
    {
      name: 'Logon',
      category: 'Authentication',
      description: 'Authenticate with Q-SYS Core using credentials',
      params: {
        User: 'string - Username',
        Password: 'string - Password',
      },
      example: {
        method: 'Logon',
        params: { User: 'username', Password: '1234' },
      },
    },
    {
      name: 'NoOp',
      category: 'Authentication',
      description: 'Keep-alive message to prevent session timeout (60 second timeout without activity)',
      params: {},
      example: {
        method: 'NoOp',
        params: {},
        description: 'Send every 30 seconds to maintain connection',
      },
    },

    // Component Methods
    {
      name: 'Component.Get',
      category: 'Component',
      description:
        'Get specific controls from a component (including mixer inputs/outputs/crosspoints)',
      params: {
        Name: 'string - Component name',
        Controls: 'array - Control specifications [{Name: string}]',
      },
      example: {
        method: 'Component.Get',
        params: {
          Name: 'My APM',
          Controls: [{ Name: 'ent.xfade.gain' }, { Name: 'bgm.xfade.gain' }],
        },
        description: 'Get multiple controls from a component',
        // Alternative examples
        alternativeExamples: [
          {
            method: 'Component.Get',
            params: {
              Name: 'Main Gain',
              Controls: [{ Name: 'gain' }],
            },
            description: 'Get a single control from a component',
          },
          {
            method: 'Component.Get',
            params: {
              Name: 'Mixer1',
              Controls: [
                { Name: 'input.1.gain' },
                { Name: 'input.2.gain' },
                { Name: 'output.1.gain' },
                { Name: 'crosspoint.1.1.gain' },
              ],
            },
            description: 'Get mixer input/output/crosspoint values (replaces Mixer.GetCrosspoints)',
          },
        ],
      },
    },
    {
      name: 'Component.GetComponents',
      category: 'Component',
      description: 'List all components in the design',
      params: {},
      example: { method: 'Component.GetComponents' },
    },
    {
      name: 'Component.GetControls',
      category: 'Component',
      description: 'Get ALL controls from a named component with full metadata',
      params: {
        Name: 'string - Component name',
      },
      example: {
        method: 'Component.GetControls',
        params: { Name: 'MyGain' },
        response: {
          Name: 'MyGain',
          Controls: [
            {
              Name: 'bypass',
              Type: 'Boolean',
              Value: false,
              String: 'no',
              Position: 0.0,
              Direction: 'Read/Write',
            },
            {
              Name: 'gain',
              Type: 'Float',
              Value: 0.0,
              ValueMin: -100.0,
              ValueMax: 20.0,
              StringMin: '-100dB',
              StringMax: '20.0dB',
              String: '0dB',
              Position: 0.83333331,
              Direction: 'Read/Write',
            },
          ],
        },
      },
    },
    {
      name: 'Component.Set',
      category: 'Component',
      description:
        'Set control values on a component (including mixer inputs/outputs/crosspoints)',
      params: {
        Name: 'string - Component name',
        Controls:
          'array - [{Name: string, Value: number | string | boolean, Ramp?: number}]',
      },
      example: {
        method: 'Component.Set',
        params: {
          Name: 'Channel Strip',
          Controls: [
            { Name: 'gain', Value: -10, Ramp: 2 },
            { Name: 'mute', Value: false },
            { Name: 'phantom', Value: true },
          ],
        },
        description: 'Set multiple controls on a component',
        alternativeExamples: [
          {
            method: 'Component.Set',
            params: {
              Name: 'Main Gain',
              Controls: [{ Name: 'gain', Value: -10, Ramp: 2 }],
            },
            description: 'Set a single control with ramp time',
          },
          {
            method: 'Component.Set',
            params: {
              Name: 'Mixer1',
              Controls: [
                { Name: 'input.1.gain', Value: -6 },
                { Name: 'input.2.gain', Value: -3 },
                { Name: 'output.1.gain', Value: 0 },
              ],
            },
            description: 'Set mixer input/output gains (replaces Mixer.SetInputGain/SetOutputGain)',
          },
        ],
      },
    },

    // Control Methods
    {
      name: 'Control.Get',
      category: 'Control',
      description: 'Get values of named controls (supports single or multiple, including mixer controls)',
      params: {
        Controls: 'array - Control names as strings',
      },
      example: {
        method: 'Control.Get',
        params: ['MainGain', 'MainMute', 'MainEQ.bypass', 'MainDelay.time'],
        description: 'Get multiple named controls',
        alternativeExamples: [
          {
            method: 'Control.Get',
            params: ['MainGain'],
            description: 'Get a single named control',
          },
          {
            method: 'Control.Get',
            params: ['Mixer1.input.1.gain', 'Mixer1.output.1.gain', 'Mixer1.crosspoint.1.1.gain'],
            description: 'Get mixer controls using full control names',
          },
        ],
      },
    },
    {
      name: 'Control.Set',
      category: 'Control',
      description: 'Set control values by value or position (including mixer controls)',
      params: {
        Name: 'string - Control name (can be full mixer control name)',
        Value: 'any - New value (actual value like -12 for dB)',
        Position: 'number - Alternative: position 0.0-1.0',
        Ramp: 'number - Optional ramp time in seconds',
      },
      example: {
        method: 'Control.Set',
        params: { Name: 'MainGain', Value: -12, Ramp: 2.0 },
        alternativeExamples: [
          {
            method: 'Control.Set',
            params: { Name: 'MainGain', Position: 0.5, Ramp: 1.0 },
            description: 'Set by position (0.0-1.0) instead of value',
          },
          {
            method: 'Control.Set',
            params: { Name: 'Mixer1.input.1.gain', Value: -6, Ramp: 1.0 },
            description: 'Set mixer input gain using full control name',
          },
        ],
      },
    },


    // Status Methods
    {
      name: 'Status.Get',
      category: 'Status',
      description: 'Get Q-SYS Core status information',
      params: {},
      example: { 
        method: 'Status.Get',
        response: {
          Platform: 'Q-SYS Designer',
          State: 'Active',
          DesignName: 'Conference Room',
          DesignCode: 'gXYmSCTfmau4',
          IsRedundant: false,
          IsEmulator: false,
          Status: {
            Code: 0,
            String: 'OK'
          }
        }
      },
    },
    {
      name: 'Core.GetStatus',
      category: 'Status',
      description: 'Get detailed Core processor status including hardware info',
      params: {},
      example: {
        method: 'Core.GetStatus',
        params: {},
        response: {
          DesignName: 'Conference Room',
          DesignCode: 'gXYmSCTfmau4',
          IsRedundant: false,
          IsEmulator: false,
          Platform: 'Core 110f',
          Mode: 'Run',
          CoreId: 'CORE-123456'
        }
      },
    },
    {
      name: 'StatusGet',
      category: 'Status',
      description: 'Legacy status method (same as Status.Get)',
      params: {},
      example: { method: 'StatusGet', params: {} },
    },

    // ChangeGroup Methods
    {
      name: 'ChangeGroup.AddControl',
      category: 'ChangeGroup',
      description: 'Add named controls to a change group for efficient polling',
      params: {
        Id: 'string - Change group identifier',
        Controls: 'array - Control names to monitor',
      },
      example: {
        method: 'ChangeGroup.AddControl',
        params: { Id: 'myGroup', Controls: ['MainGain', 'MainMute', 'Delay1'] },
      },
    },
    {
      name: 'ChangeGroup.AddComponentControl',
      category: 'ChangeGroup',
      description: 'Add component controls to a change group',
      params: {
        Id: 'string - Change group identifier',
        Component: 'object - Component name and controls array',
      },
      example: {
        method: 'ChangeGroup.AddComponentControl',
        params: {
          Id: 'myGroup',
          Component: {
            Name: 'My Component',
            Controls: [{ Name: 'gain' }, { Name: 'mute' }],
          },
        },
      },
    },
    {
      name: 'ChangeGroup.Poll',
      category: 'ChangeGroup',
      description: 'Poll for changes in a change group',
      params: {
        Id: 'string - Change group identifier',
      },
      example: {
        method: 'ChangeGroup.Poll',
        params: { Id: 'myGroup' },
        response: {
          Id: 'myGroup',
          Changes: [
            { Name: 'MainGain', Value: -12, String: '-12dB' },
            {
              Component: 'My Component',
              Name: 'gain',
              Value: -6,
              String: '-6dB',
            },
          ],
        },
      },
    },
    {
      name: 'ChangeGroup.AutoPoll',
      category: 'ChangeGroup',
      description: 'Set up automatic polling at specified interval',
      params: {
        Id: 'string - Change group identifier',
        Rate: 'number - Polling interval in seconds',
      },
      example: {
        method: 'ChangeGroup.AutoPoll',
        params: { Id: 'myGroup', Rate: 0.5 },
        description: 'Automatically receive updates every 500ms',
      },
    },
    {
      name: 'ChangeGroup.Create',
      category: 'ChangeGroup',
      description: 'Create a new change group for monitoring controls',
      params: {
        Id: 'string - Unique change group identifier',
      },
      example: {
        method: 'ChangeGroup.Create',
        params: { Id: 'monitoring-1' },
      },
    },
    {
      name: 'ChangeGroup.Remove',
      category: 'ChangeGroup',
      description: 'Remove specific controls from a change group',
      params: {
        Id: 'string - Change group identifier',
        Controls: 'array - Control names to remove',
      },
      example: {
        method: 'ChangeGroup.Remove',
        params: { Id: 'myGroup', Controls: ['Volume'] },
      },
    },
    {
      name: 'ChangeGroup.Clear',
      category: 'ChangeGroup',
      description: 'Clear all controls from a change group',
      params: {
        Id: 'string - Change group identifier',
      },
      example: {
        method: 'ChangeGroup.Clear',
        params: { Id: 'monitoring-1' },
      },
    },
    {
      name: 'ChangeGroup.Destroy',
      category: 'ChangeGroup',
      description: 'Destroy a change group and stop monitoring',
      params: {
        Id: 'string - Change group identifier',
      },
      example: {
        method: 'ChangeGroup.Destroy',
        params: { Id: 'monitoring-1' },
      },
    },
    {
      name: 'ChangeGroup.Invalidate',
      category: 'ChangeGroup',
      description: 'Force refresh of all controls in group on next poll',
      params: {
        Id: 'string - Change group identifier',
      },
      example: {
        method: 'ChangeGroup.Invalidate',
        params: { Id: 'monitoring-1' },
      },
    },

    // Mixer Advanced Methods
    {
      name: 'Mixer.SetInputGain',
      category: 'Mixer',
      description: 'Set input gain for mixer channels',
      componentTypes: ['mixer'],
      params: {
        Name: 'string - Mixer component name',
        Inputs: 'array - [{Index: number, Gain: number, Ramp?: number}]',
      },
      example: {
        method: 'Mixer.SetInputGain',
        params: {
          Name: 'Mixer1',
          Inputs: [
            { Index: 1, Gain: -6.0, Ramp: 2.0 }
          ]
        },
      },
    },
    {
      name: 'Mixer.SetOutputGain',
      category: 'Mixer',
      description: 'Set output gain for mixer channels',
      componentTypes: ['mixer'],
      params: {
        Name: 'string - Mixer component name',
        Outputs: 'array - [{Index: number, Gain: number, Ramp?: number}]',
      },
      example: {
        method: 'Mixer.SetOutputGain',
        params: {
          Name: 'Mixer1',
          Outputs: [
            { Index: 1, Gain: 0.0 }
          ]
        },
      },
    },
    {
      name: 'Mixer.SetCrossPointGain',
      category: 'Mixer',
      description: 'Set crosspoint gain in mixer matrix (alternative format)',
      componentTypes: ['mixer'],
      params: {
        Name: 'string - Mixer component name',
        Inputs: 'array - Input channel numbers',
        Outputs: 'array - Output channel numbers',
        Value: 'number - Gain in dB',
        Ramp: 'number - Optional ramp time in seconds',
      },
      example: {
        method: 'Mixer.SetCrossPointGain',
        params: {
          Name: 'Mixer1',
          Inputs: [1, 2],
          Outputs: [1],
          Value: -3.0,
          Ramp: 1.0
        },
      },
    },
    {
      name: 'Mixer.GetCrosspoints',
      category: 'Mixer',
      description: 'Get current crosspoint settings for a mixer',
      componentTypes: ['mixer'],
      params: {
        Name: 'string - Mixer component name',
      },
      example: {
        method: 'Mixer.GetCrosspoints',
        params: { Name: 'MainMixer' },
      },
    },

    // PA System Methods
    {
      name: 'PA.PageSubmit',
      category: 'PA',
      description: 'Submit a page announcement to zones',
      params: {
        Name: 'string - Page station component name',
        Message: 'string - Announcement message',
        QueueTimeout: 'number - Queue timeout in seconds',
        Priority: 'number - Page priority level',
        Zones: 'array - Zone numbers to page',
      },
      example: {
        method: 'PA.PageSubmit',
        params: {
          Name: 'PageStation1',
          Message: 'Attention please',
          QueueTimeout: 30,
          Priority: 1,
          Zones: [1, 2, 3]
        },
      },
    },
    {
      name: 'PA.PageCancel',
      category: 'PA',
      description: 'Cancel an active page announcement',
      params: {
        Name: 'string - Page station component name',
      },
      example: {
        method: 'PA.PageCancel',
        params: { Name: 'PageStation1' },
      },
    },

    // System Methods
    {
      name: 'LogEntry',
      category: 'System',
      description: 'Add an entry to the Q-SYS Core event log',
      params: {
        Message: 'string - Log message text',
      },
      example: {
        method: 'LogEntry',
        params: { Message: 'MCP Control: System initialized' },
      },
    },
    {
      name: 'Design.Get',
      category: 'System',
      description: 'Get current design information',
      params: {},
      example: {
        method: 'Design.Get',
        params: {},
      },
    },

    // Router Methods
    {
      name: 'Router.GetStatus',
      category: 'Router',
      description: 'Get router component status and routing',
      componentTypes: ['router'],
      params: {
        Name: 'string - Router component name',
      },
      example: {
        method: 'Router.GetStatus',
        params: { Name: 'AudioRouter1' },
      },
    },
  ];

  private componentTypes = [
    { type: 'mixer', description: 'Audio mixer (controls accessible via Component.Get/Set)' },
    { type: 'gain', description: 'Gain/attenuator control' },
    { type: 'delay', description: 'Audio delay processor' },
    { type: 'router', description: 'Audio/video router' },
    { type: 'eq', description: 'Parametric or graphic equalizer' },
    { type: 'meter', description: 'Audio level meter (RMS/Peak)' },
    { type: 'generator', description: 'Signal/tone generator' },
    { type: 'audio_player', description: 'Audio file player' },
    { type: 'compressor', description: 'Dynamics processor (compressor/limiter)' },
    { type: 'aec', description: 'Acoustic echo cancellation' },
  ];

  private controlTypes = [
    { type: 'gain', description: 'Gain control in dB, typically -100 to 20' },
    { type: 'mute', description: 'Boolean mute control' },
    { type: 'position', description: 'Fader position 0.0 to 1.0' },
    { type: 'string', description: 'Text display or input' },
    { type: 'trigger', description: 'Momentary button trigger' },
    { type: 'boolean', description: 'Boolean on/off control' },
    { type: 'float', description: 'Floating point numeric control' },
    { type: 'integer', description: 'Integer numeric control' },
    { type: 'bypass', description: 'Boolean bypass control' },
    { type: 'invert', description: 'Phase invert control' },
  ];

  queryMethods(filters: APIMethodFilters): APIMethod[] {
    let results = [...this.methods];

    if (filters.component_type) {
      results = results.filter(
        m =>
          m.componentTypes?.includes(filters.component_type ?? '') ??
          m.category === 'Component'
      );
    }

    if (filters.method_category) {
      // Handle both exact match and partial match for categories
      const category = filters.method_category;
      results = results.filter(m => 
        m.category === category || 
        (category === 'Mixer' && m.category === 'Mixer') ||
        (category === 'Status' && m.category === 'Status') ||
        (category === 'ChangeGroup' && m.category === 'ChangeGroup')
      );
    }

    if (filters.search) {
      const search = filters.search.toLowerCase();
      results = results.filter(
        m =>
          m.name.toLowerCase().includes(search) ||
          m.description.toLowerCase().includes(search)
      );
    }

    if (filters.method_name) {
      results = results.filter(m => m.name === filters.method_name);
    }

    return results;
  }

  getComponentTypes() {
    return this.componentTypes;
  }

  getControlTypes() {
    return this.controlTypes;
  }

  getExamples(methodName?: string): APIMethodExample[] {
    if (methodName) {
      const method = this.methods.find(m => m.name === methodName);
      if (!method?.example) return [];

      // Return all examples for this method (including alternative examples)
      const examples: APIMethodExample[] = [method.example];
      if (method.example.alternativeExamples) {
        examples.push(...method.example.alternativeExamples);
      }
      return examples;
    }

    // Return all examples from all methods
    const allExamples: APIMethodExample[] = [];
    this.methods.forEach(method => {
      if (method.example) {
        allExamples.push(method.example);
        if (method.example.alternativeExamples) {
          allExamples.push(...method.example.alternativeExamples);
        }
      }
    });
    return allExamples;
  }
}
