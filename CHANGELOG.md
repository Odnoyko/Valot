# Changelog

All notable changes to Valot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Future features and improvements will be listed here

---

## [0.2.4] - 2025-09-05

### 🚀 Major Features Added
- **Smart PDF Export System**: Implemented intelligent export system that tries PDF generation first, then gracefully falls back to HTML when PDF is unavailable (e.g., in Flatpak environments)
- **HTML Report Fallback**: Added comprehensive HTML export with browser print instructions for environments where direct PDF generation is not supported
- **Enhanced Error Tracking**: Added real-time progress dialogs, timeout handling, and detailed error categorization for PDF generation processes

### 🐛 Bug Fixes  
- **Removed Dead Cairo/Pango Code**: Eliminated non-functional Cairo/PangoCairo PDF export code that was causing confusion and potential conflicts
- **Fixed Flatpak PDF Export**: Resolved WebKit PDF generation issues in sandboxed Flatpak environments through smart fallback system
- **Improved Export Reliability**: Enhanced error handling prevents silent failures during PDF export attempts

### 🛠️ Technical Improvements
- **Refactored Export Architecture**: Created modular export system with `ReportExporter` coordinator, `ReportPDF`, and `ReportHTML` classes for better separation of concerns  
- **Renamed Files for Clarity**: Renamed `htmlTemplatePdfExporter.js` to `templatePDFGenerator.js` with clearer class names
- **Enhanced WebKit Integration**: Improved WebKit-based PDF generation with better print settings and page setup configuration
- **Progress Feedback**: Added visual progress indicators and real-time status updates during export operations

### 🎨 UI/UX Enhancements
- **Better Export Feedback**: Users now see progress dialogs with detailed status updates during PDF generation
- **Smart Success Messages**: Export completion dialogs adapt based on whether PDF or HTML fallback was used
- **Preserved Configuration Options**: All existing report configuration options (periods, filters, sections, templates) remain fully functional

### 🔧 Code Quality
- **Clean File Structure**: Organized export functionality into logical, maintainable modules
- **Comprehensive Logging**: Added detailed console logging for troubleshooting export issues
- **Resource Management**: Updated GResource manifest to include all new export modules
- **Maintained Template System**: Preserved existing template engine and customization capabilities

---

## [0.2.2] - 2025-09-04

### 🐛 Bug Fixes
- **Fixed PDF Export Dialog Issues**: Resolved GTK filesystem error preventing PDF report exports by improving file dialog initialization with better error handling
- **Enhanced Report Folder Management**: Added automatic creation of `Documents/Valot` folder for organized report storage
- **Improved File Dialog Stability**: Implemented fallback mechanisms for initial folder selection to prevent crashes during export operations

### 🚀 Improvements  
- **Better Export User Experience**: PDF export now defaults to dedicated Valot folder while allowing users to choose any destination
- **Robust Error Handling**: Added comprehensive error catching for file system operations during export workflow

---

## [0.2.1] - 2025-09-04

### 🐛 Bug Fixes
- **Fixed Template Path Issues**: Converted hardcoded absolute paths to GResource system for better portability across different environments and deployments
- **Enhanced Resource Loading**: Updated template engine to use packaged resources instead of filesystem paths, improving application stability

### 🛠️ Technical Improvements
- **Resource System Integration**: Added professional-report.html template to GResource manifest for proper packaging
- **Backward Compatibility**: Maintained support for both resource URIs and file paths in template loading system

---

## [0.2.0] - 2025-01-09

### 🐛 Bug Fixes
- **Fixed Project Icon Centering**: Resolved issue where project icons in the project list were not properly centered using Gtk.Grid with homogeneous properties
- **Fixed Report Page Icon**: Changed Reports sidebar icon from chart-line-symbolic to x-office-document-symbolic for better visual representation
- **Removed Button Font Styling**: Cleaned up green accent button styling for Add project, Add report, and Add client buttons

---

## [0.1.2] - 2025-09-03

### 🐛 Bug Fixes
- **Fixed critical bug**: Resolved critical issue affecting application stability

---

## [0.1.1] - 2025-01-09

### 🎯 Major Features Added
- **Task Stack Selection & Deletion**: Right-click on task stacks to select and delete entire groups of related tasks
- **Mixed Selection Support**: Select individual tasks and stacks simultaneously with accurate counting
- **Improved Stack Management**: Stacks remain collapsed during selection and deletion operations

### 🐛 Bug Fixes
- **Fixed Stack Selection on App Startup**: Resolved issue where collapsed stacks couldn't be selected/deleted until expanded at least once
- **Fixed Delete Key Handler**: Resolved Delete key not triggering deletion dialog by switching from `key-pressed` to `key-released` event handling
- **Fixed Event Propagation**: Prevented individual task selections from bubbling up to parent stack containers
- **Fixed Task Count Display**: Eliminated double-counting in delete dialogs when both individual tasks and their containing stacks were selected
- **Fixed Stack Tracking Buttons**: Removed redundant tracking buttons from individual tasks inside stacks while keeping stack-level controls
- **Fixed Icon State Synchronization**: Resolved tracking button icons not switching between play/stop states correctly
- **Fixed Timer Conflicts**: Eliminated multiple timer intervals running simultaneously causing performance issues
- **Fixed Header Timer Sync**: Resolved header timer not updating when tracking was active

### 🚀 Performance Improvements  
- **Optimized Task Lookup**: Stack selection now uses main task database instead of group cache for better reliability
- **Enhanced Event Handling**: Improved gesture event claiming to prevent conflicts between task and stack selections
- **Reduced Timer Overhead**: Consolidated multiple timer systems into single centralized tracking state manager

### 🛠️ Technical Improvements
- **Enhanced TaskRenderer Class**: Improved event isolation and gesture handling for both individual tasks and stacks
- **Improved Delete Logic**: Simplified deletion process by leveraging automatic task ID collection during stack selection
- **Better Debug Logging**: Added comprehensive console logging for troubleshooting selection and deletion issues
- **Event State Management**: Implemented proper GTK4 event state handling with `Gdk.EVENT_STOP` and `Gdk.EVENT_PROPAGATE`

### 🎨 UI/UX Enhancements
- **Visual Selection Feedback**: Clear blue highlighting for selected stacks and tasks
- **Accurate Delete Dialogs**: Delete confirmation shows precise task counts without duplicates
- **Consistent Button States**: All tracking buttons across the interface show correct play/stop icons
- **Real-time Updates**: Timer displays update correctly during active tracking sessions

### 🔧 Code Quality
- **Centralized State Management**: Continued improvements to `TrackingStateManager` for better coordination
- **Event Propagation Control**: Proper event claiming to prevent unwanted UI behavior
- **Database Query Optimization**: More efficient task filtering for stack operations
- **Error Handling**: Enhanced error logging and graceful failure handling

---

## [0.1.0] - Previous Release
- Initial application implementation
- Basic time tracking functionality
- Project and client management
- Task grouping and organization
- PDF report generation
- Chart visualizations