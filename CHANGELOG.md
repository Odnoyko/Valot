# Changelog

All notable changes to Valot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Future features and improvements will be listed here

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