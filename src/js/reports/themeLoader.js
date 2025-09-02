import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export class ThemeLoader {
    constructor() {
        this.themes = new Map();
        this.loadBuiltInThemes();
    }

    loadBuiltInThemes() {
        // Built-in themes - these are embedded in code for reliability
        this.themes.set('modern-blue', {
            name: "Modern Blue",
            description: "Professional blue theme with modern cards",
            layout: {
                margin: 30,
                cardPadding: 15,
                sectionSpacing: 30,
                headerHeight: 100,
                footerHeight: 50,
                cardHeight: 50,
                statCardHeight: 70,
                statCardsPerRow: 3
            },
            colors: {
                primary: "#1833BD",
                secondary: "#4B5575", 
                accent: "#2196F3",
                success: "#4CAF50",
                warning: "#FF9800",
                danger: "#F44336",
                white: "#FFFFFF",
                lightGray: "#F9F9F9",
                mediumGray: "#AFAFAF",
                darkGray: "#333333",
                black: "#0D0D0D"
            },
            typography: {
                titleSize: "xx-large",
                subtitleSize: "x-large",
                headerSize: "large",
                bodySize: "medium",
                captionSize: "small",
                titleWeight: "300",
                headerWeight: "600",
                bodyWeight: "normal"
            },
            components: {
                header: {
                    background: "primary",
                    textColor: "white",
                    accentHeight: 4,
                    logoSize: 50,
                    showLogo: true,
                    showAccentStripe: true
                },
                statsCards: {
                    background: "white",
                    borderColor: "lightGray",
                    accentColor: "accent",
                    accentHeight: 3,
                    iconSize: 8,
                    showIcons: true,
                    showBorder: true
                },
                taskCards: {
                    background: "white",
                    borderColor: "lightGray",
                    statusIndicatorWidth: 4,
                    badgeWidth: 25,
                    badgeHeight: 20,
                    showBadges: true,
                    showStatusIndicator: true
                },
                footer: {
                    background: "lightGray",
                    textColor: "mediumGray",
                    showTimestamp: true,
                    showPageNumber: true
                }
            }
        });

        this.themes.set('corporate-dark', {
            name: "Corporate Dark",
            description: "Dark corporate theme with gold accents",
            layout: {
                margin: 40,
                cardPadding: 20,
                sectionSpacing: 35,
                headerHeight: 120,
                footerHeight: 60,
                cardHeight: 60,
                statCardHeight: 80,
                statCardsPerRow: 2
            },
            colors: {
                primary: "#1A1A1A",
                secondary: "#333333",
                accent: "#FFD700",
                success: "#00C851",
                warning: "#FF8800",
                danger: "#FF4444",
                white: "#FFFFFF",
                lightGray: "#F5F5F5",
                mediumGray: "#999999",
                darkGray: "#2D2D2D",
                black: "#000000"
            },
            typography: {
                titleSize: "xx-large",
                subtitleSize: "x-large",
                headerSize: "large",
                bodySize: "medium",
                captionSize: "small",
                titleWeight: "bold",
                headerWeight: "bold",
                bodyWeight: "normal"
            },
            components: {
                header: {
                    background: "primary",
                    textColor: "white",
                    accentHeight: 6,
                    logoSize: 60,
                    showLogo: true,
                    showAccentStripe: true
                },
                statsCards: {
                    background: "darkGray",
                    borderColor: "accent",
                    accentColor: "accent",
                    accentHeight: 4,
                    iconSize: 10,
                    showIcons: true,
                    showBorder: true
                },
                taskCards: {
                    background: "white",
                    borderColor: "mediumGray",
                    statusIndicatorWidth: 6,
                    badgeWidth: 30,
                    badgeHeight: 24,
                    showBadges: true,
                    showStatusIndicator: true
                },
                footer: {
                    background: "primary",
                    textColor: "mediumGray",
                    showTimestamp: true,
                    showPageNumber: true
                }
            }
        });

        this.themes.set('minimal-clean', {
            name: "Minimal Clean",
            description: "Clean minimal design with lots of whitespace",
            layout: {
                margin: 50,
                cardPadding: 25,
                sectionSpacing: 40,
                headerHeight: 80,
                footerHeight: 40,
                cardHeight: 45,
                statCardHeight: 60,
                statCardsPerRow: 4
            },
            colors: {
                primary: "#2C3E50",
                secondary: "#34495E",
                accent: "#3498DB",
                success: "#27AE60",
                warning: "#F39C12",
                danger: "#E74C3C",
                white: "#FFFFFF",
                lightGray: "#ECF0F1",
                mediumGray: "#95A5A6",
                darkGray: "#2C3E50",
                black: "#2C3E50"
            },
            typography: {
                titleSize: "x-large",
                subtitleSize: "large",
                headerSize: "medium",
                bodySize: "medium",
                captionSize: "small",
                titleWeight: "normal",
                headerWeight: "normal",
                bodyWeight: "normal"
            },
            components: {
                header: {
                    background: "white",
                    textColor: "primary",
                    accentHeight: 2,
                    logoSize: 40,
                    showLogo: false,
                    showAccentStripe: true
                },
                statsCards: {
                    background: "white",
                    borderColor: "lightGray",
                    accentColor: "accent",
                    accentHeight: 2,
                    iconSize: 6,
                    showIcons: false,
                    showBorder: true
                },
                taskCards: {
                    background: "white",
                    borderColor: "lightGray",
                    statusIndicatorWidth: 2,
                    badgeWidth: 20,
                    badgeHeight: 16,
                    showBadges: false,
                    showStatusIndicator: true
                },
                footer: {
                    background: "white",
                    textColor: "mediumGray",
                    showTimestamp: true,
                    showPageNumber: true
                }
            }
        });

        this.themes.set('annual-report', {
            name: "Annual Report",
            description: "Inspired by modern annual reports with large numbers and colored badges",
            layout: {
                margin: 50,
                cardPadding: 30,
                sectionSpacing: 45,
                headerHeight: 80,
                footerHeight: 50,
                cardHeight: 120,
                statCardHeight: 140,
                statCardsPerRow: 2
            },
            colors: {
                primary: "#2C3E50",
                secondary: "#34495E",
                accent: "#E74C3C",
                success: "#27AE60",
                warning: "#F39C12",
                danger: "#E74C3C",
                white: "#FFFFFF",
                lightGray: "#ECF0F1",
                mediumGray: "#95A5A6",
                darkGray: "#2C3E50",
                black: "#2C3E50"
            },
            typography: {
                titleSize: "xx-large",
                subtitleSize: "x-large",
                headerSize: "large",
                bodySize: "medium",
                captionSize: "small",
                titleWeight: "300",
                headerWeight: "normal",
                bodyWeight: "300"
            },
            components: {
                header: {
                    background: "white",
                    textColor: "primary",
                    accentHeight: 0,
                    logoSize: 0,
                    showLogo: false,
                    showAccentStripe: false
                },
                statsCards: {
                    background: "white",
                    borderColor: "lightGray",
                    accentColor: "accent",
                    accentHeight: 0,
                    iconSize: 0,
                    showIcons: false,
                    showBorder: false
                },
                taskCards: {
                    background: "white",
                    borderColor: "lightGray",
                    statusIndicatorWidth: 0,
                    badgeWidth: 0,
                    badgeHeight: 0,
                    showBadges: false,
                    showStatusIndicator: false
                },
                footer: {
                    background: "white",
                    textColor: "mediumGray",
                    showTimestamp: true,
                    showPageNumber: true
                }
            }
        });
    }

    getTheme(themeId) {
        if (this.themes.has(themeId)) {
            return this.themes.get(themeId);
        }
        // Return default theme if not found
        return this.themes.get('modern-blue');
    }

    getAllThemes() {
        return Array.from(this.themes.entries()).map(([id, theme]) => ({
            id,
            name: theme.name,
            description: theme.description
        }));
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16) / 255,
            g: parseInt(result[2], 16) / 255,
            b: parseInt(result[3], 16) / 255
        } : { r: 0, g: 0, b: 0 };
    }

    loadThemeFromFile(filepath) {
        try {
            const file = Gio.File.new_for_path(filepath);
            const [success, contents] = file.load_contents(null);
            
            if (success) {
                const themeData = JSON.parse(new TextDecoder().decode(contents));
                const themeId = `custom-${Date.now()}`;
                this.themes.set(themeId, themeData);
                return themeId;
            }
        } catch (error) {
            console.error('Error loading theme file:', error);
        }
        return null;
    }

    saveThemeToFile(theme, filepath) {
        try {
            const file = Gio.File.new_for_path(filepath);
            const themeJson = JSON.stringify(theme, null, 2);
            file.replace_contents(themeJson, null, false, Gio.FileCreateFlags.NONE, null);
            return true;
        } catch (error) {
            console.error('Error saving theme file:', error);
            return false;
        }
    }
}