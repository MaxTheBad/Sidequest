import ActivityKit
import Foundation
import React

@objc(QuestHatLiveActivity)
final class QuestHatLiveActivity: RCTEventEmitter {
  private var pushToStartTask: Task<Void, Never>?
  private var hasTokenListeners = false

  @objc override static func requiresMainQueueSetup() -> Bool {
    false
  }

  override func supportedEvents() -> [String]! {
    ["QuestHatPushToStartToken"]
  }

  override func startObserving() {
    hasTokenListeners = true
    observePushToStartTokens()
  }

  override func stopObserving() {
    hasTokenListeners = false
    pushToStartTask?.cancel()
    pushToStartTask = nil
  }

  @objc(getPushToStartToken:rejecter:)
  func getPushToStartToken(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 17.2, *) else {
      resolve(["supported": false, "environment": Self.apnsEnvironment])
      return
    }

    let token = Activity<QuestHatActivityAttributes>.pushToStartToken.map(Self.hexToken)
    var response: [String: Any] = [
      "supported": true,
      "environment": Self.apnsEnvironment,
    ]
    response["token"] = token ?? NSNull()
    resolve(response)
  }

  @objc(sync:title:startsAt:location:resolver:rejecter:)
  func sync(
    _ questId: String,
    title: String,
    startsAt: NSNumber,
    location: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 16.2, *) else {
      resolve(false)
      return
    }
    guard ActivityAuthorizationInfo().areActivitiesEnabled else {
      resolve(false)
      return
    }

    let startDate = Date(timeIntervalSince1970: startsAt.doubleValue / 1000)
    let attributes = QuestHatActivityAttributes(
      questId: questId,
      title: String(title.prefix(100)),
      location: String(location.prefix(100))
    )
    let state = QuestHatActivityAttributes.ContentState(
      startsAt: startDate.timeIntervalSince1970,
      status: "upcoming"
    )
    let content = ActivityContent(state: state, staleDate: startDate.addingTimeInterval(60 * 60))

    Task {
      do {
        for activity in Activity<QuestHatActivityAttributes>.activities where activity.attributes.questId != questId {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
        if let existing = Activity<QuestHatActivityAttributes>.activities.first(where: { $0.attributes.questId == questId }) {
          await existing.update(content)
          resolve(true)
          return
        }
        _ = try Activity.request(attributes: attributes, content: content, pushType: nil)
        resolve(true)
      } catch {
        reject("activity_start_failed", error.localizedDescription, error)
      }
    }
  }

  @objc(end:rejecter:)
  func end(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 16.2, *) else {
      resolve(false)
      return
    }
    Task {
      for activity in Activity<QuestHatActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      resolve(true)
    }
  }

  private func observePushToStartTokens() {
    guard #available(iOS 17.2, *), pushToStartTask == nil else { return }
    pushToStartTask = Task { [weak self] in
      if let token = Activity<QuestHatActivityAttributes>.pushToStartToken {
        await self?.emitPushToStartToken(token)
      }
      for await token in Activity<QuestHatActivityAttributes>.pushToStartTokenUpdates {
        guard !Task.isCancelled else { return }
        await self?.emitPushToStartToken(token)
      }
    }
  }

  @MainActor
  private func emitPushToStartToken(_ token: Data) {
    guard hasTokenListeners else { return }
    sendEvent(withName: "QuestHatPushToStartToken", body: [
      "supported": true,
      "environment": Self.apnsEnvironment,
      "token": Self.hexToken(token),
    ])
  }

  private static func hexToken(_ data: Data) -> String {
    data.map { String(format: "%02x", $0) }.joined()
  }

  private static var apnsEnvironment: String {
#if DEBUG
    "sandbox"
#else
    "production"
#endif
  }
}
