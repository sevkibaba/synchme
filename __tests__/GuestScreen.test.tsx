import React from 'react';
import renderer, { act } from 'react-test-renderer';
import GuestScreen from '../src/screens/GuestScreen';

describe('GuestScreen', () => {
  it('renders correctly without crashing', async () => {
    let tree: any;
    await act(async () => {
      tree = renderer.create(<GuestScreen onNavigate={jest.fn()} />);
    });
    expect(tree.toJSON()).toBeTruthy();
  });
});
