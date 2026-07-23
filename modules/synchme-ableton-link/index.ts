import SynchmeAbletonLinkModule from './src/SynchmeAbletonLinkModule';

export const AbletonLink = {
  openSettings: () => SynchmeAbletonLinkModule.openSettings(),
  getTempo: () => SynchmeAbletonLinkModule.getTempo(),
  setTempo: (bpm: number) => SynchmeAbletonLinkModule.setTempo(bpm),
  getBeatTime: () => SynchmeAbletonLinkModule.getBeatTime(),
  isConnected: () => SynchmeAbletonLinkModule.isConnected(),
  isEnabled: () => SynchmeAbletonLinkModule.isEnabled(),
};
