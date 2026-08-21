import ActivityKit
import SwiftUI
import WidgetKit

@main
struct QuestHatLiveActivityBundle: WidgetBundle {
  var body: some Widget {
    QuestHatLiveActivityWidget()
  }
}

struct QuestHatLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: QuestHatActivityAttributes.self) { context in
      Link(destination: questURL(context.attributes.questId)) {
        HStack(spacing: 12) {
          questMark
          VStack(alignment: .leading, spacing: 4) {
            Text(context.state.status == "started" ? "STARTED" : "STARTING SOON")
              .font(.caption2.weight(.black))
              .tracking(1.1)
              .foregroundStyle(Color(red: 0.43, green: 0.68, blue: 0.76))
            Text(context.attributes.title)
              .font(.headline.weight(.bold))
              .lineLimit(2)
            Label(context.attributes.location, systemImage: "location.fill")
              .font(.caption)
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
          Spacer(minLength: 8)
          countdown(to: Date(timeIntervalSince1970: context.state.startsAt), compact: false)
        }
        .padding(16)
        .activityBackgroundTint(Color(red: 0.06, green: 0.07, blue: 0.11))
        .activitySystemActionForegroundColor(.white)
      }
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          questMark
        }
        DynamicIslandExpandedRegion(.trailing) {
          countdown(to: Date(timeIntervalSince1970: context.state.startsAt), compact: true)
        }
        DynamicIslandExpandedRegion(.bottom) {
          Link(destination: questURL(context.attributes.questId)) {
            VStack(alignment: .leading, spacing: 3) {
              Text(context.attributes.title)
                .font(.headline.weight(.bold))
                .lineLimit(1)
              Label(context.attributes.location, systemImage: "location.fill")
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
          }
        }
      } compactLeading: {
        compactStatusMark(status: context.state.status)
      } compactTrailing: {
        compactCountdown(
          to: Date(timeIntervalSince1970: context.state.startsAt),
          status: context.state.status
        )
      } minimal: {
        compactQuestMark
      }
      .widgetURL(questURL(context.attributes.questId))
      .keylineTint(Color(red: 0.43, green: 0.68, blue: 0.76))
    }
  }

  private var questMark: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 13)
        .fill(Color.white.opacity(0.96))
      Image("QuestHatMark")
        .resizable()
        .scaledToFit()
        .padding(5)
    }
    .frame(width: 44, height: 44)
  }

  private var compactQuestMark: some View {
    Image("QuestHatMark")
      .resizable()
      .scaledToFit()
      .frame(width: 22, height: 22)
  }

  private func compactStatusMark(status: String) -> some View {
    HStack(spacing: 4) {
      Image("QuestHatMark")
        .resizable()
        .scaledToFit()
        .frame(width: 18, height: 18)
      Text(status == "started" ? "LIVE" : "SOON")
        .font(.system(size: 9, weight: .black, design: .rounded))
        .tracking(0.5)
        .foregroundStyle(Color(red: 0.61, green: 0.85, blue: 0.89))
        .lineLimit(1)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(status == "started" ? "Quest is live" : "Quest starting soon")
  }

  private func compactCountdown(to date: Date, status: String) -> some View {
    VStack(alignment: .trailing, spacing: -1) {
      Text(status == "started" || date <= Date() ? "HAPPENING" : "STARTS")
        .font(.system(size: 7, weight: .bold, design: .rounded))
        .tracking(0.35)
        .foregroundStyle(Color(red: 0.43, green: 0.68, blue: 0.76))
        .lineLimit(1)
      countdown(to: date, compact: true)
    }
    .accessibilityElement(children: .combine)
  }

  @ViewBuilder
  private func countdown(to date: Date, compact: Bool) -> some View {
    if date > Date() {
      Text(timerInterval: Date()...date, countsDown: true)
        .font(compact ? .caption2.monospacedDigit().weight(.bold) : .title3.monospacedDigit().weight(.black))
        .foregroundStyle(.white)
        .multilineTextAlignment(.trailing)
    } else {
      Text("NOW")
        .font(compact ? .caption2.weight(.black) : .title3.weight(.black))
        .foregroundStyle(Color(red: 0.61, green: 0.85, blue: 0.89))
    }
  }

  private func questURL(_ questId: String) -> URL {
    URL(string: "questhat://listing/\(questId)")!
  }
}
