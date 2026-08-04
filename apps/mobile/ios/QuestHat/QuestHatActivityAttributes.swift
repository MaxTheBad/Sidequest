import ActivityKit
import Foundation

struct QuestHatActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    // Unix seconds keep the server-driven APNs payload unambiguous.
    var startsAt: Double
    var status: String
  }

  var questId: String
  var title: String
  var location: String
}
