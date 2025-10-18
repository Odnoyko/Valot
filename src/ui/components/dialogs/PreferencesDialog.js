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
        const settings = new Gio.Settings({ schema: 'com.odnoyko.valot' });
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
            label: 'com.odnoyko.valot --compact',
            css_classes: ['monospace', 'caption', 'dim-label'],
            selectable: true,
        });

        const copyButton = new Gtk.Button({
            icon_name: 'edit-copy-symbolic',
            css_classes: ['flat'],
            tooltip_text: _('Copy command'),
        });

        copyButton.connect('clicked', () => {
            const clipboard = Gdk.Display.get_default().get_clipboard();
            clipboard.set('com.odnoyko.valot --compact');
            
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
            subtitle: 'odnoyko.com',
            activatable: true,
        });
        websiteRow.add_suffix(new Gtk.Image({
            icon_name: 'adw-external-link-symbolic',
            valign: Gtk.Align.CENTER,
        }));
        websiteRow.connect('activated', () => {
            Gtk.show_uri(this, 'https://odnoyko.com', Gdk.CURRENT_TIME);
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

    static show(parent = null) {
        const dialog = new PreferencesDialog({
            transient_for: parent,
        });
        dialog.present();
        return dialog;
    }
});