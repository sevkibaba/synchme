import ExpoModulesCore
import AVFoundation

public class SynchmePcmPlayerModule: Module {
  private let audioEngine = AVAudioEngine()
  private let playerNode = AVAudioPlayerNode()
  
  private var audioFile: AVAudioFile?
  private var sampleRate: Double = 44100.0
  private var fileLengthFrames: AVAudioFramePosition = 0
  
  private var isPlaying = false
  private var currentPositionFrames: AVAudioFramePosition = 0
  
  public func definition() -> ModuleDefinition {
    Name("SynchmePcmPlayer")
    
    AsyncFunction("load") { (uriStr: String, promise: Promise) in
      do {
        let cleanUri = uriStr.replacingOccurrences(of: "file://", with: "")
        let url = URL(fileURLWithPath: cleanUri)
        
        self.playerNode.stop()
        self.isPlaying = false
        self.audioEngine.stop()
        
        let file = try AVAudioFile(forReading: url)
        self.audioFile = file
        self.sampleRate = file.fileFormat.sampleRate
        self.fileLengthFrames = file.length
        self.currentPositionFrames = 0
        
        if !self.audioEngine.attachedNodes.contains(self.playerNode) {
            self.audioEngine.attach(self.playerNode)
        }
        
        self.audioEngine.connect(self.playerNode, to: self.audioEngine.mainMixerNode, format: file.processingFormat)
        
        try self.audioEngine.start()
        
        let duration = Double(self.fileLengthFrames) / self.sampleRate
        promise.resolve(["success": true, "duration": duration])
      } catch {
        promise.reject("ERR_LOAD", error.localizedDescription)
      }
    }
    
    Function("play") { () -> Void in
      guard let file = self.audioFile else { return }
      if self.isPlaying { return }
      
      let framesLeft = self.fileLengthFrames - self.currentPositionFrames
      if framesLeft <= 0 { return }
      
      if !self.audioEngine.isRunning {
          try? self.audioEngine.start()
      }
      
      self.playerNode.scheduleSegment(
        file,
        startingFrame: self.currentPositionFrames,
        frameCount: AVAudioFrameCount(framesLeft),
        at: nil,
        completionHandler: nil
      )
      
      self.playerNode.play()
      self.isPlaying = true
    }
    
    Function("pause") { () -> Void in
      if !self.isPlaying { return }
      self.currentPositionFrames = self.getCurrentFramePosition()
      self.playerNode.stop() 
      self.isPlaying = false
    }
    
    Function("seekTo") { (positionSecs: Double) -> Void in
      guard let file = self.audioFile else { return }
      
      let targetFrame = AVAudioFramePosition(positionSecs * self.sampleRate)
      let safeFrame = max(0, min(targetFrame, self.fileLengthFrames))
      
      let wasPlaying = self.isPlaying
      self.playerNode.stop()
      self.isPlaying = false
      
      self.currentPositionFrames = safeFrame
      
      if wasPlaying {
          let framesLeft = self.fileLengthFrames - self.currentPositionFrames
          if framesLeft > 0 {
             if !self.audioEngine.isRunning {
                 try? self.audioEngine.start()
             }
             self.playerNode.scheduleSegment(
               file,
               startingFrame: self.currentPositionFrames,
               frameCount: AVAudioFrameCount(framesLeft),
               at: nil,
               completionHandler: nil
             )
             self.playerNode.play()
             self.isPlaying = true
          }
      }
    }
    
    Function("getCurrentTime") { () -> Double in
      return Double(self.getCurrentFramePosition()) / self.sampleRate
    }
    
    Function("isPlaying") { () -> Bool in
      return self.isPlaying
    }
  }
  
  private func getCurrentFramePosition() -> AVAudioFramePosition {
      if self.isPlaying, let nodeTime = self.playerNode.lastRenderTime, let playerTime = self.playerNode.playerTime(forNodeTime: nodeTime) {
          if playerTime.isSampleTimeValid {
              let pos = self.currentPositionFrames + AVAudioFramePosition(playerTime.sampleTime)
              return max(0, min(pos, self.fileLengthFrames))
          }
      }
      return max(0, self.currentPositionFrames)
  }
}
