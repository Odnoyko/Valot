/**
 * Gesture Controller - Handles touch gestures for the application
 * Can be enabled/disabled via settings
 */

import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';

export class GestureController {
    constructor(window) {
        this.window = window;
        this.settings = new Gio.Settings({ schema: 'com.odnoyko.valot' });
        this.gestures = [];
    }

    /**
     * Check if gestures are enabled in settings
     * TODO: Add 'gestures-enabled' key to gschema.xml when implementing settings
     */
    isGesturesEnabled() {
        // Default: enabled (no setting yet)
        // Future: return this.settings.get_boolean('gestures-enabled');
        return true;
    }

    /**
     * Setup 2-finger swipe gesture for sidebar toggle
     */
    setupSidebarGesture(splitView) {
        if (!this.isGesturesEnabled()) {
            console.log('Gestures disabled in settings');
            return;
        }

        // Use Adwaita's built-in swipe tracker for the split view
        // This is the proper way to handle gestures in Adw.OverlaySplitView
        try {
            const swipeTracker = new Adw.SwipeTracker({
                swipeable: splitView,
                allow_mouse_drag: true,
                enabled: true,
            });

            let initialSidebarState = false;

            swipeTracker.connect('begin-swipe', () => {
                initialSidebarState = splitView.get_show_sidebar();
                console.log('Swipe begin - sidebar currently:', initialSidebarState ? 'open' : 'closed');
            });

            swipeTracker.connect('update-swipe', (tracker, progress) => {
                // Progress goes from 0 to 1
                // We can use this to show intermediate states if needed
                console.log(`Swipe progress: ${progress}`);
            });

            swipeTracker.connect('end-swipe', (tracker, velocity, to) => {
                console.log(`Swipe end - velocity: ${velocity}, to: ${to}`);

                // Toggle based on swipe direction
                // If swiping right (positive velocity) and sidebar is closed, open it
                // If swiping left (negative velocity) and sidebar is open, close it
                if (velocity > 0.5 && !initialSidebarState) {
                    console.log('→ Opening sidebar');
                    splitView.set_show_sidebar(true);
                } else if (velocity < -0.5 && initialSidebarState) {
                    console.log('← Closing sidebar');
                    splitView.set_show_sidebar(false);
                }
            });

            this.gestures.push(swipeTracker);
            console.log('✅ Sidebar swipe gesture enabled (Adwaita SwipeTracker)');
        } catch (error) {
            console.error('Failed to setup swipe tracker:', error);
        }
    }

    /**
     * Setup all application gestures
     */
    setupAllGestures() {
        if (!this.isGesturesEnabled()) {
            console.log('⚠️ Gestures are disabled in settings');
            return;
        }

        // Setup sidebar gesture if split view exists
        if (this.window.splitView) {
            this.setupSidebarGesture(this.window.splitView);
        }

        // Future: Add more gestures here
        // - 3-finger swipe for page navigation
        // - Pinch to zoom charts
        // etc.
    }

    /**
     * Cleanup all gestures
     */
    cleanup() {
        this.gestures.forEach(gesture => {
            const widget = gesture.get_widget();
            if (widget) {
                widget.remove_controller(gesture);
            }
        });
        this.gestures = [];
    }

    /**
     * Reload gestures (useful when settings change)
     */
    reload() {
        this.cleanup();
        this.setupAllGestures();
    }
}
