/**
 * HTML5 Canvas Charts using WebView
 * Note: This requires WebKitGTK and may not be available in all environments
 */

export class WebCharts {
    
    /**
     * Create a Chart.js based chart in a WebView
     */
    static createChartJSChart(container, data, options = {}) {
        const {
            type = 'pie',
            title = 'Chart',
            width = 400,
            height = 300
        } = options;
        
        try {
            const WebKit = imports.gi.WebKit;
            
            // Clear container
            let child = container.get_first_child();
            while (child) {
                const next = child.get_next_sibling();
                container.remove(child);
                child = next;
            }
            
            // Create WebView
            const webView = WebKit.WebView.new();
            webView.set_size_request(width, height);
            
            // Generate Chart.js HTML
            const chartHTML = this._generateChartHTML(data, { type, title });
            webView.load_html(chartHTML, null);
            
            container.append(webView);
            
        } catch (error) {
            console.warn('WebKit not available, falling back to text chart');
            this._fallbackToTextChart(container, data, options);
        }
    }
    
    /**
     * Generate HTML content for Chart.js
     */
    static _generateChartHTML(data, options) {
        const { type, title } = options;
        
        const chartData = {
            labels: data.map(item => item.name),
            datasets: [{
                label: title,
                data: data.map(item => item.value),
                backgroundColor: [
                    'rgba(53, 132, 228, 0.8)',
                    'rgba(38, 162, 105, 0.8)', 
                    'rgba(230, 97, 0, 0.8)',
                    'rgba(192, 97, 203, 0.8)',
                    'rgba(246, 211, 45, 0.8)',
                    'rgba(97, 53, 131, 0.8)'
                ],
                borderColor: [
                    'rgba(53, 132, 228, 1)',
                    'rgba(38, 162, 105, 1)',
                    'rgba(230, 97, 0, 1)', 
                    'rgba(192, 97, 203, 1)',
                    'rgba(246, 211, 45, 1)',
                    'rgba(97, 53, 131, 1)'
                ],
                borderWidth: 1
            }]
        };
        
        return `
<!DOCTYPE html>
<html>
<head>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { margin: 0; padding: 20px; font-family: system-ui; }
        canvas { max-width: 100%; height: auto; }
    </style>
</head>
<body>
    <canvas id="chart"></canvas>
    <script>
        const ctx = document.getElementById('chart').getContext('2d');
        new Chart(ctx, {
            type: '${type}',
            data: ${JSON.stringify(chartData)},
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                    },
                    title: {
                        display: true,
                        text: '${title}'
                    }
                }
            }
        });
    </script>
</body>
</html>`;
    }
    
    /**
     * Fallback to text chart if WebKit is not available
     */
    static _fallbackToTextChart(container, data, options) {
        // Import and use text charts as fallback
        import('./textCharts.js').then(module => {
            const TextCharts = module.TextCharts;
            if (options.type === 'pie') {
                TextCharts.createPieChart(container, data, options);
            } else {
                TextCharts.createBarChart(container, data, options);
            }
        });
    }
}