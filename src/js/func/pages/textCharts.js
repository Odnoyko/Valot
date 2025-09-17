/**
 * Simple text-based charts for statistics visualization
 */

import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

export class TextCharts {
    
    /**
     * Create a simple horizontal bar chart using GTK labels
     */
    static createBarChart(container, data, options = {}) {
        const {
            title = 'Chart',
            maxBars = 10,
            showValues = true,
            colorScheme = ['#3584e4', '#26a269', '#e66100', '#c061cb', '#f6d32d']
        } = options;
        
        // Clear container
        let child = container.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            container.remove(child);
            child = next;
        }
        
        if (!data || data.length === 0) {
            const emptyLabel = new Gtk.Label({
                label: 'No data available',
                css_classes: ['dim-label']
            });
            container.append(emptyLabel);
            return;
        }
        
        // Sort and limit data
        const sortedData = data.sort((a, b) => b.value - a.value).slice(0, maxBars);
        const maxValue = Math.max(...sortedData.map(d => d.value));
        
        // Title
        const titleLabel = new Gtk.Label({
            label: title,
            css_classes: ['heading'],
            margin_bottom: 12
        });
        container.append(titleLabel);
        
        // Create bars
        sortedData.forEach((item, index) => {
            const percentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
            const color = colorScheme[index % colorScheme.length];
            
            // Item container
            const itemBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 4,
                margin_bottom: 8
            });
            
            // Item label with name and value
            const labelText = showValues ? `${item.name} (${item.value})` : item.name;
            const itemLabel = new Gtk.Label({
                label: labelText,
                halign: Gtk.Align.START,
                css_classes: ['body']
            });
            
            // Progress bar to represent data
            const progressBar = new Gtk.ProgressBar({
                fraction: percentage / 100,
                height_request: 20,
                hexpand: true
            });
            
            // Apply custom color
            const provider = new Gtk.CssProvider();
            provider.load_from_string(`
                progressbar progress {
                    background-color: ${color};
                }
            `);
            progressBar.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            
            itemBox.append(itemLabel);
            itemBox.append(progressBar);
            container.append(itemBox);
        });
    }
    
    /**
     * Create a simple pie chart representation using colored circles and labels
     */
    static createPieChart(container, data, options = {}) {
        const {
            title = 'Distribution',
            showPercentages = true,
            colorScheme = ['#3584e4', '#26a269', '#e66100', '#c061cb', '#f6d32d', '#613583']
        } = options;
        
        // Clear container
        let child = container.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            container.remove(child);
            child = next;
        }
        
        if (!data || data.length === 0) {
            const emptyLabel = new Gtk.Label({
                label: 'No data available',
                css_classes: ['dim-label']
            });
            container.append(emptyLabel);
            return;
        }
        
        const total = data.reduce((sum, item) => sum + item.value, 0);
        
        // Title
        const titleLabel = new Gtk.Label({
            label: title,
            css_classes: ['heading'],
            margin_bottom: 12
        });
        container.append(titleLabel);
        
        // Legend
        data.forEach((item, index) => {
            const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
            const color = colorScheme[index % colorScheme.length];
            
            const legendItem = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 8,
                margin_bottom: 6
            });
            
            // Color indicator
            const colorBox = new Gtk.Box({
                width_request: 16,
                height_request: 16,
                css_classes: ['legend-color']
            });
            
            const provider = new Gtk.CssProvider();
            provider.load_from_string(`
                .legend-color {
                    background-color: ${color};
                    border-radius: 8px;
                }
            `);
            colorBox.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            
            // Label
            const labelText = showPercentages ? 
                `${item.name}: ${item.value} (${percentage}%)` : 
                `${item.name}: ${item.value}`;
            
            const label = new Gtk.Label({
                label: labelText,
                halign: Gtk.Align.START,
                css_classes: ['body']
            });
            
            legendItem.append(colorBox);
            legendItem.append(label);
            container.append(legendItem);
        });
    }
    
    /**
     * Create a time series line chart using text representation
     */
    static createTimelineChart(container, data, options = {}) {
        const {
            title = 'Timeline',
            height = 100,
            showDates = true
        } = options;
        
        // Clear container
        let child = container.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            container.remove(child);
            child = next;
        }
        
        if (!data || data.length === 0) {
            const emptyLabel = new Gtk.Label({
                label: 'No activity data',
                css_classes: ['dim-label']
            });
            container.append(emptyLabel);
            return;
        }
        
        // Title
        const titleLabel = new Gtk.Label({
            label: title,
            css_classes: ['heading'],
            margin_bottom: 12
        });
        container.append(titleLabel);
        
        // Simple activity indicators
        const activityBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 2,
            homogeneous: true
        });
        
        const maxValue = Math.max(...data.map(d => d.value));
        
        data.forEach((item, index) => {
            const intensity = maxValue > 0 ? item.value / maxValue : 0;
            const alpha = Math.max(0.1, intensity);
            
            const dayBox = new Gtk.Box({
                width_request: 12,
                height_request: 20,
                css_classes: ['activity-day'],
                tooltip_text: showDates ? `${item.date}: ${item.value}` : `${item.value}`
            });
            
            const provider = new Gtk.CssProvider();
            provider.load_from_string(`
                .activity-day {
                    background-color: rgba(53, 132, 228, ${alpha});
                    border-radius: 2px;
                    margin: 1px;
                }
            `);
            dayBox.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            
            activityBox.append(dayBox);
        });
        
        container.append(activityBox);
        
        // Add summary
        const total = data.reduce((sum, item) => sum + item.value, 0);
        const averagePerDay = data.length > 0 ? (total / data.length).toFixed(1) : 0;
        const summaryLabel = new Gtk.Label({
            label: `Total: ${total} across ${data.length} days (avg: ${averagePerDay}/day)`,
            css_classes: ['caption', 'dim-label'],
            margin_top: 8
        });
        container.append(summaryLabel);
    }
}