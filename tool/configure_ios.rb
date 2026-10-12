require 'xcodeproj'
require 'fileutils'
root = File.expand_path('..', __dir__)
project = Xcodeproj::Project.open(File.join(root, 'ios/Runner.xcodeproj'))
runner = project.targets.find { |target| target.name == 'Runner' }
abort 'Flutter Runner missing' unless runner
runner_group = project.main_group.find_subpath('Runner', false)
shared_group = project.main_group.find_subpath('Shared', true)
shared_group.set_source_tree('<group>'); shared_group.set_path('Shared')
%w[BPAPlatform.swift CardReader.swift SecureStore.swift].each do |name|
  ref = runner_group.files.find { |file| file.path == name } || runner_group.new_file(name)
  runner.source_build_phase.add_file_reference(ref, true)
end
shared = %w[WidgetStore.swift WidgetRenderer.swift].map { |name| shared_group.files.find { |file| file.path == name } || shared_group.new_file(name) }
shared.each { |ref| runner.source_build_phase.add_file_reference(ref, true) }
widget = project.targets.find { |target| target.name == 'BPAWidgets' } || project.new_target(:app_extension, 'BPAWidgets', :ios, '17.0')
widget_group = project.main_group.find_subpath('BPAWidgets', true)
widget_group.set_source_tree('<group>'); widget_group.set_path('BPAWidgets')
ref = widget_group.files.find { |file| file.path == 'BPAWidgets.swift' } || widget_group.new_file('BPAWidgets.swift')
widget.source_build_phase.add_file_reference(ref, true)
shared.each { |file| widget.source_build_phase.add_file_reference(file, true) }
%w[SwiftUI.framework WidgetKit.framework AppIntents.framework UIKit.framework].each { |name| widget.add_system_framework(name) }
runner.add_dependency(widget) unless runner.dependencies.any? { |dependency| dependency.target == widget }
embed = runner.copy_files_build_phases.find { |phase| phase.name == 'Embed App Extensions' } || runner.new_copy_files_build_phase('Embed App Extensions')
embed.dst_subfolder_spec = '13'
embed.add_file_reference(widget.product_reference, true).settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
[runner, widget].each do |target|
  target.build_configurations.each do |config|
    config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
    config.build_settings['SWIFT_VERSION'] = '5.0'
    config.build_settings['TARGETED_DEVICE_FAMILY'] = '1'
    config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = target == runner ? 'vn.edu.phenikaa.bpa' : 'vn.edu.phenikaa.bpa.widgets'
    config.build_settings['CODE_SIGN_ENTITLEMENTS'] = target == runner ? 'Runner/Runner.entitlements' : 'BPAWidgets/BPAWidgets.entitlements'
    config.build_settings['DEVELOPMENT_TEAM'] = ENV['APPLE_TEAM_ID'] if ENV['APPLE_TEAM_ID']
    if ENV['RUNNER_PROFILE_UUID'] && ENV['WIDGET_PROFILE_UUID']
      config.build_settings['CODE_SIGN_STYLE'] = 'Manual'
      config.build_settings['CODE_SIGN_IDENTITY'] = 'Apple Distribution'
      config.build_settings['PROVISIONING_PROFILE_SPECIFIER'] = ENV[target == runner ? 'RUNNER_PROFILE_UUID' : 'WIDGET_PROFILE_UUID']
    end
  end
end
widget.build_configurations.each do |config|
  config.build_settings['INFOPLIST_FILE'] = 'BPAWidgets/Info.plist'
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'NO'
  config.build_settings['SKIP_INSTALL'] = 'YES'
  config.build_settings['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
  config.build_settings['MARKETING_VERSION'] = '1.6.0'
  config.build_settings['CURRENT_PROJECT_VERSION'] = ENV.fetch('BPA_BUILD_NUMBER', '51')
  config.build_settings['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
end
project.build_configurations.each { |config| config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0' }
assets = File.join(root, 'ios/WidgetAssets')
FileUtils.mkdir_p(assets)
Dir.glob(File.join(root, 'assets/tien_mon_premium/widget_overview/*')).each { |file| FileUtils.cp(file, assets) if File.file?(file) }
FileUtils.cp(File.join(root, 'assets/tien_mon_premium/fonts/FzCoTrang.ttf'), assets)
folder = project.main_group.files.find { |file| file.path == 'WidgetAssets' } || project.main_group.new_file('WidgetAssets')
folder.last_known_file_type = 'folder'
[runner, widget].each { |target| target.resources_build_phase.add_file_reference(folder, true) }
plist_path = File.join(root, 'ios/Runner/Info.plist')
plist = Xcodeproj::Plist.read_from_path(plist_path)
plist['CFBundleDisplayName'] = 'Better Phenikaa'
plist['NFCReaderUsageDescription'] = 'Quét thẻ sinh viên khi bạn chọn liên kết hoặc xác thực thẻ.'
plist['CFBundleURLTypes'] = [{ 'CFBundleURLName' => 'vn.edu.phenikaa.bpa', 'CFBundleURLSchemes' => ['bpa'] }]
plist['FlutterDeepLinkingEnabled'] = false
Xcodeproj::Plist.write_to_path(plist, plist_path)
project.save
puts 'Configured native bridges and the three-widget extension.'
