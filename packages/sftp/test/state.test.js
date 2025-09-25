import { expect } from 'chai';
import { stateStore } from '../src/Adaptor.js';

describe('stateStore', () => {
  it('exposes load/save/destroy operations', () => {
    expect(stateStore.load).to.be.a('function');
    expect(stateStore.save).to.be.a('function');
    expect(stateStore.destroy).to.be.a('function');
  });
});



