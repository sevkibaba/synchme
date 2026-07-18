import React from 'react';
import renderer, { act } from 'react-test-renderer';
import HostScreen from '../src/screens/HostScreen';

describe('HostScreen', () => {
  it('renders correctly without crashing', async () => {
    let tree: any;
    await act(async () => {
      tree = renderer.create(<HostScreen onNavigate={jest.fn()} />);
    });
    expect(tree.toJSON()).toBeTruthy();
  });
});
