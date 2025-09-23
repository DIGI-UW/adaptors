import { stateStore } from '../src/Adaptor.js';

describe('stateStore', () => {
  it('exposes load/save/destroy operations', () => {
    expect(typeof stateStore.load).toBe('function');
    expect(typeof stateStore.save).toBe('function');
    expect(typeof stateStore.destroy).toBe('function');
  });
});



