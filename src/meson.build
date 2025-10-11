pkgdatadir = get_option('datadir') / meson.project_name()
gnome = import('gnome')

# Core is now JavaScript (no TypeScript compilation needed)
message('✅ Core uses JavaScript - no compilation required')

data_res = gnome.compile_resources('com.odnoyko.valot.data',
  'com.odnoyko.valot.data.gresource.xml',
  gresource_bundle: true,
  install: true,
  install_dir: pkgdatadir,
)

bin_conf = configuration_data()
bin_conf.set('GJS', find_program('gjs').full_path())
bin_conf.set('PACKAGE_VERSION', meson.project_version())
bin_conf.set('PACKAGE_NAME', meson.project_name())
bin_conf.set('APPLICATION_ID', application_id)
bin_conf.set('prefix', get_option('prefix'))
bin_conf.set('libdir', get_option('prefix') / get_option('libdir'))
bin_conf.set('datadir', get_option('prefix') / get_option('datadir'))
bin_conf.set('pkgdatadir', get_option('prefix') / get_option('datadir') / meson.project_name())
bin_conf.set('resource_path', '/com/odnoyko/valot')

# Generate config.js with version info
config_js = configure_file(
  input: 'config.js.in',
  output: 'config.js',
  configuration: bin_conf,
)

src_res = gnome.compile_resources('com.odnoyko.valot.src',
  'com.odnoyko.valot.src.gresource.xml',
  gresource_bundle: true,
  install: true,
  install_dir: pkgdatadir,
  dependencies: [config_js],
  source_dir: meson.current_source_dir(),
)

configure_file(
  input: 'com.odnoyko.valot.in',
  output: 'com.odnoyko.valot',
  configuration: bin_conf,
  install: true,
  install_dir: get_option('bindir')
)
