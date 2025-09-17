/**
 * Legacy Charts - Based on the working v0.2.5 SimpleChart implementation
 * Proven, tested chart system that worked reliably
 */

import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

export class LegacyCharts {
    
    /**
     * Create a stacked bar chart like in v0.2.5
     * Shows daily activity with project color segments
     */
    static createStackedBarChart(container, data, projects = [], options = {}) {
        const {
            title = '📊 Weekly Activity',
            showSummary = true,
            barHeight = 80,
            barWidth = 24
        } = options;
        
        // Clear container
        let child = container.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            container.remove(child);
            child = next;
        }
        
        if (!data || data.length === 0) {
            const placeholderLabel = new Gtk.Label({
                label: '📊 No data yet\nStart tracking time to see your productivity chart',
                css_classes: ['dim-label'],
                justify: Gtk.Justification.CENTER,
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.CENTER
            });
            container.append(placeholderLabel);
            return;
        }
        
        // Create chart container
        const chartBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_top: 12,
            margin_bottom: 12
        });
        
        // Chart title
        const titleLabel = new Gtk.Label({
            label: title,
            css_classes: ['title-4'],
            halign: Gtk.Align.CENTER,
            margin_bottom: 8
        });
        chartBox.append(titleLabel);
        
        // Create bars container
        const barsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            halign: Gtk.Align.CENTER,
            height_request: barHeight + 40 // Extra space for labels
        });
        
        // Find max value for scaling
        const maxValue = Math.max(...data.map(d => d.value), 1);
        
        // Create bars for each data point
        data.forEach(item => {
            this._createLegacyBar(barsBox, item, maxValue, projects, { barHeight, barWidth });
        });
        
        chartBox.append(barsBox);
        
        if (showSummary) {
            // Total summary
            const totalValue = data.reduce((sum, d) => sum + d.value, 0);
            const summaryLabel = new Gtk.Label({
                label: `Total: ${this._formatValue(totalValue)}`,
                css_classes: ['caption'],
                halign: Gtk.Align.CENTER,
                margin_top: 8
            });
            chartBox.append(summaryLabel);
        }
        
        container.append(chartBox);
    }
    
    /**
     * Create individual bar (like in v0.2.5)
     */
    static _createLegacyBar(container, itemData, maxValue, projects, options) {
        const { barHeight, barWidth } = options;
        
        const barContainer = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
            width_request: barWidth + 16
        });
        
        // Bar container with fixed height
        const barBox = new Gtk.Box({
            width_request: barWidth,
            height_request: barHeight,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.END,
            css_classes: ['chart-bar-container']
        });
        
        // Calculate bar height
        const barHeightScaled = Math.max((itemData.value / maxValue) * barHeight, 2);
        
        // Create the bar
        let bar;
        
        if (itemData.projectSegments && itemData.projectSegments.length > 0) {
            // Stacked bar with project colors (like v0.2.5)
            bar = this._createStackedBar(itemData.projectSegments, projects, barWidth, barHeightScaled);
        } else {
            // Simple single-color bar
            bar = new Gtk.Box({
                width_request: barWidth,
                height_request: barHeightScaled,
                css_classes: ['simple-bar'],
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.END
            });
            
            // Apply default color
            const provider = new Gtk.CssProvider();
            provider.load_from_string(`
                .simple-bar {
                    background-color: #3584e4;
                    border-radius: 4px 4px 0 0;
                    border: 1px solid rgba(0,0,0,0.1);
                }
            `);
            bar.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        }
        
        barBox.append(bar);
        
        // Day label
        const dayLabel = new Gtk.Label({
            label: itemData.label || itemData.date || '',
            css_classes: ['caption'],
            halign: Gtk.Align.CENTER,
            max_width_chars: 3,
            ellipsize: 3 // PANGO_ELLIPSIZE_END
        });
        
        // Value label (time)
        const valueLabel = new Gtk.Label({
            label: this._formatValue(itemData.value),
            css_classes: ['caption', 'dim-label'],
            halign: Gtk.Align.CENTER
        });
        
        barContainer.append(barBox);
        barContainer.append(dayLabel);
        barContainer.append(valueLabel);
        
        container.append(barContainer);
    }
    
    /**
     * Create stacked bar with project colors (v0.2.5 style)
     */
    static _createStackedBar(segments, projects, width, height) {
        const stackedBar = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            width_request: width,
            height_request: height,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.END,
            css_classes: ['stacked-bar']
        });
        
        const totalValue = segments.reduce((sum, seg) => sum + seg.value, 0);
        
        // Create segments from bottom to top
        segments.forEach((segment, index) => {
            const segmentHeight = totalValue > 0 ? (segment.value / totalValue) * height : 0;
            
            if (segmentHeight > 1) { // Only show segments > 1px
                const segmentBox = new Gtk.Box({
                    width_request: width - 2,
                    height_request: Math.max(segmentHeight, 2),
                    css_classes: ['bar-segment']
                });
                
                // Find project color
                const project = projects.find(p => p.id === segment.projectId);
                const color = project?.color || this._getDefaultColors()[index % this._getDefaultColors().length];
                
                const provider = new Gtk.CssProvider();
                provider.load_from_string(`
                    .bar-segment {
                        background-color: ${color};
                        border: 1px solid rgba(0,0,0,0.1);
                    }
                    .bar-segment:first-child {
                        border-radius: 4px 4px 0 0;
                    }
                    .bar-segment:last-child {
                        border-radius: 0 0 4px 4px;
                    }
                `);
                segmentBox.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
                
                // Tooltip with project info
                if (project) {
                    segmentBox.set_tooltip_text(`${project.name}: ${this._formatValue(segment.value)}`);
                }
                
                stackedBar.append(segmentBox);
            }
        });
        
        return stackedBar;
    }
    
    /**
     * Create legend for projects (like v0.2.5)
     */
    static createProjectLegend(container, projects, data) {
        // Clear container
        let child = container.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            container.remove(child);
            child = next;
        }
        
        if (!projects || projects.length === 0) return;
        
        const legendBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_top: 12
        });
        
        const legendTitle = new Gtk.Label({
            label: 'Projects',
            css_classes: ['heading'],
            halign: Gtk.Align.START,
            margin_bottom: 4
        });
        legendBox.append(legendTitle);
        
        projects.slice(0, 8).forEach((project) => {
            // Calculate project total from data
            const projectTotal = data.reduce((sum, item) => {
                if (item.projectSegments) {
                    const segment = item.projectSegments.find(seg => seg.projectId === project.id);
                    return sum + (segment?.value || 0);
                }
                return sum;
            }, 0);
            
            if (projectTotal > 0) {
                const legendItem = new Gtk.Box({
                    orientation: Gtk.Orientation.HORIZONTAL,
                    spacing: 8,
                    margin_bottom: 4
                });
                
                // Color box
                const colorBox = new Gtk.Box({
                    width_request: 16,
                    height_request: 16,
                    css_classes: ['legend-color']
                });
                
                const provider = new Gtk.CssProvider();
                provider.load_from_string(`
                    .legend-color {
                        background-color: ${project.color || '#3584e4'};
                        border-radius: 3px;
                        border: 1px solid rgba(0,0,0,0.2);
                    }
                `);
                colorBox.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
                
                // Project name and time
                const textLabel = new Gtk.Label({
                    label: `${project.name}: ${this._formatValue(projectTotal)}`,
                    halign: Gtk.Align.START,
                    css_classes: ['body']
                });
                
                legendItem.append(colorBox);
                legendItem.append(textLabel);
                legendBox.append(legendItem);
            }
        });
        
        container.append(legendBox);
    }
    
    /**
     * Format time values (like v0.2.5)
     */
    static _formatValue(seconds) {
        if (seconds < 60) {
            return `${seconds}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            return `${minutes}m`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`;
        }
    }
    
    /**
     * Default color palette (v0.2.5 style)
     */
    static _getDefaultColors() {
        return [
            '#3584e4', // Blue
            '#26a269', // Green  
            '#e66100', // Orange
            '#c061cb', // Purple
            '#f6d32d', // Yellow
            '#613583', // Dark Purple
            '#1a5fb4', // Dark Blue
            '#2ec27e'  // Light Green
        ];
    }
}