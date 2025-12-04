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
            .map(item => {
                const rating = parseFloat(item.rating);
                const netIncome = item.financial.netIncome / 100000000; // Convert to 억

                // Green for rating >= 3.5 AND netIncome > 0, blue otherwise
                const isGoodCompany = rating >= 3.5 && item.financial.netIncome > 0;

                return {
                    x: rating,
                    y: netIncome,
                    label: item.name,
                    companyId: item.element.querySelector('.drawer-item-companyname')?.onclick ?
                        item.element.querySelector('.drawer-item-companyname').onclick.toString().match(/company\/(\d+)/)?.[1] : null,
                    salesAmount: item.financial.salesAmount || 0,
                    backgroundColor: isGoodCompany ? 'rgba(76, 175, 80, 0.6)' : 'rgba(54, 162, 235, 0.6)', // Green or Blue
                    borderColor: isGoodCompany ? 'rgba(76, 175, 80, 1)' : 'rgba(54, 162, 235, 1)'
                };
            });

        if (data.length === 0) {
            console.warn('[ChartManager] No data available for chart');
            return;
        }

        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error('[ChartManager] Canvas not found:', canvasId);
            return;
        }

        // If chart exists, just update the data
        if (this.chartInstance) {
            this.chartInstance.data.datasets[0].data = data;
            this.chartInstance.update('none'); // 'none' mode = no animation
            return;
        }

        const ctx = canvas.getContext('2d');

        // Create scatter plot (first time only)
        this.chartInstance = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: '회사',
                    data: data,
                    backgroundColor: (context) => {
                        return context.raw?.backgroundColor || 'rgba(54, 162, 235, 0.6)';
                    },
                    borderColor: (context) => {
                        return context.raw?.borderColor || 'rgba(54, 162, 235, 1)';
                    },
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
                        text: '블라인드 평점, 순이익',
                        font: {
                            size: 14
                        }
                    },
                    zoom: {
                        zoom: {
                            wheel: {
                                enabled: true,
                                speed: 0.1
                            },
                            pinch: {
                                enabled: true
                            },
                            mode: 'xy'
                        },
                        pan: {
                            enabled: true,
                            mode: 'xy'
                        },
                        limits: {
                            x: { min: 0, max: 5 },
                            y: { min: 'original', max: 'original' }
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
                                size: 12
                            }
                        },
                        min: 0,
                        max: 5.5,
                        ticks: {
                            stepSize: 0.5,
                            callback: function (value) {
                                // Hide 5.5 label
                                if (value === 5.5) return '';
                                return value.toFixed(1);
                            }
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: '순이익',
                            font: {
                                size: 12
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
        });
    },

    destroy: function () {
        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }
    }
};
