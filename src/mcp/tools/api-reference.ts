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

    // Component Methods
    {
      name: 'Component.Get',
      category: 'Component',
      description:
        'Get specific controls from a component (supports both single and multiple controls)',
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
      name: 'Component.GetAllControls',
      category: 'Component',
      description: 'Get all controls from ALL components at once',
      params: {},
      example: {
        method: 'Component.GetAllControls',
        description: 'Returns all controls from all components',
        response: {
          controls: [
            {
              Component: 'Main Gain',
              Name: 'gain',
              Value: -10,
              String: '-10.0 dB',
            },
            {
              Component: 'Main Gain',
              Name: 'mute',
              Value: false,
              String: 'unmuted',
            },
            {
              Component: 'Room Combine',
              Name: 'wall.1.open',
              Value: true,
              String: 'open',
            },
            {
              Component: 'Room Combine',
              Name: 'wall.2.open',
              Value: false,
              String: 'closed',
            },
          ],
        },
      },
    },
    {
      name: 'Component.Set',
      category: 'Component',
      description:
        'Set control values on a component (single or multiple controls)',
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
        ],
      },
    },

    // Control Methods
    {
      name: 'Control.Get',
      category: 'Control',
      description: 'Get values of named controls (supports single or multiple)',
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
        ],
      },
    },
    {
      name: 'Control.Set',
      category: 'Control',
      description: 'Set control values by value or position',
      params: {
        Name: 'string - Control name',
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
        ],
      },
    },

    // Mixer Methods
    {
      name: 'Mixer.SetCrosspointGain',
      category: 'Mixer',
      description: 'Set gain for mixer crosspoint',
      componentTypes: ['mixer'],
      params: {
        Name: 'string - Mixer component name',
        Inputs: "string - Input channel(s), e.g., '1' or '1,2,3'",
        Outputs: 'string - Output channel(s)',
        Value: 'number - Gain in dB (-100 to 20)',
      },
      example: {
        method: 'Mixer.SetCrosspointGain',
        params: { Name: 'MainMixer', Inputs: '1', Outputs: '1', Value: -10 },
      },
    },
    {
      name: 'Mixer.SetCrosspointMute',
      category: 'Mixer',
      description: 'Set mute state for mixer crosspoint',
      componentTypes: ['mixer'],
      params: {
        Name: 'string - Mixer component name',
        Inputs: 'string - Input channel(s)',
        Outputs: 'string - Output channel(s)',
        Value: 'boolean - Mute state',
      },
    },

    // Snapshot Methods
    {
      name: 'Snapshot.Load',
      category: 'Snapshot',
      description: 'Load a saved snapshot',
      params: {
        Name: 'string - Snapshot bank name',
        Bank: 'number - Snapshot number',
        Ramp: 'number - Optional ramp time',
      },
      example: {
        method: 'Snapshot.Load',
        params: { Name: 'MyBank', Bank: 1, Ramp: 2.5 },
      },
    },
    {
      name: 'Snapshot.Save',
      category: 'Snapshot',
      description: 'Save current state to snapshot',
      params: {
        Name: 'string - Snapshot bank name',
        Bank: 'number - Snapshot number',
      },
    },

    // Status Methods
    {
      name: 'Status.Get',
      category: 'Status',
      description: 'Get Q-SYS Core status information',
      params: {},
      example: { method: 'Status.Get' },
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
  ];

  private componentTypes = [
    { type: 'mixer', description: 'Audio mixer with crosspoint control' },
    { type: 'gain', description: 'Gain/attenuator control' },
    { type: 'delay', description: 'Audio delay processor' },
    { type: 'router', description: 'Audio router' },
    { type: 'snapshot', description: 'Snapshot controller' },
    { type: 'eq', description: 'Equalizer' },
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
          m.componentTypes?.includes(filters.component_type!) ||
          m.category === 'Component'
      );
    }

    if (filters.method_category) {
      results = results.filter(m => m.category === filters.method_category);
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
