/**
 * Control Value Simulator for Testing 33Hz Change Detection
 * 
 * Simulates realistic control value changes, especially for audio meters
 * which naturally change at high frequency.
 */

export interface SimulatedControl {
  name: string;
  type: 'meter' | 'gain' | 'mute' | 'static';
  currentValue: number;
  minValue: number;
  maxValue: number;
  updateRate: number; // Updates per second
  lastUpdate: number;
}

export class ControlSimulator {
  private controls: Map<string, SimulatedControl> = new Map();
  private running = false;
  private updateTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Initialize with some default controls
    this.addControl({
      name: 'AudioMeter.Level',
      type: 'meter',
      currentValue: -40,
      minValue: -80,
      maxValue: 0,
      updateRate: 60, // Audio meters update very frequently
      lastUpdate: Date.now()
    });

    this.addControl({
      name: 'AudioMeter.Peak',
      type: 'meter',
      currentValue: -30,
      minValue: -80,
      maxValue: 0,
      updateRate: 30,
      lastUpdate: Date.now()
    });

    this.addControl({
      name: 'Gain.1',
      type: 'gain',
      currentValue: 0,
      minValue: -100,
      maxValue: 20,
      updateRate: 2, // Gain changes occasionally
      lastUpdate: Date.now()
    });

    this.addControl({
      name: 'Mute.1',
      type: 'mute',
      currentValue: 0,
      minValue: 0,
      maxValue: 1,
      updateRate: 0.5, // Mute changes rarely
      lastUpdate: Date.now()
    });
  }

  addControl(control: SimulatedControl): void {
    this.controls.set(control.name, control);
  }

  /**
   * Get current value of a control
   */
  getControlValue(name: string): { Value: number; String: string } | null {
    const control = this.controls.get(name);
    if (!control) return null;

    // Update value if needed based on update rate
    const now = Date.now();
    const timeSinceUpdate = (now - control.lastUpdate) / 1000;
    const updateInterval = 1 / control.updateRate;

    if (timeSinceUpdate >= updateInterval) {
      this.updateControlValue(control);
      control.lastUpdate = now;
    }

    return {
      Value: control.currentValue,
      String: this.formatValue(control)
    };
  }

  /**
   * Update control value based on its type
   */
  private updateControlValue(control: SimulatedControl): void {
    switch (control.type) {
      case 'meter':
        // Audio meters fluctuate rapidly with some randomness
        // Simulate realistic audio level behavior
        const targetLevel = -20 + Math.sin(Date.now() / 1000) * 15; // Base oscillation
        const noise = (Math.random() - 0.5) * 10; // Random noise
        const smoothing = 0.3; // Smoothing factor
        
        control.currentValue = control.currentValue * (1 - smoothing) + 
                               (targetLevel + noise) * smoothing;
        
        // Clamp to range
        control.currentValue = Math.max(control.minValue, 
                              Math.min(control.maxValue, control.currentValue));
        break;

      case 'gain':
        // Gain changes occasionally in small steps
        if (Math.random() < 0.1) {
          const change = (Math.random() - 0.5) * 2;
          control.currentValue += change;
          control.currentValue = Math.max(control.minValue,
                                Math.min(control.maxValue, control.currentValue));
        }
        break;

      case 'mute':
        // Mute toggles rarely
        if (Math.random() < 0.02) {
          control.currentValue = control.currentValue === 0 ? 1 : 0;
        }
        break;

      case 'static':
        // Static controls don't change
        break;
    }
  }

  /**
   * Format value for string representation
   */
  private formatValue(control: SimulatedControl): string {
    switch (control.type) {
      case 'meter':
      case 'gain':
        return `${control.currentValue.toFixed(1)}dB`;
      case 'mute':
        return control.currentValue === 1 ? 'Muted' : 'Unmuted';
      default:
        return control.currentValue.toString();
    }
  }

  /**
   * Start continuous simulation
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Update all controls at 60Hz for smooth simulation
    this.updateTimer = setInterval(() => {
      const now = Date.now();
      for (const control of this.controls.values()) {
        const timeSinceUpdate = (now - control.lastUpdate) / 1000;
        const updateInterval = 1 / control.updateRate;

        if (timeSinceUpdate >= updateInterval) {
          this.updateControlValue(control);
          control.lastUpdate = now;
        }
      }
    }, 16); // ~60Hz update rate
  }

  /**
   * Stop simulation
   */
  stop(): void {
    this.running = false;
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  /**
   * Get all control names
   */
  getControlNames(): string[] {
    return Array.from(this.controls.keys());
  }

  /**
   * Reset all controls to initial values
   */
  reset(): void {
    for (const control of this.controls.values()) {
      switch (control.type) {
        case 'meter':
          control.currentValue = -40;
          break;
        case 'gain':
          control.currentValue = 0;
          break;
        case 'mute':
          control.currentValue = 0;
          break;
      }
      control.lastUpdate = Date.now();
    }
  }
}