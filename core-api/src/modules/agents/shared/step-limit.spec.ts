import { stepLimit } from './step-limit';

describe('stepLimit', () => {
  const prepare = (stepNumber: number, instructions?: string) =>
    stepLimit(3).prepareStep!({ stepNumber, instructions } as any);

  it('leaves the steps before the last one untouched', () => {
    expect(prepare(0, 'sys')).toEqual({});
    expect(prepare(1, 'sys')).toEqual({});
  });

  it('turns tools off on the last step and keeps the system prompt', () => {
    expect(prepare(2, 'sys')).toEqual({
      toolChoice: 'none',
      instructions: [
        { role: 'system', content: 'sys' },
        { role: 'system', content: expect.stringContaining('Step limit') },
      ],
    });
  });

  it('stops after maxSteps steps', () => {
    const { stopWhen } = stepLimit(3);
    expect(stopWhen({ steps: [{}, {}] } as any)).toBe(false);
    expect(stopWhen({ steps: [{}, {}, {}] } as any)).toBe(true);
  });

  it('omits the summary step when forceSummary is off', () => {
    const limit = stepLimit(3, { forceSummary: false });
    expect(limit.prepareStep).toBeUndefined();
    expect(limit.stopWhen({ steps: [{}, {}, {}] } as any)).toBe(true);
  });
});
