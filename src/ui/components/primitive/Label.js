import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';

/**
 * Reusable Label component with formatting and styling options
 */
export class Label {
    constructor(config = {}) {
        const defaultConfig = {
            text: '',
            markup: null,
            halign: Gtk.Align.FILL,
            valign: Gtk.Align.CENTER,
            ellipsize: Pango.EllipsizeMode.NONE,
            wrap: false,
            selectable: false,
            cssClasses: [],
            maxWidthChars: -1,
            widthChars: -1
        };

        this.config = { ...defaultConfig, ...config };
        this.widget = this._createWidget();
        
        // Apply CSS classes
        if (this.config.cssClasses && Array.isArray(this.config.cssClasses)) {
            this.config.cssClasses.forEach(cssClass => {
                this.widget.add_css_class(cssClass);
            });
        }
    }

    _createWidget() {
        const label = new Gtk.Label({
            halign: this.config.halign,
            valign: this.config.valign,
            ellipsize: this.config.ellipsize,
            wrap: this.config.wrap,
            selectable: this.config.selectable,
            max_width_chars: this.config.maxWidthChars,
            width_chars: this.config.widthChars
        });

        // Set text or markup
        if (this.config.markup) {
            label.set_markup(this.config.markup);
        } else {
            label.set_text(this.config.text);
        }

        return label;
    }

    /**
     * Set label text
     */
    setText(text) {
        this.widget.set_text(text || '');
        this.config.text = text || '';
        this.config.markup = null;
    }

    /**
     * Set label markup (with HTML-like formatting)
     */
    setMarkup(markup) {
        this.widget.set_markup(markup || '');
        this.config.markup = markup || '';
        this.config.text = '';
    }

    /**
     * Get current text
     */
    getText() {
        return this.widget.get_text();
    }

    /**
     * Set text alignment
     */
    setAlignment(halign, valign = null) {
        this.widget.set_halign(halign);
        if (valign !== null) {
            this.widget.set_valign(valign);
        }
        this.config.halign = halign;
        if (valign !== null) {
            this.config.valign = valign;
        }
    }

    /**
     * Set text wrapping
     */
    setWrap(wrap) {
        this.widget.set_wrap(wrap);
        this.config.wrap = wrap;
    }

    /**
     * Set text ellipsize mode
     */
    setEllipsize(mode) {
        this.widget.set_ellipsize(mode);
        this.config.ellipsize = mode;
    }

    /**
     * Set selectable state
     */
    setSelectable(selectable) {
        this.widget.set_selectable(selectable);
        this.config.selectable = selectable;
    }

    /**
     * Set maximum width in characters
     */
    setMaxWidthChars(chars) {
        this.widget.set_max_width_chars(chars);
        this.config.maxWidthChars = chars;
    }

    /**
     * Set width in characters
     */
    setWidthChars(chars) {
        this.widget.set_width_chars(chars);
        this.config.widthChars = chars;
    }

    /**
     * Apply text formatting
     */
    formatText(format, ...args) {
        let text = format;
        args.forEach((arg, index) => {
            text = text.replace(`{${index}}`, arg);
        });
        this.setText(text);
    }

    /**
     * Create a heading label
     */
    static createHeading(text, level = 1) {
        const cssClasses = ['heading'];
        if (level > 1) {
            cssClasses.push(`heading-${level}`);
        }

        return new Label({
            text,
            cssClasses,
            halign: Gtk.Align.START
        });
    }

    /**
     * Create a subtitle label
     */
    static createSubtitle(text) {
        return new Label({
            text,
            cssClasses: ['subtitle'],
            halign: Gtk.Align.START
        });
    }

    /**
     * Create a caption label
     */
    static createCaption(text) {
        return new Label({
            text,
            cssClasses: ['caption'],
            halign: Gtk.Align.START,
            ellipsize: Pango.EllipsizeMode.END
        });
    }

    /**
     * Create a monospace label
     */
    static createMonospace(text) {
        return new Label({
            text,
            cssClasses: ['monospace'],
            selectable: true
        });
    }

    /**
     * Create a time display label
     */
    static createTimeLabel(time = '00:00:00') {
        return new Label({
            text: time,
            cssClasses: ['time-display', 'monospace'],
            halign: Gtk.Align.CENTER,
            selectable: true
        });
    }
}