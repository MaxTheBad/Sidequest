Pod::Spec.new do |s|
  s.name           = 'QuestHatApplePlaces'
  s.version        = '1.0.0'
  s.summary        = 'Native Apple Maps place search for QuestHat.'
  s.description    = 'Searches Apple Maps once per explicit host action using MKLocalSearch.'
  s.license        = { :type => 'MIT' }
  s.author         = 'QuestHat'
  s.homepage       = 'https://questhat.com'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MapKit', 'Contacts'
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
