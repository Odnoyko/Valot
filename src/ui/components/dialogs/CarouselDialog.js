import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk?version=4.0';
import GdkPixbuf from 'gi://GdkPixbuf';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export const CarouselDialog = GObject.registerClass({
    GTypeName: 'CarouselDialog',
}, class CarouselDialog extends Adw.Window {
    
    _init(params = {}) {
        super._init({
            modal: true,
            default_width: 700,
            default_height: 500,
            resizable: false,
            ...params
        });

        this._setupUI();
        this._connectCloseHandlers();
    }

    _setupUI() {
        const content = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0,
        });

        // Close button overlay
        const closeButton = new Gtk.Button({
            icon_name: 'window-close-symbolic',
            css_classes: ['flat', 'circular'],
            halign: Gtk.Align.END,
            valign: Gtk.Align.START,
            margin_top: 12,
            margin_end: 12,
        });
        closeButton.connect('clicked', () => this._closeDialog());

        const carousel = new Adw.Carousel({
            spacing: 0,
            allow_scroll_wheel: true,
            allow_long_swipes: true,
            vexpand: true,
            hexpand: true,
        });

        // Create slides with actual SVG images
        const slides = this._createImageSlides();
        slides.forEach((slide, index) => {
            carousel.append(slide);
        });

        // Carousel indicators
        const indicators = new Adw.CarouselIndicatorDots({
            carousel: carousel,
            halign: Gtk.Align.CENTER,
            margin_top: 12,
            margin_bottom: 12,
        });

        // Navigation buttons
        const buttonBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            halign: Gtk.Align.FILL,
            hexpand: true,
            spacing: 12,
            margin_start: 24,
            margin_end: 24,
            margin_bottom: 24,
        });

        const skipButton = new Gtk.Button({
            label: _('Skip'),
            css_classes: ['flat'],
        });
        skipButton.connect('clicked', () => this._closeDialog());

        const nextButton = new Gtk.Button({
            label: _('Next'),
            css_classes: ['suggested-action'],
        });
        nextButton.connect('clicked', () => {
            const currentPos = carousel.position;
            const totalPages = carousel.get_n_pages();
            const targetPos = Math.min(totalPages - 1, Math.floor(currentPos) + 1);
            
            if (targetPos >= totalPages - 1) {
                // On last slide "Get Started" closes and marks as shown
                this._closeDialog();
            } else {
                carousel.scroll_to(carousel.get_nth_page(targetPos), true);
            }
        });

        const donateButton = new Gtk.Button({
            label: _('Donate'),
            css_classes: ['flat'],
        });
        donateButton.connect('clicked', () => {
            // Open donation link
            Gtk.show_uri(this, 'https://ko-fi.com/odnoyko', Gdk.CURRENT_TIME);
        });

        // Left side - donate button
        buttonBox.append(donateButton);
        
        // Spacer to push control buttons to right
        const spacer = new Gtk.Box({
            hexpand: true,
        });
        buttonBox.append(spacer);
        
        // Right side - control buttons
        const controlBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
        });
        controlBox.append(skipButton);
        controlBox.append(nextButton);
        
        buttonBox.append(controlBox);

        // Update button states
        carousel.connect('notify::position', () => {
            const position = carousel.position;
            const totalPages = carousel.get_n_pages();

            // Hide skip button on last slide
            skipButton.visible = position < totalPages - 1;

            if (position >= totalPages - 1) {
                nextButton.label = _('Get Started');
            } else {
                nextButton.label = _('Next');
            }
        });

        // Add carousel and UI to content
        carousel.set_size_request(600, 350);
        content.append(carousel);
        content.append(indicators);
        content.append(buttonBox);
        
        // Use overlay to position close button over content
        const overlay = new Gtk.Overlay();
        
        overlay.set_child(content);
        overlay.add_overlay(closeButton);

        this.set_content(overlay);
    }

    _connectCloseHandlers() {
        this.connect('close-request', () => {
            this._markAsShown();
            return false;
        });
    }

    _closeDialog() {
        this._markAsShown();
        this.close();
    }

    _markAsShown() {
        try {
            const settings = new Gio.Settings({ schema: 'com.odnoyko.valot' });
            settings.set_boolean('welcome-dialog-shown', true);
        } catch (error) {
            // Silently continue
        }
    }

    _createImageSlides() {
        const slides = [];

        const slideData = [
            {
                imagePath: '/com/odnoyko/valot/data/slides/slide1.svg',
                title: _('Welcome to Valot'),
                description: _('Track your time efficiently and boost your productivity'),
                hint: _('Right-click to select items')
            },
            {
                imagePath: '/com/odnoyko/valot/data/slides/slide2.svg',
                title: _('Organize Projects'),
                description: _('Create and manage projects with custom colors and icons'),
                hint: _('Double-click project names to edit • Click icons to change icon and color')
            },
            {
                imagePath: '/com/odnoyko/valot/data/slides/slide3.svg',
                title: _('Manage Clients'),
                description: _('Add clients with billing rates and contact information'),
                hint: _('Set custom currencies in settings')
            },
            {
                imagePath: '/com/odnoyko/valot/data/slides/slide4.svg',
                title: _('Compact Tracker'),
                description: _('Launch with terminal command or setup system hotkey'),
                command: 'com.odnoyko.valot --compact'
            },
            {
                imagePath: '/com/odnoyko/valot/data/slides/slide5.svg',
                title: _('Pomodoro Timer'),
                description: _('Activate 20 minutes by default and you can customize it inside settings'),
                hint: _('Shift+click track button to track items in pomodoro mode')
            }
        ];

        slideData.forEach(data => {
            slides.push(this._createImageSlide(data.imagePath, data.title, data.description, data.command, data.hint));
        });

        return slides;
    }

    _createImageSlide(imagePath, title, description, command = null, hint = null) {
        const slide = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER,
            spacing: 20,
            margin_start: 40,
            margin_end: 40,
            margin_top: 20,
            margin_bottom: 20,
        });

        const imageFrame = new Gtk.Frame({
            css_classes: ['card'],
            halign: Gtk.Align.CENTER,
            margin_bottom: 16,
        });

        // Use Gtk.Picture for better SVG support
        const picture = new Gtk.Picture({
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            width_request: 500,
            height_request: 360,
            can_shrink: true,
            keep_aspect_ratio: true,
        });

        try {
            picture.set_resource(imagePath);
            imageFrame.set_child(picture);
        } catch (e) {
            // Fallback to icon
            const image = new Gtk.Image({
                icon_name: 'image-x-generic-symbolic',
                pixel_size: 200,
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.CENTER,
            });
            imageFrame.set_child(image);
        }

        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
            height_request: 120,
            vexpand: false,
        });

        const titleLabel = new Gtk.Label({
            label: `<span size="x-large" weight="bold">${title}</span>`,
            use_markup: true,
            halign: Gtk.Align.CENTER,
            wrap: true,
            justify: Gtk.Justification.CENTER,
        });

        const descLabel = new Gtk.Label({
            label: description,
            halign: Gtk.Align.CENTER,
            wrap: true,
            justify: Gtk.Justification.CENTER,
            css_classes: ['dim-label'],
        });

        contentBox.append(titleLabel);
        contentBox.append(descLabel);

        // Add command copy section if command exists
        if (command) {
            const commandBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 12,
                halign: Gtk.Align.CENTER,
                margin_top: 16,
                css_classes: ['card', 'carousel-command-box'],
            });

            const commandLabel = new Gtk.Label({
                label: `<tt>${command}</tt>`,
                use_markup: true,
                selectable: true,
                css_classes: ['monospace', 'carousel-command-text'],
            });

            const copyButton = new Gtk.Button({
                icon_name: 'edit-copy-symbolic',
                css_classes: ['flat', 'carousel-copy-button'],
                tooltip_text: _('Copy command'),
            });

            copyButton.connect('clicked', () => {
                const clipboard = Gdk.Display.get_default().get_clipboard();
                clipboard.set(command);
                
                // Show feedback
                copyButton.icon_name = 'emblem-ok-symbolic';
                copyButton.css_classes = ['flat', 'carousel-copy-button', 'success'];
                
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
                    copyButton.icon_name = 'edit-copy-symbolic';
                    copyButton.css_classes = ['flat', 'carousel-copy-button'];
                    return false;
                });
            });

            commandBox.append(commandLabel);
            commandBox.append(copyButton);
            contentBox.append(commandBox);
        }

        // Add hint box if hint exists
        if (hint) {
            const hintBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 8,
                halign: Gtk.Align.CENTER,
                margin_top: 12,
                css_classes: ['card', 'hint-box'],
            });

            const hintIcon = new Gtk.Image({
                icon_name: 'dialog-information-symbolic',
            });

            const hintLabel = new Gtk.Label({
                label: hint,
                halign: Gtk.Align.CENTER,
                wrap: true,
                justify: Gtk.Justification.CENTER,
                css_classes: ['caption'],
            });

            hintBox.append(hintIcon);
            hintBox.append(hintLabel);
            contentBox.append(hintBox);
        }

        slide.append(imageFrame);
        slide.append(contentBox);

        return slide;
    }

    _createTestSlide(number) {
        const slide = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER,
            spacing: 20,
            margin_start: 40,
            margin_end: 40,
            margin_top: 40,
            margin_bottom: 40,
        });

        const icon = new Gtk.Image({
            icon_name: 'starred-symbolic',
            pixel_size: 128,
            css_classes: ['accent'],
        });

        const title = new Gtk.Label({
            label: `<span size="xx-large" weight="bold">Slide ${number}</span>`,
            use_markup: true,
            halign: Gtk.Align.CENTER,
        });

        const desc = new Gtk.Label({
            label: `This is slide ${number} content. The carousel is working!`,
            halign: Gtk.Align.CENTER,
            wrap: true,
            css_classes: ['dim-label'],
        });

        slide.append(icon);
        slide.append(title);
        slide.append(desc);

        return slide;
    }

    static shouldShow() {
        try {
            const settings = new Gio.Settings({ schema: 'com.odnoyko.valot' });
            return !settings.get_boolean('welcome-dialog-shown');
        } catch (error) {
            return true; // Show by default if can't read settings
        }
    }

    static showIfNeeded(parent = null) {
        if (CarouselDialog.shouldShow()) {
            const dialog = new CarouselDialog({
                transient_for: parent,
            });
            dialog.present();
            return dialog;
        }
        return null;
    }

    static show(parent = null) {
        const dialog = new CarouselDialog({
            transient_for: parent,
        });
        dialog.present();
        return dialog;
    }
});