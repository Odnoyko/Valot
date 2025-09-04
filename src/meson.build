pkgdatadir = get_option('datadir') / meson.project_name()
gnome = import('gnome')

# Компилируем .blp в .ui
blueprints = custom_target('blueprints',
  input: files(
    'ui/window.blp',
  ),
  output: '.',
  command: [find_program('blueprint-compiler'), 'batch-compile', '@OUTPUT@', '@CURRENT_SOURCE_DIR@', '@INPUT@'],
)

data_res = gnome.compile_resources('com.odnoyko.valot.data',
  'com.odnoyko.valot.data.gresource.xml',
  gresource_bundle: true,
  install: true,
  install_dir: pkgdatadir,
  dependencies: blueprints,  # Add this line
)

bin_conf = configuration_data()
bin_conf.set('GJS', find_program('gjs').full_path())
bin_conf.set('PACKAGE_VERSION', meson.project_version())
bin_conf.set('PACKAGE_NAME', meson.project_name())
bin_conf.set('prefix', get_option('prefix'))
bin_conf.set('libdir', get_option('prefix') / get_option('libdir'))
bin_conf.set('datadir', get_option('prefix') / get_option('datadir'))
bin_conf.set('pkgdatadir', get_option('prefix') / get_option('datadir') / meson.project_name())
bin_conf.set('resource_path', '/com/odnoyko/valot')

# Generate config.js with version info
config_js = configure_file(
  input: 'js/global/config.js.in',
  output: 'config.js',
  configuration: bin_conf,
)

src_res = gnome.compile_resources('com.odnoyko.valot.src',
  'com.odnoyko.valot.src.gresource.xml',
  gresource_bundle: true,
  install: true,
  install_dir: pkgdatadir,
  dependencies: [config_js],
)

configure_file(
  input: 'com.odnoyko.valot.in',
  output: 'com.odnoyko.valot',
  configuration: bin_conf,
  install: true,
  install_dir: get_option('bindir')
)
