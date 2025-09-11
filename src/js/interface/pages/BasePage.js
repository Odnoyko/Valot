import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import { TrackingWidget } from '../components/complex/TrackingWidget.js';
import { Button } from '../components/primitive/Button.js';
import { Label } from '../components/primitive/Label.js';

/**
 * Base class for all page components in Valot
 * Provides common page structure and functionality
 */
export class BasePage {
    constructor(config = {}) {
        const defaultConfig = {
            title: '',
            subtitle: '',
            showTrackingWidget: true,
            showRefreshButton: true,
            showSearchButton: false,
            actions: [],
            cssClasses: ['page']
        };

        
        this.app = config.app;
        this.parentWindow = config.parentWindow;
        this.isLoading = false;
        this.currentPage = 0;
        this.itemsPerPage = 10;
    }

    _createWidget() {
        const page = new Adw.ToolbarView();
        return page;
    }

    _initialize() {
        super._initialize();
        this._createHeader();
        this._createContent();
        this._createFooter();
    }

    _createHeader() {
        const headerBar = new Adw.HeaderBar();
        
        // Page title
        if (this.config.title) {
            headerBar.set_title_widget(new Gtk.Label({
                label: this.config.title,
                css_classes: ['heading']
            }));
        }

        // Leading actions (left side)
        this._createLeadingActions(headerBar);
        
        // Trailing actions (right side)  
        this._createTrailingActions(headerBar);

        this.widget.add_top_bar(headerBar);
    }

    _createLeadingActions(headerBar) {
        // Refresh button
        if (this.config.showRefreshButton) {
            this.refreshButton = new Button({
                iconName: 'view-refresh-symbolic',
                cssClasses: ['flat'],
                tooltipText: 'Refresh',
                onClick: () => this.refresh()
            });
            headerBar.pack_start(this.refreshButton.widget);
        }
    }

    _createTrailingActions(headerBar) {
        // Search button
        if (this.config.showSearchButton) {
            this.searchButton = new Button({
                iconName: 'system-search-symbolic',
                cssClasses: ['flat'],
                tooltipText: 'Search',
                onClick: () => this.toggleSearch()
            });
            headerBar.pack_end(this.searchButton.widget);
        }

        // Custom actions
        this.actions = [];
        this.config.actions.forEach((action, index) => {
            const actionButton = new Button({
                iconName: action.icon || action.iconName,
                label: action.label || '',
                cssClasses: action.cssClasses || ['flat'],
                tooltipText: action.tooltip || action.tooltipText || '',
                onClick: () => action.onClick(this)
            });
            this.actions.push(actionButton);
            headerBar.pack_end(actionButton.widget);
        });
    }

    _createContent() {
        const content = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });

        // Tracking widget (if enabled)
        if (this.config.showTrackingWidget) {
            this._createTrackingWidget(content);
        }

        // Page subtitle
        if (this.config.subtitle) {
            this.subtitleLabel = new Label({
                text: this.config.subtitle,
                cssClasses: ['subtitle'],
                halign: Gtk.Align.START
            });
            content.append(this.subtitleLabel.widget);
        }

        // Main content area (to be implemented by subclasses)
        const mainContent = this._createMainContent();
        if (mainContent) {
            content.append(mainContent);
        }

        // Loading state overlay
        this._createLoadingOverlay(content);

        this.widget.set_content(content);
    }

    _createTrackingWidget(container) {
        this.trackingWidget = new TrackingWidget({
            onTaskChanged: (text, widget) => this._onTrackingTaskChanged(text, widget),
            onProjectClick: (widget) => this._onTrackingProjectClick(widget),
            onClientClick: (widget) => this._onTrackingClientClick(widget),
            onTrackClick: (widget) => this._onTrackingClick(widget)
        });

        const trackingContainer = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            css_classes: ['tracking-widget-container']
        });

        trackingContainer.append(this.trackingWidget.widget);
        
        // Separator
        trackingContainer.append(new Gtk.Separator({
            orientation: Gtk.Orientation.HORIZONTAL,
            margin_top: 8,
            margin_bottom: 8
        }));

        container.append(trackingContainer);
    }

    _createMainContent() {
        // To be implemented by subclasses
        return new Gtk.Label({
            label: 'Override _createMainContent() in subclass',
            css_classes: ['dim-label']
        });
    }

    _createFooter() {
        // To be implemented by subclasses if needed
    }

    _createLoadingOverlay(container) {
        this.loadingOverlay = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            visible: false,
            css_classes: ['loading-overlay']
        });

        const spinner = new Gtk.Spinner({
            spinning: true,
            width_request: 32,
            height_request: 32
        });

        const loadingLabel = new Gtk.Label({
            label: 'Loading...',
            css_classes: ['dim-label']
        });

        this.loadingOverlay.append(spinner);
        this.loadingOverlay.append(loadingLabel);
        
        container.append(this.loadingOverlay);
    }

    // Event handlers for tracking widget (to be overridden)
    _onTrackingTaskChanged(text, widget) {
        this._emit('trackingTaskChanged', { text, widget });
    }

    _onTrackingProjectClick(widget) {
        this._emit('trackingProjectClick', { widget });
    }

    _onTrackingClientClick(widget) {
        this._emit('trackingClientClick', { widget });
    }

    _onTrackingClick(widget) {
        this._emit('trackingClick', { widget });
    }

    /**
     * Show loading state
     */
    showLoading(message = 'Loading...') {
        this.isLoading = true;
        if (this.loadingOverlay) {
            const label = this.loadingOverlay.get_last_child();
            if (label instanceof Gtk.Label) {
                label.set_text(message);
            }
            this.loadingOverlay.set_visible(true);
        }
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        this.isLoading = false;
        if (this.loadingOverlay) {
            this.loadingOverlay.set_visible(false);
        }
    }

    /**
     * Refresh page content - to be implemented by subclasses
     */
    refresh() {
        this._emit('refresh');
    }

    /**
     * Toggle search - to be implemented by subclasses
     */
    toggleSearch() {
        this._emit('searchToggle');
    }

    /**
     * Set page title
     */
    setTitle(title) {
        this.config.title = title;
        // Update header bar title if needed
    }

    /**
     * Set page subtitle
     */
    setSubtitle(subtitle) {
        this.config.subtitle = subtitle;
        if (this.subtitleLabel) {
            this.subtitleLabel.setText(subtitle);
        }
    }

    /**
     * Get tracking widget
     */
    getTrackingWidget() {
        return this.trackingWidget;
    }

    /**
     * Show error message
     */
    showError(title, message) {
        const dialog = new Adw.AlertDialog({
            heading: title,
            body: message
        });

        dialog.add_response('ok', 'OK');
        dialog.set_response_appearance('ok', Adw.ResponseAppearance.SUGGESTED);
        
        if (this.parentWindow) {
            dialog.present(this.parentWindow);
        }
    }

    /**
     * Show success message
     */
    showSuccess(message) {
        // Could implement toast notifications here
        console.log('Success:', message);
    }

    /**
     * Navigate to another page
     */
    navigate(pageId, params = {}) {
        this._emit('navigate', { pageId, params });
    }
}