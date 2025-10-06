import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import { BUTTON } from 'resource:///com/odnoyko/valot/js/func/global/commonStrings.js';

/**
 * Currency creation/editing dialog
 */
export class CurrencyDialog {
    constructor(config = {}) {
        const {
            mode = 'create',
            currency = null,
            onCurrencySave = null,
            transient_for = null
        } = config;

        this.mode = mode;
        this.currency = currency;
        this.onCurrencySave = onCurrencySave;

        const isEdit = mode === 'edit' && currency;
        
        // Create dialog
        this.dialog = new Adw.AlertDialog({
            heading: isEdit ? _('Edit Currency') : _('Create New Currency'),
            body: isEdit ? _('Update currency information') : _('Add a new custom currency'),
        });

        // Store transient_for for later use
        this.transient_for = transient_for;

        // Create form content
        this._createForm(isEdit, currency);
        
        // Add buttons
        this.dialog.add_response('cancel', BUTTON.CANCEL);
        this.dialog.add_response('save', isEdit ? BUTTON.SAVE_CHANGES : _('Create Currency'));
        this.dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);
        
        // Connect response signal
        this.dialog.connect('response', (dialog, response) => {
            if (response === 'save') {
                this._handleSave();
            }
        });
    }

    _createForm(isEdit, currency) {
        // Main vertical container with wider width
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 16,
            margin_top: 16,
            margin_bottom: 16,
            margin_start: 16,
            margin_end: 16,
            width_request: 500
        });

        // ROW 1: Full Name (full width)
        const fullNameLabel = new Gtk.Label({
            label: _('Full Name'),
            halign: Gtk.Align.START,
            css_classes: ['heading']
        });

        this.nameEntry = new Gtk.Entry({
            placeholder_text: _('e.g. US Dollar, Euro, Bitcoin...'),
            text: isEdit ? (currency.name || '') : '',
            hexpand: true
        });
        
        const nameRow = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6
        });
        nameRow.append(fullNameLabel);
        nameRow.append(this.nameEntry);

        // ROW 2: Currency Symbol and Currency Code side by side
        const row2Container = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            homogeneous: true
        });

        // Symbol column
        const symbolColumn = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6
        });

        const symbolLabel = new Gtk.Label({
            label: _('Currency Symbol'),
            halign: Gtk.Align.START,
            css_classes: ['heading']
        });

        this.symbolEntry = new Gtk.Entry({
            placeholder_text: _('e.g. $, €, ₿...'),
            text: isEdit ? (currency.symbol || '') : '',
            hexpand: true,
            max_length: 5
        });
        
        symbolColumn.append(symbolLabel);
        symbolColumn.append(this.symbolEntry);

        // Currency Code column
        const codeColumn = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6
        });

        const codeLabel = new Gtk.Label({
            label: _('Currency Code'),
            halign: Gtk.Align.START,
            css_classes: ['heading']
        });

        this.codeEntry = new Gtk.Entry({
            placeholder_text: _('e.g. USD, EUR, BTC...'),
            text: isEdit ? (currency.code || '') : '',
            hexpand: true,
            max_length: 10
        });
        
        codeColumn.append(codeLabel);
        codeColumn.append(this.codeEntry);

        // Add both columns to row2
        row2Container.append(symbolColumn);
        row2Container.append(codeColumn);

        // Add both rows to main container
        mainBox.append(nameRow);
        mainBox.append(row2Container);

        // Set as extra child of dialog
        this.dialog.set_extra_child(mainBox);
    }

    _handleSave() {
        const currencyData = {
            code: this.codeEntry.get_text().trim().toUpperCase(),
            symbol: this.symbolEntry.get_text().trim(),
            name: this.nameEntry.get_text().trim(),
            custom: true // Mark as custom currency
        };

        // Validation
        if (!currencyData.code) {
            this._showValidationError('Currency code is required');
            this.codeEntry.grab_focus();
            return false;
        }

        if (!currencyData.symbol) {
            this._showValidationError('Currency symbol is required');
            this.symbolEntry.grab_focus();
            return false;
        }

        if (!currencyData.name) {
            this._showValidationError('Currency name is required');
            this.nameEntry.grab_focus();
            return false;
        }

        // If editing, preserve the original code for identification
        if (this.mode === 'edit' && this.currency) {
            currencyData.originalCode = this.currency.code;
        }

        // Trigger callback
        if (this.onCurrencySave) {
            const result = this.onCurrencySave(currencyData);
            if (result !== false) {
                this.dialog.close();
            }
        } else {
            this.dialog.close();
        }
    }

    _showValidationError(message) {
        // You could implement a toast or inline error display here
    }

    present() {
        if (this.transient_for) {
            this.dialog.present(this.transient_for);
        } else {
            this.dialog.present();
        }
    }

    /**
     * Static method to show currency dialog
     */
    static show(config = {}) {
        const dialog = new CurrencyDialog(config);
        dialog.present();
        return dialog;
    }
}
