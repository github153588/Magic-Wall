// App State
let currentLevel = 'states'; // states, counties
let currentPath = { state: null };
let activeColor = '#6366f1';
let currentYear = '2024';
let viewMode = 'all'; // 'all' or 'data'
const filledColors = new Map(); // Key: geo id, Value: color info object

const breadcrumbs = document.getElementById('breadcrumbs');
const bcCounty = document.getElementById('bc-county');
const viewLabel = document.getElementById('current-view-label');
const itemCount = document.getElementById('item-count');
const colorPalette = document.getElementById('color-palette');
const year2020Btn = document.getElementById('year-2020');
const year2024Btn = document.getElementById('year-2024');
const viewAllBtn = document.getElementById('view-all');
const viewDataBtn = document.getElementById('view-data');
const viewToggleEl = document.getElementById('view-toggle');
const tooltip = document.getElementById('tooltip');
const mapContainer = document.getElementById('map-container');
const resultsOverlay = document.getElementById('results-overlay');
const resultsList = document.getElementById('results-list');
const calculateBtn = document.getElementById('calculate-btn');
const resetBtn = document.getElementById('reset-btn');
const closeResultsBtn = document.getElementById('close-results');
const demCountEl = document.getElementById('dem-count');
const repCountEl = document.getElementById('rep-count');
const svg = d3.select("#magic-wall-svg");

let width = mapContainer.clientWidth;
let height = mapContainer.clientHeight;
const g = svg.append("g");

// Zoom behavior
const zoom = d3.zoom()
    .scaleExtent([1, 12])
    .on("zoom", (event) => {
        g.attr("transform", event.transform);
    });

svg.call(zoom);

svg.on("dblclick.zoom", null);

const showTooltip = (event, text, additionalInfo = '') => {
    tooltip.innerHTML = `<strong>${text}</strong>${additionalInfo ? `<br><span style="color: var(--accent)">${additionalInfo}</span>` : ''}`;
    tooltip.classList.remove('hidden');
    tooltip.style.left = (event.pageX + 10) + 'px';
    tooltip.style.top = (event.pageY - 30) + 'px';
};
const hideTooltip = () => tooltip.classList.add('hidden');

function getShadedColor(baseColor, percentage) {
    if (!percentage) return baseColor;
    // Scale percentages: 50% maps to ~0.3 (lightest shading) up to 85%+ mapping to 1 (full saturation)
    const scale = d3.scaleLinear().domain([45, 85]).range([0.2, 1]).clamp(true);
    const t = scale(percentage);
    if (baseColor === '#ef4444') {
        return d3.interpolateReds(t);
    } else if (baseColor === '#3b82f6') {
        return d3.interpolateBlues(t);
    }
    return baseColor;
}

let usData = null;

// Initialize
async function init() {
    try {
        // Load US Atlas data (States and Counties)
        usData = await d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json");
        
        // Handle preloaded state vs localStorage
        let hasData = false;
        if (typeof preloadData !== 'undefined' && preloadData.length > 0) {
            // First time load or explicit data drop
            localStorage.setItem('magicWallColors', JSON.stringify(preloadData));
            hasData = true;
        }
        
        loadState();
        renderStates();
        setupEventListeners();
        window.addEventListener('resize', handleResize);
        
    } catch (error) {
        console.error("Error loading map data:", error);
        viewLabel.innerText = "Error loading map data. Please check connection.";
    }
}

function handleResize() {
    width = mapContainer.clientWidth;
    height = mapContainer.clientHeight;
    renderStates();
}

function setupEventListeners() {
    breadcrumbs.addEventListener('click', (e) => {
        const item = e.target.closest('.breadcrumb-item');
        if (!item) return;
        if (item.dataset.level === 'states') navigateToStates();
    });

    if (year2020Btn && year2024Btn) {
        year2020Btn.addEventListener('click', () => {
            currentYear = '2020';
            year2020Btn.style.background = 'var(--accent)';
            year2020Btn.style.color = 'white';
            year2024Btn.style.background = 'transparent';
            year2024Btn.style.color = 'var(--text-secondary)';
            updateViewForYear();
        });
        
        year2024Btn.addEventListener('click', () => {
            currentYear = '2024';
            year2024Btn.style.background = 'var(--accent)';
            year2024Btn.style.color = 'white';
            year2020Btn.style.background = 'transparent';
            year2020Btn.style.color = 'var(--text-secondary)';
            updateViewForYear();
        });
    }

    if (viewAllBtn && viewDataBtn) {
        viewAllBtn.addEventListener('click', () => {
            viewMode = 'all';
            viewAllBtn.style.background = 'var(--accent)';
            viewAllBtn.style.color = 'white';
            viewAllBtn.style.boxShadow = '0 2px 8px rgba(99, 102, 241, 0.4)';
            viewDataBtn.style.background = 'transparent';
            viewDataBtn.style.color = 'var(--text-secondary)';
            viewDataBtn.style.boxShadow = 'none';
            if (currentLevel === 'states') renderStates();
        });
        viewDataBtn.addEventListener('click', () => {
            viewMode = 'data';
            viewDataBtn.style.background = 'var(--accent)';
            viewDataBtn.style.color = 'white';
            viewDataBtn.style.boxShadow = '0 2px 8px rgba(99, 102, 241, 0.4)';
            viewAllBtn.style.background = 'transparent';
            viewAllBtn.style.color = 'var(--text-secondary)';
            viewAllBtn.style.boxShadow = 'none';
            if (currentLevel === 'states') renderStates();
        });
    }
}

function renderStates() {
    currentLevel = 'states';
    currentPath.state = null;
    g.selectAll("*").remove();
    if (viewToggleEl) viewToggleEl.style.display = 'flex';

    const states = topojson.feature(usData, usData.objects.states).features;
    const allCountiesCount = topojson.feature(usData, usData.objects.counties).features;

    // Fit projection to container
    const projection = d3.geoAlbersUsa().scale(width * 1.1).translate([width / 2, height / 2]);
    const path = d3.geoPath().projection(projection);

    viewLabel.innerText = "Click on a state to color counties • State color shows county majority";
    itemCount.innerText = "50 States";

    const stateGroups = g.selectAll(".state-group")
        .data(viewMode === 'data'
            ? states.filter(d => getStateStats(d.id, allCountiesCount).totalColored > 0)
            : states
        )
        .enter()
        .append("g")
        .attr("class", "state-group");

    stateGroups.append("path")
        .attr("class", "state-path fade-in")
        .attr("d", path)
        .style("fill", d => {
            const stats = getStateStats(d.id, allCountiesCount);
            if (stats.totalColored === 0) return 'rgba(30, 42, 75, 0.6)';
            return stats.majorityColor;
        })
        .style("fill-opacity", d => {
            const stats = getStateStats(d.id, allCountiesCount);
            return stats.totalColored === 0 ? 1 : 0.88;
        })
        .style("stroke", d => {
            const stats = getStateStats(d.id, allCountiesCount);
            if (stats.totalColored === 0) return 'rgba(80, 110, 180, 0.5)';
            return stats.majorityColor === '#ef4444' ? 'rgba(255,120,120,0.6)' : 'rgba(100,160,255,0.6)';
        })
        .style("stroke-width", d => {
            const stats = getStateStats(d.id, allCountiesCount);
            return stats.totalColored === 0 ? 0.4 : 0.6;
        })
        .on("mouseover", (event, d) => {
            const stats = getStateStats(d.id, allCountiesCount);
            const info = stats.totalColored > 0 ? `Lead: ${Math.round(stats.percentage)}%` : '';
            showTooltip(event, d.properties.name, info);
        })
        .on("mouseout", hideTooltip)
        .on("click", (event, d) => {
            if (event.defaultPrevented) return;
            navigateToCounties(d);
        });

    // Add labels for percentage
    stateGroups.each(function (d) {
        const stats = getStateStats(d.id, allCountiesCount);
        if (stats.totalColored > 0) {
            const centroid = path.centroid(d);
            if (!isNaN(centroid[0])) {
                const group = d3.select(this);

                group.append("text")
                    .attr("class", "state-label state-percent")
                    .attr("x", centroid[0])
                    .attr("y", centroid[1] + 5)
                    .text(`${Math.round(stats.percentage)}%`);

                group.append("text")
                    .attr("class", "state-label state-name")
                    .attr("x", centroid[0])
                    .attr("y", centroid[1] - 12)
                    .text(d.properties.name);
            }
        }
    });

    bcCounty.classList.add('hidden');
    document.querySelector('[data-level="states"]').classList.add('active');

    // Reset zoom state to identity
    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
}

function getStateStats(stateId, allCounties) {
    const stateCounties = allCounties.filter(c => c.id.slice(0, 2) === stateId);
    let red = 0;
    let blue = 0;

    stateCounties.forEach(c => {
        const data = filledColors.get(`county-${c.id}`);
        if (data) {
            let color;
            if (typeof data === 'object') {
                color = currentYear === '2020' && data.color2020 ? data.color2020 : data.color;
            } else {
                color = data;
            }
            if (color === '#ef4444') red++;
            if (color === '#3b82f6') blue++;
        }
    });

    const totalColored = red + blue;
    if (totalColored === 0) return { totalColored: 0 };

    const majorityColor = red >= blue ? '#ef4444' : '#3b82f6';
    const majorityCount = Math.max(red, blue);
    const percentage = (majorityCount / stateCounties.length) * 100;

    return {
        totalColored,
        majorityColor,
        percentage,
        isTie: red === blue
    };
}

function renderCounties(stateFeature) {
    currentLevel = 'counties';
    currentPath.state = stateFeature;
    g.selectAll("*").remove();
    if (viewToggleEl) viewToggleEl.style.display = 'none';

    const stateId = stateFeature.id;
    const allCounties = topojson.feature(usData, usData.objects.counties).features;
    const stateCounties = allCounties.filter(d => d.id.slice(0, 2) === stateId);

    // Use the same projection as states for consistency during zoom
    const projection = d3.geoAlbersUsa().scale(width * 1.1).translate([width / 2, height / 2]);
    const path = d3.geoPath().projection(projection);

    viewLabel.innerText = `${stateFeature.properties.name} • Click to fill • Drag to pan • Scroll to zoom`;
    itemCount.innerText = `${stateCounties.length} Counties`;

    g.selectAll(".county-path")
        .data(stateCounties)
        .enter()
        .append("path")
        .attr("class", "county-path fade-in")
        .attr("d", path)
        .style("fill", d => {
            const data = filledColors.get(`county-${d.id}`);
            if (!data) return null;
            if (typeof data === 'object') {
                const baseColor = currentYear === '2020' && data.color2020 ? data.color2020 : data.color;
                const pct = currentYear === '2020' && data.percentage2020 ? data.percentage2020 : data.percentage;
                return getShadedColor(baseColor, pct);
            }
            return data;
        })
        .on("mouseover", (event, d) => {
            const data = filledColors.get(`county-${d.id}`);
            let info = '';
            if (data) {
                if (currentYear === '2020' && data.percentage2020) {
                    info = `2020: ${data.percentage2020}%`;
                } else if (currentYear === '2024' && data.percentage) {
                    info = `2024: ${data.percentage}%`;
                } else if (data.percentage) {
                    info = `${data.percentage}%`;
                }
                
                // Show both if available on hover
                if (data.percentage && data.percentage2020) {
                    info = `2024: ${data.percentage}%<br>2020: ${data.percentage2020}%`;
                }
            }
            showTooltip(event, d.properties.name, info);
        })
        .on("mouseout", hideTooltip)
        .on("click", (event, d) => {
            // read-only: no manual fill
        });

    zoomToFeature(stateFeature);
}

function fillShape(selection, id) {
    // Manual fill disabled — data is set via preloadData only
}

function saveState() {
    const data = JSON.stringify(Array.from(filledColors.entries()));
    localStorage.setItem('magicWallColors', data);
    updateLiveCounter();
}

function loadState() {
    const data = localStorage.getItem('magicWallColors');
    if (data) {
        const entries = JSON.parse(data);
        entries.forEach(([id, value]) => filledColors.set(id, value));
    }
    updateLiveCounter();
}

function updateLiveCounter() {
    let repCount = 0;
    let demCount = 0;
    
    filledColors.forEach((data, id) => {
        if (!id.startsWith('county-')) return;
        let color;
        if (typeof data === 'object') {
            color = currentYear === '2020' && data.color2020 ? data.color2020 : data.color;
        } else {
            color = data;
        }
        if (color === '#ef4444') repCount++;
        if (color === '#3b82f6') demCount++;
    });

    if (demCountEl) demCountEl.innerText = demCount;
    if (repCountEl) repCountEl.innerText = repCount;
    
    // Update progress bar
    const total = demCount + repCount;
    const demProgress = document.getElementById('dem-progress');
    const repProgress = document.getElementById('rep-progress');
    
    if (total === 0) {
        if (demProgress) demProgress.style.width = '50%';
        if (repProgress) repProgress.style.width = '50%';
    } else {
        const demPct = (demCount / total) * 100;
        const repPct = (repCount / total) * 100;
        if (demProgress) demProgress.style.width = `${demPct}%`;
        if (repProgress) repProgress.style.width = `${repPct}%`;
    }
}

function resetMap() {
    if (confirm("Are you sure you want to clear all colors?")) {
        filledColors.clear();
        localStorage.removeItem('magicWallColors');
        if (currentLevel === 'states') renderStates();
        else renderCounties(currentPath.state);
    }
}

function calculateResults() {
    const counts = {
        '#ef4444': 0, // Red
        '#3b82f6': 0  // Blue
    };

    // Count counties
    filledColors.forEach((data, id) => {
        let color;
        if (typeof data === 'object') {
            color = currentYear === '2020' && data.color2020 ? data.color2020 : data.color;
        } else {
            color = data;
        }
        
        if (id.startsWith('county-') && (color === '#ef4444' || color === '#3b82f6')) {
            counts[color]++;
        }
    });

    resultsList.innerHTML = '';

    // Republican Row
    const repRow = document.createElement('div');
    repRow.className = 'result-row';
    repRow.innerHTML = `
        <div style="display: flex; align-items: center; gap: 1rem;">
            <div class="result-color" style="background-color: #ef4444"></div>
            <span>Republican</span>
        </div>
        <span class="result-count" style="color: #ef4444">${counts['#ef4444']}</span>
    `;
    resultsList.appendChild(repRow);

    // Democrat Row
    const demRow = document.createElement('div');
    demRow.className = 'result-row';
    demRow.innerHTML = `
        <div style="display: flex; align-items: center; gap: 1rem;">
            <div class="result-color" style="background-color: #3b82f6"></div>
            <span>Democrat</span>
        </div>
        <span class="result-count" style="color: #3b82f6">${counts['#3b82f6']}</span>
    `;
    resultsList.appendChild(demRow);

    resultsOverlay.classList.remove('hidden');
}

function navigateToStates() {
    renderStates();
}

function navigateToCounties(d) {
    bcCounty.innerText = d.properties.name;
    bcCounty.classList.remove('hidden');
    bcCounty.dataset.level = 'counties';
    document.querySelector('[data-level="states"]').classList.remove('active');
    bcCounty.classList.add('active');
    renderCounties(d);
}

function updateViewForYear() {
    updateLiveCounter();
    if (currentLevel === 'states') {
        renderStates();
    } else if (currentPath.state) {
        renderCounties(currentPath.state);
    }
}

function zoomToFeature(feature) {
    const projection = d3.geoAlbersUsa().scale(width * 1.1).translate([width / 2, height / 2]);
    const path = d3.geoPath().projection(projection);
    const bounds = path.bounds(feature);
    const dx = bounds[1][0] - bounds[0][0];
    const dy = bounds[1][1] - bounds[0][1];
    const x = (bounds[0][0] + bounds[1][0]) / 2;
    const y = (bounds[0][1] + bounds[1][1]) / 2;
    const padding = 0.8;
    const scale = Math.max(1, Math.min(10, padding / Math.max(dx / width, dy / height)));
    const translate = [width / 2 - scale * x, height / 2 - scale * y];

    svg.transition()
        .duration(750)
        .call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
}

init();
