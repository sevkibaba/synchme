import ExpoModulesCore

public class SynchmeAbletonLinkModule: Module {
  private var linkRef: ABLLinkRef?
  
  public func definition() -> ModuleDefinition {
    Name("SynchmeAbletonLink")
    
    OnCreate {
      self.linkRef = ABLLinkNew(120.0)
    }
    
    OnDestroy {
      if let ref = self.linkRef {
        ABLLinkDelete(ref)
        self.linkRef = nil
      }
    }
    
    Function("openSettings") { () -> Void in
      DispatchQueue.main.async {
        guard let ref = self.linkRef,
              let currentVC = self.appContext?.utilities?.currentViewController() else { return }
        
        if let settingsVC = ABLLinkSettingsViewController.instance(ref) {
          currentVC.present(settingsVC, animated: true, completion: nil)
        }
      }
    }
    
    Function("getTempo") { () -> Double in
      guard let ref = self.linkRef else { return 120.0 }
      let state = ABLLinkCaptureAppSessionState(ref)
      return ABLLinkGetTempo(state)
    }
    
    Function("setTempo") { (bpm: Double) -> Void in
      guard let ref = self.linkRef else { return }
      let state = ABLLinkCaptureAppSessionState(ref)
      let hostTime = mach_absolute_time()
      ABLLinkSetTempo(state, bpm, hostTime)
      ABLLinkCommitAppSessionState(ref, state)
    }
    
    Function("getBeatTime") { () -> Double in
      guard let ref = self.linkRef else { return 0.0 }
      let state = ABLLinkCaptureAppSessionState(ref)
      let hostTime = mach_absolute_time()
      return ABLLinkBeatAtTime(state, hostTime, 4.0)
    }
    
    Function("isConnected") { () -> Bool in
      guard let ref = self.linkRef else { return false }
      return ABLLinkIsConnected(ref)
    }
    
    Function("isEnabled") { () -> Bool in
      guard let ref = self.linkRef else { return false }
      return ABLLinkIsEnabled(ref)
    }
  }
}
