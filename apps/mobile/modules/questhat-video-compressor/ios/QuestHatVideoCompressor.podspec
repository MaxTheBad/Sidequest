Pod::Spec.new do |s|
  s.name           = 'QuestHatVideoCompressor'
  s.version        = '1.0.0'
  s.summary        = 'High-quality video optimization for QuestHat uploads.'
  s.description    = 'Exports oversized videos with AVFoundation before upload.'
  s.license        = { :type => 'MIT' }
  s.author         = 'QuestHat'
  s.homepage       = 'https://questhat.com'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
