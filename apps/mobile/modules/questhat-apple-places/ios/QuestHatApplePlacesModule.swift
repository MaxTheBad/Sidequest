import Contacts
import ExpoModulesCore
import MapKit

public final class QuestHatApplePlacesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("QuestHatApplePlaces")

    View(QuestHatAppleMapView.self) {
      Events("onMarkerPress")

      Prop("center") { (view, center: AppleMapCenter?) in
        view.setInitialCenter(center)
      }

      Prop("points") { (view, points: [AppleMapPoint]) in
        view.setPoints(points)
      }

      AsyncFunction("focusCoordinate") { (view: QuestHatAppleMapView, latitude: Double, longitude: Double, delta: Double) in
        view.focus(latitude: latitude, longitude: longitude, delta: delta)
      }

      AsyncFunction("fitAll") { (view: QuestHatAppleMapView) in
        view.fitAllPoints()
      }
    }

    AsyncFunction("search") { (query: String, countryName: String?, countryCode: String?, city: String?, latitude: Double?, longitude: Double?) async throws -> [[String: Any?]] in
      let cleanedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
      guard cleanedQuery.count >= 3 else {
        throw ApplePlacesError.invalidQuery
      }

      let request = MKLocalSearch.Request()
      let context = [
        cleanedQuery,
        self.contextPart(city, absentFrom: cleanedQuery),
        self.contextPart(countryName, absentFrom: cleanedQuery),
      ].compactMap { $0 }
      request.naturalLanguageQuery = context.joined(separator: ", ")
      request.resultTypes = [.address, .pointOfInterest]

      if let latitude, let longitude,
         latitude.isFinite, longitude.isFinite,
         (-90.0...90.0).contains(latitude), (-180.0...180.0).contains(longitude) {
        // A roughly city-scale region improves relevance without sending exact device coordinates.
        let roundedLatitude = (latitude * 100).rounded() / 100
        let roundedLongitude = (longitude * 100).rounded() / 100
        request.region = MKCoordinateRegion(
          center: CLLocationCoordinate2D(latitude: roundedLatitude, longitude: roundedLongitude),
          span: MKCoordinateSpan(latitudeDelta: 0.7, longitudeDelta: 0.7)
        )
      }

      let response = try await MKLocalSearch(request: request).start()
      var seen = Set<String>()
      return response.mapItems.prefix(12).compactMap { item in
        let placemark = item.placemark
        let address = self.formattedAddress(placemark)
        let name = item.name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let label: String
        if !name.isEmpty && !address.isEmpty && !address.lowercased().hasPrefix(name.lowercased()) {
          label = "\(name), \(address)"
        } else {
          label = address.isEmpty ? name : address
        }
        let normalized = label.lowercased()
        guard !label.isEmpty, !seen.contains(normalized) else { return nil }
        seen.insert(normalized)
        let resolvedCountryCode = (placemark.isoCountryCode ?? countryCode ?? "").uppercased()
        let locality = placemark.locality?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let state = placemark.administrativeArea?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let publicLabel: String
        if locality.isEmpty {
          publicLabel = ""
        } else if resolvedCountryCode == "US" && !state.isEmpty {
          publicLabel = "\(locality), \(state)"
        } else if resolvedCountryCode.isEmpty {
          publicLabel = locality
        } else {
          publicLabel = "\(locality), \(resolvedCountryCode)"
        }
        return [
          "id": normalized,
          "label": label,
          "publicLabel": publicLabel,
          "lat": placemark.coordinate.latitude,
          "lon": placemark.coordinate.longitude,
        ]
      }
    }
  }

  private func contextPart(_ value: String?, absentFrom query: String) -> String? {
    guard let cleaned = value?.trimmingCharacters(in: .whitespacesAndNewlines), !cleaned.isEmpty else { return nil }
    return query.range(of: cleaned, options: [.caseInsensitive, .diacriticInsensitive]) == nil ? cleaned : nil
  }

  private func formattedAddress(_ placemark: MKPlacemark) -> String {
    if let postalAddress = placemark.postalAddress {
      return CNPostalAddressFormatter.string(from: postalAddress, style: .mailingAddress)
        .replacingOccurrences(of: "\n", with: ", ")
        .replacingOccurrences(of: "  ", with: " ")
        .trimmingCharacters(in: .whitespacesAndNewlines)
    }
    return placemark.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  }
}

private enum ApplePlacesError: Error {
  case invalidQuery
}
