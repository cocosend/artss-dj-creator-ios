require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "ArtssAudio"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => ".git", :tag => "#{s.version}" }

  s.source_files = "{ios,cpp}/**/*.{h,hpp,mm,cpp}"
  s.private_header_files = "{ios,cpp}/**/*.{h,hpp}"
  s.frameworks = "AudioToolbox", "AVFAudio", "AVFoundation", "UIKit", "UniformTypeIdentifiers"
  s.resource_bundles = { "ARTSSAudioResources" => ["assets/*.wav"] }
  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++20",
    "GCC_ENABLE_CPP_EXCEPTIONS" => "YES",
    "HEADER_SEARCH_PATHS" => '$(inherited) "$(PODS_TARGET_SRCROOT)/cpp" "$(PODS_TARGET_SRCROOT)/cpp/core" "$(PODS_TARGET_SRCROOT)/ios"'
  }
  s.requires_arc = true

  install_modules_dependencies(s)
end
