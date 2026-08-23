import ExpoModulesCore
import MapKit

struct AppleMapCenter: Record {
  @Field var latitude: Double = 0
  @Field var longitude: Double = 0
  @Field var delta: Double = 0.2
}

struct AppleMapPoint: Record {
  @Field var id: String = ""
  @Field var latitude: Double = 0
  @Field var longitude: Double = 0
  @Field var title: String = ""
  @Field var category: String = ""
  @Field var selected: Bool = false
  @Field var kind: String = "quest"
}

private final class QuestHatMapAnnotation: NSObject, MKAnnotation {
  let id: String
  let title: String?
  let category: String
  let selected: Bool
  let kind: String
  dynamic var coordinate: CLLocationCoordinate2D

  init(point: AppleMapPoint) {
    id = point.id
    title = point.title
    category = point.category
    selected = point.selected
    kind = point.kind
    coordinate = CLLocationCoordinate2D(latitude: point.latitude, longitude: point.longitude)
  }
}

final class QuestHatAppleMapView: ExpoView, MKMapViewDelegate {
  let onMarkerPress = EventDispatcher()
  private let mapView = MKMapView(frame: .zero)
  private var annotations: [QuestHatMapAnnotation] = []
  private var hasSetInitialCenter = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    mapView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    mapView.delegate = self
    mapView.mapType = .standard
    mapView.showsCompass = false
    mapView.showsScale = false
    mapView.isPitchEnabled = false
    mapView.isRotateEnabled = false
    addSubview(mapView)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    mapView.frame = bounds
  }

  func setInitialCenter(_ center: AppleMapCenter?) {
    guard !hasSetInitialCenter, let center, valid(latitude: center.latitude, longitude: center.longitude) else { return }
    hasSetInitialCenter = true
    focus(latitude: center.latitude, longitude: center.longitude, delta: center.delta)
  }

  func setPoints(_ points: [AppleMapPoint]) {
    mapView.removeAnnotations(annotations)
    annotations = points
      .filter { !$0.id.isEmpty && valid(latitude: $0.latitude, longitude: $0.longitude) }
      .map(QuestHatMapAnnotation.init)
    mapView.addAnnotations(annotations)
  }

  func focus(latitude: Double, longitude: Double, delta: Double) {
    guard valid(latitude: latitude, longitude: longitude) else { return }
    let span = max(0.005, min(90, delta))
    mapView.setRegion(
      MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
        span: MKCoordinateSpan(latitudeDelta: span, longitudeDelta: span)
      ),
      animated: true
    )
  }

  func fitAllPoints() {
    guard !annotations.isEmpty else { return }
    if annotations.count == 1, let point = annotations.first {
      focus(latitude: point.coordinate.latitude, longitude: point.coordinate.longitude, delta: 0.06)
      return
    }
    mapView.showAnnotations(annotations, animated: true)
    let current = mapView.region
    mapView.setRegion(
      MKCoordinateRegion(
        center: current.center,
        span: MKCoordinateSpan(
          latitudeDelta: min(90, max(0.02, current.span.latitudeDelta * 1.28)),
          longitudeDelta: min(180, max(0.02, current.span.longitudeDelta * 1.28))
        )
      ),
      animated: true
    )
  }

  func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
    guard let point = annotation as? QuestHatMapAnnotation else { return nil }
    let identifier = point.kind == "device" ? "QuestHatDevice" : "QuestHatQuest"
    let marker = (mapView.dequeueReusableAnnotationView(withIdentifier: identifier) as? MKMarkerAnnotationView)
      ?? MKMarkerAnnotationView(annotation: annotation, reuseIdentifier: identifier)
    marker.annotation = annotation
    marker.canShowCallout = false
    marker.displayPriority = point.selected ? .required : .defaultHigh
    if point.kind == "device" {
      marker.markerTintColor = UIColor(red: 0.10, green: 0.48, blue: 0.95, alpha: 1)
    } else if point.selected {
      marker.markerTintColor = UIColor(red: 0.61, green: 0.85, blue: 0.89, alpha: 1)
    } else {
      marker.markerTintColor = UIColor(red: 0.05, green: 0.37, blue: 0.45, alpha: 1)
    }
    marker.glyphTintColor = point.selected ? UIColor(red: 0.03, green: 0.18, blue: 0.23, alpha: 1) : .white
    marker.glyphText = point.kind == "device" ? "•" : "✦"
    marker.titleVisibility = .hidden
    marker.subtitleVisibility = .hidden
    return marker
  }

  func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
    guard let point = view.annotation as? QuestHatMapAnnotation else { return }
    mapView.deselectAnnotation(point, animated: false)
    if point.kind == "quest" {
      onMarkerPress(["id": point.id])
    }
  }

  private func valid(latitude: Double, longitude: Double) -> Bool {
    latitude.isFinite && longitude.isFinite && (-90...90).contains(latitude) && (-180...180).contains(longitude)
  }
}
