import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

/**
 * Factory for creating reusable UI components with consistent styling
 */
export class WidgetFactory {

    /**
     * Creates a standardized tracking widget box
     * Used in Tasks, Projects, Clients, and Reports pages
     */
    static createTrackingWidget(config = {}) {
        const {
            taskPlaceholder = 'Task name',
            onTaskInputChanged = null,
            onProjectClick = null,
            onClientClick = null,
            onTrackClick = null,
            showTimeDisplay = true
        } = config;

        const trackingWidget = new Gtk.Box({
            spacing: 8,
            hexpand: true,
            hexpand_set: true,
            margin_end: 30
        });

        // Task name entry
        const taskNameEntry = new Gtk.Entry({
            placeholder_text: taskPlaceholder,
            hexpand: true,
            hexpand_set: true
        });

        if (onTaskInputChanged) {
            taskNameEntry.connect('changed', onTaskInputChanged);
        }

        // Project button
        const projectButton = new Gtk.Button({
            icon_name: 'folder-symbolic',
            css_classes: ['flat'],
            tooltip_text: 'Project',
            width_request: 36,
            height_request: 36
        });

        if (onProjectClick) {
            projectButton.connect('clicked', onProjectClick);
        }

        // Client button
        const clientButton = new Gtk.Button({
            icon_name: 'contact-new-symbolic',
            css_classes: ['flat'],
            tooltip_text: 'Client',
            width_request: 36,
            height_request: 36
        });

        if (onClientClick) {
            clientButton.connect('clicked', onClientClick);
        }

        // Time display
        let timeLabel = null;
        if (showTimeDisplay) {
            timeLabel = new Gtk.Label({
                label: '00:00:00',
                css_classes: ['title-4'],
                margin_start: 8
            });
        }

        // Track button
        const trackButton = new Gtk.Button({
            icon_name: 'media-playback-start-symbolic',
            css_classes: ['suggested-action', 'circular'],
            tooltip_text: 'Start tracking'
        });

        if (onTrackClick) {
            trackButton.connect('clicked', onTrackClick);
        }

        // Assemble widget
        trackingWidget.append(taskNameEntry);
        trackingWidget.append(projectButton);
        trackingWidget.append(clientButton);

        if (timeLabel) {
            trackingWidget.append(timeLabel);
        }

        trackingWidget.append(trackButton);

        return {
            widget: trackingWidget,
            taskNameEntry,
            projectButton,
            clientButton,
            timeLabel,
            trackButton
        };
    }

    /**
     * Creates a standardized search and add box
     * Used in Projects and Clients pages
     */
    static createSearchAddBox(config = {}) {
        const {
            searchPlaceholder = 'Search...',
            addButtonLabel = 'Add',
            addButtonIcon = 'list-add-symbolic',
            onSearchChanged = null,
            onAddClick = null
        } = config;

        const searchAddBox = new Gtk.Box({
            spacing: 0,
            margin_bottom: 12,
            css_classes: ['linked']
        });

        const searchEntry = new Gtk.SearchEntry({
            placeholder_text: searchPlaceholder,
            hexpand: true
        });

        if (onSearchChanged) {
            searchEntry.connect('search-changed', onSearchChanged);
        }

        const addButton = new Gtk.Button({
            tooltip_text: `Add ${addButtonLabel}`,
            css_classes: ['flat']
        });

        const addButtonBox = new Gtk.Box({
            spacing: 6,
            halign: Gtk.Align.CENTER
        });

        addButtonBox.append(new Gtk.Label({
            label: addButtonLabel
        }));

        addButtonBox.append(new Gtk.Image({
            icon_name: addButtonIcon
        }));

        addButton.set_child(addButtonBox);

        if (onAddClick) {
            addButton.connect('clicked', onAddClick);
        }

        searchAddBox.append(searchEntry);
        searchAddBox.append(addButton);

        return {
            widget: searchAddBox,
            searchEntry,
            addButton
        };
    }

    /**
     * Creates a standardized pagination box
     * Used across multiple pages
     */
    static createPaginationBox(config = {}) {
        const {
            onPreviousClick = null,
            onNextClick = null
        } = config;

        const paginationBox = new Gtk.Box({
            halign: Gtk.Align.CENTER,
            spacing: 6
        });

        const prevButton = new Gtk.Button({
            label: 'Previous',
            sensitive: false
        });

        const pageInfo = new Gtk.Label({
            label: 'Page 1 of 1',
            margin_start: 12,
            margin_end: 12
        });

        const nextButton = new Gtk.Button({
            label: 'Next',
            sensitive: false
        });

        if (onPreviousClick) {
            prevButton.connect('clicked', onPreviousClick);
        }

        if (onNextClick) {
            nextButton.connect('clicked', onNextClick);
        }

        paginationBox.append(prevButton);
        paginationBox.append(pageInfo);
        paginationBox.append(nextButton);

        return {
            widget: paginationBox,
            prevButton,
            pageInfo,
            nextButton
        };
    }

    /**
     * Creates a circular color button with project color
     */
    static createProjectColorButton(project, onClick = null) {
        const button = new Gtk.Button({
            width_request: 36,
            height_request: 36,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            css_classes: ['project-icon-button', 'flat'],
            tooltip_text: 'Click to change color and icon'
        });

        this.applyProjectButtonStyle(button, project);

        if (onClick) {
            button.connect('clicked', onClick);
        }

        return button;
    }

    /**
     * Applies consistent styling to project buttons
     */
    static applyProjectButtonStyle(button, project) {
        const provider = new Gtk.CssProvider();
        const iconColor = this.calculateProjectIconColor(project);

        provider.load_from_string(`
            .project-icon-button {
                background-color: ${project.color};
                border-radius: 50%;
                color: ${iconColor};
                min-width: 36px;
                min-height: 36px;
                border: 1px solid alpha(@borders, 0.1);
            }
            .project-icon-button:hover {
                filter: brightness(1.1);
            }
        `);

        button.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    }

    /**
     * Creates project icon widget (emoji or regular icon)
     */
    static createProjectIconWidget(project) {
        let iconWidget;

        if (project.icon && project.icon.startsWith('emoji:')) {
            const emoji = project.icon.substring(6);
            iconWidget = new Gtk.Label({
                label: emoji,
                css_classes: ['emoji-display']
            });
        } else {
            iconWidget = new Gtk.Image({
                icon_name: project.icon || 'folder-symbolic',
                pixel_size: 16
            });
        }

        return iconWidget;
    }

    /**
     * Creates a colored dot indicator for projects
     */
    static createProjectDot(projectColor, cssClass = 'project-dot') {
        const dotLabel = new Gtk.Label({
            label: '●',
            css_classes: [cssClass]
        });

        const dotCss = `
            .${cssClass} {
                color: ${projectColor};
                font-size: 12px;
                margin-end: 6px;
            }
        `;

        const dotProvider = new Gtk.CssProvider();
        dotProvider.load_from_string(dotCss);
        dotLabel.get_style_context().add_provider(dotProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

        return dotLabel;
    }

    /**
     * Creates a standardized suffix box with separate time and money labels plus buttons
     */
    static createTaskSuffixBox(config = {}) {
        const {
            timeText = '',
            moneyText = '',
            showEditButton = true,
            showTrackButton = true,
            onEditClick = null,
            onTrackClick = null,
            css_classes = ['caption', 'dim-label']
        } = config;

        const suffixBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.END
        });

        // Money label - separate from time label, appears first (before time)
        const moneyLabel = new Gtk.Label({
            label: moneyText || '',
            css_classes: ['caption', 'dim-label'], // Always dim styling, never turns green
            halign: Gtk.Align.END,
            visible: moneyText ? true : false // Only show if there's money text
        });
        suffixBox.append(moneyLabel);

        // Time label - always create one, even if timeText is empty
        // (will be filled in by tracking state manager during real-time updates)
        const timeLabel = new Gtk.Label({
            label: timeText || '', // Use timeText if provided, otherwise empty
            css_classes,
            halign: Gtk.Align.END,
            use_markup: true // Enable markup for colored dots
        });
        suffixBox.append(timeLabel);

        // Button container
        const buttonBox = new Gtk.Box({
            spacing: 6
        });

        // Edit button
        if (showEditButton) {
            const editBtn = new Gtk.Button({
                icon_name: 'document-edit-symbolic',
                css_classes: ['flat'],
                tooltip_text: 'Edit Task'
            });

            if (onEditClick) {
                editBtn.connect('clicked', onEditClick);
            }

            buttonBox.append(editBtn);
        }

        // Track button
        if (showTrackButton) {
            const trackBtn = new Gtk.Button({
                icon_name: 'media-playback-start-symbolic',
                css_classes: ['flat'],
                tooltip_text: 'Start Tracking'
            });

            if (onTrackClick) {
                trackBtn.connect('clicked', onTrackClick);
            }

            // Apply gray color to the icon
            const icon = trackBtn.get_first_child();
            if (icon) {
                icon.add_css_class('dim-label');
            }

            buttonBox.append(trackBtn);
        }

        suffixBox.append(buttonBox);
        return { suffixBox, buttonBox, timeLabel, moneyLabel };
    }

    /**
     * Calculates appropriate icon color based on project color
     */
    static calculateProjectIconColor(project) {
        const iconColorMode = project.icon_color_mode || 'auto';

        if (iconColorMode === 'dark') {
            return 'black';
        } else if (iconColorMode === 'light') {
            return 'white';
        } else {
            // Auto mode - calculate based on color brightness
            return this.calculateColorBrightness(project.color) > 128 ? 'black' : 'white';
        }
    }

    /**
     * Calculates color brightness for determining icon color
     */
    static calculateColorBrightness(hexColor) {
        const hex = hexColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);

        return (r * 299 + g * 587 + b * 114) / 1000;
    }

    /**
     * Creates a currency symbol mapping
     */
    static getCurrencySymbol(currency) {
        const symbols = {
            'USD': '$',
            'EUR': '€',
            'GBP': '£',
            'JPY': '¥',
            'CAD': 'C$',
            'AUD': 'A$',
            'CHF': 'CHF',
            'CNY': '¥',
            'SEK': 'kr',
            'NZD': 'NZ$'
        };
        return symbols[currency] || currency;
    }

    /**
     * Creates a scrollable list container
     * Used for displaying lists in pages
     */
    static createScrollableList(config = {}) {
        const {
            cssClasses = ['boxed-list'],
            minContentHeight = 200,
            hscrollbarPolicy = Gtk.PolicyType.NEVER,
            vscrollbarPolicy = Gtk.PolicyType.AUTOMATIC
        } = config;

        const scrolledWindow = new Gtk.ScrolledWindow({
            hscrollbar_policy: hscrollbarPolicy,
            vscrollbar_policy: vscrollbarPolicy,
            min_content_height: minContentHeight,
            hexpand: true,
            vexpand: true
        });

        const listBox = new Gtk.ListBox({
            css_classes: cssClasses,
            selection_mode: Gtk.SelectionMode.NONE
        });

        scrolledWindow.set_child(listBox);

        return {
            widget: scrolledWindow,
            listBox: listBox,

            addRow: (row) => {
                listBox.append(row);
            },

            clearRows: () => {
                let child = listBox.get_first_child();
                while (child) {
                    const next = child.get_next_sibling();
                    listBox.remove(child);
                    child = next;
                }
            },

            getRows: () => {
                const rows = [];
                let child = listBox.get_first_child();
                while (child) {
                    rows.push(child);
                    child = child.get_next_sibling();
                }
                return rows;
            }
        };
    }
}