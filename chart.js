// --- Chart Visualization Module ---
const ChartManager = {
    chartInstance: null,
    chartJsLoaded: false,

    loadChartJs: function () {
        return new Promise((resolve, reject) => {
            if (window.Chart) {
                this.chartJsLoaded = true;
                resolve();
            } else {
                reject(new Error('Chart.js not loaded'));
            }
        });
    },

    createScatterPlot: function (items, canvasId) {
        // Prepare data: filter items with both rating and financial data
        const data = items
            .filter(item => {
                const hasRating = item.rating && item.rating !== '-';
                const hasFinancial = item.financial && item.financial.netIncome !== undefined;
                return hasRating && hasFinancial;
            })
            .map(item => ({
                x: parseFloat(item.rating),
                y: item.financial.netIncome / 100000000, // Convert to 억
                label: item.name,
                companyId: item.element.querySelector('.drawer-item-name')?.onclick ?
                    item.element.querySelector('.drawer-item-name').onclick.toString().match(/company\/(\d+)/)?.[1] : null,
                salesAmount: item.financial.salesAmount || 0
            }));

        if (data.length === 0) {
            console.warn('[ChartManager] No data available for chart');
            return;
        }

        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error('[ChartManager] Canvas not found:', canvasId);
            return;
        }

        const ctx = canvas.getContext('2d');

        // Destroy existing chart if any
        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        // Create scatter plot
        this.chartInstance = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: '회사',
                    data: data,
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1,
                    pointRadius: 6,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false, // Disable animations for real-time updates
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const point = context.raw;
                                return [
                                    `회사: ${point.label}`,
                                    `평점: ${point.x.toFixed(1)}`,
                                    `순익: ${point.y.toFixed(0)}억`
                                ];
                            }
                        }
                    },
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: '블라인드 평점 vs 순이익',
                        font: {
                            size: 16
                        }
                    }
                },
                layout: {
                    padding: {
                        bottom: 10
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        title: {
                            display: true,
                            text: '블라인드 평점',
                            font: {
                                size: 14
                            }
                        },
                        min: 0,
                        max: 5,
                        ticks: {
                            stepSize: 0.5
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: '순이익 (억)',
                            font: {
                                size: 14
                            }
                        },
                        ticks: {
                            callback: function (value) {
                                if (Math.abs(value) >= 10000) {
                                    return (value / 10000).toFixed(0) + '조';
                                }
                                return value.toFixed(0) + '억';
                            }
                        }
                    }
                },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const point = data[index];
                        if (point.companyId) {
                            window.open(`https://www.wanted.co.kr/company/${point.companyId}`, '_blank');
                        }
                    }
                }
            }
        });
    },

    destroy: function () {
        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }
    }
};
