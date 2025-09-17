/**
 * CSS-based charts using GTK styling
 * Beautiful charts using only CSS and GTK widgets
 */

import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

export class CSSCharts {
    
    /**
     * Create a beautiful donut chart using CSS and GTK boxes
     */
    static createDonutChart(container, data, options = {}) {
        const {
            title = 'Donut Chart',
            size = 180,
            innerSize = 120,
            colors = ['#3584e4', '#26a269', '#e66100', '#c061cb', '#f6d32d', '#613583']
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
                label: 'No data to display',
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
        
        const chartContainer = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 24,
            halign: Gtk.Align.CENTER
        });
        
        // Create circular chart representation
        const circleContainer = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER
        });
        
        // Create concentric circles for each data item
        const total = data.reduce((sum, item) => sum + item.value, 0);
        let radius = size / 2;
        
        data.slice(0, 5).forEach((item, index) => {
            const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
            const color = colors[index % colors.length];
            
            const circleBox = new Gtk.Box({
                width_request: radius * 2,
                height_request: radius * 2,
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.CENTER,
                css_classes: ['chart-circle']
            });
            
            const provider = new Gtk.CssProvider();
            provider.load_from_string(`
                .chart-circle {
                    border: ${(radius - innerSize/2) / data.length}px solid ${color};
                    border-radius: 50%;
                    background: transparent;
                }
            `);
            circleBox.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            
            circleContainer.append(circleBox);
            radius -= 15;
        });
        
        chartContainer.append(circleContainer);
        
        // Legend
        const legendBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            valign: Gtk.Align.CENTER
        });
        
        data.forEach((item, index) => {
            const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
            const color = colors[index % colors.length];
            
            const legendItem = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 12
            });
            
            // Color indicator
            const colorBox = new Gtk.Box({
                width_request: 16,
                height_request: 16,
                css_classes: ['legend-box']
            });
            
            const provider = new Gtk.CssProvider();
            provider.load_from_string(`
                .legend-box {
                    background-color: ${color};
                    border-radius: 4px;
                    border: 1px solid rgba(0,0,0,0.1);
                }
            `);
            colorBox.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            
            // Text
            const textBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 2
            });
            
            const nameLabel = new Gtk.Label({
                label: item.name,
                halign: Gtk.Align.START,
                css_classes: ['body']
            });
            
            const valueLabel = new Gtk.Label({
                label: `${item.value} (${percentage}%)`,
                halign: Gtk.Align.START,
                css_classes: ['caption', 'dim-label']
            });
            
            textBox.append(nameLabel);
            textBox.append(valueLabel);
            
            legendItem.append(colorBox);
            legendItem.append(textBox);
            legendBox.append(legendItem);
        });
        
        chartContainer.append(legendBox);
        container.append(chartContainer);
    }
    
    /**
     * Create animated progress bar chart
     */
    static createAnimatedBarChart(container, data, options = {}) {
        const {
            title = 'Progress Chart',
            showValues = true,
            animationDelay = 100,
            colors = ['#3584e4', '#26a269', '#e66100', '#c061cb', '#f6d32d']
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
        
        // Title
        const titleLabel = new Gtk.Label({
            label: title,
            css_classes: ['heading'],
            margin_bottom: 16
        });
        container.append(titleLabel);
        
        // Sort data by value
        const sortedData = [...data].sort((a, b) => b.value - a.value).slice(0, 10);
        const maxValue = Math.max(...sortedData.map(d => d.value));
        
        // Create bars
        sortedData.forEach((item, index) => {
            const percentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
            const color = colors[index % colors.length];
            
            const itemContainer = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 6,
                margin_bottom: 12
            });
            
            // Header with name and value
            const headerBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 8
            });
            
            const nameLabel = new Gtk.Label({
                label: item.name,
                halign: Gtk.Align.START,
                hexpand: true,
                css_classes: ['body']
            });
            
            if (showValues) {
                const valueLabel = new Gtk.Label({
                    label: item.value.toString(),
                    halign: Gtk.Align.END,
                    css_classes: ['caption', 'numeric']
                });
                headerBox.append(nameLabel);
                headerBox.append(valueLabel);
            } else {
                headerBox.append(nameLabel);
            }
            
            // Progress container
            const progressContainer = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                height_request: 24,
                css_classes: ['progress-container']
            });
            
            // Animated progress bar
            const progressBar = new Gtk.Box({
                width_request: Math.max(4, percentage * 3), // Min 4px width
                height_request: 20,
                css_classes: ['animated-bar']
            });
            
            const provider = new Gtk.CssProvider();
            provider.load_from_string(`
                .progress-container {
                    background-color: rgba(0,0,0,0.1);
                    border-radius: 12px;
                    padding: 2px;
                }
                .animated-bar {
                    background: linear-gradient(90deg, ${color}, ${color}aa);
                    border-radius: 10px;
                    transition: all 0.3s ease;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .animated-bar:hover {
                    transform: scaleY(1.1);
                }
            `);
            progressContainer.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            progressBar.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            
            progressContainer.append(progressBar);
            
            itemContainer.append(headerBox);
            itemContainer.append(progressContainer);
            container.append(itemContainer);
        });
    }
    
    /**
     * Create activity heatmap using CSS
     */
    static createActivityHeatmap(container, data, options = {}) {
        const {
            title = 'Activity Heatmap',
            columns = 7, // Days per week
            cellSize = 12,
            spacing = 2
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
        
        const maxValue = Math.max(...data.map(d => d.value));
        const rows = Math.ceil(data.length / columns);
        
        // Create grid
        const gridBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: spacing,
            halign: Gtk.Align.CENTER
        });
        
        for (let row = 0; row < rows; row++) {
            const rowBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: spacing,
                homogeneous: true
            });
            
            for (let col = 0; col < columns; col++) {
                const dataIndex = row * columns + col;
                const cellData = data[dataIndex];
                
                const cell = new Gtk.Box({
                    width_request: cellSize,
                    height_request: cellSize,
                    css_classes: ['heatmap-cell']
                });
                
                if (cellData) {
                    const intensity = maxValue > 0 ? cellData.value / maxValue : 0;
                    const alpha = Math.max(0.1, intensity);
                    
                    const provider = new Gtk.CssProvider();
                    provider.load_from_string(`
                        .heatmap-cell {
                            background-color: rgba(53, 132, 228, ${alpha});
                            border-radius: 2px;
                            border: 1px solid rgba(0,0,0,0.1);
                        }
                    `);
                    cell.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
                    
                    if (cellData.date) {
                        cell.set_tooltip_text(`${cellData.date}: ${cellData.value}`);
                    }
                } else {
                    const provider = new Gtk.CssProvider();
                    provider.load_from_string(`
                        .heatmap-cell {
                            background-color: rgba(0,0,0,0.05);
                            border-radius: 2px;
                            border: 1px solid rgba(0,0,0,0.1);
                        }
                    `);
                    cell.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
                }
                
                rowBox.append(cell);
            }
            
            gridBox.append(rowBox);
        }
        
        container.append(gridBox);
        
        // Legend
        const legendBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            margin_top: 12,
            halign: Gtk.Align.CENTER
        });
        
        const lessLabel = new Gtk.Label({
            label: 'Less',
            css_classes: ['caption', 'dim-label']
        });
        
        // Intensity scale
        const scaleBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 2
        });
        
        for (let i = 0; i < 5; i++) {
            const intensity = (i + 1) / 5;
            const scaleCell = new Gtk.Box({
                width_request: 10,
                height_request: 10,
                css_classes: ['scale-cell']
            });
            
            const provider = new Gtk.CssProvider();
            provider.load_from_string(`
                .scale-cell {
                    background-color: rgba(53, 132, 228, ${intensity});
                    border-radius: 1px;
                    border: 1px solid rgba(0,0,0,0.1);
                }
            `);
            scaleCell.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            
            scaleBox.append(scaleCell);
        }
        
        const moreLabel = new Gtk.Label({
            label: 'More',
            css_classes: ['caption', 'dim-label']
        });
        
        legendBox.append(lessLabel);
        legendBox.append(scaleBox);
        legendBox.append(moreLabel);
        container.append(legendBox);
    }
}