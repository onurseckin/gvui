export class MockAudioParam {
  private _value: number;
  public defaultValue: number;
  public minValue: number;
  public maxValue: number;
  public scheduledEvents: Array<{
    type: string;
    value?: number;
    target?: number;
    time: number;
    duration?: number;
    timeConstant?: number;
  }> = [];

  constructor(defaultValue = 0, minValue = -3.4028235e38, maxValue = 3.4028235e38) {
    this._value = defaultValue;
    this.defaultValue = defaultValue;
    this.minValue = minValue;
    this.maxValue = maxValue;
  }

  get value(): number {
    return this._value;
  }

  set value(val: number) {
    this._value = val;
  }

  setValueAtTime(value: number, startTime: number): MockAudioParam {
    this._value = value;
    this.scheduledEvents.push({ type: "setValueAtTime", value, time: startTime });
    return this;
  }

  linearRampToValueAtTime(value: number, endTime: number): MockAudioParam {
    this._value = value;
    this.scheduledEvents.push({ type: "linearRampToValueAtTime", value, time: endTime });
    return this;
  }

  exponentialRampToValueAtTime(value: number, endTime: number): MockAudioParam {
    this._value = value;
    this.scheduledEvents.push({
      type: "exponentialRampToValueAtTime",
      value,
      time: endTime,
    });
    return this;
  }

  setTargetAtTime(target: number, startTime: number, timeConstant: number): MockAudioParam {
    this._value = target;
    this.scheduledEvents.push({
      type: "setTargetAtTime",
      target,
      time: startTime,
      timeConstant,
    });
    return this;
  }

  setValueCurveAtTime(
    values: number[] | Float32Array,
    startTime: number,
    duration: number,
  ): MockAudioParam {
    const arr = Array.from(values);
    if (arr.length > 0) {
      this._value = arr[arr.length - 1];
    }
    this.scheduledEvents.push({
      type: "setValueCurveAtTime",
      time: startTime,
      duration,
    });
    return this;
  }

  cancelScheduledValues(cancelTime: number): MockAudioParam {
    this.scheduledEvents = this.scheduledEvents.filter((ev) => ev.time < cancelTime);
    return this;
  }
}

export class MockAudioNode {
  public context: MockAudioContext;
  public numberOfInputs = 1;
  public numberOfOutputs = 1;
  public channelCount = 2;
  public channelCountMode: ChannelCountMode = "max";
  public channelInterpretation: ChannelInterpretation = "speakers";
  public connectedNodes: MockAudioNode[] = [];
  public connectedParams: MockAudioParam[] = [];

  constructor(context: MockAudioContext) {
    this.context = context;
  }

  connect(destinationNodeOrParam: MockAudioNode | MockAudioParam): MockAudioNode | void {
    if (destinationNodeOrParam instanceof MockAudioNode) {
      this.connectedNodes.push(destinationNodeOrParam);
      return destinationNodeOrParam;
    }
    if (destinationNodeOrParam instanceof MockAudioParam) {
      this.connectedParams.push(destinationNodeOrParam);
      return undefined;
    }
  }

  disconnect(destination?: MockAudioNode | MockAudioParam | number): void {
    if (!destination) {
      this.connectedNodes = [];
      this.connectedParams = [];
    } else if (destination instanceof MockAudioNode) {
      this.connectedNodes = this.connectedNodes.filter((n) => n !== destination);
    } else if (destination instanceof MockAudioParam) {
      this.connectedParams = this.connectedParams.filter((p) => p !== destination);
    }
  }
}

export class MockAudioDestinationNode extends MockAudioNode {
  public maxChannelCount = 2;
  constructor(context: MockAudioContext) {
    super(context);
    this.channelCount = 2;
  }
}

export class MockGainNode extends MockAudioNode {
  public gain: MockAudioParam;

  constructor(context: MockAudioContext) {
    super(context);
    this.gain = new MockAudioParam(1.0, 0, 100);
  }
}

export class MockStereoPannerNode extends MockAudioNode {
  public pan: MockAudioParam;

  constructor(context: MockAudioContext) {
    super(context);
    this.pan = new MockAudioParam(0.0, -1.0, 1.0);
  }
}

export class MockOscillatorNode extends MockAudioNode {
  public type: OscillatorType = "sine";
  public frequency: MockAudioParam;
  public detune: MockAudioParam;
  public started = false;
  public stopped = false;
  public startTime = 0;
  public stopTime = 0;
  public onended: ((event: Event) => void) | null = null;

  constructor(context: MockAudioContext) {
    super(context);
    this.frequency = new MockAudioParam(440, 0, 24000);
    this.detune = new MockAudioParam(0, -153600, 153600);
  }

  start(when = 0): void {
    this.started = true;
    this.startTime = when;
  }

  stop(when = 0): void {
    this.stopped = true;
    this.stopTime = when;
  }
}

export class MockBiquadFilterNode extends MockAudioNode {
  public type: BiquadFilterType = "lowpass";
  public frequency: MockAudioParam;
  public detune: MockAudioParam;
  public Q: MockAudioParam;
  public gain: MockAudioParam;

  constructor(context: MockAudioContext) {
    super(context);
    this.frequency = new MockAudioParam(350, 0, 24000);
    this.detune = new MockAudioParam(0, -153600, 153600);
    this.Q = new MockAudioParam(1, 0.0001, 1000);
    this.gain = new MockAudioParam(0, -40, 40);
  }
}

export class MockDynamicsCompressorNode extends MockAudioNode {
  public threshold: MockAudioParam;
  public knee: MockAudioParam;
  public ratio: MockAudioParam;
  public attack: MockAudioParam;
  public release: MockAudioParam;
  public reduction = 0;

  constructor(context: MockAudioContext) {
    super(context);
    this.threshold = new MockAudioParam(-24, -100, 0);
    this.knee = new MockAudioParam(30, 0, 40);
    this.ratio = new MockAudioParam(12, 1, 20);
    this.attack = new MockAudioParam(0.003, 0, 1);
    this.release = new MockAudioParam(0.25, 0, 1);
  }
}

export class MockAudioContext {
  public state: AudioContextState = "running";
  public currentTime = 0;
  public sampleRate = 44100;
  public destination: MockAudioDestinationNode;
  public activeOscillators: MockOscillatorNode[] = [];
  public createdNodes: MockAudioNode[] = [];

  constructor() {
    this.destination = new MockAudioDestinationNode(this);
    this.currentTime = 0.001;
  }

  createGain(): MockGainNode {
    const node = new MockGainNode(this);
    this.createdNodes.push(node);
    return node;
  }

  createStereoPanner(): MockStereoPannerNode {
    const node = new MockStereoPannerNode(this);
    this.createdNodes.push(node);
    return node;
  }

  createOscillator(): MockOscillatorNode {
    const node = new MockOscillatorNode(this);
    this.activeOscillators.push(node);
    this.createdNodes.push(node);
    return node;
  }

  createBiquadFilter(): MockBiquadFilterNode {
    const node = new MockBiquadFilterNode(this);
    this.createdNodes.push(node);
    return node;
  }

  createDynamicsCompressor(): MockDynamicsCompressorNode {
    const node = new MockDynamicsCompressorNode(this);
    this.createdNodes.push(node);
    return node;
  }

  async resume(): Promise<void> {
    this.state = "running";
  }

  async suspend(): Promise<void> {
    this.state = "suspended";
  }

  async close(): Promise<void> {
    this.state = "closed";
  }

  advanceTime(seconds: number): void {
    this.currentTime += seconds;
  }
}

export type SafeAudioContext = AudioContext | MockAudioContext;
export type SafeGainNode = GainNode | MockGainNode;
export type SafeOscillatorNode = OscillatorNode | MockOscillatorNode;
export type SafeStereoPannerNode = StereoPannerNode | MockStereoPannerNode;
export type SafeBiquadFilterNode = BiquadFilterNode | MockBiquadFilterNode;
export type SafeDynamicsCompressorNode = DynamicsCompressorNode | MockDynamicsCompressorNode;
export type SafeAudioNode = AudioNode | MockAudioNode;

export function safeConnect(
  source: SafeAudioNode,
  target: SafeAudioNode | AudioDestinationNode | MockAudioDestinationNode,
): void {
  const node = source as unknown as { connect: (dest: unknown) => unknown };
  node.connect(target);
}

export function createSafeAudioContext(): SafeAudioContext {
  if (typeof window !== "undefined") {
    const win = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioCtx = win.AudioContext || win.webkitAudioContext;
    if (AudioCtx) {
      try {
        return new AudioCtx();
      } catch {
        return new MockAudioContext();
      }
    }
  }
  if (typeof globalThis !== "undefined") {
    const glob = globalThis as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioCtx = glob.AudioContext || glob.webkitAudioContext;
    if (AudioCtx) {
      try {
        return new AudioCtx();
      } catch {
        return new MockAudioContext();
      }
    }
  }
  return new MockAudioContext();
}
