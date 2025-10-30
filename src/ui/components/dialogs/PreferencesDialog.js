import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { Config } from 'resource:///com/odnoyko/valot/config.js';
import { AccentColorManager } from 'resource:///com/odnoyko/valot/ui/windows/Application.js';
// TODO: Restore when migrated
// import { pomodoroManager } from 'resource:///com/odnoyko/valot/js/func/global/pomodoroManager.js';
import { CurrencyDialog } from 'resource:///com/odnoyko/valot/ui/components/complex/CurrencyDialog.js';
import { getAllCurrencies, getCurrencySymbol } from 'resource:///com/odnoyko/valot/data/currencies.js';
import { CarouselDialog } from 'resource:///com/odnoyko/valot/ui/components/dialogs/CarouselDialog.js';

export const PreferencesDialog = GObject.registerClass({
    GTypeName: 'PreferencesDialog',
}, class PreferencesDialog extends Adw.PreferencesWindow {
    
    _init(params = {}) {
        super._init({
            title: _('Preferences'),
            default_width: 600,
            default_height: 500,
            modal: true,
            ...params
        });

        this._setupPages();
    }

    _setupPages() {
        // About Page
        const aboutPage = new Adw.PreferencesPage({
            title: _('About'),
            icon_name: 'help-about-symbolic',
        });
        this._setupAboutPage(aboutPage);
        this.add(aboutPage);

        // Global Settings Page  
        const globalPage = new Adw.PreferencesPage({
            title: _('Global'),
            icon_name: 'preferences-system-symbolic',
        });
        this._setupGlobalPage(globalPage);
        this.add(globalPage);

        // Clients Page
        const clientsPage = new Adw.PreferencesPage({
            title: _('Clients'),
            icon_name: 'contact-new-symbolic',
        });
        this._setupClientsPage(clientsPage);
        this.add(clientsPage);

        // Integrations Page
        const integrationsPage = new Adw.PreferencesPage({
            title: _('Integrations'),
            icon_name: 'network-server-symbolic',
        });
        this._setupIntegrationsPage(integrationsPage);
        this.add(integrationsPage);

        // Extensions Page (only if extensions are available)
        this._setupExtensionsPage();
    }

    _setupAboutPage(page) {
        const aboutGroup = new Adw.PreferencesGroup();

        // Centered content box
        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            css_classes: ['about-content-box'],
        });

        // App icon
        const appIcon = new Gtk.Image({
            icon_name: 'com.odnoyko.valot',
            pixel_size: 128,
        });
        contentBox.append(appIcon);

        // App name
        const appName = new Gtk.Label({
            label: 'Valot',
            css_classes: ['title-1'],
        });
        contentBox.append(appName);

        // Author
        const author = new Gtk.Label({
            label: 'Vitaly Odnoyko',
            css_classes: ['subtitle-1'],
        });
        contentBox.append(author);

        // Version badge using existing template-badge style
        const versionLabel = new Gtk.Label({
            label: Config.VERSION,
            css_classes: ['template-badge'],
            halign: Gtk.Align.CENTER,
        });
        contentBox.append(versionLabel);

        // Small donate button
        const donateButton = new Gtk.Button({
            label: _('Donate'),
            css_classes: ['pill', 'suggested-action'],
        });

        donateButton.connect('clicked', () => {
            Gtk.show_uri(this, 'https://ko-fi.com/odnoyko', Gdk.CURRENT_TIME);
        });

        contentBox.append(donateButton);

        aboutGroup.add(contentBox);
        page.add(aboutGroup);

        // Additional info group with expandable rows
        const infoGroup = new Adw.PreferencesGroup();

        // Details row - links to git repository
        const detailsRow = new Adw.ActionRow({
            title: _('Details'),
            activatable: true,
        });
        detailsRow.add_suffix(new Gtk.Image({
            icon_name: 'go-next-symbolic',
            valign: Gtk.Align.CENTER,
        }));
        detailsRow.connect('activated', () => {
            this._showDetailsSubpage();
        });
        infoGroup.add(detailsRow);

        // Credits row  
        const creditsRow = new Adw.ActionRow({
            title: _('Credits'),
            activatable: true,
        });
        creditsRow.add_suffix(new Gtk.Image({
            icon_name: 'go-next-symbolic',
            valign: Gtk.Align.CENTER,
        }));
        creditsRow.connect('activated', () => {
            this._showCreditsSubpage();
        });
        infoGroup.add(creditsRow);

        // Legal row
        const legalRow = new Adw.ActionRow({
            title: _('Legal'),
            activatable: true,
        });
        legalRow.add_suffix(new Gtk.Image({
            icon_name: 'go-next-symbolic',
            valign: Gtk.Align.CENTER,
        }));
        legalRow.connect('activated', () => {
            this._showLegalSubpage();
        });
        infoGroup.add(legalRow);

        page.add(infoGroup);
    }

    _setupGlobalPage(page) {
        // Get settings for the entire page
        const settings = new Gio.Settings({ schema: 'com.odnoyko.valot' });
        
        // Appearance Group
        const appearanceGroup = new Adw.PreferencesGroup({
            title: _('Appearance'),
        });

        // Theme selector with toggle buttons
        const themeRow = new Adw.ActionRow({
            title: _('Theme'),
            subtitle: _('Choose your preferred theme'),
        });

        // Theme toggle buttons container
        const themeToggleBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            css_classes: ['linked'],
            valign: Gtk.Align.CENTER,
        });

        const autoButton = new Gtk.ToggleButton({
            icon_name: 'display-brightness-symbolic',
            tooltip_text: _('Auto'),
        });

        const lightButton = new Gtk.ToggleButton({
            icon_name: 'weather-clear-symbolic', 
            tooltip_text: _('Light'),
        });

        const darkButton = new Gtk.ToggleButton({
            icon_name: 'weather-clear-night-symbolic',
            tooltip_text: _('Dark'),
        });

        // Group the buttons so only one can be active
        lightButton.set_group(autoButton);
        darkButton.set_group(autoButton);
        
        themeToggleBox.append(autoButton);
        themeToggleBox.append(lightButton);
        themeToggleBox.append(darkButton);
        themeRow.add_suffix(themeToggleBox);
        appearanceGroup.add(themeRow);

        // Load saved theme preference and set initial state
        const savedTheme = settings.get_int('theme-preference');
        
        // Set initial button state
        switch (savedTheme) {
            case 0: // Auto
                autoButton.set_active(true);
                break;
            case 1: // Light
                lightButton.set_active(true);
                break;
            case 2: // Dark
                darkButton.set_active(true);
                break;
        }

        // Apply the saved theme immediately
        this._applyTheme(savedTheme);

        // Handle theme toggle
        autoButton.connect('toggled', () => {
            if (autoButton.get_active()) {
                settings.set_int('theme-preference', 0);
                this._applyTheme(0);
            }
        });

        lightButton.connect('toggled', () => {
            if (lightButton.get_active()) {
                settings.set_int('theme-preference', 1);
                this._applyTheme(1);
            }
        });

        darkButton.connect('toggled', () => {
            if (darkButton.get_active()) {
                settings.set_int('theme-preference', 2);
                this._applyTheme(2);
            }
        });

        // Accent color mode toggle
        const accentModeRow = new Adw.ActionRow({
            title: _('Accent Color'),
            subtitle: _('Choose system accent or custom color'),
        });

        // Toggle buttons container
        const toggleBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            css_classes: ['linked'],
            valign: Gtk.Align.CENTER,
        });

        const standardButton = new Gtk.ToggleButton({
            label: _('Standard'),
        });

        const customButton = new Gtk.ToggleButton({
            label: _('Custom'),
        });

        customButton.set_group(standardButton);
        
        toggleBox.append(standardButton);
        toggleBox.append(customButton);
        accentModeRow.add_suffix(toggleBox);
        appearanceGroup.add(accentModeRow);

        // Custom color picker row (initially hidden)
        const colorPickerRow = new Adw.ActionRow({
            title: _('Custom Color'),
            subtitle: _('Pick your preferred accent color'),
        });

        const colorButton = new Gtk.ColorButton({
            valign: Gtk.Align.CENTER,
        });
        colorPickerRow.add_suffix(colorButton);
        appearanceGroup.add(colorPickerRow);

        // Load saved settings
        const savedMode = settings.get_int('accent-mode');
        const savedColor = settings.get_string('accent-color');

        // Set initial state
        if (savedMode === 0) {
            standardButton.set_active(true);
            colorPickerRow.set_visible(false);
        } else {
            customButton.set_active(true);
            colorPickerRow.set_visible(true);
            // Always set a default color if none is saved or if parsing fails
            const rgba = new Gdk.RGBA();
            if (savedColor && rgba.parse(savedColor)) {
                colorButton.set_rgba(rgba);
            } else {
                // Set a default blue color if no valid saved color
                rgba.parse('#3584e4');
                colorButton.set_rgba(rgba);
            }
        }

        // Apply initial accent only if in custom mode
        if (savedMode === 1) {
            AccentColorManager.applyAccentMode(savedMode, savedColor);
        }

        // Handle mode toggle
        standardButton.connect('toggled', () => {
            if (standardButton.get_active()) {
                settings.set_int('accent-mode', 0);
                colorPickerRow.set_visible(false);
                AccentColorManager.applyAccentMode(0, '');
            }
        });

        customButton.connect('toggled', () => {
            if (customButton.get_active()) {
                settings.set_int('accent-mode', 1);
                colorPickerRow.set_visible(true);
                const rgba = colorButton.get_rgba();
                const colorString = rgba.to_string();
                settings.set_string('accent-color', colorString);
                AccentColorManager.applyAccentMode(1, colorString);
            }
        });

        // Handle color change
        colorButton.connect('color-set', () => {
            if (customButton.get_active()) {
                const rgba = colorButton.get_rgba();
                const colorString = rgba.to_string();
                settings.set_string('accent-color', colorString);
                AccentColorManager.applyAccentMode(1, colorString);
            }
        });

        page.add(appearanceGroup);

        // Behavior Group
        const behaviorGroup = new Adw.PreferencesGroup({
            title: _('Behavior'),
        });

        // Sidebar mode selector with toggle buttons
        const sidebarRow = new Adw.ActionRow({
            title: _('Sidebar'),
            subtitle: _('Choose sidebar behavior on launch'),
        });

        // Sidebar toggle buttons container
        const sidebarToggleBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            css_classes: ['linked'],
            valign: Gtk.Align.CENTER,
        });

        const openedButton = new Gtk.ToggleButton({
            label: _('Opened'),
            tooltip_text: _('Always open on launch'),
        });

        const closedButton = new Gtk.ToggleButton({
            label: _('Closed'),
            tooltip_text: _('Always closed on launch'),
        });

        const dynamicButton = new Gtk.ToggleButton({
            label: _('Dynamic'),
            tooltip_text: _('Remember last state'),
        });

        // Group the buttons so only one can be active
        closedButton.set_group(openedButton);
        dynamicButton.set_group(openedButton);

        sidebarToggleBox.append(openedButton);
        sidebarToggleBox.append(closedButton);
        sidebarToggleBox.append(dynamicButton);
        sidebarRow.add_suffix(sidebarToggleBox);
        behaviorGroup.add(sidebarRow);

        // Load saved sidebar mode preference and set initial state
        const sidebarMode = settings.get_int('sidebar-mode');
        if (sidebarMode === 0) {
            openedButton.set_active(true);
        } else if (sidebarMode === 1) {
            closedButton.set_active(true);
        } else if (sidebarMode === 2) {
            dynamicButton.set_active(true);
        }

        // Connect button signals
        openedButton.connect('toggled', () => {
            if (openedButton.get_active()) {
                settings.set_int('sidebar-mode', 0);
            }
        });

        closedButton.connect('toggled', () => {
            if (closedButton.get_active()) {
                settings.set_int('sidebar-mode', 1);
            }
        });

        dynamicButton.connect('toggled', () => {
            if (dynamicButton.get_active()) {
                settings.set_int('sidebar-mode', 2);
            }
        });

        page.add(behaviorGroup);

        // Pomodoro Group
        const pomodoroGroup = new Adw.PreferencesGroup({
            title: _('Pomodoro Timer'),
        });

        // Timer duration row
        const timerRow = new Adw.ActionRow({
            title: _('Timer Duration'),
            subtitle: _('Default pomodoro session length in minutes'),
        });

        const timerSpinButton = new Gtk.SpinButton({
            valign: Gtk.Align.CENTER,
            orientation: Gtk.Orientation.HORIZONTAL,
        });
        timerSpinButton.set_range(5, 120);
        timerSpinButton.set_increments(5, 15);

        // Load current value from config
        this._loadPomodoroConfig().then(config => {
            timerSpinButton.set_value(config.defaultMinutes || 20);
        });

        // Save value when changed
        timerSpinButton.connect('value-changed', () => {
            const newValue = timerSpinButton.get_value();
            this._savePomodoroConfig(newValue);
        });

        timerRow.add_suffix(timerSpinButton);

        pomodoroGroup.add(timerRow);
        page.add(pomodoroGroup);

        // Experimental Features Group
        const experimentalGroup = new Adw.PreferencesGroup({
            title: _('Experimental'),
            description: _('Enable experimental and unstable features'),
        });

        // Experimental features toggle
        const experimentalRow = new Adw.SwitchRow({
            title: _('Enable Experimental Features'),
            subtitle: _('Unlock extensions, addons, and other experimental functionality'),
        });

        // Load current setting
        experimentalRow.set_active(settings.get_boolean('experimental-features'));

        // Connect to settings
        experimentalRow.connect('notify::active', () => {
            const isEnabled = experimentalRow.get_active();
            settings.set_boolean('experimental-features', isEnabled);
            
            // If disabling, deactivate all extensions
            if (!isEnabled) {
                this._deactivateAllExtensions();
            }
            
            // Update extensions page visibility
            this._updateExtensionsPageVisibility();
        });

        experimentalGroup.add(experimentalRow);
        page.add(experimentalGroup);

        // Database group removed - moved to Integrations page

        // Welcome Info Group
        const welcomeGroup = new Adw.PreferencesGroup({
            title: _('Welcome Info'),
            description: _('View the app welcome tour and getting started guide'),
        });

        const welcomeRow = new Adw.ActionRow({
            title: _('Show Welcome Tour'),
            subtitle: _('View the introductory slides and features overview'),
        });

        const showWelcomeButton = new Gtk.Button({
            label: _('Show Tour'),
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER,
        });

        showWelcomeButton.connect('clicked', () => {
            CarouselDialog.show(this);
        });

        welcomeRow.add_suffix(showWelcomeButton);
        welcomeGroup.add(welcomeRow);
        page.add(welcomeGroup);

        // Compact Tracker Command Group
        const commandGroup = new Adw.PreferencesGroup({
            title: _('Compact Tracker Command'),
            description: _('Terminal command for launching compact tracker'),
        });

        const commandRow = new Adw.ActionRow({
            title: _('Terminal Command'),
            subtitle: _('Use this command for hotkeys or scripts'),
        });

        const commandBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            valign: Gtk.Align.CENTER,
        });

        const commandLabel = new Gtk.Label({
            label: 'flatpak run\ncom.odnoyko.valot --compact',
            css_classes: ['monospace', 'caption', 'dim-label'],
            selectable: true,
            justify: Gtk.Justification.LEFT,
        });

        const copyButton = new Gtk.Button({
            icon_name: 'edit-copy-symbolic',
            css_classes: ['flat'],
            tooltip_text: _('Copy command'),
        });

        copyButton.connect('clicked', () => {
            const clipboard = Gdk.Display.get_default().get_clipboard();
            clipboard.set('flatpak run com.odnoyko.valot --compact');
            
            // Show feedback
            copyButton.icon_name = 'emblem-ok-symbolic';
            copyButton.add_css_class('success');
            
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
                copyButton.icon_name = 'edit-copy-symbolic';
                copyButton.remove_css_class('success');
                return false;
            });
        });

        commandBox.append(commandLabel);
        commandBox.append(copyButton);
        commandRow.add_suffix(commandBox);
        commandGroup.add(commandRow);
        page.add(commandGroup);
    }

    _setupClientsPage(page) {
        // Initialize currency data
        this._loadCurrencySettings();
        
        // Visible currencies group with Add button in header
        this.currencyGroup = new Adw.PreferencesGroup({
            title: _('Currency Settings'),
            description: _('Manage available currencies for client billing'),
        });
        
        // Add header suffix with Add Currency button
        const addButton = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER,
        });
        addButton.connect('clicked', () => this._showAddCurrencyDialog());
        this.currencyGroup.set_header_suffix(addButton);
        
        // Hidden currencies group (initially collapsed)
        this.hiddenGroup = new Adw.PreferencesGroup({
            title: _('Hidden Currencies'),
            description: _('Click to unhide currencies'),
        });
        
        // Create expandable row for hidden currencies
        this.hiddenExpanderRow = new Adw.ExpanderRow({
            title: _('Hidden'),
            subtitle: _('0 currencies hidden'),
        });
        this.hiddenGroup.add(this.hiddenExpanderRow);
        
        // Currency rows will be added dynamically in _refreshCurrencyList
        
        // Add groups to page
        page.add(this.currencyGroup);
        page.add(this.hiddenGroup);
        
        // Populate currencies
        this._refreshCurrencyList();
    }

    _showDetailsSubpage() {
        // Create Details subpage as NavigationPage
        const detailsSubpage = new Adw.NavigationPage({
            title: _('Details'),
        });

        // Create header bar
        const headerBar = new Adw.HeaderBar();

        // Create toolbox to hold header and content
        const toolbarView = new Adw.ToolbarView();
        toolbarView.add_top_bar(headerBar);

        // Create scrollable content
        const scrolledWindow = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        });

        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_top: 24,
            margin_bottom: 24,
            margin_start: 24,
            margin_end: 24,
            spacing: 24,
        });

        // Creator group
        const creatorGroup = new Adw.PreferencesGroup({
            title: _('Creator'),
        });

        const creatorRow = new Adw.ActionRow({
            title: 'Vitaly Odnoyko',
            subtitle: _('Designer &amp; Developer'),
        });
        creatorGroup.add(creatorRow);
        contentBox.append(creatorGroup);

        // Copyright group
        const copyrightGroup = new Adw.PreferencesGroup({
            title: _('Copyright'),
        });

        const copyrightRow = new Adw.ActionRow({
            title: _('Copyright © 2025 Vitaly Odnoyko'),
            subtitle: _('All rights reserved under MIT License'),
        });
        copyrightGroup.add(copyrightRow);
        contentBox.append(copyrightGroup);

        // Repository group
        const repoGroup = new Adw.PreferencesGroup({
            title: _('Repository'),
        });

        const gitlabRow = new Adw.ActionRow({
            title: _('Source Code'),
            subtitle: 'GitLab',
            activatable: true,
        });
        gitlabRow.add_suffix(new Gtk.Image({
            icon_name: 'adw-external-link-symbolic',
            valign: Gtk.Align.CENTER,
        }));
        gitlabRow.connect('activated', () => {
            Gtk.show_uri(this, 'https://gitlab.com/Valo27/valot', Gdk.CURRENT_TIME);
        });
        repoGroup.add(gitlabRow);
        contentBox.append(repoGroup);

        // Website group
        const websiteGroup = new Adw.PreferencesGroup({
            title: _('Website'),
        });

        const websiteRow = new Adw.ActionRow({
            title: _('Visit Website'),
            subtitle: 'odnoyko.com/valot',
            activatable: true,
        });
        websiteRow.add_suffix(new Gtk.Image({
            icon_name: 'adw-external-link-symbolic',
            valign: Gtk.Align.CENTER,
        }));
        websiteRow.connect('activated', () => {
            Gtk.show_uri(this, 'https://odnoyko.com/valot', Gdk.CURRENT_TIME);
        });
        websiteGroup.add(websiteRow);
        contentBox.append(websiteGroup);

        scrolledWindow.set_child(contentBox);
        toolbarView.set_content(scrolledWindow);
        detailsSubpage.set_child(toolbarView);
        
        this.push_subpage(detailsSubpage);
    }

    _showCreditsSubpage() {
        // Create Credits subpage as NavigationPage
        const creditsSubpage = new Adw.NavigationPage({
            title: _('Credits'),
        });

        // Create header bar
        const headerBar = new Adw.HeaderBar();

        // Create toolbox to hold header and content
        const toolbarView = new Adw.ToolbarView();
        toolbarView.add_top_bar(headerBar);

        // Create scrollable content
        const scrolledWindow = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        });

        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_top: 24,
            margin_bottom: 24,
            margin_start: 24,
            margin_end: 24,
            spacing: 24,
        });

        // Creator group
        const creatorGroup = new Adw.PreferencesGroup({
            title: _('Creator'),
        });

        const creatorRow = new Adw.ActionRow({
            title: 'Vitaly Odnoyko',
            subtitle: _('Designer &amp; Developer'),
        });
        creatorGroup.add(creatorRow);
        contentBox.append(creatorGroup);

        // Special thanks group
        const thanksGroup = new Adw.PreferencesGroup({
            title: _('Special Thanks'),
        });

        const gnomeRow = new Adw.ActionRow({
            title: _('GNOME &amp; GTK Developers'),
            subtitle: _('For the amazing toolkit and desktop environment'),
        });
        thanksGroup.add(gnomeRow);

        const libadwaitaRow = new Adw.ActionRow({
            title: _('Libadwaita Contributors'),
            subtitle: _('For beautiful and consistent UI components'),
        });
        thanksGroup.add(libadwaitaRow);

        const flatpakRow = new Adw.ActionRow({
            title: _('Flatpak Community'),
            subtitle: _('For modern app distribution and sandboxing'),
        });
        thanksGroup.add(flatpakRow);

        const weblateRow = new Adw.ActionRow({
            title: _('Weblate'),
            subtitle: _('For translation management and localization'),
        });
        thanksGroup.add(weblateRow);
        contentBox.append(thanksGroup);

        scrolledWindow.set_child(contentBox);
        toolbarView.set_content(scrolledWindow);
        creditsSubpage.set_child(toolbarView);
        
        this.push_subpage(creditsSubpage);
    }

    _showLegalSubpage() {
        // Create Legal subpage as NavigationPage
        const legalSubpage = new Adw.NavigationPage({
            title: _('Legal'),
        });

        // Create header bar
        const headerBar = new Adw.HeaderBar();

        // Create toolbox to hold header and content
        const toolbarView = new Adw.ToolbarView();
        toolbarView.add_top_bar(headerBar);

        // Create scrollable content
        const scrolledWindow = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        });

        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_top: 24,
            margin_bottom: 24,
            margin_start: 24,
            margin_end: 24,
            spacing: 24,
        });

        // License group
        const licenseGroup = new Adw.PreferencesGroup({
            title: _('License'),
        });

        const mitRow = new Adw.ActionRow({
            title: 'MIT License',
            subtitle: _('Free and open source software'),
            activatable: true,
        });
        mitRow.add_suffix(new Gtk.Image({
            icon_name: 'adw-external-link-symbolic',
            valign: Gtk.Align.CENTER,
        }));
        mitRow.connect('activated', () => {
            Gtk.show_uri(this, 'https://gitlab.com/Valo27/valot/-/blob/main/LICENSE', Gdk.CURRENT_TIME);
        });
        licenseGroup.add(mitRow);
        contentBox.append(licenseGroup);

        // Third party group
        const thirdPartyGroup = new Adw.PreferencesGroup({
            title: _('Third Party'),
        });

        const gtkRow = new Adw.ActionRow({
            title: 'GTK 4 &amp; Libadwaita',
            subtitle: _('Licensed under LGPL 2.1'),
            activatable: true,
        });
        gtkRow.add_suffix(new Gtk.Image({
            icon_name: 'adw-external-link-symbolic',
            valign: Gtk.Align.CENTER,
        }));
        gtkRow.connect('activated', () => {
            Gtk.show_uri(this, 'https://www.gnu.org/licenses/lgpl-2.1.html', Gdk.CURRENT_TIME);
        });
        thirdPartyGroup.add(gtkRow);
        contentBox.append(thirdPartyGroup);

        scrolledWindow.set_child(contentBox);
        toolbarView.set_content(scrolledWindow);
        legalSubpage.set_child(toolbarView);
        
        this.push_subpage(legalSubpage);
    }

    _applyTheme(themeIndex) {
        const styleManager = Adw.StyleManager.get_default();
        
        switch (themeIndex) {
            case 0: // Auto
                styleManager.color_scheme = Adw.ColorScheme.DEFAULT;
                break;
            case 1: // Light
                styleManager.color_scheme = Adw.ColorScheme.FORCE_LIGHT;
                break;
            case 2: // Dark
                styleManager.color_scheme = Adw.ColorScheme.FORCE_DARK;
                break;
        }
    }

    async _loadPomodoroConfig() {
        try {
            const configDir = GLib.get_user_config_dir() + '/valot';
            const configPath = configDir + '/pomodoro-config.json';
            let file = Gio.File.new_for_path(configPath);
            
            if (!file.query_exists(null)) {
                // TODO: Restore pomodoro config when migrated
                // file = Gio.File.new_for_uri('resource:///com/odnoyko/valot/js/data/pomodoro-config.json');
                // if (!file.query_exists(null)) {
                    return { defaultMinutes: 20, enabled: true };
                // }
            }

            const [success, contents] = file.load_contents(null);
            if (success) {
                const configText = new TextDecoder().decode(contents);
                return JSON.parse(configText);
            }
        } catch (error) {
            // Return default on error
        }
        
        // Return default config on error
        return { defaultMinutes: 20, enabled: true };
    }

    _savePomodoroConfig(newDurationMinutes) {
        try {
            const config = {
                defaultMinutes: newDurationMinutes,
                enabled: true
            };

            const configDir = GLib.get_user_config_dir() + '/valot';
            const configPath = configDir + '/pomodoro-config.json';

            const dir = Gio.File.new_for_path(configDir);
            if (!dir.query_exists(null)) {
                dir.make_directory_with_parents(null);
            }

            const file = Gio.File.new_for_path(configPath);
            const configText = JSON.stringify(config, null, 2);

            file.replace_contents(
                configText,
                null, // etag
                false, // make backup
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null // cancellable
            );

            // TODO: Restore when pomodoroManager is migrated
            // Reload PomodoroManager config
            // pomodoroManager.reloadConfig();
        } catch (error) {
            console.error('Error saving Pomodoro config:', error);
        }
    }
    
    _loadCurrencySettings() {
        try {
            const configDir = GLib.get_user_config_dir() + '/valot';
            const configPath = configDir + '/currency-settings.json';
            const file = Gio.File.new_for_path(configPath);
            
            if (file.query_exists(null)) {
                const [success, contents] = file.load_contents(null);
                if (success) {
                    const configText = new TextDecoder().decode(contents);
                    this.currencySettings = JSON.parse(configText);
                    return;
                }
            }
        } catch (error) {
            // Continue with defaults
        }
        
        // Default settings - load ALL currencies by default
        const allCurrencies = getAllCurrencies();
        this.currencySettings = {
            visible: allCurrencies.map(c => c.code),
            hidden: [],
            custom: []
        };
    }
    
    _saveCurrencySettings() {
        try {
            const configDir = GLib.get_user_config_dir() + '/valot';
            const configPath = configDir + '/currency-settings.json';
            
            const dir = Gio.File.new_for_path(configDir);
            if (!dir.query_exists(null)) {
                dir.make_directory_with_parents(null);
            }
            
            const file = Gio.File.new_for_path(configPath);
            const configText = JSON.stringify(this.currencySettings, null, 2);
            
            file.replace_contents(
                configText,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );
        } catch (error) {
            // Silently continue
        }
    }
    
    _refreshCurrencyList() {
        // Completely rebuild the currency group to avoid widget management issues
        const parent = this.currencyGroup.get_parent();
        if (parent) {
            parent.remove(this.currencyGroup);
        }
        
        // Recreate the currency group
        this.currencyGroup = new Adw.PreferencesGroup({
            title: _('Currency Settings'),
            description: _('Manage available currencies for client billing'),
        });
        
        // Add header suffix with Add Currency button
        const addButton = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER,
        });
        addButton.connect('clicked', () => this._showAddCurrencyDialog());
        this.currencyGroup.set_header_suffix(addButton);
        
        // Re-add to parent
        if (parent) {
            parent.insert_child_after(this.currencyGroup, null);
        }
        
        // Clear hidden currencies - recreate the expander
        if (this.hiddenExpanderRow && this.hiddenExpanderRow.get_parent()) {
            this.hiddenGroup.remove(this.hiddenExpanderRow);
        }
        this.hiddenExpanderRow = new Adw.ExpanderRow({
            title: _('Hidden'),
            subtitle: _('0 currencies hidden'),
        });
        this.hiddenGroup.add(this.hiddenExpanderRow);
        
        const allCurrencies = getAllCurrencies();
        
        // Add visible currencies
        [...this.currencySettings.visible, ...this.currencySettings.custom.filter(c => !c.hidden)].forEach(code => {
            let currency;
            if (typeof code === 'string') {
                currency = allCurrencies.find(c => c.code === code) || { code, symbol: getCurrencySymbol(code), name: code };
            } else {
                currency = code; // Custom currency object
            }
            
            this._createCurrencyRow(currency, false);
        });
        
        // Add hidden currencies to expander
        [...this.currencySettings.hidden, ...this.currencySettings.custom.filter(c => c.hidden)].forEach(code => {
            let currency;
            if (typeof code === 'string') {
                currency = allCurrencies.find(c => c.code === code) || { code, symbol: getCurrencySymbol(code), name: code };
            } else {
                currency = code; // Custom currency object
            }
            
            this._createHiddenCurrencyRow(currency);
        });
        
        // Add button is now in the header, no need to add it here
        
        // Update hidden count
        const hiddenCount = this.currencySettings.hidden.length + this.currencySettings.custom.filter(c => c.hidden).length;
        this.hiddenExpanderRow.set_subtitle(_('%d currencies hidden').format(hiddenCount));
        this.hiddenGroup.set_visible(hiddenCount > 0);
    }
    
    _createCurrencyRow(currency, isCustom = false) {
        const row = new Adw.ActionRow({
            title: currency.code,
            subtitle: `${currency.symbol} ${currency.name}`,
        });
        
        // Check if this is a custom currency
        const isCustomCurrency = currency.custom || this.currencySettings.custom.find(c => c.code === currency.code);
        
        // Edit button (only for custom currencies)
        if (isCustomCurrency) {
            const editButton = new Gtk.Button({
                icon_name: 'document-edit-symbolic',
                css_classes: ['flat'],
                valign: Gtk.Align.CENTER,
            });
            editButton.connect('clicked', () => this._editCurrency(currency));
            row.add_suffix(editButton);
        }
        
        // Hide button
        const hideButton = new Gtk.Button({
            icon_name: 'view-conceal-symbolic',
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER,
        });
        hideButton.connect('clicked', () => this._hideCurrency(currency));
        row.add_suffix(hideButton);
        
        // Delete button (only for custom currencies)
        if (isCustomCurrency) {
            const deleteButton = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                css_classes: ['flat', 'destructive-action'],
                valign: Gtk.Align.CENTER,
            });
            deleteButton.connect('clicked', () => this._deleteCurrency(currency));
            row.add_suffix(deleteButton);
        }
        
        // Add row to group 
        this.currencyGroup.add(row);
    }
    
    _createHiddenCurrencyRow(currency) {
        const row = new Adw.ActionRow({
            title: currency.code,
            subtitle: `${currency.symbol} ${currency.name}`,
        });
        
        // Check if this is a custom currency
        const isCustomCurrency = currency.custom || this.currencySettings.custom.find(c => c.code === currency.code);
        
        // Edit button (only for custom currencies)
        if (isCustomCurrency) {
            const editButton = new Gtk.Button({
                icon_name: 'document-edit-symbolic',
                css_classes: ['flat'],
                valign: Gtk.Align.CENTER,
            });
            editButton.connect('clicked', () => this._editCurrency(currency));
            row.add_suffix(editButton);
        }
        
        // Unhide button
        const unhideButton = new Gtk.Button({
            icon_name: 'view-reveal-symbolic',
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER,
        });
        unhideButton.connect('clicked', () => this._unhideCurrency(currency));
        row.add_suffix(unhideButton);
        
        // Delete button (only for custom currencies)
        if (isCustomCurrency) {
            const deleteButton = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                css_classes: ['flat', 'destructive-action'],
                valign: Gtk.Align.CENTER,
            });
            deleteButton.connect('clicked', () => this._deleteCurrency(currency));
            row.add_suffix(deleteButton);
        }
        
        this.hiddenExpanderRow.add_row(row);
    }
    
    _showAddCurrencyDialog() {
        CurrencyDialog.show({
            mode: 'create',
            transient_for: this,
            onCurrencySave: (currencyData) => {
                // Check if currency already exists
                const exists = this.currencySettings.custom.find(c => c.code === currencyData.code) ||
                              this.currencySettings.visible.includes(currencyData.code) ||
                              this.currencySettings.hidden.includes(currencyData.code);
                              
                if (exists) {
                    return false;
                }
                
                // Add to custom currencies
                this.currencySettings.custom.push(currencyData);
                this._saveCurrencySettings();
                this._refreshCurrencyList();
                return true;
            }
        });
    }
    
    _editCurrency(currency) {
        CurrencyDialog.show({
            mode: 'edit',
            currency: currency,
            transient_for: this,
            onCurrencySave: (currencyData) => {
                // Update custom currency
                const index = this.currencySettings.custom.findIndex(c => c.code === currency.code);
                if (index !== -1) {
                    this.currencySettings.custom[index] = currencyData;
                    this._saveCurrencySettings();
                    this._refreshCurrencyList();
                }
                return true;
            }
        });
    }
    
    _hideCurrency(currency) {
        // Check if it's a default currency
        const visibleIndex = this.currencySettings.visible.indexOf(currency.code);
        if (visibleIndex !== -1) {
            this.currencySettings.visible.splice(visibleIndex, 1);
            this.currencySettings.hidden.push(currency.code);
        } else {
            // Check if it's a custom currency
            const customIndex = this.currencySettings.custom.findIndex(c => c.code === currency.code);
            if (customIndex !== -1) {
                this.currencySettings.custom[customIndex].hidden = true;
            }
        }
        
        this._saveCurrencySettings();
        this._refreshCurrencyList();
    }
    
    _unhideCurrency(currency) {
        // Check if it's a default currency
        const hiddenIndex = this.currencySettings.hidden.indexOf(currency.code);
        if (hiddenIndex !== -1) {
            this.currencySettings.hidden.splice(hiddenIndex, 1);
            this.currencySettings.visible.push(currency.code);
        } else {
            // Check if it's a custom currency
            const customIndex = this.currencySettings.custom.findIndex(c => c.code === currency.code);
            if (customIndex !== -1) {
                this.currencySettings.custom[customIndex].hidden = false;
            }
        }
        
        this._saveCurrencySettings();
        this._refreshCurrencyList();
    }
    
    _deleteCurrency(currency) {
        // Only allow deletion of custom currencies
        const customIndex = this.currencySettings.custom.findIndex(c => c.code === currency.code);
        if (customIndex !== -1) {
            this.currencySettings.custom.splice(customIndex, 1);
            this._saveCurrencySettings();
            this._refreshCurrencyList();
        }
    }

    /**
     * Setup Extensions Page (dynamically, only if extensions exist)
     */
    _setupExtensionsPage() {
        // Check if experimental features are enabled
        const settings = new Gio.Settings({ schema: 'com.odnoyko.valot' });
        const experimentalEnabled = settings.get_boolean('experimental-features');
        
        if (!experimentalEnabled) {
            // Don't create extensions page if experimental features are disabled
            return;
        }

        const app = this.get_transient_for()?.application;
        if (!app || !app.extensionManager) return;

        const extensions = app.extensionManager.getAllExtensions();
        if (extensions.length === 0) return; // Don't show tab if no extensions

        const extensionsPage = new Adw.PreferencesPage({
            title: _('Extensions'),
            icon_name: 'application-x-addon-symbolic',
        });
        
        // Store reference for dynamic visibility
        this.extensionsPage = extensionsPage;

        const extensionsGroup = new Adw.PreferencesGroup({
            title: _('Installed Extensions'),
            description: _('Manage addons and plugins'),
        });

        // Add extension from file button
        const loadExtensionRow = new Adw.ActionRow({
            title: _('Load Extension from File'),
            subtitle: _('Install a custom extension (.js file)'),
            activatable: true,
        });

        const loadButton = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });

        loadButton.connect('clicked', () => {
            this._loadExtensionFromFile(app);
        });

        loadExtensionRow.add_suffix(loadButton);
        extensionsGroup.add(loadExtensionRow);

        // List all extensions
        extensions.forEach(ext => {
            const row = new Adw.SwitchRow({
                title: ext.name,
                subtitle: ext.description,
                active: ext.active,
            });

            // Add type badge
            const typeBadge = new Gtk.Label({
                label: ext.type === 'addon' ? _('Addon') : _('Plugin'),
                css_classes: ['caption', 'dim-label'],
                valign: Gtk.Align.CENTER,
            });
            row.add_prefix(typeBadge);

            // Toggle extension on/off
            row.connect('notify::active', async (switchRow) => {
                const active = switchRow.get_active();
                if (active) {
                    await app.extensionManager.activateExtension(ext.id);
                } else {
                    await app.extensionManager.deactivateExtension(ext.id);
                }
            });

            // Add settings button if extension has settings
            const settingsPageFn = app.extensionManager.getExtensionSettingsPage(ext.id);
            if (settingsPageFn) {
                const settingsButton = new Gtk.Button({
                    icon_name: 'emblem-system-symbolic',
                    valign: Gtk.Align.CENTER,
                    css_classes: ['flat'],
                    tooltip_text: _('Extension Settings'),
                });

                settingsButton.connect('clicked', () => {
                    const settingsPage = settingsPageFn();
                    if (settingsPage) {
                        this.add(settingsPage);
                        this.set_visible_page(settingsPage);
                    }
                });

                row.add_suffix(settingsButton);
            }

            extensionsGroup.add(row);
        });

        extensionsPage.add(extensionsGroup);
        this.add(extensionsPage);
    }

    /**
     * Setup Integrations Page
     */
    _setupIntegrationsPage(page) {
        // Database Management Group
        const databaseGroup = new Adw.PreferencesGroup({
            title: _('Database'),
            description: _('Backup and manage your data'),
        });

        // Export DB button row
        const exportDbRow = new Adw.ActionRow({
            title: _('Export Database'),
            subtitle: _('Save a backup of your database'),
        });

        const exportButton = new Gtk.Button({
            label: _('Export'),
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });

        exportButton.connect('clicked', () => {
            this._exportDatabase();
        });

        exportDbRow.add_suffix(exportButton);
        databaseGroup.add(exportDbRow);

        // Import DB button row
        const importDbRow = new Adw.ActionRow({
            title: _('Import Database'),
            subtitle: _('Restore a backup of your database'),
        });

        const importButton = new Gtk.Button({
            label: _('Import'),
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });

        importButton.connect('clicked', () => {
            this._importDatabase();
        });

        importDbRow.add_suffix(importButton);
        databaseGroup.add(importDbRow);

        // Reset DB button row
        const resetDbRow = new Adw.ActionRow({
            title: _('Reset Database'),
            subtitle: _('Delete all data and start fresh'),
        });

        const resetButton = new Gtk.Button({
            label: _('Reset'),
            valign: Gtk.Align.CENTER,
            css_classes: ['flat', 'destructive-action'],
        });

        resetButton.connect('clicked', () => {
            this._resetDatabase();
        });

        resetDbRow.add_suffix(resetButton);
        databaseGroup.add(resetDbRow);

        page.add(databaseGroup);
    }

    static show(parent = null) {
        const dialog = new PreferencesDialog({
            transient_for: parent,
        });
        dialog.present();
        return dialog;
    }

    /**
     * Export database to a file
     */
    _exportDatabase() {
        const fileDialog = new Gtk.FileDialog({
            title: _('Export Database'),
            accept_label: _('Export'),
        });

        const defaultName = `valot-backup-${new Date().toISOString().split('T')[0]}.db`;
        fileDialog.set_initial_name(defaultName);

        fileDialog.save(this, null, (dialog, result) => {
            try {
                const file = dialog.save_finish(result);
                if (!file) return;

                // Delegate export to DataNavigator (data layer)
                const app = this.get_transient_for().application;
                app.dataNavigator.exportActiveDatabase(file.get_path())
                    .then(() => {
                        const toast = new Adw.Toast({
                            title: _('Database exported successfully'),
                            timeout: 3,
                        });
                        this.add_toast(toast);
                    })
                    .catch((error) => {
                        console.error('Error exporting database:', error);
                        const toast = new Adw.Toast({
                            title: _('Failed to export database'),
                            timeout: 3,
                        });
                        this.add_toast(toast);
                    });
            } catch (error) {
                // User cancelled the dialog - this is normal, don't show error
                if (error.matches(Gtk.DialogError, Gtk.DialogError.DISMISSED)) {
                    return;
                }
            }
        });
    }

    /**
     * Import database from a backup file
     */
    _importDatabase() {
        const fileDialog = new Gtk.FileDialog({
            title: _('Import Database'),
            accept_label: _('Select'),
        });

        // Add file filter for .db files
        const filter = new Gtk.FileFilter();
        filter.set_name(_('Database files'));
        filter.add_pattern('*.db');

        const filterList = new Gio.ListStore({ item_type: Gtk.FileFilter.$gtype });
        filterList.append(filter);
        fileDialog.set_filters(filterList);
        fileDialog.set_default_filter(filter);

        fileDialog.open(this, null, (dialog, result) => {
            try {
                const file = dialog.open_finish(result);
                if (!file) return;

                const importPath = file.get_path();

                // Show Database Migration Dialog with import context
                this._showImportDialog(importPath);

            } catch (error) {
                // User cancelled the dialog - this is normal, don't show error
                if (error.matches(Gtk.DialogError, Gtk.DialogError.DISMISSED)) {
                    return;
                }

                console.error('Error selecting file:', error);
                const toast = new Adw.Toast({
                    title: _('Failed to select file'),
                    timeout: 3,
                });
                this.add_toast(toast);
            }
        });
    }

    /**
     * Show import dialog using DatabaseMigrationDialog
     */
    async _showImportDialog(importPath) {
        const { DatabaseMigrationDialog } = await import('resource:///com/odnoyko/valot/ui/components/dialogs/DatabaseMigrationDialog.js');

        // Customize dialog for import context
        const migrationDialog = new DatabaseMigrationDialog(this, importPath, {
            title: _('Import Database'),
            subtitle: _('Choose how to import the database'),
            deleteButtonLabel: _('Replace Data'),
            backupButtonLabel: _('Save and Add Data'),
            showVersion: false, // Don't show version badge for import
        });

        migrationDialog.show(async (choice) => {
            if (choice === 'delete') {
                // Replace Data - delete current and copy imported
                await this._replaceDatabase(importPath, migrationDialog);
            } else if (choice === 'backup') {
                // Save and Add Data - merge databases
                await this._mergeDatabase(importPath, migrationDialog);
            }
        });
    }

    /**
     * Replace current database with imported one
     */
    async _replaceDatabase(importPath, migrationDialog) {
        try {
            const app = this.get_transient_for().application;
            // Replace via DataNavigator (data layer)
            const result = await app.dataNavigator.replaceWithDatabaseFile(importPath, (step, total, message) => {
                migrationDialog.updateProgress(step, total, _(message));
            });

            migrationDialog.showCompletion();

            console.log('✅ Replace completed:', result);

            // Force reload all services from database
            console.log('🔄 Force reloading all services...');
            if (app.coreAPI) {
                // Clear any caches and force reload
                try {
                    if (app.coreAPI.taskService) {
                        console.log('  Reloading TaskService...');
                        await app.coreAPI.taskService.loadAllTasks?.();
                    }
                    if (app.coreAPI.taskInstanceService) {
                        console.log('  Reloading TaskInstanceService...');
                        await app.coreAPI.taskInstanceService.loadAll?.();
                    }
                    if (app.coreAPI.clientService) {
                        console.log('  Reloading ClientService...');
                        await app.coreAPI.clientService.loadAll?.();
                    }
                    if (app.coreAPI.projectService) {
                        console.log('  Reloading ProjectService...');
                        await app.coreAPI.projectService.loadAll?.();
                    }
                } catch (reloadError) {
                    console.error('⚠️  Service reload error:', reloadError);
                }

                // Notify UI directly via CoreBridge to force reload
                app.coreBridge?.emitUIEvent('client-updated');
                app.coreBridge?.emitUIEvent('project-updated');
                app.coreBridge?.emitUIEvent('task-updated');

                console.log('✅ Services reloaded and events emitted');
            }

        } catch (error) {
            console.error('Error replacing database:', error);
            migrationDialog.showError(_('Failed to replace database'));
        }
    }

    /**
     * Merge imported database with current one (add new data, check duplicates)
     */
    async _mergeDatabase(importPath, migrationDialog) {
        const { DatabaseImport } = await import('resource:///com/odnoyko/valot/data/providers/gdaDBBridge/DatabaseImport.js');

        try {
            // Get EXISTING database connection from application's DataNavigator
            const app = this.get_transient_for().application;
            const activeProvider = app.dataNavigator?.getActiveProvider();
            const appDb = activeProvider?.getBridge();

            if (!appDb) {
                throw new Error('Database bridge not found');
            }

            console.log('📂 Using app database connection for merge');

            // Merge via DataNavigator (data layer)
            const result = await app.dataNavigator.mergeFromDatabaseFile(importPath, (step, total, message) => {
                migrationDialog.updateProgress(step, total, _(message));
            });

            // Show summary toast
            const summaryMessage = _('Import complete: %d clients, %d projects, %d tasks, %d time entries added')
                .format(result.clientsAdded, result.projectsAdded, result.tasksAdded, result.entriesAdded);

            const toast = new Adw.Toast({
                title: summaryMessage,
                timeout: 5,
            });
            this.add_toast(toast);

            migrationDialog.showCompletion();

            console.log('✅ Merge completed:', result);

            // Force reload all services from database
            console.log('🔄 Force reloading all services...');
            if (app.coreAPI) {
                // Clear any caches and force reload
                try {
                    if (app.coreAPI.taskService) {
                        console.log('  Reloading TaskService...');
                        await app.coreAPI.taskService.loadAllTasks?.();
                    }
                    if (app.coreAPI.taskInstanceService) {
                        console.log('  Reloading TaskInstanceService...');
                        await app.coreAPI.taskInstanceService.loadAll?.();
                    }
                    if (app.coreAPI.clientService) {
                        console.log('  Reloading ClientService...');
                        await app.coreAPI.clientService.loadAll?.();
                    }
                    if (app.coreAPI.projectService) {
                        console.log('  Reloading ProjectService...');
                        await app.coreAPI.projectService.loadAll?.();
                    }
                } catch (reloadError) {
                    console.error('⚠️  Service reload error:', reloadError);
                }

                // Notify UI directly via CoreBridge to force reload
                app.coreBridge?.emitUIEvent('client-updated');
                app.coreBridge?.emitUIEvent('project-updated');
                app.coreBridge?.emitUIEvent('task-updated');

                console.log('✅ Services reloaded and events emitted');
            }

            // Close dialog after 1 second
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                try {
                    migrationDialog.close();
                } catch (e) {
                    // Ignore if already closed
                }
                return GLib.SOURCE_REMOVE;
            });

        } catch (error) {
            console.error('Error merging database:', error);
            migrationDialog.showError(_('Failed to merge database: %s').format(error.message));
        }
    }

    /**
     * Load extension from file
     */
    _loadExtensionFromFile(app) {
        const fileDialog = new Gtk.FileDialog({
            title: _('Select Extension File'),
            accept_label: _('Load'),
        });

        // Add file filter for .js files
        const filter = new Gtk.FileFilter();
        filter.set_name(_('JavaScript files'));
        filter.add_pattern('*.js');

        const filterList = new Gio.ListStore({ item_type: Gtk.FileFilter.$gtype });
        filterList.append(filter);
        fileDialog.set_filters(filterList);
        fileDialog.set_default_filter(filter);

        fileDialog.open(this, null, async (dialog, result) => {
            try {
                const file = dialog.open_finish(result);
                if (!file) return;

                const filePath = file.get_path();

                // Load extension
                const metadata = await app.extensionManager.loadExtensionFromFile(filePath);

                // Show success toast
                const toast = new Adw.Toast({
                    title: _('Extension loaded: %s').format(metadata.name),
                    timeout: 3,
                });
                this.add_toast(toast);

                // Refresh extensions page
                this.close();
                const newDialog = PreferencesDialog.show(this.get_transient_for());
                newDialog.set_visible_page_name('extensions');

            } catch (error) {
                // User cancelled the dialog
                if (error.matches(Gtk.DialogError, Gtk.DialogError.DISMISSED)) {
                    return;
                }

                console.error('Error loading extension:', error);
                const toast = new Adw.Toast({
                    title: _('Failed to load extension: %s').format(error.message),
                    timeout: 5,
                });
                this.add_toast(toast);
            }
        });
    }

    /**
     * Deactivate all active extensions
     */
    _deactivateAllExtensions() {
        const app = this.get_transient_for()?.application;
        if (!app || !app.extensionManager) return;

        const extensions = app.extensionManager.getAllExtensions();
        
        // Deactivate all active extensions
        for (const ext of extensions) {
            if (ext.active) {
                app.extensionManager.deactivateExtension(ext.id).catch(error => {
                    console.error(`PreferencesDialog: Failed to deactivate ${ext.id}:`, error);
                });
            }
        }
    }

    /**
     * Update Extensions page visibility based on experimental features setting
     */
    _updateExtensionsPageVisibility() {
        const settings = new Gio.Settings({ schema: 'com.odnoyko.valot' });
        const experimentalEnabled = settings.get_boolean('experimental-features');

        if (experimentalEnabled) {
            // Add extensions page if not already present
            if (!this.extensionsPage) {
                this._setupExtensionsPage();
            }
        } else {
            // Remove extensions page if present
            if (this.extensionsPage) {
                this.remove(this.extensionsPage);
                this.extensionsPage = null;
            }
        }
    }

    /**
     * Reset database with confirmation
     */
    _resetDatabase() {
        const dialog = new Adw.AlertDialog({
            heading: _('Reset Database?'),
            body: _('This will delete all your tasks, projects, clients, and time entries. This action cannot be undone.'),
        });

        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('reset', _('Reset Database'));
        dialog.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');

        dialog.connect('response', async (dlg, response) => {
            if (response === 'reset') {
                // Soft reset via DataNavigator
                const app = this.get_transient_for().application;
                try {
                    await app.dataNavigator.resetActiveDatabase();
                } catch (e) {
                    console.error('Soft reset failed:', e);
                }

                // Reload services and emit events so UI updates
                try {
                    app.coreBridge?.emitUIEvent('client-updated');
                    app.coreBridge?.emitUIEvent('project-updated');
                    app.coreBridge?.emitUIEvent('task-updated');
                } catch (reloadError) {
                    console.error('Error emitting refresh events after reset:', reloadError);
                }

                const toast = new Adw.Toast({ title: _('Database reset complete'), timeout: 3 });
                this.add_toast(toast);
            }
        });

        dialog.present(this);
    }
});
