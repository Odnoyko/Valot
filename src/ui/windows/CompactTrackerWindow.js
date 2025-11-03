/**
 * Compact Tracker Window - minimal always-on-top tracker
 * Uses AdvancedTrackingWidget for full Core architecture integration
 */

import GObject from 'gi://GObject';
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import { AdvancedTrackingWidget } from 'resource:///com/odnoyko/valot/ui/components/complex/AdvancedTrackingWidget.js';

export const CompactTrackerWindow = GObject.registerClass({
    GTypeName: 'ValotCompactTrackerWindow',
}, class CompactTrackerWindow extends Adw.Window {
    constructor(application, coreBridge) {
        super({
            application,
            title: _('Compact Tracker'),
            default_width: 500,
            resizable: false,
        });

        this.coreBridge = coreBridge;
        this.shiftMode = false; // Track if opened with shift key

        // Build UI
        this._buildUI();

        // Set minimal size after UI is built
        this.set_size_request(500, -1);

        // Cleanup tracking widget when window is hidden (save resources)
        this.connect('hide', () => {
            if (this.trackingWidget && typeof this.trackingWidget.cleanup === 'function') {
                this.trackingWidget.cleanup();
            }
        });
        
        // Resubscribe when window is shown again
        this.connect('show', () => {
            if (this.trackingWidget && typeof this.trackingWidget.refresh === 'function') {
                this.trackingWidget.refresh();
            }
        });
        
        // Cleanup when window is destroyed
        this.connect('destroy', () => {
            this.cleanup();
        });
    }

    setShiftMode(shiftMode) {
        this.shiftMode = shiftMode;
    }

    _buildUI() {
        // Create WindowHandle for dragging
        const windowHandle = new Gtk.WindowHandle();

        // Main container
        const mainBox = new Gtk.Box({
            spacing: 8,
            margin_top: 4,
            margin_bottom: 4,
            margin_start: 8,
            margin_end: 8,
            valign: Gtk.Align.CENTER,
        });

        // Close/Open button
        this.closeOpenBtn = new Gtk.Button({
            icon_name: 'go-previous-symbolic',
            css_classes: ['flat'],
            tooltip_text: _('Close compact tracker and open main window'),
            width_request: 24,
            height_request: 24,
        });
        this.closeOpenBtn.connect('clicked', () => this._onCloseOpen());

        // Use AdvancedTrackingWidget for all tracking functionality
        this.trackingWidget = new AdvancedTrackingWidget(this.coreBridge, this);

        // Assemble UI
        mainBox.append(this.closeOpenBtn);
        mainBox.append(this.trackingWidget.widget);

        windowHandle.set_child(mainBox);
        this.set_content(windowHandle);
    }

    /**
     * Cleanup: cleanup tracking widget
     */
    cleanup() {
        if (this.trackingWidget && typeof this.trackingWidget.cleanup === 'function') {
            this.trackingWidget.cleanup();
            this.trackingWidget = null;
        }
    }

    _onCloseOpen() {
        if (this.shiftMode) {
            // In shift mode: just hide compact tracker
            this.set_visible(false);
        } else {
            // Normal mode: open main window and hide compact tracker
            if (this.application && typeof this.application.openMainApplication === 'function') {
                this.application.openMainApplication();
            }
            this.set_visible(false);
        }
    }
});
