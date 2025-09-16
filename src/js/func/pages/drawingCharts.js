/**
 * GTK4 Drawing Area based charts
 */

import Gtk from 'gi://Gtk';

export class DrawingCharts {
    
    /**
     * Create a pie chart using Cairo drawing
     */
    static createPieChart(container, data, options = {}) {
        const {
            title = 'Pie Chart',
            width = 300,
            height = 300,
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
        
        // Drawing area
        const drawingArea = new Gtk.DrawingArea({
            width_request: width,
            height_request: height
        });
        
        drawingArea.set_draw_func((area, cr, width, height) => {
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = Math.min(width, height) / 3;
            
            const total = data.reduce((sum, item) => sum + item.value, 0);
            let currentAngle = -Math.PI / 2; // Start at top
            
            data.forEach((item, index) => {
                if (item.value === 0) return;
                
                const sliceAngle = (item.value / total) * 2 * Math.PI;
                const color = colors[index % colors.length];
                
                // Parse color
                const colorMatch = color.match(/#([0-9a-fA-F]{6})/);
                if (colorMatch) {
                    const r = parseInt(colorMatch[1].substr(0, 2), 16) / 255;
                    const g = parseInt(colorMatch[1].substr(2, 2), 16) / 255;
                    const b = parseInt(colorMatch[1].substr(4, 2), 16) / 255;
                    
                    cr.setSourceRGB(r, g, b);
                }
                
                // Draw slice
                cr.moveTo(centerX, centerY);
                cr.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
                cr.closePath();
                cr.fill();
                
                // Draw border
                cr.setSourceRGB(1, 1, 1);
                cr.setLineWidth(2);
                cr.moveTo(centerX, centerY);
                cr.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
                cr.closePath();
                cr.stroke();
                
                currentAngle += sliceAngle;
            });
        });
        
        container.append(drawingArea);
        
        // Legend
        const legendBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
            margin_top: 12
        });
        
        const total = data.reduce((sum, item) => sum + item.value, 0);
        data.forEach((item, index) => {
            const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
            const color = colors[index % colors.length];
            
            const legendItem = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 8
            });
            
            // Color indicator
            const colorBox = new Gtk.Box({
                width_request: 12,
                height_request: 12
            });
            
            const provider = new Gtk.CssProvider();
            provider.load_from_string(`
                box {
                    background-color: ${color};
                    border-radius: 6px;
                }
            `);
            colorBox.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            
            // Label
            const label = new Gtk.Label({
                label: `${item.name}: ${percentage}%`,
                halign: Gtk.Align.START,
                css_classes: ['caption']
            });
            
            legendItem.append(colorBox);
            legendItem.append(label);
            legendBox.append(legendItem);
        });
        
        container.append(legendBox);
    }
    
    /**
     * Create a bar chart using Cairo drawing
     */
    static createBarChart(container, data, options = {}) {
        const {
            title = 'Bar Chart',
            width = 400,
            height = 300,
            color = '#3584e4'
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
        
        // Drawing area
        const drawingArea = new Gtk.DrawingArea({
            width_request: width,
            height_request: height
        });
        
        drawingArea.set_draw_func((area, cr, width, height) => {
            const margin = 40;
            const chartWidth = width - margin * 2;
            const chartHeight = height - margin * 2;
            
            const maxValue = Math.max(...data.map(d => d.value));
            const barWidth = chartWidth / data.length * 0.8;
            const barSpacing = chartWidth / data.length * 0.2;
            
            // Parse color
            const colorMatch = color.match(/#([0-9a-fA-F]{6})/);
            let r = 0.2, g = 0.5, b = 0.9;
            if (colorMatch) {
                r = parseInt(colorMatch[1].substr(0, 2), 16) / 255;
                g = parseInt(colorMatch[1].substr(2, 2), 16) / 255;
                b = parseInt(colorMatch[1].substr(4, 2), 16) / 255;
            }
            
            cr.setSourceRGB(r, g, b);
            
            data.forEach((item, index) => {
                const barHeight = maxValue > 0 ? (item.value / maxValue) * chartHeight : 0;
                const x = margin + index * (barWidth + barSpacing);
                const y = height - margin - barHeight;
                
                cr.rectangle(x, y, barWidth, barHeight);
                cr.fill();
            });
            
            // Draw axes
            cr.setSourceRGB(0.5, 0.5, 0.5);
            cr.setLineWidth(1);
            
            // Y axis
            cr.moveTo(margin, margin);
            cr.lineTo(margin, height - margin);
            cr.stroke();
            
            // X axis  
            cr.moveTo(margin, height - margin);
            cr.lineTo(width - margin, height - margin);
            cr.stroke();
        });
        
        container.append(drawingArea);
        
        // Labels
        const labelsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            homogeneous: true,
            margin_top: 8
        });
        
        data.forEach(item => {
            const label = new Gtk.Label({
                label: item.name,
                css_classes: ['caption'],
                ellipsize: 3 // PANGO_ELLIPSIZE_END
            });
            labelsBox.append(label);
        });
        
        container.append(labelsBox);
    }
    
    /**
     * Create a simple line chart for time series data
     */
    static createLineChart(container, data, options = {}) {
        const {
            title = 'Line Chart',
            width = 400,
            height = 200,
            color = '#26a269'
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
        
        // Drawing area
        const drawingArea = new Gtk.DrawingArea({
            width_request: width,
            height_request: height
        });
        
        drawingArea.set_draw_func((area, cr, width, height) => {
            const margin = 30;
            const chartWidth = width - margin * 2;
            const chartHeight = height - margin * 2;
            
            const maxValue = Math.max(...data.map(d => d.value));
            const xStep = chartWidth / (data.length - 1);
            
            // Parse color
            const colorMatch = color.match(/#([0-9a-fA-F]{6})/);
            let r = 0.15, g = 0.65, b = 0.4;
            if (colorMatch) {
                r = parseInt(colorMatch[1].substr(0, 2), 16) / 255;
                g = parseInt(colorMatch[1].substr(2, 2), 16) / 255;
                b = parseInt(colorMatch[1].substr(4, 2), 16) / 255;
            }
            
            // Draw line
            cr.setSourceRGB(r, g, b);
            cr.setLineWidth(2);
            
            data.forEach((item, index) => {
                const x = margin + index * xStep;
                const y = height - margin - (maxValue > 0 ? (item.value / maxValue) * chartHeight : 0);
                
                if (index === 0) {
                    cr.moveTo(x, y);
                } else {
                    cr.lineTo(x, y);
                }
                
                // Draw point
                cr.arc(x, y, 3, 0, 2 * Math.PI);
                cr.fill();
                cr.moveTo(x, y);
            });
            
            cr.stroke();
            
            // Draw axes
            cr.setSourceRGB(0.7, 0.7, 0.7);
            cr.setLineWidth(1);
            
            // Y axis
            cr.moveTo(margin, margin);
            cr.lineTo(margin, height - margin);
            cr.stroke();
            
            // X axis
            cr.moveTo(margin, height - margin);
            cr.lineTo(width - margin, height - margin);
            cr.stroke();
        });
        
        container.append(drawingArea);
    }
}